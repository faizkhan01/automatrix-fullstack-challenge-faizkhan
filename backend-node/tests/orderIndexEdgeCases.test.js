import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { countQueries, createCustomer, createOrder, createOrderItem } from "./helpers.js";

const app = createApp();

describe("GET /api/orders edge cases", () => {
  it("keeps the status filter when search matches by reference", async () => {
    const paid = await createOrder({ reference: "ORD-AAA-1", status: "paid" });
    await createOrder({ reference: "ORD-AAA-2", status: "cancelled" });

    const res = await request(app).get("/api/orders?status=paid&search=AAA").expect(200);

    expect(res.body.data.map((o) => o.id)).toEqual([paid.id]);
    expect(res.body.data.every((o) => o.status === "paid")).toBe(true);
  });

  it("treats LIKE wildcards in the search as literal characters", async () => {
    await createOrder({ reference: "ORD-100" });
    const literal = await createOrder({ reference: "ORD-50%-OFF" });

    expect((await request(app).get("/api/orders?search=%25").expect(200)).body.data.map((o) => o.id)).toEqual([
      literal.id,
    ]);
    expect((await request(app).get("/api/orders?search=_").expect(200)).body.data).toEqual([]);
  });

  it("matches the customer name case-insensitively and ignores surrounding whitespace", async () => {
    const alice = await createCustomer({ name: "Alice Moreno" });
    const order = await createOrder({ customerId: alice.id });
    await createOrder();

    const res = await request(app).get("/api/orders?search=%20moreno%20").expect(200);

    expect(res.body.data.map((o) => o.id)).toEqual([order.id]);
  });

  it("clamps per_page and falls back to defaults for invalid paging values", async () => {
    await createOrder();

    expect((await request(app).get("/api/orders?per_page=100000").expect(200)).body.meta.per_page).toBe(100);
    expect((await request(app).get("/api/orders?per_page=-5").expect(200)).body.meta.per_page).toBe(15);
    expect((await request(app).get("/api/orders?per_page=abc&page=1.5").expect(200)).body.meta).toMatchObject({
      per_page: 15,
      current_page: 1,
    });
  });

  it("rejects array-valued filters with 422", async () => {
    await request(app).get("/api/orders?status=paid&status=shipped").expect(422);
    await request(app).get("/api/orders?search=a&search=b").expect(422);
  });

  it("keeps the filters in the pagination links", async () => {
    for (let i = 0; i < 3; i++) await createOrder({ status: "paid" });

    const res = await request(app).get("/api/orders?status=paid&per_page=1&page=2").expect(200);
    const next = new URL(res.body.links.next);

    expect(Object.fromEntries(next.searchParams)).toEqual({ status: "paid", per_page: "1", page: "3" });
    expect(new URL(res.body.links.prev).searchParams.get("status")).toBe("paid");
  });

  it("returns an empty page past the end with null from/to", async () => {
    await createOrder();

    const res = await request(app).get("/api/orders?page=5").expect(200);

    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({ current_page: 5, last_page: 1, total: 1, from: null, to: null });
  });

  it("paginates orders placed at the same moment without overlap", async () => {
    const placedAt = new Date("2026-01-01T00:00:00Z");
    for (let i = 0; i < 6; i++) await createOrder({ placedAt });

    const pages = await Promise.all(
      [1, 2, 3].map((page) => request(app).get(`/api/orders?per_page=2&page=${page}`).expect(200)),
    );
    const ids = pages.flatMap((res) => res.body.data.map((o) => o.id));

    expect(new Set(ids).size).toBe(6);
  });

  it("keeps the query count constant as the page size grows", async () => {
    for (let i = 0; i < 40; i++) {
      const order = await createOrder();
      await createOrderItem({ orderId: order.id });
    }

    const small = await countQueries(() => request(app).get("/api/orders?per_page=5"));
    const large = await countQueries(() => request(app).get("/api/orders?per_page=40"));

    expect(large).toBe(small);
  });

  it("returns a single order and 404s for unknown or malformed ids", async () => {
    const order = await createOrder();
    await createOrderItem({ orderId: order.id, quantity: 2 });

    const res = await request(app).get(`/api/orders/${order.id}`).expect(200);
    expect(res.body.data).toMatchObject({ id: order.id, item_count: 2, customer: { lifetime_orders: 1 } });

    await request(app).get("/api/orders/999999").expect(404);
    await request(app).get("/api/orders/abc").expect(404);
  });
});
