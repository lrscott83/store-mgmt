# Proposal: Product Service Parity (Angular → React)

## Intent

React's `ProductService` port is partial and VIOLATES parity with Angular (source of truth). It is synchronous (Angular is async both sides), renames methods, drops the `BaseResponseModel`/`BaseError[]` error envelope, and omits all `ProductRepository` business rules — so `create`/`update` silently skip category-exists, barcode-uniqueness, and name-uniqueness validations and order-shifting. Several contract methods are missing. This change makes the Product surface 100% faithful to Angular. Parity migration only — no features, no optimization.

## Scope

### In Scope
- `ProductService` interface + `ProductOfflineService` (packages/domain, apps/web-store-pos).
- `ProductRepository` parity: validations, order-shifting (`updateProductsOrderByCategory`), soft-delete, activate/deactivate, `setDiscountFromInvantory`, missing repo methods.
- Missing service methods: `hasAnyAvailableToSaleProduct`, `getProductsToSelect`, `createCsvProducts` (service-owned), `getProductsToSaleByCategoryId`, `createProducts`, `setDiscountFromInvantory` (verify final set vs exploration).
- Signature parity: restore Angular names/params/return shapes (`getById→getProductById`, `create(object)→createProduct(...args)`, etc.).
- Error envelope: restore `BaseResponseModel`/`BaseError[]`; reject with same structure.
- Async conversion: Observable→Promise across the whole surface, offline AND online.
- `ProductOnlineService` + offline/online DI switch (Angular `USE_ONLINE_SERVICE` + `productServiceFactory` + `PRODUCT_SERVICE` token → React DI convention).
- Call-site updates for renamed/reshaped/async signatures.
- Tests ship with every slice (Strict TDD).

### Out of Scope
- React-only `search` / `updateMany`: flagged for REMOVAL pending user confirmation of purpose.
- Merging with the paused `offline-online-service-parity` SDD (recorded as risk, not merged).
- Fixing suspected Angular bugs (listed below, confirm before any TDD fix).

## Capabilities

### New Capabilities
- `product-service`: Product service contract, offline/online implementations, repository business rules, error envelope, DI switch.

### Modified Capabilities
- None.

## Fixed Decisions (settled — not re-opened)
Async both sides; Repository in scope; Online + DI switch in scope; Signature parity; Error envelope preserved; `search`/`updateMany` out of parity (removal pending); missing methods ported.

## Approach — Proposed Slicing (ordered)
1. Repository + validations parity (category-exists, barcode/name-uniqueness, order-shift, soft-delete, activate/deactivate).
2. Restore Angular signatures + `BaseResponseModel` error envelope on service.
3. Missing methods (hasAnyAvailableToSaleProduct, getProductsToSelect, getProductsToSaleByCategoryId, createProducts, createCsvProducts, setDiscountFromInvantory).
4. Async conversion (Observable→Promise) across surface.
5. `ProductOnlineService` + offline/online DI switch.
6. Call-site updates.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/domain/src/services/product-service.ts` | Modified | Restore signatures, async, envelope |
| `apps/web-store-pos/.../product-offline-service.ts` | Modified | Validations, order-shift, missing methods |
| `packages/domain/.../product-repository.ts` | New | Business-rule repository |
| `apps/web-store-pos/.../product-online-service.ts` | New | Online impl |
| DI factory + `PRODUCT_SERVICE` token | New | Offline/online switch |
| Call sites (products.tsx, sale.tsx, cart-shell.tsx, egress.tsx, inventory-today-sale-service.ts) | Modified | Renamed/async signatures |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Coordination overlap with paused `offline-online-service-parity` (same async/envelope decision) | High | Proceed as own change; align async approach; do not merge |
| Functional regression: validations surface previously-silent errors | High | Call out as behavior change; TDD each validation |
| Subtle order-shift logic (see suspected bug #2) | Med | Mirror Angular trace exactly with tests, not naive re-impl |
| Thin Angular test coverage (no `ProductRepository.spec`) | Med | Characterize via `product-offline.service.spec.ts` |

## Suspected Angular Bugs (confirm before ANY fix — do not fix, do not silently replicate)
1. `createCsvProducts`/`createProducts`: discards per-item errors → `Failure$([])` empty array.
2. `ProductRepository.updateProduct`: sets `order` before `updateProductsOrderByCategory`, then resets — fragile, correct only by redundancy.
3. `getProductsToSaleByCategoryId`: double-filters `availableToSale` (repo already filters) — dead/redundant.

## Rollback Plan
Work is work-unit commits on `feat/frontend-parity-audit`. Revert offending commits; no schema/data migration. Async conversion is the highest-blast-radius slice — revert its commits to restore sync surface.

## Dependencies
- Coordinate async decision with paused `offline-online-service-parity`.

## Success Criteria
- [ ] Every Angular `ProductService` method present with matching name/signature (Observable→Promise only transform).
- [ ] `create`/`update` enforce all Angular validations + order-shift.
- [ ] Failures return `BaseResponseModel` with populated `BaseError[]`.
- [ ] Offline + online implementations behind DI switch.
- [ ] All slices ship with passing tests.
