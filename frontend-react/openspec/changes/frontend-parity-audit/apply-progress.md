# Apply Progress: Frontend Parity Audit (Angular → React)

**Change:** frontend-parity-audit
**Phase:** Apply (in progress)
**Date:** 2026-07-01
**Mode:** Hybrid (engram + openspec file)

---

## What

Three-fix targeted UI/shell batch (not a numbered Stage): sidebar zero-width collapse,
header-dropdown click-outside dismiss, extended-FAB button variant applied to Products.
Branch: `feat/frontend-parity-audit`, 4 work-unit commits (`b51744d` sidebar w-0, `22af1b5`
useClickOutside hook + navbar/cart-shell wiring, `33701a7` stale app-layout test fix,
`df02889` fab Button variant + Products application). No PR opened per explicit
instruction. `tsc --noEmit` clean (web-store-pos + domain package). `vitest run`: 78 test
files / 844 tests passed (was 77 files / 832 tests before this batch; net +1 test file
`use-click-outside.test.ts`, +12 tests: 3 hook tests, 2 navbar S-NAV-6, 2 cart-shell CART-05,
5 button fab-variant tests).

## Why

User reported three concrete visual/interaction parity gaps vs Angular after the prior
shared-shell batch: (1) collapsed sidebar left a blank 64px column instead of fully
disappearing, (2) buttons looked nothing like Angular's Material purple FAB pills, (3)
header dropdowns (user menu, cart) stayed open on outside click.

## Where

- `frontend-react/apps/web-store-pos/app/shared/components/sidebar.tsx` — w-16 -> w-0
- `frontend-react/apps/web-store-pos/app/shared/components/__tests__/sidebar.test.tsx`
- `frontend-react/apps/web-store-pos/app/shared/components/__tests__/app-layout.test.tsx`
  — stale w-16 assertion updated to w-0 (fallout of sidebar fix, no behavior change)
- `frontend-react/apps/web-store-pos/app/shared/lib/hooks/use-click-outside.ts` (NEW)
- `frontend-react/apps/web-store-pos/app/shared/lib/hooks/__tests__/use-click-outside.test.ts` (NEW)
- `frontend-react/apps/web-store-pos/app/shared/components/navbar.tsx` — userMenuRef +
  useClickOutside wired to user-menu dropdown
- `frontend-react/apps/web-store-pos/app/shared/components/cart-shell.tsx` — cartRef +
  useClickOutside wired to cart panel
- `frontend-react/apps/web-store-pos/app/shared/components/__tests__/navbar.test.tsx` —
  S-NAV-6 describe block (2 tests)
- `frontend-react/apps/web-store-pos/app/shared/components/__tests__/cart-shell.test.tsx` —
  CART-05 describe block (2 tests)
- `frontend-react/apps/web-store-pos/app/shared/components/ui/button.tsx` — new
  `variant="fab"` (rounded-full, px-6 py-3, shadow-lg, bg-primary/text-white); refactored
  VARIANT_CLASSES so radius/padding/shadow live per-variant instead of shared base classes
- `frontend-react/apps/web-store-pos/app/shared/components/ui/__tests__/button.test.tsx` —
  5 new fab-variant tests
- `frontend-react/apps/web-store-pos/app/sales/routes/products.tsx` — add-category-button
  and import-csv-button switched from variant="outline" to variant="fab" (mapped to
  Angular's two mat-fab extended actions); bulk-edit and create buttons untouched
  (Angular uses mat-raised-button there per prior batch's pilot restyle 9084dd9)

## Angular refs used

- `frontend/src/scss/themes/layouts/menu/sidebar.scss` — `.navbar-collapsed { width: 0px; }`
  rule confirms collapsed sidebar must be zero-width, not a narrow icon rail
- `frontend/src/app/presentation/products/products.component.html` — two `<button
  mat-fab extended color="primary">` elements: `openCreateCategoryModal()` ("+ Categoría"
  via PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY) and `openImportCsvProductModal()`
  ("Importar Productos" via PRODUCT_CATEGORY.IMPORT_PRODUCTS) — confirmed pill/FAB shape,
  filled purple, icon+label pattern the fab variant replicates
- Primary token already confirmed Material deeppurple-amber `#673ab7` (rgb 103 58 183) in
  `frontend-react/packages/web-common/styles.css` from prior batch's `e11cce9` fix — fab
  variant reuses `bg-primary` so it renders the correct purple automatically

## TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR |
|---|---|---|---|
| useClickOutside hook | wrote use-click-outside.test.ts (3 tests: outside-closes, inside-does-not-close, cleanup), confirmed import failure (file didn't exist) | implemented hook (mousedown listener on document, ref.contains check), 3/3 pass | n/a |
| Navbar dropdown outside-click | wrote S-NAV-6 (2 tests), confirmed "closes on outside click" failed (dropdown stayed open, `Editar Perfil` still found) | added userMenuRef + useClickOutside(userMenuRef, close), 19/19 navbar tests pass | n/a |
| CartShell panel outside-click | wrote CART-05 (2 tests), confirmed "closes on outside click" failed (`Carrito` title still found after outside mousedown) | added cartRef + useClickOutside(cartRef, close), 6/6 cart-shell tests pass | n/a |
| Button fab variant | wrote 5 new fab-variant tests (rounded-full, bg-primary+text-white, shadow-lg, px-6/py-3, not-rounded-md), confirmed 4/5 failed against old single shared-class Button (rounded-md/px-4/py-2/shadow-card hardcoded) | added `fab` to ButtonVariant union + VARIANT_CLASSES, moved radius/padding/shadow into each variant's classes (was shared base classes), 17/17 button tests pass | n/a |
| Sidebar zero-width | pure Tailwind class swap (w-16 -> w-0), test assertion updated as part of same change to assert w-0 and NOT w-16 — VISUAL note, no independent RED/GREEN cycle since it's a single-class swap in an existing behavior-verified test | n/a | n/a |

## Design decisions / deviations

- **Button component refactor**: rather than bolt `fab` onto the existing shared
  `rounded-md px-4 py-2 shadow-card` base string with an override, moved radius/padding/
  shadow into each `VARIANT_CLASSES` entry so the fab variant isn't fighting inherited
  base classes for shape. Base string now only carries flex/typography/transition/
  disabled-state classes common to every variant. No visual change for existing variants
  (primary/secondary/danger/outline) — verified via unchanged 12 pre-existing button tests.
- **FAB mapping scope**: only the two buttons that are literally `mat-fab extended` in
  Angular's products.component.html got `variant="fab"` (add-category, import-csv). Did
  NOT touch bulk-edit or create-product buttons — Angular doesn't use mat-fab for those,
  and the instruction explicitly said do not change the button SET or wording (functional
  Sales slice deferred to Stage 1). cart-shell.tsx and other cyan-colored buttons/controls
  were NOT touched — out of scope for this batch (color/cyan cleanup already flagged as
  deferred in the prior shared-shell batch).
- **useClickOutside placement**: put it in the existing `shared/lib/hooks/` directory
  (matches `use-online-status.ts`/`use-unsaved-changes-prompt.ts` convention) rather than
  a new `hooks/` under `shared/components/` — consistent with existing project structure.
- **App-layout test fallout**: found and fixed `app-layout.test.tsx`'s two tests asserting
  the old `w-16` collapsed class (from the prior batch's collapsed-by-default work) —
  same behavior, just the stale expected string; not weakened, corrected to match new
  markup.

## Test/Build Results

- `vitest run`: 78 test files / 844 tests passed (0 failed). Baseline before this batch: 77
  files / 832 tests — net +1 test file (`use-click-outside.test.ts`) and +12 tests.
- `tsc --noEmit`: clean for both `frontend-react/apps/web-store-pos` and
  `frontend-react/packages/domain`.

## Workload / PR Boundary

- Mode: direct work-unit commits on `feat/frontend-parity-audit`, NO PR, per explicit
  user instruction for this batch.
- 4 work-unit commits: `b51744d` (sidebar w-0, 9 ln), `22af1b5` (useClickOutside hook +
  navbar/cart-shell wiring + tests, 178 ln), `33701a7` (app-layout test fix, 4 ln), `df02889`
  (fab Button variant + Products application, 63 ln). Total ~254 changed lines across 4
  commits — well under the 400-line single-PR review budget; this was a small targeted
  fix batch, not a full module stage.
- Boundary: this batch = 3 targeted shell/UI fixes only (sidebar width, FAB button style,
  dropdown outside-click). Does NOT touch Products page functional behavior (button
  set/wording unchanged, per explicit instruction — that remains Stage 1 Sales scope),
  does NOT touch cart-shell's remaining cyan color classes (deferred, out of scope), does
  NOT touch other views' button styling beyond the two Products FAB actions.

## Status

3-fix targeted batch: complete. Ready for `sdd-verify` on this slice, or continue to Stage 1
(Sales) per the tasks artifact's module order for the next full-stage batch.
