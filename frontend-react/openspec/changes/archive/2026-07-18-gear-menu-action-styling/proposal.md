# Proposal: Gear Menu & Action Styling Consistency

## Intent

Gear/action menus ("popups") across `web-store-pos` are styled inconsistently —
uneven icon usage, ad-hoc colors, differing hover behavior — and several screens
where Angular shows a settings gear + `mat-menu` are rendered in React as flat
inline buttons. This change standardizes ALL gear menus onto the user-approved
Option A design and restores gear-menu parity where it was lost.

## Scope

### In Scope
- A shared `ActionMenu` + `ActionMenuItem` component in `shared/components/ui/`
  encapsulating Option A (icon slot + colored label + soft hover tint +
  optional `separatorBefore`) with an `intent` prop centralizing the color map.
- Restyle 6 existing gear menus to the shared component (add icons/colors/separator
  where missing).
- Gear-ify 3 flat-button screens to match Angular's gear + menu.
- Add missing icons to `shared/components/ui/icons.tsx`.

### Out of Scope
- Raw fab buttons in login/profile/creates/modals — a SEPARATE later change.
- Any behavioral/data-layer change; this is presentation + parity only.

## Key Decision (Architectural Gate)

Introduce a REUSABLE `ActionMenu`/`ActionMenuItem` with an
`intent: 'edit'|'create'|'pay'|'activate'|'deactivate'|'approve'|'disapprove'|'delete'`
prop, then refactor every gear menu to consume it. Recommended over per-file inline
styling: it enforces consistency and centralizes the color map in one place.

## Color Map (intent → foreground)
edit/create → violet · pay/activate/approve → green · deactivate/disapprove →
amber · delete → red + separator above. Rest = colored fg only; hover = soft tint.

## Menus

**Restyle (gear exists):** `category-actions-menu.tsx`,
`category-product-list.tsx` (ProductRow), `sale-credit-list.tsx` (replace inline
svg with `SettingsIcon`), `owner-card-list.tsx`, `reseller-card-list.tsx`,
`user-card-list.tsx`.

**Add a gear (flat buttons → gear menu):** `entry-list.tsx`,
`expense-list.tsx`, `store-card-list.tsx`.

## Missing Icons
Add: pay/payment, activate/check, deactivate/ban, approve/check (approve may reuse
check). Present already: `EditIcon`, `TrashIcon`, `PlusIcon`, `SettingsIcon`.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Shared component too rigid for edge menus | Med | Icon slot + children escape hatch; `intent` optional |
| Regressions in click-outside/dropdown behavior | Med | Model on proven `category-product-list` pattern; TDD |
| Icon-name/style drift from Angular | Low | Mirror Angular mat-icon semantics |

## Rollback Plan

Pure UI refactor. Revert per-file commits; the shared component is additive and
can be removed once no menu imports it.

## Dependencies

- Strict TDD active. Test: `pnpm test`. Typecheck:
  `pnpm -C apps/web-store-pos exec tsc --noEmit`.

## Success Criteria

- [ ] All 9 menus render via the shared `ActionMenu` with correct intent colors.
- [ ] Delete items show a separator above; hover shows soft tint, no rest fill.
- [ ] The 3 flat-button screens now use a gear menu matching Angular.
- [ ] Typecheck + `pnpm test` green.
