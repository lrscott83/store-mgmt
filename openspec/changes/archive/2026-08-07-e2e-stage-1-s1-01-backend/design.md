# Design: S1-01 backend — close 6 register data-assertion gaps (ADD-ONLY E2E)

Change: `e2e-stage-1-s1-01-backend` · Branch: `feat/e2e-stage-1-s1-01-backend`

## Technical Approach

One new ADD-ONLY test file `Auth/AuthRegisterDataAssertionsTests.cs` (namespace `SMCA.WebApi.E2ETests.Auth`), one `[Fact]` per gap (6 tests), each following the established register → read-DB → cleanup pattern of `AuthRegisterSuccessTests.cs`. Zero production-code changes; zero edits to existing E2E tests (CLAUDE.md). All facts read post-register DB state, so no clock pinning is required (see D3). Docs: flip 6 checkboxes in `S1-01.md:53-59` (apply phase).

## Architecture Decisions

| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| D1 | New file, not extending `AuthRegisterSuccessTests.cs` | Extend existing test | CLAUDE.md: touching existing E2E tests requires explicit authorization; new file is additive and needs none |
| D2 | Fact 4 derives expected ids via DB filter replication | `GET /api/v1/modules/available-to-store` | Endpoint may be auth-gated (`ModulesController`); DB query has no dependency and mirrors `ModuleRepository.cs:17-23` exactly |
| D3 | No `Clock.Pin` anywhere | Pin per test | Facts assert only persisted non-temporal state (`SelectedStoreId`, descriptions, `Approved`, module set, response nulls, ReSellerOwner row); `PaymentStartDate`/`ExpiresIn` already covered elsewhere (`StoreCreationTrialTests.cs:331`, `AuthTokenLifetimeTests.cs:69`) |
| D4 | Fact 6 deletes `ReSellerOwner` explicitly before `CleanupTenantCascadeAsync` | Rely on cascade | `CleanupTenantCascadeAsync` skips ReSellerOwner; FK `ReSellerOwner→Owner` is `Restrict` (`ReSellerOwnerEntityTypeConfiguration.cs:29`) → tenant cleanup would FK-fail or leak. Pattern: `RegisterStorePaymentTests.cs:120-121` |
| D5 | Seeded ReSeller cleaned in its own seed tenant, separate from registered tenant | Same tenant | ReSeller lives in `DataUtils.DefaultTenant.Id` (register tenant is fresh/isolated); FKs `ReSeller→User` and `ReSeller→ReSellerOwner` are `Restrict` (`ReSellerEntityTypeConfiguration.cs:28,33`) |
| D6 | Fact 4 asserts set equality + ≥1 paid + paid-set non-empty precondition | Only set equality | Set equality passes vacuously if catalog has zero qualifying paid modules; the precondition guard makes H-1 regression loud (CLAUDE.md: assert the precondition) |
| D7 | Private helpers in the new file | New shared helper files | Keeps the change fully additive — no modification to `DbTestHelpers.cs`/`BillingSeed.cs`; mirrors `StoreCreationTrialTests.RegisterStoreAsync`/`RegisterStorePaymentTests` private-seed convention |

## Data Flow

```
POST /api/v1/auth/register ──► RegisterCommand ──► DB (owner+store+modules+ReSellerOwner)
        │
        └──► response ApiResponse<AuthDto> (facts 5) / ApiResponse<AuthData>
DB reads: _factory.Services.CreateScope() → ApplicationDbContext
          → IgnoreQueryFilters().AsNoTracking() → scope store by user.TenantId
```

| Fact | Test name | Act | Assert (DB read) |
|---|---|---|---|
| 1 | `Register_sets_SelectedStoreId_to_new_store_id` | register | `user = GetUserByLoginAsync(login)`; `store` by `user.TenantId`; `user.SelectedStoreId == store.Id` |
| 2 | `Register_composes_owner_description_from_store_name` | register | `owner.Description == $"Nombre de la tienda: {storeName}"` |
| 3 | `Register_creates_store_with_test_description_and_not_approved` | register | `store.Description == "Tienda de prueba"`; `store.Approved == false` |
| 4 | `Register_assigns_all_available_modules_including_paid` | register | `storeModuleIds` (by StoreId) `BeEquivalentTo(expectedModuleIds)`; `paidExpectedIds.Should().NotBeEmpty()`; `storeModuleIds ∩ paidExpectedIds` non-empty |
| 5 | `Register_response_has_no_refresh_token` | register | `body.Data.RefreshToken` null; `RefreshTokenExpiresAt` null (deserialize `ApiResponse<AuthDto>`) |
| 6 | `Register_with_reseller_code_creates_ReSellerOwner` | seed ReSeller + register with `Code` | `ReSellerOwner` row: `ReSellerId`, `OwnerId`, `DiscountPrice`/`PercentDiscountPrice` copied from seeded ReSeller |

### Fact 6 sequence

```
1. SeedReSellerAsync(code)  → User(DefaultTenant) + UserRole(ReSeller) + ReSeller(DiscountPrice=0, PercentDiscountPrice=25)
2. POST register { Code = code }              → creates fresh tenant + owner
3. Read ReSellerOwner where OwnerId == owner.Id
   → assert ReSellerId == seeded.Id, discounts == seeded values, TenantId == registered tenant
4. finally: delete ReSellerOwner(ownerId)      (before owner deletion — FK Restrict)
5. CleanupTenantCascadeAsync(registered tenant)
6. delete seeded ReSeller row (seed tenant)    (before user deletion — FK Restrict)
7. CleanupUserAsync(seeded ReSeller userId)    (removes UserRole + User; no Owner seeded)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterDataAssertionsTests.cs` | Create | 6 `[Fact]`s; `[Collection("e2e")]`; ctor `WebAppFixture` → `_factory`/`_client` |
| `docs/testing/e2e-stage-1/S1-01.md:53-59` | Modify | 6 checkboxes `[x]`→`[ ]` + note "verificado por lectura de código; cubierto por `AuthRegisterDataAssertionsTests` tras este change" |

## Interfaces / Contracts

Private helpers (in-file, additive):

```csharp
private sealed record Registered(Guid UserId, Guid TenantId, Guid StoreId, Guid OwnerId);
private async Task<Registered> RegisterAsync(string storeName, string? code = null)
    // POST /api/v1/auth/register; 201; ApiResponse<AuthDto>; resolve tenantId via GetUserByLoginAsync;
    // storeId/ownerId via db.Set<Store>/db.Set<Owner> scoped by tenantId.
private async Task<(Guid ReSellerId, Guid UserId)> SeedReSellerAsync(string code)
    // User(User.Create) + UserRole(ReSellerType) + ReSeller.Create(userId, true, 0, 25, DataUtils.DefaultTenant.Id, "E2E ReSeller")
```

Fact 4 expected-set query (replicates `ModuleRepository.cs:17-23`):

```csharp
var expected = await db.Set<Module>().AsNoTracking()
    .Where(m => m.IsActive && m.AvailableToStore
        && m.Features.Any(f => f.IsActive && f.AvailableToStore))
    .Select(m => m.Id).ToListAsync();                 // Module: Entity<int>, no tenant filter
var paid = await db.Set<Module>().AsNoTracking()
    .Where(m => m.IsActive && m.AvailableToStore
        && m.Features.Any(f => f.IsActive && f.AvailableToStore) && !m.PriceIncluded)
    .Select(m => m.Id).ToListAsync();
var actual = await db.Set<StoreModule>().IgnoreQueryFilters().AsNoTracking() // StoreModule HAS tenant filter
    .Where(sm => sm.StoreId == storeId).Select(sm => sm.ModuleId).ToListAsync();
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| E2E | 6 register data facts | `dotnet test backend/src/SMCA.sln` (PostgreSQL `smca_test`; `WebAppFixture` applies migrations). 6 new `[Fact]`s; existing suite must stay green |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. Single commit: 1 new test file + 1 doc edit; rollback = `git revert`.

## Open Questions

- [ ] None blocking. `S1-01.md` note wording (Spanish) to be confirmed at apply.
