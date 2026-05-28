# Inventory Module — Product Requirements Document

**App:** Vende De Todo (POS PWA for small businesses)
**Platform:** Progressive Web App — offline-first, React migration from Angular
**Module:** Inventory
**Status:** Active

---

## 1. Overview

The Inventory module manages the full lifecycle of product stock within the store. It covers inbound stock entries, real-time availability, daily quantity summaries, sales profit analysis, and outbound egress movements (waste, returns, adjustments). All operations must work offline using localStorage as the persistence layer, syncing when connectivity is restored.

The module is accessed exclusively by authenticated users and integrates tightly with the Sales/Orders module: placing an order reduces available inventory, and deactivating an order restores it.

---

## 2. User Stories

### Stock Entries

- **US-01** — As a store owner, I want to record new stock entries with product, quantity, and cost price so that I can track what I purchased and at what cost.
- **US-02** — As a store owner, I want to edit an existing stock entry so that I can correct mistakes in quantity or price without deleting historical records.
- **US-03** — As a store owner, I want to see all entries recorded today so that I can verify what was stocked during the current business day.
- **US-04** — As a store owner, I want to browse the full history of stock entries so that I can audit past purchases and cost trends.

### Available Inventory

- **US-05** — As a store owner, I want to see the current available stock for each product so that I know what is ready for sale.
- **US-06** — As a store owner, I want the available stock to decrease automatically when a sale is completed so that availability is always accurate without manual intervention.
- **US-07** — As a store owner, I want the available stock to be restored automatically when an order is deactivated so that corrections propagate instantly.

### Quantities Summary

- **US-08** — As a store owner, I want to see today's quantity movements per product in a single view so that I can get a quick summary of the day's stock activity.

### Sales Profit

- **US-09** — As a store owner, I want to compare today's sales revenue against the inventory cost of sold items so that I can see my gross profit for the day.
- **US-10** — As a store owner, I want to see profit broken down per product so that I can identify which products are most and least profitable.

### Egress

- **US-11** — As a store owner, I want to record outbound stock movements that are not sales (waste, returns, transfers, adjustments) so that my available inventory stays accurate.
- **US-12** — As a store owner, I want to classify egress by type so that I can distinguish between waste, transfers, and other adjustments in reports.

### Offline

- **US-13** — As a store owner in a low-connectivity environment, I want all inventory operations to work offline so that the business is never blocked by network issues.
- **US-14** — As a store owner, I want data recorded offline to sync automatically when connectivity is restored so that I do not lose any records.

---

## 3. Routes

All routes require `AuthGuard`. Unauthenticated users are redirected to the login screen.

| Path | Component | Feature Flag | Description |
|------|-----------|--------------|-------------|
| `/inventory/available` | `InventoryAvailableComponent` | Available (30) | Current available stock per product |
| `/inventory/today-entries` | `TodayEntriesComponent` | Entries (31) | Stock entries recorded today |
| `/inventory/today-quantities` | `InventoryTodayQuantitiesComponent` | InventoryTodayQuantities (34) | Quantity summary per product for today |
| `/inventory/today-sales-profit` | `InventoryTodaySalesProfitComponent` | InventoryTodaySaleProfit (35) | Sales revenue vs inventory cost comparison |
| `/inventory/egress` | `EgressComponent` | Egress (33) | Non-sale outbound stock movements |
| `/inventory/entries` | `EntriesComponent` | EntriesHistory (101) | Full paginated history of stock entries |

**Route guard behavior:**
- `AuthGuard` checks for a valid session token before rendering any inventory route.
- Feature flags control visibility of menu items and route accessibility. If a feature is disabled for the store, navigating to its route redirects to a fallback screen.

---

## 4. Components

### 4.1 InventoryAvailableComponent

**Route:** `/inventory/available`

Displays the current available stock for all active products. Each row shows the product name, category, and current available quantity. The list is derived from the cumulative sum of entries minus sold quantities and egress movements.

**Responsibilities:**
- Load and display available inventory from the offline service.
- Support search/filter by product name or category.
- Reflect real-time updates when orders are placed or deactivated (event-driven or reactive store).

---

### 4.2 InventoryProductListComponent

**Context:** Used within inventory views to display a filterable, scrollable list of products with their inventory-related data (quantity, cost, category).

**Responsibilities:**
- Render a list of `InventoryEntryView` items.
- Emit selection events for parent components to handle actions (edit, view detail).
- Accepts filter input from parent to narrow displayed items.

---

### 4.3 TodayEntriesComponent

**Route:** `/inventory/today-entries`

Displays all stock entries recorded on the current calendar day. Groups entries by product or category when there are multiple entries for the same product.

**Responsibilities:**
- Filter `InventoryEntry` records by today's date.
- Provide an action to open `EditInventoryEntryModalComponent` to add a new entry.
- Allow editing or deactivating existing entries for the current day.

---

### 4.4 InventoryDailyEntriesComponent

**Context:** Presentational sub-component used by `TodayEntriesComponent` and potentially `EntriesComponent` to render a grouped daily view.

**Responsibilities:**
- Accept a list of entries for a single day and render them grouped.
- Display totals (total quantity entered, total cost) for the day group.
- Emit events for edit/delete actions on individual entries.

---

### 4.5 EntriesComponent

**Route:** `/inventory/entries`

Full paginated history of all stock entries across all dates. Supports filtering by date range, product, and category.

**Responsibilities:**
- Load all entries from the offline service.
- Support pagination or virtual scroll for large datasets.
- Provide date-range and product filters.
- Allow opening `EditInventoryEntryModalComponent` to add new historical entries (with appropriate permissions).
- Delegate row rendering to `EntryListComponent`.

---

### 4.6 EntryListComponent

**Context:** Reusable presentational component for rendering a flat list of inventory entries.

**Responsibilities:**
- Accept an array of `InventoryEntryView` and render each row.
- Display: product name, quantity, cost price, date, and active status.
- Emit action events: edit, toggle active.

---

### 4.7 EditInventoryEntryModalComponent

**Context:** Modal dialog triggered from `TodayEntriesComponent` or `EntriesComponent`.

**Responsibilities:**
- Render a form for creating or editing an `InventoryEntry`.
- Fields: product (searchable select), category (auto-filled from product), quantity, cost price, date.
- Validate required fields and numeric constraints (quantity > 0, cost price >= 0).
- On save, persist via `InventoryEntryOfflineService` and emit a refresh event to the parent.
- On cancel, close without side effects.

---

### 4.8 InventoryTodayQuantitiesComponent

**Route:** `/inventory/today-quantities`

Provides a consolidated quantity summary for the current day. Shows per-product totals of entries, sales deductions, egress movements, and net available change.

**Responsibilities:**
- Aggregate today's entries, sales, and egress by product.
- Display the net quantity movement for each product.
- Help the owner verify that what was stocked matches what was sold or moved.

---

### 4.9 InventoryTodaySalesProfitComponent

**Route:** `/inventory/today-sales-profit`

Compares today's sales revenue against the cost price of sold inventory. Calculates gross profit per product and overall.

**Responsibilities:**
- Load today's completed orders from the sales service.
- For each sold product, retrieve the cost price from the relevant inventory entry (FIFO or latest-entry strategy, to be confirmed).
- Display: product name, units sold, sale revenue, inventory cost, gross profit, margin %.
- Show a summary row with totals.
- Only include products where `discountFromInventory` is `true`.

---

### 4.10 EgressComponent

**Route:** `/inventory/egress`

Manages non-sale outbound stock movements. Examples: product waste, supplier returns, store transfers, inventory adjustments.

**Responsibilities:**
- Display a list of egress records for today (default view) with option to view history.
- Allow creating a new egress entry: product, quantity, egress type (waste/return/transfer/adjustment), notes, date.
- On save, reduce available inventory via the offline service.
- Support editing or deactivating an egress record.

---

## 5. Data Models

### InventoryEntry

Extends `AuditableBaseModel` (includes `createdAt`, `updatedAt`, `isActive`, `storeId`).

```typescript
interface InventoryEntry extends AuditableBaseModel {
  id: string;           // UUID — unique entry identifier
  productId: string;    // Reference to the product
  categoryId: string;   // Denormalized category for query efficiency
  quantity: number;     // Units added to inventory in this entry
  available: number;    // Running available units at the time of entry
  costPrice: number;    // Unit cost price at entry time (used for profit calculations)
  date: Date;           // Business date of the entry (may differ from createdAt)
  order: number;        // Sort order within a day for display purposes
}
```

**Constraints:**
- `quantity` must be a positive integer.
- `costPrice` must be >= 0.
- `date` is the business date (owner-controlled), not necessarily the system timestamp.
- `available` is computed and stored for read performance; it must be recalculated when prior entries are modified.

---

### InventoryEntryView

Flattened read model for display purposes. Joins entry data with product name.

```typescript
interface InventoryEntryView {
  id: string;
  productId: string;
  productName: string;   // Denormalized from product catalog
  quantity: number;
  costPrice: number;
  date: Date;
  isActive: boolean;
}
```

**Usage:** Used by `EntryListComponent` and `InventoryProductListComponent` to avoid repeated product lookups during rendering.

---

### EgressEntry (inferred)

```typescript
interface EgressEntry extends AuditableBaseModel {
  id: string;
  productId: string;
  categoryId: string;
  quantity: number;
  egressType: 'waste' | 'return' | 'transfer' | 'adjustment';
  notes?: string;
  date: Date;
}
```

---

## 6. Services

### InventoryEntryOfflineService

The primary service for all inventory entry operations. All reads and writes go through this service, which abstracts the offline storage layer.

**Storage:**
- Backend: `localStorage`
- Key format: `lizoft.store-inventory-entries-{storeId}`
- Serialization: `Map<string, InventoryEntry>` serialized as an array of `[key, value]` entries (or flat array of `InventoryEntry` objects — confirm during implementation).

**Core methods:**

| Method | Description |
|--------|-------------|
| `getAll(storeId)` | Returns all entries for the store |
| `getByDate(storeId, date)` | Returns entries for a specific business date |
| `getAvailable(storeId)` | Returns the latest available quantity per product |
| `save(entry)` | Inserts or updates a single entry; recomputes `available` if needed |
| `deactivate(id)` | Soft-deletes an entry; restores affected available quantities |
| `getById(id)` | Returns a single entry by ID |

**Repository:**
- `InventoryEntryOfflineService` depends on `InventoryEntryRepository`, which wraps the raw localStorage read/write operations.
- The repository is responsible for serialization/deserialization and should not contain business logic.

**Sync behavior:**
- When online, the service queues write operations and syncs to the backend API.
- Conflict resolution strategy: last-write-wins per entry ID (to be confirmed with team).

---

## 7. Inventory-Sales Relationship

This is a critical integration point. The inventory module is not isolated — it is directly coupled to the orders/sales flow.

### Order Placement

When a new order is created:
1. For each line item where the product has `discountFromInventory: true`, reduce the product's `available` quantity by the ordered quantity.
2. This reduction happens optimistically on the client (offline-first) and is confirmed on sync.

### Order Deactivation

When an order is deactivated (cancelled or voided):
1. For each line item where `discountFromInventory: true`, restore the product's `available` quantity.
2. The restoration must be atomic per order — all line items are restored together or not at all.

### `discountFromInventory` Flag

- Products can be configured to not deduct from inventory (e.g., services, custom items).
- When `discountFromInventory: false`, placing or cancelling an order has no effect on inventory quantities.
- The `InventoryTodaySalesProfitComponent` must exclude such products from profit calculations.

### Profit Calculation

- Sale revenue comes from the order's line item price × quantity.
- Inventory cost is sourced from the `costPrice` field of the matching `InventoryEntry`.
- Cost matching strategy: use the cost price from the most recent entry for the product at the time of sale (to be confirmed — FIFO is an alternative).
- Gross profit = sale revenue − inventory cost.

---

## 8. Offline Behavior

The inventory module is designed to be fully functional without network connectivity.

### Data Persistence

- All inventory entries are stored in `localStorage` under `lizoft.store-inventory-entries-{storeId}`.
- Reads are always served from localStorage; the network is only used for sync.
- Writes are applied to localStorage immediately and queued for backend sync.

### Sync Strategy

- On regaining connectivity, the client pushes queued mutations to the backend API.
- The server applies mutations in chronological order (by `createdAt`).
- Conflict resolution: last-write-wins per record ID (confirm with team before implementation).

### Constraints

- The localStorage storage limit (~5 MB per origin) must be monitored. For stores with high entry volume, consider a pagination or archival strategy for old entries.
- All service methods must handle `localStorage` read/write errors gracefully (e.g., storage quota exceeded) and surface them to the user via a toast or error state.

### PWA Considerations

- The service worker must cache all JS bundles and static assets required by the inventory module.
- API responses (product catalog, category list) should be cached for offline product-picker use in `EditInventoryEntryModalComponent`.

---

## 9. Permissions

Access to inventory routes is controlled by two mechanisms: authentication and feature flags.

### Authentication

All inventory routes are protected by `AuthGuard`. A valid session is required to access any route in this module.

### Feature Flags

Each sub-route is gated by a feature flag ID. Feature flags are resolved per store at login and cached for the session.

| Feature | Flag ID | Description |
|---------|---------|-------------|
| Available | 30 | View current available stock |
| Entries (today) | 31 | View and manage today's stock entries |
| Egress | 33 | View and manage stock egress |
| InventoryTodayQuantities | 34 | View today's quantity summary |
| InventoryTodaySaleProfit | 35 | View today's sales profit breakdown |
| EntriesHistory | 101 | View full historical entry log |

**Behavior when a feature is disabled:**
- The corresponding menu item is hidden.
- Direct navigation to the route redirects to a generic "feature not available" screen or the dashboard.

### Write Permissions

- Creating and editing inventory entries requires a role with `inventory:write` permission.
- Deactivating an entry requires `inventory:delete` (or equivalent role).
- Egress creation requires `inventory:egress:write`.
- Read-only roles can access all list and summary views but cannot open modals or forms.

*(Exact role names to be confirmed against the auth module implementation.)*
