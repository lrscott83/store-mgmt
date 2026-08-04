# Verification Report: owners-contract-frontend

**Change**: `owners-contract-frontend`
**Branch**: `feat/owners-contract-frontend` (7 commits, cut from `main` @ `d784a04`)
**Mode**: hybrid (filesystem canonical + Engram)
**Strict TDD**: active — test runner `pnpm test` (Turborepo → Vitest), typecheck `pnpm -C apps/web-store-pos exec tsc --noEmit` (separate gate)
**Verdict**: **PASS**

## Completeness (tasks.md)

All 26 boxes ticked across Phases 0–6. Verified against real code and git history, not just the checkbox state.

| Phase | Task | Claim | Verified |
|---|---|---|---|
| 0 | 0.1 | Branch created from `main` @ `d784a04` | TRUE — `git log d784a04..HEAD` shows 7 commits, first is the SDD-docs commit |
| 1 | 1.1–1.4 | `owner-http-service.ts` generics widened to `BaseResponseModel<Owner>`; RED via `tsc --noEmit` | TRUE — both `createOwner`/`updateOwner` return `Promise<BaseResponseModel<Owner>>` (lines 39, 47); RED-via-typecheck deviation is disclosed, see below |
| 2 | 2.1–2.2 | `owner-error-message.ts` new classifier, structural read, no axios import | TRUE — file has zero imports, reads `(error as {response?:{status?:number}})?.response?.status` |
| 3 | 3.1–3.7 | Create classifies 409/403, regression kept | TRUE — see D2/D3 below |
| 4 | 4.1–4.6 | Edit classifies 404/403, snapshot from `res.data`, regression kept | TRUE — see D3/D4 below |
| 5 | 5.1–5.3 | 500/401 untouched, `api-client.ts` zero-diff | TRUE for create page and for the interceptor file itself; **no equivalent 401/500 test exists for `owner-edit.test.tsx`** — see SUGGESTION below |
| 6 | 6.1–6.4 | typecheck/test/lint gates, 5 WU commits | TRUE — reproduced independently, see Gate Evidence |

## Gate Evidence (reproduced independently, not trusted from apply-progress)

- **`pnpm -C apps/web-store-pos exec tsc --noEmit`** → exit 0, no output. Matches task 6.1 and design.md's D6 RED signal.
- **`npx turbo run test --force`** (cache bypassed, fresh execution) → `Test Files 175 passed (175)`, `Tests 2316 passed (2316)`. Matches apply-progress's reported baseline delta (174/2300 → 175/2316, +16 new tests, 0 removed, 0 skipped).
- **`npx turbo run lint --force`** (cache bypassed) → all 4 packages report `eslint . --max-warnings=0` with no findings, exit 0.

No test was found deleted, skipped, or weakened. Diffed every pre-existing test file the branch touched:
- `owner-http-service.test.ts`: two pre-existing assertions (`expect(result.data).toBe('')` / `.toBe(true)`) were replaced with Owner-shaped assertions (`result.data.id`, `.fullName`, `.reSellerName`) — this is a *strengthening* (the old assertions were tautological against a lying generic), not a weakening. Renamed to describe the new, true behavior.
- `owner-create.test.tsx` / `owner-edit.test.tsx`: the one pre-existing fixture each (`data: ''` / `data: true`) was mechanically swapped for an `Owner`-shaped fixture (`makeOwner()`) to keep compiling against the widened generic; no assertion in the surrounding test was touched. All new tests (FE-OC2/3/4/6) are additive `describe` blocks appended after existing ones. Regression tests named in tasks 3.7/4.6 (`S-ADMIN-OWNERS-CREATE-7`, the `succeeded: false` guard tests) are still present and unmodified in behavior.

## Spec Compliance Matrix (specs/admin-owners-resellers/spec.md)

| Req | Scenario | Status | Evidence |
|---|---|---|---|
| FE-OC1 | 1. Create returns entity | PASS | `owner-http-service.test.ts` — asserts `result.data.id`/`.fullName`/`.reSellerName` on a 201-shaped mock |
| FE-OC1 | 2. Update returns entity | PASS | same file — asserts `result.data.fullName` on updateOwner |
| FE-OC1 | 3. Types compile | PASS | `tsc --noEmit` exit 0 (reproduced) |
| FE-OC2 | 1. 409 duplicate login | PASS | `owner-create.test.tsx` "FE-OC2: classified rejections" — asserts `OWNER.DUPLICATE_LOGIN`, no navigate |
| FE-OC2 | 2. 403 forbidden | PASS | same describe block, 403 case |
| FE-OC2 | 3. Unclassified (400) | PASS | same, 400 → `OWNER.ERROR` |
| FE-OC2 | 4. Network failure | PASS | same, no-`response` rejection → `OWNER.ERROR` |
| FE-OC2 | 5. Success unchanged | PASS | pre-existing `S-ADMIN-OWNERS-CREATE-7`, still green, navigates to `/management/stores/create` |
| FE-OC3 | 1. 404 owner deleted | PASS | `owner-edit.test.tsx` "FE-OC3: classified rejections" — `OWNER.NOT_FOUND`, form stays mounted |
| FE-OC3 | 2. 403 forbidden | PASS | same, 403 case |
| FE-OC3 | 3. Unclassified (400) | PASS | same, 400 → `OWNER.ERROR` |
| FE-OC3 | 4. Network failure | PASS | same, no-`response` → `OWNER.ERROR` |
| FE-OC4 | 1. Snapshot from response | PASS | "FE-OC4: snapshot and form rehydrate from res.data" — types `'Typed Name'`, server returns `'Server Normalised Name'`, field re-seeds to server value, submit button disabled (not dirty) |
| FE-OC4 | 2. Stays on page | PASS | no `navigate` call asserted/exercised in the update success path (ADR-5 preserved; no regression introduced) |
| FE-OC5 | 1. Keys resolve | PASS | `es.ts` diff adds exactly the 3 keys beside the existing `OWNER.*` block; full suite (which exercises react-intl rendering) is green with no missing-message warnings surfaced as failures |
| FE-OC6 | 1. 500 not double-reported | PASS (create) / **UNTESTED (edit)** | `owner-create.test.tsx` "FE-OC6: untouched paths" asserts `OWNER.ERROR` + exactly 1 `role="alert"` on a 500 rejection; **no equivalent test exists in `owner-edit.test.tsx`** |
| FE-OC6 | 2. 401 does not end session | PASS (create) / **UNTESTED (edit)** | `owner-create.test.tsx` asserts `authStore.logout` not called on a 401 rejection from `createOwner`; **no equivalent assertion exists for `updateOwner`** |

The FE-OC6 gap on the edit page is a real test-coverage gap against the letter of the spec (which writes "`createOwner`/`updateOwner`" together in both scenarios). It is downgraded from CRITICAL to SUGGESTION for two reasons, both independently verified rather than assumed:
1. `git diff d784a04...HEAD -- .../api-client.ts` is empty — the interceptor itself (the thing FE-OC6 actually protects) has zero diff on the whole branch. This is the strongest possible evidence for FE-OC6, and it does not depend on which page exercises it.
2. `owner-edit.tsx`'s catch block uses the exact same `ownerErrorMessageId` helper with the exact same fallback (`'OWNER.ERROR'` for any unmapped status, including 500/401), already unit-tested in isolation by `owner-error-message.test.ts` (5/5 passing, covers mapped/unmapped/no-response/undefined/null). There is no route-specific branching that could make the edit page behave differently from create for these two statuses.

## Design Coherence (design.md D1–D6)

| Decision | Compliant | Evidence |
|---|---|---|
| D1 — structural read, no axios import | YES | `owner-error-message.ts` has zero imports; reads `error.response?.status` via a type assertion, not `axios.isAxiosError` |
| D2 — one local helper, explicit map per call site (no shared constant) | YES | `owner-error-message.ts` exports a generic `(error, byStatus)` function with no baked-in map. `owner-create.tsx:106-109` passes `{409:'OWNER.DUPLICATE_LOGIN', 403:'OWNER.FORBIDDEN'}` inline; `owner-edit.tsx:236-239` passes `{404:'OWNER.NOT_FOUND', 403:'OWNER.FORBIDDEN'}` inline. No shared status→key constant/table exists anywhere in the diff (grepped `owner-error-message.ts` content and both call sites directly) |
| D3 — keep `!res.succeeded` guard, classification is additive | YES | `owner-create.tsx:97-100` and `owner-edit.tsx:214-217` both still guard on `!res.succeeded` before the `catch`-based classification path; regression tests for both (`succeeded: false` fixtures) still present and green in both test files |
| D4 — rehydrate BOTH form fields and snapshot from `res.data` | YES | `owner-edit.tsx:224-232`: `const saved = res.data;` then `setOwner(saved)`, `setFullName(saved.fullName)`, `setCellPhone`, `setEmail`, `setDescription`, `setIsActive`, `setReSellerId`, and finally `setSnapshot(makeSnapshot(saved))` — matches D4 exactly, including the `setOwner` inclusion rationale (keeps the non-SuperAdmin fallbacks at lines 209/211 reading the persisted entity) |
| D5 — `api-client.ts` untouched | YES | `git diff d784a04...HEAD -- .../api-client.ts` → empty (0 lines). Confirmed the file exists and was not renamed/moved either (path unchanged) |
| D6 — RED-before-GREEN test order | YES, with disclosed deviation | See below |

## Disclosed Deviation: Phase 1 RED signal (context only, not blocking)

Task 1.4 specifies `pnpm typecheck` as the RED/GREEN signal for Phase 1, and that is exactly what was used. The apply-progress record additionally explains *why* `pnpm test` could not have served as the RED signal for this specific step: Vitest's esbuild transform strips TypeScript types without type-checking them, so a purely type-level lie (`BaseResponseModel<string>` vs. the real `Owner` shape) does not fail at runtime when the mock fixture's shape happens to satisfy both the lying and the true type. This was independently verified as plausible by inspecting the pre-change generic and the test file's use of literal fixtures — the assertion `expect(result.data).toBe('')` would run and pass under `<string>` and also would not throw under `<Owner>` since `data` was literally set to `''` in the mock; only `tsc --noEmit` catches the field-access mismatch. The task itself names `tsc --noEmit`/`pnpm typecheck` as its own gate, so this is not a deviation from what was asked — it is the correct application of task 1.4, called out for transparency. The user has already accepted this as known context and filed adopting Vitest's typecheck mode as separate future work.

**Classification**: SUGGESTION (context/process note only, not re-litigated, does not block).

## Issues

### CRITICAL
None.

### WARNING
None.

### SUGGESTION
1. **FE-OC6 edit-page test coverage gap.** `owner-edit.test.tsx` has no 500/401 test mirroring the ones added to `owner-create.test.tsx`. The guarantee is still true (proven via `api-client.ts` zero-diff + the shared, unit-tested classifier's fallback behavior), but a spec scenario written as "`createOwner`/`updateOwner`" is only runtime-verified for one of the two entry points. Recommend adding the symmetric pair of tests to `owner-edit.test.tsx` in a follow-up so both routes have direct, not inferred, coverage.
2. **Phase 1 RED-via-`tsc` instead of RED-via-`pnpm test`.** Already disclosed and accepted by the user; documented above for the permanent record. Filed future work: adopt Vitest's typecheck mode so `pnpm test` itself can observe type-only regressions.
3. **Diff size vs. forecast.** tasks.md forecast ~230–290 changed lines; actual is ~408 (`git diff --stat` total across the 9 non-docs files). Not a budget-gate violation (project delivery rule is commits-only on a feature branch, no PR/400-line gate applies here — confirmed by tasks.md's own Review Workload Forecast: "Chained PRs recommended: No", "Decision needed before apply: No"), but noting the variance for future estimation calibration.

## Final Verdict

**PASS.** All 6 spec requirements (FE-OC1–FE-OC6) are implemented and behaviorally verified by a freshly-executed, non-cached test run (175 files / 2316 tests, 0 failures, 0 skips, +16 net new tests vs. the 174/2300 baseline — no regression, no weakened assertion in any pre-existing test file). All 6 design decisions (D1–D6) are honored in the actual diff, including the two claims flagged for extra suspicion (D2's per-call-site map with no shared constant, and D4's rehydration of both fields and snapshot from the server response). `api-client.ts` has a verified zero diff across the whole branch — the FE-OC6 guarantee holds at the file level even though page-level test coverage of it is asymmetric between create and edit (SUGGESTION, not blocking). `tsc --noEmit` and `pnpm lint` both pass with zero findings, reproduced independently rather than trusted from the apply report.

## Follow-up

**SUGGESTION #1 — CLOSED.** Added the symmetric 500/401 pair to `owner-edit.test.tsx` ("FE-OC6: untouched paths" describe block, mirroring `owner-create.test.tsx` 1:1): a 500 rejection from `updateOwner` shows `OWNER.ERROR` with exactly one `role="alert"` region (no second dialog raised by the component), and a 401 rejection leaves the mocked auth store's `logout` uncalled. Both are characterization tests — no production code changed (`owner-edit.tsx` and `api-client.ts` have zero diff for this follow-up). Both tests passed on first run, confirming the report's downgrade from CRITICAL to SUGGESTION was correct: the shared `ownerErrorMessage` classifier's unmapped-status fallback and the untouched interceptor already provided the guarantee — this follow-up only adds direct runtime coverage for the edit entry point. Gates reproduced: `tsc --noEmit` exit 0; `turbo run test --force` → 175 files / 2318 tests (+2 vs. prior 2316), 0 failures; `turbo run lint --force` clean.

