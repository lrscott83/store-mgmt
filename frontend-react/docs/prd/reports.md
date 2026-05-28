# PRD: Reports Module

## 1. Overview

The Reports module provides a daily snapshot view that combines inventory status and sales activity for the current day. It is a read-only aggregation screen — no data entry occurs here. The view helps store owners and employees quickly assess how the day is going: what inventory moved, what sold, and what the financial summary looks like.

This module is part of the Angular-to-React migration. All data is read from localStorage repositories, keeping the module fully functional offline.

---

## 2. User Stories

- As a **StoreUser**, I want to see a combined daily report so I can understand today's sales performance and inventory changes at a glance.
- As a **StoreUser**, I want the report to update automatically as new orders are entered during the day, without needing to refresh.
- As an **OwnerAdmin**, I want to see today's total revenue, number of orders, and inventory consumed so I can make end-of-day decisions.

---

## 3. Routes

| Path | Component | Required Feature | Guard |
|------|-----------|-----------------|-------|
| `/reports/today` | `InventoryTodaySaleComponent` | `TodayReports` (50) | `AuthGuard` |

The route is protected by `AuthGuard`. The `TodayReports` (50) feature ID is checked against the user's `StoreModuleFeatures` for the active store. SuperAdmin and OwnerAdmin bypass feature checks.

---

## 4. Components

### 4.1 `InventoryTodaySaleComponent`

**Purpose:** Single-page daily dashboard combining inventory status and sales summary for the current day.

**Behavior:**
- Loads data from three sources on mount:
  1. Products — from `lizoft.store-products-{storeId}` via the products offline service.
  2. Inventory entries — from `lizoft.store-inventory-entries-{storeId}` filtered to today.
  3. Orders — from `lizoft.store-orders-{storeId}` filtered to today.
- Derives all displayed values from these three sources; no additional network or storage calls.
- Read-only: no create, edit, or delete actions are exposed.
- Displays two logical sections:
  - **Sales Summary** — metrics computed from today's orders.
  - **Inventory Status** — current stock levels and today's movement.

**Sales Summary section displays:**
- Total revenue for today (sum of order totals).
- Number of completed orders today.
- Breakdown by payment type (cash, card, Zelle).
- Top-selling products by quantity sold today.

**Inventory Status section displays:**
- Per-product current available quantity.
- Quantity consumed today (derived from today's order line items).
- Quantity received today (from today's inventory entry records).
- Net change for the day (received minus consumed).

**Empty states:**
- If there are no orders today, the sales section shows a zero-state message.
- If there are no inventory entries today, the inventory movement columns show zero.

---

## 5. Data Aggregation Logic

All aggregation is performed in-memory on the client after loading the three data sources.

### 5.1 Today's Orders

- Filter all orders where `order.date` falls within the current calendar day (midnight to midnight, local time).
- Only include orders with a completed/confirmed status (exclude cancelled or draft orders if the model supports status).
- Sum `order.total` across filtered orders → **total revenue**.
- Count filtered orders → **order count**.
- Group by `order.paymentType` → **revenue by payment type**.

### 5.2 Top-Selling Products

- Flatten all line items from today's orders.
- Group by `productId`, sum `quantity` per product.
- Join with the products list to get product names.
- Sort descending by total quantity sold.

### 5.3 Inventory Movement

- Filter inventory entries where `entry.date` falls within the current calendar day.
- Group entries by `productId`.
- For each product:
  - `received today` = sum of entry quantities with type "entry" (inbound).
  - `consumed today` = sum of quantities sold from today's orders for that product.
  - `net change` = received minus consumed.
  - `current available` = product's current `availableQuantity` field (stored on the product record, maintained by the inventory service).

---

## 6. Offline Behavior

- The module reads exclusively from localStorage — no network calls are made.
- The report is always available offline as long as product, inventory, and order data have been loaded or synced at least once.
- Data reflects the device's local state; differences between devices are resolved via the Synchronization module.

---

## 7. Permissions

| Feature | Feature ID | Who has access |
|---------|-----------|----------------|
| TodayReports | 50 | StoreUser (if granted), OwnerAdmin, SuperAdmin |

- SuperAdmin and OwnerAdmin always have access regardless of `featureIds`.
- ReSeller role does not have access to store-level reports.
- If a user lacks the required feature, the route redirects to the default unauthorized page.
