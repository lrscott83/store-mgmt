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

The system MUST return 200 for an existing owner. MUST return 400 with `Errors[].Code == "OwnerId"` for nonexistent or empty GUID.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Get existing | Seeded owner exists | `GET /{ownerId}` | 200 |
| 2 | Nonexistent ID | Random GUID | `GET /{guid}` | 400, `Code == "OwnerId"` |
| 3 | Empty GUID | `Guid.Empty` | `GET /{0000...}` | 400, `Code == "OwnerId"` |

### R3: POST /api/v1/Owners — Create (DB Integration)

The system MUST persist a new Tenant + User + Owner + UserRole(OwnerAdmin) on success (200, `Data == true`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Full persistence | Authenticated SuperAdmin | `POST` with valid body | 200, `Data == true`; User, Owner, UserRole rows exist |

### R4: POST /api/v1/Owners — Validation

The system MUST return 400 with `Errors[].Code` matching the property name for each invalid field.

| # | Scenario | Code | Input |
|---|----------|------|-------|
| 1 | Empty Login | `Login` | `Login: ""` |
| 2 | Empty Password | `Password` | `Password: ""` |
| 3 | Empty FullName | `FullName` | `FullName: ""` |
| 4 | Empty Cellphone | `Cellphone` | `Cellphone: ""` |
| 5 | Invalid Email | `Email` | `Email: "not-an-email"` |
| 6 | Nonexistent ReSellerId | `ReSellerId` | `ReSellerId: Guid.NewGuid()` |
| 7 | Duplicate Login | `Login` | Login already exists in DB |

### R5: PUT /api/v1/Owners/{id}

The system MUST persist FullName/IsActive changes on valid update (200). MUST return 400 with property code for invalid input.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Happy update | Existing owner | `PUT` with `FullName="Updated"`, `IsActive=false` | 200; DB reflects changes |
| 2 | Nonexistent ID | Random GUID | `PUT` with valid body | 400, `Code == "Id"` |
| 3 | Empty FullName | Existing owner | `PUT` with `FullName: ""` | 400, `Code == "FullName"` |
| 4 | Invalid Email | Existing owner | `PUT` with `Email: "not-an-email"` | 400, `Code == "Email"` |

### R6: DELETE /api/v1/Owners/{id}

The system currently returns 500 for any authorized delete (NRE at `DeleteOwnerCommandHandler.cs:74` — `_storeUserRepository` not injected). Returns 400 for nonexistent ID or ReSeller actor.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Delete returns 500 (bug) | Seeded owner, SuperAdmin | `DELETE /{ownerId}` | 500 (bug-pin) |
| 2 | Nonexistent ID | Random GUID | `DELETE /{guid}` | 400, `Code == "Id"` |
| 3 | ReSeller guard | ReSeller actor, seeded owner | `DELETE /{ownerId}` | 400 (handler gate blocks before NRE) |

### R7: Create as ReSeller (Gap)

The system MUST allow ReSeller actors to create owners (200).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Create by ReSeller | Authenticated ReSeller | `POST` with valid body | 200 |

### R8: Update Validation Gaps

The system MUST return 400 with property code for empty CellPhone and nonexistent ReSellerId on update.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Empty CellPhone | Existing owner | `PUT` with `CellPhone: ""` | 400, `Code == "CellPhone"` |
| 2 | Nonexistent ReSellerId | Existing owner | `PUT` with `ReSellerId: Guid.NewGuid()` | 400, `Code == "ReSellerId"` |

### R9: List includeInactive Toggle (Gap)

The `includeInactive` query param MUST control whether inactive owners appear in results.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | `includeInactive=true` includes inactive | Owner deactivated in DB | `GET /all/true` | Response contains inactive owner by `Id` + `IsActive==false` |
| 2 | `includeInactive=false` excludes inactive | Owner deactivated in DB | `GET /all/false` | Response does NOT contain inactive owner |

## Known Bugs

| Bug | Endpoint | Symptom | Root Cause | Status |
|-----|----------|---------|------------|--------|
| Delete always 500 | DELETE /api/v1/Owners/{id} | InternalServerError on any authorized request | `_storeUserRepository` declared but never injected in `DeleteOwnerCommandHandler` (line 26, 74) | Pinned — fix when injection is corrected |