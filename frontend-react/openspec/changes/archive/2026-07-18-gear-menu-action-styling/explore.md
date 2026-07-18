# Exploration: gear-menu-action-styling

> Survey performed prior to this change (captured here for the record). Re-confirm
> exact file structure during spec/apply.

## Context

Continuing Angular-parity work in `frontend-react/apps/web-store-pos/app/`. The
Products area is fully done. Gear/action menus ("popups") across the app are
styled inconsistently: some use icons, some don't; colors and hover behavior
vary; and several places where Angular shows a settings gear + `mat-menu` are
implemented in React as flat inline buttons.

## User-Approved Design (Option A)

Every action-menu item follows:
- Semantic color on the FOREGROUND (icon AND text) by action type — never a solid
  background fill at rest.
- Hover = a SOFT tint of the action color (e.g. violet-50 / red-50), not a full fill.
- A thin separator line ABOVE the destructive (Eliminar/Delete) item.

### Color map by action type
| Action (es / en) | Intent | Color |
|---|---|---|
| Editar / edit | edit | primary (violet) |
| Nuevo, Adicionar / add | create | primary (violet) |
| Pagar / pay | pay | success (green) |
| Activar / activate | activate | success (green) |
| Desactivar / deactivate | deactivate | amber / muted |
| Aprobar / approve | approve | success (green) |
| Desaprobar / disapprove | disapprove | amber / muted |
| Eliminar / delete | delete | danger (red) + separator above |

## Inventory of gear/action menus

### RESTYLE (gear already exists)
- `sales/components/category-actions-menu.tsx` — Editar Categoría (edit), Nuevo
  Productos (add), Nuevo Producto (add). No destructive item.
- `sales/components/category-product-list.tsx` ProductRow menu — Editar Producto
  (edit), Eliminar Producto (delete + separator). Has icons already; needs colored
  text + hover tint + separator.
- `sales/components/sale-credit-list.tsx` — gear is a hand-rolled inline svg
  (replace with shared `SettingsIcon`); items Editar (edit), "Pagar por" (pay). No
  icons currently.
- `admin/owners/components/owner-card-list.tsx`,
  `admin/resellers/components/reseller-card-list.tsx`,
  `management/users/components/user-card-list.tsx` — gear uses `SettingsIcon`
  already; dropdown items (Editar / Eliminar / Activar / Desactivar) currently have
  NO icons — add icons + colors + separator before Eliminar.

### ADD A GEAR (Angular has settings gear + mat-menu; React uses flat buttons)
- `inventory/components/entry-list.tsx` — flat Editar/Eliminar buttons → gear menu
  (Angular `entry-list.component.html:24-38`).
- `expenses/components/expense-list.tsx` — flat Editar/Eliminar (Eliminar already
  has `TrashIcon`) → gear menu (Angular `expense-list.component.html:20-37`).
- `admin/stores/components/store-card-list.tsx` — inline Editar/Aprobar/Desaprobar
  buttons → gear menu (Angular `store-list.component.html:17-51`).

## Reference implementation
Gear + dropdown + `useClickOutside` pattern lives in
`sales/components/category-product-list.tsx` (ProductRow) and
`category-actions-menu.tsx`.

## Icons
Existing in `shared/components/ui/icons.tsx`: `EditIcon`, `TrashIcon`, `PlusIcon`,
`SettingsIcon`. Likely MISSING and to be added: pay/payment, activate/check,
deactivate/ban, approve/check (approve may reuse the check icon).

## Constraints
- Strict TDD active. Test: `pnpm test`. Typecheck:
  `pnpm -C apps/web-store-pos exec tsc --noEmit`.
- Migration = parity; do NOT invent abstractions Angular lacks beyond the shared UI
  component that centralizes the approved styling.
