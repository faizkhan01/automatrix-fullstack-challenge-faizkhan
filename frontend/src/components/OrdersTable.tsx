"use client";

import { useEffect, useState } from "react";
import OrderFilters from "@/components/OrderFilters";
import Pagination from "@/components/Pagination";
import StatusBadge from "@/components/StatusBadge";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ApiError, fetchOrders } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import type { Order, OrderStatus, Paginated } from "@/lib/types";

export default function OrdersTable() {
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  // The page belongs to one filter combination, so changing a filter falls back to page 1
  // without an extra render or a request for a stale page.
  const filterKey = `${status}|${debouncedSearch}`;
  const [pageState, setPageState] = useState({ filterKey, page: 1 });
  const page = pageState.filterKey === filterKey ? pageState.page : 1;
  const setPage = (next: number) => setPageState({ filterKey, page: next });

  // Each outcome remembers which query produced it, so "loading" is derived instead of toggled in the effect.
  const queryKey = `${filterKey}|${page}`;
  const [result, setResult] = useState<{ queryKey: string; orders: Paginated<Order> } | null>(null);
  const [failure, setFailure] = useState<{ queryKey: string; message: string } | null>(null);
  const [retries, setRetries] = useState(0);
  const isStale = result?.queryKey !== queryKey && failure?.queryKey !== queryKey;
  const error = failure?.queryKey === queryKey ? failure.message : null;

  useEffect(() => {
    // Abort the in-flight request when the query changes so a slow response
    // for an old page or filter can never overwrite the current one.
    const controller = new AbortController();
    const key = `${status}|${debouncedSearch}|${page}`;

    fetchOrders({ status, search: debouncedSearch, page }, controller.signal)
      .then((orders) => {
        setResult({ queryKey: key, orders });
        setFailure(null);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setFailure({ queryKey: key, message: err instanceof ApiError ? err.message : "Could not load orders." });
      });

    return () => controller.abort();
  }, [status, debouncedSearch, page, retries]);

  return (
    <>
      <OrderFilters status={status} search={search} onStatusChange={setStatus} onSearchChange={setSearch} />

      {error && (
        <div role="alert" className="alert">
          {error}{" "}
          <button type="button" className="secondary" onClick={() => setRetries((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}

      {!result ? (
        !error && <p>Loading orders…</p>
      ) : (
        <>
          <table className={isStale ? "is-stale" : undefined} aria-busy={isStale}>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="num">Items</th>
                <th>Placed</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {result.orders.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    No orders match these filters.
                  </td>
                </tr>
              )}
              {result.orders.data.map((order) => (
                <tr key={order.id}>
                  <td>{order.reference}</td>
                  <td>
                    {order.customer.name}
                    <br />
                    <small>{order.customer.lifetime_orders} orders</small>
                  </td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="num">{order.item_count}</td>
                  <td>{formatDate(order.placed_at)}</td>
                  <td className="num">{formatMoney(order.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={result.orders.meta.current_page}
            lastPage={result.orders.meta.last_page}
            onPageChange={setPage}
          />
        </>
      )}
    </>
  );
}
