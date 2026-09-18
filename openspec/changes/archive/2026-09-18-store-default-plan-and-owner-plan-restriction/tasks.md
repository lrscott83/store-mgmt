# Tasks: Store Default Plan Pago + Owner Plan Restriction

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 150–250 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Default plan → Pago + gate + backend tests | PR 1 | `dotnet test backend/src/SMCA.sln` | Real PostgreSQL (E2E) | `CreateStoreService.cs` line 45 + `ChangeStorePlanCommand.cs` gate lines; revert restores Superior default and no-gate |
| 2 | Frontend filter + frontend tests | PR 2 | `cd frontend-react && pnpm test && pnpm e2e` | Real app (Playwright E2E) | `edit-plan-modal.tsx` + `store-plan.tsx` filter lines; revert restores all-panels |
| 3 | Spec sync (no code) | PR 2 tail | Visual review | N/A | docs-only revert |

---

## Phase 1: Backend — Default Plan + Role Gate

- [x] 1.1 **ChangeStoreService.cs:45** — replace `StorePlanType.Superior` with `StorePlanType.Pago` in `CreateStoreAsync`. One line only.
- [x] 1.2 **ChangeStorePlanCommandHandler.cs:95** — insert after ownership guard, before preconditions: gate blocks non-SA + Superior/VIP → `403 Forbidden`. Reuses `IsSuperAdmin` already resolved at :90. (6 lines; design gate snippet)

## Phase 2: Backend Unit Tests (RED → GREEN)

- [x] 2.1 `ChangeStorePlanCommandHandlerTests.cs` — add `Handle_ownerTargetsSuperior_throwsForbidden` (RED: asserts `ApiException` with 403) and `Handle_ownerTargetsVIP_throwsForbidden`. Verify: `dotnet test --filter ChangeStorePlanCommandHandlerTests`
- [x] 2.2 `ChangeStorePlanCommandHandlerTests.cs:520-539` — switch `Handle_paidTarget_vipPlan_followsPaidRule` to `ArrangeSuperAdminCaller()` (it tests override rule, not gate). Verify: same filter.

## Phase 3: Backend E2E Test Re-Anchors (user-authorized set)

- [x] 3.1 `StoreCreatePlanTests.cs` — flip `SuperiorPlanId` assertions (:67, :119, :157, :198) to `PagoPlanId`; update class doc (:17-24) and const (:38). Verify: `dotnet test --filter StoreCreatePlanTests`
- [x] 3.2 `ChangeStorePlanTests.cs` — owner→Superior (:89) → expect 403; owner→VIP (:122) → expect 403; SA→Superior (:235) stays 200. Verify: `dotnet test --filter ChangeStorePlanTests`
- [x] 3.3 `ChangePlanPermissionFlipTests.cs` — re-anchor: SA client performs flips (SA→Superior 200, SA→Pago 200); owner token proves create-gate flip (403→201→403, same token); add owner→Superior 403 pin.
- [x] 3.4 `OwnerCreateStoreTests.cs` OC04 (:167) — update default-plan assertion if it asserts birth plan. Verify: `dotnet test --filter OwnerCreateStoreTests`
- [x] 3.5 `MultiMonedasModuleTests.cs` (:171, :194) — owner→Superior/VIP → expect 403. Verify: `dotnet test --filter MultiMonedasModuleTests`
- [x] 3.6 `MeAfterOwnerPlanChangeTests.cs` (:90) — owner→Superior now 403; pick Pago-based `/me` assertion or SA path. Verify: `dotnet test --filter MeAfterOwnerPlanChangeTests`
- [x] 3.7 `StorePlanCanonicalPriceTests.cs` (:245-284) — owner→Superior 403; adjust to SA→Superior for price card test. Verify: `dotnet test --filter StorePlanCanonicalPriceTests`
- [x] 3.8 `AuthRegisterPlanTests.cs` (:62) — birth plan now Pago; update assertion. Verify: `dotnet test --filter AuthRegisterPlanTests`

## Phase 4: Frontend — Role Filter

- [x] 4.1 `frontend-react/apps/web-store-pos/app/management/stores/components/edit-plan-modal.tsx` (:85) — add role check: `visiblePlans` = plans filtered to Gratis/Pago for non-SuperAdmin before `<PlanPanels>`. Verify: `cd frontend-react && pnpm test`
- [x] 4.2 `frontend-react/apps/web-store-pos/app/management/stores/routes/store-plan.tsx` (:158-164) — same filter (route reachable by OwnerAdmin via `adminFeatureLoader([Stores])`). Verify: same.
- [x] 4.3 Verify `frontend-react/apps/web-store-pos/app/admin/stores/routes/store-list.tsx` (read-only) — SuperAdmin views unaffected (no filter, VIP not in plans list). No code change.

## Phase 5: Frontend Unit + E2E Test Updates (user-authorized set)

- [x] 5.1 `store-creation-trial.test.tsx` (:249-276) — re-anchor birth planId assertion to Pago; moduleIds assertion unchanged (Superior members, Option A).
- [x] 5.2 `my-stores.test.tsx` (:677) — owner click target `/Superior/` → `/Gratis/`.
- [x] 5.3 `store-routes.test.tsx` (:435-450) — PlanPanels filter behavior; verify catalog factory unchanged at :47-63.
- [x] 5.4 `frontend-react/e2e/owner-stores.spec.ts` (:152-156) — `'Plan: Superior'` → `'Plan: Pago'` (E-03 assertion).
- [x] 5.5 `frontend-react/e2e/plan-change-permission-refresh.spec.ts` (:120-136) — rework premise: Superior/Warehouses(13) → Pago/Statistics(6) delta for upgrade leg.
- [x] 5.6 Verify full frontend suite: `cd frontend-react && pnpm test` (unit) + `pnpm e2e` (Playwright). — Full unit suite 3736/3736 passed (259 files) + typecheck clean; E2E authorized pair (owner-stores + plan-change-permission-refresh) 6/6 passed.

## Phase 6: Canonical Spec Sync (docs only, archive-time)

- [x] 6.1 Verify `openspec/specs/billing/spec.md` and `openspec/specs/management-stores/spec.md` are NOT modified here — they are synced only at archive time by applying the delta in `spec.md`. — VERIFIED: `git diff 4b8a54dc..HEAD -- openspec/specs/` empty; clean working tree for those paths.
- [x] 6.2 Visual review: confirm delta spec `spec.md` ADDED/MODIFIED requirements align with implemented changes (no drift). — No drift; only pre-existing pin typo `store-routes.test.tsx` → actual `store-plan.test.tsx` (:436-454), same line range.

## Verification Notes (final apply pass, 2026-09-18)

- Backend unit filter `StoreCreatePlanTests|ChangeStorePlanCommand`: **16/16 passed**.
- Backend E2E authorized filter: **28/29 passed**. The single failure — `MeAfterOwnerPlanChangeTests.Me_follows_the_plan_across_superadmin_flips_with_same_owner_token` (:120, Superior universe `{2..15}`) — is **environmental, not code**: the shared `smca_test` DB carries module 17 `Elaboración` (plus `StorePlanModule` rows (3,17)/(4,17)) seeded by foreign migration `20260918153139_Add-Elaboration-Module`, which does NOT exist in this repo (`backend/src/Infrastructure/Migrations/` has no such file; no "Elaboración" anywhere in `backend/src`). The re-anchored test expectations match this repo's own catalog exactly (`StorePlanModuleEntityTypeConfiguration` Superior/VIP = 14 members, `ModuleType` max 15). Same pollution explains the pre-existing `StorePlanCatalogTests` failure noted in the full-suite evidence. Untouchable test — named, not modified.
- Frontend: `pnpm typecheck` clean; `pnpm test` **3736/3736 passed (259 files)**; Playwright authorized pair `owner-stores.spec.ts` + `plan-change-permission-refresh.spec.ts` **6/6 passed (57.7s)**.
- Canonical specs `openspec/specs/*` untouched (`git diff 4b8a54dc..HEAD -- openspec/specs/` empty).
- Pending user decision: whether to clean/reset `smca_test` (never dropped per user-approved 2026-08-08 per-run policy) for a full 29/29 re-run.
