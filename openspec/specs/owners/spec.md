# Owners Endpoints — E2E Specification

## Purpose

E2E tests for all 5 `OwnersController` endpoints (List, GetById, Create, Update, Delete) covering happy paths, validation errors, handler gate role exclusions, and the confirmed delete-500 NRE bug.

## Requirements

### R1: GET /api/v1/Owners/all/{includeInactive}

The system MUST return 200 with `ApiResponse.Succeeded == true` for SuperAdmin and ReSeller actors.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | List as SuperAdmin | Authenticated SuperAdmin | `GET /all/true` | 200, `Succeeded == true` |
| 2 | List as ReSeller | Authenticated ReSeller | `GET /all/false` | 200 |

### R2: GET /api/v1/Owners/{id}

The system MUST return 200 for an existing owner. MUST return an envelope with `Succeeded == false` and `ActionCode == 404` for a nonexistent, well-formed owner GUID (handler-level existence gate). MUST return 400 with `Errors[].Code == "OwnerId"` for an empty GUID (structural validation).
(Previously: nonexistent or empty GUID both returned 400 with `Errors[].Code == "OwnerId"`, produced by the validator's `MustAsync(OwnerExists)` DB check)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Get existing | Seeded owner exists | `GET /{ownerId}` | 200 |
| 2 | Nonexistent ID | Random GUID | `GET /{guid}` | Envelope `Succeeded == false`, `ActionCode == 404`, error `Code == "Owner.NotFound"` |
| 3 | Empty GUID | `Guid.Empty` | `GET /{0000...}` | 400, `Code == "OwnerId"` (structural, unchanged) |

### OQ-2: Validator Performs Structural-Only Validation

`GetOwnerByIdQueryValidator` MUST NOT perform existence checks. It SHALL keep only structural rules (`NotNull`, `NotEmpty` on `OwnerId`) and MUST NOT issue any repository query. The `MustAsync(OwnerExists)` rule, the private `OwnerExists` method, and the `IOwnerRepository` dependency MUST be removed.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Empty GUID rejected | `Guid.Empty` | Validator runs | 400 validation failure, `Code == "OwnerId"` |
| 2b | Zero DB queries | Any request | Validator runs | No repository call issued — validation resolves from request data alone |

### OQ-3: Handler Null Guard

`GetOwnerByIdQueryHandler` MUST guard the repository result: when the owner is null, it MUST return `ResponseResult.Failure<OwnerDto>` with `ActionCode == 404` and error `Code == "Owner.NotFound"` — AutoMapper MUST NOT be invoked with a null owner.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Null result | Repository returns null | Handler executes | `Failure(404)` returned; mapping never runs |
| 3b | Non-null mapped | Repository returns owner | Handler executes | `Success(ownerDto)` with all navigation properties resolved |

### R3: POST /api/v1/Owners — Create (DB Integration)

The system MUST persist a new Tenant + User + Owner + UserRole(OwnerAdmin) and return HTTP 201 Created with a `ResponseResult<OwnerDto>` envelope where `Data` carries the created `OwnerDto`.
(Previously: returned 200 OK with `ResponseResult<bool>` and `Data == true`)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Full persistence | Authenticated SuperAdmin | `POST` with valid body | 201; `Data` is `OwnerDto` with created `Id`; User, Owner, UserRole rows exist |

### R4: POST /api/v1/Owners — Validation

The system MUST return 400 with `Errors[].Code` matching the property name for each invalid field. Duplicate login MUST return 409 Conflict.
(Previously: duplicate login returned 400 with `Code == "Login"`)

| # | Scenario | Code | Input | THEN |
|---|----------|------|-------|------|
| 1 | Empty Login | `Login` | `Login: ""` | 400 |
| 2 | Empty Password | `Password` | `Password: ""` | 400 |
| 3 | Empty FullName | `FullName` | `FullName: ""` | 400 |
| 4 | Empty Cellphone | `Cellphone` | `Cellphone: ""` | 400 |
| 5 | Invalid Email | `Email` | `Email: "not-an-email"` | 400 |
| 6 | Nonexistent ReSellerId | `ReSellerId` | `ReSellerId: Guid.NewGuid()` | 400 |
| 7 | Duplicate Login | `Login` | Login already exists in DB | 409 |

### R5: PUT /api/v1/Owners/{id}

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

### R6: DELETE /api/v1/Owners/{id}

The system currently returns 500 for any authorized delete (NRE at `DeleteOwnerCommandHandler.cs:74` — `_storeUserRepository` not injected). Returns 400 for nonexistent ID or ReSeller actor.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Delete returns 500 (bug) | Seeded owner, SuperAdmin | `DELETE /{ownerId}` | 500 (bug-pin) |
| 2 | Nonexistent ID | Random GUID | `DELETE /{guid}` | 400, `Code == "Id"` |
| 3 | ReSeller guard | ReSeller actor, seeded owner | `DELETE /{ownerId}` | 400 (handler gate blocks before NRE) |

### R7: Create as ReSeller (Gap)

The system MUST allow ReSeller actors to create owners and return HTTP 201 Created.
(Previously: returned 200 OK)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Create by ReSeller | Authenticated ReSeller | `POST` with valid body | 201; `Data` is `OwnerDto` |

### OQ-1: Auth Gate — 403 Forbidden for Unauthorized Actors

The system MUST return 403 Forbidden (not 400 "UserNotFound") when an actor without SuperAdmin or ReSeller authorization calls `POST /api/v1/Owners`, mirroring `GetAllOwners`/`GetOwnerById`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Unauthorized actor | Authenticated non-SuperAdmin/non-ReSeller | `POST` with valid body | 403; error code is NOT `UserNotFound` |

### OQ-3: Null Guard — Nonexistent ReSeller Returns 400

When `CreateReSellerOwner` finds no ReSeller for the given `ReSellerId` at execution time, the system MUST return 400 with a clear `ApiException` message instead of an NRE/500.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | ReSeller missing at execution | Valid body; ReSeller absent when handler runs | `POST` with `ReSellerId` | 400; clear error message; no 500 |

### OQ-4: Password Complexity

The system MUST reject passwords shorter than 8 characters or lacking at least one uppercase letter, returning 400 with `Code == "Password"`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Too short | `Password: "Abc1"` | `POST` | 400, `Code == "Password"` |
| 2 | No uppercase | `Password: "abcdefgh"` | `POST` | 400, `Code == "Password"` |
| 3 | Valid | `Password: "Abcdefgh1"` | `POST` | No `Password` error (validation passes) |

### R8: Update Validation Gaps

The system MUST return 400 with property code for empty CellPhone. MUST return 400 (not NRE/500) when `ReSellerId` references a nonexistent ReSeller — check moved from validator to handler null guard.
(Previously: validator `MustAsync(ReSellerExists)` produced the 400)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Empty CellPhone | Existing owner | `PUT` `CellPhone: ""` | 400, `Code == "CellPhone"` |
| 2 | Nonexistent ReSellerId | Existing owner | `PUT` `ReSellerId: Guid.NewGuid()` | 400, `Code == "ReSellerId"`; no NRE |

### R9: List includeInactive Toggle (Gap)

The `includeInactive` query param MUST control whether inactive owners appear in results.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | `includeInactive=true` includes inactive | Owner deactivated in DB | `GET /all/true` | Response contains inactive owner by `Id` + `IsActive==false` |
| 2 | `includeInactive=false` excludes inactive | Owner deactivated in DB | `GET /all/false` | Response does NOT contain inactive owner |

### OQ-1: Auth Gate Returns 403 Forbidden

The `GetAllOwnersQueryHandler` MUST reject an actor that is neither SuperAdmin nor ReSeller with HTTP 403 Forbidden and a meaningful message. It MUST NOT return 400 with "UserNotFound" — the previous behavior, which used a wrong status code and misleading copy for an identity/auth failure.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Unauthorized actor | Authenticated actor, not SuperAdmin/ReSeller | `GET /api/v1/Owners/all/true` | HTTP 403; NOT 400; message does not say "UserNotFound" |
| 1b | Authorized preserved | Authenticated SuperAdmin | `GET /api/v1/Owners/all/true` | HTTP 200, `Succeeded == true` (R1 unchanged) |

### OQ-2: Guid.Empty UserExternalId Guard

For a ReSeller actor whose `UserExternalId` resolves to `Guid.Empty`, the handler MUST return HTTP 400 BEFORE executing any repository query.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Empty identity rejected | ReSeller actor, `UserExternalId == Guid.Empty` | `GET /all/false` | HTTP 400; repository query never executed |

### OQ-3: Null Repository Result Guard

The handler MUST treat a null repository result as an empty collection before AutoMapper projection, preventing a NullReferenceException.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Null result | Repository returns null | Handler maps result | Empty collection returned; no NRE |

### OQ-4: CancellationToken Forwarding

The handler MUST forward its `CancellationToken` to every repository call it makes.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Token forwarded | Request with cancellation token | Handler calls repository | Token passed to repository method |

## Known Bugs

| Bug | Endpoint | Symptom | Root Cause | Status |
|-----|----------|---------|------------|--------|
| Delete always 500 | DELETE /api/v1/Owners/{id} | InternalServerError on any authorized request | `_storeUserRepository` declared but never injected in `DeleteOwnerCommandHandler` (line 26, 74) | Pinned — fix when injection is corrected |