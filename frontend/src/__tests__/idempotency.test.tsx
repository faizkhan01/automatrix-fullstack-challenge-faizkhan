import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import NewOrderForm from "@/components/NewOrderForm";
import { formatDate } from "@/lib/format";
import { makeOrder, mockFetch, MockResponse } from "./test-utils";

function api(orderResponses: MockResponse[]) {
  return mockFetch((url, init) => {
    if (url.pathname === "/api/customers") {
      return {
        body: {
          data: [
            { id: 1, name: "Alice Moreno", email: "alice@example.com" },
            { id: 2, name: "Bilal Khan", email: "bilal@example.com" },
          ],
        },
      };
    }
    if (url.pathname === "/api/products") {
      return { body: { data: [{ id: 10, sku: "MUG-1", name: "Mug", price_cents: 1000, stock: 4 }] } };
    }
    if (url.pathname === "/api/orders" && init?.method === "POST") return orderResponses.shift()!;
    throw new Error(`Unexpected request ${url}`);
  });
}

const sentKeys = (fetchMock: ReturnType<typeof api>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => (init?.headers as Record<string, string>)["Idempotency-Key"]);

async function fill(customer = "1") {
  await userEvent.selectOptions(screen.getByLabelText("Customer"), customer);
  await userEvent.selectOptions(screen.getByLabelText("Product"), "10");
}

const submit = () => userEvent.click(screen.getByRole("button", { name: "Place order" }));

describe("NewOrderForm idempotency", () => {
  it("reuses the key when an unchanged order is retried after a failure", async () => {
    const fetchMock = api([
      { status: 503, body: { message: "Try again." } },
      { status: 201, body: { data: makeOrder(1) } },
    ]);
    render(<NewOrderForm />);
    await screen.findByRole("option", { name: "Alice Moreno" });

    await fill();
    await submit();
    await screen.findByRole("alert");
    await submit();
    await screen.findByRole("status");

    const [first, retry] = sentKeys(fetchMock);
    expect(first).toEqual(expect.any(String));
    expect(retry).toBe(first);
  });

  it("uses a new key once the order is edited or after a success", async () => {
    const fetchMock = api([
      { status: 503, body: { message: "Try again." } },
      { status: 201, body: { data: makeOrder(1) } },
      { status: 201, body: { data: makeOrder(2) } },
    ]);
    render(<NewOrderForm />);
    await screen.findByRole("option", { name: "Alice Moreno" });

    await fill();
    await submit();
    await screen.findByRole("alert");
    await userEvent.selectOptions(screen.getByLabelText("Customer"), "2");
    await submit();
    await screen.findByRole("status");
    await fill();
    await submit();
    await screen.findByText(/ORD-000002/);

    const keys = sentKeys(fetchMock);
    expect(new Set(keys).size).toBe(3);
  });
});

describe("formatDate", () => {
  it("renders a dash instead of Invalid Date for missing or bad dates", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not a date")).toBe("—");
    expect(formatDate("2026-01-15T10:00:00+00:00")).toBe("Jan 15, 2026");
  });
});
