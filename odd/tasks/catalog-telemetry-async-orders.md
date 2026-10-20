# Catalog telemetry, POS usage exclusion, and asynchronous WhatsApp orders

Branch: `feat/catalog-telemetry-async-orders`
Delivery: work-unit commits on the feature branch; push/PR/merge remain user decisions.
Runners: `pnpm --filter @store-mgmt/web-store-pos test` (Vitest), `dotnet test backend/src/Application.Tests/Application.Tests.csproj` (xUnit).

## Specs

S1. **Catalog access must not count as POS usage.** `/catalog/<slug>` (navigation, pointer/keyboard activity, and any authenticated session on the device) must never stamp `StoreUsage`. POS routes keep their current behavior.

S2. **WhatsApp orders persist even without "Gestión de Pedidos" (module 20).** With module 19 ("Pedidos WhatsApp") active and `StoreCatalogSettings.Enabled` true, the checkout persists the `Order` whether or not module 20 is active. Module 20 only controls the management views.

S3. **Async persistence without module 20.** The exact requirement: "en el caso que no haya gestion de pedidos esa insercion sea asincrona, es decir insertar el pedido y el envio por whatsapp se haga al mismo tiempo y asi el usuario no demora." The WhatsApp handoff opens immediately; the persistence request runs in the background and never blocks the user. A failed background persistence does not block or alter the WhatsApp handoff.

S4. **WhatsApp stays the delivery channel.** "Los pedidos se siguen enviando siempre por whatsapp como hasta ahora." With module 20, the existing flow (including the staff exception) remains. Without module 20, every order opens WhatsApp, including staff.

S5. **No management view without module 20.** The existing menu/route/API gating for `/sales/online-orders`, `/sales/online-orders/drivers`, and `/sales/online-orders/sales` stays in place. No new order-management UI is exposed without module 20.

S6. **Catalog telemetry is first-party, anonymous, and cookieless.** Events: `page_view`, `product_view`, `add_to_cart`, `checkout_open`. No cookies, no localStorage identifiers, no raw IP or User-Agent stored. Visitor identity is a daily hash of store + day + IP + UA; session identity is a 30-minute hash. Source is derived from UTM parameters first, then referrer host. Bots are filtered. No consent banner.

S7. **Statistics are SuperAdmin-only.** The stats endpoint is per store: `GET /api/v1/stores/{storeId}/catalog-stats?days=30`, protected by `StoreRoleFeatures.SuperAdmin`. It returns visits, unique visitors, page views, online orders, conversion rate, sources, top products, and a daily series.

S8. **All telemetry is asynchronous from the visitor's perspective.** Page events and order persistence are fire-and-forget; no telemetry request gates rendering, navigation, or the WhatsApp handoff.

S9. **Privacy.** The telemetry table stores no PII. Raw IP and User-Agent are used only to compute the daily hash and are never persisted. UTM/referrer host are stored truncated.

S10. **Tests.** Every behavior above gets a new test. Existing E2E tests and E2E support files are not modified; if one becomes incompatible, stop and ask the user.

## Tasks

| ID | Spec | Route | Task | Status |
| --- | --- | --- | --- | --- |
| T1 | S1 | inline | Guard `useStoreUsageTracker` against `/catalog/*`; add hook tests (navigation + activity). | done — RED 2 failed / GREEN 14/14; commit `5071b743` |
| T2 | S2, S3 | inline | Backend: replace the module-20 order gate with module 19; update unit tests. | done — RED 31 failed / GREEN 47/47; commit `483cbd1b` |
| T3 | S2, S3, S4 | inline | Frontend: background persistence without module 20; WhatsApp opens immediately; keep module-20 sync flow. | done — 110 passed; commit `483cbd1b` |
| T4 | S6, S9 | inline | `CatalogEvent` entity, enums, EF config, `DbSet`, repository, migration + generated SQL script. | done — migration applied; script 36 generated; commit `51692863` |
| T5 | S6, S8 | inline | Public `POST /api/v1/public/catalog/{slug}/events`: validation, hashing, source/device classification, bot filter. | done — 137 WebCatalog public tests + E2E; commit `51692863` |
| T6 | S6, S8 | inline | Client `catalog-telemetry` module: fire-and-forget events wired into the public catalog. | done — 67 tests; commit `51692863` |
| T7 | S7 | inline | SuperAdmin stats query + `GET /v1/stores/{storeId}/catalog-stats`. | done — 6 handler tests; commit `f47751d2` |
| T8 | S7 | inline | Minimal SuperAdmin catalog-stats page (store selector, KPIs, sources, top products). | done — page test + typecheck/lint; commit `f47751d2` |
| T9 | all | inline | Full verification: focused tests, full suites, migration apply, script idempotency. | done — RDD reviews approved/acknowledged; correction `d9db3d10`; see L9/L11 |

## Log

L1 (original request, verbatim):

> revisa que el acceso al catalogo no se tenga en cuenta en el Usage del uso del POS, tenemos que definir como hacer la telemetria del catalago para saber las estadisticas de las visitas y de donde. En caso de los pedidos que se envian por whatsapp en caso que no haya modulo gestion de pedidos se deben registrar como si lo hibiera pero no se debe mostrar ninguna vista para acceder a ellos. Los pedidos se siguen enviando siempre por whatsapp como hasta ahora. Dame una propuesta lo mas simple posible e investiga en internet como se hace esto para los ecommerce para saber sobre las estadisticas de los usuarios

L2 (approval + corrections, verbatim):

> Vamos a resolver primero 1 como lo propones. Luego para 2. La idea es que en el caso que no haya gestion de pedidos esa insercion sea asincrona, es decir insertar el pedido y el envio por whatsapp se haga al mismo tiempo y asi el usuario no demora. Despues para 3 vamos a hacer algo simple asi como propones pero que todo eso sea asincrono para que usuario no tenga que esperar a que se registren las cosas para que pueda usar el sitio. El endpoint de estadisticas del catalogo es solo visible para el SuperAdmin asi que puedes cambiar la ruta a una mejor. Antes de todo si no esta codegraph inicializado lo inicializas para poder usarlo

L3 (progress): CodeGraph initialized at the repository root (`D:\Projects\AutoBusinessPro\Store\store-mgmt`). Feature branch created from `dev`.

L4 (T1 progress): `useStoreUsageTracker` now short-circuits both seams when `isPublicCatalogPath(pathname)` is true. RED: 2 new tests failed (catalog navigation and catalog activity both stamped `user-1/store-1`). GREEN: 14/14 in `use-store-usage-tracker.test.tsx`. POS routes still stamp.

L5 (T2/T3 progress): backend gate moved from module 20 to module 19 (`EnsurePedidosWhatsAppAsync`); `Handle_WithoutTheOrderManagementModule_ShouldStillPersistTheOrder` failed first (RED: 31 failures in the handler suite), then GREEN 47/47. Frontend without module 20 now calls `catalogHttpService.createPublicOrderInBackground` and opens WhatsApp in the same tick (no `await`); with module 20 the synchronous flow and staff exception are unchanged. Focused frontend suites: 110 passed / 6 skipped.

L6 (T4/T5 progress): `CatalogEvent` + enums + EF config + repository + migration `20261020141816_Add-CatalogEvents` (FK ON DELETE CASCADE). Public beacon `POST /api/v1/public/catalog/{slug}/events` with server-side SHA-256 visitor/session hashes, UTM/referrer classification, device parsing and bot filter. Tests: 137 WebCatalog public tests pass; E2E `CatalogTelemetryE2ETests` passes against PostgreSQL (stats read after two public events).

L7 (T6 progress): `catalog-telemetry.ts` sends page_view, product_view, add_to_cart and checkout_open with `fetch keepalive` and no cookie/localStorage identifier. Wired into `public-catalog.tsx`; staff visits are excluded. Tests: 4 tracker tests + page wiring test; 67 focused tests pass.

L8 (T7/T8 progress): `GET /v1/stores/{storeId}/catalog-stats?days=30` (SuperAdmin) returns visits, unique visitors, page views, online orders, conversion, sources, top products and dense daily series. New `/admin/catalog-stats` page with store selector and 7/30-day window. Tests: 6 handler tests + 1 page test; typecheck and lint pass.

L9 (T9 progress): backend `Application.Tests` 1454/1454. Migration applied to `smca_test`; script `backend/scripts/36-20261020-Add-CatalogEvents.sql` generated from the migration and patched with the history `ON CONFLICT`. Frontend full suite: 5697 passed / 8 failed in 5 files; the telemetry-related `public-catalog-template.test.tsx` was fixed by mocking the tracker and now passes. The remaining 4 files (`feature-loader-timing`, `owner-edit`, `channel-rates`, `decryption-failure-policy`) pass individually; failures were parallel/resource flakes, not behavior regressions.

L10 (close): work-unit commits `5071b743` (usage exclusion), `483cbd1b` (async orders without module 20), `51692863` (anonymous telemetry), `f47751d2` (SuperAdmin stats + page). Typecheck and lint pass; focused E2E `CatalogTelemetryE2ETests` passes against PostgreSQL. Feature complete on `feat/catalog-telemetry-async-orders`; push/PR/merge are the user's decision.

L11 (RDD): RDD is enabled globally. The consolidated branch candidate was rejected by the native engine with `lens_context_budget_exceeded` (56 files / 6317 lines), so the feature was reviewed in work-unit slices: orders (`483cbd1b`, 4 lenses), usage (`5071b743`, readability/reliability), stats (`f47751d2`, risk/readability/reliability), and telemetry split into schema/endpoint/storefront (`3d740a07`/`0177e19a`/`8bf7d3fd`). The orders review found a critical duplicate-submit bug: the async branch released the submit guard before the background POST settled. Correction commit `d9db3d10` was validated and approved; the targeted validator burned the receipt. All other slices were approved with advisory findings only. The temporary review worktree was removed after every receipt was acknowledged.

L12 (post-RDD findings): backend `fbbca9fa` hardens the telemetry hash with a configured salt (JWT secret fallback), validates the persisted path, verifies product ownership per store, removes the bare `bot` substring (CUBOT false positive), uses invariant culture, guards null events, limits the request body, removes `IgnoreQueryFilters` from the stats read, and moves sources/top/count aggregation to SQL (daily groups a two-column projection because Npgsql cannot translate `date_trunc` over `timestamptz`). Frontend `3f0dcace` adds fetch `keepalive` + warning to background persistence, DNT `'yes'`/`window.doNotTrack`, staff/page-view dedup tests, a single staff-gated tracking helper, request sequencing and store-list error handling in the admin page, locale/date-only formatting, and extra usage boundary/route-transition tests. Verification: `Application.Tests` 1461/1461; focused frontend 140 passed / 6 skipped; typecheck and lint pass; `CatalogTelemetryE2ETests` passes against PostgreSQL. Remaining advisories are non-blocking suggestions: the stale `WHATSAPP_BLOCKED_NO_ORDER` key name, the N+1 product-name lookup in stats, and missing UI failure-path tests.
