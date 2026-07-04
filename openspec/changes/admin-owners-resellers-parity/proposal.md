# Proposal: Admin → Owners + Resellers Parity (Stage 5 Admin)

## Intent
Bring React `frontend-react/apps/web-store-pos` Admin → Owners and Admin → Resellers to strict parity with Angular `frontend/` (sole source of truth), closing the two highest-drift submodules of Stage 5 Admin. Both list views regressed away from Angular's established 3-col `mat-card` grid + gear (`mat-menu`) action pattern into plain vertical `<div>` stacks; both apply state CSS classes that were never styled; and both ship Spanish copy that diverged from Angular (owners: 2 bugs; resellers: 6 mismatches where the apply phase deviated from its own design.md). These two are co-sliced into ONE change because they share the identical card-grid + gear-menu + state-CSS pattern — building them together avoids duplicating the same UI scaffolding twice. L4 (routes/guards/http) is already at parity per audit #587; no functional rebuild.

## Scope

### In Scope
- **L5 — rebuild both list views** (`owner-list.tsx`, `reseller-list.tsx`): replace plain single-column div stacks with Angular's 3-col `mat-card` grid + gear (`mat-menu`) action menu, matching the established card-grid convention already used across Stores/Users. Owners menu: Edit/Delete (Angular Approve/Deactivate|Activate are EMPTY no-op stubs → correctly omitted). Resellers menu: Edit (Angular Activate/Deactivate/Delete are EMPTY no-op stubs; real activate/deactivate is the isActive toggle in the edit form, already replicated → list menu carries Edit only).
- **L5 CSS — add the missing state classes** actually applied by `getCardClass` but unstyled today: `.guest-owner` / `.deactive-owner` (owners) and `.deactive-reSeller` (resellers). Classes already applied in TSX (`owner-list.tsx:11-15`); only the CSS rules are missing → visual state is silently dropped.
- **L6 owners (2 bugs + hygiene)**:
  - `owner-edit.tsx:290` submit button hardcodes `USERS.SAVE='Adicionar'` → must be `'Actualizar'` (`GENERAL.UPDATE`) on edit.
  - `OWNER.CREATE_TITLE='Nuevo propietario'` → align to Angular `OWNER.ADD_OWNER='Adicionar Propietario'`.
  - Clean cross-namespace i18n key borrowing (`EXPENSES.DELETE`, `USERS.*`, `STORES.DESCRIPTION`) where text matches but hygiene is brittle.
- **L6 resellers (6 mismatches — Angular text wins)**:
  - `RESELLERS.LIST_TITLE` → `'Gestores'` (currently `'Revendedores'`).
  - `RESELLERS.ADD` → `'Adicionar Gestor'` (currently `'Agregar revendedor'`).
  - `RESELLERS.CREATE_TITLE` → `'Adicionar Gestor'` (currently `'Nuevo revendedor'`).
  - `RESELLERS.PERCENT_DISCOUNT` → `'Porciento de descuento'` (currently `'Descuento porcentual'`).
  - `RESELLERS.DISCOUNT_PRICE` → `'Descuento'` (currently `'Precio con descuento'`).
  - Edit submit label → dynamic `'Actualizar'` on edit (currently `USERS.SAVE='Adicionar'`).

### Out of Scope
- **admin/stores-followup** — separate change (approve/disapprove XOR toggle + visual state className + CREATE copy).
- **admin/features** — separate change (L5 card+fab+icon + 2 L6 text fixes).
- **admin/dashboard** — near-parity; only an accept/revert decision on the Metronic shell. Trivial, deferred.
- **admin/roles** — DEAD Angular route (no nav entry, zero React refs). NO WORK.
- **L4 (routes/guards/http)** — already at parity per audit #587. No functional rebuild.

## Capabilities

### New Capabilities
- None (both submodules already exist functionally).

### Modified Capabilities
- `admin-owners`: list view rebuilt to card-grid + gear menu with visible state styling; edit/create copy corrected to Angular text.
- `admin-resellers`: list view rebuilt to card-grid + gear menu with visible state styling; 6 i18n strings corrected to Angular text.

## Approach
Co-sliced single change, work-unit commits matching audit findings and sharing the card-grid scaffolding across both submodules:
1. **Shared L5 list rebuild** — build the 3-col `mat-card` grid + gear `mat-menu` pattern once, apply to both `owner-list.tsx` and `reseller-list.tsx`, reusing existing shared Card/menu chrome (no new primitives). Wire the correct per-submodule menu actions (Edit/Delete for owners, Edit for resellers) per the no-op-stub findings.
2. **State CSS** — add `.guest-owner` / `.deactive-owner` / `.deactive-reSeller` rules so `getCardClass` output renders.
3. **L6 owners** — fix edit submit label to dynamic `'Actualizar'`; align `CREATE_TITLE`; retire cross-namespace key borrowing.
4. **L6 resellers** — correct the 6 Spanish strings to Angular text; make edit submit label dynamic.

Strict parity discipline: do NOT invent capabilities Angular lacks, do NOT build UI for Angular dead code (OwnerDetailsComponent, no-op activate/approve/deactivate stubs). If any React-invented drift surfaces during design/apply, remove it. Angular pre-existing source bugs (e.g. `getOwnerStoreCountText` singular-only — already fixed in React with ICU plural) are NOT re-introduced.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `admin/owners/routes/owner-list.tsx` | Modified | Rebuild div stack → 3-col card grid + gear menu |
| `admin/owners/routes/owner-edit.tsx` | Modified | Edit submit label → dynamic `'Actualizar'` |
| `admin/resellers/routes/reseller-list.tsx` | Modified | Rebuild div stack → 3-col card grid + gear menu |
| `admin/resellers/routes/reseller-edit.tsx` | Modified | Edit submit label → dynamic `'Actualizar'` |
| Owners/Resellers list CSS | Modified | Add `.guest-owner` / `.deactive-owner` / `.deactive-reSeller` state rules |
| `app/shared/lib/i18n/es.ts` (or module i18n) | Modified | Fix `OWNER.CREATE_TITLE`, 6 `RESELLERS.*` strings; retire cross-namespace keys |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Shared card/gear-menu chrome drifts from Stores/Users convention | Med | Reuse existing shared Card/menu components; no new primitives |
| Per-submodule menu actions mis-wired to Angular dead no-op stubs | Med | Audit #587 explicitly maps live vs stub actions; design pins Edit/Delete (owners) and Edit (resellers) only |
| Retiring cross-namespace i18n keys breaks other consumers | Low | Grep each borrowed key before removal; add proper namespaced keys, don't just delete |
| Combined L5 rebuild + i18n exceeds 400-line review budget | High | Pre-accepted `size:exception`; tasks phase emits work-unit commit boundaries |
| Re-introducing an Angular source bug while chasing parity | Low | Keep React-side correct fixes (ICU plural); parity = user-facing text/UX, not copying Angular bugs |

## Delivery
- **Commits-only** on branch `feat/frontend-parity-audit`. NO PR, NO push.
- **`size:exception` pre-accepted** — combined two-submodule L5 rebuild plus i18n will exceed the 400-line budget; user-approved co-slice.

## Rollback Plan
Each work-unit is an isolated conventional commit on `feat/frontend-parity-audit`. Revert per-commit with local `git revert`/reset; no push, no PR, so rollback stays local.

## Dependencies
- Shared Card grid + gear/action-menu components (already present from Stores/Users parity work).
- Audit #587 (`sdd/frontend-parity-audit/stage5-admin-audit`) as the authoritative gap source.

## Success Criteria
- [ ] Both list views render Angular's 3-col card grid + gear action menu (no plain div stacks).
- [ ] `.guest-owner` / `.deactive-owner` / `.deactive-reSeller` state styling is visible.
- [ ] Owners: edit submit shows `'Actualizar'`; `CREATE_TITLE='Adicionar Propietario'`; no cross-namespace key borrowing.
- [ ] Resellers: all 6 strings match Angular (`Gestores`, `Adicionar Gestor` ×2, `Porciento de descuento`, `Descuento`); edit submit dynamic `'Actualizar'`.
- [ ] No Angular dead-code capabilities added; no React-invented drift remains.
- [ ] `tsc` clean, tests green.
