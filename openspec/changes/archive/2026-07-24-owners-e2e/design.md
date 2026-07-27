# Design: Owners E2E Tests

## Technical Approach

25 tests across 9 files in `SMCA.WebApi.E2ETests/Owners/`, reusing proven E2E infra (WebAppFixture, DbTestHelpers, StoreSeed) with zero new helpers. SuperAdmin actor for standard flow; ReSeller actor (via `DbTestHelpers.SeedUserWithRoleAsync`) for handler-gate assertions. No application code changes.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| New helper class vs inline helpers | Reusability vs cognitive load | **Inline** — each file self-contained; existing patterns (Assert400, Body helpers) are file-static |
| SuperAdmin via SeedSuperAdminAsync vs custom fixture | Consistency vs speed | **SeedSuperAdminAsync** — matches all existing E2E suites; no new patterns |
| ReSeller via AuthzSeed vs SeedUserWithRoleAsync | AuthzSeed couples to Store graph | **SeedUserWithRoleAsync** — lighter; no Store/Module dependencies needed |
| CellPhone vs Cellphone in assertions | Validator mismatch (Create=lower-p, Update=upper-P) | **Match exactly** — Create→`"Cellphone"`, Update→`"CellPhone"` |
| _f vs _factory + _client naming | Existing Auth tests use split fields | **Single `_f` field** — per implementation plan; simplifies constructor |

## Data Flow

```
Test Class ──→ WebAppFixture (Collection Fixture)
                   │
            AppTestFactory
             /          \
    DbTestHelpers    HttpClient (AuthedClient)
       │                    │
    Seed/Cleanup        HTTP Request
       │                    │
    Postgres DB ◄─── OwnersController ──→ Handler ──→ Validator
```

## File Changes

| File | Action | Tests |
|------|--------|-------|
| `Owners/OwnersListTests.cs` | Create | 2 — SuperAdmin list, ReSeller list |
| `Owners/OwnersGetByIdTests.cs` | Create | 3 — happy, nonexistent, empty |
| `Owners/OwnersCreateTests.cs` | Create | 1 — persist (tenant+user+owner+role) |
| `Owners/OwnersCreateValidationTests.cs` | Create | 7 — empty Login/Password/FullName/Cellphone, invalid Email, nonexistent ReSellerId, duplicate Login |
| `Owners/OwnersUpdateTests.cs` | Create | 4 — persist FullName+IsActive, nonexistent Id, empty FullName, invalid Email |
| `Owners/OwnersDeleteTests.cs` | Create | 3 — bug-pin 500, nonexistent Id, ReSeller guard |
| `Owners/OwnersCreateGapTests.cs` | Create | 1 — ReSeller create (200) |
| `Owners/OwnersUpdateGapTests.cs` | Create | 2 — empty CellPhone, nonexistent ReSellerId |
| `Owners/OwnersListGapTests.cs` | Create | 2 — includeInactive true/false |

## Interfaces / Contracts

No new interfaces. Reused API surface:

```
GET    /api/v1/Owners/all/{includeInactive:bool}  → ApiResponse<List<OwnerDto>>
GET    /api/v1/Owners/{id:guid}                    → ApiResponse<OwnerDto>
POST   /api/v1/Owners                              → ApiResponse<bool>  (body: CreateOwnerCommand)
PUT    /api/v1/Owners/{id:guid}                    → ApiResponse<bool>  (body: UpdateOwnerCommand)
DELETE /api/v1/Owners/{id:guid}                    → ApiResponse<bool>
```

**Validation error format**: `400 { Errors: [{ Code: "PropertyName", Description: "message key" }] }`
**Handler gate rejection**: `400 ApiException` (before handler logic)
**Bug-pin**: Delete returns `500` (NRE in `DeleteOwnerCommandHandler` line 74; `_storeUserRepository` never injected)

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| E2E | All 5 endpoints | Real Postgres (`smca_test`), `[Collection("e2e")]`, try/finally cleanup |
| E2E | Validation | Assert 400 + `Errors[].Code` == property name |
| E2E | Handler gates | ReSeller actor for List/Create/Update (200) and Delete (400) |
| E2E | Bug pin | Delete asserts 500 with comment referencing the injection bug |

**Cleanup contracts**:
- Owner fixtures → `StoreSeed.CleanupOwnerAsync(_f, ownerId, userId)`
- New tenants (via CreateOwnerService) → `DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId)`
- Actor users → `DbTestHelpers.CleanupUserAsync(_f, userId)`

## Migration / Rollout

No migration required. Tests are additive — no existing code changes.

## Open Questions

None — all decisions are resolved in the implementation plan and verified against the controller/handler code.
