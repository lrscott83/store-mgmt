# Verify Report: store-default-plan-and-owner-plan-restriction

- **Change**: `store-default-plan-and-owner-plan-restriction`
- **Verifier**: SDD verify worker (direct verification, not SDD phase dispatch)
- **Date**: 2026-09-18
- **Base**: `4b8a54dc` — **HEAD**: `c357c305` ("docs(sdd): mark ... apply complete") — working tree clean
- **Mode**: read-only + report-writing. No code, test, spec, or DB mutation performed.
- **Verdict**: **SUCCESS** — implementation matches proposal, spec, design, and tasks; all fresh practical checks pass except one **user-accepted environmental backend-E2E failure** (shared-DB module-17 pollution, not caused by this change).

---

## 1. Requirement Traceability

Delta spec: 1 ADDED + 2 MODIFIED requirements (18 scenarios) — all have implementation evidence and completed tasks.

### R1 (ADDED): Store Creation Default Plan — Pago at Birth

| Aspect | Evidence (file:line) | Tasks |
|---|---|---|
| Birth default → Pago for BOTH admin create and self-registration (shared `CreateStoreAsync` path) | `backend/src/Application/Services/Stores/CreateStoreService.cs:45` — `(int)StorePlanType.Superior` → `(int)StorePlanType.Pago` (1-line diff, commit `df3695a6`); both admin `POST /v1/stores` and `RegisterCommand` flow through this method | 1.1 ✅ |
| Birth module set stays request-driven (Option A — no module re-derivation from plan catalog) | `CreateStoreService.cs` module-assignment block untouched (diff shows only line 45); pinned by E2E `StoreCreatePlanTests.Create_store_defaults_to_pago_but_modules_are_request_driven` (asserts Pago `StorePlanId`, Pago catalog = 11 members, active modules = full request list incl. module 15) and unit `store-creation-trial.test.tsx` (`moduleIds: [2,3,4]`, payload keys `address/approved/description/moduleIds/name/ownerId` — never `planId`) | 3.1, 5.1 ✅ |
| Self-registration path pins | E2E `AuthRegisterPlanTests.Register_creates_store_with_pago_plan_and_all_available_modules` — `PagoPlanId` assertion | 3.8 ✅ |
| Owner-create path pins | E2E `OwnerCreateStoreTests` OC04 — `store.StorePlanId == (int)StorePlanType.Pago` | 3.4 ✅ |

### R2 (MODIFIED): Owner Plan Change Endpoint

| Aspect | Evidence (file:line) | Tasks |
|---|---|---|
| Caller×target gate after ownership guard, before preconditions | `ChangeStorePlanCommand.cs:97-101` — `if (!_httpContextService.IsSuperAdmin && request.StorePlanId is (int)StorePlanType.Superior or (int)StorePlanType.VIP) throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);` inserted between ownership guard (:89-95) and `IsActive` preconditions (:103-107), commit `f98da701` | 1.2 ✅ |
| Owner 200 matrix rows (Gratis/Pago) preserved | Handler mutation block untouched; E2E `ChangeStorePlanTests.Owner_changes_free_store_to_pago_*`, `Owner_overdue_anchor_*`, `Owner_downgrades_paid_store_to_gratis_*`, unit positive Owner→Pago/Gratis | 3.2 ✅ |
| SA 200 matrix row incl. Superior/VIP | SA-exempt branch (`IsSuperAdmin` checked); E2E `SuperAdmin_changes_any_store` (SA→Superior 200), `SuperAdmin_changes_paid_store_to_vip_activates_full_universe` (SA→VIP 200) | 3.2 ✅ |
| Mutation semantics (modules = priceIncluded ∪ members, anchor untouched, override mechanics, role features) | Unchanged handler logic (out of delta scope); override/anchor pins re-anchored to SA caller where they needed Superior/VIP: unit `ChangeStorePlanCommandHandlerTests.cs:561-577` (`ArrangeSuperAdmin` for VIP override) and `:619-635` (`ArrangeSuperAdmin` for Superior override); E2E `StorePlanCanonicalPriceTests.P4_change_plan_updates_card_price_to_target_plan` runs the flip as SA | 2.2, 3.7 ✅ |
| 403 pins for owner→Superior/VIP | Unit (2 new): `Handle_ownerTargetsSuperior_throwsForbidden`, `Handle_ownerTargetsVIP_throwsForbidden` (RED-reasoning comments pinned; assert 403 + "nothing changed"). E2E (4 more): `ChangePlanPermissionFlipTests` 2a owner→Superior 403; `MultiMonedasModuleTests` MM2/MM3 owner→Superior/VIP 403; `MeAfterOwnerPlanChangeTests` owner→Superior 403 | 2.1, 3.3, 3.5, 3.6 ✅ |
| Not-owner → 403; inactive/unknown → 400 | E2E `ChangeStorePlanTests.Other_owner_admin_cannot_change_someone_elses_store_403`, `Inactive_store_returns_400`, `Inactive_owner_user_returns_400`, `Unknown_plan_returns_400` + unit `Handle_unknownPlan_returns400` (all pre-existing, untouched) | (pre-existing) |

### R3 (MODIFIED): Plan Panels Activation Contract (owner plan change)

| Aspect | Evidence (file:line) | Tasks |
|---|---|---|
| Non-SuperAdmin sees ONLY Gratis/Pago panels (both consumers) | `edit-plan-modal.tsx:49-54` (`visiblePlans = user?.isSuperAdmin ? plans : plans.filter(p => p.planType === 'Gratis' || p.planType === 'Pago')`) passed to `<PlanPanels plans={visiblePlans}>` (`:93`); `store-plan.tsx:86-91` + `:166` (same filter, OwnerAdmin route via `adminFeatureLoader`) | 4.1, 4.2 ✅ |
| SuperAdmin pass-through | Both filters branch on `isSuperAdmin`; `store-list.tsx` unchanged (verified read-only, task 4.3) | 4.3 ✅ |
| No readOnly lock; Activar Plan per non-active panel; layout rules | Unchanged components (`plan-panels.tsx` untouched — no diff); requirement text for layout unchanged in delta | (pre-existing, unchanged) |

**Traceability verdict**: every delta requirement maps to committed code AND to completed tasks in `tasks.md` (23/23 `[x]`) and `apply-progress.md` (23/23). **No requirement lacks evidence.**

## 2. Scenario Coverage (18/18 covered)

| # | Scenario (delta spec) | Covered by |
|---|---|---|
| 1 | Admin-created store births on Pago | E2E `StoreCreatePlanTests` (admin-create + free-only tests assert `PagoPlanId`); `OwnerCreateStoreTests` OC04 |
| 2 | Self-registered store births on Pago | E2E `AuthRegisterPlanTests` |
| 3 | Birth module set unchanged (Option A) | E2E `StoreCreatePlanTests.Create_store_defaults_to_pago_but_modules_are_request_driven` (request-list ≡ modules, Pago catalog 11); unit `store-creation-trial.test.tsx` (`[2,3,4]`, no `planId` in payload) |
| 4 | Owner changes Gratis→Pago (overdue clock) | E2E `ChangeStorePlanTests.Owner_overdue_anchor_paid_target_pins_nextDueDateOverride_to_today`; unit positive Owner→Pago |
| 5 | Next payment date becomes today — visible | Same E2E (asserts `NextDueDateOverride == Today()` + anchor untouched; class doc pins `/plan` visibility) + unit override tests |
| 6 | Owner→paid plan with FUTURE due date | Unit `ChangeStorePlanCommandHandlerTests` paid-target-future-due (SA caller, override NOT set, existing override untouched) |
| 7 | Owner changes to Gratis | E2E `ChangeStorePlanTests.Owner_downgrades_paid_store_to_gratis_clears_override_and_paid_modules`; `MeAfterOwnerPlanChangeTests` B3 (owner-driven Gratis leg) |
| 8 | Owner targets Superior or VIP → 403 | Unit 2 new gate tests + E2E `ChangePlanPermissionFlipTests` 2a, `MultiMonedasModuleTests` MM2/MM3, `MeAfterOwnerPlanChangeTests` (6 independent pins across 4 files) |
| 9 | Not the store's owner | E2E `ChangeStorePlanTests.Other_owner_admin_cannot_change_someone_elses_store_403` |
| 10 | Inactive store or owner → 400 | E2E `Inactive_store_returns_400`, `Inactive_owner_user_returns_400` |
| 11 | SuperAdmin path (incl. Superior/VIP) | E2E `SuperAdmin_changes_any_store` (SA→Superior 200), `SuperAdmin_changes_paid_store_to_vip_activates_full_universe` (SA→VIP 200), `ChangePlanPermissionFlipTests` SA flips, `StorePlanCanonicalPriceTests` P4 (SA flip, owner card read) |
| 12 | Unknown plan / inactive plan → 400 | E2E `Unknown_plan_returns_400`; unit `Handle_unknownPlan_returns400` |
| 13 | Owner activates Pago from the dialog | E2E `plan-change-permission-refresh.spec.ts` (upgrade leg Gratis→Pago, `/Pago/` panel "Activar Plan", session revalidation + menu delta) |
| 14 | Non-SuperAdmin sees only Gratis/Pago panels | Unit `my-stores.test.tsx` (Superior button ABSENT) + `store-plan.test.tsx` (Superior button ABSENT; only non-active panel left = Gratis) |
| 15 | SuperAdmin sees all four panels | Unit `store-list.test.tsx:829-962` (Superior panel renders in the admin modal; auth-store mock `isSuperAdmin: true`) |
| 16 | Strikethrough header | Pre-existing plan-panel unit tests (requirement text unchanged in delta) — green in 64-test subset + full 3736 suite |
| 17 | Includes-previous text | Same (unchanged text; pre-existing panel tests, e.g. "Module A"/predecessor assertions) |
| 18 | Rows stripped | Same (unchanged text; pre-existing panel tests) |

**Uncovered scenarios: none.**

## 3. Practical Checks (run this pass)

| Command | Observed result |
|---|---|
| `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter "StoreCreatePlanTests\|ChangeStorePlanCommand"` | **Build blocked (environmental)**: MSB3027/MSB3021 — copy into `SMCA.WebApi/bin/Debug/net8.0` failed after 10 retries; the dir is locked by two running `SMCA.WebApi.exe` (PIDs 26180, 32336; started today 10:37 / 11:48 — E2E hosts left over from the apply run). No test executed in this attempt; not a code failure. |
| same filter, `--no-build` (HEAD binaries; working tree clean at start ⇒ binaries == current code) | **16/16 passed** (0 failed, 0 skipped, 225 ms) — gate unit tests (`StoreCreatePlanTests` + `ChangeStorePlanCommandHandlerTests`) green |
| `pnpm typecheck` (frontend-react) | **clean** — turbo 5/5 tasks successful (`@store-mgmt/web-store-pos` typecheck executed, cache miss; 1m01s) |
| `npx vitest run` on the 4 changed frontend unit files (from `apps/web-store-pos`, the app's config context) | **4 files / 64 tests passed** (7.25s) — my-stores, store-creation-trial, store-plan, store-list. (Note: an initial run from the repo root failed on `~` alias resolution — runner-context artifact, not a test failure; same files pass from the app context.) |
| `npx playwright test e2e/owner-stores.spec.ts e2e/plan-change-permission-refresh.spec.ts` (authorized pair) | **6/6 passed (41.7s)** — teardown cleaned 95 `e2e-*` rows; run against the polluted shared `smca_test` DB (matches apply's result) |
| `git diff 4b8a54dc..HEAD -- openspec/specs/` | **empty (exit 0)** — canonical `billing/spec.md` + `management-stores/spec.md` untouched; sync deferred to archive |

Checks NOT re-run (per instructions): full backend E2E suite, full 3736-test frontend unit suite (apply evidence accepted: 3736/3736, 28/29 backend E2E with the one accepted environmental failure).

## 4. Findings

### CRITICAL
- None.

### WARNING
- **W-1 (env, user-accepted — see §5): the lone backend-E2E failure** `MeAfterOwnerPlanChangeTests.Me_follows_the_plan_across_superadmin_flips_with_same_owner_token` (:120) is external pollution of the shared `smca_test` DB (module 17 from a foreign migration), not a defect of this change. Verifier re-confirmed the code side: no `20260918153139` migration and no `Elaboración` anywhere in `backend/src`; repo catalog is Gratis=5 / Pago=11 / Superior=14 / VIP=14 members, max module 15 (`StorePlanModuleEntityTypeConfiguration.cs:31-82`), so the test's `{2..15}` expectation matches this repo exactly. Accepted as out-of-scope by the user; **not fixed, DB not cleaned** (per instructions).
- **W-2 (env, operational)**: two stale `SMCA.WebApi.exe` hosts (PIDs 26180/32336) lock `SMCA.WebApi/bin/Debug/net8.0`, so any `dotnet build`/`dotnet test` that rebuilds projects referencing `SMCA.WebApi.csproj` fails with MSB3027 until they are stopped. Verifier worked around it read-only via `--no-build`; recommend the user stop the two processes when convenient. No action taken.

### SUGGESTION
- **S-1**: `frontend-react/.../__tests__/store-list.test.tsx` was modified (auth-store mock `isSuperAdmin: true`, +17 lines) although it is not in the orchestrator's literal authorized-test list nor in tasks.md. It is directly required by the feature (EditPlanModal now reads `useAuthStore`, so the admin page test needed the mock to keep its SuperAdmin all-panels coverage — scenario 15) and belongs to WU-4. Recommend post-hoc approval or a one-line note in `apply-progress.md`; no behavioral weakening of any test.
- **S-2**: **Task 3.2 letter vs. shape**: `ChangeStorePlanTests` no longer holds a dedicated owner→Superior/VIP 403 pair — the owner→Superior pin was merged into the overdue-clock test premise re-anchored to owner→Pago (which is exactly the spec's scenario 4), and the owner→VIP leg was re-authored as SA→VIP. The 403 pins live in 4 other authorized files (6 independent pins). Coverage is complete; the re-anchor is documented in apply-progress 3.2. No action needed, noted for audit.
- **S-3**: `design.md` planned a comments-only update of `edit-store.tsx` (:37-41, :160-162); it was not applied (no functional impact — the design itself verified the create payload never carries `planId`). Apply-progress does not list this omission among deviations; consider adding it for archive fidelity.
- **S-4**: `/plan` visibility of the override (scenario 5's "visible" half) is pinned at the DB/unit level (`NextDueDateOverride == Today()`), not via a live `GET /plan` call in the changed tests; pre-existing `/plan` coverage elsewhere in the E2E suite covers the read path. Optional future test; not required for this change.

## 5. Environmental Findings (user-accepted)

**`MeAfterOwnerPlanChangeTests.Me_follows_the_plan_across_superadmin_flips_with_same_owner_token` (:120) — EXPECTED failure, accepted.**

- The shared `smca_test` DB carries module 17 `Elaboración` (`AvailableToStore=true`, `PriceIncluded=false`) plus `StorePlanModule` rows `(Superior,17)`/`(VIP,17)`, seeded by foreign migration `20260918153139_Add-Elaboration-Module` recorded in `__EFMigrationsHistory`. WebAppFixture never drops the DB (user-approved 2026-08-08 policy) and `ResetDataAsync` preserves seed rows, so the pollution persists across runs.
- The re-anchored expectation (`SuperiorUniverse` = `{2..15}`, 14 members) matches THIS repo's catalog; the DB yields `{2..15, 17}`. Same pollution class also breaks the untouchable `StorePlanCatalogTests` (pre-existing, named, not modified).
- Verifier re-confirmed the code side (grep: zero hits for `202609181539`/`Elaboración` in `backend/src`; catalog config read). The DB-side presence is taken from apply's two-pass observation (authorized E2E filter 28/29) — the verifier did NOT re-run the backend E2E suite and did NOT query or mutate the DB (no psql client available).
- **User has explicitly accepted this as out-of-scope and approved the 28/29 result.** Not fixed; not cleaned; not modified.

## 6. File-Change Audit (`git diff --stat 4b8a54dc..HEAD` — 24 files, +761/−98)

| Area | Files | Verdict |
|---|---|---|
| Backend production | `CreateStoreService.cs` (1 line), `ChangeStorePlanCommand.cs` (+6) | ✅ ONLY the two authorized files |
| Backend unit tests | `ChangeStorePlanCommandHandlerTests.cs` (+43/−2) | ✅ unit-test counterpart (tasks 2.1, 2.2) |
| Backend E2E (authorized set) | `StoreCreatePlanTests`, `ChangeStorePlanTests`, `ChangePlanPermissionFlipTests`, `OwnerCreateStoreTests`, `MultiMonedasModuleTests`, `MeAfterOwnerPlanChangeTests`, `StorePlanCanonicalPriceTests`, `AuthRegisterPlanTests` | ✅ exactly tasks 3.1–3.8 |
| Frontend production | `edit-plan-modal.tsx` (+9), `store-plan.tsx` (+9) | ✅ design files 4.1/4.2; `store-list.tsx` untouched (4.3) |
| Frontend unit tests | `my-stores.test.tsx`, `store-creation-trial.test.tsx`, `store-plan.test.tsx` (tasks pin `store-routes.test.tsx` — pre-existing typo, same range), `store-list.test.tsx` (see S-1) | ✅ 3 authorized (5.1–5.3) + 1 justified (S-1) |
| Frontend E2E | `owner-stores.spec.ts` (E-03 `'Plan: Pago'`), `plan-change-permission-refresh.spec.ts` (Pago/Statistics(6)/feature-60 premise rework) | ✅ tasks 5.4, 5.5 |
| Openspec change artifacts | proposal/spec/design/tasks/apply-progress (+5 files) | ✅ SDD pipeline files |
| Untouched (verified absent from diff) | Angular `frontend/`, `frontend-react/e2e/support/*`, `docs/contracts/`, canonical `openspec/specs/*`, any other backend production file | ✅ |

**No file outside the authorized scope** (only S-1's test-out-of-letter case, justified above). Working tree clean; 7 commits on local `main` (no PR, no push, per project convention).

## 7. Deviations observed vs. design/tasks

1. Store-list test mock addition (S-1) — justified, not documented in apply-progress.
2. Task 3.2 pin shape (S-2) — coverage complete, documented in apply-progress.
3. `edit-store.tsx` comments-only change omitted (S-3) — no functional impact, not documented.
4. Pre-existing `store-routes.test.tsx` → `store-plan.test.tsx` filename typo in spec/tasks pins — documented by apply; correct file was edited.

## 8. Limitations

- Backend unit tests executed via `--no-build` because of the W-2 build lock; binaries correspond to clean HEAD (verified: `git status` clean, no source changes between build-time 11:23 and run).
- Backend E2E suite not re-run (per instructions); accepted-environmental finding based on apply's two-pass evidence + verifier code-side confirmation.
- Full frontend unit suite (3736) not re-run (per instructions); fresh subset (64 tests in the 4 changed files) + typecheck + Playwright pair executed instead.
- No DB queries performed (psql unavailable; DB out of read/verify scope).