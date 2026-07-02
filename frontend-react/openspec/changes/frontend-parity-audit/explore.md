# Exploration: frontend-parity-audit — Master Parity Inventory (Capa 0)

**Change:** frontend-parity-audit
**Phase:** Explore
**Date:** 2026-07-01
**Mode:** Hybrid (engram + openspec file)

---

## Purpose

Angular (`frontend/`) is the validated source of truth for a live offline-first PWA store-management system. React (`frontend-react/apps/web-store-pos/`) is the migration target (React Router v7 file-based routes, Turborepo monorepo with `packages/domain`). This is the Capa 0 master inventory to drive later per-module parity audits (proposal/spec/tasks phases). No code was changed; investigation only.

## Architecture pattern confirmed on both sides

- **Offline-first factory pattern**: `GlobalConfig.USE_ONLINE_SERVICE` (Angular: `frontend/src/app/_shared/configs/global.config.ts`; React: `frontend-react/apps/web-store-pos/app/shared/lib/config/global-config.ts`) selects online vs offline service implementation.
- Angular only has 2 explicit online/offline factory pairs: `frontend/src/app/_services/factories/product-service.factory.ts` and `product-category-service.factory.ts`. All other domain data (credits, orders, expenses, entries) ONLY has `*-offline.service.ts` — no online counterpart exists in Angular. This means most of the app's "online" mode is unimplemented/dead code path in Angular itself — worth confirming scope intentionally excludes online mode from parity requirements beyond products/categories.
- React's factory: `frontend-react/apps/web-store-pos/app/shared/lib/services/service-factory.ts` — `createService<T>(offline, online)` picks based on `GlobalConfig.USE_ONLINE_SERVICE`. React has built HTTP services for admin/management modules (owner, reseller, store, user, feature, usage) that are inherently "online-only" server calls (no offline equivalents needed — these are admin/SaaS-tier features, not offline POS data).

## 1. Models + Enums layer

**Angular sources**: `frontend/src/app/domain/entities/**` (owners, product-categories, sale-credits, users, features, stores, entries, orders, expenses, store-user, messages, modules, products), `frontend/src/app/domain/resellers/reseller.model.ts`, `frontend/src/app/domain/commons/*` (payment-type, type-data, result), `frontend/src/app/_shared/const/enums.ts` (EPermissions, EFeatures, EModules, ENotificationTemplateType, SignatureProvider, ERoles, EMessageStatus), `frontend/src/app/_services/_models/**`, `frontend/src/app/_services/auth/_models/**` (auth-user, auth, store-module-features, social-networks, address), `frontend/src/app/_services/usage/store-usages.model.ts`, `frontend/src/app/_services/usage-tracker/usage.model.ts`.

**React sources**: `frontend-react/packages/domain/src/models/{base,product,order,expense,sale-credit,auth,inventory,store}.ts`, `frontend-react/packages/domain/src/enums/index.ts`.

**Enum diff (ERoles/EFeatures/EModules/PaymentType/OrderType/ExpenseType) — CONFIRMED MATCH**:
- `ERoles`, `EModules` — identical in both.
- `EFeatures` — near-identical; Angular has `TodayOrdersStats = 23` and `TodayInventoryStats = 32`; React has `TodayStats = 23` (renamed) and is MISSING `TodayInventoryStats = 32` entirely (gap — flag).
- Angular has extra enums NOT ported to React domain package (status: likely N/A for this app, verify): `EPermissions`, `ENotificationTemplateType`, `SignatureProvider`, `EMessageStatus` — these look like carried-over boilerplate from a different vertical (fleet/carrier terms like "HiringService", "EscrowAccount" suggest template leftovers, not used by store-mgmt UI). Recommend confirming these are dead code before treating as gaps.
- React adds `PaymentType`, `OrderType`, `ExpenseType` as first-class enums; Angular defines `PaymentType` in `domain/commons/payment-type.ts` (verify OrderType/ExpenseType Angular source — likely inline string unions in order/expense models, not enums — needs per-module check in Sales/Expenses audit stage).

**Model gap list (Angular item | React item | status)**:

| Angular | React | Status |
|---|---|---|
| `owner.model.ts`, `owner-store-module.model.ts` | `store.ts` (Owner, OwnerStoreModule interfaces) | present |
| `product-category.model.ts` + `.errors.ts` | `product.ts` (verify category errors) | present, verify error-type parity |
| `sale-credit.model.ts` + `.errors.ts` | `sale-credit.ts` | present, verify error-type parity |
| `users/user.model.ts`, `credentials.model.ts` | `auth.ts` (UserModel, Credentials) | present |
| `features/feature.model.ts` | `store.ts` (Feature interface) | present |
| `stores/store.model.ts` | `store.ts` (Store interface) | present |
| `entries/inventory-entry.model.ts`, `inventory-entry-view.model.ts`, `.errors.ts` | `inventory.ts` | present, verify view-model parity |
| `orders/order.model.ts`, `order-item.model.ts`, `.errors.ts` | `order.ts` | present |
| `expenses/expense.model.ts` + `.errors.ts` | `expense.ts` | present |
| `store-user/store-user.model.ts` | `store.ts` (StoreUser) | present |
| `messages/message.model.ts` | none found | MISSING — confirm messaging feature is unused/dead in both apps before flagging as real gap |
| `modules/module.model.ts` | `store.ts` (Module interface) | present |
| `resellers/reseller.model.ts` | `store.ts` (ReSeller interface) | present |
| `commons/type-data.ts`, `commons/result.ts` | `base.ts` (verify Result/TypeData equivalents) | unknown, needs read |
| `_services/auth/_models/social-networks.model.ts`, `address.model.ts` | unknown | unknown — verify if used in Owner/Reseller forms |
| `_services/usage/store-usages.model.ts`, `usage-tracker/usage.model.ts` | `admin/dashboard` usage-http-service types | present (React has usage-http-service.ts under admin/dashboard) |

## 2. Services (data layer)

**Angular** (`frontend/src/app/application/**`): categories (view/offline/repository/online/service), synchronization (data-serializer, data.file.model, synchronizer.error, data-synchronizer), entries (currency, inventory-offline, inventory-product-view, inventory-item-cost-view, inventory-entries-view, inventory-category-view), orders (order-offline, category-cart-items-view, product-cart-items-view), expenses (expense-offline), credits (sale-credit-offline), products (repository, offline, online, select-view).

**Angular** (`frontend/src/app/_services/**`): connection, data, module, csv-product, product-service.factory, product-category-service.factory, app-init, features, authorization, download-manager, auth (auth-http + fake + guard + models), storage, update, user, reseller, order/shopping-cart, usage, services.index, storeuser, owner, tokens, shared/store-module-state, store, usage-tracker, base, loading, preloading, global-error-handler, icon-setup.

**React** (`frontend-react/apps/web-store-pos/app/**/lib/services/`): sales (product-category-offline, product-offline, sale-credit-offline, order-offline), inventory (egress-offline, inventory-offline), expenses (expense-offline), reports (report-aggregation), statistics (statistics-aggregation), sync (data-serializer, data-synchronizer), profile (profile-http), management/stores (store-http), admin/features (feature-http), admin/dashboard (usage-http), admin/resellers (reseller-http), admin/owners (owner-http), management/users (user-http). Plus `shared/lib/services/service-factory.ts`.

**Gap list**:

| Angular | React | Status |
|---|---|---|
| `product-category-offline/online.service.ts` | `product-category-offline-service.ts` | present (online variant unclear in React — verify) |
| `product-offline/online.service.ts` + repository | `product-offline-service.ts` | present |
| `sale-credit-offline.service.ts` | `sale-credit-offline-service.ts` | present |
| `order-offline.service.ts`, category-cart-items-view, product-cart-items-view | `order-offline-service.ts` | present, cart view-models need per-file check in Sales stage |
| `expense-offline.service.ts` | `expense-offline-service.ts` | present |
| `entries/inventory-offline.service.ts`, inventory-product-view, inventory-item-cost-view, inventory-entries-view, inventory-category-view, currency.service | `inventory-offline-service.ts`, `egress-offline-service.ts` | present, currency-service equivalent unconfirmed — check Inventory stage |
| `synchronization/data-serializer.service.ts`, `data-synchronizer.service.ts`, `data.file.model.ts`, `synchronizer.error.ts` | `sync/lib/services/data-serializer-service.ts`, `data-synchronizer-service.ts` | present, error-type parity unconfirmed |
| `_services/csv/csv-product.service.ts` + model | `sales/lib/csv-product-parser.ts` | present (renamed) |
| `_services/owner/owner.service.ts` | `admin/owners/lib/services/owner-http-service.ts` | present |
| `_services/reseller/reseller.service.ts` | `admin/resellers/lib/services/reseller-http-service.ts` | present |
| `_services/store/store.service.ts` | `management/stores/lib/services/store-http-service.ts` | present |
| `_services/storeuser/store-user.service.ts`, `user/user.service.ts` | `management/users/lib/services/user-http-service.ts` | present, verify both Angular services map to single React service or two |
| `_services/features/feature.service.ts` | `admin/features/lib/services/feature-http-service.ts` | present |
| `_services/usage/usage.service.ts`, `usage-tracker/store-usage-tracker.service.ts` | `admin/dashboard/lib/services/usage-http-service.ts` | present, verify tracker (client-side accumulation) logic ported, not just the HTTP fetch |
| `_services/order/shopping-cart.service.ts` | unknown — likely folded into sales cart state/hooks | unknown, verify in Sales stage |
| `_services/download-manager/download-manager.service.ts` (+ spec) | unknown | unknown — check Sync stage (PWA install/update prompts) |
| `_services/update/update.service.ts` | unknown | unknown — PWA service-worker update flow, check Sync/root app shell |
| `_services/connection/connection.service.ts` | unknown | unknown — online/offline detection, likely needed for offline-first badge; check shared/lib |
| `_services/auth/*` (auth-http, auth-fake-http, auth.guard, auth.service) | `auth/` routes use `authLoader` (React Router loader) | present pattern-wise; verify fake/mock auth parity not needed (dev-only) |
| `_services/module/module.service.ts` | menu-config.ts (`shared/lib/config/menu-config.ts`) | present, structurally different (static config vs service) — verify feature-gating logic parity |
| `_services/authorization/authorization.service.ts` | unknown | unknown — CRITICAL, verify permission-gating exists in React (guards feature/module visibility) |
| `_services/storage/storage.service.ts` | unknown | unknown — local-storage abstraction, verify React equivalent (likely per-service or a shared util) |
| `_services/global-error-handler.service.ts`, `icon-setup.service.ts`, `loading.service.ts`, `preloading.service.ts` | unknown | unknown — cross-cutting concerns, low priority but verify error-handling parity |

## 3. Views by module (EModules)

Angular presentation layer has **255 `.ts` files** (components) across `frontend/src/app/presentation/**` plus **133 `.html`** templates. Full breakdown by module:

- **Administration (1)**: admin-stores/grid-stores, admin-dashboard, owners/{owners,create-owner,owner-details,edit-owner,edit-owner-details}, resellers/{resellers,create-reseller,edit-reseller,edit-reseller-details}, features. React: `admin/{owners,resellers,stores,dashboard,features}/routes/*` — all 5 areas present. `admin/roles` Angular route exists but points to `OwnersComponent` (duplicate/placeholder) — NOT present in React routes.ts; likely intentional dead route, confirm before flagging as gap.
- **Sales (2)**: sale/{sale,category-stats,orders,sale-credits,today-orders,order-item-list,today-sale-credits,quick-sale-scanner,today-stats,sale-credit-list,sale-credit-payment-modal,edit-order-modal,order-list,edit-sale-credit-modal,sale-product-row,sale-category-products}, products/{products,edit-product-modal,edit-products-modal,edit-product-category-modal,csv-product-importer-modal,create-product-modal,category-product-list}. React: `sales/routes/{products,sale,today-orders,orders,today-stats,today-credits,credits}.tsx` + `sales/components/csv-product-importer-modal.tsx`. Route rename confirmed: `sales/sale`→`sales/new`. Component-level 1:1 mapping needs Sales-stage deep-dive (most granular module, highest component count).
- **Inventory (3)**: inventory/{egress,edit-inventory-entry-modal,entries,inventory-available,entry-list,inventory-today-sales-profit,today-entries,inventory-today-quantities,inventory-stats,inventory-daily-entries,inventory-product-list}. React: `inventory/routes/{available,today-entries,entries,today-quantities,today-sales-profit,egress}.tsx`. Route rename: none major, direct 1:1 paths.
- **Synchronization (4)**: synchronization/{receive-data,send-data}. React: `sync/routes/{import,export}.tsx`. Route rename confirmed: `synchronization`→`sync`, `send-data`→`export`, `receive-data`→`import`.
- **Reports (5)**: reports/inventory-today-sale. React: `reports/routes/today-report.tsx`.
- **Statistics (6)**: (component list not fully enumerated in this pass — `statistics/dashboard` implied by route `statistics/dashboard`→`DashboardComponent`). React: `statistics/routes/dashboard.tsx`, path renamed `statistics/dashboard`→`stats/dashboard`.
- **Management (7)**: stores/{stores,store-list,edit-store}, users/{users,user-list,edit-user,edit-user-details,edit-user-credentials,create-store-user}, configurations. React: `management/stores/routes/{store-list,store-create,store-edit}.tsx`, `management/users/routes/{user-list,user-create,user-edit}.tsx`, `management/configurations/routes/configurations.tsx`. Angular reuses `EditStoreComponent` for both create and edit and list-shows-form-inline (`management/stores` path → `EditStoreComponent`, not a list component) — React splits into 3 distinct routes (list/create/edit). This is a STRUCTURAL divergence, not just a rename — verify UX parity (Angular's store list view routes to the SAME view used for edit; confirm React's store-list.tsx actually renders a list, unlike Angular's root path).
- **Expenses (8)**: expenses/{expenses,expenses-today,edit-expense-modal,expense-list}. React: `expenses/routes/{today-expenses,expenses-history}.tsx`. Route rename: `expenses/expenses`→`expenses/expenses` (unchanged) maps to `expenses-history.tsx` (renamed internally).
- **Billing (9)**: NO Angular route exists for Billing module/feature despite `EFeatures.Billing=90` existing in the enum. NO React route either. Confirmed dead/unused module on both sides — not a gap, exclude from audit scope.
- **Histories (10)**: no dedicated Angular presentation folder found — history views appear folded into Sales (`sale-credit-list`, `order-list`) and Expenses (`expense-list`) and Inventory (`entry-list`) components, gated by `EFeatures.{SalesHistory,EntriesHistory,ExpensesHistory,CreditsHistory}`. React: `sales/routes/{orders,credits}.tsx`, `expenses/routes/expenses-history.tsx`, `inventory/routes/entries.tsx` — likely folded the same way. Needs per-module confirmation, not a separate top-level module in either app's routing.
- **Credits (11)**: sale/{sale-credits,today-sale-credits,sale-credit-list,sale-credit-payment-modal,edit-sale-credit-modal} (nested under Sales presentation folder, not a separate folder) — gated via `EModules.Credits`. React: `sales/routes/{credits,today-credits}.tsx`. Confirmed folded into Sales area on both sides, consistent.
- **Profile / Help** (not in EModules but present as routes): Angular `profile/{profile,edit-profile,change-password}`, `help/tutorial`. React: `profile/routes/{edit-profile,change-password}.tsx`, `help/routes/tutorial.tsx`. Note: Angular has a `ProfileComponent` at implied path but router config only shows `profile/edit` and `profile/change-password` — no bare `/profile` route registered; matches React (no bare profile route in routes.ts either). Consistent.
- **Shared chrome**: Angular `layouts/client-layout/**` (nav-bar, nav-left, nav-right, navigation, client-footer, edit-order-details-modal) + 25 `help-dialogs/*` components (one per feature area, e.g. products-help-dialog, sale-help-dialog, inventory-help-dialog, etc.) + `layouts/guest/**`. React: `shared/components/{navbar,app-layout}.tsx`, `auth/components/auth-layout.tsx`, `help/routes/tutorial.tsx` (single consolidated tutorial page per prior commit `d41a527`). **MAJOR GAP CANDIDATE**: Angular has 25+ per-feature contextual help-dialog components; React appears to have consolidated all help content into ONE tutorial page (per recent commit history: "feat(help): add tutorial page with menu entry and images"). This is an intentional UX simplification, not a missed port — but must be explicitly confirmed/documented as an accepted design deviation before the audit marks all 25 help-dialogs as "missing" (they are not gaps if the tutorial page is the deliberate replacement).

## 4. Routes diff (Angular `app-routing.module.ts` vs React `app/routes.ts`)

Confirmed renames:
- `sales/sale` → `sales/new`
- `synchronization/export` → `sync/export`, `synchronization/import` → `sync/import`
- `statistics/dashboard` → `stats/dashboard`

Structural differences:
- Angular guards via route-level `canActivate` (not inspected in this pass — verify auth.guard.ts logic maps to React's `authLoader`).
- Angular `management/users/create/:storeId` (required param) vs React `management/users/create/:storeId?` (optional) — React explicitly reconciles two Angular use-cases (from user-list vs from store-creation flow) into one optional-param route; documented as intentional in React's own route comment.
- Angular has `{ path: 'local', redirectTo: '' }` and wildcard `{ path: '**', redirectTo: '' }`; React has `route('*', 'shared/routes/$.tsx')` — verify React's catch-all renders equivalent behavior (redirect vs 404 page) rather than assuming parity.
- Angular `admin/roles` → `OwnersComponent` (dead/placeholder route, likely leftover) — no React equivalent, needs confirmation it's intentionally dropped.
- All other paths are 1:1 direct matches (products, today-orders, orders, credits, today-credits, available, today-entries, entries, today-quantities, today-sales-profit, egress, today-expenses, expenses-history→expenses/expenses, today-report, stores CRUD, users CRUD, configurations, profile/edit, profile/change-password, help/tutorial).

## 5. i18n sources — CRITICAL FINDING

**Angular real source**: `frontend/src/app/_modules/i18n/vocabs/es.ts` — NOT `assets/i18n/*.json` (no such files exist despite ngx-translate being a listed dependency and `angular.json` having no i18n asset config). Structure: nested object (`{ MENU: { ADMIN: { TITLE: '...', STORES: '...' } } }`), loaded programmatically via `TranslationService.loadTranslations()` called from `frontend/src/app/app.component.ts`, using `TranslateService.setTranslation(lang, data, true)`. Contains **397 leaf string values** (via `: '...'` pattern match). `TranslateModule.forRoot({ defaultLanguage: 'es' })` in `app.module.ts` has NO loader configured (no `TranslateHttpLoader`) — translations arrive exclusively via the programmatic `setTranslation()` call, not HTTP-fetched JSON. Angular also has unused stub vocab files for ch/en/jp/fr/de (dead — only `es` is registered via `addLangs(['es'])` and used).

**React source**: `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` — flat dot-key map (`Record<string,string>`, e.g. `'GENERAL.PRICE': 'Precio'`), **274 keys** counted. Same top-level namespace convention as Angular (`GENERAL.*`, `AUTH.*`, `MENU.*`, `TUTORIAL.*` confirmed so far) — key naming is compatible/comparable, just Angular nests where React flattens with dots.

**Method for later per-view text audit**: since both use comparable namespaced keys, a per-module stage can (1) extract all Angular nested keys from `vocabs/es.ts` flattened to dot notation, (2) diff directly against React's flat `es.ts` keys, (3) flag missing keys AND check `.html` template literal text for any hardcoded (non-translate-pipe) Spanish strings that also need porting. Angular has 397 leaf keys vs React's 274 — roughly 123 keys (31%) not yet confirmed ported; this needs the full flatten-and-diff pass per module, not estimated further here.

## Recommended module slicing for later proposal/spec/tasks phases (Capa 1+)

1. **Sales** — highest component count (16 Angular components), core POS flow, do first.
2. **Inventory** — second highest complexity (11 components), tightly coupled to Sales (shared product/category views).
3. **Expenses** — small, self-contained (4 components), good third slice to validate the audit method at smaller scale.
4. **Management** — Stores/Users/Configurations; includes the Angular structural divergence (list-vs-edit component reuse) that needs explicit UX-parity decision.
5. **Admin** — Owners/Resellers/Features/Dashboard/Stores; all HTTP-only (no offline concern), moderate complexity.
6. **Sync** — Export/Import + data-serializer/synchronizer; core offline-first mechanism, plus unresolved gaps (download-manager, update.service, connection.service).
7. **Reports** — single view, smallest slice.
8. **Statistics** — single dashboard view, needs component enumeration (not done in this pass).
9. **Profile** — small (edit-profile, change-password), low risk.
10. **Help** — special case: Angular's 25 help-dialogs vs React's single consolidated tutorial page is a DESIGN DECISION to ratify, not a mechanical port; slice last since it requires a product decision, not just a code diff.

Each module stage should: (a) flatten+diff i18n keys for that module's Angular components, (b) diff models/services already inventoried above, (c) do component-by-component `.html`/`.tsx` text and field/validation parity check.

## Risks / open unknowns requiring confirmation before deep per-module audits

- `_services/authorization/authorization.service.ts` — no confirmed React equivalent found; if permission-gating logic isn't ported, this is a security/UX-correctness risk, not just a text gap. HIGH PRIORITY to verify early.
- `_services/connection/connection.service.ts`, `download-manager.service.ts`, `update.service.ts` — PWA/offline-detection cross-cutting services with no confirmed React counterpart; core to the "offline-first PWA" requirement, must verify before declaring any module "at parity."
- Angular's `EFeatures.TodayInventoryStats=32` missing from React's enum — confirm whether this feature is dead in Angular (route commented out: `//   module: EModules.Inventory, //   feature: EFeatures.TodayInventoryStats` in navigation.ts) — if dead in Angular too, not a real gap.
- Angular `admin/roles` route and `EFeatures.Roles=12` — placeholder pointing to OwnersComponent; needs product confirmation before treating as missing in React.
- Message model (`messages/message.model.ts`) — no confirmed usage in current Angular routes/views; likely dead/legacy from a shared template; confirm before flagging.
- Angular has 397 i18n leaf keys vs React's 274 — needs full flatten-and-diff (not done here — this file establishes the METHOD only, per user's explicit instruction not to diff every string yet).
- Angular's help-dialog-per-feature pattern (25 components) vs React's single tutorial page is a confirmed intentional simplification per recent commit history, not an oversight — must be ratified as accepted scope reduction, not treated as 25 missing components.

## Ready for Proposal

Yes. This Capa 0 inventory is sufficient to scope a `sdd-propose` phase that defines the per-module audit slices (starting with Sales) and resolves the flagged open unknowns (authorization service, PWA cross-cutting services, i18n full diff) as either in-scope follow-up stages or explicitly out-of-scope with justification.
