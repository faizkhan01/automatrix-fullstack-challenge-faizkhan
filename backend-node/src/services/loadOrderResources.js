import { col, fn } from "sequelize";
import { Order, OrderItem, Product } from "../models/index.js";
import { orderResource } from "../serializers/orderResource.js";

/**
 * Serializes orders with two extra queries in total (items + products, lifetime counts),
 * however many orders there are.
 *
 * @param {import("sequelize").Model[]} orders with `customer` loaded
 */
export async function loadOrderResources(orders) {
  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const customerIds = [...new Set(orders.map((order) => order.customerId))];

  const [items, lifetimeCounts] = await Promise.all([
    OrderItem.findAll({
      where: { orderId: orderIds },
      include: [{ model: Product, as: "product" }],
      order: [["id", "ASC"]],
    }),
    Order.findAll({
      attributes: ["customerId", [fn("COUNT", col("id")), "count"]],
      where: { customerId: customerIds },
      group: ["customerId"],
      raw: true,
    }),
  ]);

  const itemsByOrder = new Map();
  for (const item of items) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId).push(item);
  }
  const lifetimeByCustomer = new Map(lifetimeCounts.map((row) => [row.customerId, Number(row.count)]));

  return orders.map((order) =>
    orderResource(order, {
      items: itemsByOrder.get(order.id) ?? [],
      lifetimeOrders: lifetimeByCustomer.get(order.customerId) ?? 0,
    }),
  );
}

export async function loadOrderResource(order) {
  const [resource] = await loadOrderResources([order]);
  return resource;
}
