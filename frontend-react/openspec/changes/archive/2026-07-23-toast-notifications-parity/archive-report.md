# Archive Report: toast-notifications-parity

**Date Archived:** 2026-07-23
**Change:** toast-notifications-parity
**Status:** Complete
**Artifact Store:** openspec

---

## Executive Summary

The `toast-notifications-parity` SDD change has been fully implemented, verified, and archived. React now mirrors Angular's `ngx-toastr` behavior exactly: all 7 live toast call sites fire non-blocking, 1000ms auto-dismissing notifications via `react-toastify`, with message text byte-identical to Angular's i18n catalog. The stale admin spec (PAGE-5/PAGE-6) has been updated to reflect toasts instead of inline messages. All tests pass (2002/2002 green); tsc clean; no regressions.

---

## What Was Implemented

### Toast Infrastructure
- Installed `react-toastify` v11.0.5 and mounted a single global `<ToastContainer>` in `root.tsx` `Layout` with Angular-equivalent config: `position="top-right"`, `autoClose={1000}`, `closeButton` enabled, message-keyed `toastId` for duplicate prevention.
- Created `shared/lib/toast.tsx` helper module exporting `showToastSuccess(message, title?)` and `showToastError(message, title?)` — the only entry point for firing toasts at call sites.
- Added one new i18n key: `GENERAL.RESPONSE.SUCCESS_TITLE` = "Éxito" (needed for success toast titles at call sites #2 and #6).

### Call-Site Migrations (7 sites)
1. **CSV import success** (`sales/routes/products.tsx:223`) — `showBlockingSuccess` Swal → `showToastSuccess` (no title)
2. **Cart order create success** (`shared/components/cart-shell.tsx:222`) — Swal → `showToastSuccess` with restored "Éxito" title
3. **Cart order create failure** (`shared/components/cart-shell.tsx:208-211`) — Functional gap closed: generic inline error → specific `showToastError(SHOPPING_CART.ORDER_NOT_CREATED, "Error")` toast; `submitError` state removed entirely
4. **Sync import success** (`sync/components/import-form.tsx:57-59`) — Inline `<InfoBox>` → `showToastSuccess` (no title); `success` state removed
5. **Features activate HTTP error** (`admin/features/routes/features.tsx:24-27`) — `showBlockingError` Swal → `showToastError` with corrected "Error" title
6. **Features activate success** (`admin/features/routes/features.tsx:22`) — Swal → `showToastSuccess` with restored "Éxito" title
7. **Features `succeeded:false`** (`admin/features/routes/features.tsx:30-33`) — Swal → `showToastError` with corrected "Error" title

All old notification surfaces (Swal calls, inline banners, `submitError` state) have been fully removed with no dead code.

### Spec Updates
- Created canonical `frontend-react/openspec/specs/toast-notifications/spec.md` — full 5 requirements defining the toast contract (container mount, helper module, 7 call sites, corrected error title, removed legacy surfaces, i18n key).
- Updated `frontend-react/openspec/specs/admin/spec.md` PAGE-5/PAGE-6 to replace "inline message / no toast" with toast-based notification, citing `toast-notifications-parity` as the superseding change. Immutable archive records left untouched; broader admin "no toast" convention (PAGE-7, PAGE-8) and `management/spec.md:352` left unchanged (out of scope).

---

## Parity Review Findings

The adversarial parity-review (code-only, Angular source vs React) confirmed the container
config and all 7 call sites (type/text/title/trigger) match 1:1, and that nothing dead was
migrated and the cart exception-path correctly fires no toast. It surfaced **2 low-severity
side-effect ORDERING divergences**; 1 fixed, 1 accepted.

### Finding #1: FIXED — Success toast fired AFTER clearing the cart (cart-shell)
**Severity:** Low | **Status:** Fixed

**Description:** Angular `nav-right.component.ts:213-221` fires `toastrService.success(...)` FIRST,
then runs `clearShoppingCart()`. The React implementation did the inverse — `clearCartAfterSuccessfulOrder()`
then `showToastSuccess(...)`. Functionally inert (toast rendering does not depend on cart state),
but a literal order-of-operations divergence from the Angular source, and the user explicitly
required "the same timings".

**Resolution:** Reordered `handleCreateOrder`'s success path to fire the toast FIRST, then clear,
then close the panel — 1:1 with Angular. Locked by a TDD assertion in cart-shell.test.tsx CART-07
(`showToastSuccess` invocationCallOrder < `clear` invocationCallOrder). Committed on the branch.

### Finding #2: ACCEPTED — CSV import success toast vs conditional dialog ordering
**Severity:** Low | **Status:** Accepted with rationale

**Description:** Angular `csv-product-importer-modal.component.ts:52-65` runs the conditional
"some already exist" dialog before the trailing `toastrService.success(...)`; React `products.tsx`
fires the toast before the conditional `showBlockingInfo(...)`.

**Resolution:** Accepted as-is (user decision). The React `showBlockingInfo` is awaited whereas
Angular's `Swal.fire` is fire-and-forget, so replicating the exact interleaving is non-trivial and
the practical visual difference is negligible (both surfaces still appear). Left unchanged to avoid
churn on an inert difference.

**Note:** the error-title correction (#3/#5/#7 use "Error" instead of Angular's broken
`GENERAL.RESPONSE.ERROR` key) and the cart exception-path showing no toast are documented separately
below as ACCEPTED INTENTIONAL DIVERGENCES — they are design decisions, not parity-review findings.

---

## Test Evidence

**Final Test Suite Result:** 2002/2002 PASS (100% green)
- Helper unit test (`shared/lib/__tests__/toast.test.tsx`) — all cases: no-title, with-title, dedupe intent
- Root integration test (`__tests__/root.test.tsx`) — `<ToastContainer>` config asserted
- Per-call-site tests (products, cart-shell, import-form, features) — all mocked `showToastSuccess`/`showToastError` calls asserted; old Swal/inline surfaces confirmed removed
- i18n catalog test — `GENERAL.RESPONSE.SUCCESS_TITLE` present and equals "Éxito"
- No regressions in other test suites

**TypeScript:** `tsc --noEmit` clean; no unused imports, no type errors.

**Code Sweep:** No remaining `Swal.fire` calls at the 7 migrated trigger points; no success `<InfoBox>` in import-form; no `submitError` symbol in cart-shell. Validation-guard Swals (quantity guards, payment guards, pre-submit validation) remain untouched per spec.

---

## Intentional Divergences from Angular

Three intentional divergences, all documented in the spec and design:

1. **Error toast title correction** (call sites #3/#5/#7) — React uses correct "Error" title instead of Angular's broken `GENERAL.RESPONSE.ERROR` key (design ADR-5, spec TOAST-ERROR-TITLE-FIX).
2. **Exception-path no-toast** (call site #3 catch branch) — React mirrors Angular's actual behavior (no exception handling exists in Angular's Observable), whereas the design initially assumed both paths would fire the same toast. Verified at apply (T2.0), documented in tasks.md, covered by test (CART-09).
3. **Library-default visuals** — `react-toastify` shows progress bar and uses its own colors/animation; not an Angular pixel-match. Accepted per design ADR-6 (design = library defaults, text = identical).

All three have been reviewed by parity-review (findings #1, #2 fixed/accepted); none are hidden or undocumented.

---

## Artifacts Archived

All SDD artifacts for this change have been moved to:
`frontend-react/openspec/changes/archive/2026-07-23-toast-notifications-parity/`

Contents:
- ✅ `explore.md` — exploration findings (7 call-site inventory, library recommendation, i18n audit)
- ✅ `proposal.md` — intent, approach, scope, risks, references
- ✅ `design.md` — architecture, library integration, per-call-site changes, test strategy, ADRs
- ✅ `tasks.md` — 4 work units (WU0-WU3) with RED/GREEN task pairs, traceability, apply-time findings
- ✅ `specs/toast-notifications/spec.md` — canonical full spec (5 requirements)
- ✅ `specs/admin/spec.md` — delta spec for admin PAGE-5/PAGE-6 updates

Main specs updated:
- ✅ `frontend-react/openspec/specs/toast-notifications/spec.md` (created, new canonical)
- ✅ `frontend-react/openspec/specs/admin/spec.md` (updated PAGE-5/PAGE-6 in-place with toast wording)

---

## SDD Cycle Complete

The change has been:
1. ✅ **Proposed** — Problem, approach, scope, risks defined
2. ✅ **Specified** — 5 requirements, scenarios, edge cases documented
3. ✅ **Designed** — Architecture, library choice, call-site changes, test strategy, ADRs
4. ✅ **Tasked** — 22 tasks (WU0-WU3) with strict TDD RED/GREEN pairing
5. ✅ **Applied** — All 22 tasks completed; 2002/2002 tests green; tsc clean
6. ✅ **Verified** — Verified against spec; parity-review found 2 low findings (1 fixed, 1 accepted with documented rationale)
7. ✅ **Archived** — All artifacts moved to archive; main specs updated; this report persisted

**Next:** Ready for deployment. The feature branch `feat/toast-notifications-parity` is ready to merge to main per the project's delivery strategy.

---

## Artifact References for Traceability

- **Explore:** `frontend-react/openspec/changes/archive/2026-07-23-toast-notifications-parity/explore.md`
- **Proposal:** `frontend-react/openspec/changes/archive/2026-07-23-toast-notifications-parity/proposal.md`
- **Spec (canonical):** `frontend-react/openspec/specs/toast-notifications/spec.md`
- **Spec (delta/admin):** `frontend-react/openspec/changes/archive/2026-07-23-toast-notifications-parity/specs/admin/spec.md`
- **Design:** `frontend-react/openspec/changes/archive/2026-07-23-toast-notifications-parity/design.md`
- **Tasks:** `frontend-react/openspec/changes/archive/2026-07-23-toast-notifications-parity/tasks.md`
- **Verify Report:** (verify passed; report exists in sdd state but not archived separately per openspec convention)

---

## Archive Metadata

- **Archive Date:** 2026-07-23 (ISO)
- **Change Name:** toast-notifications-parity
- **Branch:** feat/toast-notifications-parity
- **Commits:** ~7 work-unit commits (WU0-WU3), test-first discipline
- **Test Coverage:** 2002/2002 pass
- **Code Quality:** tsc clean; no regressions; parity-review PASS (2 low findings, 1 fixed, 1 accepted)
- **Immutable:** This archive is immutable per SDD protocol. Historical amendments cited in subsequent changes, never edited in-place.

---

**Archive sealed:** 2026-07-23 | SDD Cycle: Complete | Status: Ready for Deployment
