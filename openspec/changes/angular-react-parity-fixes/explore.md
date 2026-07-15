# Exploration — angular-react-parity-fixes

> Source of truth: Angular `frontend/src` + React `frontend-react` + `docs/migration/reporte-paridad-migracion-angular-react.md` (work list) + `docs/migration/playbook-migracion-servicios-angular-react.md` (12-rule verdict). NOT openspec/, NOT memory.

## Method

Re-derived every 🔴/🟡 item from the parity report against **live Angular call-sites** (targeted greps), because a commented-out call is not a live use. This corrected 8 false gaps and confirmed the real ones.

## Reclassified as Angular dead-code → NO port (rule 10/12)

| Angular artifact | Evidence |
|---|---|
| `MessageService` + `Message` model | only call commented — `sale-product-row.component.ts:96` |
| `AddressModel` | zero consumers |
| `SocialNetworksModel` | zero consumers |
| `DataService.loadProducts/loadCategories` | calls commented — `register.component.ts:87-88` |
| `ConnectionService.wasOffline/statusChange$` + `ConnectionInterceptor` | interceptor reg commented `app.module.ts:101-102`; consumers commented `login.component.ts:55/153` |
| auth `registration/forgotPassword/signInGoogle/getSocialToken` + `createUser`/server-`logout` | no live call-site; `register.component.ts:60` uses already-ported `registerOwner` |
| i18n `setLanguage()` | only `loadTranslations()` live (`app.component.ts:45`); single locale `es` |
| `StoreModuleStateService.modulesUpdated` | emit live (`edit-store.component.ts:223`) but sole subscriber commented (`nav-content.component.ts:126`) → net-zero effect |

`ExpenseTypeUtils` also NOT a gap — already covered by React `expense-form-modal.tsx` (`EXPENSE_TYPE_KEYS` + i18n).

## Confirmed REAL gaps (live Angular call-site, React missing/degraded)

1. **owner-details / `getOwnerDetailsById`** — live `owner-details.component.ts:29`; React `owner-http-service.ts` lacks it, no owner-details route.
2. **reseller `deleteReSeller`** — live `resellers.component.ts:47` + `.html:51`; React `reseller-http-service.ts` + `reseller-list.tsx` lack delete.
3. **api-client 401/500/network** — Angular `error-interceptor.service.ts` (active): 500→dialog, network tagging, 401→logout. React `api-client.ts` 401 handler does inline cleanup that **contradicts React's own Decision 1** (`auth-store.ts:184-195`). Highest-value: internal contract violation.
4. **CSV parsing** — Angular `csv-product.service.ts` (papaparse, quoted commas, `category` required). React `csv-product-parser.ts` degrades to manual `split(',')`, `category` optional.
5. **BaseService reactive-list-state** — `items$`/`isLoading$`/`fetch()`/`patchState()`; rule-4 stream. Resolved at proposal as no-op (see proposal).

## Fixes-to-audit (rule 8, default KEEP, no change)

cart `addItem` inline inventory-validation moved to call-sites; FIFO decrement fix; cross-product copy-paste fix; `getTopProducts` `top` param; `getOrdersInDay`/`getExpensesInDay` honoring `date`; category-repo `isActive` param removal; URL double-slash normalization.

## Rule-12 removal candidates → decided at proposal
`getCategoryRepository`, `hasAvailableStock`, `getAvailableQuantity`, `update`, `getByDateRange`, `deactivateStore`, `ReSeller.login?`.
