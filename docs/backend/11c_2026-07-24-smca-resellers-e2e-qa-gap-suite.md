# 11c — SMCA.WebApi ReSellers E2E — QA Gap Suite (net-new vs the `11` design)

**Date:** 2026-07-24
**Source:** generated with the `api-endpoint-tests` skill (senior-QA, 4 categories) for all 5
`ReSellersController` endpoints, then **deduplicated against the presented `11` ReSellers design**
(the intended plan-11 baseline — the `11_...` plan files are not written to disk yet). Only scenarios **not**
in that baseline are listed here; once plan `11` is written, these merge in (as `10c` merged into `10`).
**Status:** `CONFIRMED` = verified in code; `VERIFY&PIN` = expected status inferred, pin the run result;
`BUG-REVEAL` = a defect the test exposes (pin, do not fix in a test task).

> **Baseline reminder — already in the `11` design (NOT repeated here):** List (SA 200, includeInactive
> true/false), GetById (200, nonexistent→400 `ReSellerId`, empty→400), Create (tenant+user+reseller+role DB
> assert, validation Login/Password/FullName/Cellphone/Email + duplicate-login), Update (persist
> FullName/IsActive/discounts, Id-nonexistent→400, FullName/CellPhone/Email, DiscountPrice<0→400,
> PercentDiscountPrice>100→400), Delete (deletes OK, nonexistent→400 `Id`), and the per-endpoint auth matrix
> (401 + owner/storeuser/reseller→403 on every endpoint). All 5 endpoints are `[HasPermission(SuperAdmin)]`.

---

## Dependencies (no mocking — real in-process pipeline)

Real Postgres `smca_test`, JWT via `IJwtProvider`, full auth pipeline, `IHashPasswordService` (Create),
`ISystemConfigurationRepository.GetReSellerPercentDiscountPriceAsync` (Create default). The skill's "mock
and assert called-with" category collapses into **integration assertions against the DB**.

## A. `GET /api/v1/reSellers/all/{includeInactive}`

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| L1 | `all/not-a-bool` — bool route model-binding fails | `400`/`404` (pin actual) | VERIFY&PIN |
| L2 | Every `ReSellerDto` has a non-empty resolved `User` projection (proves `IncludingUser`) + `Id`/`IsActive` | shape assert | CONFIRMED |
| L3 | `all` has **no `OrderBy`** — assert set membership only, never sequence (PIN) | membership | VERIFY&PIN |
| L4 | Wrong verb `POST /reSellers/all/true` (GET-only) | `405` | CONFIRMED |

## B. `GET /api/v1/reSellers/{id}`

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| G1 | `/reSellers/not-a-guid` — Guid route binding fails | `400`/`404` (pin actual) | VERIFY&PIN |
| G2 | Returned `ReSellerDto` exposes the discount fields + mapped `User` (full shape, not just Id) | shape assert | CONFIRMED |

## C. `POST /api/v1/reSellers`

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| C1 | Create **with a valid Email** → persisted on the new `User` | `200`, email stored | CONFIRMED |
| C2 | Create with **null Description** → `200` (handler does `Description ?? ""`) | `200`, description `""` | CONFIRMED |
| C3 | Created `ReSeller` has `DiscountPrice == 0` and `PercentDiscountPrice == the SystemConfiguration default` (`GetReSellerPercentDiscountPriceAsync`) | integration assert | CONFIRMED |
| C4 | Stored `User.Password` is **hashed** (`IHashPasswordService`) — never equals the request password | integration assert | CONFIRMED |
| C5 | `GET /api/v1/reSellers` (bare, no segment) on the POST-only root | `404`/`405` (pin actual) | VERIFY&PIN |

> **Cleanup finding (bake into the Create test):** `DbTestHelpers.CleanupTenantCascadeAsync` does **not**
> remove the `ReSeller` row — the Create test must delete `ReSeller` + `User` + `UserRole` + `Tenant`
> itself, or the row leaks.

## D. `PUT /api/v1/reSellers/{id}`

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| U1 | `PercentDiscountPrice == 100` boundary (`LessThanOrEqualTo(100)` inclusive) | `200` | CONFIRMED |
| U2 | `DiscountPrice == 0` and `PercentDiscountPrice == 0` boundary (`GreaterThanOrEqualTo(0)`) | `200` | CONFIRMED |
| U3 | `PercentDiscountPrice < 0` → the `≥0` leg fires (design only covered `>100`) | `400` code `PercentDiscountPrice` | CONFIRMED |
| U4 | `DiscountPrice` large positive — **no upper bound** on DiscountPrice (only Percent is capped) | `200` | CONFIRMED |
| U5 | `Email == null` → `When(!empty)` skips the email rule | `200` | CONFIRMED |
| U6 | **Route id overrides body id** — controller does `command.Id = id` after `[FromBody]`; PUT reseller A's route with `{Id: B}` in body updates **A**, not B | A updated | CONFIRMED |
| U7 | Empty-guid `{id}` route → validator `NotEmpty`/`ReSellerExists` | `400` code `Id` | CONFIRMED |

## E. `DELETE /api/v1/reSellers/{id}`

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| D1 | **Delete orphans `User` + `UserRole`** — the handler deletes only the `ReSeller` row; assert `User` and `UserRole(ReSeller)` still exist after a successful delete | `200`, orphans remain | BUG-REVEAL |
| D2 | Delete twice — 1st `200`, 2nd → validator `ReSellerExists` fails | 2nd `400` code `Id` | CONFIRMED |
| D3 | Empty-guid `{id}` route | `400` code `Id` | CONFIRMED |

## F. Cross-cutting — dead-gates (documented, not e2e-reachable)

Four redundant handler re-checks, all shielded by the class `[HasPermission(SuperAdmin)]` filter (no e2e
actor passes the filter yet fails the handler check):
- `GetAllReSellersQuery` `if(!IsSuperAdmin) throw 400`.
- `CreateReSellerCommand` `if(!IsSuperAdmin) throw 400`.
- `DeleteReSellerCommand` `if(!IsSuperAdmin) throw 400`.
- `UpdateReSellerCommand` `if(!(IsSuperAdmin || IsReSeller)) throw 400` — the `|| IsReSeller` leg is dead
  (the class filter already requires SuperAdmin). Reachable only by handler unit tests (out of scope, per
  the Usages `10b` decision).

## Coverage note (vs the skill's targets)

- Pushes to 100% *observable* coverage beyond the design: bool/guid route-binding surfaces (L1/G1), the
  405/verb surface (L4/C5), the Create integration invariants (hashed password C4, config-default percent
  C3), the Update boundary + asymmetry rules (U1–U4) and the route-id-wins quirk (U6), and the two DELETE
  data findings (orphans D1, validator idempotency D2).
- **Infra (0% target):** harness/seed helpers untested — correct.
- **Duplication:** the `11` design scenarios are excluded (see the baseline reminder).

## Recommended disposition (when plan `11` is written)

- **Merge as CONFIRMED behavior:** C1–C4, U1–U6, D2/D3, L2/L4, G2 — cheap, high-signal.
- **Pin as bug-reveal:** D1 (delete orphans User+UserRole).
- **VERIFY&PIN (run, observe, pin):** L1, L3, G1, C5 (route-binding / ordering / bare-route status).
