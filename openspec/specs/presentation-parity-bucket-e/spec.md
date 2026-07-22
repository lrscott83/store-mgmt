# Presentation Parity — Bucket E Specification

## Purpose

Final cosmetic cleanup pass of the Angular→React presentation-parity audit. Five
low-severity divergences remain: payment-method icons dropped from two expense
views, admin dashboard range buttons with no active state, the owner "Gestor"
(reseller) field in the wrong DOM position, an inverted price·stores label on the
owner card, and a redundant category sub-label plus extra "Disponible" block on
the inventory-available row. No new behavior or abstraction — every requirement
is "React MUST render exactly as Angular's equivalent template."

## Requirements

### Requirement: Payment-method icon before Gastos total (Cuadre del día)

`sales/routes/today-stats.tsx` MUST render the payment-method icon
(`PaymentMethodIcon` via `getPaymentTypeIconKind`) immediately before each Gastos
row's total amount, mirroring `expense-list.component.html:12`.

#### Scenario: Gastos row shows payment icon before total
- GIVEN the Cuadre del día Gastos section renders an expense with a payment type
- WHEN the row is rendered
- THEN the row contains a `PaymentMethodIcon` element immediately preceding the
  total-amount text

### Requirement: Payment-method icon in Gastos-history radio filter

`expenses/routes/expenses-history.tsx` MUST render the payment-method icon before
each `PAYMENT_TYPE_OPTIONS` radio label, EXCEPT the "Todas" (`null`) option, which
MUST render with no icon, mirroring `expenses.component.html:15-23`.

#### Scenario: Real payment-type option shows icon
- GIVEN a radio option with `opt.value` equal to Efectivo, Tarjeta, Zelle, or a
  non-null default
- WHEN the option renders
- THEN it contains a `PaymentMethodIcon` element before the label text, using the
  glyph mapped for that value (cash-stack / credit-card / phone / currency-dollar)

#### Scenario: "Todas" option shows no icon
- GIVEN the radio option with `opt.value === null` ("Todas")
- WHEN the option renders
- THEN it contains no `PaymentMethodIcon` element

### Requirement: Admin dashboard range-button active state

`admin/dashboard/routes/dashboard.tsx` MUST apply an active visual state to the
"7 días" button when `viewType === '7days'` and to the "30 días" button when
`viewType === '30days'`, mirroring `admin-dashboard.component.html:13-14`.
`statistics/dashboard` is out of scope and MUST NOT be touched.

#### Scenario: Selected range button carries active state
- GIVEN `viewType` is `'7days'`
- WHEN the range buttons render
- THEN the "7 días" button carries the active class/attribute and the "30 días"
  button does not
- AND WHEN `viewType` becomes `'30days'`, the active state moves to the "30 días"
  button

### Requirement: Owner "Gestor" (reseller) field position parity

`admin/owners/routes/owner-create.tsx` MUST render the `isSuperAdmin` reSeller
`<select>` FIRST, before Full Name. `admin/owners/routes/owner-edit.tsx` MUST
render it THIRD, after Full Name and before the `isActive` toggle. State and
handlers are unchanged — only DOM order moves.

#### Scenario: Create form renders reSeller first
- GIVEN `owner-create.tsx` renders for a super-admin
- WHEN the form fields are inspected in DOM order
- THEN the reSeller select appears before the Full Name field

#### Scenario: Edit form renders reSeller third
- GIVEN `owner-edit.tsx` renders for a super-admin
- WHEN the form fields are inspected in DOM order
- THEN the reSeller select appears after Full Name and before the Activo toggle

### Requirement: Owner card price·stores label order

`admin/owners/components/owner-card-list.tsx` MUST render the price·stores label
as `"{currency} en {store-count-label}"` (currency first, literal "en"
connective), mirroring `owners.component.html:70`, while KEEPING React's correct
pluralization (`OWNER.STORE_PRICE_LABEL`). The em-dash and inverted order MUST be
removed.

#### Scenario: Label renders price-first with "en" connective
- GIVEN an owner card with price `$100.00` and 3 stores
- WHEN the card renders
- THEN the label text equals "$100.00 en 3 tiendas"
- AND WHEN the store count is 1, the label uses the singular form ("1 tienda")
  via React's existing pluralization, not Angular's always-singular text

### Requirement: Inventory Disponible row — inline quantity, no redundant nodes

`inventory/components/inventory-product-list.tsx` MUST render each product row's
name as `"{productName} ({totalAvailable})"` and MUST NOT render a separate
`categoryName` sub-label or a standalone "Disponible" block, mirroring
`inventory-product-list.component.html:12-29`. The two currency lines (avg cost,
total value) MUST remain.

#### Scenario: Row shows inline quantity, no category sub-label, no Disponible block
- GIVEN a product row with `productName: "Coca-Cola"` and `totalAvailable: 12`
- WHEN the row renders
- THEN the name cell text equals "Coca-Cola (12)"
- AND no element renders the product's `categoryName` as a sub-label
- AND no "Disponible" labeled block/element renders for that row
- AND the two currency cells (avg cost, total value) still render
