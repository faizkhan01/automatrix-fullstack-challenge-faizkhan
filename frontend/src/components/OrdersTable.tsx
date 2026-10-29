"use client";

import { useEffect, useState } from "react";
import OrderFilters from "@/components/OrderFilters";
import Pagination from "@/components/Pagination";
import StatusBadge from "@/components/StatusBadge";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { fetchOrders } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import type { Order, OrderStatus, Paginated } from "@/lib/types";

export default function OrdersTable() {
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [result, setResult] = useState<Paginated<Order> | null>(null);

  // The page belongs to one filter combination, so changing a filter falls back to page 1
  // without an extra render or a request for a stale page.
  const filterKey = `${status}|${debouncedSearch}`;
  const [pageState, setPageState] = useState({ filterKey, page: 1 });
  const page = pageState.filterKey === filterKey ? pageState.page : 1;
  const setPage = (next: number) => setPageState({ filterKey, page: next });

  useEffect(() => {
    // Abort the in-flight request when the query changes so a slow response
    // for an old page or filter can never overwrite the current one.
    const controller = new AbortController();

    fetchOrders({ status, search: debouncedSearch, page }, controller.signal)
      .then(setResult)
      .catch((error) => {
        if (error.name !== "AbortError") console.error(error);
      });

    return () => controller.abort();
  }, [status, debouncedSearch, page]);

  return (
    <>
      <OrderFilters status={status} search={search} onStatusChange={setStatus} onSearchChange={setSearch} />

      {!result ? (
        <p>Loading orders…</p>
      ) : (
        <>
          <table>
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
              {result.data.map((order) => (
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
          <Pagination page={result.meta.current_page} lastPage={result.meta.last_page} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
