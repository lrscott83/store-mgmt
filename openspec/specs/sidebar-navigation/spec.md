# Sidebar Navigation Specification

## Purpose

Define the React sidebar's navigation-item set, order, and feature-gating so it
matches the Angular source (`NavigationItems`) exactly, closing the last known
sidebar-parity gap.

## Requirements

### Requirement: Sales Group Item Set and Order

The sidebar SALES group MUST render exactly these items, in this order, each gated by
its listed feature:

| # | Label | Feature |
|---|-------|---------|
| 1 | Catálogo Productos | Products |
| 2 | Vender | Sale |
| 3 | Ventas del día | TodayOrders |
| 4 | Créditos del día | CreditSale |
| 5 | Cuadre del día | TodayStats |
| 6 | Créditos | CreditSale |
| 7 | Ventas | SalesHistory |

#### Scenario: Fully authorized user sees full SALES order
- GIVEN a user authorized for all 7 SALES features
- WHEN the sidebar renders
- THEN the SALES group shows exactly the 7 items above in the listed order

#### Scenario: User without CreditSale does not see credit items
- GIVEN a user NOT authorized for feature `CreditSale`
- WHEN the sidebar renders
- THEN "Créditos del día" and "Créditos" are absent
- AND the remaining SALES items keep their relative order

### Requirement: Inventory Group Item Set and Order

The sidebar INVENTORY group MUST render exactly these items, in this order, each
gated by its listed feature:

| # | Label | Feature |
|---|-------|---------|
| 1 | Disponible | Available |
| 2 | Entradas del día | Entries |
| 3 | Cantidades del día | InventoryTodayQuantities |
| 4 | Ganancias del día | InventoryTodaySaleProfit |
| 5 | Salida | Egress |
| 6 | Entradas/historial | EntriesHistory |

#### Scenario: Fully authorized user sees full INVENTORY order
- GIVEN a user authorized for all 6 INVENTORY features
- WHEN the sidebar renders
- THEN the INVENTORY group shows exactly the 6 items above in the listed order

#### Scenario: User without EntriesHistory does not see it
- GIVEN a user NOT authorized for feature `EntriesHistory`
- WHEN the sidebar renders
- THEN "Entradas/historial" is absent and the remaining 5 items are unaffected

### Requirement: Item Visibility Follows Existing Authorization Logic

Each sidebar item MUST be shown only when the authenticated user is authorized for
its `featureIds`, using the existing `isUserAuthorized` algorithm unchanged
(SuperAdmin bypass; ReSeller/OwnerAdmin featureId membership; StoreUser
roles@selectedStoreId). This requirement introduces no new gating logic.

#### Scenario: SuperAdmin sees every gated item
- GIVEN a SuperAdmin user
- WHEN the sidebar renders
- THEN all feature-gated items in SALES and INVENTORY are visible regardless of
  `featureIds`

#### Scenario: StoreUser gating is scoped to selected store
- GIVEN a StoreUser whose roles at the currently selected store lack `TodayStats`
- WHEN the sidebar renders
- THEN "Cuadre del día" is absent for that store selection

### Requirement: No Sidebar Profile Group

The sidebar MUST NOT render a `MENU.PROFILE` group or its items (`EDIT_PROFILE`,
`CHANGE_PASSWORD`). Profile access MUST remain reachable exclusively via the navbar
dropdown, unaffected by this change.

#### Scenario: Sidebar has no Profile group
- GIVEN any authenticated user
- WHEN the sidebar renders
- THEN no group labeled "Perfil"/`MENU.PROFILE` appears, and no sidebar item links to
  `/profile/edit` or `/profile/change-password`

#### Scenario: Navbar dropdown still exposes profile
- GIVEN any authenticated user
- WHEN the navbar dropdown is opened
- THEN edit-profile and change-password actions are present and functional, unchanged
  by this change

## Non-Requirements (Explicit Exclusions)

- Route-guard-layer divergence (`featureLoader` vs Angular `AuthGuard`) — future
  `route-guard-parity` change.
- Commented-out/dead Angular menu items (`inventory_stats`,
  `synchronization_download`, `management_profile`).
- ADMIN, EXPENSES, SYNCHRONIZATION, REPORTS, STATISTICS, MANAGEMENT groups and their
  21 existing items — unchanged by this spec, not covered by new requirements.
