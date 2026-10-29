import { Op } from "sequelize";
import { likeContains } from "../db/like.js";
import { Customer, Order } from "../models/index.js";
import { loadOrderResources } from "./loadOrderResources.js";

/**
 * One page of orders, newest first. Runs a fixed 4 queries whatever the page size.
 *
 * @param {{ status?: string, search?: string, page: number, perPage: number }} query
 */
export async function listOrders({ status, search, page, perPage }) {
  // Every filter is ANDed: search must narrow the status filter, never replace it.
  const conditions = [];
  if (status) conditions.push({ status });
  if (search) {
    const pattern = likeContains(search);
    conditions.push({ [Op.or]: [{ reference: { [Op.like]: pattern } }, { "$customer.name$": { [Op.like]: pattern } }] });
  }

  const { rows, count } = await Order.findAndCountAll({
    where: { [Op.and]: conditions },
    include: [{ model: Customer, as: "customer", required: true }],
    // id breaks ties between orders placed in the same second, so pages never overlap or skip rows.
    order: [
      ["placedAt", "DESC"],
      ["id", "DESC"],
    ],
    limit: perPage,
    offset: (page - 1) * perPage,
  });

  return { data: await loadOrderResources(rows), total: count };
}
