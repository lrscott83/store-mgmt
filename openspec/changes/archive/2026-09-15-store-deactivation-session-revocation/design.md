# Design: Store Deactivation Session Revocation

Change: `store-deactivation-session-revocation` · Branch: `qa` · 2026-09-14

## Technical Approach

Implements the 4-point approved plan as one application-level feature: a shared revocation service hooked into the 3 flag-flip surfaces (point 1), an activation-state matrix in `RefreshCommand` mirroring `/me` (point 2), blacklist parity in `GetMeQuery`'s store/owner branches (point 3), and new E2E/unit tests (point 4). No migrations, no frontend changes, no new infrastructure (per-jti blacklist stays; refresh-token rows are the revocable artifact).

## Architecture Decisions

| # | Decision | Choice | Alternatives rejected | Rationale |
|---|----------|--------|----------------------|-----------|
| 1 | Revocation logic location | Shared `StoreSessionRevocationService` in `Application/Services/Stores` + `Domain/Interfaces/Services/Stores/IStoreSessionRevocationService` (IGetStoreByIdService pattern) | Inline per handler; middleware; domain event | 3 handlers need identical logic; service pattern already exists (`GetStoreByIdService.cs`); testable via Moq like RevokeCommand |
| 2 | Affected-set query | New `IUserRepository.GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(X)` ∪ existing `IStoreUserRepository.GetStoreUsersByStoreIdAsync(X, includeInactive: true)` | `GetAllUsersByStoreIdIncludingStoreAndRolesAsync` (self-filters on Store.IsActive post-flip — unusable); jti enumeration (not persisted) | Filter-free is required for SuperAdmin cross-tenant deactivations; exploration verified both repo predicates |
| 3 | Bulk load of tokens | New `IRefreshTokenRepository.GetActiveByUserIdsAsync(IReadOnlyCollection<Guid>)` | N× `GetActiveByUserIdAsync` | One query for the union set; RevokeCommand's per-token `Revoke()+Update()` staging stays |
| 4 | Atomicity | Handler stages flag flip + service stages token revocations; single `SaveChangesAsync` at handler end (existing UoW pattern) | Separate transaction | Same DbContext scope; deactivation and revocation commit or roll back together |
| 5 | True→false detection | Capture `wasActive = store.IsActive` before mutation; revoke only when `wasActive && !store.IsActive` | Revoke on every deactivate command call | A-13 pins 200 on same-value PUT; idempotent re-deactivation must not re-run (tokens already revoked — harmless but wasteful) |
| 6 | Refresh failure contract | Distinct domain errors (`Auth.AccountInactive`, `Store.Inactive`, `Owner.Inactive`) with 401 status; revoke presented token on each failure branch; null store/owner → skip check (parity with /me's `is not null && !IsActive`) | Single `Auth.InvalidRefreshToken` | Informative codes; controller maps any failure to 401 (`AuthController.cs:48-54`); /me parity in lookups and semantics |
| 7 | Blacklist parity in /me | Reuse existing private `BlacklistCurrentTokenAsync()` — call it before the store-inactive and owner-inactive 404 returns | New blacklist infrastructure | Same per-jti mechanism; spec delta explicitly forbids store-keyed blacklist |

## Data Flow

Deactivation (points 1):

```
my-stores PUT /stores/{id}/activation {isActive:false}
   └▶ SetStoreActivationCommandHandler
        1. wasActive = store.IsActive          (capture BEFORE flip)
        2. store.IsActive = false (staged)
        3. wasActive && !IsActive ─▶ StoreSessionRevocationService.RevokeStoreSessionsAsync(storeId, ct)
              a. userIds ← GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(X)   [new]
              b. storeUserIds ← GetStoreUsersByStoreIdAsync(X, true).Select(su => su.UserId)
              c. distinct union ─▶ GetActiveByUserIdsAsync(union)                  [new]
              d. foreach token: token.Revoke(); _refreshTokenRepository.Update(token)
        4. SaveChangesAsync  (flag + all token rows — one transaction)
```

Same hook in `DeleteStoreCommandHandler` (after `store.IsActive = false`) and `UpdateStoreCommandHandler` (inside the SuperAdmin block, after `store.IsActive = request.IsActive`).

Refresh hardening (point 2) — inserted between current steps 2 and 3 of `RefreshCommandHandler.Handle`:

```
token state OK → user resolved
  !user.IsActive            → Revoke(existingToken); 401 Auth.AccountInactive
  SelectedStoreId != Empty:
    store (IgnoreQueryFilters):
      store is not null && !store.IsActive → Revoke(existingToken); 401 Store.Inactive
      owner is not null && !owner.IsActive → Revoke(existingToken); 401 Owner.Inactive
  → mint + rotate + save (unchanged)
```

/me parity (point 3): `await BlacklistCurrentTokenAsync();` added before the `StoreErrors.Inactive` and `OwnerErrors.Inactive` returns (`GetMeQuery.cs:82`, `:90`).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `Domain/Interfaces/Services/Stores/IStoreSessionRevocationService.cs` | Create | `Task RevokeStoreSessionsAsync(Guid storeId, CancellationToken ct)` |
| `Application/Services/Stores/StoreSessionRevocationService.cs` | Create | Affected-set union + bulk revoke staging (decisions 2-3) |
| `Domain/Interfaces/Repositories/IUserRepository.cs` + `Infrastructure/.../UserRepository.cs` | Modify | + `GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(Guid)` |
| `Domain/Interfaces/Repositories/IRefreshTokenRepository.cs` + `Infrastructure/.../RefreshTokenRepository.cs` | Modify | + `GetActiveByUserIdsAsync(IReadOnlyCollection<Guid>)` |
| `Application/.../SetStoreActivationCommand.cs` | Modify | wasActive capture + hook |
| `Application/.../DeactivateStoreCommand.cs` | Modify | wasActive capture + hook |
| `Application/.../UpdateStoreCommand.cs` | Modify | wasActive capture + hook (SuperAdmin branch) |
| `Application/.../Refresh/RefreshCommand.cs` | Modify | activation matrix (point 2) |
| `Application/.../GetMe/GetMeQuery.cs` | Modify | 2× blacklist parity |
| `SMCA.WebApi` DI (where `IGetStoreByIdService` registers) | Modify | register the new service |
| `SMCA.WebApi.E2ETests/Stores/StoreDeactivationSessionTests.cs` | Create | point 4 E2E (NEW file) |
| `Application.Tests/**` | Create/additive | unit tests (new files for service/handler hooks; additive methods in `RefreshCommandHandlerTests`) |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Revocation service set-union + staging; 3 handler hooks (true→false only, idempotent skip); Refresh matrix (3× 401+revoke, active rotation intact) | Moq repos, UoW verify — strict TDD: RED first per task |
| E2E | Only-store deactivation → refresh 401s + login 403 + SuperAdmin reactivation → re-login OK; non-last-store isolation; owner-with-2nd-store unaffected; /me second-call 401; refresh inactive-user 401 | NEW suite file; `AuthzSeed` + login-issued refresh tokens; explicit RefreshToken cleanup (no FK) |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. (API surface unchanged: same endpoints, same verbs.)

## Migration / Rollout

No migration required. No feature flag (single deploy; revocation is behavior-additive). Rollback = revert commits; revoked token rows are data-only.

## Open Questions

None — plan approved 2026-09-14. (Pre-existing caveat recorded, not open: single-node in-memory blacklist; offline roster sessions non-revocable until expiry.)
