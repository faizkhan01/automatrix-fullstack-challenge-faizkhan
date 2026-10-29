import { randomUUID } from "node:crypto";
import { DatabaseError } from "sequelize";
import { withTransaction } from "../db/transaction.js";
import { InsufficientStockError, ServiceUnavailableError, ValidationError } from "../http/errors.js";
import { Order, OrderEvent, OrderItem, Product } from "../models/index.js";

const ORDER_FAILED_MESSAGE = "We couldn't place your order right now. Nothing was ordered and no stock was reserved. Please try again in a moment.";

/**
 * Places an order all-or-nothing: the order, its items, the stock decrements and the
 * warehouse event commit together or not at all. Transient deadlocks are retried.
 *
 * @param {import("sequelize").Model} customer
 * @param {{ product_id: number, quantity: number }[]} lines
 * @returns {Promise<import("sequelize").Model>} the committed order
 */
export async function placeOrder(customer, lines) {
  try {
    return await withTransaction((transaction) => placeOrderInTransaction(customer, lines, transaction));
  } catch (err) {
    if (err instanceof DatabaseError) throw new ServiceUnavailableError(ORDER_FAILED_MESSAGE, { cause: err });
    throw err;
  }
}

async function placeOrderInTransaction(customer, lines, transaction) {
  // Lock the product rows (in id order, so concurrent orders can't deadlock each other) and
  // hold them until commit, so stock can't change between the check and the decrement.
  const products = await Product.findAll({
    where: { id: lines.map((line) => line.product_id) },
    order: [["id", "ASC"]],
    lock: transaction.LOCK.UPDATE,
    transaction,
  });
  const productsById = new Map(products.map((product) => [product.id, product]));

  let total = 0;
  for (const line of lines) {
    const product = productsById.get(line.product_id);
    // Validated by the route, but the product may have been deleted since.
    if (!product) throw new ValidationError({ items: ["One or more selected products are invalid."] });
    if (product.stock < line.quantity) throw new InsufficientStockError(product, line.quantity);

    total += product.priceCents * line.quantity;
  }

  // The reference is derived from the auto-increment id, so concurrent orders can't collide on it.
  const order = await Order.create(
    { reference: `TMP-${randomUUID()}`, customerId: customer.id, status: "pending", totalCents: total, placedAt: new Date() },
    { transaction },
  );
  await order.update({ reference: `ORD-${String(order.id).padStart(6, "0")}` }, { transaction });

  await OrderItem.bulkCreate(
    lines.map((line) => ({
      orderId: order.id,
      productId: line.product_id,
      quantity: line.quantity,
      unitPriceCents: productsById.get(line.product_id).priceCents,
    })),
    { transaction },
  );

  for (const line of lines) {
    await productsById.get(line.product_id).decrement("stock", { by: line.quantity, transaction });
  }

  // The warehouse sync job tails this table, so every placed order must have one.
  await OrderEvent.create(
    { orderId: order.id, type: "order.placed", payload: { total_cents: total, lines: lines.length } },
    { transaction },
  );

  return order;
}
