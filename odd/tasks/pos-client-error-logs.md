# pos-client-error-logs

Branch `test`. Delivery: work-unit commits on `test`, one RDD review per commit.
Runners: `dotnet test backend/src/SMCA.sln` (backend), `pnpm --filter @store-mgmt/web-store-pos test` (frontend).

Objective: POS client errors reach the backend and are readable by SuperAdmin in a filtered
screen showing owner name, store name and the log entry.

## Evidence (verified, not assumed)

- `frontend-react/apps/web-store-pos/app/shared/lib/diagnostics/client-log.ts:37-40` — localStorage
  ring buffer `lizoft.client-log-v1`, 200 entries, 7 days, redacted before persisting.
- Same file `:141-201` — `logClientError`, `getClientLogs`, `clearClientLogs`, `exportClientLogs`.
- `app/shared/lib/usage/store-usage-tracker.ts:161-188` — the offline usage-send POST already uses
  `skipDiagnostics: true` and swallows its own errors, so usage-send failures never enter the buffer.
- `backend/src/Domain/Entities/SiteTelemetry/SiteEvent.cs` + migration `Add-SiteEvents` — existing
  batch-ingest telemetry, but site-wide and anonymous (no StoreId/OwnerId): NOT reusable.
- `backend/src/Infrastructure/Persistence/Contexts/ApplicationDbContext.cs:60` — global `NoTracking`;
  inserts via `Add` are unaffected, query-then-mutate is.
- SuperAdmin gate convention: `[HasPermission(StoreRoleFeatures.SuperAdmin)]` on the controller.
- `app/auth/routes/loaders.ts:266` `superAdminLoader`; `app/routes.ts:184` is the `admin/*` pattern;
  `app/shared/lib/config/menu-config.ts:57-167` admin menu with `rolesOnly`.
- `app/admin/catalog-stats/**` is the closest existing SuperAdmin telemetry screen to mirror.

## Specs

### S1 — What is published
Only `level: 'error'` entries from the POS client log buffer. `warn` and `info` stay local.
Failures produced while sending offline usages are never published (they never enter the buffer,
`skipDiagnostics: true`).

### S2 — When it is published
Automatically, only while the device is online (`useOnlineStatus`). Offline entries stay in the
buffer and are published on the next online run.

### S3 — Entries without a session
Errors raised before a session exists (failed login, device key) are buffered and published after
the next successful session. The ingest endpoint is authenticated; no anonymous ingest surface.

### S4 — Entries without a store
Published too. `StoreId` is nullable; the view shows `—` for owner and store name.

### S5 — Persistence
New table (new entity), not `SiteEvent`. Each row keeps: message, route, location, count, context,
appVersion, device, `OccurredAt`, `ReceivedAt`.
`OccurredAt` = the client's `ts`; `ReceivedAt` = server arrival. Both stored as UTC
(`timestamp with time zone`); Npgsql needs an explicit `Kind=Utc`.
FK to `Store` is `OnDelete(Cascade)` so the existing E2E `ResetDataAsync` keeps working unchanged.

### S6 — Read endpoint
SuperAdmin only. Filters: owner, store, date range. Pagination with a documented default/maximum.
Ordered by `OccurredAt` descending.

### S7 — Date filter
Filtering uses `OccurredAt`. The frontend computes the range boundaries from the SuperAdmin
browser's own local day and sends absolute ISO instants; the backend compares against the UTC
column. Default range: the SuperAdmin's current local day.

### S8 — The view
New SuperAdmin route listing owner name, store name and the log entry, with owner/store selectors
and a date range. Default state is today in the SuperAdmin's timezone. Menu entry under the admin
group, `rolesOnly: user.isSuperAdmin`.

### S9 — No regressions
Existing backend E2E tests and existing frontend E2E tests/support files are not modified.
Existing test suites stay green.

## Tasks

| ID | Spec | Route | Status |
| --- | --- | --- | --- |
| T1 | S5, S4 | delegated worker | done — split into `db1c42d0` (entity + EF mapping) and `dccfb45d` (generated migration + script) |
| T2 | S1-S4 | delegated worker | done — `01bedf43` (ingest endpoint + 6 handler tests) |
| T3 | S6, S7 | delegated worker | done — `8fd91522` (read endpoint + handler tests + 2 E2E) |
| T4 | S1-S3 | delegated worker | done — `30dfd2c7` (publisher + hook + 13 tests) |
| T5 | S8, S7 | delegated worker (aborted, completed by parent) | done — `b57fe41e` (route + service + menu + i18n + 6 tests) |
| T6 | S9 | parent | done — backend 202 + 1893 + 979 passed, frontend 6542 passed / 6 skipped |

## RDD per commit

- `db1c42d0` — reviewed, approved, acknowledged (`review-d7a2002486080c71`).
- `dccfb45d` — **not reviewable by the native engine**: `lens_context_budget_exceeded` at preflight
  (its `Designer.cs` alone is 4258 generated lines). No authority was created.
- `01bedf43` — reviewed, approved, acknowledged (`review-cbe13560a27c270b`).
- `8fd91522` — reviewed, approved, acknowledged (`review-1f2c2579771e2e0f`).
- `30dfd2c7` — reviewed, approved, acknowledged (`review-925e41279237563f`).
- `b57fe41e` — reviewed, approved, acknowledged (`review-946eab1b0bde4e2a`).

Advisory findings left as follow-up work (non-blocking, none reopened a review): the ingest endpoint
trusts a caller-supplied `StoreId`, the server does not re-redact `Context`, `OwnerId`/`StoreId`
filtering is only proven at unit level, and the publisher's hook trigger has no test.

## Follow-up: closing every advisory finding

| ID | Group | Findings closed |
| --- | --- | --- |
| U1 | ingest hardening | store-ownership check, server-side redaction, serialize guard, cap-after-filter, truncate helper, DI placement, route/version note, test cleanup, ingestion rate limit |
| U2 | entity + schema | count CHECK constraint, enforced invariants or reworded docs, payload parameter object, script provenance header |
| U3 | read query | UTC conversion instead of relabel, page upper clamp, inclusive-bounds test, TotalCount-independence test, pageSize lower clamp test, E2E owner/store filter test, E2E 403 pin |
| U4 | publisher | entry identity (idempotency), explicit ordering, hook-trigger test, mutex test, cursor-corruption tests, cursor counter rename, shared device/appVersion helper, test setup dedupe |
| U5 | admin view | deterministic timezone test, error-branch tests, page/store reset tests, inverted date range handling, empty-filter test, label-based queries, route/menu auth test |

Accepted tradeoff, not fixed: `OnDelete(Cascade)` on the `Store` FK is required so the untouched E2E
`ResetDataAsync` keeps working; store-scoped error history dies with its store.

Task table above records the original delivery; this follow-up is tracked per group id U1-U5.

## Log

- L1 (2026-11-19, verbatim): "necesito un modo de que los logs de errores en el POS y las excepciones del POS, no las que ocurren al tratar de enviar los usages sin conexion, se publiquen en el backend cuando el dispositivo este conectado a internet."
- L2 (verbatim): "en una tabla consultable y en una vista donde se muestre el nombre del owner, el nombre de la tienda y el log."
- L3 (verbatim): "solo SuperAdmin y todos los logs"
- L4 (verbatim): "solo error. Ademas la vista debe permitir filtrar por owner, store y rango de fechas. Por defecto debe mostrar los errores del dia actual segun la hora del browser del SuperAdmin"
- L5 (verbatim, sin tienda): "si si, publicalos tambien."
- L6 (verbatim): "No es mejora guardarla en UTC y despues mostrarla segun la zona horario del SuperAdmin?" — resolved: both instants stored in UTC, filter boundaries computed in the SuperAdmin browser.
- L7 (verbatim): "adiciona ese campo tambien. Dale como toca con rdd por cada commit"
