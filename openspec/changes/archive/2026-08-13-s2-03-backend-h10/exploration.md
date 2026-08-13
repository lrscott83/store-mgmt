# Exploration: H-10 — POST /v1/stores authorization gap (change `s2-03-backend-h10`)

## Current State

`POST /v1/stores` is the only state-changing Stores action WITHOUT an action-level `[HasPermission]`, so it falls back to the class-level gate — and both the gate and the handler deliberately admit OwnerAdmins.

- `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs`
  - Class-level `[HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StoresAdmin)]` (line 27).
  - `POST /v1/stores` → `CreateStoreAsync` (lines 83-91): **no action-level attribute**. Returns `CreatedAtAction` (201) on success, `Ok(result)` (200) on handler-failure.
  - Sibling SuperAdmin-only actions carry `[HasPermission(StoreRoleFeatures.SuperAdmin)]`: `PUT {storeId}/payment-date` (line 113), `DELETE {id}` (line 129), `POST approve` (line 144), `POST disapprove` (line 159).
- `backend/src/Application/Features/StoreManagement/Stores/Commands/CreateStore/CreateStoreCommand.cs`
  - Guard line 50-51: `if (!_httpContextService.IsSuperAdminOrOwnerAdmin) throw new ApiException(_localizer["NotAuthorized"], HttpStatusCode.BadRequest)` → **400, not 403**.
  - Lines 53-55: fetches `owner` by body-supplied `OwnerId` (no tenant-consistency check) and creates via `_createStoreService.CreateStoreAsync(...)` (Store + StoreModules + StoreRoleFeatures; trial clock `PaymentStartDate = today` unconditionally).
  - Lines 57-61: if `IsOwnerAdmin` → `owner.User.SelectedStoreId = store.Id` + `UpdateAsync` (re-point).
- `backend/src/SMCA.WebApi/Services/HttpContextService.cs` — `IsSuperAdmin` = claim `"super_admin"`=="true" (line 45), `IsOwnerAdmin` = claim `"admin"`=="true" (line 46), `IsSuperAdminOrOwnerAdmin` (line 50).
- `backend/src/SMCA.WebApi/Filters/HasPermissionAttribute.cs` — action-level attribute overrides class-level (lines 57-78). For `[HasPermission(SuperAdmin)]`: SuperAdmin short-circuits (line 84); any OwnerAdmin/ReSeller → `srf.GetFeatureType()` is null for `SuperAdmin` (no `[HasFeature]`, `StoreRoleFeatures.cs:9-10`, `StoreRoleFeaturesExtensions.cs:25-29`) → `hasPermission=false` → `ForbidResult()` (line 95) → HTTP 403. StoreUser → `HasUserAnyFeatureInStoreAsync` → false → 403 (line 104). Unauthenticated → 401 (line 112).
- Result today: OwnerAdmin holding the Stores feature (73) passes the class gate → handler admits → **201 + persistence + SelectedStoreId re-point**. StoreUser with feature 73 passes the gate → handler rejects with **400**. Both behaviors are pinned by E2E and by spec:
  - `backend/src/SMCA.WebApi.E2ETests/Stores/StoreCreateAuthorizationGapTests.cs` (both tests, lines 30-61 and 63-85).
  - `openspec/specs/authorization-e2e/spec.md` R2.10 (lines 49-62) and R2.11 (lines 64-75), with explicit coupling notes (lines 53, 68, 91).

**Auto-registration is a SEPARATE path and is NOT affected by any fix**: `RegisterCommand.cs:82` calls `_createStoreService.CreateStoreAsync(...)` directly — never through `CreateStoreCommand`/controller (S1-01 safe). Verified: `AuthRegisterDataAssertionsTests.cs:121-129`, `StoreCreationTrialTests.RegisterStoreAsync` (line 140-172).

**Security dimension**: `StoresAdmin` is an OwnerAdmin management feature (`StoreRoleFeatures.cs:192-195`: `[HasRoles(OwnerAdmin)] [HasFeature(Stores)] [HasModule(Management)]`) — it gates managing the admin's OWN store, not creating arbitrary stores. The sibling destructive/date actions are all SuperAdmin-only. Additionally the handler performs no tenant-consistency check between the body's `OwnerId` and the caller's tenant, so an OwnerAdmin can create a store for any owner id they can guess. The correct rule, matching the system's own convention: **POST /v1/stores is SuperAdmin-only**.

## Affected Areas

- `backend/src/SMCA.WebApi/Controllers/v1/StoresController.cs` (lines 83-91) — add action-level `[HasPermission(StoreRoleFeatures.SuperAdmin)]`.
- `backend/src/Application/Features/StoreManagement/Stores/Commands/CreateStore/CreateStoreCommand.cs` (lines 50-51, 57-61) — tighten guard to `IsSuperAdmin`, drop the OwnerAdmin re-point branch, align status 400→403.
- `backend/src/SMCA.WebApi.E2ETests/Stores/StoreCreateAuthorizationGapTests.cs` — BOTH tests pin the defect; must be rewritten (user authorization required).
- `openspec/specs/authorization-e2e/spec.md` — R2.10/R2.11 must be replaced with the corrected behavior (delta spec).
- `frontend-react/.../management/stores/{routes/edit-store.tsx, components/store-form.tsx, lib/services/store-http-service.ts}` — create mode is effectively SuperAdmin-only today (see Risks); no change strictly required.
- NOT affected: `RegisterCommand.cs`, `CreateStoreService.cs`, all Billing/Store tests that create via SuperAdmin or DB seeds.

## Approaches

1. **A — Controller-level SuperAdmin gate (mirror DELETE/PUT payment-date) + handler cleanup** — add `[HasPermission(StoreRoleFeatures.SuperAdmin)]` to the POST action (StoresController.cs:83); tighten handler guard to `IsSuperAdmin` and delete the re-point branch (CreateStoreCommand.cs:50-51, 57-61); change the guard's status to `Forbidden` for defense-in-depth.
   - Pros: consistent with the 4 sibling SuperAdmin-only actions; filter yields real 403 (`ForbidResult`) for OwnerAdmin/StoreUser/ReSeller before the handler runs; kills the SelectedStoreId re-point side effect; closes the arbitrary-owner creation hole for non-SuperAdmins; smallest pattern-conformant change.
   - Cons: touches production code (2 files) and the 2 existing E2E gap tests (rewrite required); R2.10/R2.11 spec replacement.
   - Existing tests that break: `StoreCreateAuthorizationGapTests.cs:30-61` (expects 201), `:63-85` (expects 400). No other E2E test POSTs /v1/stores as OwnerAdmin/StoreUser (`StoreCreateTests` and `StoreCreationTrialTests.CreateStoreViaApiAsync` both use `SeedSuperAdminAsync`). No Application.Tests cover `CreateStoreCommandHandler` (grep: none).
   - Effort: Low. Production code: YES (user approval required). Existing E2E tests: YES, the 2 gap tests (user approval required).

2. **B — Handler-only guard change** — change `IsSuperAdminOrOwnerAdmin` → `IsSuperAdmin` in CreateStoreCommand.cs:50 and drop lines 57-61; controller unchanged.
   - Pros: defense-in-depth; fixes role admission for any caller.
   - Cons: does NOT fix the 400-not-403 divergence (still `ApiException(BadRequest)`), and non-SuperAdmins still reach the handler through the class gate; R2.11 (400) would still need updating. Incomplete fix for H-10's status-code half.
   - Existing tests that break: same 2 gap tests.
   - Effort: Low. Production code: YES. Existing E2E tests: YES.

3. **C — Keep OwnerAdmin allowed; only fix 400→403** — document H-10 as intended product behavior; change the handler guard status to `Forbidden` (CreateStoreCommand.cs:51) and/or throw 403 for non-SuperAdmin-or-OwnerAdmin.
   - Pros: preserves OwnerAdmin's current store-creation capability; fixes the status-code divergence; smallest blast radius.
   - Cons: keeps the authorization hole (arbitrary-owner creation, SelectedStoreId re-point, trial-clock side effects by a tenant-bound admin); contradicts the sibling action pattern and the defect's premise; frontend store-list create flows stay reachable for OwnerAdmins; R2.10 stays, R2.11 becomes 403 — spec still changes.
   - Existing tests that break: `StoreCreateAuthorizationGapTests.cs:63-85` (400 → 403). Test 1 (201) stays green.
   - Effort: Low. Production code: YES (1 line). Existing E2E tests: YES (1 test).

4. **D — A + handler 403 status hardening** (recommended composite) — Approach A, plus the handler guard status changed from `BadRequest` to `Forbidden` so the handler is also correct if ever invoked outside the HTTP pipeline; optionally delete the now-unreachable OwnerAdmin branch rather than leaving dead code.
   - Pros: all of A, plus no latent re-trigger of H-10 via a future non-HTTP MediatR caller; no dead code left behind.
   - Cons: same as A.
   - Existing tests that break: same 2 gap tests.
   - Effort: Low. Production code: YES. Existing E2E tests: YES.

## Recommendation

**Approach D (A + 403 hardening)**: action-level `[HasPermission(StoreRoleFeatures.SuperAdmin)]` on `POST /v1/stores` mirroring DELETE/payment-date, handler guard tightened to `IsSuperAdmin` with `HttpStatusCode.Forbidden`, and the OwnerAdmin SelectedStoreId re-point branch removed. This fully closes H-10 (admission AND status code), matches the system's own SuperAdmin-only convention for destructive store operations, and cannot regress via a future direct handler caller. Self-registration (S1-01) is unaffected because `RegisterCommand` bypasses this command entirely — verified in code.

## Risks

- **Blast radius of POST /v1/stores becoming SuperAdmin-only**:
  - Auto-registration: NOT affected — `RegisterCommand.cs:82` calls `_createStoreService.CreateStoreAsync` directly. S1-01 safe.
  - Billing E2E: NOT affected — `StoreCreationTrialTests` admin-path tests (1-5, 14, 16) use SuperAdmin; registration tests (6-13, 15, 17) use `/auth/register`; `BillingSeed` seeds stores directly in DB.
  - Frontend: create mode is effectively unreachable for OwnerAdmin — `edit-store.tsx:33-34` resolves `storeId = paramId ?? user.selectedStoreId ?? ''` and an OwnerAdmin always has `selectedStoreId` (set at registration) → `/management/stores/create` renders EDIT mode (Angular parity, documented lines 18-21). If an OwnerAdmin ever reaches create mode and submits, they'd get 403 → generic `STORES.ERROR` alert (`edit-store.tsx:151-153`) — no crash, no change required.
  - Existing E2E tests: exactly 2 break — `StoreCreateAuthorizationGapTests.cs:30-61` and `:63-85` (they pin the defect by design). Per project rules, modifying existing E2E tests requires explicit user authorization.
  - Specs: `authorization-e2e/spec.md` R2.10/R2.11 MUST be replaced (they document the defect, with the coupling pre-annotated at lines 53/68/91). `billing` and `billing-e2e-coverage` specs (admin POST references) remain valid because their admin actors are SuperAdmins.
- **Partial-fix trap**: fixing only the attribute (or only the handler) leaves the other half of H-10 open — the 400-not-403 divergence or the dead OwnerAdmin branch. Do both.
- **Out-of-scope adjacent bug (do not fold in)**: controller returns `Ok(result)` (200) when the handler returns `Failure(StoreErrors.NotCreated, 400)` (`StoresController.cs:88-90`) — a 200-wrapped failure envelope. Unrelated to H-10; flag but exclude.

## Ready for Proposal

**Yes.** The orchestrator should tell the user:
1. The fix WILL touch **production source code** (`StoresController.cs` POST action; `CreateStoreCommand.cs` guard + re-point branch) and **existing E2E tests** (`StoreCreateAuthorizationGapTests.cs`, both tests) — both are prohibited by the non-negotiable project rules (backend scope rule 2026-08-08; E2E-untouchable rule 2026-08-10) without **explicit user approval**. Ask for it before sdd-propose/sdd-apply.
2. The proposed rule: `POST /v1/stores` becomes **SuperAdmin-only** (403 for OwnerAdmin/StoreUser/ReSeller), consistent with DELETE/approve/disapprove/payment-date. Spec R2.10/R2.11 will be converted from "documents the gap" to "documents the corrected behavior" in the same change.
3. Self-registration (S1-01) and all billing/store tests that use SuperAdmin or DB seeds are unaffected — verified in code.
