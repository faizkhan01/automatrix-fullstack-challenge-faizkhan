import { randomUUID } from "node:crypto";
import { DatabaseError, UniqueConstraintError } from "sequelize";
import { withTransaction } from "../db/transaction.js";
import { InsufficientStockError, ServiceUnavailableError, ValidationError } from "../http/errors.js";
import { Customer, Order, OrderEvent, OrderItem, Product } from "../models/index.js";

const ORDER_FAILED_MESSAGE = "We couldn't place your order right now. Nothing was ordered and no stock was reserved. Please try again in a moment.";

/**
 * Places an order all-or-nothing: the order, its items, the stock decrements and the
 * warehouse event commit together or not at all. Transient deadlocks are retried.
 *
 * With an idempotency key, repeating the request (e.g. after a lost response) returns the
 * order that was already placed instead of placing a second one.
 *
 * @param {import("sequelize").Model} customer
 * @param {{ product_id: number, quantity: number }[]} lines
 * @param {{ idempotencyKey?: string }} [options]
 * @returns {Promise<{ order: import("sequelize").Model, replayed: boolean }>}
 */
export async function placeOrder(customer, lines, { idempotencyKey } = {}) {
  try {
    return await withTransaction(async (transaction) => {
      if (idempotencyKey) {
        // Serializes keyed requests per customer, so a duplicate waits here and then sees the
        // committed original, rather than racing it for stock and failing with a 422.
        await Customer.findByPk(customer.id, { lock: transaction.LOCK.UPDATE, transaction });
        const existing = await Order.findOne({
          where: { customerId: customer.id, idempotencyKey },
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (existing) return { order: existing, replayed: true };
      }

      return { order: await createOrder(customer, lines, idempotencyKey, transaction), replayed: false };
    });
  } catch (err) {
    // The unique index is the last line of defence if a duplicate slips past the lock.
    if (err instanceof UniqueConstraintError && idempotencyKey) {
      const original = await Order.findOne({ where: { customerId: customer.id, idempotencyKey } });
      if (original) return { order: original, replayed: true };
    }
    if (err instanceof DatabaseError) throw new ServiceUnavailableError(ORDER_FAILED_MESSAGE, { cause: err });
    throw err;
  }
}

async function createOrder(customer, lines, idempotencyKey, transaction) {
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
    {
      reference: `TMP-${randomUUID()}`,
      customerId: customer.id,
      status: "pending",
      totalCents: total,
      placedAt: new Date(),
      idempotencyKey: idempotencyKey ?? null,
    },
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
