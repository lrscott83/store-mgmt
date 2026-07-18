# Verify Report: gear-menu-action-styling

**Change:** gear-menu-action-styling
**Phase:** Verify
**Date:** 2026-07-18
**Mode:** Hybrid (engram + openspec file)
**Verdict:** PASS

---

## Test & Typecheck Evidence (fresh, uncached run)

- `pnpm turbo run test --force` (forces cache bypass): **3/3 tasks successful** —
  `@store-mgmt/domain#test`, `@store-mgmt/web-common#test`, `@store-mgmt/web-store-pos#test`.
  web-store-pos: **125 test files passed (125), 1789 tests passed (1789), 0 failed.**
- `pnpm -C apps/web-store-pos exec tsc --noEmit`: **0 errors.**
- Targeted re-run of the 6 test files directly touching this change (action-menu, credit-components,
  reseller-card-list, expense-components, inventory-components, store-card-list): **6/6 files, 108/108
  tests pass.** (Unrelated pre-existing `act()` console warnings in `inventory-components.test.tsx`
  EditInventoryEntryModal cases — not caused by this change, no assertion failures.)
- Grep sweep for leftover hand-rolled gear markup (`openMenuId`, `setIsMenuOpen`,
  `viewBox="0 0 16 16"`) across all 9 target files: **no matches** — clean.

## Primitive Contract (ActionMenu / ActionMenuItem)

`apps/web-store-pos/app/shared/components/ui/action-menu.tsx` verified against GM-MENU/GM-ITEM:
- Gear trigger uses shared `SettingsIcon`, default `label="Acciones"`, `testId` forwarded to
  `data-testid`, `aria-expanded` reflects open state — matches S-GM-MENU-2/4.
- Dropdown `role="menu"`, absent from DOM when closed — matches S-GM-MENU-1.
- Closes via existing `useClickOutside` hook (no new implementation) — matches S-GM-MENU-3/GM-NGOAL-3.
- `ActionMenuItem` closes the menu via private Context (`ctx.close()`) then invokes `onClick` —
  matches S-GM-ITEM-1.
- `INTENT_STYLES` map matches the spec table exactly: edit/create→`text-primary`
  (EditIcon/PlusIcon), pay/activate/approve→`text-success` (PayIcon/CheckCircleIcon/CheckCircleIcon),
  deactivate/disapprove→`text-warning` (BanIcon/BanIcon), delete→`text-danger` (TrashIcon); neutral
  (no intent)→`text-text`, no icon — matches S-GM-ITEM-2/3.
- `icon={null}` suppresses, `icon=undefined` uses intent default — matches S-GM-ITEM-4.
- `separatorBefore` (explicit prop, never auto-derived from `intent==='delete'`) renders
  `role="separator"` immediately before the item — matches S-GM-ITEM-5/GM-NGOAL-4.
- 3 new icons confirmed in `icons.tsx`: `PayIcon`, `CheckCircleIcon`, `BanIcon` (line 161/175/189),
  each following the base icon convention — matches GM-ICONS.
- `action-menu.test.tsx` covers S-GM-MENU-1..4 and S-GM-ITEM-1..5 (9 tests), all passing.

## All 9 Menus — Requirement Compliance

| Menu | File | Items/Intents | Separator | Status |
|---|---|---|---|---|
| category-actions-menu | `sales/components/category-actions-menu.tsx` | Editar Categoría(edit), Nuevo Productos(create), Nuevo Producto(create); custom label "Opciones de categoría" | none | PASS |
| category-product-list ProductRow | `sales/components/category-product-list.tsx` | Editar(edit), Eliminar(delete) | before delete | PASS |
| sale-credit-list | `sales/components/sale-credit-list.tsx` | Editar(edit), Pagar por(pay, only `!saleCredit.paid`); per-row `ActionMenu` instance (no shared `openMenuId`) | none | PASS |
| owner-card-list | `admin/owners/components/owner-card-list.tsx` | Editar(edit), Eliminar(delete) | before delete | PASS |
| reseller-card-list | `admin/resellers/components/reseller-card-list.tsx` | Editar(edit) ONLY — see Deviation below | n/a | PASS (documented deviation) |
| user-card-list | `management/users/components/user-card-list.tsx` | Editar(edit, always), Activar(activate, `!isActive`) XOR Desactivar(deactivate, `isActive`) | none | PASS |
| entry-list (gear-ified) | `inventory/components/entry-list.tsx` | Editar(edit)→`onEdit?.(entry)`, Eliminar(delete)→`onDeactivate?.(entry)`; gate `isOwnerAdmin && !readOnly` preserved | before delete | PASS |
| expense-list (gear-ified) | `expenses/components/expense-list.tsx` | Editar(edit)→`onEdit?.(expense)`, Eliminar(delete, only when `onDelete` provided)→`onDelete(expense)`; gate `!readOnly` | before delete | PASS |
| store-card-list (gear-ified) | `admin/stores/components/store-card-list.tsx` | Editar(edit)→`onEdit(store.id)`, Desaprobar(disapprove) XOR Aprobar(approve) by `store.approved`; Activate/Deactivate stay dead-coded | none | PASS |

All handler call signatures preserved (verified by direct source read, matches GM-PARITY-2). Owner/reseller/user
`getByRole('menuitem', {name})` + `/acciones/i` assertions confirmed unedited (GM-PARITY-1) — `git diff` on those
test files shows only new S-GM-* assertions appended, no existing lines removed/changed.

## Reseller Deviation — Classified: Acceptable Deviation (not a defect)

Design doc said "identical migration to owner-card-list" (Editar + Eliminar). Apply deviated to
Editar-only. Verified independently against both the React source/test and the Angular source:
- `reseller-card-list.tsx` props: `{resellers, onCreate, onEdit}` — **no `onDelete` prop exists.**
- `reseller-card-list.test.tsx` explicitly asserts Activar/Desactivar/Eliminar are **not** rendered
  and exactly one menuitem (Editar) exists.
- Angular source `resellers.component.ts` (frontend/src/app/presentation/resellers/resellers.component.ts:47-57):
  `deleteReSeller`, `activateReSeller`, `deactivateReSeller` are genuinely **empty no-op method bodies**.
  Only Edit is functionally wired (via `routerLink` in the template, not even a click handler).

Adding Eliminar/Activar/Desactivar to React would invent new behavior with no real handler behind it,
violating GM-NGOAL-2 (no data-layer/handler-signature changes) and the project's "migration invents
nothing new" policy. The Editar-only migration is **correct** — classified acceptable-deviation, not
a defect. Consistent with the same policy already applied to `store-card-list.tsx`'s dead-coded
Activate/Deactivate (GM-NGOAL-5).

## Regression Checks

- **sale-credit-list cross-row isolation**: each row renders its own `ActionMenu` instance (component-local
  `useState` inside the primitive) — architecturally cannot leak open state across rows. Confirmed test
  `S-GM-SALE-CREDIT-3: opening row A does not open row B` exists and passes.
- **Downstream route-test fixups**: `expenses-routes.test.tsx` (1 test) and
  `admin/stores/routes/__tests__/store-list.test.tsx` (4 tests) diffs reviewed via `git diff` — both are
  purely mechanical interaction-model updates (open the gear `data-testid` first, then click the
  `menuitem`/text that was previously a flat button). No assertion logic, expected values, or mock
  setups were changed. Confirmed legitimate, not masking a behavior change.

## Tasks vs Code State

All 17 tasks (tasks.md) marked `[x]` and independently confirmed complete by source inspection:
Phase 1 (primitive+icons), Phase 2 (6 restyles), Phase 3 (3 gear-ifications), Phase 4 (verification).
No incomplete or stale-marked tasks found.

## Issues

**CRITICAL:** None.
**WARNING:** None.
**SUGGESTION:** None.

## Final Verdict: PASS

All 9 menus match spec (intents, colors, separators, handler signatures). Primitive contract holds
(9/9 action-menu.test.tsx tests pass). Full suite green (1789/1789), typecheck clean (0 errors), fresh
uncached run. Reseller Editar-only deviation is justified by source evidence, not a defect. No
regressions in sale-credit-list isolation or the two downstream route-test fixups.
