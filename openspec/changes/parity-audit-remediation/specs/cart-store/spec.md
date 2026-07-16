# Cart Store Specification (New Capability)

## Purpose

Define `cart-store.ts`'s `CartItem`/`CartState` shape reaching parity with Angular's
`ShoppingCartService`/`CartItem` model (`_models/order/cart-item.model.ts`,
`_services/order/shopping-cart.service.ts`). Reverts React's current `CartItem { product: Product;
quantity; price? }` (embedded `Product`) to Angular's flat `{ productId, name, quantity, price }`,
and adapts all 19 consuming files.

## Requirements

### Requirement: CartItem Is A Flat Shape
`CartItem` MUST be `{ productId: string; name: string; quantity: number; price: number }` — it MUST
NOT embed a full `Product` object. This mirrors Angular's `cart-item.model.ts` literally: no nested
object, no optional `price` (Angular's `price` is a required `number`, always supplied at add-time).

#### Scenario: CartItem has no embedded product
- GIVEN a reviewer inspects the `CartItem` type
- WHEN checking its fields
- THEN it declares exactly `productId`, `name`, `quantity`, `price` — no `product` field, no
  nested `Product` reference

### Requirement: addItem Derives productId/name At Add-Time
`addItem` MUST resolve `product.id`/`product.name` into the stored `CartItem.productId`/`name` at
the moment of insertion (mirrors Angular's `addItem`, `shopping-cart.service.ts:113-118`, which
copies `product.id`/`product.name` into the pushed item rather than keeping a `Product` reference).
Subsequent product edits (e.g. renaming the product) MUST NOT retroactively change an already-added
cart line's `name` — the cart holds a point-in-time copy, exactly like Angular.

#### Scenario: Cart line survives a later product rename
- GIVEN a product `P1` named `"Cola"` is added to the cart
- WHEN `P1` is later renamed to `"Cola Zero"` (outside the cart)
- THEN the existing cart line's `name` remains `"Cola"` (copied at add-time, not a live reference)

### Requirement: Cart Consumers Read Flat Fields
All 19 consuming files/components (cart rendering, totals, availability checks, stats aggregation,
tests) MUST read `item.productId`/`item.name`/`item.price` directly, not `item.product.id`/
`item.product.name`/`item.product.price`. Any code needing full `Product` details (e.g. image,
category) MUST fetch it separately via the product service/repository, mirroring Angular's own
components (which look up `Product` by `productId` when they need more than the cart line itself
provides).

#### Scenario: Cart line rendering resolves product details separately
- GIVEN a cart line for `productId = "P1"`
- WHEN the cart UI needs the product's image or category
- THEN it fetches that data via the product service using `productId`, not from an embedded
  `product` field on the cart item

### Requirement: Cart Totals And Behavior Are Unchanged
`total()` (sum of `price * quantity`), `getItemQuantity(productId)`, `removeItem`, `updateQuantity`,
`toggleCredit`, `setPaymentType`, `setClientName`, `updateOrderDetails`, `getOrderDescription`, and
`clear()` MUST continue producing identical results to before the shape change — only the field
storage format changes (flat vs. embedded), not the computed values.

#### Scenario: Totals are unaffected by the shape change
- GIVEN a cart with 2 items at known prices/quantities
- WHEN `total()` is computed before and after this change
- THEN both computations produce the same numeric result

#### Scenario: getItemQuantity keyed by productId
- GIVEN a cart item with `productId = "P1"`
- WHEN `getItemQuantity("P1")` is called
- THEN it returns that item's quantity, matching pre-change behavior
