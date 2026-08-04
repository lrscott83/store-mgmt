# Tasks: owners-contract-frontend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~230–290 (about half tests) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single slice |
| Delivery strategy | commits-only on a feature branch (project rule — no PR, no size:exception) |
| Chain strategy | n/a |

Decision needed before apply: No

### Suggested Work Units

| Unit | Goal | Focused test command | Rollback boundary |
|------|------|----------------------|-------------------|
| 1 | Response types tell the truth (FE-OC1) | `pnpm test owner-http-service` | 1 source + 1 test file |
| 2 | The status classifier exists (FE-OC2/3 foundation) | `pnpm test owner-error-message` | 1 new source + 1 new test file |
| 3 | Create surfaces 409/403 (FE-OC2, FE-OC5) | `pnpm test owner-create` | `owner-create.tsx` + `es.ts` |
| 4 | Update surfaces 404/403 + snapshot from response (FE-OC3, FE-OC4) | `pnpm test owner-edit` | `owner-edit.tsx` |
| 5 | The untouched paths stay untouched (FE-OC6) | `pnpm test owner-` | test files only |

Branch: create from the current HEAD (`main`), per project rule.

## Phase 0: Setup

- [x] 0.1 Create the feature branch from current HEAD: `git checkout -b feat/owners-contract-frontend`

## Phase 1: Response types (FE-OC1) — WU1

- [x] 1.1 RED — `owner-http-service.test.ts`: in the create suite, assert the resolved `res.data` is an `Owner` (`data.id`, `data.fullName`, `data.reSellerName` readable). Expect a type error / failure against the `BaseResponseModel<string>` generic.
- [x] 1.2 RED — same file, update suite: assert `res.data` is an `Owner` rather than `true`.
- [x] 1.3 GREEN — `owner-http-service.ts:39,47`: change both generics to `BaseResponseModel<Owner>`; import `Owner` from `@store-mgmt/domain` (already imported at line 1).
- [x] 1.4 `pnpm typecheck` — 0 errors. Any call site reading `data` as `string`/`boolean` surfaces here (expected: none).

## Phase 2: The classifier (D2) — WU2

- [x] 2.1 RED — new `admin/owners/lib/__tests__/owner-error-message.test.ts`: mapped status returns its key; unmapped status returns `OWNER.ERROR`; an error with no `response` (network) returns `OWNER.ERROR`; `undefined`/`null` error returns `OWNER.ERROR`.
- [x] 2.2 GREEN — new `admin/owners/lib/owner-error-message.ts` with `ownerErrorMessageId(error, byStatus)` exactly as designed in D2 (structural read, no axios import).

## Phase 3: Create page (FE-OC2, FE-OC5) — WU3

- [x] 3.1 RED — `owner-create.test.tsx`: `createOwner` rejects with `{ response: { status: 409 } }` → the `role="alert"` region shows the `OWNER.DUPLICATE_LOGIN` copy and `navigate` was NOT called.
- [x] 3.2 RED — same, `status: 403` → `OWNER.FORBIDDEN`.
- [x] 3.3 RED — same, `status: 400` → `OWNER.ERROR` (unclassified stays generic).
- [x] 3.4 RED — same, rejection with no `response` → `OWNER.ERROR` (a transport failure is never a business failure).
- [x] 3.5 GREEN — `es.ts`: add `OWNER.DUPLICATE_LOGIN` ("Ese login ya está en uso. Elegí otro."), `OWNER.FORBIDDEN` ("No tenés permiso para esta acción."), `OWNER.NOT_FOUND` ("El propietario no existe o fue eliminado."), beside the existing `OWNER.*` block (~line 763).
- [x] 3.6 GREEN — `owner-create.tsx:102-104`: in the `catch`, `setServerError(intl.formatMessage({ id: ownerErrorMessageId(error, { 409: 'OWNER.DUPLICATE_LOGIN', 403: 'OWNER.FORBIDDEN' }) }))`. Bind the caught error (`catch (error)`).
- [x] 3.7 Regression — the existing success test (S-ADMIN-OWNERS-CREATE-7) and the `!res.succeeded` test both still pass, unmodified. The guard at `owner-create.tsx:96-99` is NOT removed (D3).

## Phase 4: Edit page (FE-OC3, FE-OC4) — WU4

- [x] 4.1 RED — `owner-edit.test.tsx`: `updateOwner` rejects with `status: 404` → `OWNER.NOT_FOUND` shown, form still mounted.
- [x] 4.2 RED — same, `status: 403` → `OWNER.FORBIDDEN`; `status: 400` → `OWNER.ERROR`; no `response` → `OWNER.ERROR`.
- [x] 4.3 RED — `updateOwner` resolves with an `Owner` whose `fullName` differs from the typed value → after save, the field shows the server value and the submit button is disabled (not dirty).
- [x] 4.4 GREEN — `owner-edit.tsx:220-222`: classify in the `catch` with `{ 404: 'OWNER.NOT_FOUND', 403: 'OWNER.FORBIDDEN' }`.
- [x] 4.5 GREEN — `owner-edit.tsx:218-219`: on success, re-seed `fullName`/`cellPhone`/`email`/`description`/`isActive`/`reSellerId` from `res.data`, call `setOwner(res.data)`, and replace the hand-built snapshot with `setSnapshot(makeSnapshot(res.data))` (D4).
- [x] 4.6 Regression — the stays-on-page behaviour (ADR-5) and the existing payload-shape tests pass unmodified; the `!res.succeeded` guard stays (D3).

## Phase 5: The paths that must NOT change (FE-OC6) — WU5

- [ ] 5.1 `owner-create.test.tsx`: reject with `status: 500` → the page shows `OWNER.ERROR` and raises no dialog of its own (the interceptor's dialog is out of the component's scope and is not asserted here).
- [ ] 5.2 A 401 rejection leaves the auth store untouched — no logout, no redirect. Assert against the mocked store.
- [ ] 5.3 Confirm `api-client.ts` has zero diff in this change.

## Phase 6: Gates

- [ ] 6.1 `pnpm typecheck` from `frontend-react/` — 0 errors.
- [ ] 6.2 `pnpm test` from `frontend-react/` — full suite green, no reduction in count.
- [ ] 6.3 `pnpm lint` from `frontend-react/` — clean.
- [ ] 6.4 Commit per work unit (5 commits), conventional messages, no PR.
