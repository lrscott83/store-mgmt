# Exploration: offline-roster-billing-and-dek-interop-backend

Source plans (both read in full):
- `docs/plans/2026-07-30-offline-roster-billing-gate-backend-plan.md` (billing gate)
- `docs/plans/2026-08-02-offline-roster-dek-interop-backend-plan.md` (DEK interop)

Date: 2026-08-03 · Mode: hybrid (openspec + engram) · Read-only; no code modified.

---

## 1. Stated defects vs. verified current state

### Plan 1 — Billing gate

| Plan claim | Verified state | Verdict |
|---|---|---|
| Export handler never calls `StoreBillingUtils.FilterForBilling` (`ExportOfflineRosterQuery.cs:75-76`) | `ExportOfflineRosterQuery.cs:74-75` loads `GetStoreModulesByIdAsync` and does `Select(sm => sm.ModuleId).ToList()` with no billing involvement. `storeModuleIds` feeds BOTH `GetStoreRoleFeaturesByUserIdAsync` (`:84`) and `GetAllowedFeatureIdsForUserAsync` (`:95`) from a single assignment — the plan's "filter once covers roles+features" claim holds. | **CONFIRMED** |
| `GetMeQuery.cs:71` gates via `FilterForBilling` — pattern to mirror | `GetMeQuery.cs:70-71` — `IBillingService.GetStoreBillingSummaryAsync(user.SelectedStoreId)` then `StoreBillingUtils.FilterForBilling(storeModules, billing)`. Billing fields populated at `:101-103` (`billing.NextDueDate`, `billing.IsInTrial`, `billing.Status.ToString()`). | **CONFIRMED** |
| `FilterForBilling` at `Domain/Common/Utils/StoreBillingUtils.cs:53-62` | Exists at `Domain/Common/Utils/StoreBillingUtils.cs:53-62` in the **Domain** project (plan's defect section writes `Application/Domain/...` — path error, line numbers exact). Semantics: `Vencido` → only `PriceIncluded` modules; `NoAplica`/others → all. | **CONFIRMED** (minor path typo in plan) |
| `OfflineRosterUserDto` lacks `paymentDueDate`/`isInTrial`/`paymentStatus` | `OfflineRosterUserDto.cs` (22 lines) has none of the three. `GetMeQuery` pattern shows exact source: `StoreBillingSummary.NextDueDate/IsInTrial/Status` (`Domain/Entities/Billing/StoreBillingSummary.cs:11-18`). | **CONFIRMED** |
| `ExpiresAt = now.AddDays(35)` hardcoded vs monthly cycle | `ExportOfflineRosterQuery.cs:134` — `now.AddDays(35)` hardcoded. Also `:129` uses `DateTimeOffset.UtcNow` directly — handler does NOT inject `IDateTimeProvider` yet (plan constraint requires it; `IDateTimeProvider` lives at `Application/Abstractions/Time/IDateTimeProvider.cs`, E2E replaces it via `AppTestFactory.cs:29-30` with `MutableDateTimeProvider`). `GetNextDueDate` = `AddMonths(trialMonths + 1)` (`StoreBillingUtils.cs:28`) confirms monthly cycle claim. | **CONFIRMED** |
| `GetOfflineRosterTtlDaysAsync` on system config repo | `ISystemConfigurationRepository` exists at **`Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs`** (plan says `Application/Abstractions/...` — WRONG path), has `GetDueSoonDaysAsync` (`:12`) but NO `GetOfflineRosterTtlDaysAsync`. Impl at `Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs:40-44` (reads `SystemConfigurationType.DueSoonDays`, default 5). `SystemConfigurationType` enum (`Domain/Common/Enums/SystemConfigurationType.cs`) has values 1-4; new value (5) needed. | **CONFIRMED** (path correction) |

### Plan 2 — DEK interop

| Plan claim | Verified state | Verdict |
|---|---|---|
| Lines 58-60 are the only place `wrappedDek` is asserted; "It never unwraps it. A WrapDek that returned 48 bytes of noise would pass" | **STALE.** The file has grown `SuperAdmin_export_twice_DEK_stability` (`ExportOfflineRosterTests.cs:181-264`) which ALREADY unwraps via a private `UnwrapDek` helper (`:266-285`) — KEK from the DB stored hash, `210_000` hardcoded at `:273`, asserts recovered DEK `HaveCount(32)` and byte-identical across two exports. A noise-producing wrap would FAIL (tag mismatch throws). What is still missing vs. the plan: (a) comparison against `IStoreDataKeyProvider.GetDek(storeId)` (only self-consistency is checked), (b) the negative case (raw password must fail), (c) iteration count read from the wire. | **PARTIALLY ALREADY FIXED / plan premise outdated** |
| KEK input is an assumption | The stability test DOES derive the KEK from the stored hash (DB `u.Password`, `:245-248`) — the correct input is exercised. But no negative case pins "raw password must FAIL to decrypt". | **PARTIALLY ADDRESSED** |
| `KekIterations` hardcoded `210_000`, never on the wire | `StoreKeyWrapService.cs:9` — `private const int KekIterations = 210_000`. `WrappedDekResult(WrappedDek, WrapSalt, WrapIv)` (`IStoreKeyWrapService.cs:3`) has no `Iterations`. `OfflineRosterUserDto` has no `WrapIterations`. Repo-wide grep: `WrapIterations` appears ONLY in the plan doc. | **CONFIRMED** |
| No committed vector anywhere in `backend/` | `docs/contracts/` does NOT exist (ENOENT). No committed wrappedDek/wrapSalt/wrapIv value found. Frontend fixture `frontend-react/apps/web-store-pos/app/shared/lib/offline/__tests__/__fixtures__/dek-kat.json` exists with `provenance: "node-transcription"` per the archived verify report. | **CONFIRMED** |
| `StoreKeyWrapServiceTests.cs:16-51` round-trips with RNG both ends | Matches exactly (`StoreKeyWrapServiceTests.cs:15-51`). | **CONFIRMED** |
| E2E suite already has everything Task 1 needs (`DbTestHelpers.HashPassword` = Base64(SHA256), `"Password123"`, `IStoreDataKeyProvider` resolvable from DI) | `DbTestHelpers.cs:21-22` — exact. `Program.cs:63-64` — `AddScoped<IStoreDataKeyProvider>(_ => new StoreDataKeyProvider(MasterSecret))` (plan cites :64-65, cosmetic). | **CONFIRMED** |
| Task 4 context: frontend change "verify-BLOCKED on exactly this gap" | The change is **ARCHIVED 2026-08-02** under an orchestrator override of the BLOCKED verdict (verify-report.md + archive-report.md). The WU3.3 CRITICAL (backend-KAT provenance) is confirmed open and explicitly owned by this plan's Tasks 1-3. | **CONFIRMED** (plan's "verify-BLOCKED" wording is stale; substance holds) |

---

## 2. Touchpoint map

### Production code (both plans)

| File | Plan 1 | Plan 2 | Merge notes |
|---|---|---|---|
| `backend/src/Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` | gate via `FilterForBilling`; populate 3 billing fields; `FormatVersion` 2→3; TTL from config; inject `IDateTimeProvider` + `ISystemConfigurationRepository` (+ `IBillingService`) | populate `WrapIterations` from `WrapDek` result | **HIGH OVERLAP.** Single handler: constructor grows by ~3 deps (current: 11 params, `:35-46`); DTO assembly block `:104-126` gains 4 props; TTL line `:134`; `FormatVersion` const `:33` — all in the same file, do in one pass. **Type wrinkle:** `FilterForBilling` takes `IEnumerable<Module>` but the handler holds `IEnumerable<StoreModule>` from `GetStoreModulesByIdAsync` (`IStoreModuleRepository.cs:10`), and that repo method does NOT `.Include(sm => sm.Module)` (`StoreModuleRepository.cs:30-33`). `GetAvailableModulesByStoreIdAsync` (`:19-28`, returns `Module`) has different (availability-filtered) semantics — switching would change the module set beyond billing. Design must choose: add Include + `sm.Module` mapping, or new repo method. Unit-test mock `SetupStoreModules` (`ExportOfflineRosterQueryHandlerTests.cs:243-257`) builds `StoreModule` with only `ModuleId` set — will null-ref once the handler maps `sm.Module`. |
| `backend/src/Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs` | + `PaymentDueDate` (`DateOnly?`), `IsInTrial` (`bool`), `PaymentStatus` (`string`) | + `WrapIterations` (`int`) | **HIGH OVERLAP** — same file, 4 additive props, trivial. |
| `backend/src/Application/Abstractions/Authentication/IStoreKeyWrapService.cs` | — | `WrappedDekResult` + `int Iterations` | **Compile break:** positional record ctor gains a param → `new WrappedDekResult(...)` at `StoreKeyWrapService.cs:37` and test mocks at `ExportOfflineRosterQueryHandlerTests.cs:103,153` must change. |
| `backend/src/Application/Services/Authentication/StoreKeyWrapService.cs` | — | surface `KekIterations` in result | Plan constraint: math must NOT change. |
| `backend/src/Domain/Interfaces/Repositories/ISystemConfigurationRepository.cs` | + `GetOfflineRosterTtlDaysAsync` | — | Path correction: NOT `Application/Abstractions/`. |
| `backend/src/Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs` | + impl following `GetDueSoonDaysAsync` (`:40-44`) | — | Plus `SystemConfigurationType` enum +5, plus seed row (plan 1 Task 3 Step 5 — check existing SystemConfiguration seeding). |
| `backend/src/Domain/Common/Utils/StoreBillingUtils.cs` | read-only reference | read-only reference | Plan 1 explicitly forbids changing it. |

### Test code (both plans)

| File | Plan 1 | Plan 2 | Merge notes |
|---|---|---|---|
| `backend/src/Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs` | gate tests (Vencido/AlDia/NoAplica); TTL-via-config test; FormatVersion 3 | `wrapIterations == 210_000` assertion | **HIGH OVERLAP.** Also forced updates: `CreateHandler` (`:205-221`) for new ctor deps; `new WrappedDekResult` 3-arg → 4-arg (`:103,153`); `FormatVersion == 2` (`:113`) → 3; `35 * msPerDay` (`:118`) → configured TTL. |
| `backend/src/SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs` | FormatVersion 2→3 (`:45,201,217`); TTL `35 * msPerDay` (`:50`) → config; billing-field assertions + Vencido seeding (via `BillingSeed.cs` — free=Management/`PriceIncluded=true`, paid=Statistics/`PriceIncluded=false`, `ModulePriceIncluded` flag; `SeedPaymentAsync`; `MutableDateTimeProvider` via `_f.Clock`) | new unwrap-vs-`GetDek` test + raw-password negative case; consume `user.WrapIterations` instead of literal `210_000` | **HIGH OVERLAP.** Existing `UnwrapDek` helper hardcodes `210_000` (`:273`) — plan 2 Task 3 must also update it (or the stability test becomes the very drift channel the plan aims to kill). Decision: coexist with or replace `SuperAdmin_export_twice_DEK_stability`. |
| `backend/src/SMCA.WebApi.E2ETests/Infrastructure/TestDtos.cs` | `RosterUserData` + 3 billing props | `RosterUserData` + `WrapIterations` | **NOT listed in either plan's file structure but required** — deserialization target for all new E2E assertions. Easy to miss. |
| `backend/src/Application.Tests/Services/Authentication/StoreKeyWrapInteropTests.cs` | — | NEW file: reads committed vector, unwraps with documented params only, HKDF DEK-derivation pin | Plan 2 only. |

### New artifacts / out-of-scope

| Item | Plan | Notes |
|---|---|---|
| `docs/contracts/offline-roster-dek-kat.json` | Plan 2 Task 2 (new) | Directory `docs/contracts/` does not exist yet — create it. Required fields incl. `_header` with provenance `dotnet-backend`, commit SHA, .NET version. |
| `docs/plans/2026-07-30-register-endpoint-fixes-frontend.md` | Plan 1 Task 4 | Record-only task appends shipped contract values. |
| Frontend Task 4 items (plan 2) | **OUT OF SCOPE — non-goal** | Belongs to `at-rest-encryption-frontend` (archived; WU3.3 CRITICAL owner). Replace `dek-kat.json` fixture, KAT test, `wrapIterations` in `roster-types.ts`/`dek-unwrap.ts` with fallback `210000`, v2 fixtures. Recorded, NOT implemented. |

---

## 3. Contradictions / stale references in the plans

1. **`FormatVersion` conflict — the biggest one.** Plan 1 Task 2: "Bump `FormatVersion` from 2 to 3" (v2-vs-v3 distinguishability rationale). Plan 2 Task 3: "`FormatVersion` stays at 2... Do NOT bump to 3." Direct contradiction; MUST be resolved in proposal/design. Note the archived frontend spec (`openspec/specs/offline-roster-bundle/spec.md:100-101`) already requires `formatVersion` to remain an UN-narrowed `number` explicitly so a future v3 bundle is not mistyped — a bump is anticipated there. Plan 1 Task 4's frontend doc and plan 2 Task 4's `wrapIterations` fallback sequencing both depend on the resolution.
2. Plan 1 cites `ISystemConfigurationRepository` under `Application/Abstractions/` — real home: `Domain/Interfaces/Repositories/`.
3. Plan 1 defect section writes `Application/Domain/Common/Utils/StoreBillingUtils.cs` — real: `Domain/Common/Utils/StoreBillingUtils.cs` (Domain project).
4. Plan 2's "never unwraps / 48 bytes of noise would pass" premise is OUTDATED — `SuperAdmin_export_twice_DEK_stability` exists and unwraps (though not against `GetDek` and without the negative case or wire iterations). Plan 2 Task 1 should be re-scoped: the NEW value is (a) direct `GetDek` byte comparison, (b) raw-password negative case, (c) wire-iteration consumption — not "first ever unwrap".
5. Plan 2 cites `Program.cs:64-65` — actual `:63-64`. Cosmetic.
6. Plan 2 Task 4: "verify-BLOCKED" — the frontend change is archived under an override; the CRITICAL is confirmed open and owned here. Wording stale, substance correct.
7. Plan 1 Task 3 "DECISION REQUIRED" on TTL default (recommendation 7 days) — NOT yet signed off anywhere; `ExportOfflineRosterTests.cs:50` and `ExportOfflineRosterQueryHandlerTests.cs:118` both pin the current 35 days and will fail RED until changed.

---

## 4. Approaches

1. **Implement both plans as ONE change (recommended)** — billing gate + billing snapshot + TTL + DEK interop + wire iterations in a single SDD change.
   - Pros: one pass over `ExportOfflineRosterQuery` (constructor + DTO assembly + TTL + FormatVersion in one edit); one E2E-suite run; one contract release; overlaps resolved at design time instead of rebase time; both defects share the same two test files and one DTO.
   - Cons: larger diff (likely > 400-line review budget — tasks phase must forecast; chained PRs may be needed); two product decisions must be settled up front (FormatVersion, TTL value).
   - Effort: High.

2. **Two sequential changes (billing first, DEK second)** — as originally planned independently.
   - Pros: smaller reviews; plan 2's "FormatVersion stays 2" could ship before the v3 bump.
   - Cons: `ExportOfflineRosterQuery` and both test files get touched twice; the FormatVersion 2-vs-3 contradiction resurfaces as a rebase conflict on the second change; double E2E runs; the DEK work waits on billing sign-off.
   - Effort: Medium per change, High total.

---

## 5. Recommendation

**Proceed as ONE change** (Approach 1). The two plans share both production files, both test suites, the DTO, and the handler constructor — splitting them forces the same files to be rewritten twice and duplicates the E2E run. Resolve before sdd-propose:
- FormatVersion: **3** (plan 1's rationale is stronger — a v2 bundle cannot distinguish "no billing" from "predates billing"; plan 2's `wrapIterations` rides inside v3, and its "existing clients hardcode 210000 and keep working" backward-compat argument is unaffected by the version number). Frontend sequencing (plan 1 Task 4 + plan 2 Task 4) must be recorded as the release order.
- TTL default: get the 7-day value signed off (plan 1 Task 3 Step 0) before design.
- Module source for the gate: `StoreModule.Module` navigation mapping (add `.Include`) — do NOT switch to `GetAvailableModulesByStoreIdAsync` (semantics differ).
- Re-scope plan 2 Task 1: new value is GetDek-direct assertion + negative case + wire iterations, since an unwrap test already exists.
- Existing stability test's hardcoded `210_000` (`ExportOfflineRosterTests.cs:273`) must consume the wire value too, else a second drift channel survives.

## 6. Risks

- **Breaking contract for the deployed PWA**: v3 bundles unreadable until the frontend ships (plan 1 Task 4 + plan 2 Task 4 sequence). Frontend Task 4 of plan 2 is a recorded NON-GOAL — do not implement; `sdd-archive`/release order depends on it.
- **FormatVersion 2-vs-3 conflict** unresolved → two plans contradict; spec must not be written until decided.
- **TTL product decision** not signed off; default 7 days vs current 35 days is a connectivity-vs-staleness tradeoff for the exact customers offline auth serves.
- **Test-DTO trap**: `TestDtos.cs` gains must be in tasks.md — it is in neither plan's file list.
- **`WrappedDekResult` ctor break** ripples to 3 call sites (service + 2 unit-test mocks) — compile break, easy but must be in tasks.
- **`sm.Module` mapping** requires repo `Include` + unit-test mock rework (`SetupStoreModules` builds Module-less StoreModule).
- **Review budget**: combined change likely exceeds the 400-line guard; tasks phase must forecast and possibly chain PRs (delivery strategy is the orchestrator's call).
- **TDD mode**: per `openspec/config.yaml` (`strict_tdd: true`) and sdd-init nuance — backend pure logic (gate, TTL, wrap iterations) strict TDD; E2E-only parts have Standard-mode precedent (owners-*). Orchestrator decides; exploration does not.
- Working tree currently has unstaged deletions of archived `openspec/changes/owners-*` folders (post-archive state) — unrelated, but the tree is not pristine before apply.

## 7. Ready for Proposal

**Yes**, with these open questions the proposal phase must resolve/record:
1. FormatVersion: 3 (billing bump) — confirm `wrapIterations` rides in v3 and plan 2 Task 4's "v2 twins gain the field" re-scopes to v3.
2. TTL default signed off (7 days?) and who owns the decision.
3. Module source for `FilterForBilling` (Include + `sm.Module` mapping vs new repo method).
4. Whether the new unwrap E2E test replaces or coexists with `SuperAdmin_export_twice_DEK_stability`, and updating its hardcoded `210_000`.
5. TDD mode for this change (strict vs Standard-for-E2E) — orchestrator decision.
6. Delivery strategy / chained-PR forecast for the >400-line combined diff.
