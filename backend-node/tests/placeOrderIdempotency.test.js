import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { Order, OrderEvent } from "../src/models/index.js";
import { createCustomer, createProduct } from "./helpers.js";

const app = createApp();

let customer, mug;

beforeEach(async () => {
  customer = await createCustomer();
  mug = await createProduct({ stock: 1 });
});

const post = (key, body = { customer_id: customer.id, items: [{ product_id: mug.id, quantity: 1 }] }) => {
  const req = request(app).post("/api/orders");
  if (key !== undefined) req.set("Idempotency-Key", key);
  return req.send(body);
};

describe("POST /api/orders with an Idempotency-Key", () => {
  it("returns the original order when the same request is repeated", async () => {
    const first = await post("checkout-1").expect(201);
    const retry = await post("checkout-1").expect(201);

    expect(retry.body).toEqual(first.body);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    expect(await Order.count()).toBe(1);
    expect(await OrderEvent.count()).toBe(1);
    expect((await mug.reload()).stock).toBe(0);
  });

  it("places exactly one order when duplicates race, even for the last unit in stock", async () => {
    const responses = await Promise.all(Array.from({ length: 4 }, () => post("checkout-race")));

    expect(responses.map((res) => res.status)).toEqual([201, 201, 201, 201]);
    expect(new Set(responses.map((res) => res.body.data.id)).size).toBe(1);
    expect(await Order.count()).toBe(1);
    expect((await mug.reload()).stock).toBe(0);
  });

  it("lets a retry succeed after the first attempt failed and rolled back", async () => {
    await post("checkout-2").set("X-Simulate-Fault", "table_full").expect(503);

    await post("checkout-2").expect(201);

    expect(await Order.count()).toBe(1);
  });

  it("scopes keys to the customer", async () => {
    const other = await createCustomer();
    const tea = await createProduct({ stock: 5 });

    await post("shared-key").expect(201);
    await post("shared-key", { customer_id: other.id, items: [{ product_id: tea.id, quantity: 1 }] }).expect(201);

    expect(await Order.count()).toBe(2);
  });

  it("rejects a malformed key", async () => {
    const res = await post("x".repeat(256)).expect(422);

    expect(res.body.errors).toHaveProperty("idempotency_key");
    expect(await Order.count()).toBe(0);
  });

  it("still places independent orders without a key", async () => {
    await createProduct();
    mug = await createProduct({ stock: 5 });

    await post(undefined).expect(201);
    await post(undefined).expect(201);

    expect(await Order.count()).toBe(2);
  });
});
