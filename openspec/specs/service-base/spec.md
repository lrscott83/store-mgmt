# Service Base — Offline Service Contract Specification

## Purpose

Define the verifiable contract that React's offline storage services (Expense, Order, SaleCredit, Inventory) MUST satisfy regarding their shared interface conformance, public surface exposure, and call-site re-pointing. This spec reflects the elimination of React's `BaseService<T>` interface — a React-invented generic with no faithful Angular correlate (rule 12).

## Background

React's `BaseService<T>` was a homogenizing abstraction over offline service storage accessors (`getAll()/getById()/delete()`). This interface has NO Angular correlate: Angular's `BaseService` (HTTP + reactive state) is dead-inherited by the 4 offline services with ZERO overrides, and each offline service's own storage accessor (`getStorageExpenses()`, `getStorageOrders()`, `getStorageSaleCredits()`, `getActiveInventoryEntriesStorage()`) is per-service with NO shared base. Under rule 12 (migration invents nothing new), the shared abstraction is ELIMINATED. Each offline service now exposes ONLY its Angular-faithful surface, with no conformance seams.

## Requirements

### Requirement: No Shared Offline Service Base (Rule 12)

The domain package MUST NOT define or export a shared `BaseService<T>` interface (or any equivalent conformance abstraction) over offline storage accessors, because no Angular offline service shares a base for its `getStorageX()` method — each Angular offline service extends Angular's HTTP `BaseService` but never invokes any of its members (zero HTTP-method overrides across all 4).

#### Scenario: BaseService interface is absent
- GIVEN `packages/domain/src/services`
- WHEN searching for a `BaseService<T>` interface, its file, or its test file
- THEN none exists in source (both `base-service.ts` and `base-service.test.ts` are deleted)

#### Scenario: Offline services do not implement a shared interface
- GIVEN the 4 offline services (expense, sale-credit, order, inventory)
- WHEN inspecting their class declarations
- THEN none declares `implements BaseService<T>` or any equivalent shared conformance interface

### Requirement: Offline Service Exposes Only Its Angular-Faithful Surface

Each offline service MUST expose storage access only through its own Angular-faithful method name (`getStorageExpenses`, `getStorageOrders`, `getStorageSaleCredits`, and inventory's Angular-faithful view-producing method), matching the single method each Angular offline service defines for this purpose — no generic `getAll()` alias.

#### Scenario: Expense/order/sale-credit services expose their own accessor only
- GIVEN `ExpenseOfflineService`, `OrderOfflineService`, `SaleCreditOfflineService`
- WHEN listing their public storage-read methods
- THEN each exposes exactly one such method, named after its Angular correlate, with no `getAll()` alias

#### Scenario: Inventory service exposes its Angular-faithful view method
- GIVEN `InventoryOfflineService`
- WHEN listing its public storage-read methods
- THEN it exposes the Angular-faithful view-producing method (name identified from Angular source) returning `InventoryEntryView[]`, with no `getAll()` alias and no leftover `getStorageInventoriesMap()`-shaped substitute

### Requirement: Dead Conformance Members Are Removed

`getById()` and `delete()` MUST be removed from all 4 offline services: neither has a production call-site (only test/conformance references), and neither derives from an Angular-faithful method.

#### Scenario: getById/delete removed with no production impact
- GIVEN the 4 offline services after removing `getById()`/`delete()`
- WHEN running the full production build and test suite
- THEN no production module references `getById()` or `delete()` on these services; only their conformance tests are updated

### Requirement: Non-Sync Call-Sites Re-Point To The Faithful Method

Production callers outside the sync module — `report-aggregation-service.ts:63`, `today-entries.tsx:57`, `orders.tsx:72`, `inventory/routes/entries.tsx:97` — MUST call the service's Angular-faithful method directly instead of `getAll()`, with no change to how the returned data is consumed.

#### Scenario: Order caller re-points without behavior change
- GIVEN `orders.tsx:72` currently calling `orderService.getAll()`
- WHEN the call is re-pointed to `orderService.getStorageOrders()`
- THEN the returned data and downstream rendering are unchanged

#### Scenario: Inventory callers re-point to the faithful view method
- GIVEN `report-aggregation-service.ts:63`, `today-entries.tsx:57`, and `inventory/routes/entries.tsx:97` currently calling `inventoryService.getAll()`
- WHEN each call is re-pointed to inventory's Angular-faithful view-producing method
- THEN each caller still receives an `InventoryEntryView[]` and downstream behavior is unchanged

### Requirement: Reactive List-State Consumers Are Already Satisfied By The Loader/useState Idiom

React MUST NOT introduce a shared reactive-state base (Zustand store, class, or otherwise) to
replace Angular's `BaseService` `items$`/`fetch()`/`isLoading$`/`patchState()` stream. All live
Angular consumers of these members are dropdown-datasource populators in 5 form components
(`edit-store`, `create-owner`, `edit-owner-details`, `create-reseller`, `edit-reseller-details`)
that call `service.fetch()` then read `service.items$` solely to populate a `<select>`/autocomplete
source — never to react to push updates from elsewhere. React's existing `useEffect` →
`listOwners()`/`listResellers()` → `useState` idiom (e.g. `owner-create.tsx:49`,
`edit-store.tsx:51`) already reproduces this one-shot-fetch-into-local-state behavior.

**Rules**: 5 (React idiom substitutes Angular's reactive-stream mechanic), 10 (call-site parity —
same trigger: populate a dropdown once per mount/permission-gate), 12 (no invention — building a
shared base/store here would add an abstraction Angular's own consumers never require beyond a
one-shot fetch).

#### Scenario: Dropdown-populating consumers need no reactive base
- GIVEN the 5 Angular form components that call `.fetch()` + read `.items$` for a dropdown
- WHEN their React equivalents are inspected
- THEN each uses `useEffect` to call the corresponding `listX()` HTTP method and store the result
  in local `useState`, with no shared reactive base class or store
- AND no `BaseService`-shaped abstraction exists in `packages/domain` or `apps/web-store-pos`

#### Scenario: A live cross-component consumer would reopen this decision
- GIVEN a grep of Angular source for `.items$`, `.fetch(`, `.isLoading$`, `.patchState(` consumers
- WHEN a consumer is found that reacts to push updates from OUTSIDE its own component (not a
  one-shot dropdown populate), i.e. more than the 5 known form components
- THEN this requirement is considered violated and the no-shared-base decision MUST be revisited
  before any further reliance on this requirement

## Out of Scope

The following are explicitly NOT covered by this spec:
- The `service-factory.ts` `ServiceImpl<T>` generic — a separate React-invented abstraction, unrelated to `BaseService`, owned by a future rule-12 review.
- Inventory `getActiveInventoryEntriesStorage()` productName-enrichment divergence vs. Angular — pre-existing, separate parity pass.
