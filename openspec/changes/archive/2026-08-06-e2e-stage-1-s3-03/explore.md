# Exploration: e2e-stage-1-s3-03 — cross-tenant / cross-store isolation on PUT /v1/users/{id}

**Change**: `e2e-stage-1-s3-03`
**Story**: [S3-03] Listar, editar, activar y dar de baja usuarios — missing .NET E2E assertions (`docs/testing/e2e-stage-1/S3-03.md:50-51`, H-11)
**Endpoint**: `PUT /v1/users/{id}` — `UsersController.UpdatedAsync` (`backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs:59-70`)
**Date**: 2026-08-06
**Mode**: openspec (filesystem artifact only)
**Method**: Every finding anchored to source with `file:line`. The H-11 empirical question is answered by the archived sibling change `2026-08-02-change-password-endpoint-fixes` (E2E-CPW7, RED→GREEN), which exercised the exact same `FindAsync` lookup path against a real database. RESEARCH ONLY — zero code/test modifications.

---

## Executive Summary

`PUT /v1/users/{id}` has **no tenant or store scoping**. The action-level `[HasPermission(ProfileAdmin)]` only gates *role* (any OwnerAdmin passes — `FeatureTypeHandler.cs:19-25`); the handler's single guard is self-or-admin (`UpdateUserCommand.cs:50-51`). The only conceivable barrier — the global tenant query filter on `User` (`UserEntityTypeConfiguration.cs:22-24`) — is **provably bypassed**: `GetByIdAsync` is `FindAsync` (`GenericRepository.cs:82-85`), and the sibling change-password change empirically demonstrated cross-tenant `FindAsync` lookups succeed (RED "200 — cross-tenant reset succeeds via `FindAsync` filter-skip", `openspec/specs/users-e2e/spec.md:598`; verified RED→GREEN on 2026-08-02). The sibling **fixed** that hole with a tenant-scope guard (`UpdateUserPasswordCommand.cs:62-64`); `UpdateUserCommand` still carries it (flagged at `2026-07-31-update-user-endpoint-fixes/explore.md:41`).

**Expected current behavior for cross-tenant PUT: HTTP 200 + `Succeeded=true` + the target's `FullName` IS written** — an IDOR-class defect. Same-tenant cross-store PUT: **HTTP 200 + write** (no store scoping anywhere).

## Current State

### Endpoint + authorization

- `[Authorize]` at class level (`UsersController.cs:21`); action-level `[HasPermission(StoreRoleFeatures.ProfileAdmin)]` (`:65`).
- `FeatureTypeHandler` (`SMCA.WebApi/PolicyCode/FeatureTypeHandler.cs:19-25`): `super_admin` claim OR `admin` claim → succeed. OwnerAdmin ⇒ `admin=true` (`ClaimsTransformerService.cs:43`, via `UserRoleRepository.IsStoreAdmin` :79-88) ⇒ **any OwnerAdmin passes ProfileAdmin without the feature**. (This is why the existing suite's OwnerAdmin update tests never need a feature seed.)
- Controller always `return Ok(await Sender.Send(command))` (`:69`) — **handler envelope failures arrive as HTTP 200 + `ActionCode`**, unlike change-password's post-fix ActionCode→status switch.

### Handler (`Application/Features/UserManagement/Users/Commands/UpdateUser/UpdateUserCommand.cs:44-66`)

```csharp
User? user = await _userRepository.GetByIdAsync(request.Id);          // :46 — FindAsync
if (user is null) return Failure(UserErrors.NotFound, 404);            // :47-48
if (request.Id != _httpContextService.UserExternalId.ToGuid()          // :50
    && !_httpContextService.IsSuperAdminOrOwnerAdmin)
    return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);     // :51
user.FullName = request.FullName;                                      // :53 — NO tenant/store check anywhere
```
`GetByIdAsync` = `_dbContext.Set<User>().FindAsync(id)` (`GenericRepository.cs:82-85`) — **the only read path**. No `IgnoreQueryFilters`, no tenant comparison, no `StoreUser`/`StoreId` inspection.

### The tenant filter — and why it does not protect this path

`UserEntityTypeConfiguration.cs:22-24`: `HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId || _context.IsReSeller && x.Id == _context.CurrentUserId)` — the request-scoped DbContext reads `TenantId` from the caller's `tenant_id` claim (`ClaimsTransformerService.cs:40`, claim set from the caller's own `User.TenantId`).

The filter protects LINQ paths (list: `UserRepository.cs:45-54`; GET-by-id: `:68-71`) but **NOT `FindAsync`**. Empirical proof in this repo: E2E-CPW7 (`users-e2e/spec.md:598-603`, verified in `2026-08-02-change-password-endpoint-fixes/verify-report.md`) — an OwnerAdmin resetting a victim in another tenant returned **HTTP 200 pre-fix** ("cross-tenant reset succeeds via `FindAsync` filter-skip", `explore.md:49` of that change). The fix added the guard at `UpdateUserPasswordCommand.cs:62-64`:

```csharp
if (!_httpContextService.IsSuperAdmin
    && user.TenantId != _httpContextService.TenantId.ToGuid())
    return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);
```

`UpdateUserCommand` has no equivalent. The 07-31 update-user explore.md:117 reading ("GetByIdAsync returns the TRACKED entity (filtered)") is **superseded** by the 08-02 empirical result. Consequence for H-11: **cross-tenant PUT succeeds today** — the S3-03 "404 (filtro aplicado) o 200 (filtro esquivado)" question is answered: 200 (esquivado).

## Affected Areas

- `backend/src/Application/Features/UserManagement/Users/Commands/UpdateUser/UpdateUserCommand.cs` — the scoping gap lives here (no tenant guard; compare `UpdateUserPasswordCommand.cs:62-64`). NOT touched by this change (tests only) — flagged for a future fix change.
- `backend/src/SMCA.WebApi.E2ETests/Users/UsersUpdateTests.cs` — 13 existing tests; the isolation tests MUST NOT duplicate any (see below); new tests go in a NEW file to avoid shifting S3-03's cited line numbers.
- `backend/src/SMCA.WebApi.E2ETests/Infrastructure/` — `UserSeed` (SeedOwnerAdminWithStoreAsync :45-65, SeedUserWithRolesAsync :27-39), `AuthzSeed` (SeedStoreUserAsync :74-104, CleanupStoreGraphAsync :106-123), `DbTestHelpers` (CleanupUserAsync :84-106, CleanupTenantCascadeAsync :108-130, GetUserByLoginAsync :77-82). Cross-tenant victim helper pattern exists privately in `UsersChangePasswordTests.cs:206-218` (`SeedCustomTenantVictimAsync`) — replicate in the new file, do NOT modify that file.
- `docs/testing/e2e-stage-1/S3-03.md:50-51` — the two assertions this change implements.

## Existing Coverage — what NOT to duplicate (question 2)

`UsersUpdateTests.cs` (13 tests, read complete): self/admin/role/permission/validation matrix — `:17,:31,:44,:57,:65,:79,:93,:115,:139,:162,:185,:208,:229`. Closest is `Update_owner_admin_edits_staff_returns_200` (:208-226): owner admin + staff target **both in DefaultTenant, staff has NO store** (`UserSeed.cs:27` "no Owner/Store graph") → same-tenant, not cross-store. **No test updates a user of ANOTHER tenant or ANOTHER store on PUT.** Cross-tenant precedent exists only for other endpoints: `UsersChangePasswordTests.cs:119,181`, `OwnersUpdateTests.cs:102`, `StoresByCurrentUserTests.cs:54`. New tests: `Update_owner_admin_updates_user_in_other_tenant_returns_envelope_404` + `Update_owner_admin_updates_user_in_other_store_returns_200` — no name or scenario collision.

## Seeds & Cleanup Plan (question 3)

No new seed helper required — every piece exists (copy the CPW7 victim pattern into the new file).

**Test 1 — cross-tenant (RED today)**
- Caller: `UserSeed.SeedOwnerAdminWithStoreAsync(_f)` — OwnerAdmin, Store A, **DefaultTenant** (tenant claim = DefaultTenant).
- Target: custom-tenant victim — mirror `UsersChangePasswordTests.cs:206-218`: `Tenant.Create(Guid.NewGuid(), "E2E XTenant", "e2e", UtcNow)` + `User.Create(login, HashPassword("Password123"), ..., tenantId)` + `UserRole.Create(user.Id, (int)RoleType.StoreUser, tenantId)`. Target's `TenantId` = custom tenant ≠ caller's DefaultTenant.
- Cleanup (finally): `DbTestHelpers.CleanupTenantCascadeAsync(_f, tenantId)` then `AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId)` — exact CPW7 order (:135-136). Cascade is FK-safe: StoreRoleFeature → StoreModule → Store → UserRole → Owner → User → Tenant.

**Test 2 — cross-store same-tenant (GREEN today)**
- Caller: `UserSeed.SeedOwnerAdminWithStoreAsync(_f)` — Store A, DefaultTenant.
- Target: `AuthzSeed.SeedStoreUserAsync(_f, grantedFeatureId: null)` — StoreUser of its OWN Store B, same DefaultTenant, real `StoreUser` row (:98) → belongs to a different store than the caller.
- Cleanup (finally): `AuthzSeed.CleanupStoreGraphAsync(_f, oa.StoreId, oa.UserId)` then `AuthzSeed.CleanupStoreGraphAsync(_f, su.StoreId, su.UserId, su.OwnerUserId)` — precedent `UsersUpdateTests.cs:109,248`.

All logins/tenants/stores carry `Guid.NewGuid()` suffixes — unique per run (question 7). DB asserts via `DbTestHelpers.GetUserByLoginAsync` (uses `IgnoreQueryFilters()` — `DbTestHelpers.cs:81`) or inline `IgnoreQueryFilters()` reads (hygiene requirement).

## Request Body Shape (question 5)

`new { FullName = $"Edited by {Guid.NewGuid():N}" }` — minimal partial body; `FullName` required by validator (`UpdateUserCommandValidator.cs:22-24`); omit `Email`/`CellPhone`/`IsActive` (null-safe guards at `UpdateUserCommand.cs:54-57` preserve them). Precedent: `UsersUpdateTests.cs:24` et al.

## Test Shape Recommendation (question 6) — deliberate deviation from the H-10 precedent

**Recommended: two new tests in a NEW file `backend/src/SMCA.WebApi.E2ETests/Users/UsersIsolationTests.cs`** (`[Collection("e2e")]`, ctor `WebAppFixture` — house pattern):

1. **`Update_owner_admin_updates_user_in_other_tenant_returns_envelope_404` — RED invariant test** (asserts the isolation that MUST hold):
   - Assert: HTTP 200 (PUT always `Ok`) + `Succeeded == false` + `ActionCode == 404` + `Errors.ContainSingle(e => e.Code == "User.NotFound")` (mirror `UsersUpdateTests.cs:101-105`) + DB no-write (`GetUserByLoginAsync` → `FullName` unchanged).
   - **Today it returns 200 + `Succeeded=true` + the write happens** → the test is RED, documenting H-11. AUTH-INV-01 precedent ("el rojo es el defecto, no el test", `README.md:60`). The fix (a `UpdateUserPasswordCommand.cs:62-64`-style guard) is a separate change — this change ships tests only.

2. **`Update_owner_admin_updates_user_in_other_store_returns_200` — GREEN characterization** (H-10 style): assert HTTP 200 + `Succeeded=true` + DB `FullName` changed. Documents that isolation is **tenant-only, not store-level** (handler never inspects `StoreUser`/`StoreId`; per `S3-03.md:51` "se espera que funcione. Confirmarlo"). Coupling warning: a future tenant-scope guard must NOT block this legit same-tenant admin path (the CPW3 guard checks `TenantId`, so it won't).

**Why deviate from H-10 (passing characterization with coupling warning) for the cross-tenant case, explicitly:**
- H-10's behavior was **intentional** (dedicated OwnerAdmin branch, `CreateStoreCommand.cs:57-61`). H-11's cross-tenant write is an **unintended IDOR** — `UpdateUserCommand` has zero tenant/store logic.
- The repo already chose the RED-invariant pattern for the **identical `FindAsync` cross-tenant hole** on the sibling endpoint (E2E-CPW7, 2026-08-02) and fixed it with the tenant-scope guard. PUT is the last sibling carrying the hole (`2026-07-31-update-user-endpoint-fixes/explore.md:41`).
- Pinning 200+Succeeded=true GREEN would enshrine the defect as expected behavior and mask the regression when someone fixes it.
- The empirical outcome is **already known** (CPW7 evidence) — no probe needed; the test asserts the invariant directly.

**Decision needed from user (D1)**: the cross-tenant test stays RED until a fix change ships the tenant guard. Verify phase must record a documented `fail` for that one test (pipeline supports `fail`, `sdd-phase-common.md` §C) — or the orchestrator pairs a follow-up fix change. Cross-store test is GREEN immediately.

## Approaches

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| **A. RED invariant cross-tenant + GREEN cross-store (recommended)** | Proves the security invariant; documents H-11 loudly; CPW7/AUTH-INV-01 precedent; cross-store documents missing store scoping | One test RED until a fix change ships; verify phase must record documented fail | Low |
| **B. H-10 style: pin current behavior GREEN (200+Succeeded=true cross-tenant) + coupling warning** | Suite stays green | Enshrines an IDOR as expected behavior; contradicts S3-03's purpose and CPW7 precedent; masks the future fix | Low |
| **C. Bundle the tenant-scope fix in this change** | One change closes H-11 | Scope creep (change is e2e coverage); touches production handler; bigger review | Medium |

## Risks

- **RED test in suite**: `Update_owner_admin_updates_user_in_other_tenant_returns_envelope_404` fails until the guard ships. Documented-red per AUTH-INV-01, but must be explicitly accepted (D1). If the suite must stay green, fall back to B — stated decision, not silent.
- **FindAsync filter-skip coupling**: isolation (when the guard ships) depends on the explicit handler check, NOT on the query filter — `UserEntityTypeConfiguration.cs:22-24` never protected PK lookups. Any future migration of `GetByIdAsync` to `IgnoreQueryFilters` is irrelevant to the guard, but the exploration finding contradicts `2026-07-31-update-user-endpoint-fixes/explore.md:117` — that reading is superseded; do not rely on it.
- **Culture coupling**: never assert localized `Description` (delete-user Batch B regression). Assert status + envelope structure + stable `Code` keys only (`users-e2e/spec.md:629-631`).
- **Do NOT modify existing tests/helpers in use**: `StoreSeed.SeedStoreInNewTenantAsync` is consumed by `StoresByCurrentUserTests.cs:58`; `UsersChangePasswordTests.cs:206` helper is private to that file. New file + copies only.

## Ready for Proposal

Yes. All file:line anchors verified; the H-11 empirical answer is established from the sibling change's RED→GREEN record; the two-test shape, seeds, cleanup and assert forms mirror existing house patterns exactly. Proposal must resolve D1 (accept documented-RED cross-tenant test vs fall back to characterization vs bundle the fix) and D2 (new file `UsersIsolationTests.cs` — recommended, avoids line-number shifts in S3-03's citations and keeps the diff purely additive).
