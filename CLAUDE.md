# OrderDesk: working rules

Internal ops dashboard to browse and place customer orders.

- **Backend: `backend-node/` only** (Express 5, Sequelize 6, MySQL 8, ESM, vitest + supertest).
- **Frontend: `frontend/`** (Next.js 16 App Router, React 19, TypeScript strict, vitest + Testing Library).
- `backend-laravel/` is out of scope: never edit it. It's only useful as a reference for the shared API contract.

## Hard rules (the spec)

1. **Never modify existing tests**: `backend-node/tests/*`, `frontend/src/__tests__/*` (including `test-utils.ts`).
   Adding new test files is allowed and encouraged.
2. **Never modify the fault injector**: `backend-node/src/faults/faultInjector.js`. Fix application code instead.
3. **Never change the JSON response shape** of existing endpoints (key names, nesting, key order of
   `items[]` entries: `id, sku, name, quantity, unit_price_cents`).
4. Error responses are always `{ message }` (plus `errors` for 422 validation). `message` must be safe to
   show to end users: no SQL, table names, driver codes, or stack traces, in any environment.
   Details go to the server log only.
5. Unrecoverable DB failures → **503**. Validation → **422**. Not found → **404**.
6. Writes that touch more than one row (orders, items, stock, events) run in **one transaction**,
   all-or-nothing. Transient errors (deadlock 1213, lock wait timeout 1205) retry the **whole** transaction.

## Commands (Docker stack is already running: `docker compose --profile node up`)

```bash
docker compose exec -T backend-node npm test          # backend tests (MySQL orderdesk_test)
docker compose exec -T frontend npx vitest run        # frontend tests
docker compose exec -T frontend npx tsc --noEmit      # typecheck (run `npx next typegen` first if route types are missing)
docker compose exec -T frontend npx eslint src        # lint
curl -s localhost:8000/api/orders | jq                # API (re-seeded on every backend container start)
curl -s -XPOST localhost:8000/api/orders -H 'X-Simulate-Fault: table_full' ...   # or deadlock_once
```

Always run the real test suites before committing. Don't rely on reasoning alone.

## Backend conventions (`backend-node/src`)

- Layout: `routes/` (thin HTTP: parse, validate, call service, respond) → `services/` (business logic,
  transactions) → `models/` (Sequelize definitions + associations in `models/index.js`).
  `serializers/` are **pure, synchronous** functions over already-loaded data and never query the DB.
  `http/` holds cross-cutting HTTP concerns (errors, validation, middleware). `db/` holds connection and transaction helpers.
- **No N+1**: list endpoints batch-load relations (eager `include` or one `WHERE id IN (...)` query per
  relation). Query count must not grow with page size (tested: ≤ 6 for 15 orders).
- Combine filters with `Op.and`; never reassign `where` so that an earlier filter gets dropped.
  Escape `%`, `_` and `\` in user input used in `LIKE`.
- Bound every user-controlled size (`per_page` ≤ 100, `items` lines, string lengths). Validate types:
  Express query values can be arrays.
- Pass `{ transaction }` explicitly to **every** query inside a transaction (no CLS is configured).
  Lock rows you read-then-write (`lock: transaction.LOCK.UPDATE`) in a deterministic order (by id).
- Throw `HttpError` subclasses from `http/errors.js` for expected failures; let the central
  `errorHandler` map everything else.
- Style: ESM, double quotes, semicolons, 2-space indent, ~120 col, `async/await`. JSDoc on exported
  functions when types aren't obvious. Comments are short (1–2 lines) and explain *why*, not what.

## Frontend conventions (`frontend/src`)

- `lib/api.ts` is the only place that calls `fetch`. It **rejects on non-2xx** with `ApiError`
  (`message` from the server, `status`, optional field `errors`). AbortErrors propagate untouched.
- Components: `"use client"` only where state/effects are needed; presentational components
  (`StatusBadge`, `OrderFilters`, `Pagination`) stay stateless and prop-driven.
- Data fetching in effects must be **race-safe**: abort the previous request via `AbortController` in
  the cleanup, and ignore `AbortError`.
- Every async UI path handles **loading, error and empty** states. Errors render in `role="alert"`,
  success in `role="status"`.
- Forms: keep user input on failure, disable submit while in flight (and guard with a ref), reset only on success.
- Prefer derived state over effects that call `setState` (React Compiler lint rules are on).
- Style: TypeScript strict, no `any`, named types in `lib/types.ts`, `@/` imports, double quotes, semicolons.
  Reuse existing CSS classes in `app/globals.css` (`alert`, `notice`, `badge`, `toolbar`, `pagination`, `card`).

## Git

- Small commits, imperative subject (`Fix …`, `Add …`), body explains *why*. Scope prefix optional
  (`backend:`, `frontend:`).
- Identity: `Md. Faizur Rahman Khan <khan.nayeem8662@gmail.com>`. No AI co-author trailers.
- Remote for submission: `submission` (github.com/faizkhan01/automatrix-fullstack-challenge-faizkhan). Push `main` after each task.
- Record judgement calls and ambiguities in `NOTES.md` as you go.
