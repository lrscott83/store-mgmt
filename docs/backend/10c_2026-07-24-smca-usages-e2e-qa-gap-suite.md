# 10c — SMCA.WebApi Usages E2E — QA Gap Suite (net-new vs the `10` implementation plan)

**Date:** 2026-07-24
**Source:** generated with the `api-endpoint-tests` skill (senior-QA, 4 mandatory categories: happy / edge /
error / integration) for all 3 `UsagesController` endpoints, then **deduplicated against
`10_2026-07-24-smca-usages-e2e-implementation-plan.md`**. Only scenarios **not** already in that plan are
listed here.
**Status of each row:** `CONFIRMED` = behavior verified in code; `VERIFY&PIN` = expected status inferred but
must be confirmed at run time and pinned as-is; `BUG-REVEAL` = a defect the test would expose (pin, do not
fix production code in a test task).

> `10b` is reserved for the dead-gate handler unit tests (not created — see the test-plan §5). This file
> (`10c`) is the QA completeness supplement, mirroring how `09c` supplemented `09`.

---

## Endpoint under test — dependencies (no mocking; real in-process pipeline)

- Real Postgres `smca_test`, JWT minted via the app's `IJwtProvider`, full auth pipeline
  (`ClaimsTransformerService` + `HasPermissionAttribute`). These are e2e, not unit — the "mock and assert
  called-with" category collapses into **integration assertions against the DB and the auth pipeline**.

---

## A. `POST /api/v1/usages/store-daily-usage`

### A.1 Happy path (net-new)
| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| A1 | Multiple **all-new** days in one request → every day inserted | `200 Data=true`, row count == N | CONFIRMED |
| A2 | Same day, **two different users**, same store → both inserted (dedup key is `(userId, storeId)`) | 2 rows, both `true` | CONFIRMED |
| A3 | Same day, **same user, two different stores** → both inserted (dedup is per store) | 2 rows | CONFIRMED |
| A4 | `ProfileAdmin` via **OwnerAdmin** role (not StoreUser): OwnerAdmin + Profile(70) + Management → exercises the `IsOwnerAdmin` filter branch (distinct code path from the StoreUser else-branch the plan uses) | `200 Data=true` | CONFIRMED |

### A.2 Edge cases (net-new)
| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| A5 | **Duplicate days within one request** `[D1, D1, D2]` → handler only dedups against DB, not within the request → **two `D1` rows inserted** | `200 Data=true`, 3 rows | BUG-REVEAL |
| A6 | `Saved=false` on every day → handler **never reads `Saved`** → still inserts | `200 Data=true`, row created | BUG-REVEAL (dead field) |
| A7 | `Day` with a **time component** (`"2026-07-20T15:30:00"`) → parsed to that exact instant; a later midnight-`"2026-07-20"` POST is treated as a **different** day (not deduped) | both inserted | CONFIRMED |
| A8 | **Future** `Day` (e.g. year 2999) → no date-range validation → accepted | `200 Data=true` | CONFIRMED |
| A9 | Empty-string `Day` `""` → `DateTime.Parse("")` throws → unhandled | `500` | BUG-REVEAL (missing validation) |
| A10 | **`ActiveDays` property omitted entirely** (`{}` body) → `request.ActiveDays` null → `.Select` NRE | `500` (unless a validator returns 400) | VERIFY&PIN |
| A11 | **Inactive selected store** (store exists but `IsActive=false`) → does `storeRepository.GetByIdAsync` apply an active filter? | `400` if filtered out, else `200` | VERIFY&PIN |

### A.3 Error handling (net-new)
| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| A12 | **Wrong verb** `GET /usages/store-daily-usage` (POST-only route) | `405` | CONFIRMED |
| A13 | **Wrong verb** `PUT /usages/store-daily-usage` | `405` | CONFIRMED |
| A14 | **Malformed JSON** body | `400` (model-binding) | VERIFY&PIN |
| A15 | **Inactive user** with an otherwise-valid minted token → per §9.4 auth pipeline signs out | `401` / `404` | VERIFY&PIN |

### A.4 Integration (net-new)
| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| A16 | Assert the inserted `StoreUsage` row carries the **httpContext-derived** fields (`IpAddress`, `GfDevice`, `GfDeviceId`, `GfSessionId`) — empty strings when no headers are sent (proves the handler wires them, never null) | fields == `""` | CONFIRMED |

---

## B. `GET /api/v1/usages/stores-last-week` and `/stores-last-month`

### B.1 Happy path (net-new)
| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| B1 | **Month** counts reflect seeded usage days (the plan only data-tests *week*) — seed distinct days inside the 30-day window | `count sum >= seeded`, length 30 | CONFIRMED |
| B2 | **All-zero** contract: with no usage in the window the array is all zeros of length 7/30 (assert via a freshly-scoped window if the shared DB allows, else assert every element `>= 0`) | zeros / non-negative | VERIFY&PIN |

### B.2 Edge cases (net-new)
| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| B3 | Usage **outside the window** (8+ days ago for week; 31+ for month) → **not** counted (proves the `AddDays(-LastDays)` filter) | bucket sum excludes it | CONFIRMED |
| B4 | Usage **on the window boundary** (`UtcNow.Date - LastDays`) → included/excluded per the `> lastWeekDay` "after" semantics — pin the off-by-one | pin actual | VERIFY&PIN |
| B5 | `ActiveStoreCount` correctness: seed K **active** + M **inactive** stores → count reflects **active only** | `== active count delta` (assert `>=` for shared-DB safety) | CONFIRMED |

### B.3 Error handling (net-new)
| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| B6 | **Wrong verb** `POST /usages/stores-last-week` (GET-only) | `405` | CONFIRMED |
| B7 | **Wrong verb** `POST /usages/stores-last-month` | `405` | CONFIRMED |

### B.4 Auth (net-new — the plan runs the full 403 matrix only on *week*)
| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| B8 | **Month** as OwnerAdmin → 403 | `403` | CONFIRMED |
| B9 | **Month** as StoreUser → 403 | `403` | CONFIRMED |
| B10 | **Month** as ReSeller → 403 | `403` | CONFIRMED |
| B11 | **Month** malformed token → 401 | `401` | CONFIRMED |
| B12 | **Inactive SuperAdmin** with a minted token on either GET → auth pipeline rejects | `401` / `404` | VERIFY&PIN |

---

## Coverage note (vs the skill's targets)

- **Core handler branches:** the plan already hits every reachable branch of both handlers; this supplement
  pushes to 100% *observable* coverage by adding the within-request dedup gap (A5), the ignored `Saved`
  field (A6), the null-`ActiveDays` path (A10), the window-boundary/outside-window filters (B3/B4), and the
  405/verb + malformed-body error surface (A12–A14, B6/B7).
- **Infra (0% target):** harness/seed helpers are not tested — correct.
- **Duplication:** the 19 plan tests are intentionally **excluded** (listed below).

## Excluded — already covered by `10_...-implementation-plan.md` (do NOT duplicate)

POST: new-day→true+row, duplicate-day→false (PIN), empty-ActiveDays→false (PIN), mixed new+existing dedup,
ProfileAdmin-StoreUser→200, no-selected-store→400, malformed-date→500 (PIN); no-token→401,
no-profile-grant→403, malformed-token→401.
GET: week length-7 (PIN), month length-30 (PIN), week seeded-counts; week no-token→401, month no-token→401,
week malformed-token→401, week owner/store-user/reseller→403.

## Recommended disposition

- **Merge into the plan as `10c` scenarios** the CONFIRMED bug-reveals worth pinning: **A5** (within-request
  dedup), **A6** (`Saved` ignored), **A2/A3** (dedup key), plus **B3** (out-of-window filter) and the
  **405** verb pins (A12/A13, B6/B7) — these are cheap and high-signal.
- **Investigate then pin** the VERIFY&PIN rows (A9–A11, A14/A15, B2/B4/B12) — they depend on unverified
  pipeline behavior (validators, query filters, inactive-user handling).
- **Skip** as low-value for this hybrid/low-logic controller: A8 (future date), A16 (empty context fields) —
  unless you want strict 100% edge coverage.
