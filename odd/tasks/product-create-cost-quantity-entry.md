# Product create popup: cost, cost currency and day-entry quantity (owner only)

## Objective

When the store **owner** creates a product from the `sales/products` catalog popup, they can also
provide the product's **cost**, its **cost currency** (only with the MultiMonedas module), and an
opening **quantity**. If both a quantity `> 0` and a cost are supplied, one inventory entry is
created for that product in the day's entry, immediately after the product is created.

## Problem

Today the create popup captures only the sale price and the sale currency. Creating a new product
that has stock on the shelf forces a second, separate manual trip to the inventory entry screen,
and the two screens are easy to get out of sync. The CSV importer already solves exactly this
(`csv-import-cost-quantity-entries`, 2026-08-04): after creating products it creates one inventory
entry per row carrying a qualifying quantity. The manual popup has no equivalent.

## Scope

In scope:

- Three controls in `CreateProductModal`, rendered only for the store owner **who also has the
  Inventory module (3) active**.
- `cost` shares a row with `price`, **before** it. Nombre stays its own full-width row, untouched.
- `costCurrency` shares a row with the sale `currency`, **before** it; renders only with the
  MultiMonedas module active.
- `quantity` occupies its own row, **after** the currency row, and accepts decimals.
- After a successful create, `products.tsx` creates one day-entry via
  `InventoryOfflineService.createInventoryEntry` when `quantity > 0` AND a cost is present, and
  confirms it with a success toast.

Out of scope (deliberately):

- **Persisting the cost on the product.** `Product` has no cost field, in the domain model or in
  `backend/src/Domain/Entities/Products/Product.cs`. The user chose entry-only, mirroring the CSV
  import: the cost is the historical cost of that purchase and lives in
  `InventoryEntryView.costPrice`. Reopening the product does not show it.
- Persisting cost on the product for reuse, any backend change, any migration.
- **The edit-product modal** — user decision 2026-10-01 ("en editar no"). Separate change if wanted.
- The bulk-edit modal and the CSV importer (already have this behaviour).

## Constraints

- Non-owner users see the popup exactly as today: no cost, no cost currency, no quantity.
- An owner **without** the Inventory module sees the popup exactly as today too.
- Non-MultiMonedas users get no currency selectors; both currencies stay CUP, matching the
  importer's `costCurrency: currenciesAllowed ? row.costCurrency : undefined`.
- Cost and quantity are **optional**: leaving them empty must not block product creation.
- The product is created regardless of whether the entry succeeds. The entry is additive.

## Decisions

| # | Decision | Why |
|---|----------|-----|
| 1 | Entry-only cost, never persisted on the product | User decision. Zero model/DB change; the cost is the purchase-time fact. |
| 2 | No `cost ?? price` fallback (the importer HAS one) | User decision: "si no pone ... un costo entonces no se adiciona nada". The importer's fallback would silently book the sale price as the cost. |
| 3 | Resolve the new product's id with `findProductByCategoryAndName` | `createProduct` returns `BaseResponseModel<boolean>`, but `createInventoryEntry` requires the id or returns `null`. This is the CSV importer's own id-resolution method and matches its product-identity rule (category + name, case-insensitive). Avoids changing the `ProductService` interface, which both the online and offline services implement. |
| 4 | Explicit `cost` of `0` is a valid cost and DOES create the entry | User decision: "Cero si la crea, si quiero vender algo que me regalaron por ejemplo." Mirrors importer decision #7/#16. Only an empty field means absent. |
| 5 | `quantity <= 0` creates no entry, and does not block | Mirrors importer decision #8. `!quantity` alone is insufficient: `!(-3)` is `false` in JS. |
| 6 | A non-empty but non-numeric cost/quantity blocks submit with a validation message | User decision: "bloquea con mensaje". Kept as the modal's defensive idiom, same as price/order. **Caveat found while testing:** with `type="number"` the HTML sanitization algorithm never lets a non-numeric value reach React state — the input simply goes empty. So this branch is defensive-only and unreachable through the UI; the observable behaviour is that the optional field stays optional. Pinned by test, not assumed. |
| 7 | Quantity accepts any fraction with `.` as the decimal separator (`step="any"`, `parseFloat`) | User decision: "se permite decimales con el . como separador decimal", plus "cualquier fracción" when shown that the project already ships `step="any"` for the POS sale row (`sales/decimal-quantity`, obs 898). Kilos, litres, half units. A `parseInt` would book `1.5` as `1` — a silently wrong quantity in an accounting entry. A `step="0.01"` cap was rejected as artificial: `createInventoryEntry` stores the quantity verbatim, so it would reject `0.333` on a screen where the POS accepts it. |
| 8 | A success toast fires when the entry is created | User decision: "si". The popup never lists entries and the cost is not stored on the product, so without this the owner has no visible confirmation that the purchase was booked. Fires only on `entry?.succeeded` — never when the product was created without an entry, nor when the entry could not be created. |
| 9 | Two independent currency selects, both changeable, both defaulting to CUP; the FIRST change of the cost currency also sets the price currency, and only that first one | User decision. The latch is a one-shot: it is the shortcut for an owner who buys and sells in the same currency, without stealing the explicit choice the user makes afterwards. |
| 10 | The three controls render only when the Inventory module (3) is active | User decision: "ok, ocultalos". The day's entry is an inventory movement; without the module there is no screen to book it into, so offering the fields would lead nowhere. The price currency selector is NOT gated by this — it is the product's own currency and belongs to MultiMonedas alone. |
| 11 | Distinct labels: "Moneda del costo" / "Moneda del precio" | Two identical adjacent "Moneda" labels were unreadable. This changed the pre-existing price-currency label inside this modal only; the edit modal has its own copy. |

### Edge case the user should know about (implemented literally, not silently)

If the owner changes the **price** currency first and the **cost** currency afterwards, the first
cost change still overwrites the price currency — the latch counts cost-currency changes, exactly
as specified. That is the literal reading of "cuando cambie el costo entonces debe poner la misma
en el precio pero solo la primera vez que se cambie". Flagged here rather than deviated from.

## Tasks

- [x] **T1** Map the create popup, the importer's entry creation, the owner gate, the MultiMonedas
      gate, and the i18n keys. **Route: inline (read-only).** Bounded read; subagents are
      unavailable on this runtime (`OpenCode's free tier can only be used from within OpenCode`).
- [x] **T2** Create this feature document + Engram mirror. **Route: inline** (one file).
- [x] **T3** `create-product-modal.tsx`: `cost`/`quantity`/`costCurrency` state, row layout, owner
      gate, validation, extended `onSave` payload. **Route: delegated writer (blocked — inline).**
      Subagents unavailable on this runtime; the skipped delegation is recorded here so it stays
      observable instead of silent.
- [x] **T4** `products.tsx`: `handleCreateProduct` creates the day entry and confirms it with a
      toast. **Route: delegated writer (blocked — inline).** Same reason.
- [x] **T6** User decisions round 1: cost `0` keeps creating the entry, decimal quantities,
      blocking validation kept, toast on, cost-currency/price-currency latch, Inventory-module
      gate, edit modal excluded.
- [x] **T7** Quantity precision aligned with the existing POS decision: `step="0.01"` → `step="any"`
      after showing that `createInventoryEntry` stores the quantity verbatim and the POS already
      accepts free fractions for the identical concept.
- [x] **T8** Verify: `pnpm typecheck`, `pnpm lint --max-warnings=0`, `pnpm test`.

## Authorized scope

- `frontend-react/apps/web-store-pos/app/sales/components/create-product-modal.tsx`
- `frontend-react/apps/web-store-pos/app/sales/routes/products.tsx`
- `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` (3 new keys)
- Tests for the above.

No backend file is touched by this change, so the backend approval rule is not triggered. No
existing E2E test is touched, so the E2E rule is not triggered.

## Acceptance criteria

1. An owner with Inventory + MultiMonedas sees Costo, Moneda del costo, Moneda del precio and
   Cantidad in the specified rows, with Nombre untouched as its own full-width row.
2. A non-owner — and an owner without the Inventory module — sees the popup exactly as before,
   except the price currency keeps its own selector under MultiMonedas.
3. Cost + quantity `> 0` → exactly one day entry created with that cost and cost currency, plus a
   success toast.
4. Either one missing, or quantity `<= 0` → product created, **no** entry, **no** entry toast.
5. Fractional quantities are booked exactly as typed, never truncated and never capped.
6. Without MultiMonedas, neither currency selector renders and both currencies stay CUP.
7. The first cost-currency change moves the price currency; later ones do not.
8. The product is created even when the entry cannot be created.

## Applicable checks

- `pnpm --filter @store-mgmt/web-store-pos typecheck` → **clean**
- `pnpm --filter @store-mgmt/web-store-pos lint -- --max-warnings=0` → **clean**
- `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/sales` → **64/64 files, 1414 tests**
- Full suite → **328/330 files, 4868/4871 tests** (see below)

## Progress

T1–T8 complete. **Work-unit commit:** the commit that carries this document —
`feat(sales): book a day-entry when creating a product with cost and quantity` on `qa`,
921 insertions / 24 deletions across 6 files. (A commit cannot record its own hash; the
identity is captured in the Engram mirror `odd/product-create-cost-quantity-entry/tasks`.)

## Verification evidence

- `typecheck`: no output, exit 0.
- `lint --max-warnings=0`: no output, exit 0.
- `vitest run app/sales`: 64 files passed, 1414 tests passed, no type errors.
- New tests: `create-product-entry.test.tsx` (28) and the
  `crear producto con costo y cantidad -> entrada del día` block in `products.test.tsx` (10).
- Full suite, two failures, both unrelated to this change:
  1. `app/management/exchange-rates/routes/__tests__/exchange-rates.test.tsx` —
     "defaults new records to 1 and persists them through the service", expected 3 rows, got 1.
     **Pre-existing.** Proven earlier by stashing this change and reproducing the identical
     failure on the clean tree. Cannot be fixed: existing tests are untouchable without explicit
     authorisation.
  2. `app/management/users/routes/__tests__/user-routes.test.tsx` — 2 tests timed out at 5000 ms
     under full parallel load ("fetches users on mount and renders them", "renders the Empleados
     page title"). **Flake.** Re-run in isolation: 28/28 pass, the first in 2978 ms. This diff
     does not touch `app/management/users`.

## Next step

**Rollback boundary:** reverting the commit that carries this document removes exactly the popup
controls, the `handleCreateProduct` entry creation + toast, the three i18n keys, and their tests.
Nothing else depends on them — `findProductByCategoryAndName` and `createInventoryEntry` are
pre-existing and still used by the CSV importer.

Pushed to `qa`. No PR opened: creating one is the user's call under ordinary repository policy.
