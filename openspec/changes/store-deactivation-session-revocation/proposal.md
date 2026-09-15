# Proposal: Store Deactivation Session Revocation

Change: `store-deactivation-session-revocation` · Branch: `qa` · 2026-09-14

## Intent

Deactivating a store must log its users out actively. Today the three flag-flip surfaces revoke nothing: refresh tokens survive (`RefreshCommand.cs:42-98` checks only token state — zombie sessions), and `/me`'s store/owner-inactive branches 404 without blacklisting (`GetMeQuery.cs:77-91`). Cached-profile users ride a 35-day access token untouched. This change supersedes the 2026-09-11 passive contract in `active-store-selection` ("MUST NOT add active session-invalidation") per the user's 2026-09-14 request and approved 4-point plan.

## Scope

### In Scope
1. Active refresh-token revocation at the 3 flag-flip surfaces (SetStoreActivation, DeactivateStore, UpdateStore-SuperAdmin); affected set = `SelectedStoreId == X` ∪ `StoreUser.StoreId == X`; same transaction; only on true→false (A-13 idempotency preserved).
2. `RefreshCommand` hardening: validate user/store/owner `IsActive` (parity with /me) → 401 + revoke presented token.
3. `/me` blacklist parity: store/owner-inactive branches blacklist the caller's jti (same per-jti mechanism as user-inactive) before 404.
4. New E2E files + additive unit tests: only-active-store deactivation (refresh 401, login 403 until reactivation); non-last-store isolation; owner-with-second-active-store unaffected; refresh matrix; /me second call 401.

### Out of Scope
- Offline/roster revocation (roster JWTs carry no persisted jti — inherent limitation).
- Frontend changes (never calls /auth/refresh; /me verdict already lands as logout).
- Owner-deadlock resolution (SuperAdmin recovery stays, A-04/A-05).
- `SelectedStoreId` remap; global IsActive query filter (rejected); multi-node blacklist infra.

## Capabilities

### New Capabilities
- `store-deactivation-session-revocation`: revocation-set definition, flag-flip hooks, refresh validation matrix, /me blacklist parity, E2E proof.

### Modified Capabilities
- `active-store-selection`: replaces "Deactivation Logs Out Store Users Passively" (2026-09-11) — deactivation now revokes actively; passive /me 404 stays defense-in-depth.

## Approach

Affected set computed filter-free (SuperAdmin cross-tenant): new `IUserRepository.GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(X)` ∪ `IStoreUserRepository.GetStoreUsersByStoreIdAsync(X)` (verified usable post-flip; `GetAllUsersByStoreIdIncludingStoreAndRolesAsync` self-filters on Store.IsActive — never use). Revoke via the `RevokeCommand` pattern (`GetActiveByUserIdAsync` + `Revoke()`, one SaveChanges). No migrations. Strict TDD IS active (`openspec/config.yaml` `strict_tdd: true`) — every implementation task pairs with a RED test first. Verified: `AuthMeInactiveStoreOwnerTests` calls /me once post-flip — blacklist parity does not break it.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Application/.../Refresh/RefreshCommand.cs` | Modified | IsActive matrix → 401 + revoke |
| `Application/.../GetMe/GetMeQuery.cs` | Modified | blacklist store/owner branches |
| `Application/.../SetStoreActivation/SetStoreActivationCommand.cs` | Modified | revocation hook (true→false) |
| `Application/.../DeactivateStore/DeactivateStoreCommand.cs` | Modified | revocation hook |
| `Application/.../UpdateStore/UpdateStoreCommand.cs` | Modified | revocation hook (SuperAdmin IsActive) |
| `Domain/Interfaces/Repositories/IUserRepository.cs`, `IRefreshTokenRepository.cs` | Modified | new query methods |
| `Infrastructure/Persistence/Repositories/UserRepository.cs`, `RefreshTokenRepository.cs` | Modified | implement methods |
| `SMCA.WebApi.E2ETests/**` | New files | deactivation-session suite |
| `Application.Tests/**` | Additive | unit tests only |

Production approval: 4-point plan approved 2026-09-14 ("dale") — this table is the approval record.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A-13 same-value PUT idempotency | Med | revoke only on true→false |
| Owner self-revocation (only store) | Med | consistent with A-04; E2E covers |
| Single-node in-memory blacklist | Low | documented; fixture is single-node |
| Reactivation doesn't restore tokens | Certain | spec states re-login required |
| Cached-profile deferred verdict | Certain | offline-first contract; documented |

## Rollback Plan

Revert commits; no schema changes; refresh-token rows are data only. Passive behavior remains as defense-in-depth.

## Dependencies

None external. PostgreSQL `localhost:5432/smca_test` for E2E.

## Success Criteria

- [ ] All 3 surfaces revoke the affected set's active refresh tokens on true→false
- [ ] Refresh with inactive user/store/owner → 401, token revoked
- [ ] /me store/owner-inactive: second call → 401
- [ ] Non-last-store isolation: other stores' users refresh OK (E2E)
- [ ] Only-active-store: owner login 403 until SuperAdmin reactivation (E2E)
- [ ] Backend suite green; zero existing E2E/tests modified
