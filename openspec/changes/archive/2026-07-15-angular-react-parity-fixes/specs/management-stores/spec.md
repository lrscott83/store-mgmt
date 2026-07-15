# Delta for Management Stores

## ADDED Requirements

### Requirement: deactivateStore Is Removed As Rule-12 Invention

`storeHttpService.deactivateStore(id)` MUST NOT exist, because Angular's `store.service.ts` has no
deactivate/delete method for stores, and in React only its own test file references it — no UI
consumer exists (no store-list delete/deactivate action anywhere in `management/stores`).

**Rules**: 10 (call-site parity — zero live UI consumers), 12 (no invention — no Angular method
of this name or purpose to mirror).

#### Scenario: No production call-site references deactivateStore
- GIVEN `storeHttpService`
- WHEN grepping `apps/web-store-pos` (excluding `__tests__`) for `deactivateStore(`
- THEN zero matches are found outside test files

#### Scenario: Method and its tests are removed together
- GIVEN `deactivateStore` is removed from `storeHttpService`
- WHEN the removal lands
- THEN its dedicated test case is removed from `store-http-service.test.ts`
- AND the full test suite and typecheck still pass
