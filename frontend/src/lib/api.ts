import type { Customer, NewOrder, Order, OrderStatus, Paginated, Product } from "./types";

const BASE_URL = "/api";

/** Rejection for any failed API call. `message` is safe to show to users. */
export class ApiError extends Error {
  readonly status: number;
  readonly errors?: Record<string, string[]>;

  constructor(message: string, status: number, errors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

// Used when the response has no message of its own, e.g. an HTML 502 from a proxy.
const fallbackMessage = (status: number) =>
  status >= 500 ? "The server is unavailable right now. Please try again in a moment." : `Request failed (HTTP ${status}).`;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined && { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
  } catch (error) {
    // Callers rely on AbortError to ignore superseded requests, so let it through untouched.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }

  const body = await readJson(res);

  if (!res.ok) {
    const { message, errors } = (body ?? {}) as { message?: unknown; errors?: Record<string, string[]> };
    throw new ApiError(typeof message === "string" && message ? message : fallbackMessage(res.status), res.status, errors);
  }
  if (body === undefined) {
    throw new ApiError("The server sent an unexpected response. Please try again.", res.status);
  }

  return body as T;
}

/** The parsed JSON body, or `undefined` if there is none or it isn't JSON. */
async function readJson(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
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

export function fetchCustomers(signal?: AbortSignal): Promise<{ data: Customer[] }> {
  return request("/customers", { signal });
}

export function fetchProducts(signal?: AbortSignal): Promise<{ data: Product[] }> {
  return request("/products", { signal });
}

export function createOrder(order: NewOrder, options: { simulateFault?: string } = {}): Promise<{ data: Order }> {
  return request("/orders", {
    method: "POST",
    body: JSON.stringify(order),
    headers: options.simulateFault ? { "X-Simulate-Fault": options.simulateFault } : {},
  });
}
