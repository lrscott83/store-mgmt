# Proposal: Offline + Online Service-Layer 100% Parity

## Intent
Close the systemic service-surface parity gap between Angular `frontend/` (sole source of truth) and React `frontend-react/apps/web-store-pos`. The exhaustive exploration (engram #669) found 51 Angular service/repo/factory files vs 33 React, ~40 missing/mismatched public methods, the ENTIRE online-service layer absent, and no formal TS interfaces to prevent future drift. Binding user decision (#670): bring ALL services — offline, online, repositories, shared interfaces — to 100% public-method parity with Angular, EXCEPT genuine Angular bugs, which are FIXED not replicated (angular-bugs-policy #511). Success = every Angular public method reachable in React with matching semantics, both impls behind compile-time-enforced interfaces, and a working `USE_ONLINE_SERVICE` kill-switch path.

## Scope

### In Scope (grouped by layer — full exploration work-list)
- **Formal interfaces** [TDD]: introduce shared TS contracts `BaseService<T>`, `ProductService`, `ProductCategoryService` in `packages/domain` that BOTH offline and online impls implement (compile-time drift guard). Fixes Angular's own `ProductCategoryService` abstract non-conformance by declaring a clean contract both impls satisfy.
- **Offline domain query/financial APIs** [TDD]: Order (`activateOrder`, `getOrdersInDay`, `filterOrdersObservable`, `getActiveOrdersPrice/Profit` Today/Yesterday/BetweenDates, `getTopProductsProfit/SaleQuantityInLastMonth`); Expense (`filterExpensesObservable`, `getExpensesTotal/Before/Yesterday`, `getActiveExpensesPrice` Today/Yesterday/BetweenDates); SaleCredit financial totals; Inventory (`amortizeSoldEntry`, `filterInventoryEntries`, `getInventoryCostTotal/Before/Yesterday`, `getInventoryEntriesView` FIFO, `updateAvailableInventories`, cross-product `updateInventoryEntry` reassignment). Add `details` free-text param to `OrderOfflineService.create`; add `ShoppingCart` add-time stock validation; harden CSV parser (Papaparse-equivalent quoted-field handling).
- **Product/Category repo+service** [TDD]: `activate`/`deactivate`, `getProductByName`, `hasAnyCategory`/`hasAnyAvailableCategory`, `getMaxOrder`, `getProductCategoriesView`, `getAvailableProductsByCategoryId`.
- **Online layer + factories** [TDD]: build `ProductOnlineService`, `ProductCategoryOnlineService` (api-client/http-service backed), plus `createProductService()`/`createProductCategoryService()` factories switching on `GlobalConfig.USE_ONLINE_SERVICE`; retire dead `service-factory.ts`.
- **Auth** [TDD]: `signInGoogle`, `getSocialToken(code)`, `forgotPassword(email)`, explicit server `logout` (GET /v1/auth/logout), registration surface.
- **Admin CRUD** [TDD]: `FeatureService.getFeatures`/`deleteFeature`/`getFeatureDetailsById`; `StoreUserService.getStoreUsers`/`getStoreUserById`/`editStoreUser`/`deleteStoreUser` (/v1/storeusers/*); restore generalized `activateUser(id,isActive)` soft-deactivate path.
- **Infra** [TDD]: `DownloadManagerService`, `StoreModuleStateService`, `LoadingInterceptor`, `ErrorInterceptor` (403/404/500/503), `CurrencyService`; `ConnectivityService` reconnect-transition (`wasOffline`/`statusChange$`) surface.

### Out of Scope (DEAD/inapplicable in Angular — React covers structurally; documented, no port)
- **`ConnectionInterceptor` as written**: calls non-existent `getStatus()`, `@Injectable` commented out — dead+buggy. React implements the CORRECT connectivity surface instead (fix, not port).
- **Angular preloading / Material-icon-registry / eager loading-service bootstrap**: React handles code-split routing + icons structurally; no equivalent needed.
- No real public-method gap is deferred — every method in the exploration work-list is IN.

### Angular bugs FIXED, not replicated
1. `ConnectionInterceptor.getStatus()` dead/buggy call → React implements correct connectivity surface.
2. `StatisticsAggregationService.getDailyProfit()` must SUBTRACT expenses (match Angular `getLastMonthSaleProfits`); React currently order-profit only — corrected toward Angular.
3. `ProductCategoryService` abstract non-conformance → formalized clean interface both impls satisfy.

## Capabilities
### New Capabilities
- `service-interfaces`: shared `BaseService<T>`/`ProductService`/`ProductCategoryService` contracts in packages/domain.
- `online-service-layer`: online impls + factories + `USE_ONLINE_SERVICE` switching.
- `offline-financial-apis`: date-range/total/profit query surface across Order/Expense/SaleCredit/Inventory.
- `admin-user-feature-crud`: StoreUser + Feature CRUD parity.
### Modified Capabilities
- `auth`: google sign-in, social token, forgot-password, server logout.
- `statistics-aggregation`: daily profit nets out expenses (behavioral fix).
- `product-category-repositories`: activate/deactivate + view/query methods.

## Approach — Online-layer architecture pattern
No DI container (init #64: plain module-scope classes). Both impls implement a shared interface from `packages/domain`. A plain factory function selects the impl:
```
export function createProductService(): ProductService {
  return GlobalConfig.USE_ONLINE_SERVICE ? new ProductOnlineService(apiClient) : productOfflineService;
}
```
Online impls delegate to the existing api-client/http-service layer; offline impls keep the BaseRepository/localStorage path. Interfaces are pure TS types over domain entities, so they live in `packages/domain` (rebuild required after export changes). This makes future offline↔online drift a COMPILE error and restores the server-backed kill-switch path (flag hardcoded `false` today — not a live regression, but the path is built).

## Phased Program (ordered chained slices — commits-only, size:exception)
This is far too large for one PR; deliver as an ordered program of independently-shippable work-unit commits:
1. **Interfaces + offline query/financial APIs** (~large): BaseService/ProductService/ProductCategoryService + Order/Expense/SaleCredit/Inventory totals & date-range APIs + statistics expense-netting fix.
2. **Product/Category repo+service** (~medium): activate/deactivate + view/query methods, conform to interfaces.
3. **Online layer + factories** (~medium-large): online impls + factory switching + retire dead service-factory.
4. **Auth** (~small-medium): google/social/forgot/server-logout/registration.
5. **Admin CRUD** (~medium): Feature + StoreUser CRUD + activate toggle.
6. **Infra** (~medium): DownloadManager/StoreModuleState/Loading+Error interceptors/Currency/connectivity reconnect.

Recommended sequence 1→2→3 (interfaces gate the online layer), then 4/5/6 (independent, parallelizable). Each slice: STRICT TDD, its own work-unit commit(s), clear start/finish/verify/rollback.

## Review Workload
Whole program vastly exceeds the 400-line budget. Chained PRs (commits-only, no push/PR) are MANDATORY. `size:exception` applies at program level; each slice stays as autonomous as the 400-line guard allows.

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Online layer built against unverified live API contract | High | Slice 3 design MUST verify each endpoint exists in api-client/backend before impl; block on missing endpoints |
| Statistics expense-netting changes dashboard numbers | Med-High | Regression-test daily-profit chart; document behavioral change; verify against Angular output |
| Touching many already-tested services breaks green suite | Med | Strict TDD per method; run full `pnpm test` + tsc per slice |
| Program size / reviewer load | High | Ordered chained work-unit commits; interfaces-first gating |
| packages/domain interface changes need rebuild | Med | `pnpm -C packages/domain build` after every export change (init #64 gotcha) |
| Factory switching regresses offline path (flag false today) | Low-Med | Default-false path covered by existing tests; online path behind flag |

## Rollback Plan
Each slice is isolated conventional commit(s) on `feat/frontend-parity-audit`. Commits-only — no push, no PR. Rollback = local `git revert`/reset per slice; interfaces slice (1) is the highest-fanout revert target, kept isolated.

## Dependencies
- Slice 3: live backend endpoints for Product/Category online ops (verify in design).
- Interfaces: `packages/domain` build step.
- All slices: STRICT TDD (`pnpm test`), tsc (`pnpm -C apps/web-store-pos exec tsc --noEmit`).

## Success Criteria
- [ ] Every Angular public service/repo method reachable in React with matching semantics (per #669 work-list).
- [ ] `ProductService`/`ProductCategoryService`/`BaseService<T>` interfaces exist; offline AND online impls implement them (tsc-enforced).
- [ ] `createProductService()`/`createProductCategoryService()` switch on `USE_ONLINE_SERVICE`; online impls call api-client.
- [ ] Statistics daily profit subtracts expenses (matches Angular).
- [ ] Auth google/social/forgot/server-logout/registration reachable; admin Feature + StoreUser CRUD complete.
- [ ] Infra services (DownloadManager/StoreModuleState/interceptors/Currency/reconnect) present.
- [ ] 3 Angular bugs fixed-not-replicated; excluded dead-code documented; full suite green + tsc clean per slice.
</content>
</invoke>
