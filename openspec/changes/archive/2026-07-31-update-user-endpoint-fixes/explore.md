# Exploration: update-user-endpoint-fixes

**Change**: `update-user-endpoint-fixes`
**Endpoint**: `PUT /api/v1/users/{id}` — `UsersController.UpdatedAsync` (`backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs:59-66`)
**Date**: 2026-07-31
**Mode**: hybrid (engram + openspec)
**Method**: Every finding re-verified against real source (backend + BOTH frontends). Frontend payload contracts confirmed by reading services, route loaders, and forms. Precedent change `get-user-by-id-endpoint-fixes` (archived) read end-to-end.

---

## Executive Summary

All 9 review findings VERIFIED against source, with three important refinements:

1. **Finding 1 (IDOR) is REAL and currently UNTESTED**: the existing `Update_as_store_user_returns_403` test (`UsersUpdateTests.cs:43-54`) seeds a StoreUser with NO store graph and NO features (`DbTestHelpers.SeedUserWithRoleAsync` — `DbTestHelpers.cs:108-118`), so the 403 comes from the `HasPermission` filter, never reaching the handler. A StoreUser WITH the Profile feature (featureId 70) passes the filter (`HasPermissionAttribute.cs:84` only skips checks for SuperAdmin) and the handler has NO ownership check → can edit ANY user.
2. **Finding 2 (partial update) is WORSE than reported**: the handler sets `user.IsActive = request.IsActive` for SuperAdmin/OwnerAdmin. The Angular profile screen (`edit-profile.component.html:6`) NEVER sends `showActiveControl` → the `isActive` form control is never created (`edit-user-details.component.ts:84-85`) → `formGroup.value.isActive` is `undefined` → dropped from JSON → backend `request.IsActive` defaults to `false` → **an OwnerAdmin editing their own profile DEACTIVATES their own account**. The E2E test `Update_as_super_admin_returns_200` (`UsersUpdateTests.cs:16-28`) sends only `{FullName}` → same corruption (CellPhone=null, Email=null, IsActive=false) and still returns 200.
3. **Frontends ALWAYS send the full object** (all 4 properties) — both React (`profile-http-service.ts:4-9`, `user-http-service.ts:14-19`) and Angular (`user.service.ts:54-63`). They never send partial payloads EXCEPT the Angular profile screen omitting `isActive` (see #2). They never intentionally clear CellPhone/Email to null (they send `''` empty string). The data-loss risk is: (a) the Angular profile bug, (b) the E2E tests' own partial bodies, (c) any raw API client.

---

## A. FRONTEND CONTRACT (CRITICAL)

### React (`frontend-react/`)

| Caller | Service + payload | Target id | isActive |
|--------|-------------------|-----------|----------|
| Profile edit screen | `profileHttpService.updateProfile(userId, {fullName, cellPhone?, email?, isActive})` → PUT `/v1/users/${userId}` (`profile-http-service.ts:4-26`) | **own id** (`edit-profile.tsx:37` — `user.id`) | **echo**: `isActive: user.isActive` (`edit-profile.tsx:41`) — never changed |
| User management edit | `userHttpService.editUser(id, {fullName, cellPhone, email, isActive})` → PUT `/v1/users/${id}` (`user-http-service.ts:14-19,44-50`) | **ANY staff id** from route param (`user-edit.tsx:17,55`) | Always sent; state initialized `initialValues?.isActive ?? true` (`UserDetailsForm.tsx:39`); toggle VISIBLE only when `canToggleActive = isSuperAdmin \|\| isOwnerAdmin` (`user-edit.tsx:22-24`, `UserDetailsForm.tsx:128`) — but value is ALWAYS sent regardless |

**Screens / roles** (React):
- Profile edit: `clientLoader = featureLoader([EFeatures.Profile])` (`edit-profile.tsx:10`) — SuperAdmin/OwnerAdmin bypass, StoreUser/ReSeller need Profile feature (`loaders.ts:63-74`). Always edits SELF.
- User edit: `clientLoader = adminFeatureLoader([EFeatures.Users])` (`user-edit.tsx:12`) — SuperAdmin/OwnerAdmin only (`loaders.ts:87-93`). Edits OTHERS (staff). StoreUser NEVER reaches this screen.

### Angular (`frontend/`)

| Caller | Service + payload | Target id | isActive |
|--------|-------------------|-----------|----------|
| Profile edit | `EditUserDetailsComponent` (`edit-user-details.component.ts`) → `userService.editUser(this.user.id, fullName, cellPhone, email, this.formGroup.value.isActive)` (`:51`) | **own id** (`currentUser`) | **BUG**: `loadForm()` adds `isActive` control ONLY if `showActiveControl && isSuperAdminOrOwnerAdmin` (`:84-85`); `edit-profile.component.html:6` does NOT pass `showActiveControl` → control never created → `value.isActive` = `undefined` → dropped from JSON → backend default `false` → **OwnerAdmin self-edit deactivates self** |
| User management edit | same component with `[showActiveControl]="true"` (`edit-user.component.html:7`) | ANY staff id | control exists → sends boolean |
| Create/update flows | `user.service.ts:54-63` — `requestData = {fullName, cellPhone, email, isActive}` always includes all 4 keys | — | — |

**Routing guards (Angular)**: `management/users/edit/:id` → `AdminAuthGuard` + `EFeatures.Users` (`app-routing.module.ts:308-312` — OwnerAdmin-only feature per `StoreRoleFeatures.cs:187-190`); `profile/edit` → `AuthGuard` + `EFeatures.Profile` (`app-routing.module.ts:320-324`).

### Direct answers (A)

- **Payload shape**: `{fullName, cellPhone, email, isActive}` — React always; Angular always EXCEPT the profile screen omits `isActive` (undefined dropped).
- **Full or partial?**: FULL object. React echoes current `isActive`; user-edit sends the form's toggle.
- **Intentional clear to null?**: NO. Frontends send `''` (empty string) when unset, never JSON null (`edit-profile.tsx:21-23`, `UserDetailsForm` initial values, `edit-user-details.component.ts:79-83` — cellPhone even has `Validators.required`). Nulls only occur when a client sends a partial body (the E2E tests do; the Angular profile screen effectively does for isActive).
- **IsActive in payload?**: YES from both React screens (echo or toggle); Angular user-edit YES, Angular profile edit NO (the bug above).

## B. BUSINESS RULES / OWNERSHIP

- **ProfileAdmin** (`StoreRoleFeatures.cs:182-185`): `[HasRoles(OwnerAdmin, StoreUser, ReSeller)]` + `[HasFeature(Profile)]` + `[HasModule(Management)]`. Business meaning (from frontend routing): **edit YOUR OWN profile**. Both frontends only ever call PUT with the logged-in user's own id from the profile screen.
- **UsersAdmin** (`StoreRoleFeatures.cs:187-190`): `[HasRoles(OwnerAdmin)]` + `[HasFeature(Users)]` + `[HasModule(Management)]`. Business meaning: **manage staff** — the `management/users/edit/:id` screen (Angular + React) is OwnerAdmin-only and edits OTHER users.
- **The backend contract mismatch**: `UpdatedAsync` is gated by `[HasPermission(ProfileAdmin)]` (`UsersController.cs:61`) — the SAME endpoint serves both use cases (self-profile edit AND OwnerAdmin staff edit), but the handler has NO distinction: a StoreUser/ReSeller with Profile feature can edit ANY user, and is even allowed to... well, not toggle IsActive (that's the silent check), but CAN rewrite FullName/Email/CellPhone of any user. No legit business flow requires a non-admin to edit another user's profile — the frontends prove it (only the OwnerAdmin screen edits others).
- **SuperAdmin nuance**: `[HasPermission]` filter SKIPS the feature check for SuperAdmin (`HasPermissionAttribute.cs:84` `if (!_httpContextService.IsSuperAdmin)`), which is why `Update_as_super_admin_returns_200` passes even though ProfileAdmin's HasRoles excludes SuperAdmin.
- **No code path assumes a non-admin edits another user** — confirmed: frontends never do it; `UpdateUserPasswordCommandHandler` (the same feature family) explicitly REQUIRES self-or-admin (`UpdateUserPasswordCommand.cs:49-56`).

## C. EMAIL UNIQUENESS

- **NOT enforced anywhere.** Only `Login` has a unique index: `UserEntityTypeConfiguration.cs:28` `builder.HasIndex(x => x.Login).IsUnique();` — no index on Email.
- **Email is optional everywhere**: `User.cs:18` `public string? Email`; validators check format only `When(x => !string.IsNullOrEmpty(x.Email))` (`RegisterCommandValidator.cs:36-39`, `CreateStoreUserCommandValidator.cs:46-49`, `UpdateUserCommandValidator.cs:26-29`).
- **Only `IsUniqueLoginAsync` exists** (`UserRepository.cs:104-107`, `IUserRepository.cs:11`) — used by Register (`RegisterCommandValidator.cs:47-50`), CreateStoreUser (`CreateStoreUserCommandValidator.cs:57-60`), CreateOwner, CreateReSeller. There is NO email-uniqueness repository method and NO DB constraint.
- Implication: duplicate emails across users are possible today; enforcing uniqueness on UPDATE would be a new invariant that requires handling existing duplicates + a migration. The frontends treat Email as an optional contact field (Angular: `Validators.email` only; React: no required rule). **Recommendation: do NOT add email uniqueness in this change** — it's a separate product decision (would need data cleanup + migration + Create/Register alignment). Out of scope.

## D. CONTRACT OF STATUS CODES

- **Non-existent id → 400 today** via validator: `UpdateUserCommandValidator.cs:17-20` `MustAsync(UserExists)` → `ValidationBehaviour.cs:24-25` throws `ValidationException` → `ErrorHandlerMiddleware.cs:42-47` → HTTP 400. E2E `Update_nonexistent_id_returns_400` asserts BadRequest and passes.
- **Precedent (get-user-by-id-endpoint-fixes, archived)**: KEEP 400 via validator + envelope-404 race guard in handler (`ResponseResult.Failure<T>(UserErrors.NotFound, 404)` — HTTP 200 + body ActionCode 404, `GetUserByIdQuery.cs:27-28`). Spec R2 aligned to 400 at archive.
- **Handler race-guard for Update**: the equivalent is `User user = await _userRepository.GetByIdAsync(request.Id)` (`UpdateUserCommand.cs:45`) with NO null check → NRE → middleware 500 (`ErrorHandlerMiddleware.cs:59-63`). Mirror the precedent: envelope-404 `ResponseResult.Failure<bool>(UserErrors.NotFound, 404)`. (Note: `UserErrors.NotFound` exists — `UserErrors.cs:19`.)
- **Owner-admin / filter-level 403**: `HasPermission` returns `ForbidResult` (`HasPermissionAttribute.cs:95,104`) → HTTP 403. Handler-level auth precedent: `UpdateStoreCommand.cs:71-72` throws `ApiException(Forbidden, 403)`.
- **users-e2e spec contradiction**: R3 row "Non-existent id | SuperAdmin | 404" (`spec.md:60`) contradicts the 400 contract — same D7-style archive-time alignment as R2. MUST be handled at archive.
- **Recommendation**: keep 400 (validator) + envelope-404 (race) — consistent with the verified users GET precedent; do NOT return real 404 for the race (no project precedent for throwing 404 in handlers).

## E. TESTS & VERIFICATION COMMAND

### E2E tests touching PUT /api/v1/users/{id} (ONLY `UsersUpdateTests.cs` — grep confirmed no other file)

| Test | Asserts | Line |
|------|---------|------|
| `Update_as_super_admin_returns_200` | 200 ONLY — body `{FullName}` only (silently corrupts Email/CellPhone/IsActive — demonstrates bug #2) | `UsersUpdateTests.cs:16-28` |
| `Update_as_owner_admin_returns_200` | 200 ONLY — body `{FullName}` only; self-update via `SeedOwnerAdminWithStoreAsync` | `:30-41` |
| `Update_as_store_user_returns_403` | Forbidden — StoreUser WITHOUT features (filter-level 403; never reaches handler; does NOT prove IDOR mitigation) | `:43-54` |
| `Update_without_token_returns_401` | Unauthorized | `:56-62` |
| `Update_empty_body_returns_400` | BadRequest (FullName required) | `:64-76` |
| `Update_nonexistent_id_returns_400` | BadRequest (validator) | `:78-90` |

### EXACT command for ONLY the Update tests (verified working in the archived precedent's verify-report):

```
dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersUpdateTests"
```

(shorthand equivalent used in verify-report.md:20-21: `dotnet test SMCA.WebApi.E2ETests --filter ~UsersUpdateTests` — both work from the workspace root; requires Postgres `smca_test` running.)

Regression command (seed consumers, precedent verify-report.md:21): `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersListTests|FullyQualifiedName~UsersUpdateTests"`.

## F. PRECEDENT PATTERNS (from archived `2026-07-31-get-user-by-id-endpoint-fixes/`)

| Aspect | Pattern | Source |
|--------|---------|--------|
| Validator existence | `new Task<bool> ExistsAsync(Guid id, CancellationToken ct = default)` on `IUserRepository`; impl `_users.IgnoreQueryFilters().AnyAsync(u => u.Id == id, ct)` | `IUserRepository.cs:19`, `UserRepository.cs:99-102` — ALREADY IN PLACE (added by the GET change) |
| Handler null-guard | `User? user = ...; if (user is null) return ResponseResult.Failure<UserDto>(UserErrors.NotFound, 404);` | `GetUserByIdQuery.cs:27-28` |
| ProducesResponseType | 200/400/401/403 on the action, mirror `GetAllUsersAsync:29-32` | `UsersController.cs:28-38` |
| Param naming | `tenantId` → domain name (fix copy-paste) | design.md AD1/design.md:36 |
| E2E conventions | RED→GREEN with a body-asserting test; actor ≠ target to avoid EF fixup; finally-block cleanup (`AuthzSeed.CleanupStoreGraphAsync` + `DbTestHelpers.CleanupUserAsync`); inline DTO shape class (mirror `UserListDtoShape` in `UsersListTests.cs:11-16`) | design.md AD5/AD6, tasks.md T2 |
| Task sequencing | Commit A (tests RED + all code except the fix) → Commit B (the fix → GREEN); verification tasks build/E2E/regression | tasks.md |
| Ownership/authorization questions | **The GET change did NOT touch ownership** (GET is UsersAdmin-only, no IDOR). The relevant ownership precedent lives in `UpdateUserPasswordCommandHandler` (self-or-admin) — see H. | `UpdateUserPasswordCommand.cs:49-56` |
| Unit tests | **The GET change explicitly scoped OUT new unit tests** (verify-report WARNING (a): "No unit tests for ExistsAsync or the handler race-guard null path... static evidence only"). Precedent: E2E-first, unit tests NOT added for handler/validator. | verify-report.md:50 |

## G. REPOSITORY

- `IUserRepository.ExistsAsync(Guid, CancellationToken)` EXISTS (added by GET change): `IUserRepository.cs:19` — `new` hides the base FindAsync-based generic (`GenericRepository.cs:87-91`). Impl: `UserRepository.cs:99-102` — **USES `IgnoreQueryFilters()`** (`_users.IgnoreQueryFilters().AnyAsync(u => u.Id == id, cancellationToken)`).
- **Email-uniqueness query: NONE** (see C).
- `UserErrors` (`UserErrors.cs`) members: `InvalidCredentials` (`Auth.InvalidCredentials`, 401, `:11`), `AccountInactive` (`Auth.AccountInactive`, 403, `:17`), `NotFound` (`User.NotFound`, "El usuario no existe.", `:19`).
- `UpdateAsync` = `Entry.State = Modified` (`GenericRepository.cs:39-43`) → UPDATE all columns; `GetByIdAsync` = `FindAsync` tracked (`GenericRepository.cs:82-85`). The validator's double-query finding (#4) can now be fixed by switching `UserExists` to the existing `ExistsAsync` — **no new interface method needed** (it already exists).
- `GetByIdAsync(request.Id)` returns the TRACKED entity (filtered — tenant/query-filter applies) — race guard needed since validator uses IgnoreQueryFilters but handler uses filtered path (same pattern as GET: unfiltered validator=true → filtered handler=null → 404).

## H. EXISTING OWNERSHIP-CHECK PATTERNS

- **PRIMARY precedent — same feature family**: `UpdateUserPasswordCommandHandler` (`UpdateUserPasswordCommand.cs:49-56`):
  ```csharp
  if (request.UserId == _httpContextService.UserExternalId.ToGuid()) { /* self: verify old password */ }
  else if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
      return ResponseResult.Failure<bool>(UserErrors.InvalidCredentials, (int)HttpStatusCode.BadRequest);
  ```
  → self OR (SuperAdmin/OwnerAdmin) allowed; otherwise envelope failure (400, InvalidCredentials — anti-enumeration). This is the exact "user can only edit self + admins" check to mirror.
- **Handler-level authz (role gate)**: `UpdateStoreCommand.cs:71-72` — `if (!IsSuperAdminOrOwnerAdmin) throw new ApiException(Forbidden, 403)` (real HTTP 403).
- **Self-lookup via UserExternalId**: `GetMeQuery.cs:52-56` (null/empty → NotFound), `SetMyStoreCommand.cs:41`, `GetStoresByCurrentUserQuery.cs:33`.
- **Grep for `request.Id !=`/`UserExternalId ==` in handlers**: only the password handler (above) does an ownership comparison. No filter-level ownership anywhere.

---

## Decisions needed from user (D1–D5)

- **D1 — Ownership check design**: Where and how to block non-admin editing others. Options:
  - **A (recommended)**: Handler guard mirroring `UpdateUserPasswordCommand` — `if (request.Id != _httpContextService.UserExternalId.ToGuid() && !_httpContextService.IsSuperAdminOrOwnerAdmin) return Failure(UserErrors.NotFound or InvalidCredentials, 404 or 400)`. Returns envelope failure (project pattern), no HTTP-status semantics change, no new middleware/filter.
    - 404 vs 400 for the response: GET precedent uses envelope-404 (`UserErrors.NotFound`) for "not found"; password precedent uses envelope-400 (`InvalidCredentials`) for "not allowed". For an IDOR, 404 (pretend it doesn't exist) is the anti-enumeration choice; 403 is the "honest" choice (precedent `UpdateStore` throws real 403 for role denial, but that's a role gate, not ownership).
  - **B**: `ForbidResult`/`ApiException(Forbidden)` in handler → real HTTP 403 (mirrors `UpdateStoreCommand.cs:71-72`). More honest but reveals target existence; needs the E2E to assert 403.
  - **C**: Leave to the authz filter (re-architect features) — overkill; filter is feature-based, not id-based.
  - **Recommendation: A with envelope-404 (UserErrors.NotFound)** — hides existence (anti-enumeration), zero frontend impact (frontends never hit this path), mirrors the GET race-guard code shape. E2E: StoreUser WITH Profile feature editing another user → 200 + `succeeded:false` + ActionCode 404.
- **D2 — Partial update contract**: Frontends send FULL objects, so the real bugs are (1) Angular profile omitting isActive, (2) the handler nulling fields on partial bodies. Options:
  - **A (recommended)**: Keep PUT + full-object DTO, but make the handler null-safe: `if (request.CellPhone is not null) user.CellPhone = request.CellPhone;` (same for Email) — a missing key keeps the old value. FullName stays required (validator already enforces). PLUS fix the Angular profile isActive omission (frontend change — separate or batched?).
  - **B**: PATCH semantics — new endpoint, DTO contract change, both frontends + E2E rework. High effort, no current consumer needs it.
  - **C**: Required-fields DTO (CellPhone/Email non-nullable) — breaks the API contract for clients that legitimately have no phone/email (email is optional in the whole system), and the Angular profile screen can't send cellPhone if user has none (would break).
  - **Recommendation: A** — minimal, keeps contract, frontends already send full objects; the guard also makes the E2E test's partial body harmless. IMPORTANT: the IsActive guard is the same story — see D4.
- **D3 — Email uniqueness**: **Do NOT enforce** — no DB constraint, no repo method, email is optional system-wide (Register/CreateStoreUser only check format), and enforcing on update would need data cleanup + migration + touching Create/Register. Separate product decision, out of scope. (Can document as a known gap.)
- **D4 — Silent IsActive**: The handler's `if (IsSuperAdminOrOwnerAdmin) user.IsActive = request.IsActive;` (`UpdateUserCommand.cs:49-50`) is a REAL deactivation bug for the Angular profile screen (isActive undefined → false → OwnerAdmin deactivates self) and for the E2E super-admin test. Options:
  - **A (recommended)**: Make it null-safe: only apply when the client explicitly sent it. Concretely: make `UpdateUserCommand.IsActive` nullable (`bool?`) and apply `if (IsSuperAdminOrOwnerAdmin && request.IsActive.HasValue) user.IsActive = request.IsActive.Value;` — omitted → unchanged; admins still can toggle via the user-edit screen (which always sends it). Requires Angular profile fix as follow-up (it would now keep the value, which is CORRECT behavior — no deactivation).
  - **B**: Remove IsActive from UpdateUser entirely (admins use POST activate, which exists) — bigger contract change; the user-edit React screen sends it and the users-e2e spec R3 documents IsActive toggles via PUT.
  - **C**: Throw explicit 400 when a non-admin sends IsActive — but non-admins CAN'T send it from the UI, and the Angular profile screen omits it; nobody sends it deliberately except admins → dead validation.
  - **Recommendation: A** (nullable IsActive + HasValue guard). This kills the self-deactivation bug AND the E2E partial-body corruption in one move. (The `bool?` also makes the E2E super-admin test no longer deactivate the actor.)
- **D5 — Tests**:
  - Unit tests: the precedent (GET change) explicitly scoped them OUT (verify-report WARNING (a)); there are NO existing unit tests for UpdateUserCommandHandler/Validator (`Application.Tests` grep = 0). **Recommendation: E2E-first like the precedent; add unit tests only if cheap** — the handler is already wired in DI and the E2E suite covers the matrix. Keep parity with the GET change (no unit tests) unless the orchestrator wants greenfield unit coverage (proposal: optional, low priority).
  - E2E tests to ADD (RED→GREEN capability):
    1. **IDOR**: `AuthzSeed.SeedStoreUserAsync(_f, (int)FeatureType.Profile)` (=70, `FeatureType.cs:82`) actor → PUT a VICTIM user's id (SuperAdmin-seeded or another StoreUser) → assert envelope 404 (D1-A) — RED on current code (200 today), GREEN after the guard. This is the test that actually proves the IDOR.
    2. **Field preservation**: actor updates only `{fullName}` → assert victim's `email`/`cellPhone`/`isActive` unchanged via `GetUserByLoginAsync`/DB read — RED today (nulled), GREEN after D2-A guard.
    3. **IsActive preservation**: SuperAdmin sends body WITHOUT isActive → target stays active — RED today (deactivated), GREEN after D4-A.
    4. **IsActive explicit toggle still works**: SuperAdmin sends `isActive:false` → 200 + deactivated (spec R3 documents this — `spec.md:55`).
    5. **OwnerAdmin edits staff (legit flow)**: OwnerAdmin (UsersAdmin) updates a StoreUser's FullName → 200. Documents the legit business case.
    6. Keep existing 6 tests; `Update_as_super_admin_returns_200`'s partial body becomes harmless after D2/D4 fixes (or update it to send the full body).

## Risks

- **Angular profile isActive omission** is a production data-corruption bug TODAY (OwnerAdmin self-deactivate). The backend null-safe guard (D4-A) fixes the damage even without the Angular change — but the Angular form should ALSO send the current isActive (parity with React) as a separate frontend task.
- **Envelope failures (HTTP 200 + ActionCode)** are invisible to the React/Angular error paths (`api-client` resolves 200) — pre-existing project-wide UX gap (documented in GET explore); the IDOR-guard response will hit this. Acceptable (frontends never trigger it).
- **users-e2e spec R3 contradictions** (`spec.md:60` "Non-existent id → 404" vs 400; R3 has no StoreUser-with-feature row) — align at archive (D7-style) AND add the IDOR row.
- **`ExistsAsync` uses IgnoreQueryFilters** (validator says "exists" but handler's filtered `GetByIdAsync` may return null for cross-tenant) — the race guard absorbs this (same as GET precedent).
- **Dirty working tree**: previous batches left uncommitted deltas (frontend, middleware, Program.cs, specs) — orchestrator must sequence commits carefully (documented in GET verify-report Deviation 3).

## Ready for Proposal

Yes — all 9 findings verified with file:line evidence, frontend contracts confirmed in BOTH frontends, precedent patterns extracted, E2E command verified. The proposal must resolve D1 (ownership response code: envelope-404 recommended) and D4 (nullable IsActive) with the user before spec-writing.
