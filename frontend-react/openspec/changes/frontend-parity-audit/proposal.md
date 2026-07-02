# Proposal: Frontend Parity Audit (Angular → React migration)

## Intent

Bring `frontend-react/apps/web-store-pos/` to 100% parity with the validated Angular app (`frontend/`), the single source of truth. Offline-first PWA: `USE_ONLINE_SERVICE=false` → offline local-storage repos. Texts must end up IDENTICAL and in SPANISH. React is never assumed correct; measured against Angular. Mismatches become open questions, not guesses.

## Scope

### In Scope (7 audit layers)

1. **Models + enums** — diff `packages/domain` vs Angular entities; close `EFeatures.TodayInventoryStats=32` gap (if live in Angular), verify error-type/view-model parity.
2. **Services (data layer)** — offline repos + HTTP admin services; verify PWA cross-cutting (connection, download-manager, service-worker update), currency, usage-tracker, shopping-cart.
3. **Auth & authorization** — mostly done; spot-verify guards/loaders vs Angular `canActivate`.
4. **Views by module — functional parity** — fields, components, validations, behavior.
5. **Visual/design parity (NEW, first-class)** — DECISION: replicate Angular look in native Tailwind (not port SCSS). FIRST STEP: extract Angular design tokens (purple theme palette, radii, shadows, button/card/info-box styles, typography, spacing) into a small shared Tailwind convention + base components (Button, Card, InfoBox), then apply per view.
6. **i18n** — flatten Angular `vocabs/es.ts` (~397 keys) → diff vs React flat `es.ts` (~274); close ~123-key gap; catch hardcoded template Spanish.
7. **Routes/navigation** — largely done; verify renames + catch-all behavior.

### Out of Scope (ratified dead / deferred)

- `admin/roles` (Angular placeholder → OwnersComponent, `EFeatures.Roles`).
- Billing module (0 routes both sides).
- Unused fleet/carrier enums: `EPermissions`, `ENotificationTemplateType`, `SignatureProvider`, `EMessageStatus`; `messages/message.model.ts`.
- Commented-out nav entries.
- Angular per-page help-dialogs (25) — RESOLVED: consolidated into a single tutorial page via HEADER icon link. Not a gap.
- Angular online-mode services beyond products/categories (unimplemented in Angular itself).

## Approach

- **Cross-cutting foundations first** (layers 1, 2, 3, 7 + design-token extraction from layer 5). These unblock every module.
- **Then per-module slices**, each covering layers 4+5+6 for its views.
- **Design-token-first**: build the shared Tailwind palette/base components before styling any view so all modules stay visually consistent.

### Module execution order

Sales → Inventory → Expenses → Management → Admin → Sync → Reports → Statistics → Profile → Help.

- Management carries the structural divergence: Angular reuses `EditStoreComponent` (list root = edit form); React splits list/create/edit routes — needs explicit UX-parity decision.
- Help slice = ratify the tutorial-page replacement, not a mechanical port.

## Corrections applied to exploration

- `authorization-service.ts` EXISTS in React (verified: `.some()` semantics + `selectedStoreId`). REMOVED from gaps.
- Help-dialogs consolidation into single header-linked tutorial page: RESOLVED, not a gap.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| PWA offline services (connection, download-manager, SW update) unconfirmed in React | High | Verify in Sync foundation stage before declaring any module at parity |
| i18n ~123-key gap + hardcoded Spanish strings | High | Flatten-and-diff per module; grep templates for literal Spanish |
| Management list/edit structural divergence | Medium | UX-parity decision in Management slice |
| `TodayInventoryStats=32` may be dead in Angular (route commented) | Low | Confirm live before porting |
| Design tokens misread → inconsistent theme | Medium | Extract tokens once into shared base components, review before per-view apply |

## Rollback Plan

Audit + migration is additive/incremental per module slice. Each slice is an independent PR; revert the slice branch. Design-token base components live in a shared module; reverting that commit restores prior styling without touching logic.

## Success Criteria (what "100% parity" means per layer)

- [ ] L1: every live Angular model/enum has a React equivalent; error-types/view-models match.
- [ ] L2: every live Angular service has a React counterpart; offline-first respected; PWA cross-cutting confirmed.
- [ ] L3: authorization/guards gate features/modules identically to Angular.
- [ ] L4: per module, fields/components/validations/behavior match Angular.
- [ ] L5: per view, layout/theme/typography/spacing visually match Angular via shared Tailwind tokens.
- [ ] L6: React i18n keys ⊇ Angular live keys; texts identical Spanish; no hardcoded strings.
- [ ] L7: all routes/navigation reconciled; renames + catch-all verified.
- [ ] Ratified dead-code list confirmed excluded with justification.
