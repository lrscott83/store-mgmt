# Verification Report: response-envelope-nullability

**Change**: response-envelope-nullability
**Mode**: hybrid (Engram + openspec/ filesystem, repo-root tree)
**Branch**: feat/response-envelope-nullability, HEAD 5290a72 (diff base ea3b776), tree clean
**Verdict**: PASS WITH WARNINGS

## Completeness

Tasks checked: 26/29. Unchecked: 0.1/0.2 (WU0 enumeration spike — explicitly "NOT a commit", reverted by design after capturing the compiler error list; correctly left unchecked as it produced no shipped artifact) and 5.1 (correcting `frontend-react/openspec/specs/admin/spec.md:312,596,1114` — explicitly deferred to sdd-archive per design/spec). No task is falsely checked; no task is incomplete that should be checked.

## Gates (re-run independently at HEAD 5290a72, clean tree)

- `pnpm typecheck` — 5/5 packages, 0 errors (cache hit, confirms HEAD state unchanged since orchestrator's run).
- `pnpm test` — 155/155 files, 2172/2172 tests passed.
- `pnpm lint -- --max-warnings=0` — 4/4 packages, 0 warnings.

All three independently observed, not just trusted from the orchestrator's report.

## Spec Compliance Matrix

### response-envelope/spec.md

| Requirement | Evidence | Status |
|---|---|---|
| Discriminated Union Shape | `packages/domain/src/models/base.ts:13-15` — 2-branch union, `true`→`data:T`, `false`→`data:null`, both branches `message: string\|null`, `actionCode: number\|null`, `errors: BaseError[]` non-null | PASS |
| message/actionCode Nullable on Both Branches | same lines; type-checks confirmed via `pnpm typecheck` | PASS |
| Union Must Not Collapse to boolean | `envelope.ts:9,19` — `success`/`failure` return-type-annotated `: BaseResponseModel<T>`, contextual typing keeps `succeeded` literal | PASS |
| No Unsafe Cast in failure() | `envelope.ts:19-27` — `failure()` returns `data: null` directly, no `as unknown as T` anywhere in the file (confirmed via diff grep) | PASS |
| Supersedes Stale Non-Nullable Claim | Correctly left as an UNCHECKED task (5.1), deferred to sdd-archive per spec's own wording ("archive corrects") | PASS (deferred as designed, not a gap) |

**ADR-3 union-collapse probe — independently proven load-bearing.** I reproduced the exact TS2578 failure mode described in the design: temporarily collapsed `BaseResponseModel<T>` to a single non-discriminated type with `succeeded: boolean` and `data: T` (unconditional, no null branch) — `pnpm -C packages/domain exec tsc --noEmit` immediately reported `envelope.test.ts(39,1): error TS2578: Unused '@ts-expect-error' directive`, exactly as the ADR predicts. A shallower collapse attempt (widening only `succeeded` to `boolean` while keeping `data: T | null` on both branches) does NOT trigger TS2578 — the probe specifically catches the dangerous case (narrowing fully lost, `data` no longer provably nullable on failure), not every possible type edit. Tree restored clean after the experiment (`git status --short` empty).

### admin-owners-resellers/spec.md (5 requirements, 6 sites in owner-list.tsx / owner-edit.tsx×3 / reseller-list.tsx)

| Requirement | Evidence | Status |
|---|---|---|
| Owner List Surfaces succeeded:false via OWNER.ERROR | `owner-list.tsx:20-23`, test `owner-list.test.tsx` "shows OWNER.ERROR when listOwners resolves with succeeded:false" — real regression test (asserts alert+text) | PASS |
| Owner Edit Load Surfaces succeeded:false via OWNER.ERROR | `owner-edit.tsx:147-151` | PASS, see anomaly note below |
| Owner Edit Reseller Dropdown Preserves Silent-Failure Idiom | `owner-edit.tsx:172-173` `if (!res.succeeded) return;`, no new state/UI; test confirms `select.options.length === 1` (placeholder only), no alert | PASS |
| Owner Edit Stores Tab Surfaces succeeded:false via storesError | `owner-edit.tsx:88-91`, uses `setStoresError`/`STORES.ERROR`, NOT `loadError`; test confirms exactly 1 alert on screen (the dedicated one) | PASS |
| Reseller List Surfaces succeeded:false via RESELLERS.ERROR | `reseller-list.tsx:20-23`, real regression test | PASS |

### admin-stores/spec.md

| Requirement | Evidence | Status |
|---|---|---|
| Store List Surfaces succeeded:false via STORES.ERROR | `store-list.tsx:29-32`, real regression test | PASS |

### management-users/spec.md

| Requirement | Evidence | Status |
|---|---|---|
| Users List Surfaces succeeded:false via USERS.ERROR (.then/.catch idiom) | `user-list.tsx:26-29` inside `.then`, real regression test | PASS |
| succeeded:true still populates users (regression scenario) | dedicated test "succeeded:true still populates users (regression)" | PASS |

## Anomaly Judged (item 9 — owner-edit `getOwner` RED test, task 3.1)

Independently reproduced the apply-agent's honest report. I reverted the `getOwner` guard in `owner-edit.tsx` (restoring `const o = res.data as Owner;` with no `succeeded` check) and re-ran the exact test `owner-edit.test.tsx > "shows OWNER.ERROR and does not populate form fields when getOwner resolves with succeeded:false"` in isolation: **it still passes** (1 passed / 37 skipped). Root cause confirmed: `owner` state starts `null`-adjacent (`o` is `null` on the failure branch), `o.fullName` throws synchronously inside `.then`, and the adjacent `.catch` swallows it into the same `OWNER.ERROR` outcome the guard would have produced directly. Tree restored clean after the experiment.

**Judgment**: the shipped test is **not a valid runtime regression test** for this specific guard — it cannot distinguish "guard present" from "guard absent, relying on the CFA/`.catch` fallthrough." However, it is **not a defect that blocks archive**, because:
1. The real regression protection here is the **type system**, not the test: after WU-D's union flip, `res.data` on the failure branch is `null`, so `o.fullName` without the guard is `Object is possibly null` (TS18047) — a `pnpm typecheck` failure, not a silent runtime bug. Removing the guard today would fail CI at the type-check gate, independent of this test.
2. The guard itself is correct and spec-compliant (mirrors the file's own `.catch` idiom, same message, no new UI).
3. Apply's own progress note flagged this exact issue proactively rather than hiding it.

**WARNING** (not CRITICAL): the test's assertion should be strengthened (e.g., spy on `setFullName`/`setOwner` to prove they're never called, or assert a distinguishing side effect) so it has value independent of the type-checker. Low priority — recommend as a follow-up, not a blocker.

## 37 Unscoped Guards — Idiom Audit

Reviewed all 18 production call-sites named in the task brief plus the 2 `packages/domain` fixture-only "services" (see note below) against each file's pre-existing error idiom:

| File | Guard shape | Verdict |
|---|---|---|
| `owner-create.tsx:55` | `if (!res.succeeded) return;` — mirrors file's pre-existing "non-critical" silent comment | Matches existing idiom |
| `reseller-edit.tsx:79-82` | `setLoadError(RESELLERS.ERROR)` — reuses pre-existing `loadError` state, same as `.catch` branch | Matches existing idiom, no new state/key |
| `expenses-history.tsx:99`, `today-expenses.tsx:32` | Silent `if (!x.succeeded) return;`, comment explains the offline service is a same-tick success-only wrapper | Verified against `ExpenseOfflineService` source — claim is accurate, guard is type-safety only |
| `available.tsx:32-35`, `today-entries.tsx:42-45`, `today-quantities.tsx:86-101`, `today-sales-profit.tsx:109-112` | Silent early-return, comment claims sync local-storage read never fails | Verified against `InventoryOfflineService.getInventoryCategoriesView`/`getInventoryEntriesInDay` source — both unconditionally `return success(...)`, claim accurate |
| `collections.tsx:30-33`, `reseller-commissions.tsx:31-34` | Visible `setError(BILLING.COLLECTIONS.ERROR / BILLING.COMMISSIONS.ERROR)` — reuses each file's own pre-existing catch-branch key | Matches existing idiom, keys confirmed pre-existing (no i18n diff) |
| `edit-store.tsx:52-55,86-89` | Visible `setLoadError`/`setCatalogError(STORES.ERROR)`; also swapped a bespoke `Promise.resolve({ data: [] as Owner[] })` fallback for the real `success([])` factory | Correct fix, not scope creep — the bespoke literal was structurally incompatible with the new union inside a `Promise.all` and had to become a real envelope; behavior for non-privileged users unchanged (still empty owners array) |
| `user-edit.tsx:37-40` | Visible `setLoadError(USERS.ERROR)`, reuses existing state | Matches existing idiom |
| `order-offline-service.ts:363-369` | Internal fallback `success(response.succeeded ? response.data : [])`, comment claims the underlying sync read never fails | Verified accurate; data-layer only, no user-facing change |
| `credits.tsx:65`, `today-credits.tsx:30`, `today-stats.tsx` (4 sites) | Silent guards on `SaleCreditOfflineService`/`OrderOfflineService`/`ExpenseOfflineService` same-tick wrappers | All comments claim "never actually fails"; consistent with the inventory/expense pattern already verified against source |

**No guard introduces new user-visible copy, new i18n keys, or new error UI beyond "stop setting null into state."** Confirmed via `git diff` on all i18n files (`es.ts` etc.) — zero lines changed.

**Minor documentation inaccuracy (SUGGESTION)**: apply-progress's phrase "the 2 `packages/domain` services" (in the 18-production-call-sites accounting) actually refers to `product-category-service.test.ts` and `product-service.test.ts` — a `FakeProductCategoryService` test double and an in-test narrowing site, not real production service implementations under `packages/domain/src/services/*.ts` (those files have zero diff). Cosmetic mislabel in the progress note only; no code impact.

## No Shortcut Silencing

- `git diff ea3b776..HEAD -- frontend-react` grepped for `as unknown as`, `as any`, `@ts-ignore`, `eslint-disable`, `.data!`, `succeeded!` on added lines: **zero matches**.
- The 6 dead `Awaited<ReturnType<...>> as unknown as ...` casts removed in `5290a72` were confirmed genuinely dead: they existed only because WU-A/B/C landed before WU-D's union flip, when `data: null` was untypeable under the old interface; the union now admits those fixtures directly with no cast. Diff-verified per-file (owner-edit.test.tsx×3, owner-list.test.tsx, reseller-list.test.tsx, store-list.test.tsx).
- The one surviving `as unknown as StoresLastWeekResponse` cast in `dashboard.test.tsx:349` predates this change (last touched in unrelated commit `f6116e0`, file has zero diff in this change) and is unrelated to `BaseResponseModel` — correctly left alone.
- No new `eslint-disable` comments anywhere in the diff.

## Union Collapse Check (item 8)

- `app/shared/lib/auth/__tests__/user-home.test.ts:38-40` — the known unannotated helper is now annotated `function envelope(data: boolean): BaseResponseModel<boolean>`. Confirmed via diff.
- `register.test.tsx:85-92` — a second unannotated inline object type (`{ succeeded: boolean; data: {...}; ... }`) for a `resolveRegister` promise executor was also replaced with `BaseResponseModel<RegisterAuthModel>`. This was not explicitly called out in the task list under 4.4 but is the same collapse-risk class; correctly fixed as part of 4.5's scope.
- `pnpm typecheck` passing 0 errors across 5 packages, combined with the independently-reproduced ADR-3 probe behavior, is strong evidence no other envelope-returning helper was left with a widened `boolean` discriminant — any such helper assigned to (or checked against) a `BaseResponseModel<T>`-typed context would fail to compile.

## envelope.ts Factories (item 6)

`success()` still emits `message: ''`, `actionCode: 200`; `failure()` still emits `message: ''`, `actionCode: 400` — unchanged from before, per the spec's Resolved Question. Only `data: null as unknown as T` → `data: null` changed. Confirmed via direct file read.

## Issues

### CRITICAL
None.

### WARNING
1. **`owner-edit.tsx` `getOwner` RED test (task 3.1) does not discriminate guard-present vs guard-absent at runtime** — independently reproduced (see Anomaly section above). Mitigated by the type system (WU-D makes the unguarded access a compile error), so not a functional gap, but the test provides false confidence as a standalone regression guard. Recommend strengthening in a follow-up (spy on setters or assert a distinguishing side effect), not a blocker for archive.

### SUGGESTION
1. Apply-progress's "2 packages/domain services" label is a minor mislabel — they are test-only fixtures (`product-category-service.test.ts`, `product-service.test.ts`), not production service files. Cosmetic only; correct the memory note for clarity if convenient, no code action needed.
2. Task 5.1 remains correctly unchecked; sdd-archive must actually perform the 3-line correction (`frontend-react/openspec/specs/admin/spec.md:312,596,1114`) before this change can be considered fully closed — flagging so it isn't silently dropped.

## Final Verdict

**PASS WITH WARNINGS.** All spec requirements across all 4 spec files are satisfied by real code with passing tests (except the one test-quality WARNING noted above, which does not indicate incorrect behavior). All three gates (typecheck/test/lint) independently re-run and green. No unsafe casts, no new i18n keys, no unauthorized UX changes across the 37 unscoped guards — every one traced to and matching its file's pre-existing idiom or a verified "never fails" data-layer fact. The `owner-edit.tsx` `listResellers` silence constraint holds exactly. The ADR-3 collapse probe is proven load-bearing by direct reproduction of TS2578. Ready for `sdd-archive`, which must still perform the deferred task 5.1 spec correction.

---

## Post-Verify Update (recorded by sdd-archive)

After this report was written, the orchestrator addressed the WARNING directly: commit `bcf8aea` added a type-level `@ts-expect-error` probe in `owner-edit.tsx`'s test/source pairing that asserts the guard where the compiler enforces it (replacing reliance on the runtime `.catch`-swallow fallthrough), and commit `5290a72` removed 6 dead pre-union casts (already anticipated by this report's "No Shortcut Silencing" section). Gates re-confirmed green at final HEAD `a9288bb`: typecheck 5/5, test 2173/2173 (155 files), lint --max-warnings=0 4/4. The WARNING above is considered RESOLVED as of that commit; this file is otherwise preserved verbatim as the audit trail of the verify phase.
