import { Router } from "express";
import { isPositiveInt, positiveIntOr, validator } from "../http/validate.js";
import { Customer, Order, ORDER_STATUSES, Product } from "../models/index.js";
import { listOrders } from "../services/listOrders.js";
import { loadOrderResource } from "../services/loadOrderResources.js";
import { placeOrder } from "../services/placeOrder.js";
import { paginated } from "./paginate.js";

export const ordersRouter = Router();

const DEFAULT_PER_PAGE = 15;
const MAX_PER_PAGE = 100;

const findOrderWithCustomer = (id) => Order.findByPk(id, { include: [{ model: Customer, as: "customer" }] });

ordersRouter.get("/", async (req, res) => {
  const { status = "" } = req.query;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : req.query.search;
  const page = positiveIntOr(req.query.page, 1);
  // Clamped rather than rejected, so an oversized page can't turn into an unbounded query.
  const perPage = Math.min(positiveIntOr(req.query.per_page, DEFAULT_PER_PAGE), MAX_PER_PAGE);

  // Query values can be arrays (?status=a&status=b), so check types before using them.
  const v = validator();
  v.check("status", status === "" || ORDER_STATUSES.includes(status), "The selected status is invalid.");
  if (v.check("search", search === undefined || typeof search === "string", "The search field must be a string.")) {
    v.check("search", !search || search.length <= 100, "The search field must not be greater than 100 characters.");
  }
  v.passOrThrow();

  const { data, total } = await listOrders({ status, search, page, perPage });

  res.json(paginated(req, data, { page, perPage, total }));
});

ordersRouter.get("/:id", async (req, res) => {
  const id = positiveIntOr(req.params.id, null);
  const order = id && (await findOrderWithCustomer(id));
  if (!order) return res.status(404).json({ message: "Order not found." });

  res.json({ data: await loadOrderResource(order) });
});

ordersRouter.post("/", async (req, res) => {
  const { customer_id: customerId, items } = req.body ?? {};

  const v = validator();
  v.check("customer_id", isPositiveInt(customerId), "The customer id field is required.");
  if (v.check("items", Array.isArray(items) && items.length > 0, "The items field is required.")) {
    const seen = new Set();
    items.forEach((item, i) => {
      v.check(`items.${i}.product_id`, isPositiveInt(item?.product_id), `The items.${i}.product_id field is required.`);
      v.check(`items.${i}.product_id`, !seen.has(item?.product_id), `The items.${i}.product_id field has a duplicate value.`);
      v.check(
        `items.${i}.quantity`,
        isPositiveInt(item?.quantity) && item.quantity <= 100,
        `The items.${i}.quantity field must be between 1 and 100.`,
      );
      seen.add(item?.product_id);
    });
  }
  v.passOrThrow();

  const customer = await Customer.findByPk(customerId);
  v.check("customer_id", customer !== null, "The selected customer id is invalid.");
  const productIds = items.map((item) => item.product_id);
  const found = await Product.count({ where: { id: productIds } });
  v.check("items", found === productIds.length, "One or more selected products are invalid.");
  v.passOrThrow();

  const order = await placeOrder(customer, items);

  res.status(201).json({ data: await loadOrderResource(await findOrderWithCustomer(order.id)) });
});
