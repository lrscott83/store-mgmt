# Sales Module — Product Requirements Document

**App:** Vende De Todo (PWA for small businesses, offline-first)
**Module:** Sales
**Migration:** Angular → React
**Status:** Draft

---

## 1. Overview

The Sales module is the core revenue-generating section of the app. It covers the full sales lifecycle for a small business: browsing and managing a product catalog, placing sales at the point of sale (POS), reviewing order history, and tracking credit sales (deferred payments). All functionality works offline using localStorage as the persistence layer, with sync to a remote backend when connectivity is restored.

The module is protected by authentication and feature-flag guards. Access to individual sub-features is controlled by the `EFeature` enum system.

---

## 2. User Stories

### Products
- As a store owner, I want to see all my products grouped by category so I can quickly find and manage them.
- As a store owner, I want to create a new product with a name, price, category, and barcode so it appears in the POS.
- As a store owner, I want to edit a single product's details when prices or information changes.
- As a store owner, I want to bulk-edit multiple products at once to update prices or availability efficiently.
- As a store owner, I want to import products from a CSV file so I can onboard quickly without manual data entry.
- As a store owner, I want to mark products as unavailable for sale without deleting them.

### POS (Point of Sale)
- As a cashier, I want to browse products by category and add them to a cart so I can build an order.
- As a cashier, I want to scan a barcode to add a product instantly without browsing categories.
- As a cashier, I want to adjust item quantities in the cart before finalizing.
- As a cashier, I want to select the payment type (cash, card, Zelle) to record how the customer paid.
- As a cashier, I want to see the running total and change amount for cash payments.
- As a cashier, I want to mark a sale as a credit sale and record the client's name for deferred payment tracking.
- As a cashier, I want to submit the order so it is saved and inventory is updated.

### Orders
- As a store owner, I want to see all orders placed today in a single view to monitor daily sales.
- As a store owner, I want to browse the full order history with filters to review past transactions.
- As a store owner, I want to view the items in any order to resolve disputes or verify sales.
- As a store owner, I want to edit or cancel an order when a mistake was made.
- As a store owner, I want to see today's sales statistics broken down by category.

### Credits
- As a store owner, I want to see all credit sales created today to track outstanding debt.
- As a store owner, I want to browse the full credit history to see all unpaid and paid credits.
- As a store owner, I want to register a payment on a credit sale to mark it as fully or partially paid.
- As a store owner, I want to edit a credit sale's details or notes.

---

## 3. Routes

All routes are protected by `AuthGuard`. Feature-flag guards enforce per-sub-feature access using the `EFeature` enum.

| Path | Component | EFeature | Feature ID |
|------|-----------|----------|------------|
| `/sales/products` | `ProductsPage` | `Products` | 20 |
| `/sales/sale` | `SalePage` | `Sale` | 21 |
| `/sales/today-orders` | `TodayOrdersPage` | `TodayOrders` | 22 |
| `/sales/today-credits` | `TodaySaleCreditsPage` | `CreditSale` | 110 |
| `/sales/credits` | `SaleCreditsPage` | `CreditSale` | 110 |
| `/sales/orders` | `OrdersPage` | `SalesHistory` | 100 |
| `/sales/stats` | `TodayStatsPage` | `Sale` | 21 |

**Lazy loading:** All routes in this module are code-split at the route level. The barcode scanner (`@zxing/browser`) is additionally lazy-loaded at the component level due to its bundle size impact.

---

## 4. Components

### 4.1 Products Sub-Feature

#### `ProductsPage`
- Page-level container for product catalog management.
- Loads all products and categories from their respective offline services.
- Renders a `CategoryProductList` per category, ordered by `ProductCategory.order`.
- Provides action buttons to open: `CreateProductModal`, `EditProductsModal` (bulk), `CsvProductImporterModal`.

#### `CategoryProductListComponent`
- Receives a `ProductCategory` and the list of `Product` objects belonging to it.
- Displays the category name as a header.
- Renders each product in a row with name, price, availability indicator, and edit action.
- Clicking edit opens `EditProductModal` for that product.

#### `CreateProductModalComponent`
- Modal form for creating a new product.
- Fields: `name` (required), `price` (required, numeric), `categoryId` (required, dropdown), `barcode` (optional), `availableToSale` (toggle), `discountFromInventory` (toggle).
- On submit: calls `ProductOfflineService.create()`, closes modal, triggers catalog refresh.

#### `EditProductModalComponent`
- Modal form for editing a single existing product.
- Pre-fills all fields from the selected `Product`.
- Fields: same as `CreateProductModal` plus read-only `id`.
- On submit: calls `ProductOfflineService.update()`.
- Provides a delete/deactivate action.

#### `EditProductsModalComponent`
- Bulk editing modal for multiple products.
- Renders a scrollable table of all products with inline-editable price and availability fields.
- On save: batches all changed products into a single `ProductOfflineService.updateMany()` call.

#### `EditProductCategoryModalComponent`
- Modal to create or edit a `ProductCategory`.
- Fields: `name` (required), `order` (numeric), `isActive` (toggle).
- Calls `ProductCategoryOfflineService.save()` on submit.

#### `CsvProductImporterModalComponent`
- Modal for bulk product import via CSV file upload.
- Accepts a `.csv` file via drag-and-drop or file picker.
- Parses and validates rows client-side before import.
- Expected columns: `name`, `price`, `categoryName`, `barcode` (optional).
- On confirm: creates missing categories if needed, then bulk-creates products.
- Shows a preview table and error summary before final submission.

---

### 4.2 POS Sub-Feature

#### `SalePage`
- Main POS screen. Full-height layout with category tabs on the left/top and product grid in the body.
- Loads categories and products on mount from their offline services.
- Manages selected category state; switches the product view when a category tab is clicked.
- Integrates `QuickSaleScanner` for persistent multi-scan barcode support.
- The shopping cart lives in the global `NavRightComponent`; `SalePage` dispatches cart actions to shared cart state.

#### `SaleCategoryProductsComponent`
- Receives the active `ProductCategory` and its filtered `Product[]`.
- Renders one `SaleProductRow` per product.
- Filters out products with `availableToSale === false`.

#### `SaleProductRowComponent`
- Displays a single product in the sale view: name, price, and an "Add" button.
- Clicking "Add" dispatches an `addToCart(product)` action.
- If the product is already in the cart, shows the current quantity and +/- controls inline.

#### `QuickSaleScannerComponent`
- Persistent (always-on during a sale session) barcode scanner using `@zxing/browser`.
- Renders as an embedded camera view or a toggled overlay.
- On successful scan: looks up the barcode in the loaded product catalog; if found, dispatches `addToCart(product)`; if not found, shows a brief "Product not found" toast.
- Supports: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, QR Code.
- **Must be lazy-loaded** — import the `@zxing/browser` module dynamically to avoid adding it to the main bundle.

---

### 4.3 Shopping Cart (NavRightComponent)

The cart is rendered in the global top navigation bar (`NavRightComponent`) so it persists across navigation within the sales flow. See Section 7 for full behavioral detail.

---

### 4.4 Orders Sub-Feature

#### `TodayOrdersPage`
- Shows all orders with a `date` matching today's date.
- Uses `OrderOfflineService.getByDateRange(today, today)`.
- Renders an `OrderList` with today's orders.
- Links to `TodayStatsPage`.

#### `OrdersPage`
- Full sales history view.
- Date range filter (from/to) at the top.
- Renders `OrderList` with the filtered result set.
- Default range: current month.

#### `OrderListComponent`
- Reusable component. Receives an `Order[]` prop.
- Renders each order as a summary row: date, total, item count, payment type, and a credit indicator badge.
- Clicking a row opens `EditOrderModal`.
- Supports empty-state display.

#### `OrderItemListComponent`
- Reusable component. Receives an `OrderItem[]` prop.
- Renders each item: product name, category, quantity, unit price, and line total.
- Used inside `EditOrderModal`.

#### `EditOrderModalComponent`
- Modal to view or edit an existing order.
- Displays order metadata (date, payment type, type, description, credit flag).
- Renders `OrderItemList` for the order's items.
- Allows editing `description` and `paymentType`.
- Provides a "Deactivate Order" action: reverses inventory quantities for all items and marks the order as inactive.
- If the order has an associated `SaleCredit`, deactivating the order also voids it.

#### `TodayStatsPage`
- Aggregated statistics for today's orders.
- Total revenue, total items sold, breakdown by payment type.
- Renders one `CategoryStatsComponent` per category that had sales today.

#### `CategoryStatsComponent`
- Displays sales statistics for a single product category.
- Shows category name, number of items sold, and revenue contribution.

---

### 4.5 Credits Sub-Feature

#### `TodaySaleCreditsPage`
- Shows all `SaleCredit` entries with `date` matching today.
- Renders a `SaleCreditList`.

#### `SaleCreditsPage`
- Full credit history view.
- Filter by paid/unpaid status and date range.
- Renders `SaleCreditList` with filtered results.

#### `SaleCreditListComponent`
- Reusable component. Receives a `SaleCredit[]` prop.
- Renders each credit: client name, total, amount paid, remaining balance, date, and paid status badge.
- Clicking a row opens `EditSaleCreditModal`.

#### `EditSaleCreditModalComponent`
- Modal to view or edit a credit sale.
- Displays linked order summary, client name, total, and payment history.
- Allows editing `client` name and `note`.
- Provides a "Register Payment" action that opens `SaleCreditPaymentModal`.

#### `SaleCreditPaymentModalComponent`
- Modal to register a payment on a credit sale.
- Fields: `amount` (numeric, required), `paidType` (PaymentType selector).
- On submit: if `amount >= remaining balance`, marks `isPaid = true` and sets `paidDate` and `paidType`; otherwise records a partial payment.
- Calls `SaleCreditOfflineService.update()`.

---

## 5. Data Models

```typescript
interface Product extends AuditableBaseModel {
  id: string;
  name: string;
  barcode?: string;
  categoryId: string;
  categoryName: string;
  price: number;
  order: number;
  availableToSale: boolean;
  discountFromInventory: boolean;
  businessId: string;
}

interface ProductCategory {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
}

interface Order extends AuditableBaseModel {
  id: string;
  orderItems: OrderItem[];
  total: number;
  itemsCount: number;
  date: Date;
  type: OrderType;
  paymentType: PaymentType;
  isCredit: boolean;
  description: string;
}

interface OrderItem {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  name: string;
  quantity: number;
  price: number;
  productBusinessId: string;
  productCosts: InventoryEntryCost[];
  order: number;
}

interface SaleCredit extends AuditableBaseModel {
  id: string;
  orderId: string;
  client: string;
  total: number;
  date: Date;
  paid: number;
  isPaid: boolean;
  paidDate: Date;
  paidType: PaymentType;
  note: string;
}

enum OrderType {
  Normal = 1,
  Mayorista = 2,
  Merma = 3,
  Ajuste = 4,
  Otro = 100,
}

enum PaymentType {
  Efectivo = 1,
  Tarjeta = 2,
  Zelle = 3,
}
```

`AuditableBaseModel` includes: `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, and soft-delete fields as defined in the shared domain package.

---

## 6. Services

All services follow the **offline-first pattern**: reads and writes go to localStorage; a background sync queue pushes changes to the remote API when online.

### `ProductOfflineService`
- **Repository:** `ProductRepository`
- **localStorage key:** `lizoft.store-products-{storeId}`
- **Methods:** `getAll()`, `getById(id)`, `getByBarcode(barcode)`, `create(product)`, `update(product)`, `updateMany(products[])`, `delete(id)`
- Scoped to `storeId` so multi-store accounts are isolated.

### `ProductCategoryOfflineService`
- **Repository:** `ProductCategoryRepository`
- **localStorage key:** `lizoft.store-product-categories-{storeId}`
- **Methods:** `getAll()`, `getById(id)`, `save(category)`, `delete(id)`

### `OrderOfflineService`
- **localStorage key:** `lizoft.store-orders-{storeId}`
- **Methods:** `getAll()`, `getById(id)`, `getByDateRange(from, to)`, `create(order)`, `update(order)`, `deactivate(id)`
- On `create`: if `order.isCredit === true`, triggers `SaleCreditOfflineService.createFromOrder(order)` to automatically create the corresponding `SaleCredit` entry.
- On `deactivate`: iterates `order.orderItems` and reverses each item's quantity in inventory via `InventoryOfflineService`.

### `SaleCreditOfflineService`
- **localStorage key:** `lizoft.store-saleCredits-{storeId}`
- **Methods:** `getAll()`, `getById(id)`, `getByDateRange(from, to)`, `createFromOrder(order)`, `update(credit)`, `void(id)`
- `createFromOrder(order)`: constructs a `SaleCredit` with `orderId`, `client` (from order description or input), `total`, `date`, `paid = 0`, `isPaid = false`.

---

## 7. Shopping Cart Behavior

The cart is a global UI concern rendered inside `NavRightComponent` (the persistent top navigation bar). It is available on all pages within the `/sales` route tree so the cashier can review and modify the cart while browsing categories or switching views.

### State Shape
```typescript
interface CartState {
  items: CartItem[];
  paymentType: PaymentType;
  isCredit: boolean;
  clientName: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}
```

### Derived Values
- **Subtotal:** `sum(item.quantity * item.product.price)`
- **Total:** same as subtotal (no tax layer in current scope)
- **Change:** `userEnteredCash - total` (only relevant when `paymentType === PaymentType.Efectivo`)

### Cart Item Interactions
- **Add item:** if product already in cart, increment `quantity`; otherwise push new `CartItem` with `quantity = 1`.
- **Increment (+):** increase `quantity` by 1.
- **Decrement (−):** decrease `quantity` by 1; if `quantity` reaches 0, remove the item from the cart.
- **Remove:** explicitly remove an item regardless of quantity.
- **Clear cart:** remove all items (called after successful order creation).

### Cart Badge
- The nav bar shows a badge on the cart icon with the total number of distinct items (`items.length`).
- Badge is hidden when the cart is empty.

### Payment Type Selection
- Radio or segmented control with three options: **Efectivo (1)**, **Tarjeta (2)**, **Zelle (3)**.
- Defaults to **Efectivo** on every new sale.
- When **Efectivo** is selected, a "Cash received" numeric input appears; the computed change is displayed below the total.
- Payment type is stored in `CartState.paymentType` and written to `Order.paymentType` on submission.

### Credit Sale Toggle
- A toggle/checkbox labeled "Credit sale".
- When enabled:
  - `CartState.isCredit` is set to `true`.
  - A text input for "Client name" becomes required and visible.
  - `CartState.clientName` is populated from this input.
- Credit sales are submitted as normal orders with `isCredit: true`; the service layer automatically creates the associated `SaleCredit`.

### Order Submission
1. Validate: cart must have at least one item; if credit, `clientName` must be non-empty.
2. Build `Order` from `CartState`: set `orderItems`, `total`, `itemsCount`, `paymentType`, `isCredit`, `date = now()`, `type = OrderType.Normal`, `description = clientName` (if credit).
3. Call `OrderOfflineService.create(order)`.
4. On success: clear cart, reset `isCredit` and `clientName`, show success toast, optionally navigate to `TodayOrdersPage`.
5. On failure: show error toast; cart state is preserved so the cashier can retry.

---

## 8. Barcode Scanning

### Library
- `@zxing/browser` — client-side barcode/QR decoding using the device camera.
- **Must be imported dynamically** (lazy loaded) to prevent it from being bundled in the main chunk.

### Supported Formats
EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, QR Code.

### Components

#### `BarcodeScannerComponent` (modal, single scan)
- Opens as a modal overlay.
- Activates the camera, listens for a single successful decode, then closes and emits the scanned value.
- Used in non-sale contexts (e.g., product lookup, inventory entry).

#### `QuickSaleScannerComponent` (persistent, multi-scan)
- Embedded in `SalePage` as an always-on scanner.
- Continuously decodes without closing.
- On each successful decode:
  1. Looks up the barcode via `ProductOfflineService.getByBarcode(code)`.
  2. If product found: dispatches `addToCart(product)` and shows a brief visual confirmation.
  3. If not found: displays a "Product not found" toast with the raw barcode value.
- Has a cooldown of ~500ms between successful scans to prevent duplicate additions from a single physical scan.

### Permissions
- Requires browser `camera` permission. If denied, the scanner component shows a clear "Camera access required" message with instructions.
- On iOS Safari, the user must explicitly grant permission each session (no persistent permission).

---

## 9. CSV Import

### Trigger
`CsvProductImporterModal` is accessible from the `ProductsPage` toolbar.

### File Format
- Standard UTF-8 CSV, comma-delimited.
- Required columns: `name`, `price`, `categoryName`
- Optional columns: `barcode`, `availableToSale` (`true`/`false`, defaults to `true`), `discountFromInventory` (`true`/`false`, defaults to `true`)
- First row must be a header row.

### Import Flow
1. User selects or drops a `.csv` file.
2. Client-side parser reads and validates each row.
3. **Preview table** is shown: valid rows in white, rows with errors highlighted in red with an error message per row.
4. **Error summary** at the top: total rows, valid rows, error rows.
5. If any rows have errors, the user may choose to import only valid rows or cancel to fix the file.
6. On confirm:
   a. For each unique `categoryName` not already in `ProductCategoryOfflineService`, create a new `ProductCategory` with `isActive: true` and next available `order`.
   b. For each valid product row, call `ProductOfflineService.create()` with the parsed data.
7. Success toast with count of products imported; catalog view refreshes.

### Validation Rules
- `name`: required, non-empty string, max 200 characters.
- `price`: required, must be a positive number.
- `categoryName`: required, non-empty string.
- `barcode`: optional; if provided, must not duplicate an existing product barcode.

---

## 10. Offline Behavior

The Sales module is designed to operate fully offline. There is no hard dependency on network availability for any core user action.

### Storage Layer
- **Products and categories:** stored in localStorage via their respective repositories, keyed by `storeId`.
- **Orders:** stored directly in localStorage under `lizoft.store-orders-{storeId}`.
- **Sale credits:** stored directly in localStorage under `lizoft.store-saleCredits-{storeId}`.

### Data Lifecycle
- All reads (product catalog, order history, credits) come from localStorage first.
- All writes (create order, update product, register payment) go to localStorage immediately and return synchronously to the UI.
- A sync queue (defined in the shared infrastructure layer) picks up pending writes and pushes them to the remote API when the device comes online.

### Conflict Handling
- Last-write-wins for product edits (simple model; inventory corrections handled separately).
- Orders and credits created offline are assigned client-side UUIDs to avoid collisions on sync.

### PWA Considerations
- All JS bundles and static assets are pre-cached by the service worker.
- Offline state indicator in the global nav bar informs the user when the app is operating without connectivity.
- No data-entry actions are blocked when offline.

---

## 11. Permissions

Access to sub-features is controlled by the `EFeature` enum. The `AuthGuard` on each route checks whether the authenticated user's account has the corresponding feature enabled.

| EFeature | ID | Controlled By | Scope |
|----------|----|---------------|-------|
| `Products` | 20 | Route guard on `/sales/products` | Product catalog CRUD, CSV import |
| `Sale` | 21 | Route guard on `/sales/sale` and `/sales/stats` | POS screen, today's stats, barcode scanner during sale |
| `TodayOrders` | 22 | Route guard on `/sales/today-orders` | Today's order list view |
| `SalesHistory` | 100 | Route guard on `/sales/orders` | Full historical order list |
| `CreditSale` | 110 | Route guard on `/sales/today-credits` and `/sales/credits` | Credit sale creation, list, and payment registration |

**Notes:**
- A user with `Sale (21)` can create orders including credit orders; `CreditSale (110)` is required only to view and manage the credit list.
- `TodayOrders (22)` and `SalesHistory (100)` are separate flags to allow read-only staff to see today's activity without full history access.
- Feature flags are evaluated at route entry. Individual UI actions within a route (e.g., the "Edit" button) may also check feature flags to hide or disable affordances the user cannot access.
