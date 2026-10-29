const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(cents: number): string {
  return money.format(cents / 100);
}

/** The API sends `placed_at: null` for orders without a date, which would otherwise render "Invalid Date". */
export function formatDate(iso: string | null): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
