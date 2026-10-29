import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { Order, OrderEvent, OrderItem } from "../src/models/index.js";
import { createCustomer, createProduct } from "./helpers.js";

const app = createApp();

const post = (body) => request(app).post("/api/orders").send(body);

describe("POST /api/orders edge cases", () => {
  it("never oversells when orders for the last unit race each other", async () => {
    const customer = await createCustomer();
    const kettle = await createProduct({ stock: 1 });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => post({ customer_id: customer.id, items: [{ product_id: kettle.id, quantity: 1 }] })),
    );

    expect(responses.map((res) => res.status).sort()).toEqual([201, 422, 422, 422, 422]);
    expect((await kettle.reload()).stock).toBe(0);
    expect(await Order.count()).toBe(1);
    expect(await OrderEvent.count()).toBe(1);
  });

  it("gives concurrent orders unique references derived from their id", async () => {
    const customer = await createCustomer();
    const mug = await createProduct({ stock: 50 });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => post({ customer_id: customer.id, items: [{ product_id: mug.id, quantity: 1 }] })),
    );

    expect(responses.every((res) => res.status === 201)).toBe(true);
    for (const { body } of responses) {
      expect(body.data.reference).toBe(`ORD-${String(body.data.id).padStart(6, "0")}`);
    }
    expect((await mug.reload()).stock).toBe(45);
  });

  it("rolls back earlier lines when a later line is out of stock", async () => {
    const customer = await createCustomer();
    const plenty = await createProduct({ stock: 10 });
    const scarce = await createProduct({ stock: 1 });

    await post({
      customer_id: customer.id,
      items: [
        { product_id: plenty.id, quantity: 3 },
        { product_id: scarce.id, quantity: 2 },
      ],
    }).expect(422);

    expect((await plenty.reload()).stock).toBe(10);
    expect(await Order.count()).toBe(0);
    expect(await OrderItem.count()).toBe(0);
  });

  it("returns the created order in the list shape", async () => {
    const customer = await createCustomer();
    const mug = await createProduct({ priceCents: 1250, stock: 5 });

    const res = await post({ customer_id: customer.id, items: [{ product_id: mug.id, quantity: 2 }] }).expect(201);

    expect(res.body.data).toMatchObject({
      status: "pending",
      total_cents: 2500,
      item_count: 2,
      customer: { id: customer.id, lifetime_orders: 1 },
      items: [{ sku: mug.sku, quantity: 2, unit_price_cents: 1250 }],
    });
  });

  it("answers a malformed JSON body with 400 and a safe message", async () => {
    const res = await request(app).post("/api/orders").set("Content-Type", "application/json").send("{ nope").expect(400);

    expect(Object.keys(res.body)).toEqual(["message"]);
    expect(res.body.message).toBe("The request body must be valid JSON.");
  });

  it("validates the payload with 422 field errors", async () => {
    const customer = await createCustomer();
    const mug = await createProduct();

    const res = await post({
      customer_id: customer.id,
      items: [
        { product_id: mug.id, quantity: 0 },
        { product_id: mug.id, quantity: 1 },
      ],
    }).expect(422);

    expect(res.body.errors).toHaveProperty(["items.0.quantity"]);
    expect(res.body.errors).toHaveProperty(["items.1.product_id"]);
    expect(await Order.count()).toBe(0);
  });

  it("sends a Retry-After hint with the 503", async () => {
    const customer = await createCustomer();
    const mug = await createProduct();

    const res = await post({ customer_id: customer.id, items: [{ product_id: mug.id, quantity: 1 }] })
      .set("X-Simulate-Fault", "table_full")
      .expect(503);

    expect(res.headers["retry-after"]).toBe("5");
    expect((await mug.reload()).stock).toBe(50);
  });
});
