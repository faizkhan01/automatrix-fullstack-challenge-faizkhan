/** A random key identifying one logical attempt to place an order. */
export function newIdempotencyKey(): string {
  // randomUUID only exists in secure contexts (HTTPS or localhost); getRandomValues works everywhere.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
