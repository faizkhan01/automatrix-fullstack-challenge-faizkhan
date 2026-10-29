/**
 * Pure serializers: they never query the database. Relations are batch-loaded by
 * services/loadOrderResources.js so the number of queries doesn't grow with the page size.
 *
 * @param {import("sequelize").Model} order with `customer` loaded
 * @param {{ items: import("sequelize").Model[], lifetimeOrders: number }} related items with `product` loaded
 */
export function orderResource(order, { items, lifetimeOrders }) {
  const { customer } = order;

  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    total_cents: order.totalCents,
    placed_at: order.placedAt?.toISOString() ?? null,
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      lifetime_orders: lifetimeOrders,
    },
    items: items.map(orderItemResource),
  };
}

export function orderItemResource(item) {
  return {
    id: item.id,
    sku: item.product.sku,
    name: item.product.name,
    quantity: item.quantity,
    unit_price_cents: item.unitPriceCents,
  };
}
