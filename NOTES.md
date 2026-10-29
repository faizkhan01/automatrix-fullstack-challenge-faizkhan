# NOTES

Backend: **`backend-node/`**. All suites pass: backend 30/30 (7 QA + 23 added), frontend 26/26 (11 QA + 15 added).
`tsc --noEmit` and `eslint` are clean. No QA tests and no fault-injector code were changed.

## What I changed, and why

### 1. Merge `feature/order-pagination`
- `fetchOrders({ status, search, page }, signal)`: one query builder for both features.
- `OrdersTable` keeps everything from both branches: the filter toolbar, status badges, debounced search and
  the "N orders" line (filters), plus the Items column, `Pagination` and abort-on-change (pagination).
- The page is **keyed to the active filters** (derived state), so changing a filter drops back to page 1
  without an effect that would first fire a request for a stale page.

### 2. Slow list + wrong status (`GET /api/orders`)
- **Wrong status:** with `search`, the code *reassigned* `where` to the search `OR`, which dropped `status`.
  Filters are now `Op.and`-combined. The pagination links also dropped the query string, so following
  `links.next` widened the result set. They now keep the filters.
- **Slow:** the serializer lazy-loaded customer, items, each item's product, an item SUM and a lifetime COUNT
  *per order* (N+1, roughly 5 + items queries per row). Serializers are now pure. `loadOrderResources` batch-loads, so a page
  costs **4 queries whatever its size** (there's a test asserting this).
- Hardening, same JSON shape: `per_page` clamped to 100 (it was unbounded, and negative values caused a 500), array-valued
  params give a 422, `%`/`_` are escaped in LIKE, `id DESC` tie-breaker for stable paging, `from`/`to` are null past the
  last page, and `/orders/:id` returns 404 on malformed ids.

### 3. All-or-nothing orders (OD-142 / OD-157)
- `placeOrder` runs in **one transaction** (`db/transaction.js`). Deadlocks and lock-wait timeouts **retry the whole unit
  of work** (3 attempts, jittered backoff). Anything else rolls back.
- Product rows are locked `FOR UPDATE` in id order. This prevents overselling under concurrency (tested with 5 racing
  orders for 1 unit) and stops concurrent orders deadlocking each other.
- Order reference is derived from the auto-increment id. `MAX(id)+1` collided under concurrency.
- Unrecoverable DB errors → **503** `{ message }` + `Retry-After`. The error handler **never** returns SQL or stacks now,
  in any environment, because the UI shows `message` to users. Malformed JSON gives a 400 instead of a 500.
- Frontend: `ApiError` (`message`, `status`, `errors`). Non-JSON and network failures get friendly fallbacks, and
  AbortError passes through. The form shows errors in `role="alert"`, keeps input, disables the fieldset while in flight
  (plus a ref guard), and refreshes stock after success. OrdersTable gained error+retry, empty and refreshing states.

### 4. Extras
- **Idempotency-Key on `POST /api/orders`.** Disabling the button doesn't cover the remaining duplicate-order path:
  the order commits, the *response* is lost, and the user retries. The form sends one key per attempt (reused for an
  unchanged retry, rotated on edit or success). The server replays the original order (201 + `Idempotent-Replayed`).
  Keyed requests lock the customer row so a racing duplicate replays instead of competing for stock.
- `placed_at` is nullable: render "—" instead of "Invalid Date".
- Graceful shutdown on SIGTERM/SIGINT (drain requests, close the pool, 10s limit). Orders are capped at 50 lines.

## Judgement calls
- `per_page` over 100 is **clamped**, not rejected (friendlier, and `meta.per_page` tells the client).
- Dev error responses lost their verbose `sql`/`stack`. That's deliberate, and the server log still has everything.
- While a new page or filter loads, the previous rows stay visible (dimmed, `aria-busy`) instead of flashing "Loading…".
- An idempotency key reused with a *different* payload returns the original order. Stripe rejects this with a 422 instead,
  which would need a stored request hash (see below).
- Rolled-back attempts consume auto-increment ids, so references can have gaps. That's harmless.

## What I'd do next
1. **Real migrations** (umzug / sequelize-cli). Schema comes from `sync({ force: true })` today, so prod would need a
   migration for the new `orders.idempotency_key` column and its unique index.
2. **Fault simulation is opt-out:** it's on unless `NODE_ENV=production`, and nothing sets `NODE_ENV` in compose.
   A deploy that forgets it lets anyone 503 the checkout with one header. I'd make it opt-in
   (`ENABLE_FAULT_SIMULATION=true` in the compose/test env only).
3. Idempotency: store a request hash and reject a key reused with a different payload (422). Expire old keys.
4. Put filters and page in the URL (`useSearchParams`) so views are shareable and work with the back button.
5. Scale: `%term%` search and `COUNT(*)` per page will hurt with real volume. Consider a FULLTEXT index and
   keyset pagination. `/customers` and `/products` return everything, so they'd need search/typeahead.
6. Ops: structured logging with request ids, rate limiting, and auth (none today, even for an internal tool).

## Noticed, not done
- The Laravel backend has the same bugs (`orWhereHas` without grouping, unbounded `per_page`). It's out of scope.
- `orders.status` is a free-form string in the DB, with no ENUM/CHECK and no transition rules.
- Seed data is random on every boot. A fixed seed would make bug reports reproducible.
- When the data shrinks (e.g. "Page 5 of 3"), Pagination doesn't clamp back to the last page.
- Dev gotcha: `node --watch` on the Docker bind mount sometimes misses edits. Restart `backend-node` if the API looks stale.
