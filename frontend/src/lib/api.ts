import type { Customer, NewOrder, Order, OrderStatus, Paginated, Product } from "./types";

const BASE_URL = "/api";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  return res.json();
}

export interface OrderFilters {
  status?: OrderStatus | "";
  search?: string;
  page?: number;
}

export function fetchOrders(filters: OrderFilters = {}, signal?: AbortSignal): Promise<Paginated<Order>> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.page) params.set("page", String(filters.page));

  const query = params.toString();
  return request(`/orders${query ? `?${query}` : ""}`, { signal });
}

export function fetchCustomers(): Promise<{ data: Customer[] }> {
  return request("/customers");
}

export function fetchProducts(): Promise<{ data: Product[] }> {
  return request("/products");
}

export function createOrder(order: NewOrder, options: { simulateFault?: string } = {}): Promise<{ data: Order }> {
  return request("/orders", {
    method: "POST",
    body: JSON.stringify(order),
    headers: options.simulateFault ? { "X-Simulate-Fault": options.simulateFault } : {},
  });
}
