# Proposal: Admin → Stores Parity Followup (Stage 5)

## Intent

Stage 5 of frontend-parity-audit. Angular (`frontend/`) is the sole source of truth. Stage 4 `management-stores-parity` (archived) built React's `admin/stores` card grid + approve/disapprove confirm dialogs, but left 3 residual gaps in `store-card-list.tsx`. This change closes those and only those. Angular `store-list.component.html:27-39` toggles Approve XOR Disapprove by `store.approved` and paints card state via `getStoreBackgroundColor`; React renders both buttons unconditionally and drops all visual state. Copy also drifts. Verified on disk: `Store` model already exposes `approved` and `isActive` booleans.

## Scope

### In Scope
- **L5 action toggle**: in `store-card-list.tsx`, render Approve XOR Disapprove by `store.approved` (approved → Disapprove only; unapproved → Approve only), matching Angular.
- **L5 visual state class**: pass a state `className` to `Card`, mirroring the established `owner-card-list.tsx getCardClass` pattern — Angular `deactive-store` (inactive) → `bg-danger/10 border border-danger`; `disapproved-store` (unapproved) → `bg-success/10 border border-success`.
- **L6 copy**: align the store list "create" label with Angular `GENERAL.ADD` ("Adicionar"), replacing current `STORES.CREATE` ("Crear tienda"). Exact mechanism deferred to design (see Open Questions).
- Tests updated in `store-card-list.test.tsx` / `store-list.test.tsx`.

### Out of Scope
- No changes to owners/resellers (just archived), `management/stores`, or `admin/features`/`dashboard`.
- `admin/dashboard`, `admin/roles` (dead route), `admin/features` (future Change D) — untouched.
- Do NOT build Angular dead code or no-op action stubs.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `admin-stores`: card action buttons become approval-state conditional; card gains visual lifecycle state class; create label aligns to Angular.

## Approach

Reuse the proven `owner-card-list.tsx getCardClass` convention (Tailwind `bg-danger`/`bg-success` state classes) rather than porting Angular's raw CSS class names — keeps React on its own design-token system. Conditional render (`store.approved ? Disapprove : Approve`) replaces the two unconditional `Button`s. Copy fix is a one-key change in the store list route/component. Small, surgical, no route or service changes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/admin/stores/components/store-card-list.tsx` | Modified | XOR button toggle + `getStoreCardClass` state className |
| `app/admin/stores/routes/store-list.tsx` | Modified | Create-label copy alignment (per design decision) |
| `app/admin/stores/components/__tests__/store-card-list.test.tsx` | Modified | Cover both approval states + state class |
| `app/admin/stores/routes/__tests__/store-list.test.tsx` | Modified | Assert new copy |
| `app/shared/lib/i18n/es.ts` | Possibly Modified | Only if design picks in-place `STORES.CREATE` value change |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing tests assert both buttons always present | Med | Update tests alongside; strict TDD |
| Wrong Tailwind state mapping vs owners precedent | Low | Mirror `owner-card-list.tsx getCardClass` exactly |

## Rollback Plan

All work lands as conventional commits on `feat/frontend-parity-audit` (no PR, no push). Revert the followup commit(s) to restore prior `store-card-list.tsx`; changes are self-contained to admin/stores + i18n.

## Dependencies

None. Stage 4 admin/stores card grid + confirm dialogs already shipped.

## Open Questions (for design)

1. **STORES.CREATE copy**: in-place value change (`STORES.CREATE` → "Adicionar") vs repoint the component to existing `GENERAL.ADD` ("Adicionar", already present at es.ts:17). Repointing matches Angular's actual key usage but adds cross-namespace borrowing (a flagged cleanup debt); in-place keeps namespace hygiene but duplicates the literal. Design decides.
2. **State class mapping precedence**: when a store is both inactive AND unapproved, confirm the priority order (owners precedent returns inactive-class first). Confirm exact class strings.

## Success Criteria

- [ ] Approved store shows only Disapprove; unapproved shows only Approve.
- [ ] Card renders `bg-danger`/`bg-success` state class per `isActive`/`approved`, matching owners precedent.
- [ ] Store list create label reads "Adicionar" (Angular `GENERAL.ADD`).
- [ ] Tests cover both approval states, state class, and new copy.
- [ ] No owners/resellers, management/stores, features, or dashboard files touched.
