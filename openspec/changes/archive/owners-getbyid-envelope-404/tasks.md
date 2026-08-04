# Tasks: Owner GetById Envelope 404/403 Classification

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150-200 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single branch, commits-only (no PR split needed) |
| Delivery strategy | commits-only on `feat/owners-getbyid-envelope-404`, 2 work-unit commits |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Widen `ownerErrorMessageId` to read envelope `actionCode` | commit only | `owner-error-message.ts` + `.test.ts`; independent, no PR (commits-only delivery) |
| 2 | Rewire `owner-edit.tsx` load effect through the widened helper | commit only | `owner-edit.tsx` + `owner-edit.test.tsx`; depends on Unit 1 |

## Phase 1: Helper — `owner-error-message.ts` (D-1, D-4)

- [x] 1.1 RED: add 5 unit tests to `owner-error-message.test.ts` — envelope `{succeeded:false, actionCode:404}` maps; `actionCode:null` → `OWNER.ERROR`; unmapped `actionCode:400` → `OWNER.ERROR`; `{succeeded:true, actionCode:404}` → `OWNER.ERROR` (the `succeeded===false` gate); `{response:{status:403}, succeeded:false, actionCode:404}` → 403 wins (D-1 precedence). Observed RED: only case 1 (`actionCode:404` mapping) genuinely fails against the pre-implementation helper (`expected 'OWNER.ERROR' to be 'OWNER.NOT_FOUND'`); cases 2-5 incidentally pass against the old code because it already defaults to `OWNER.ERROR` when there's no `response.status`, and already honors `response.status` when present — the "5 fail" in the task text overstates it, but the meaningful new-behavior case is confirmed RED.
- [x] 1.2 GREEN: `owner-error-message.ts` has the second top-level-only `actionCode` probe (D-1) and `typeof status === 'number'` (D-4). Signature unchanged. No `.test-d.ts` added (D-2).
- [x] 1.3 Confirmed: the 5 pre-existing helper tests (rejection channel) stay green, unedited.
- [x] 1.4 Committed work unit 1: `feat(owners): read actionCode off getOwner failure envelope` (05e4db2).

## Phase 2: Load path — `owner-edit.tsx` (D-3)

- [x] 2.1 RED: 2 integration tests in `owner-edit.test.tsx` — load resolves `{succeeded:false, actionCode:404}` → `OWNER.NOT_FOUND`; load resolves `{succeeded:false, actionCode:403}` → `OWNER.FORBIDDEN`. Observed RED (verified by reverting `owner-edit.tsx` to pre-implementation): both fail with `TestingLibraryElementError: Unable to find an element with the text: ...` — the page renders the old unconditional "Ocurrió un error. Intentá de nuevo." (`OWNER.ERROR`) instead.
- [x] 2.2 RED, observed failing on its own merits: 1 integration test — `getOwner` rejects with `error.response.status === 404` → `OWNER.NOT_FOUND`. Observed RED (same revert): fails identically — old `.catch` at `owner-edit.tsx:166-168` took no parameter and was unconditional, always rendering `OWNER.ERROR`.
- [x] 2.3 GREEN: module-level `const LOAD_ERROR_KEYS: Record<number, string> = { 404: 'OWNER.NOT_FOUND', 403: 'OWNER.FORBIDDEN' }` in `owner-edit.tsx`; both the `!res.succeeded` arm and `.catch((error) => …)` call `ownerErrorMessageId(x, LOAD_ERROR_KEYS)`.
- [x] 2.4 Confirmed: `owner-edit.test.tsx:1070` (`actionCode:null` → `OWNER.ERROR`) and all FE-OC2 `owner-create.tsx` tests stay green, unedited (46/49 owner-edit tests passed even in the pre-implementation revert probe; full suite green post-restore).
- [x] 2.5 Committed work unit 2: `feat(owners): classify owner-edit load errors via actionCode/status map` (389c059).

## Phase 3: Gates

- [x] 3.1 `npx turbo run test --force` — 176/176 test files, 2328/2328 tests passed, `Type Errors no errors`.
- [x] 3.2 `pnpm -C apps/web-store-pos exec tsc --noEmit` — clean (no output).
- [x] 3.3 `npx turbo run lint --force` — 4/4 packages passed, clean.

**Apply note**: Both work-unit commits (05e4db2, 389c059) already existed on `feat/owners-getbyid-envelope-404` when this apply batch started, matching the tasks' commit messages exactly. This batch's job was verification: (a) confirmed committed code matches design D-1..D-4 and spec scenarios exactly; (b) manufactured genuine RED evidence retroactively by temporarily reverting the two implementation files (keeping the new tests) and re-running, then restored byte-identical to the committed state (`git status` clean after restore); (c) ran all three gates fresh with `--force`.

Out of scope, do not task: `owner-edit.tsx:214-217` (submit path), `owner-create.tsx` FE-OC2 classification.
