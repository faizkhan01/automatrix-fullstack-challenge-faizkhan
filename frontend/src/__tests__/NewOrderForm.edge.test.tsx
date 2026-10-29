import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import NewOrderForm from "@/components/NewOrderForm";
import { makeOrder, mockFetch, MockResponse } from "./test-utils";

const customers = { body: { data: [{ id: 1, name: "Alice Moreno", email: "alice@example.com" }] } };
const products = {
  body: {
    data: [
      { id: 10, sku: "MUG-1", name: "Mug", price_cents: 1000, stock: 4 },
      { id: 11, sku: "TEA-1", name: "Tea tin", price_cents: 500, stock: 9 },
    ],
  },
};

function api(orderResponses: MockResponse[], catalog: MockResponse = products) {
  return mockFetch((url, init) => {
    if (url.pathname === "/api/customers") return customers;
    if (url.pathname === "/api/products") return catalog;
    if (url.pathname === "/api/orders" && init?.method === "POST") return orderResponses.shift()!;
    throw new Error(`Unexpected request ${url}`);
  });
}

async function fillAndSubmit() {
  render(<NewOrderForm />);
  await screen.findByRole("option", { name: "Alice Moreno" });
  await userEvent.selectOptions(screen.getByLabelText("Customer"), "1");
  await userEvent.selectOptions(screen.getByLabelText("Product"), "10");
  await userEvent.click(screen.getByRole("button", { name: "Place order" }));
}

describe("NewOrderForm edge cases", () => {
  it("lets the user retry after a failure and clears the error on success", async () => {
    api([
      { status: 503, body: { message: "Try again." } },
      { status: 201, body: { data: makeOrder(7, { reference: "ORD-000007" }) } },
    ]);

    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again.");

    await userEvent.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByRole("status")).toHaveTextContent("ORD-000007");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Customer")).toHaveValue("");
  });

  it("locks the inputs while the order is in flight", async () => {
    api([{ status: 201, delay: 100, body: { data: makeOrder(7) } }]);

    await fillAndSubmit();

    expect(screen.getByLabelText("Customer")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add line" })).toBeDisabled();
    await screen.findByRole("status");
    expect(screen.getByLabelText("Customer")).toBeEnabled();
  });

  it("shows an error when the catalog can't be loaded", async () => {
    api([], { status: 503, body: { message: "Catalog is down." } });

    render(<NewOrderForm />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Catalog is down.");
  });

  it("does not offer a product that is already on another line", async () => {
    api([]);
    render(<NewOrderForm />);
    await screen.findByRole("option", { name: "Alice Moreno" });

    await userEvent.selectOptions(screen.getByLabelText("Product"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Add line" }));

    const [, second] = screen.getAllByLabelText("Product");
    await waitFor(() => expect(second.querySelector('option[value="10"]')).toBeDisabled());
    expect(second.querySelector('option[value="11"]')).toBeEnabled();
  });
});
