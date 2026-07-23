# Tasks: toast-notifications-parity

**Change:** toast-notifications-parity
**Phase:** Tasks
**Status:** Applied
**Mode:** OpenSpec
**Strict TDD:** ACTIVE — every implementation task is preceded by its RED test task. Test runner:
`npx vitest run <file>` (run from `frontend-react/apps/web-store-pos`).

Legend: `[P]` = can run in parallel with sibling `[P]` tasks in the same work unit (no shared file);
unmarked = sequential (touches a file another task in the unit also touches, or depends on prior output).

---

## WU0 — Dependency + container plumbing (sequential, blocks everything else)

- [x] **T0.1** Add `react-toastify` to `apps/web-store-pos/package.json` `dependencies` (per design
      §1.1: `^11.0.5` or newer React-19-compatible major). Install it (`npm install` / workspace
      equivalent) so the package is actually resolvable, not just declared.
      _Satisfies: TOAST-CONTAINER (prerequisite), design §1.1._
- [x] **T0.2** Confirm the installed package's CSS export path (inspect
      `node_modules/react-toastify/package.json` `exports` map). Record whether it is
      `react-toastify/ReactToastify.css` (v11) or `react-toastify/dist/ReactToastify.css` (older) —
      use whichever the installed version actually exposes.
      _Satisfies: design §1.2 apply note; risk "CSS import subpath" in design.md._

### RED → GREEN: ToastContainer mount

- [x] **T0.3** [RED] Write/extend `app/__tests__/root.test.tsx`: mock `react-toastify` with a
      recording stub `ToastContainer` component (per design §5.2), render `Layout`, and assert
      `containerProps` was called with `expect.objectContaining({ position: 'top-right',
      autoClose: 1000, closeButton: true })`. Run `npx vitest run app/__tests__/root.test.tsx` and
      confirm it FAILS (container not mounted yet).
      _Satisfies: TOAST-CONTAINER scenario "Container mounted once with Angular-equivalent config"._
- [x] **T0.4** [GREEN] In `apps/web-store-pos/app/root.tsx`: add
      `import 'react-toastify/<confirmed-path-from-T0.2>';` and
      `import { ToastContainer } from 'react-toastify';` near the existing CSS import (root.tsx:21);
      mount `<ToastContainer position="top-right" autoClose={1000} closeButton />` in `Layout`'s
      `<body>` next to `<I18nProvider>` (root.tsx:56), per design §1.3. Re-run T0.3's test — confirm
      GREEN. Run the full existing `root.test.tsx` suite to confirm no regression.
      _Satisfies: TOAST-CONTAINER._

---

## WU1 — Toast helper module (sequential; depends on WU0 for the package, not the container)

### RED → GREEN: `shared/lib/toast.tsx` helper

- [x] **T1.1** [RED] Create `app/shared/lib/__tests__/toast.test.tsx`. Mock `react-toastify`'s
      `toast.success`/`toast.error` (per design §5.1). Write failing cases:
      - `showToastSuccess('msg')` → `toast.success` called with content resolving to `'msg'` and
        `{ toastId: 'msg' }`, no title rendered.
      - `showToastSuccess('msg', 'Éxito')` → content renders both `'Éxito'` and `'msg'`;
        `toastId: 'msg'`.
      - `showToastError('msg', 'Error')` → `toast.error` called with title+message content;
        `toastId: 'msg'`.
      - Dedupe-intent case: two `showToastSuccess` calls with different messages but the SAME title
        produce two DISTINCT `toastId`s (proves message-keying, not title-keying).
      Run `npx vitest run app/shared/lib/__tests__/toast.test.tsx` — confirm it FAILS (module doesn't
      exist yet).
      _Satisfies: TOAST-HELPER all scenarios; design §5.1, ADR-3._
- [x] **T1.2** [GREEN] Create `app/shared/lib/toast.tsx` per design §2.2: `toastContent(message,
      title?)` helper rendering bare message (no title) or a `<div>` with bold title + message
      (with title); `showToastSuccess(message, title?)` → `toast.success(toastContent(...), {
      toastId: message })`; `showToastError(message, title?)` → `toast.error(...)` with the same
      shape (note: spec's `TOAST-HELPER` signature marks `showToastError`'s title as required —
      match the design's implementation signature but ensure every call site in WU2 always passes a
      title for error calls, since design.md's code sample uses `title?`). Re-run T1.1 — confirm
      GREEN.
      _Satisfies: TOAST-HELPER; design §2.1-2.3, ADR-2._

### RED → GREEN: new i18n key

- [x] **T1.3** [RED] [P] Add/extend an i18n catalog assertion (small test in
      `app/shared/lib/__tests__/toast.test.tsx` or a dedicated `es.test.ts` — reuse whichever exists
      for `es.ts` if one does, otherwise add inline) asserting
      `esMessages['GENERAL.RESPONSE.SUCCESS_TITLE'] === 'Éxito'`. Run it — confirm it FAILS (key
      absent).
      _Satisfies: TOAST-I18N scenario "New key resolves at runtime"._
- [x] **T1.4** [GREEN] [P] Add `'GENERAL.RESPONSE.SUCCESS_TITLE': 'Éxito',` to
      `app/shared/lib/i18n/es.ts` next to `GENERAL.RESPONSE.ERROR_TITLE` (es.ts:299). Re-run T1.3 —
      confirm GREEN. Diff-check that `SHOPPING_CART.ORDER_CREATED`, `SHOPPING_CART.ORDER_NOT_CREATED`,
      `SYNC.IMPORT_SUCCESS`, `FEATURES.FEATURES_ACTIVATED`, `FEATURES.UNEXPECTED_ERROR`,
      `GENERAL.RESPONSE.ERROR_TITLE` values are byte-unchanged.
      _Satisfies: TOAST-I18N scenario "Existing keys are unchanged"._

*(T1.3/T1.4 can run in parallel with T1.1/T1.2 — different files — but land the helper first if
doing them sequentially, since T1.1's test file is the natural home for the i18n assertion.)*

---

## WU2 — Call-site migrations (sequential per file; files are independent of each other so the
4 file-tracks marked `[P]` can be parallelized across engineers, but T2.0 (verification) MUST land
before starting the cart-shell failure-path task T2.5/T2.6)

### T2.0 — Verification gate (do this BEFORE T2.5/T2.6)

- [x] **T2.0** Read `frontend/src/app/presentation/layouts/client-layout/nav-bar/nav-right/nav-right.component.ts`
      `createOrder` (or equivalent order-creation handler) to confirm whether Angular's
      failure/exception path fires a single `toastrService.error(ORDER_NOT_CREATED, ...)` covering
      BOTH the `succeeded:false` branch and the thrown/caught-exception branch (design ADR-4
      assumption). Record the finding. If, and only if, Angular's exception path does something
      different (e.g. a different message, no toast, or a different key), implement cart-shell's
      `catch` branch to match what the source actually does — but regardless of outcome,
      `submitError` is still removed and no raw `err.message` is ever shown (design §3.1 is
      non-negotiable on that point).
      _Satisfies: design.md "Risks / open items" — #3 exception-path parity; ADR-4 verification note._

### Call site #1 — CSV import success (`sales/routes/products.tsx`) `[P]`

- [x] **T2.1** [RED] In `app/sales/routes/__tests__/products.test.tsx`: add
      `vi.mock('~/shared/lib/toast', () => ({ showToastSuccess: vi.fn(), showToastError: vi.fn() }))`.
      Rewrite the CSV-import-success assertion to expect
      `showToastSuccess` called with `` `Importados ${n} productos correctamente.` `` and no title,
      instead of `showBlockingSuccessMock`. Keep the existing `showBlockingInfo` ("ya existen")
      assertion for the duplicate-products case untouched. Run the file — confirm it FAILS.
      _Satisfies: TOAST-CALLSITES #1; TOAST-REMOVED-SURFACES #1._
- [x] **T2.2** [GREEN] In `app/sales/routes/products.tsx` (~line 223): remove `showBlockingSuccess`
      from the `~/shared/lib/blocking-alert` import (keep `showBlockingInfo`); add
      `import { showToastSuccess } from '~/shared/lib/toast';`; replace the `await
      showBlockingSuccess(...)` call with `showToastSuccess(\`Importados ${csvProducts.length}
      productos correctamente.\`)` (drop the `await`). Ensure the conditional `showBlockingInfo`
      dialog is no longer sequenced behind an awaited success call. Re-run T2.1 — confirm GREEN.
      _Satisfies: TOAST-CALLSITES #1; TOAST-REMOVED-SURFACES #1; design §3 row 1._

### Call site #2 + #3 — Cart order create success/failure (`shared/components/cart-shell.tsx`)

**#2 success (rewrite existing test):**

- [x] **T2.3** [RED] In `app/shared/components/__tests__/cart-shell.test.tsx`: replace the
      `blocking-alert` mock's `showBlockingSuccess` entry with a `~/shared/lib/toast` mock (keep
      `showBlockingError`, `showAcknowledgeError` mocked from `blocking-alert` — still used by
      quantity guards and validation Swals). Rewrite CART-07 (currently asserts
      `showBlockingSuccessMock` called with `'La venta fue creada satisfactoriamente.'`, test line
      ~586) to assert `expect(showToastSuccess).toHaveBeenCalledWith('La venta fue creada
      satisfactoriamente.', 'Éxito')`. Run the file — confirm this specific assertion FAILS.
      _Satisfies: TOAST-CALLSITES #2; TOAST-REMOVED-SURFACES #2._

**#3 failure (net-new test — depends on T2.0's verification result):**

- [x] **T2.4** [RED] In the same test file, add a new case (e.g. CART-08): make `createOrderMock`
      resolve `{ succeeded: false, ... }`; assert `showToastError('Ocurrío un error creando la
      venta. Por favor, vuelva a intentarlo y si persiste contacte al equipo de soporte técnico.',
      'Error')` fired; assert `clear` NOT called and the cart NOT closed; assert NO inline
      `role="alert"` banner renders. Also add/extend a case for the `catch`/thrown-exception path per
      T2.0's finding (same toast unless T2.0 found otherwise). Run — confirm both FAIL.
      _Satisfies: TOAST-CALLSITES #3; TOAST-REMOVED-SURFACES #3; TOAST-ERROR-TITLE-FIX._
- [x] **T2.5** [GREEN] In `app/shared/components/cart-shell.tsx`: remove `showBlockingSuccess` from
      the `blocking-alert` import (keep `showBlockingError`, `showAcknowledgeError`); add
      `import { showToastSuccess, showToastError } from '~/shared/lib/toast';`. Replace the success
      call (~line 222) with `showToastSuccess(intl.formatMessage({ id:
      'SHOPPING_CART.ORDER_CREATED' }), intl.formatMessage({ id:
      'GENERAL.RESPONSE.SUCCESS_TITLE' }))`. Replace the `!result.succeeded` branch (~lines
      208-211) and the `catch` branch (~lines 223-227) with
      `showToastError(intl.formatMessage({ id: 'SHOPPING_CART.ORDER_NOT_CREATED' }),
      intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }))` per T2.0's finding (never a raw
      `err.message`). Re-run T2.3 and T2.4 — confirm both GREEN.
      _Satisfies: TOAST-CALLSITES #2, #3; TOAST-ERROR-TITLE-FIX; design §3 rows 2-3._
- [x] **T2.6** [GREEN] Same file: delete the `submitError`/`setSubmitError` `useState` (cart-shell.tsx
      ~line 66), the three `setSubmitError(null)` resets (`handleClear` ~:108,
      `clearCartAfterSuccessfulOrder` ~:151, top of `handleCreateOrder` ~:155), and the
      `{submitError && <p role="alert" ...>}` JSX block (~:445-449). Confirm no other reference to
      `submitError` remains in the file. Re-run the full `cart-shell.test.tsx` suite — confirm GREEN,
      including the "no inline banner renders" assertion from T2.4.
      _Satisfies: TOAST-REMOVED-SURFACES #3; design §3.1._

### Call site #4 — Sync import success (`sync/components/import-form.tsx`) `[P]`

- [x] **T2.7** [RED] In `app/sync/components/__tests__/import-form.test.tsx`: add the
      `~/shared/lib/toast` mock. Rewrite the success-path assertion to expect
      `showToastSuccess('Los datos se importaron correctamente.')` (no title) instead of the
      `<InfoBox variant="primary">` banner; add an assertion that the success `<InfoBox>` no longer
      renders. Keep the no-file / empty-password / failure error-banner tests (`<InfoBox
      variant="danger">` path) untouched — they have no Angular toastr counterpart. Run — confirm
      FAIL.
      _Satisfies: TOAST-CALLSITES #4; TOAST-REMOVED-SURFACES #4._
- [x] **T2.8** [GREEN] In `app/sync/components/import-form.tsx` (~lines 57-59): add
      `import { showToastSuccess } from '~/shared/lib/toast';` (keep the existing
      `showBlockingError` import for the `succeeded:false`/catch error Swals — unrelated path).
      Remove the `success` state, all `setSuccess` calls, and the `{success &&
      <InfoBox>}` JSX; call `showToastSuccess(intl.formatMessage({ id: 'SYNC.IMPORT_SUCCESS' }))`
      on the success path instead. Re-run T2.7 — confirm GREEN.
      _Satisfies: TOAST-CALLSITES #4; TOAST-REMOVED-SURFACES #4; design §3 row 4._

### Call sites #5/#6/#7 — Features activate (`admin/features/routes/features.tsx`) `[P]`

- [x] **T2.9** [RED] In `app/admin/features/routes/__tests__/features.test.tsx` (PAGE-5/PAGE-6
      tests): replace the `blocking-alert` mock entirely with a `~/shared/lib/toast` mock
      (`showToastSuccess`, `showToastError`). Rewrite:
      - `succeeded: true` case → assert `showToastSuccess(FEATURES.FEATURES_ACTIVATED text,
        'Éxito')` fired; no static `<p>` success node renders.
      - `succeeded: false` case → assert `showToastError(FEATURES.UNEXPECTED_ERROR text, 'Error')`
        fired; no static `<p>` error node renders.
      - HTTP-throw case (catch branch) → same `showToastError` assertion as the false case.
      - Keep the double-submit-guard test structure but assert on `showToastSuccess` instead of the
        Swal mock.
      Run the file — confirm the rewritten assertions FAIL.
      _Satisfies: TOAST-CALLSITES #5, #6, #7; TOAST-REMOVED-SURFACES #5, #7; admin spec S-PAGE-5-TOAST,
      S-PAGE-6-TOAST._
- [x] **T2.10** [GREEN] In `app/admin/features/routes/features.tsx`: replace the `blocking-alert`
      import entirely with `import { showToastSuccess, showToastError } from
      '~/shared/lib/toast';` (features has no other Swal usage). Replace the success call (~line
      22, `await showBlockingSuccess(...)`) with `showToastSuccess(intl.formatMessage({ id:
      'FEATURES.FEATURES_ACTIVATED' }), intl.formatMessage({ id:
      'GENERAL.RESPONSE.SUCCESS_TITLE' }))` (drop `await`). Replace both `showBlockingError`
      call sites (~lines 24-27 catch, ~lines 30-33 succeeded:false) with `showToastError(
      intl.formatMessage({ id: 'FEATURES.UNEXPECTED_ERROR' }), intl.formatMessage({ id:
      'GENERAL.RESPONSE.ERROR_TITLE' }))`. Re-run T2.9 — confirm GREEN.
      _Satisfies: TOAST-CALLSITES #5, #6, #7; TOAST-REMOVED-SURFACES #5, #7; TOAST-ERROR-TITLE-FIX;
      design §3 rows 5-7._

---

## WU3 — Spec supersession (sequential; do after WU2 GREEN so the delta reflects shipped behavior)

- [x] **T3.1** Edit `frontend-react/openspec/specs/admin/spec.md` — supersede ONLY PAGE-5/PAGE-6 in
      the `### Features Page (PAGE)` section per the delta spec's exact replacement wording
      (`specs/admin/spec.md` delta, design §6): PAGE-5 becomes "MUST fire a success toast
      (`showToastSuccess`)..."; PAGE-6 becomes "MUST fire an error toast (`showToastError`)...".
      Copy the FULL PAGE block (PAGE-1 through PAGE-8) verbatim first, then edit only PAGE-5/PAGE-6
      in place — do not drop PAGE-1/2/3/4/7/8. Do NOT edit any immutable archive record under
      `openspec/changes/archive/…phase4-admin-features/…` (cite only). Do NOT touch
      `admin/spec.md:218,226` or `management/spec.md:352` (out of scope — no live Angular toastr
      counterpart / already permissive).
      _Satisfies: admin delta spec PAGE-5, PAGE-6, S-PAGE-5-TOAST, S-PAGE-6-TOAST, S-PAGE-1..4,7,8._

---

## WU4 — Final verification (sequential, last)

- [x] **T4.1** Run the full suite: `npx vitest run` from `frontend-react/apps/web-store-pos` — confirm
      100% green, including all rewritten tests (T0.3, T1.1, T1.3, T2.1, T2.3, T2.4, T2.7, T2.9) and
      no regressions elsewhere.
- [x] **T4.2** Run `tsc --noEmit` (or the workspace's equivalent typecheck script) — confirm clean,
      no leftover unused imports (`showBlockingSuccess`/`showBlockingError`/`InfoBox` where removed,
      `submitError` state) and no type errors from the new `toast.tsx` module or its call sites.
- [x] **T4.3** Grep-sweep confirmation: no remaining `Swal.fire` / `showBlockingSuccess` calls at the
      7 migrated trigger points; no success `<InfoBox>` in `import-form.tsx`; no `submitError` symbol
      in `cart-shell.tsx`. Confirm the validation-guard Swals (`showBlockingError` quantity/stock
      guards, `showAcknowledgeError` empty-cart/payment/credit guards in cart-shell; `showBlockingError`
      pre-submit validation and `succeeded:false`/catch Swals in `import-form.tsx`) are still present
      and untouched — these have no Angular toastr counterpart and are explicitly out of scope.
      _Satisfies: TOAST-REMOVED-SURFACES (full sweep); design §3.1 "OTHER user-facing error surfaces
      are untouched"._

---

## Apply-time finding: T2.0 verification (deviation from design ADR-4's literal assumption)

Read `frontend/src/app/presentation/layouts/client-layout/nav-bar/nav-right/nav-right.component.ts`
`createOrder()` (lines 202-227). Angular's `.subscribe((response) => {...})` registers ONLY a
`next` handler — there is no second (error) callback argument. `OrderOfflineService.createOrder`
(`order-offline.service.ts:42-65`) always resolves via `return this.Success$(order);` and never
emits an Observable error. **Angular therefore has no user-facing feedback path for a
thrown/rejected `createOrder` call** — it is not a code path Angular's UI ever exercises (an
unhandled Observable error would just throw asynchronously/uncaught, with no toast).

Per design ADR-4's non-negotiable ("`submitError` is removed either way; never a raw
`err.message`; no persisted inline banner"), React's `catch` branch in `cart-shell.tsx` mirrors
Angular's true behavior: it shows **no toast** on a thrown exception (rather than firing the same
`showToastError(ORDER_NOT_CREATED, ...)` as the `succeeded:false` branch, which was the design's
literal fallback assumption). This is covered by test CART-09 in
`cart-shell.test.tsx`. Flagged here as the deviation the design doc asked apply to record.

---

## Task → Requirement traceability

| Task(s) | Requirement(s) |
|---|---|
| T0.3, T0.4 | TOAST-CONTAINER |
| T1.1, T1.2 | TOAST-HELPER |
| T1.3, T1.4 | TOAST-I18N |
| T2.1, T2.2 | TOAST-CALLSITES #1, TOAST-REMOVED-SURFACES #1 |
| T2.0, T2.3, T2.5 | TOAST-CALLSITES #2, TOAST-REMOVED-SURFACES #2 |
| T2.0, T2.4, T2.5, T2.6 | TOAST-CALLSITES #3, TOAST-REMOVED-SURFACES #3, TOAST-ERROR-TITLE-FIX |
| T2.7, T2.8 | TOAST-CALLSITES #4, TOAST-REMOVED-SURFACES #4 |
| T2.9, T2.10 | TOAST-CALLSITES #5/#6/#7, TOAST-REMOVED-SURFACES #5/#7, TOAST-ERROR-TITLE-FIX |
| T3.1 | admin delta spec PAGE-5, PAGE-6 |
| T4.1-T4.3 | all requirements (regression sweep) |

---

## Review Workload Forecast

**Files touched (11 total):**

| File | Change type | Est. changed lines |
|---|---|---|
| `apps/web-store-pos/package.json` | dep add | ~2 |
| `apps/web-store-pos/app/root.tsx` (125 lines) | +2 imports, +1 JSX line | ~5 |
| `apps/web-store-pos/app/__tests__/root.test.tsx` | new/extended test block | ~20 |
| `apps/web-store-pos/app/shared/lib/toast.tsx` | new file | ~40 |
| `apps/web-store-pos/app/shared/lib/__tests__/toast.test.tsx` | new file | ~90 |
| `apps/web-store-pos/app/shared/lib/i18n/es.ts` | +1 key | ~1 |
| `apps/web-store-pos/app/sales/routes/products.tsx` | swap 1 call, import edit | ~5 |
| `apps/web-store-pos/app/sales/routes/__tests__/products.test.tsx` | rewrite 1 assertion block | ~15 |
| `apps/web-store-pos/app/shared/components/cart-shell.tsx` (439 lines) | remove `submitError` state (3 resets + JSX + useState), swap 3 calls, import edit | ~45 |
| `apps/web-store-pos/app/shared/components/__tests__/cart-shell.test.tsx` | rewrite CART-07, add CART-08 (+catch case), mock swap | ~60 |
| `apps/web-store-pos/app/sync/components/import-form.tsx` | remove `success` state + JSX, swap 1 call | ~20 |
| `apps/web-store-pos/app/sync/components/__tests__/import-form.test.tsx` | rewrite success assertions | ~20 |
| `apps/web-store-pos/app/admin/features/routes/features.tsx` (48 lines) | swap 3 calls, import replace | ~15 |
| `apps/web-store-pos/app/admin/features/routes/__tests__/features.test.tsx` | mock swap, rewrite 3 assertion blocks | ~35 |
| `frontend-react/openspec/specs/admin/spec.md` | supersede PAGE-5/PAGE-6 (copy-full-block-then-edit) | ~20 (net edit, larger block copied) |

**Estimated total changed lines:** ~395 (source + tests + spec), across **15 files** (11 source/test
pairs + package.json + i18n + spec + root/root-test).

**Chained PRs recommended:** No — the change is one cohesive vertical slice (container → helper →
7 call sites → spec) with tight RED/GREEN pairing per file; splitting would leave intermediate
commits with failing cross-file assumptions (e.g. the helper must exist before any call site can
compile).

**400-line budget risk:** Borderline/Medium. ~395 estimated changed lines sits just under the
400-line budget, driven mostly by the `cart-shell.tsx` + its test (the only call site with a real
behavioral change, per ADR-4) and the two new files (`toast.tsx` + its test). If actual line counts
during apply exceed 400 (likely, given estimates are conservative and test rewrites tend to run
longer than predicted), this is a strong single-PR-with-`size:exception` candidate rather than a
split — the work has one shared dependency chain (helper module) that all 7 call sites need, so a
sequential slice split would just create broken-intermediate-state PRs.

**Decision needed before apply:** Yes — confirm with the user whether to proceed as a single PR
with `size:exception` (recommended, given the tight dependency chain) or accept the review-size
risk as-is. Also flag: T2.0 (Angular `nav-right.component.ts` verification) must complete and its
finding must be applied in T2.4/T2.5 before the cart-shell failure-path GREEN step is written — this
is a build-time (not review-time) sequencing risk, not a scope question.
