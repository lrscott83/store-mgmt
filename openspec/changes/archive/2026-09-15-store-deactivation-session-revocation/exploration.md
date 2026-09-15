# Exploration: Store Deactivation → Session Revocation

Change: `store-deactivation-session-revocation` · Branch: `qa` · Date: 2026-09-14 (pass 2 — all file:line claims re-verified independently; one repo-method claim corrected, see "Precise revocation set")
Phase: sdd-explore (READ-ONLY investigation; no code or test files touched)

## Current State

### How sessions work today

- **Access token**: JWT minted by `SMCA.WebApi/Authentication/JwtProvider.cs:18-53`. Claims are ONLY `NameIdentifier` (userId), `Name` (login), `Jti` (random Guid, `JwtProvider.cs:28-33`). **No tenant, no store, no role claims inside the JWT.**
- **Claims enrichment per request**: `SMCA.WebApi/Services/ClaimsTransformerService.cs:21-53` (IClaimsTransformation) re-reads the user, its roles, and `GetUserFeatureIdsForClaims(userId, SelectedStoreId)` from the DB on EVERY authenticated request, adding `tenant_id`, `store_id`, `super_admin`, `admin`, `reseller`, `features` claims. Role resolution (`UserRoleRepository.IsStoreAdmin`, `UserRoleRepository.cs:79-88`) does NOT depend on store activation, but **feature claims DO**: `GetUserFeatureIdsForClaims` (`UserRoleRepository.cs:43-53`) requires `x.Store.IsActive && x.Store.Owner.IsActive` for the SELECTED store.
- **Access-token lifetime**: `TokenLifetimeDays = 35` in both `SMCA.WebApi/appsettings.json:79,91` and `appsettings.Development.json:85`; `JwtProvider.cs:22` falls back to 35 days if unconfigured. `AuthenticationSettings.RefreshTokenExpirationDays` default = 35 (`Application/Abstractions/Authentication/AuthenticationSettings.cs:16`).
- **Blacklist**: `TokenBlacklistService` (`SMCA.WebApi/Services/TokenBlacklistService.cs`) is an **in-memory `IMemoryCache` keyed by jti, registered SINGLETON** (`SMCA.WebApi/Program.cs:55`). Enforcement happens in `OnTokenValidated` (`SMCA.WebApi/Extensions/ServiceExtensions.cs:55-74` — the live copy; `OptionsSetup/JwtBearerOptionsSetup.cs:38-55` holds a duplicate that the AddJwtBearer lambda silently drops, per the comment at ServiceExtensions.cs:57-61). **jti values are NOT persisted anywhere** — access tokens of other users CANNOT be revoked server-side; there is no jti-per-user enumeration. TTL for a blacklist entry = remaining token lifetime.
- **Refresh token**: opaque 32-byte Base64, `RefreshToken` entity (`Domain/Entities/Authentication/RefreshToken.cs`) with `Revoke(replacedByToken)` (`:32-36`), `IsActive` computed (`:18`), persisted in `RefreshTokens` table (no FK on UserId — migration 20260806024450; E2E cleanup must delete rows explicitly, `AuthRefreshTokenLifetimeTests.cs:76-81`). Repository `IRefreshTokenRepository` (`Domain/Interfaces/Repositories/IRefreshTokenRepository.cs`): `GetByTokenHashAsync`, **`GetActiveByUserIdAsync(userId)`** (`:8`), Add/Update/RemoveRange.

### The three gaps the orchestrator identified (all verified)

1. **`GetMeQuery` (`Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs`)**
   - user-inactive → blacklist + 404 `Auth.AccountInactive` (`:70-74` — `BlacklistCurrentTokenAsync()` called first).
   - store-inactive (SELECTED store) → 404 `StoreErrors.Inactive` **WITHOUT blacklist** (`:77-82`).
   - owner-inactive → 404 `OwnerErrors.Inactive` without blacklist (`:84-91`).
   - Store/owner lookups use `IgnoreQueryFilters` (`:79-80`, `:87-88`).
2. **`RefreshCommand` (`Application/Features/Authentication/Commands/Refresh/RefreshCommand.cs:42-98`)** validates ONLY token state (`existingToken.IsActive`, `:50`), then user existence via `GetUserByIdIgnoreQueryFiltersAsync` (`:61`). It NEVER checks `user.IsActive`, `store.IsActive`, or `owner.IsActive` → zombie sessions. It then mints a fresh 35-day access token (`:70`).
3. **Deactivation paths flip `store.IsActive` and revoke nothing**:
   - `SetStoreActivationCommand` (`Application/Features/StoreManagement/Stores/Commands/SetStoreActivation/SetStoreActivationCommand.cs:64-66`) — OwnerAdmin/SuperAdmin, both directions, DefaultStore guarded.
   - `DeactivateStoreCommand` (`.../DeactivateStore/DeactivateStoreCommand.cs:43-45`) — handler class named `DeleteStoreCommandHandler`, SuperAdmin-only at the controller (`StoresController.cs:186`).
   - `UpdateStoreCommand` (`.../UpdateStore/UpdateStoreCommand.cs:104-108`) — `store.IsActive = request.IsActive` SuperAdmin-only inside the handler.
   - No `SelectedStoreId` remap happens on deactivation anywhere (grep over `SelectedStoreId =` finds only CreateStoreUser/Register/SetMyStore/GetMe/roster-mapping — never a deactivation handler).
   - **No DbContext query filter on `Store.IsActive`** — the Store query filter is tenant-only (`Infrastructure/Persistence/EntityConfigurations/StoreEntityTypeConfiguration.cs:18`).

### Blast radius of deactivating store X (precise definition)

Data model facts:
- `StoreUser` (`Domain/Entities/StoreUsers/StoreUser.cs`) is the employee table. `User.StoreUser` is a **1-to-1 reference** (`User.cs:24`; FK on StoreUser.UserId, `StoreUserEntityTypeConfiguration.cs:24-27`) — a user is employed at AT MOST ONE store.
- `Owner.Stores` (`Domain/Entities/Owners/Owner.cs:15`) — an owner can own N stores; `Owner.UserId` → 1 user.
- `User.SelectedStoreId` (`User.cs:25`) — the session's store pointer.

Therefore deactivating store X affects:
1. **Users with `SelectedStoreId == X`** (regardless of employment) — /me 404 (Store.Inactive), RefreshCommand currently lets them refresh (the gap), and — if employed at X — login 403 Store.Inactive (`AuthenticationService.HasActiveStore`, `Application/Services/Authentication/AuthenticationService.cs:96-145`).
2. **StoreUsers employed at X whose SelectedStoreId == X** (the normal case; the seed always sets this, `AuthzSeed.cs:104`) — login blocked until reactivation (StoreUser branch requires `storeUser.Store.IsActive`, `AuthenticationService.cs:125-144`).
3. **The owner of X**: their session dies on /me ONLY IF `SelectedStoreId == X` (GetMeQuery checks the SELECTED store only, `:77-92`). **An owner with SelectedStoreId on another active store keeps a working /me** — verified: /me never iterates Owner.Stores. But their feature claims for X die (`GetUserFeatureIdsForClaims` requires the selected store active — actually only the SELECTED store drives claims), and if X is their only active store, **login is blocked** (`HasActiveStore` OwnerAdmin branch requires `ownerAccount.Stores.Any(s => s.IsActive)`, `AuthenticationService.cs:118-122`). The A-04/A-05 E2E (`Stores/StoreActivationTests.cs:71-120`) pins this: deactivating the only store drops the owner's StoresAdmin claim → they cannot even re-activate; recovery is SuperAdmin's job.
4. **An owner with a second active store** keeps claims (per the A-04 comment, `StoreActivationTests.cs:77-79`) and can re-activate X freely.
5. Edge cases that make a naive "revoke by store membership" query wrong:
   - A user could have `SelectedStoreId == X` but be employed elsewhere (StoreUser row at another store) — must revoke by SelectedStoreId too, not only by StoreUser.
   - A StoreUser at X with `SelectedStoreId` elsewhere is unaffected by /me/refresh (their session store is elsewhere) — a StoreUsers-of-X-only query would over-revoke.
   - The owner's own user: Owner.Stores contains X, but the owner's SelectedStoreId may point elsewhere — see (3).
   - SuperAdmin with SelectedStoreId == X: /me 404s (the store check applies to everyone), but login never blocks (`HasActiveStore` SuperAdmin bypass, `AuthenticationService.cs:98-100`).

**Precise revocation set for deactivating X** = users where `SelectedStoreId == X` UNION `StoreUsers.StoreId == X` (the latter matters only for refresh-token revocation of users whose session is on X but SelectedStoreId was flipped elsewhere after login — belt and braces; the /me and refresh hardening keyed on SelectedStoreId would already cover them at next request). Repo support, verified per method:
- `IStoreUserRepository.GetStoreUsersByStoreIdAsync(storeId, includeInactive)` (`Infrastructure/Persistence/Repositories/StoreUserRepository.cs:64-73`) — **USABLE post-flip**: predicate is StoreId-only, `IgnoreQueryFilters`, no Store.IsActive condition.
- `IUserRepository.GetAllUsersByStoreIdIncludingStoreAndRolesAsync` — **UNUSABLE post-flip (correction, second pass)**: its predicate requires `u.StoreUser.Store.IsActive && u.StoreUser.Store.Owner.IsActive` (`UserRepository.cs:22-29`), so after X flips inactive it returns an empty set. Never use it to compute the affected set.
- No existing repo method queries `User` by `SelectedStoreId` (grep over `Infrastructure/` for `SelectedStoreId ==` → no hits). A new method (e.g. `GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(storeId)`) must be added for the SelectedStoreId half of the union, filter-free for cross-tenant SuperAdmin-driven deactivations.

### Frontend session mechanics (what actually lands as "logout")

- **The frontend NEVER calls `/auth/refresh`** — verified by grep: all `refreshToken` hits are model shapes/test fixtures (`packages/domain/src/models/auth.ts:27`, fixtures). `auth-http-service.ts` has only login/register/getMe. There is no refresh-401 handling to design for; the refresh gap is backend-observable but not frontend-wired.
- **`logout()` is purely local** (`auth-store.ts:465-489`): removes AUTH_MODEL + TRIAL key, clears DEK, redirects. **No call to `/auth/logout` or `/auth/revoke`** (grep verified) — server-side refresh tokens are never revoked on frontend logout; they just rotate/expires.
- **401 is NOT a logout** (offline-first): `api-client.ts:94-131` — a 401 just rejects; the local session is authoritative for its 35-day window. Pinned by `api-client.test.ts:247-270`.
- **The verdict channel is `/me`**: `auth-store.getUserByToken` (`auth-store.ts:134-229`) — cold boot with a **matching cached profile skips /me entirely** (`:161-177` — OFFLINE-FIRST: cached session is authoritative, no backend call); otherwise /me is called and `isSessionRejection` (401/404/SessionRejectedError → `logout()`, `:73-79`, `:210-228`).
- **Route loaders never call /me** (`auth/routes/loaders.ts` — they only read local state). So a deactivation verdict reaches the user ONLY when: cold boot without a matching cache, or an explicit `getUserByToken()` — which `my-stores.tsx:129-134` calls after every activation flip (the `store-list-active-stores` commit behavior: session refresh after deactivation/creation; same at `my-stores.tsx:161-168`, `edit-store.tsx:143-149`, `store-plan.tsx:95-98`, and `switch-store.ts:43` calls getMe directly on store switch).
- **Contract**: `docs/contracts/authenticated-session-redirect.md` — /me 401/404 verdict → logout → /login; only a verdict kills the session; E2E pinning this is untouchable.
- **Deactivation UX**: `my-stores.tsx:87-144` — owner's edit modal rides `updateStore` (name) + `setStoreActivation` (flag), with R-1 confirm dialog on deactivation. SuperAdmin's `/admin/stores` card grid (`admin/stores/components/store-card-list.tsx:20-25`) has **NO activate/deactivate controls** (Angular parity dead-code) — SuperAdmin deactivation happens only via the API/updateStore elsewhere (edit-store.tsx isActive field rides `updateStore`).

### Roster / offline (the non-revocable limitation)

- `ExportOfflineRosterQuery.cs:140-258` already carries `StoreList` with `IsActive` per store for OwnerAdmin rows (`:170-181`, `:246` — the 12f1e426 work) — **no roster work needed beyond what exists**.
- Roster JWTs (`offlineAuthToken`, `:209-217`) are minted per user with no jti persistence → **offline sessions are NOT revocable server-side** until roster expiry (paid: NextDueDate+5d; free: TTL days). An offline user whose store is deactivated keeps working until the roster expires; the roster's `StoreList.IsActive` at least lets the frontend show it. This is an inherent product limitation to note in the proposal, not fix here.

### Login gate (blocked-until-reactivation)

`AuthenticationService.HasActiveStore` (`AuthenticationService.cs:96-145`): OwnerAdmin needs ≥1 active owned store (SelectedStoreId irrelevant at login); StoreUser needs their store active; SuperAdmin always passes; ReSeller checks `reSeller.IsActive` only. `LoginCommand.MapErrorToStatusCode` maps `Store.Inactive`/`Auth.AccountInactive` → 403 (`LoginCommand.cs:204-223`).

## Affected Areas

- `backend/src/Application/Features/Authentication/Commands/Refresh/RefreshCommand.cs` — the zombie-session hole: no user/store/owner IsActive checks.
- `backend/src/Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs:77-91` — store/owner-inactive branches return 404 WITHOUT blacklisting the token (user-inactive branch does blacklist).
- `backend/src/Application/Features/StoreManagement/Stores/Commands/SetStoreActivation/SetStoreActivationCommand.cs` — primary hook point for a revocation step (owner-facing).
- `backend/src/Application/Features/StoreManagement/Stores/Commands/DeactivateStore/DeactivateStoreCommand.cs` + `UpdateStore/UpdateStoreCommand.cs` — the other two flag-flip surfaces.
- `backend/src/Domain/Interfaces/Repositories/IRefreshTokenRepository.cs` + `RefreshTokenRepository.cs` — may need a bulk "revoke active tokens for user set" method (GetActiveByUserIdAsync exists per-user).
- `backend/src/Domain/Interfaces/Repositories/IUserRepository.cs` — may need `GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync(storeId)` (none exists today).
- `backend/SMCA.WebApi/Services/TokenBlacklistService.cs` + `Program.cs:55` — in-memory singleton blacklist (single-node; fine for WebAppFixture E2E, a production multi-node caveat).
- Frontend: NO changes required for the logout mechanics (passive /me verdict path already lands as logout); optional UX note only.

## Approaches

1. **Refresh hardening only (mirror /me checks into RefreshCommand) + /me blacklist parity**
   - Mirror GetMeQuery's three checks in RefreshCommand: `!user.IsActive` → 401 + revoke the presented token; `SelectedStoreId != Empty && store inactive` → 401 (+revoke); owner inactive → 401 (+revoke). Reuse the same error codes (`Auth.AccountInactive`/`Store.Inactive`/`Owner.Inactive`) but map to 401 (refresh endpoint's contract is `Auth.InvalidRefreshToken`-style 401 — `AuthController.cs:44-55` always Unauthorized on failure).
   - Also blacklist the access token (jti) on the store/owner-inactive branches of /me for parity with the user-inactive branch — but /me has the access token in HttpContextService; the refresh endpoint is anonymous and does NOT. Access-token blacklisting in RefreshCommand is impossible (no Authorization header) — instead, revoking the refresh token row is the enforcement.
   - Pros: smallest diff; fixes the zombie session structurally (refresh is the only renewal path; access tokens are 35-day anyway so both gaps must be closed); no new cross-entity queries needed beyond the store/owner lookup; symmetric with /me so behavior is predictable.
   - Cons: does NOT actively revoke EXISTING refresh tokens at deactivation time — a user who never calls refresh keeps their (valid) refresh token until it is next presented; the 35-day access token still authenticates /me-adjacent API calls... actually NO: any authenticated API call other than /me does NOT check store.IsActive — the tenant/feature claims degrade but the request succeeds. Full active revocation needs approach 2's hook.
   - Effort: Low-Medium.

2. **Active revocation at deactivation time (revocation service hook in the 3 flag-flip handlers) + refresh hardening**
   - On `IsActive=false` (SetStoreActivation, DeactivateStore, UpdateStore-SuperAdmin): compute affected user set (`SelectedStoreId == X` UNION `StoreUser.StoreId == X`, filter-free for SuperAdmin cross-tenant reach), revoke all their active refresh tokens (`GetActiveByUserIdAsync` + `Revoke()`, the RevokeCommand.cs:56-68 pattern), single SaveChanges.
   - Pros: closes the gap actively — deactivation kills sessions within one refresh cycle; owner deactivating their only store also kills their OWN refresh tokens (consistent with the A-04 lockout); symmetric blast radius for the "non-last store" scenario (only X's users die).
   - Cons: more surface (3 handlers + a shared service + new repo methods); must be careful about activation-direction (only on true→false) and idempotency; E2E must prove non-last-store isolation.
   - Effort: Medium.

3. **DbContext query filter on Store.IsActive / claims-level enforcement**
   - Add a global filter so inactive stores hide from every query, or deny requests whose claims' StoreId is inactive at middleware level.
   - Pros: structurally impossible to query an inactive store.
   - Cons: WRONG tool — /me, my-stores, roster, and SuperAdmin admin views all legitimately read inactive stores; a global filter would break owner's my-stores listing (GetAllStoresByOwnerUserIdAsync deliberately includes inactive), the StorePlan views, and the archive flows. Rejected.

### Recommendation

**Approach 2 (active revocation) + the refresh hardening of approach 1 as its sibling task.** Rationale:
- The user's stated goal is "deactivating the store logs out all its users." Passive-only hardening (approach 1) leaves existing refresh tokens alive until next presented — a 35-day window where a user who reboots their client with a cached profile never contacts /me either. Active revocation is the only way the deactivation ACT.
- The refresh hardening is still mandatory as defense-in-depth: a token minted before deactivation that is presented after reactivation+deactivation cycles, or a direct API client, must not silently resurrect a session. Both gaps were named by the orchestrator; both are real (verified).
- The shared abstraction exists: RevokeCommand already demonstrates the load-revoke-update-save cycle per user; the new service is "for each affected user, do RevokeCommand's else-branch", wrapped in the deactivation transaction.
- /me blacklist parity for the store/owner branches: cheap and symmetric (GetMeQuery already has the access token in hand); it converts the 404 verdict into a token kill so the SAME access token cannot keep polling. Recommended as part of the change, flagged as an optional scope decision for the proposal.

### Risks

- **Production-code freeze (NON-NEGOTIABLE)**: The repo rule says backend work may only ADD new E2E tests without approval. RefreshCommand.cs, GetMeQuery.cs, and the 3 deactivation handlers are PRODUCTION source — implementing approach 1/2 requires explicit user approval for production-code edits. The E2E side (new tests only) is allowed. The proposal must lead with this approval gate.
- **E2E untouchable**: existing `AuthMeInactiveStoreOwnerTests`, `AuthMeDeactivationTests`, `AuthRefreshTokenLifetimeTests`, `StoreActivationTests` pin current behavior; new coverage must be NEW files. Note `AuthRefreshTokenLifetimeTests` comment about a DOCUMENTED RED (7 vs 35 days) — do not disturb.
- **In-memory blacklist is single-node**: WebAppFixture runs a single node so E2E is valid; production multi-node deployments would let a blacklisted jti pass on other nodes. Out of scope (infra), but must be stated in the design doc.
- **Frontend cached-profile skip**: after deactivation, a user with a matching cached profile on reload will NOT call /me (auth-store.ts:161-177) — they keep working until token expiry OR until an action that calls getUserByToken/getMe (store switch, my-stores save, edit save, cold boot without cache match). Backend revocation cannot force this. The proposal should decide whether to accept this (offline-first product decision) or surface it to the user.
- **Offline/roster users are not revocable** until roster expiry — inherent limitation (no jti persistence for roster JWTs).
- **Reactivation does NOT auto-restore**: revoked refresh tokens stay revoked; users must log in again. Spec must state this.
- **Owner self-lockout interplay**: if revocation includes the owner (SelectedStoreId == X), an owner who deactivates their only store loses their refresh tokens too — consistent with A-04 lockout, but if they still have a valid 35-day access token they can keep making non-/me calls until it blacklists at /me. Blast-radius spec must name this explicitly.
- **Deactivation ordering**: revocation must happen in the same SaveChanges as the flag flip (or after), and only when the flag actually transitions true→false (idempotent flips must not thrash tokens on same-value PUTs — StoreActivationTests A-13 pins 200 on same-value).

### Ready for Proposal

Yes. The orchestrator should tell the user:
1. All prior-analysis claims verified with file:line evidence; no contradictions found — one refinement: the owner's session dies ONLY if their SELECTED store is X (not "one of their stores"); and the frontend NEVER calls /auth/refresh (the refresh-gap fix is backend-only; no frontend refresh-flow work exists or is needed).
2. Two new facts that shape scope: (a) access tokens carry no store claims, and ClaimsTransformer recomputes per-request — so a valid access token keeps authenticating non-/me endpoints after deactivation unless blacklisted; /me blacklist parity on the store/owner branches is therefore a real (optional) scope item; (b) offline roster sessions are non-revocable by design until roster expiry.
3. PRODUCTION-CODE APPROVAL is required before apply (RefreshCommand, GetMeQuery, 3 deactivation handlers, repos). The E2E deliverable (new tests only) does not need that approval but cannot be written meaningfully before the behavior exists (strict TDD: RED first — the new tests fail against current code, which is the point).
4. Open question for the user: should deactivation ALSO blacklist currently-active access tokens? It cannot be done globally (no jti storage), but the /me-verdict path (user hits /me → blacklisted) covers the common flow. This is a design-phase decision.

---

## Evidence appendix (verified file:line index)

- `backend/src/Domain/Entities/Authentication/RefreshToken.cs:16-36` — IsActive computed; Revoke(replacedByToken).
- `backend/src/Domain/Interfaces/Repositories/IRefreshTokenRepository.cs:8` — GetActiveByUserIdAsync.
- `backend/src/Infrastructure/Persistence/Repositories/RefreshTokenRepository.cs:23-28` — active-by-user query.
- `backend/src/SMCA.WebApi/Services/TokenBlacklistService.cs` — IMemoryCache jti blacklist.
- `backend/src/SMCA.WebApi/Program.cs:55` — singleton registration (single node).
- `backend/src/SMCA.WebApi/Extensions/ServiceExtensions.cs:49-89` — live OnTokenValidated blacklist enforcement + OnChallenge 401.
- `backend/src/SMCA.WebApi/OptionsSetup/JwtBearerOptionsSetup.cs:38-55` — duplicate (dropped) events copy.
- `backend/src/SMCA.WebApi/Authentication/JwtProvider.cs:26-33` — claims: NameIdentifier/Name/Jti only; 35-day fallback (:22).
- `backend/src/SMCA.WebApi/Services/ClaimsTransformerService.cs:21-53` — per-request DB-driven claims enrichment.
- `backend/src/Infrastructure/Persistence/Repositories/UserRoleRepository.cs:43-53` — feature claims require Store.IsActive && Owner.IsActive (selected store).
- `backend/src/Application/Features/Authentication/Commands/Refresh/RefreshCommand.cs:42-98` — token-state-only validation.
- `backend/src/Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs:70-92` — three inactive branches; blacklist only on user-inactive (:72).
- `backend/src/Application/Features/Authentication/Commands/Revoke/RevokeCommand.cs:54-71` — revoke-all-for-user pattern.
- `backend/src/Application/Features/Authentication/Commands/Login/LoginCommand.cs:204-223` — error→status mapping (403 Store.Inactive).
- `backend/src/Application/Services/Authentication/AuthenticationService.cs:96-145` — HasActiveStore login gate.
- `backend/src/Application/Features/StoreManagement/Stores/Commands/SetStoreActivation/SetStoreActivationCommand.cs:45-67` — both-directions flag flip; DefaultStore guard.
- `backend/src/Application/Features/StoreManagement/Stores/Commands/DeactivateStore/DeactivateStoreCommand.cs:35-46` — deactivate.
- `backend/src/Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs:104-108` — SuperAdmin-only IsActive in general update.
- `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs:82-91,150-160,180-190` — activation / update / deactivate (SuperAdmin) endpoints.
- `backend/src/SMCA.WebApi/Controllers/v1/AuthController.cs:44-64,74-94` — refresh (401 contract), revoke, /me (404 mapping).
- `backend/src/Domain/Entities/StoreUsers/StoreUser.cs` + `Infrastructure/Persistence/EntityConfigurations/StoreUserEntityTypeConfiguration.cs:24-29` — 1:1 User↔StoreUser, composite PK (UserId, StoreId).
- `backend/src/Domain/Entities/Users/User.cs:24-25` — StoreUser ref, SelectedStoreId.
- `backend/src/Domain/Common/Entities/AuditableEntity.cs:7,22` — IsActive inherited by Store/User/Owner (default true).
- `backend/src/Infrastructure/Persistence/EntityConfigurations/StoreEntityTypeConfiguration.cs:18` — tenant-only query filter (NOT IsActive).
- `backend/src/Infrastructure/Persistence/Repositories/UserRepository.cs:22-54` — store-scoped user queries (tenant-filtered).
- `backend/src/Infrastructure/Persistence/Repositories/StoreRepository.cs:20-31,75-87` — GetActiveStoresByUserId(AndIgnoreFilters) — owner switch authorization.
- `backend/src/Application/Features/StoreManagement/Stores/Commands/SetMyStore/SetMyStoreCommand.cs:45-50` — switch requires active store.
- `backend/src/Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs:140-258` — roster expiry model, StoreList with IsActive, offlineAuthToken minting (no jti persistence).
- Frontend: `apps/web-store-pos/app/shared/lib/stores/auth-store.ts:73-79,134-229,465-489` (session-rejection verdicts, cached-profile skip, local logout); `app/shared/lib/http/api-client.ts:94-131` (401 ≠ logout); `app/shared/lib/http/auth-http-service.ts:18-50` (no refresh call — login/register/getMe only); `app/management/stores/routes/my-stores.tsx:87-144` (deactivation UX + session refresh); `app/admin/stores/components/store-card-list.tsx:20-25` (SuperAdmin: no activate/deactivate controls).
- E2E: `Auth/AuthMeInactiveStoreOwnerTests.cs` (store/owner inactive → /me 404), `Auth/AuthMeDeactivationTests.cs` (user-inactive via API), `Auth/AuthRefreshTokenLifetimeTests.cs` (refresh rotation; DOCUMENTED RED note), `Stores/StoreActivationTests.cs:71-120` (A-04/A-05 owner lockout + SuperAdmin recovery), `Infrastructure/AuthzSeed.cs` (SeedOwnerAdminAsync/SeedStoreUserAsync/CleanupStoreGraphAsync), `Infrastructure/AuthTestHelpers.cs` (MintToken/BearerClient), `Infrastructure/WebAppFixture.cs` (single node, smca_test, migrations).
- Unit: `Application.Tests/Authentication/Commands/Refresh/RefreshCommandHandlerTests.cs` (mock-repo pattern), `.../Revoke/RevokeCommandHandlerTests.cs:95-150` (revoke-all pattern).
