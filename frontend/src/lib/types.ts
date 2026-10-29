export type OrderStatus = "pending" | "paid" | "shipped" | "cancelled";

export const ORDER_STATUSES: OrderStatus[] = ["pending", "paid", "shipped", "cancelled"];

export interface OrderItem {
  id: number;
  sku: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

export interface Order {
  id: number;
  reference: string;
  status: OrderStatus;
  total_cents: number;
  placed_at: string | null;
  item_count: number;
  customer: { id: number; name: string; email: string; lifetime_orders: number };
  items: OrderItem[];
}

export interface Paginated<T> {
  data: T[];
  meta: { current_page: number; last_page: number; total: number };
}

export interface Customer {
  id: number;
  name: string;
  email: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  price_cents: number;
  stock: number;
}

export interface NewOrder {
  customer_id: number;
  items: { product_id: number; quantity: number }[];
}
