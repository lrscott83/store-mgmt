# Delta for owners

**Change**: `owners-create-endpoint-fixes`
**Type**: E2E specification delta

## MODIFIED Requirements

### Requirement: R3: POST /api/v1/Owners — Create (DB Integration)

The system MUST persist a new Tenant + User + Owner + UserRole(OwnerAdmin) and return HTTP 201 Created with a `ResponseResult<OwnerDto>` envelope where `Data` carries the created `OwnerDto`.
(Previously: returned 200 OK with `ResponseResult<bool>` and `Data == true`)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Full persistence | Authenticated SuperAdmin | `POST` with valid body | 201; `Data` is `OwnerDto` with created `Id`; User, Owner, UserRole rows exist |

### Requirement: R4: POST /api/v1/Owners — Validation

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

### Requirement: R7: Create as ReSeller (Gap)

The system MUST allow ReSeller actors to create owners and return HTTP 201 Created.
(Previously: returned 200 OK)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Create by ReSeller | Authenticated ReSeller | `POST` with valid body | 201; `Data` is `OwnerDto` |

## ADDED Requirements

### Requirement: OQ-1: Auth Gate — 403 Forbidden for Unauthorized Actors

The system MUST return 403 Forbidden (not 400 "UserNotFound") when an actor without SuperAdmin or ReSeller authorization calls `POST /api/v1/Owners`, mirroring `GetAllOwners`/`GetOwnerById`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Unauthorized actor | Authenticated non-SuperAdmin/non-ReSeller | `POST` with valid body | 403; error code is NOT `UserNotFound` |

### Requirement: OQ-3: Null Guard — Nonexistent ReSeller Returns 400

When `CreateReSellerOwner` finds no ReSeller for the given `ReSellerId` at execution time, the system MUST return 400 with a clear `ApiException` message instead of an NRE/500.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | ReSeller missing at execution | Valid body; ReSeller absent when handler runs | `POST` with `ReSellerId` | 400; clear error message; no 500 |

### Requirement: OQ-4: Password Complexity

The system MUST reject passwords shorter than 8 characters or lacking at least one uppercase letter, returning 400 with `Code == "Password"`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Too short | `Password: "Abc1"` | `POST` | 400, `Code == "Password"` |
| 2 | No uppercase | `Password: "abcdefgh"` | `POST` | 400, `Code == "Password"` |
| 3 | Valid | `Password: "Abcdefgh1"` | `POST` | No `Password` error (validation passes) |
