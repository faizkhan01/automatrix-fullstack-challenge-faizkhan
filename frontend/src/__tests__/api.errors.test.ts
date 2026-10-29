import { describe, expect, it, vi } from "vitest";
import { ApiError, createOrder, fetchOrders } from "@/lib/api";
import { mockFetch } from "./test-utils";

const order = { customer_id: 1, items: [{ product_id: 10, quantity: 1 }] };

describe("api client errors", () => {
  it("exposes field errors from a 422", async () => {
    mockFetch(() => ({ status: 422, body: { message: "Bad quantity.", errors: { "items.0.quantity": ["Bad quantity."] } } }));

    await expect(createOrder(order)).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      errors: { "items.0.quantity": ["Bad quantity."] },
    });
  });

  it("falls back to a friendly message when an error response isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 502 })));

    const error = await createOrder(order).catch((err) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.message).not.toMatch(/html/i);
  });

  it("rejects when a successful response isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));

    await expect(fetchOrders()).rejects.toBeInstanceOf(ApiError);
  });

  it("turns a network failure into an ApiError with status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));

    await expect(fetchOrders()).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/reach the server/) });
  });

  it("lets AbortError through untouched so callers can ignore it", async () => {
    mockFetch(() => ({ delay: 50, body: {} }));
    const controller = new AbortController();

    const pending = fetchOrders({}, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("sends filters and page as query params and the fault header when asked", async () => {
    const fetchMock = mockFetch(() => ({ status: 201, body: { data: {} } }));

    await fetchOrders({ status: "paid", search: "Moreno", page: 2 });
    await createOrder(order, { simulateFault: "table_full" });

    const [[listUrl], [, postInit]] = fetchMock.mock.calls;
    expect(String(listUrl)).toBe("/api/orders?status=paid&search=Moreno&page=2");
    expect(postInit?.headers).toMatchObject({ "X-Simulate-Fault": "table_full", "Content-Type": "application/json" });
  });
});
