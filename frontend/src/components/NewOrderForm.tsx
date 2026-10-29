"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, createOrder, fetchCustomers, fetchProducts } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Customer, Product } from "@/lib/types";

interface Line {
  key: number;
  productId: string;
  quantity: number;
}

// Matches the API's per-line limit.
const MAX_QUANTITY = 100;

let nextLineKey = 0;
const emptyLine = (): Line => ({ key: nextLineKey++, productId: "", quantity: 1 });

const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : "Something went wrong. Please try again.";

export default function NewOrderForm({ simulateFault }: { simulateFault?: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // State updates are async, so a ref is what reliably blocks a second submit in the same tick.
  const submittingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([fetchCustomers(controller.signal), fetchProducts(controller.signal)])
      .then(([customersRes, productsRes]) => {
        setCustomers(customersRes.data);
        setProducts(productsRes.data);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoadError(`Could not load customers and products. ${errorMessage(err)}`);
      });

    return () => controller.abort();
  }, []);

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await createOrder(
        {
          customer_id: Number(customerId),
          items: lines.map((line) => ({ product_id: Number(line.productId), quantity: line.quantity })),
        },
        { simulateFault },
      );

      setSuccess(`Order ${res.data.reference} placed for ${formatMoney(res.data.total_cents)}.`);
      setCustomerId("");
      setLines([emptyLine()]);
      // Stock counts in the product list are stale now; a failed refresh isn't worth an error.
      fetchProducts()
        .then((productsRes) => setProducts(productsRes.data))
        .catch(() => {});
    } catch (err) {
      // Input is deliberately kept so the user can fix it or simply try again.
      setError(errorMessage(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} aria-busy={submitting}>
      {success && <p role="status" className="notice">{success}</p>}
      {(error ?? loadError) && <p role="alert" className="alert">{error ?? loadError}</p>}

      <fieldset className="plain" disabled={submitting}>
        <label>
          Customer
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="">Select a customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        {lines.map((line) => {
          // The API rejects the same product twice, so each product can only be picked on one line.
          const takenElsewhere = new Set(lines.filter((l) => l.key !== line.key).map((l) => l.productId));

          return (
            <div className="line" key={line.key}>
              <label>
                Product
                <select value={line.productId} onChange={(e) => updateLine(line.key, { productId: e.target.value })} required>
                  <option value="">Select a product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id} disabled={takenElsewhere.has(String(p.id))}>
                      {p.name} ({formatMoney(p.price_cents)}, {p.stock} in stock)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Qty
                <input
                  type="number"
                  min={1}
                  max={MAX_QUANTITY}
                  step={1}
                  required
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                disabled={lines.length === 1}
              >
                Remove
              </button>
            </div>
          );
        })}

        <div>
          <button type="button" className="secondary" onClick={() => setLines((current) => [...current, emptyLine()])}>
            Add line
          </button>
        </div>

        <div>
          <button type="submit" disabled={submitting}>
            {submitting ? "Placing order…" : "Place order"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
