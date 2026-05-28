# PRD: Statistics Module

## Overview

The Statistics module provides store owners and authorized users with visual insights into sales performance and profit margins. It is a read-only, chart-driven module that aggregates data already stored locally — making it fully functional offline.

This module is part of the React migration from the Angular version of the "Vende De Todo" POS app. The Angular version used ApexCharts; the React version should use a comparable library (Recharts is the preferred default, but Chart.js or Victory are acceptable alternatives) loaded lazily so it is never included in the login or authentication bundle.

---

## User Stories

- As a store owner, I want to see a summary dashboard so I can quickly understand how my store performed.
- As a store owner, I want to see daily sales volume for the last 30 days so I can identify trends.
- As a store owner, I want to see daily profit margins for the last 30 days so I can understand profitability.
- As a cashier with dashboard access, I want to view sales charts without accessing management features.
- As any authorized user, I want the charts to load from local data so they work even when offline.

---

## Routes

| Path                    | Component            | EFeatures       | Guard     |
|-------------------------|----------------------|-----------------|-----------|
| `/statistics/dashboard` | DashboardComponent   | Dashboard (60)  | AuthGuard |

### Route Notes

- `AuthGuard` verifies the user is authenticated (token exists and is valid in localStorage).
- Feature 60 (Dashboard) is checked against the user's assigned features list.
- If the user lacks Feature 60, redirect to an unauthorized page or the default landing route.

---

## Components

### DashboardComponent

**Path:** `src/features/statistics/pages/DashboardComponent`

**Role:** Container/page component. Composes the statistics view. Handles data fetching from localStorage aggregation services and distributes props to child chart components.

**Responsibilities:**
- Trigger data aggregation on mount.
- Handle loading and error states.
- Render `LastMonthSalesComponent` and `LastMonthSaleProfitsComponent` side by side or stacked depending on viewport.

**Props:** None (reads from services/hooks internally).

---

### LastMonthSalesComponent

**Path:** `src/features/statistics/components/LastMonthSalesComponent`

**Role:** Presentational chart component.

**Chart type:** Bar chart or area chart — daily sales volume for the last 30 days.

**X-axis:** Calendar date (last 30 days, formatted as `MMM DD`).

**Y-axis:** Total number of transactions (order count) or total revenue in local currency.

**Data shape:**
```ts
interface DailySalesPoint {
  date: string;      // ISO date string, e.g. "2026-04-27"
  orderCount: number;
  totalRevenue: number;
}
```

**Props:**
```ts
interface LastMonthSalesProps {
  data: DailySalesPoint[];
  loading: boolean;
  error: string | null;
}
```

---

### LastMonthSaleProfitsComponent

**Path:** `src/features/statistics/components/LastMonthSaleProfitsComponent`

**Role:** Presentational chart component.

**Chart type:** Line chart or area chart — daily profit margin for the last 30 days.

**X-axis:** Calendar date (last 30 days, formatted as `MMM DD`).

**Y-axis:** Gross profit in local currency (revenue minus cost of goods sold).

**Data shape:**
```ts
interface DailyProfitPoint {
  date: string;      // ISO date string
  grossProfit: number;
  totalRevenue: number;
  totalCost: number;
}
```

**Props:**
```ts
interface LastMonthSaleProfitsProps {
  data: DailyProfitPoint[];
  loading: boolean;
  error: string | null;
}
```

---

## Chart Specifications

| Attribute          | Sales Chart                         | Profit Chart                        |
|--------------------|--------------------------------------|--------------------------------------|
| Library            | Recharts (lazy-loaded)              | Recharts (lazy-loaded)              |
| Chart type         | Bar or AreaChart                    | LineChart or AreaChart              |
| X-axis             | Date label (`MMM DD`)               | Date label (`MMM DD`)               |
| Y-axis             | Order count or revenue amount       | Gross profit amount                 |
| Tooltip            | Show date, order count, revenue     | Show date, revenue, cost, profit    |
| Responsive         | Yes — `ResponsiveContainer` wrapper | Yes — `ResponsiveContainer` wrapper |
| Legend             | Optional                            | Optional                            |
| Color              | Brand primary                       | Brand success/green                 |
| Empty state        | "No sales data for this period"     | "No profit data for this period"    |

---

## Data Aggregation

All data is read from localStorage. No API calls are made in this module.

### Source Collections

| Collection        | Key in localStorage    | Purpose                            |
|-------------------|------------------------|------------------------------------|
| Orders            | `orders` (or equivalent) | Sales volume, revenue per day     |
| InventoryEntries  | `inventoryEntries` (or equivalent) | Cost price per product per batch |

### Aggregation Logic

**Daily Sales (last 30 days):**
1. Filter `Orders` where `createdAt` is within the last 30 calendar days.
2. Group by `createdAt` date (day granularity).
3. For each day: count orders and sum `totalAmount`.

**Daily Profit (last 30 days):**
1. Filter `Orders` within the last 30 days (same as above).
2. For each order line item, look up the last known cost price from `InventoryEntries` for that product.
3. Cost of an order = sum of (unit cost × quantity) for all line items.
4. Gross profit for the day = total revenue − total cost.

**Fallback:** If cost price for a product is not found in `InventoryEntries`, treat cost as 0 for that item and flag the day's profit as approximate.

---

## Lazy Loading Requirements

The chart library (Recharts or equivalent) MUST NOT be included in the initial bundle loaded at login or during authentication.

Implementation approach:
- Use React's `React.lazy` + `Suspense` to lazy-load the `DashboardComponent` or the chart components.
- The statistics route chunk should be code-split at the route level using the router's lazy loading mechanism.
- Validate with bundle analysis that the chart library is not present in the main/auth bundle.

```tsx
// Route-level lazy loading example
const DashboardComponent = React.lazy(() =>
  import('./features/statistics/pages/DashboardComponent')
);
```

---

## Offline Behavior

| Scenario                                  | Behavior                                               |
|-------------------------------------------|--------------------------------------------------------|
| User is offline, data exists in localStorage | Charts render normally from local data             |
| User is offline, no data in localStorage  | Show empty state with message                          |
| User is online                            | Same as offline — no API calls are made in this module |
| localStorage is cleared                   | Show empty state — no retry mechanism needed           |

This module is fully offline-capable by design. There is no sync or refresh mechanism required.

---

## Permissions

| Role         | Feature Required | Can Access Dashboard |
|--------------|------------------|----------------------|
| SuperAdmin   | Dashboard (60)   | Yes                  |
| OwnerAdmin   | Dashboard (60)   | Yes                  |
| Cashier      | Dashboard (60)   | Yes, if feature assigned |
| Unauthenticated | —             | No — redirected to login |

Feature 60 must be present in the authenticated user's feature list (read from localStorage `currentUser`).
