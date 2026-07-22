# Tasks: Presentation Parity — Bucket C

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350-450 total across 4 WUs (commits-only, not a single PR) |
| 400-line budget risk | Medium (aggregate); Low per-commit |
| Chained PRs recommended | No |
| Suggested split | Not needed — commit per work unit on branch |
| Delivery strategy | commits-only (no PRs) |
| Chain strategy | pending (not applicable — no PRs) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

Branch: `feat/presentation-parity-bucket-c`. Strict TDD: every implementation task pairs with a RED test task first.

Decision baked in: password toggle aria-label reuses existing `SYNC.SHOW_PASSWORD`/`SYNC.HIDE_PASSWORD` keys (es.ts:726-727) — no GENERAL-scoped equivalent exists; inventing 12 per-screen keys is rejected per spec's "invent nothing" rule.

### Suggested Work Units

| Unit | Goal | Commit | Notes |
|------|------|--------|-------|
| WU1 | Password toggle, 6 screens | 6 commits (1/screen) | Reuse EyeIcon/EyeOffIcon + import-form.tsx:104-123 pattern |
| WU2 | Cancelar→Cerrar, 2 files | 1 commit (both, trivial) | 1-line i18n id swap each |
| WU3 | CloseIcon/SaveIcon, 5 modals | 5 commits (1/modal) | Run after WU2 on the 2 shared files |
| WU4 | Raw button→fab, 10 controls | up to 10 commits | Run after WU3 on expense-form-modal |
| WU5 | Conditional toolbar-fab check | 1 commit or skip-note | owner-edit/reseller-edit |

## Phase 1: WU1 — Password visibility toggle (6 screens) — DONE

- [x] 1.1 login.tsx (single field). Commit 2846552.
- [x] 1.2 register.tsx — CORRECTED at apply time: Angular source (register.component.html:100-103,122-125) uses a SINGLE shared `showPassword` boolean for both fields, not 2 independent toggle states as originally written here. Commits abe0c3c (wrong, independent) + f5487e2 (fix, shared state).
- [x] 1.3 `management/users/components/UserCreateForm.tsx` — password + confirmPassword, shared state (Angular create-store-user.component.html:43-48,63-68 also uses one shared boolean). Commit 176d0ee.
- [x] 1.4 `profile/components/change-password-form.tsx` — newPassword + confirmPassword, shared state; oldPassword untouched (no toggle/type binding in Angular source). Commit 4ebb51d.
- [x] 1.5 `admin/owners/routes/owner-create.tsx` — shared state. Commit 67a92b8.
- [x] 1.6 `admin/resellers/routes/reseller-create.tsx` — shared state. Commit 911d8c9.

## Phase 2: WU2 — "Cancelar" → "Cerrar" — DONE

- [x] 2.1 `inventory/components/edit-inventory-entry-modal.tsx` GENERAL.CANCEL→GENERAL.CLOSE.
- [x] 2.2 `expenses/components/expense-form-modal.tsx` GENERAL.CANCEL→GENERAL.CLOSE.
  Both in commit 58a5df8.

## Phase 3: WU3 — Modal CloseIcon/SaveIcon parity — DONE

- [x] 3.1 `sales/components/edit-order-modal.tsx`. Commit 0b699b1.
- [x] 3.2 `sales/components/edit-sale-credit-modal.tsx`. Commit b7940c4.
- [x] 3.3 `sales/components/sale-credit-payment-modal.tsx`. Commit e69cbd6.
- [x] 3.4 `inventory/components/edit-inventory-entry-modal.tsx`. Commit d3dcfb2.
- [x] 3.5 `expenses/components/expense-form-modal.tsx`. Commit e6d0ea9.

## Phase 4: WU4 — Raw button → fab — DONE

- [x] 4.1 `auth/routes/login.tsx` submit → fab. Commit ddf4e1d.
- [x] 4.2 `auth/routes/register.tsx` submit → fab. Commit 1a25aee.
- [x] 4.3 `management/users/components/UserCreateForm.tsx` submit → fab. Commit 25ff69a.
- [x] 4.4 `management/users/components/UserDetailsForm.tsx` submit → fab. Commit 840e52f.
- [x] 4.5 `profile/components/change-password-form.tsx` submit → fab. Commit 3e3aece.
- [x] 4.6 `admin/owners/routes/owner-create.tsx` + `owner-edit.tsx` submit → fab. Commit 92fae4b.
- [x] 4.7 `admin/resellers/routes/reseller-create.tsx` + `reseller-edit.tsx` submit → fab. Commit 85df7cd.
- [x] 4.8 `sales/components/sale-product-row.tsx` → `FloatingButton` (h-14 w-14), SVG markup preserved as children. Commit 161eb6b.
- [x] 4.9 `expenses/components/expense-form-modal.tsx` close button `variant="outline"`→`variant="fab"` (confirmed both close+save are `mat-fab extended color="primary"` in Angular source). Commit 2cc2239.

## Phase 5: Conditional — owner/reseller toolbar "+" fab — DONE (implemented)

- [x] 5.1 CONFIRMED via direct read: `edit-owner.component.html:4-9` and `edit-reseller.component.html:4-9` both render a toolbar "+" fab (`openCreateOwnerModal`/`navigateToCreateReSeller`) rendered UNCONDITIONALLY, outside/distinct from the details-form submit fab (already handled in 4.6/4.7). React had NO such button. Implemented in both `owner-edit.tsx` and `reseller-edit.tsx`: `PlusIcon` + `Button variant="fab"`, new i18n keys `OWNER.ADD_OWNER` / `RESELLER.ADD_RESELLER` added to `es.ts`. Angular's own click handlers are literally empty no-ops (`edit-owner.component.ts:28-29`, `edit-reseller.component.ts:12-13`) — mirrored as no-op `onClick` in React (not a real create flow). Commit 425fb5a.

## Out of Scope (no tasks) — confirmed untouched

- `reports/routes/today-report.tsx` refresh button — low-confidence match, left unchanged.
- `sales/components/edit-order-details-modal.tsx` — ratified dead/unwired component, left unchanged.

## Final state

ALL tasks complete. Full `web-store-pos` suite: 1958/1958 passed, 129/129 files. Branch `feat/presentation-parity-bucket-c`, 20 commits (all TDD RED→GREEN, commits-only delivery).
