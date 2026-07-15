# Delta for Inventory Service

## ADDED Requirements

### Requirement: hasAvailableStock Is Removed As Rule-12 Invention

`InventoryOfflineService.hasAvailableStock(productId, quantity)` MUST NOT exist on the service,
because it has no Angular correlate (no `hasAvailableStock` method anywhere in
`_services/inventory` or `_services/order`) and, in React, only its own test file references it
— no production call-site exists.

**Rules**: 10 (call-site parity — zero live consumers means nothing to port/keep), 12 (no
invention — the method was added without an Angular source method to mirror).

#### Scenario: No production call-site references hasAvailableStock
- GIVEN `InventoryOfflineService`
- WHEN grepping `apps/web-store-pos` (excluding `__tests__`) for `hasAvailableStock(`
- THEN zero matches are found outside test files

#### Scenario: Method and its tests are removed together
- GIVEN `hasAvailableStock` is removed from `InventoryOfflineService`
- WHEN the removal lands
- THEN its dedicated test cases are removed from `inventory-offline-service.test.ts`
- AND the full test suite and typecheck still pass with no other module affected
