import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import OrdersTable from "@/components/OrdersTable";
import { makeOrder, mockFetch } from "./test-utils";

describe("OrdersTable edge cases", () => {
  it("shows the server error and recovers on retry", async () => {
    let calls = 0;
    mockFetch(() =>
      ++calls === 1
        ? { status: 503, body: { message: "Orders are temporarily unavailable." } }
        : { body: { data: [makeOrder(1, { reference: "ORD-RECOVERED" })], meta: { current_page: 1, last_page: 1, total: 1 } } },
    );
    render(<OrdersTable />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Orders are temporarily unavailable.");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("ORD-RECOVERED")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says so when no orders match", async () => {
    mockFetch(() => ({ body: { data: [], meta: { current_page: 1, last_page: 1, total: 0 } } }));
    render(<OrdersTable />);

    expect(await screen.findByText("No orders match these filters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
