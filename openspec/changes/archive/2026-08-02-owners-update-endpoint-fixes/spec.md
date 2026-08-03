# Delta Spec: owners-update-endpoint-fixes

Fixes 14 bugs in `PUT /api/v1/Owners/{id}` across 6 capabilities. Source: proposal.md → Modified Capabilities.

## Delta for owners (E2E contract)

### MODIFIED Requirements

#### Requirement: R5: PUT /api/v1/Owners/{id}

The system MUST persist FullName/IsActive/User.CellPhone/User.Email changes on a valid update and return HTTP 200 with a `ResponseResult<OwnerDto>` envelope (Data = updated `OwnerDto`). MUST return HTTP 404 for a nonexistent owner. MUST return 400 with property code for invalid input.
(Previously: returned 200 `ResponseResult<bool>`; nonexistent owner returned 400 `Code == "Id"` via validator; User navigation changes silently dropped)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Happy update | Existing owner | `PUT` `FullName="Updated"`, `IsActive=false` | 200; `Data` is `OwnerDto`; DB reflects changes incl. `User.FullName` |
| 2 | Nonexistent ID | Random GUID | `PUT` with valid body | 404 (was 400, `Code == "Id"`) |
| 3 | Empty FullName | Existing owner | `PUT` `FullName: ""` | 400, `Code == "FullName"` |
| 4 | Invalid Email | Existing owner | `PUT` `Email: "not-an-email"` | 400, `Code == "Email"` |
| 5 | OwnerAdmin denied (403) | OwnerAdmin actor, seeded owner | `PUT` with valid body | 403 via `[HasPermission(OwnersAdmin)]` filter — feature grants SuperAdmin+ReSeller only; no write |
| 6 | Cross-tenant IDOR | Non-SuperAdmin actor, owner in other tenant | `PUT` with valid body | 404 envelope; no write |

#### Requirement: R8: Update Validation Gaps

The system MUST return 400 with property code for empty CellPhone. MUST return 400 (not NRE/500) when `ReSellerId` references a nonexistent ReSeller — check moved from validator to handler null guard.
(Previously: validator `MustAsync(ReSellerExists)` produced the 400)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Empty CellPhone | Existing owner | `PUT` `CellPhone: ""` | 400, `Code == "CellPhone"` |
| 2 | Nonexistent ReSellerId | Existing owner | `PUT` `ReSellerId: Guid.NewGuid()` | 400, `Code == "ReSellerId"`; no NRE |

## Delta for command-handler

### ADDED Requirements

#### Requirement: OU-CH1 — Null Guard Returns Envelope 404 (No NRE/500)

The handler MUST fetch via `GetOwnerWithUserTrackedAsync(request.Id)` into `Owner? owner` and MUST return `ResponseResult.Failure<OwnerDto>(OwnerErrors.NotFound, 404)` when null (controller maps to HTTP 404) — never dereference `owner.User`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Nonexistent owner | Owner absent | Handler fetches | Envelope 404; no 500 |
| 1b | Existing owner | Owner present | Handler fetches | Non-null; proceeds |

#### Requirement: OU-CH2 — Tenant-Scope Check (SuperAdmin Bypass)

Non-SuperAdmin actors MUST be blocked when `owner.TenantId != _httpContextService.TenantId` → envelope 404 (anti-enumeration). SuperAdmin MUST bypass.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Cross-tenant OwnerAdmin | OwnerAdmin; TenantId ≠ claim | Handler checks | 404 envelope; no write |
| 2b | Same-tenant OwnerAdmin | TenantId == claim | Handler checks | Proceeds |
| 2c | SuperAdmin cross-tenant | SuperAdmin; any tenant | Handler checks | Proceeds |

#### Requirement: OU-CH3 — Auth Gate Denies Non-Granted Actors, Denial → 403

The gate MUST accept only actors granted `OwnersAdmin` (roles SuperAdmin + ReSeller, per `StoreRoleFeatures.OwnersAdmin` annotations) and MUST return 403 on denial — not 400 `OwnerNotFound`. NOTE: an OwnerAdmin-role actor is NOT granted the Owners feature, so the class-level `[HasPermission]` filter returns 403 before the handler runs.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | OwnerAdmin denied | OwnerAdmin actor | Gate evaluates | 403 `ForbidResult`; handler never runs |
| 3b | Denied actor | Actor lacks OwnersAdmin feature | Gate evaluates | 403; no 400 `OwnerNotFound` |

#### Requirement: OU-CH4 — Tracked Persistence (NoTracking Fix)

The handler MUST persist via the `AsTracking()`-loaded entity so `User.FullName/CellPhone/Email` changes are tracked and saved by `SaveChangesAsync` — no silent drop.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | User nav persists | Owner+User loaded tracked | Field changes + `SaveChangesAsync` | DB row reflects FullName/CellPhone/Email |
| 4b | Single query | Any update | Handler executes | Exactly 1 DB round-trip (handler), 0 from validator |

#### Requirement: OU-CH5 — OwnerDto Return

`UpdateOwnerCommand` MUST be `ICommand<OwnerDto>`; handler MUST return `ResponseResult<OwnerDto>` via AutoMapper projection (IMapper + OwnerProfile).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | OwnerDto envelope | Valid update | Handler returns | `Data` is `OwnerDto` with updated fields |

#### Requirement: OU-CH6 — ReSeller Null Guard + Redundant Guard Removal

The handler MUST null-check `GetByIdAsync(reSellerId.Value)` before touching `.DiscountPrice` (ApiException 400, no NPE) and MUST remove the nested `if (reSellerId.HasValue)` inside the outer block.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | ReSeller missing | reSellerId set; ReSeller absent | `UpdateReSellerOwnerAsync` | 400; no NRE/500 |
| 6b | Redundant guard gone | reSellerId set; reSellerOwner exists | Inner branch runs | Updates run without inner HasValue check |

#### Requirement: OU-CH7 — ReSellerOwner Tri-State

Provided reSellerId + existing reSellerOwner → update existing; provided + none → create new; null + existing → delete; null + none → no-op.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7a | Update existing | reSellerId set; reSellerOwner exists | Handler runs | reSellerOwner updated (active, ids, prices) |
| 7b | Create new | reSellerId set; no reSellerOwner | Handler runs | ReSellerOwner row created |
| 7c | Delete | reSellerId null; reSellerOwner exists | Handler runs | ReSellerOwner deleted |
| 7d | No-op | reSellerId null; no reSellerOwner | Handler runs | Nothing created/deleted |

## Delta for validation

### REMOVED Requirements

#### Requirement: VL-O1 — OwnerExists Async Rule + IOwnerRepository Dependency

(Reason: `MustAsync(OwnerExists)` runs a redundant `GetByIdAsync(tenantId)` DB query before the handler's tracked load — a double round-trip; it fails with 400 for nonexistent ids, making the handler's real 404 unreachable. Mirrors `delete-user-endpoint-fixes` VL-D1.)
(Migration: handler single gate, OU-CH1)

The `MustAsync(OwnerExists)` rule, the `OwnerExists` method, the `_ownerRepository` field, its ctor param, and `using Domain.Interfaces.Repositories;` MUST be removed. `ExistsAsync` MUST NOT be added as a replacement.

#### Requirement: VL-O2 — ReSellerExists Async Rule + IReSellerRepository Dependency

(Reason: existence check moved to handler null guard OU-CH6 — single gate keeps the R8 400 contract without NPE.)
(Migration: handler, OU-CH6)

The `MustAsync(ReSellerExists)` rule, the `ReSellerExists` method, the `_reSellerRepository` field, and its ctor param MUST be removed.

### MODIFIED Requirements

#### Requirement: VL-O3 — Structural-Only Validation

The validator MUST keep only structural rules: Id, FullName, CellPhone `NotNull().NotEmpty()`; Email format only when non-empty. MUST issue zero DB queries.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Empty id | `Guid.Empty` | Validation runs | Fails; no DB query |
| 1b | Valid id | Non-empty GUID | Validation runs | Passes structural; no async rule |
| 1c | 404 reachable | Valid GUID, owner absent | Full flow | Exactly 1 query (handler); HTTP 404 |

### RENAMED Requirements

#### Requirement: VL-O4 — OwnerExists Param `tenantId` → `ownerId`

(Reason: the param receives the owner id, misnamed `tenantId` — hides the cross-tenant bug class.)
(Migration: rename the helper param if any existence helper survives; vacuous once VL-O1 deletes the helper.)

## Delta for repository

### ADDED Requirements

#### Requirement: RR-O1 — GetOwnerWithUserTrackedAsync (AsTracking, Owner+User Only)

`IOwnerRepository` MUST add `Task<Owner> GetOwnerWithUserTrackedAsync(Guid id, CancellationToken cancellationToken = default)`. Implementation MUST use `AsTracking()`, `.Include(o => o.User)` only (no ReSellerOwner/Stores chain), and forward the token to `FirstOrDefaultAsync`. The update path MUST stop using `GetOwnerIncludingUserByIdAsync`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Tracked load | Any update | Query executes | `AsTracking()` present; Owner+User loaded; no 5-join chain |
| 1b | Token forwarded | Request with token | Query executes | Token reaches `FirstOrDefaultAsync` |
| 1c | Update path light | Update flow | Repository call | Heavy include method not used on update path |

## Delta for api-controller

### ADDED Requirements

#### Requirement: OC-OU1 — Swagger Documents 200, 400, 401, 403, 404, 500

`UpdatedAsync` MUST declare 200 typed `ResponseResult<OwnerDto>` + `[ProducesResponseType]` for 400, 401, 403, 404, 500 (mirrors `GetOwnerAsync:42-48`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 200 typed | Swagger generated | `UpdatedAsync` inspected | 200 `ResponseResult<OwnerDto>` listed |
| 1b | Five errors | Swagger generated | `UpdatedAsync` inspected | 400, 401, 403, 404, 500 listed |

#### Requirement: OC-OU2 — XML Doc Corrected

Summary MUST read "Updates an owner by id" (was "Updated user by id"); `<param name="id">` and `<returns>` MUST be present.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Summary + docs | Source inspected | `UpdatedAsync` declaration | Correct summary; `<param>` and `<returns>` present |

#### Requirement: OC-OU3 — ActionCode Switch Maps Failures to Real HTTP Statuses

When `Succeeded == false`, `UpdatedAsync` MUST map ActionCode to real HTTP statuses (mirrors `AuthController.cs:35-41`): 400→BadRequest, 401→Unauthorized, 403→Forbidden, 404→NotFound, default→BadRequest; success → `Ok(result)`. Business failures MUST NOT return 200+envelope.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | 404 mapped | Handler failure ActionCode 404 | Action returns | HTTP 404 + envelope |
| 3b | 400 mapped | Validation/handler failure 400 | Action returns | HTTP 400 + envelope |
| 3c | 403 mapped | Auth denial | Action returns | HTTP 403 + envelope |
| 3d | Success | `Succeeded == true` | Action returns | HTTP 200 + `OwnerDto` envelope |

## Delta for auth-authorization

### ADDED Requirements

#### Requirement: AUTH-OU1 — Handler-Level Tenant-Scope Check (SuperAdmin Bypass)

The update handler MUST enforce `owner.TenantId == _httpContextService.TenantId` for non-SuperAdmin actors (per OU-CH2); denial MUST surface as envelope 404 (anti-enumeration). SuperAdmin MUST bypass for any tenant.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Cross-tenant | Non-SuperAdmin; other tenant | Update issued | 404 envelope |
| 1b | SuperAdmin | SuperAdmin; any tenant | Update issued | Bypasses; proceeds |
| 1c | Same tenant | Same-tenant admin | Update issued | Proceeds |

## Verification Criteria

- [ ] E2E: nonexistent → 404; bool→OwnerDto on 200; OwnerAdmin denied (403, no write); `User.FullName` persists
- [ ] Cross-tenant non-SuperAdmin blocked (404 envelope); SuperAdmin bypasses
- [ ] Validator zero DB queries; handler one tracked query
- [ ] ReSeller tri-state (update/create/delete/no-op); no NPE on missing ReSeller
- [ ] Swagger shows 200/400/401/403/404/500; XML doc corrected
