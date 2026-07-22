# Proposal: Presentation Parity — Bucket C

## Intent

Bucket C of the Angular→React presentation-parity audit. Four mechanical UI divergences remain where the React app drifted from the Angular source of truth (`frontend/src/app/presentation/`): missing password visibility toggles, raw `<button>` where Angular renders `mat-fab`, a "Cancelar" label that should read "Cerrar", and modals missing the CloseIcon/SaveIcon convention. Fix them by mirroring Angular exactly. No new behavior, no new abstraction — every piece already exists in React shared code.

## Scope

### In Scope
1. **Password visibility toggle** on 6 screens (login, register [2 fields], user-create, change-password, owner-create, reseller-create). Reuse existing `EyeIcon`/`EyeOffIcon` (icons.tsx) and the live pattern in `sync/components/import-form.tsx:104-123`.
2. **"Cancelar" → "Cerrar"**: swap i18n id `GENERAL.CANCEL` → `GENERAL.CLOSE` in `edit-inventory-entry-modal.tsx:204` and `expense-form-modal.tsx:225` (both keys already exist in es.ts).
3. **CloseIcon/SaveIcon in modals**: add existing icons to `edit-order-modal.tsx`, `edit-sale-credit-modal.tsx`, `sale-credit-payment-modal.tsx`, `edit-inventory-entry-modal.tsx` (header ✕ → `<CloseIcon/>`, footer fabs get close/save icons), plus the expense-form-modal footer Cancel button. Mirror Angular's `mat-fab extended` with inline close/save icons.
4. **Raw button → fab (confirmed divergences only)**: submit buttons on login, register, UserCreateForm, UserDetailsForm, change-password, owner-create, owner-edit, reseller-create, reseller-edit (use `Button variant="fab"`); `sale-product-row.tsx` hand-rolled circular button → reuse existing unused `FloatingButton` (button.tsx:47-55, matches `mat-mini-fab`); expense-form-modal submit `variant="outline"` → `fab`.

### Out of Scope (parity-safe exclusions)
- `today-report.tsx` refresh button — low-confidence match (label/icon differ: refresh vs generate-report-download). Excluding avoids inventing a divergence.
- `edit-order-details-modal.tsx` — ratified dead/unwired component (prior Fase-6 decision); cosmetic-only, left alone.

### Conditional (verify at apply time, not committed)
- owner-edit / reseller-edit toolbar "+" add-button: only mirror if apply confirms Angular renders an equivalent toolbar fab distinct from the details submit (edit-owner.component.html:5 / edit-reseller.component.html:5). Otherwise skip — could belong to Bucket B.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- None. Pure presentation parity — no requirement/behavior changes at the spec level.

## Approach

Mechanical reuse of existing shared React pieces — zero new abstractions:

| Need | Existing piece to reuse |
|------|-------------------------|
| Password toggle | `EyeIcon`/`EyeOffIcon` (icons.tsx:174-191) + import-form.tsx:104-123 pattern (relative wrapper, `pr-10`, absolute toggle, aria-label via intl) |
| Fab buttons | `Button variant="fab"` (already used correctly in 23 files) |
| Circular add-to-cart | `FloatingButton` (button.tsx:47-55, built but unused) |
| Modal icons | `CloseIcon`/`SaveIcon` (icons.tsx:98-118) |
| Label fix | existing i18n keys `GENERAL.CLOSE` / `GENERAL.CANCEL` (es.ts) |

Verdict discipline: Angular source vs React source only. Angular dead/commented code is not a gap. New password-toggle screens need aria-label i18n keys — reuse a GENERAL-scoped key or add per-screen keys, decided at apply time.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| auth/routes/{login,register}.tsx | Modified | toggle + submit fab |
| management/users/components/{UserCreateForm,UserDetailsForm}.tsx | Modified | toggle (create) + submit fab |
| profile/components/change-password-form.tsx | Modified | toggle + submit fab |
| admin/{owners,resellers}/routes/{create,edit}.tsx | Modified | toggle (create) + submit fab |
| sales/components/{edit-order-modal,edit-sale-credit-modal,sale-credit-payment-modal,sale-product-row}.tsx | Modified | icons / FloatingButton |
| inventory/components/edit-inventory-entry-modal.tsx | Modified | label + icons |
| expenses/components/expense-form-modal.tsx | Modified | label + icon + fab |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| aria-label i18n key choice for toggles | Med | Decide at apply; reuse GENERAL scope or add keys, mirror import-form convention |
| Conditional owner/reseller toolbar fab misclassified | Low | Verify Angular render at apply; skip if unconfirmed (defer to Bucket B) |
| Over-fixing look-alike buttons | Low | Only the confirmed divergences in exploration map are in scope |

## Rollback Plan

Commits-only on `feat/presentation-parity-bucket-c` (stacked on batch-1). Revert offending commit(s); no shared-component changes means no cross-cutting blast radius. No migrations, no data changes.

## Dependencies

- None. All shared pieces (icons, Button variants, FloatingButton, i18n keys) already exist.

## Success Criteria

- [x] All 6 password screens toggle visibility mirroring Angular's `visibility`/`visibility_off`.
- [x] Confirmed raw submit buttons render as `fab`; sale-product-row uses `FloatingButton`.
- [x] Both modals show "Cerrar" instead of "Cancelar".
- [x] The 5 flagged modals show CloseIcon/SaveIcon per Angular `mat-fab` icons.
- [x] OUT items untouched; CONDITIONAL item resolved (included — WU5 implemented).
- [x] Delivered as commits on the current branch — no PRs, no size:exception.
