# Features E2E Specification — As-Built (33 tests)

## Purpose

This spec covers E2E tests for the 3 `FeaturesController` API endpoints (`GET all/{includeInactive}`, `POST activate`, `GET available`) against real Postgres. It defines behavioral, auth, and gap-scenario requirements for **33 tests** across 9 test classes, including the `activate` shared-seed snapshot/restore contract and the always-true return pin.

> **Note**: Initial plan estimated 37 tests. 3 scenarios were removed during implementation due to an architecture discovery (class-level `[HasPermission(SuperAdmin)]` filter blocking method-level widening). 1 scenario was corrected (activate return behavior). See each requirement for details.

---

## Requirements

### R1: List features — SuperAdmin returns 200

A SuperAdmin calling `GET /api/v1/Features/all/{includeInactive}` MUST receive `200 OK` with `Succeeded=true` and a non-empty data collection.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1.1 | SuperAdmin lists all features | A SuperAdmin actor exists | They `GET /api/v1/Features/all/true` | Status is `200 OK` and `Succeeded` is `true` and `Data` is not empty |

### R2: List features — includeInactive toggle

The `includeInactive` route parameter SHALL control whether inactive features are included: `true` includes them, `false` excludes them.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2.1 | `true` includes inactive feature | An inactive `Feature` row exists in the seed | A SuperAdmin `GET /api/v1/Features/all/true` | The response `Data` contains the inactive feature by Id |
| 2.2 | `false` excludes inactive feature | The same inactive `Feature` row exists | A SuperAdmin `GET /api/v1/Features/all/false` | The response `Data` does NOT contain that inactive feature |

### R3: Activate features — always-true return pin (corrected)

`POST /api/v1/Features/activate` SHALL mutate the shared seed (Module 6→IsActive=true, Price=1000; Module 5→IsActive=true; Feature 60,50→IsActive=true; Feature 33 created if missing), returning `200 { Data: true }`. **Both calls** return `true` because `FeaturesRepository.UpdateAsync` calls `context.UpdateAsync(entity)` which always marks entities as Modified, making `SaveChangesAsync > 0` even when no values changed. Tests MUST snapshot state BEFORE and restore in `finally`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3.1 | Activate returns 200 true and mutates seed | A SuperAdmin actor exists; seed is snapshotted | They `POST /api/v1/Features/activate` (no body) | Status is `200`, `Data` is `true`, and Statistics.IsActive=true & Price=1000, Dashboard.IsActive=true, TodayReports.IsActive=true, Egress exists; seed is restored in `finally` |
| 3.2 | Both calls return true (always-true pin) | A SuperAdmin actor exists; seed is snapshotted | They POST activate twice | First call returns `Data: true`; second call returns `Data: true`; seed restored in `finally` |

### R4: Available features — SuperAdmin only (StoresAdmin unreachable)

`GET /api/v1/Features/available` SHALL return `200 OK` for SuperAdmin. **StoresAdmin is unreachable** — see note below.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4.1 | SuperAdmin gets available features | A SuperAdmin actor exists | They `GET /api/v1/Features/available` | Status is `200 OK` |
| ~~4.2~~ | ~~StoresAdmin gets available features~~ | **Removed during implementation** — see Architecture Finding | | |

> **Architecture Finding**: `FeaturesController` has a class-level `[HasPermission(SuperAdmin)]` attribute. This filter runs BEFORE method-level filters. The available endpoint's method-level `[HasPermission(SuperAdmin, StoresAdmin)]` never gets a chance to widen — StoresAdmin users are blocked at the class level. StoresAdmin can NEVER reach `/available` via HTTP. Coversation for handler-level permissions is deferred to unit tests (out of scope).

### R5: List endpoint — auth matrix (5 scenarios)

List endpoint SHALL reject unauthorized and unauthorized role actors. The class filter `[HasPermission(SuperAdmin)]` is the gate.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5.1 | No token → 401 | No authentication header | An anonymous client `GET /api/v1/Features/all/true` | Status is `401 Unauthorized` |
| 5.2 | OwnerAdmin → 403 | An OwnerAdmin actor exists | They `GET /api/v1/Features/all/true` | Status is `403 Forbidden` |
| 5.3 | StoreUser → 403 | A StoreUser actor exists | They `GET /api/v1/Features/all/true` | Status is `403 Forbidden` |
| 5.4 | ReSeller → 403 | A ReSeller actor exists | They `GET /api/v1/Features/all/true` | Status is `403 Forbidden` |
| 5.5 | Malformed token → 401 | A request with `Bearer not-a-real-jwt` | The client `GET /api/v1/Features/all/true` | Status is `401 Unauthorized` (auth middleware rejects before filter) |

### R6: Activate endpoint — auth matrix (4 scenarios)

Activate endpoint SHALL reject all non-SuperAdmin actors.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6.1 | No token → 401 | No authentication header | An anonymous client `POST /api/v1/Features/activate` | Status is `401 Unauthorized` |
| 6.2 | OwnerAdmin → 403 | An OwnerAdmin actor exists | They `POST /api/v1/Features/activate` | Status is `403 Forbidden` |
| 6.3 | StoreUser → 403 | A StoreUser actor exists | They `POST /api/v1/Features/activate` | Status is `403 Forbidden` |
| 6.4 | ReSeller → 403 | A ReSeller actor exists | They `POST /api/v1/Features/activate` | Status is `403 Forbidden` |

### R7: Available endpoint — auth matrix (4 scenarios)

Available endpoint widens the filter to `[HasPermission(SuperAdmin, StoresAdmin)]`. However, the class-level `[HasPermission(SuperAdmin)]` filter blocks all non-SuperAdmin users first. It SHALL reject no-token, StoreUser, ReSeller, and bare OwnerAdmin (no Stores feature).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7.1 | No token → 401 | No authentication header | An anonymous client `GET /api/v1/Features/available` | Status is `401 Unauthorized` |
| 7.2 | StoreUser → 403 | A StoreUser actor exists | They `GET /api/v1/Features/available` | Status is `403 Forbidden` |
| 7.3 | ReSeller → 403 | A ReSeller actor exists | They `GET /api/v1/Features/available` | Status is `403 Forbidden` |
| 7.4 | OwnerAdmin (no Stores) → 403 | A bare OwnerAdmin actor (no Stores feature) exists | They `GET /api/v1/Features/available` | Status is `403 Forbidden` |
| ~~7.5~~ | ~~OwnerAdmin (inactive Management) → 403~~ | **Removed** — same class-level filter issue as R4.2. No non-SuperAdmin can reach this endpoint. Redundant with 7.4. | | |

### R8: List endpoint — gap coverage (4 scenarios)

Coverage for non-bool route, DTO shape contract, unordered pin, and malformed token.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 8.1 | Non-bool route → 400/404 | A SuperAdmin actor exists | They `GET /api/v1/Features/all/not-a-bool` | Status is `400 BadRequest` or `404 NotFound` (pin whichever the pipeline returns) |
| 8.2 | DTO shape: Name + ModuleId | A SuperAdmin actor exists | They `GET /api/v1/Features/all/true` | Every `Data` item has a non-empty `Name` and `ModuleId > 0` |
| 8.3 | Result is NOT guaranteed ordered (PIN) | Two features seeded with known Ids (9093, 9094) | A SuperAdmin lists all | The response `Data` contains both Ids; sequence is NOT asserted |
| 8.4 | Malformed token → 401 | A request with `Bearer not-a-real-jwt` | The client `GET /api/v1/Features/all/true` | Status is `401 Unauthorized` |

### R9: Activate endpoint — gap coverage (5 scenarios)

Coverage for Egress create/duplicate, missing row tolerance, verb mismatch, and ignored body.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 9.1 | Activate creates Egress when missing | Egress(33) is deleted; SuperAdmin exists; seed snapshotted | They `POST /api/v1/Features/activate` | Status is `200`; Egress(33) now exists with ModuleId=Inventory(3), Order=71, IsActive=true, AvailableToStore=true; seed restored in `finally` |
| 9.2 | Activate does NOT duplicate Egress | SuperAdmin exists; seed snapshotted | They POST activate twice and check Egress count | `EgressCount` is `1` (single PK row, not duplicated); seed restored in `finally` |
| 9.3 | Activate tolerates missing optional seed row | TodayReports(50) is deleted; SuperAdmin exists; seed snapshotted | They `POST /api/v1/Features/activate` | Status is `200` (null-guard skips missing row, no throw); row recreated and seed restored in `finally` |
| 9.4 | GET on activate route → 405 | No actor needed (unauthenticated) | An anonymous client `GET /api/v1/Features/activate` | Status is `405 MethodNotAllowed` |
| 9.5 | Unexpected request body is ignored | SuperAdmin exists; seed snapshotted | They `POST /api/v1/Features/activate` with `{"junk": true}` body | Status is `200` (body ignored — command is parameterless); seed restored in `finally` |

### R10: Available endpoint — gap coverage (5 scenarios)

Coverage for Administration exclusion, inactive module/feature exclusion, ordering, DTO shape, and verb mismatch.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 10.1 | Excludes Administration module features | An active feature under Administration(1) module is seeded | A SuperAdmin gets available features | The seeded feature Id is NOT in the response |
| 10.2 | Excludes features under inactive module | An active feature under an inactive module (9090) is seeded | A SuperAdmin gets available features | The feature Id is NOT in the response; feature and module cleaned up in `finally` |
| 10.3 | Excludes inactive features | An inactive feature under an active module is seeded | A SuperAdmin gets available features | The inactive feature Id is NOT in the response; cleaned up in `finally` |
| 10.4 | Ordered by Order ascending | Any available features exist | A SuperAdmin gets available features | The `Order` field sequence is in ascending order |
| 10.5 | DTO shape: Name + ModuleId | Any available features exist | A SuperAdmin gets available features | Every item has a non-empty `Name` and `ModuleId > 0` |
| 10.6 | POST on available route → 405 | No actor needed | An anonymous client `POST /api/v1/Features/available` | Status is `405 MethodNotAllowed` |
| ~~10.7~~ | ~~OwnerAdmin with inactive Management → 403~~ | **Removed** — same class-level filter issue. No non-SuperAdmin can reach this endpoint. | | |

---

## Requirements Coverage Matrix — As-Built (33 tests)

| Req | Endpoint | Test Class | Scenarios |
|-----|----------|------------|-----------|
| R1 | `GET all/{includeInactive}` | `FeaturesListTests` | 1.1 |
| R2 | `GET all/{includeInactive}` | `FeaturesListTests` | 2.1–2.2 |
| R3 | `POST activate` | `FeaturesActivateTests` | 3.1–3.2 |
| R4 | `GET available` | `FeaturesAvailableTests` | 4.1 (4.2 removed) |
| R5 | `GET all/{includeInactive}` | `FeaturesListAuthTests` | 5.1–5.5 |
| R6 | `POST activate` | `FeaturesActivateAuthTests` | 6.1–6.4 |
| R7 | `GET available` | `FeaturesAvailableAuthTests` | 7.1–7.4 (7.5 removed) |
| R8 | `GET all/{includeInactive}` | `FeaturesListGapTests` | 8.1–8.4 |
| R9 | `POST activate` | `FeaturesActivateGapTests` | 9.1–9.5 |
| R10 | `GET available` | `FeaturesAvailableGapTests` | 10.1–10.6 (10.7 removed) |
| — | Helper | `FeatureSeed` | Snapshot/restore + gap helpers (shared across R3, R8–R10) |

**Removed scenarios**:
- **4.2**: StoresAdmin — blocked by class-level `[HasPermission(SuperAdmin)]` filter
- **7.5**: OwnerAdmin with inactive Management — same reason, redundant with 7.4
- **10.7**: OwnerAdmin with inactive Management — same reason, redundant with auth matrix

---

## Non-Functional Requirements

None specific. These are E2E tests — performance, scalability, and latency are out of scope.

---

## Pinned Findings (as-built)

1. **activate always returns true**: The `POST activate` endpoint returns `true` on both calls because `FeaturesRepository.UpdateAsync` calls `context.UpdateAsync(entity)` which always marks entities as Modified, making `SaveChangesAsync > 0` even when no values changed. Both calls return `true`. The initial spec expected `false` on second call (non-idempotent pin) — corrected after implementation. (R3.2 pins this.)

2. **Dead handler gates**: Both `activate` and `available` have unreachable `IsSuperAdmin` / `IsSuperAdminOrOwnerAdmin` checks in their handlers. These are impossible to trigger via E2E (the controller filter is at least as strict). They are deferred to handler unit tests (separate task, not in this change). No E2E tests cover these branches.

3. **Class-level filter blocks method-level widening**: `FeaturesController` has `[HasPermission(SuperAdmin)]` at the class level. Method-level `[HasPermission(SuperAdmin, StoresAdmin)]` on `/available` can never widen access because the class filter runs first. StoresAdmin users can NEVER reach any `/api/v1/Features/*` endpoint via HTTP. This affects 3 removed test scenarios (R4.2, R7.5, R10.7) and is a design concern to flag to the team.
