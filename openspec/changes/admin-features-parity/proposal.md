# Proposal: Admin Features Parity (Stage 5 Admin)

## Intent

The React `admin/features` page has L4 functional parity (activateFeatures POST) but drifts from the Angular source of truth at L5 (structure/visual) and L6 (Spanish copy). Angular renders a Metronic card shell with a mat-fab + icon; React renders a flat `<div>` with a plain iconless `<button>`. Two i18n values also mismatch Angular literals. This change closes the structural and copy gaps to complete Stage 5 Admin parity, without importing Angular defects or new infrastructure.

## Scope

### In Scope
- **L5 structure**: wrap the features page in the shared Card shell and switch the activate action to `Button variant="fab"` with an icon, mirroring the existing owners/resellers/stores card-list pattern.
- **L5 feedback**: KEEP the current inline `<p>` success / `<p>` error rendering. KEEP the `isLoading` double-submit guard.
- **L6 copy fix 1**: `FEATURES.FEATURES_ACTIVATED` → `"Las funcionalidades se activaron satisfactoriamente"`.
- **L6 copy fix 2**: `FEATURES.UNEXPECTED_ERROR` → `"Ocurrió un error inesperado activando las funcionalidades"` (Angular value with `unb` typo corrected to `un`).
- Update `features.test.tsx` for the new shell/FAB structure and copy.

### Out of Scope
- No toast / notification system (React app has none; building it is scope creep beyond this page).
- No changes to stores, owners, resellers, or dashboard.
- Do NOT add Angular's dead service methods (getFeatures / deleteFeature / getFeatureDetailsById).
- Do NOT replicate Angular bugs: the `GENERAL.RESPONSE.ERROR` non-existent-key defect and the `unb` typo.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- None. This is a presentational + i18n parity change; the activateFeatures behavior contract is unchanged.

## Approach

Refactor `features.tsx` to compose the shared Card shell (same import path used by owners/resellers/stores lists) and replace the plain button with the shared `Button` FAB variant plus an icon. Preserve the existing handler, `isLoading` guard, and inline `<p>` feedback nodes verbatim in logic. Fix the two `es.ts` string values. Update the existing test to assert the FAB (role/icon), card container, and corrected messages.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/admin/features/routes/features.tsx` | Modified | Card shell + FAB-with-icon; keep inline feedback + isLoading guard |
| `app/shared/lib/i18n/es.ts` (605-608) | Modified | 2 FEATURES.* value fixes |
| `app/admin/features/routes/__tests__/features.test.tsx` | Modified | Assert new structure + corrected copy |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Shared Card/Button API differs from assumption | Low | Design phase confirms exact import/props from owners/resellers/stores usage |
| Test brittleness on icon/FAB markup | Low | Assert by accessible role/label, not DOM internals |

## Rollback Plan

Single-commit change on `feat/frontend-parity-audit`. Revert the commit to restore the flat div/button and prior strings; no data, route, or service contract changes.

## Dependencies

- Existing shared Card + Button (fab variant) components and icon set already used by owners/resellers/stores card lists.

## Success Criteria

- [ ] Features page renders inside the shared Card shell with a FAB + icon activate action.
- [ ] Inline `<p>` success/error feedback and the `isLoading` double-submit guard remain.
- [ ] `FEATURES.FEATURES_ACTIVATED` and `FEATURES.UNEXPECTED_ERROR` match the locked values (typo corrected).
- [ ] No toast infra, no dead service methods, no replicated Angular bugs.
- [ ] `pnpm test` and `tsc --noEmit` pass; diff under 400 lines (single PR-less commit).
