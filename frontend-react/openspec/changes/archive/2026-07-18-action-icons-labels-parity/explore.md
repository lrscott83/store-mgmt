# Exploration: action-icons-labels-parity

## Current State

React's Products-area action UI (category gear menu, per-product gear menu, product modals) is missing Material icons that Angular renders next to every action button/menu-item, and 2 button texts diverge from Angular's actual i18n values. All the icon COMPONENTS already exist in `icons.tsx` (EditIcon, PlusIcon, CloseIcon, SaveIcon, TrashIcon, SettingsIcon) — none are new; they just aren't wired into these specific buttons yet. Text keys used by React already resolve to Angular-correct Spanish strings for the gear-menu items; the two real text bugs are `GENERAL.SAVE` (React='Guardar', Angular='Salvar') and `GENERAL.CLOSE` vs `GENERAL.CANCEL` usage in modal footers (React modals use Cancelar-only patterns instead of Angular's dedicated Cerrar+icon fab).

## Side-by-side mapping

### 1. Category gear menu — `sales/components/category-actions-menu.tsx`
Angular source: `frontend/src/app/presentation/products/category-product-list/category-product-list.component.html:10-28` (NOT a menu — 3 separate `mat-fab extended` buttons directly on the page; category-actions-menu.tsx is a documented React-only enhancement, comment at lines 13-21, that folds them into a dropdown. Keep the dropdown container — this SDD only fixes icon+text, not structure).

| Item | React text (i18n key) | React icon | Angular text (i18n key + rendered ES) | Angular `mat-icon` | React file:line to change |
|---|---|---|---|---|---|
| Edit category | `PRODUCT_CATEGORY.EDIT_CATEGORY` = "Categoría" (already correct) | none | `PRODUCT_CATEGORY.EDIT_CATEGORY` = "Categoría" | `edit` (pencil) | `category-actions-menu.tsx:63-70` — add `<EditIcon />` before the text |
| New product (singular) | `PRODUCT.NEW_PRODUCT` = "Producto" (already correct) | none | `PRODUCT.NEW_PRODUCT` = "Producto" | `add` (plus) | `category-actions-menu.tsx:71-78` — add `<PlusIcon />` before the text |
| New products (plural/bulk) | `PRODUCT.NEW_PRODUCTS` = "Productos" (already correct) | none | `PRODUCT.NEW_PRODUCTS` = "Productos" | `add` (plus) | `category-actions-menu.tsx:79-86` — add `<PlusIcon />` before the text |

Note: Angular's button ORDER is Categoría, then Productos (plural), then Producto (singular). React's menu order is Categoría, Producto (singular), Productos (plural) — reversed 2nd/3rd. Flag for propose phase (cosmetic order-only, zero functional risk).

### 2. Per-product gear menu — `sales/components/category-product-list.tsx` (`ProductRow`)
Angular source: same file, lines 46-58 (`mat-menu #menuProduct`).

| Item | React text (i18n key) | React icon | Angular text (i18n key + ES) | Angular `mat-icon` + color | React file:line to change |
|---|---|---|---|---|---|
| Edit product | `PRODUCT.EDIT_PRODUCT` = "Editar Producto" (already correct) | none | `PRODUCT.EDIT_PRODUCT` = "Editar Producto" | `edit`, `color="primary"` (icon only) | `category-product-list.tsx:98-108` — add `<EditIcon className="text-primary" />` |
| Delete product | `PRODUCT.DELETE_PRODUCT` = "Eliminar Producto" (already correct) | none | `PRODUCT.DELETE_PRODUCT` = "Eliminar Producto" | `delete`, `color="warn"` (red) | `category-product-list.tsx:109-119` — add `<TrashIcon />` (button already has `text-danger`, inherits red via currentColor) |

The settings/gear trigger icon already matches Angular's `settings` mat-icon 1:1 in both files — byte-identical to `SettingsIcon` in `icons.tsx:50-62`. Optional DRY cleanup only, not required for parity.

### 3. Product-area modals
Angular footer pattern (all 3 real modals) is CONSISTENT: `mat-fab extended` **Cerrar** (`close` icon) + `mat-fab extended` **Salvar/Actualizar** (`save` icon). React's established parity pattern already exists in `expenses/components/expense-form-modal.tsx:114-120,196-203` (CloseIcon/SaveIcon + `Button variant="fab"`). That is the pattern to replicate.

a) **EditProductCategoryModal** — `edit-product-category-modal.tsx`
- Close (`:104-110`): `GENERAL.CANCEL` no icon → `GENERAL.CLOSE` + `<CloseIcon />`.
- Save (`:111-117`): always `GENERAL.SAVE`, no icon → Angular `(!category ? GENERAL.SAVE : GENERAL.UPDATE)`; `isEditing` bool exists (line 13) → reuse it + `<SaveIcon />`.

b) **CreateProductModal** — `create-product-modal.tsx`
Angular has no real create-product modal (dead stub); canonical source = `edit-product-modal.component.html:90-98` `!product` branch (always create-mode here).
- Close (`:179-185`): `GENERAL.CANCEL` → `GENERAL.CLOSE` + `<CloseIcon />`.
- Save (`:186-192`): `GENERAL.SAVE` (correct, create-mode) → add `<SaveIcon />`.

c) **EditProductModal** — `edit-product-modal.tsx`
- Close (`:181-187`): `GENERAL.CANCEL` → `GENERAL.CLOSE` + `<CloseIcon />`.
- Save (`:188-194`): always `GENERAL.SAVE` → always edit-mode (`product` required), so `GENERAL.UPDATE` + `<SaveIcon />`.
- ARCHITECTURE FLAG: inline delete/confirm-discard block (`:149-178`) has NO Angular equivalent (Angular delete happens via gear menu → SweetAlert). Out of icon/text scope — flag, do not touch.

d) **EditProductsModal** (React bulk price edit) — `edit-products-modal.tsx`
ARCHITECTURE FLAG: React = bulk price-edit; Angular's `EditProductsModalComponent` = bulk ADD new products — different feature. Footer buttons still comparable:
- Close (`:74-80`): `GENERAL.CANCEL` → `GENERAL.CLOSE` + `<CloseIcon />`.
- Save (`:81-88`): `GENERAL.SAVE` (correct) → add `<SaveIcon />`.
Body/feature mismatch = SEPARATE larger-scope question; do not rewrite body.

### 4. Available React icons (`shared/components/ui/icons.tsx`)
Exported: PlusIcon, PaperclipIcon, EditIcon, SettingsIcon, CloseIcon, SaveIcon, TrashIcon, PaymentMethodIcon, EyeIcon, EyeOffIcon, EmptyBoxesIcon, EmptyTrendingIcon. **No new icon components needed.** Consumption pattern: `expenses/components/expense-form-modal.tsx` and `management/users/components/user-card-list.tsx`.

### 5. i18n — exact key/value comparison

| Key | React `es.ts` | Angular `vocabs/es.ts` | Action |
|---|---|---|---|
| `PRODUCT_CATEGORY.EDIT_CATEGORY` | 'Categoría' (:254) | 'Categoría' (:358) | none |
| `PRODUCT.NEW_PRODUCT` | 'Producto' (:256) | 'Producto' (:367) | none |
| `PRODUCT.NEW_PRODUCTS` | 'Productos' (:257) | 'Productos' (:368) | none |
| `PRODUCT.EDIT_PRODUCT` | 'Editar Producto' (:258) | 'Editar Producto' (:369) | none |
| `PRODUCT.DELETE_PRODUCT` | 'Eliminar Producto' (:259) | 'Eliminar Producto' (:370) | none |
| `GENERAL.CLOSE` | 'Cerrar' (:10) | 'Cerrar' (:179) | correct, just not used in 4 modals |
| `GENERAL.UPDATE` | 'Actualizar' (:29) | 'Actualizar' (:180) | correct, just not wired into 2 submit buttons |
| `GENERAL.SAVE` | **'Guardar'** (:6) | **'Salvar'** (:218) | **MISMATCH — global text bug**; single shared key. Consumed by create-product-modal, edit-product-category-modal, edit-product-modal, edit-products-modal (in-scope), PLUS edit-order-details-modal + expense-form-modal (closed Fase 5/6). Global fix recommended (one key, one Angular value) — decision gate for propose. |

Bonus (NOT requested): React invented header-title keys (`PRODUCTS.CATEGORY.CREATE/EDIT`, `PRODUCTS.CREATE/EDIT`, `PRODUCTS.BULK_EDIT`) where Angular reuses existing keys. Out of scope; do not include.

## Affected files (icon/text scope only)
- `sales/components/category-actions-menu.tsx`
- `sales/components/category-product-list.tsx`
- `sales/components/edit-product-category-modal.tsx`
- `sales/components/create-product-modal.tsx`
- `sales/components/edit-product-modal.tsx`
- `sales/components/edit-products-modal.tsx`
- `shared/lib/i18n/es.ts` (GENERAL.SAVE value fix — global blast radius)

## Approaches
1. **Icon wiring + targeted i18n swaps (recommended)** — reuse existing icons + `expense-form-modal.tsx` fab pattern; CANCEL→CLOSE, add UPDATE branch; decide global SAVE fix. Pros: minimal diff, no new components, proven pattern. Cons: SAVE fix touches 2 closed areas. Effort: Low.
2. **New Products-scoped i18n keys** — avoid touching shared SAVE. Cons: diverges from Angular's single-key model (rule 12 violation), permanent parity debt. Not recommended.

## Recommendation
Approach 1. Wire existing icons into the 5 in-scope files via `Button variant="fab"` + icons; fix CANCEL→CLOSE mislabel and SAVE-vs-UPDATE branch; route global SAVE value fix through propose as explicit decision.

## Risks
- `GENERAL.SAVE` fix blast radius into closed expenses/orders modals — needs decision gate.
- EditProductModal orphan delete/confirm-discard block — React-only, do not touch; flag.
- EditProductsModal body (bulk price-edit vs Angular bulk-add) — footer fix safe, body out of scope.
- Category-actions-menu order divergence — mention, confirm before reorder.

## Ready for Proposal
Yes. Two decisions before apply: (1) global vs scoped `GENERAL.SAVE` fix, (2) whether to fix the two architecture flags (recommend leaving both OUT, separate follow-ups).
