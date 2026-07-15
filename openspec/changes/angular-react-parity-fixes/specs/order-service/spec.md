# Delta for Order Service

## ADDED Requirements

### Requirement: getByDateRange Is Removed As Rule-12 Invention

`OrderOfflineService.getByDateRange(from, to)` MUST NOT exist on the service, because it has no
Angular correlate (source comment in React already documents "no Angular correlate, flagged
mismatch") and, in React, only its own test file references it — no production call-site exists.
Financial aggregation call-sites already use the Angular-faithful private `activeOrdersBetween`
helper with raw (pre-snapped) date boundaries, per ADR-5; `getByDateRange`'s day-snapping is not
used by any production caller.

**Rules**: 10 (call-site parity — zero live consumers), 12 (no invention — no Angular
`getByDateRange` or equivalent day-snapped range method on `order-offline.service.ts`).

#### Scenario: No production call-site references getByDateRange
- GIVEN `OrderOfflineService`
- WHEN grepping `apps/web-store-pos` (excluding `__tests__`) for `getByDateRange(`
- THEN zero matches are found outside test files

#### Scenario: ADR-5 financial helpers are unaffected
- GIVEN `getByDateRange` is removed
- WHEN the private `activeOrdersBetween` helper and its production callers are inspected
- THEN their raw-date-boundary behavior is unchanged (they never called `getByDateRange`)

#### Scenario: Method and its tests are removed together
- GIVEN `getByDateRange` is removed from `OrderOfflineService`
- WHEN the removal lands
- THEN its dedicated test cases are removed from `order-offline-service.test.ts`
- AND the full test suite and typecheck still pass
