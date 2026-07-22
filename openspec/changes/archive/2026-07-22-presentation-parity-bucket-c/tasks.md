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
- [x] 4.8 `sales/components/sale-product-row.tsx` → `FloatingButton` (h-14 w-14), SVG markup preserved as children. Commit 161eb6b. **REVERTED in Round 2** (commit 3c2445d) — Angular actually uses `mat-mini-fab` (40px), not `mat-fab` (56px); restored the local 40px button.
- [x] 4.9 `expenses/components/expense-form-modal.tsx` close button `variant="outline"`→`variant="fab"` (confirmed both close+save are `mat-fab extended color="primary"` in Angular source). Commit 2cc2239.

## Phase 5: Conditional — owner/reseller toolbar "+" fab — DONE (implemented)

- [x] 5.1 CONFIRMED via direct read: `edit-owner.component.html:4-9` and `edit-reseller.component.html:4-9` both render a toolbar "+" fab (`openCreateOwnerModal`/`navigateToCreateReSeller`) rendered UNCONDITIONALLY, outside/distinct from the details-form submit fab (already handled in 4.6/4.7). React had NO such button. Implemented in both `owner-edit.tsx` and `reseller-edit.tsx`: `PlusIcon` + `Button variant="fab"`, new i18n keys `OWNER.ADD_OWNER` / `RESELLER.ADD_RESELLER` added to `es.ts`. Angular's own click handlers are literally empty no-ops (`edit-owner.component.ts:28-29`, `edit-reseller.component.ts:12-13`) — mirrored as no-op `onClick` in React (not a real create flow). Commit 425fb5a.

## Out of Scope (no tasks) — confirmed untouched

- `reports/routes/today-report.tsx` refresh button — low-confidence match, left unchanged.
- `sales/components/edit-order-details-modal.tsx` — ratified dead/unwired component, left unchanged.

## Round 1 final state

ALL Round-1 tasks complete. Full `web-store-pos` suite: 1958/1958 passed, 129/129 files. Branch `feat/presentation-parity-bucket-c`, 20 commits (all TDD RED→GREEN, commits-only delivery).

---

## Round 2 — Follow-up parity-review fixes (post-verify, 6 confirmed divergences, not in original scope above)

A parity review vs Angular source found 6 further divergences after Round 1's `sdd-verify` passed. Fixed all 6 with strict TDD (RED then GREEN per fix), grouped into 4 commits:

- [x] R2.1 (CRITICAL) Password eye icon inverted on all 11 toggle instances (`login.tsx`, `register.tsx` x2, `owner-create.tsx` x2, `reseller-create.tsx` x2, `UserCreateForm.tsx` x2, `change-password-form.tsx` x2). Angular: `showPassword ? 'visibility' : 'visibility_off'` (open eye when revealed). Ternary was backwards in React; fixed. Commit `fa3d7e2`. `import-form.tsx`/`export-form.tsx` have the same bug, explicitly out of scope, left untouched.
- [x] R2.2 (WARNING) fab submit buttons missing Angular's mat-icon glyph — added `LoginIcon` (new) + `LockOpenIcon` (new) to `icons.tsx`, reused `PlusIcon` (create forms: owner-create, reseller-create, UserCreateForm) and `EditIcon` (edit forms: owner-edit, reseller-edit, UserDetailsForm, change-password-form) across 9 submit fabs. Commit `cb8e7fd`.
- [x] R2.3 (WARNING) `edit-order-modal.tsx` update button used `SaveIcon`; Angular uses `edit` — swapped to `EditIcon`. Commit `3c2445d`.
- [x] R2.4 (WARNING) `edit-sale-credit-modal.tsx` + `sale-credit-payment-modal.tsx` TO_PAY buttons used `SaveIcon`; Angular uses `payment` on both — swapped to `PayIcon` (both files). Commit `3c2445d`.
- [x] R2.5 (WARNING) `expense-form-modal.tsx` footer button order was Save-then-Close; Angular is Close-then-Save (matches sibling `edit-inventory-entry-modal`). Reordered. Commit `89c5429`.
- [x] R2.6 (WARNING) `sale-product-row.tsx` cart button was wrongly promoted to `FloatingButton` (56px mat-fab) by Round-1 task 4.8; Angular uses `mat-mini-fab` (40px). Reverted to the local 40px button, same inline SVG kept. Commit `3c2445d`.

### Round 2 final state

ALL 6 Round-2 fixes complete. Full `web-store-pos` suite: 1968/1968 passed, 129/129 files. Branch `feat/presentation-parity-bucket-c`, +4 commits on top of Round 1 (`fa3d7e2`, `cb8e7fd`, `3c2445d`, `89c5429`).

## Combined final state (both rounds)

29 total confirmed parity fixes (23 Round-1 tasks + 6 Round-2 fixes) across 24 commits on `feat/presentation-parity-bucket-c`. Full suite green: 1968/1968 tests, 129/129 files.

---

## Round 3 — Adjacent gap fixed post-archive-prep (not part of original Bucket C scope, discovered during Round-2 follow-up)

- [x] R3.1 (adjacent gap) `expense-form-modal.tsx` Save button label was hardcoded `GENERAL.SAVE` ("Salvar"); Angular toggles `GENERAL.INSERT`/`GENERAL.UPDATE` per create/edit mode (`edit-expense-modal.component.html:74-77`), matching the sibling `edit-inventory-entry-modal.tsx:213-215` pattern. Fixed via TDD. Engram `bugfix` observation #1392.

## Final state (all rounds)

30 total confirmed parity fixes across 25 commits on `feat/presentation-parity-bucket-c`. Full suite green: 1970/1970 tests. Typecheck clean. Parity-review vs Angular source: CLEAN (final pass).
