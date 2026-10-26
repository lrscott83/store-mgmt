# Site telemetry — page views públicas y manual

Rama: `test`. Entrega: captura de eventos, sin panel de lectura. Runner frontend: `pnpm test`; backend: `dotnet test`.

## Specs

- **S1** Se mide el acceso a `/`, `/login`, `/register`, `/private-police` y `/terms-conditions`. Nada más: `/help/tutorial`, `/diagnostics`, `/auth/provision`, el 404 y todo `/api/*` autenticado quedan fuera.
- **S2** `/api/manual` (manual HTML) y `/api/manual/manual-usuario-pos.pdf` son DOS entradas separadas, cada una su fila.
- **S3** Las imágenes `/api/manual/images/*` NO se cuentan. Solo se cuenta `200`; un `304` (revalidación por `Cache-Control: no-cache`) no es una entrada nueva.
- **S4** Una sola tabla nueva, `SiteEvent`, sin tienda ni tenant. Ninguna tabla existente se modifica; `CatalogEvent` no se reutiliza (sus `StoreId`/`TenantId` son NOT NULL y su query filter es por tenant).
- **S5** Privacidad igual al catálogo: sin cookies, sin IP ni User-Agent persistidos, hashes diarios calculados en el servidor, y el cliente respeta `navigator.doNotTrack`.
- **S6** El beacon es fire-and-forget: un fallo de red o de endpoint nunca rompe la página ni bloquea al visitante.
- **S7** El manual se cuenta en el servidor porque no es una ruta de React: son archivos estáticos servidos en `Program.cs:206-221`.

## Tasks

- **T1** ✅ Dominio + infraestructura + migración `20261026183144_Add-SiteEvents` + script `41-20261026-Add-SiteEvents.sql` (generado con `dotnet ef migrations script` desde la migración anterior, con guard `ON CONFLICT` y verificación). inline.
- **T2** ✅ `RecordSitePageViewsCommand` + `PublicSiteEventsController` (`POST /api/v1/public/site/events`). 30 tests de unidad verdes (`Application.Tests --filter SiteTelemetry`).
- **T3** ✅ `ManualViewTelemetryMiddleware` + `SiteEventCatalog.TryResolveManualView`.
- **T4** ✅ Frontend: `trackSitePageView`, `public-page-paths`, `useSitePageView`, montaje en `root.tsx`. RED observado (módulos inexistentes), luego 27 tests verdes en `app/shared/lib/telemetry`. `root.test.tsx` declara el mock del hook (el root ya hace el POST).
- **T5** ✅ E2E `SiteTelemetryE2ETests`: 12/12 verdes (beacon, bot, lote vacío, entradas malformadas, URL absoluta, hashes estables, manual HTML/PDF, `/api/manual` sin barra, `304`, bot en manual, `404` del manual).
- **T6** commits de work-unit en `test` (4 commits, sin push).

### Evidencia

- `dotnet build src/SMCA.WebApi` → 0 errores.
- `dotnet test Application.Tests` → 1554 passed, 0 failed.
- `dotnet test E2ETests --filter SiteTelemetry` → **12 passed**, 0 failed.
- `pnpm test` (web-store-pos, suite completa) → 432 archivos, 6031 passed, 6 skipped, 0 failed.
- `dotnet test E2ETests` (suite completa, 814 tests) → **NO verde**: el test host se cae ("Test host process crashed") tras 21, 37 y 53 tests en corridas distintas, sin ningún test fallando. Comparación contra la base (`ac53907f`) en worktree aparte para decidir si es preexistente. Ver `## Log` L9.

### Hallazgos no arreglados (información, no obstáculos)

- `ResetDataAsync` (`DbTestHelpers.cs:189-259`) falla con `23503` cuando una corrida anterior quedó a medias: un `Store` sobrevive al `DELETE` y bloquea el `DELETE` de `Owner`. Deja **795 falsos fallos** en toda la suite hasta que el reset vuelve a pasar. No se toca: es soporte E2E existente y modificarlo requiere autorización.
- `Users.ExportOfflineRosterTests.SuperAdmin_export_roster_returns_full_bundle` falla solo: espera TTL de 35 días y recibe 7, porque un test hermano (`SuperAdmin_export_configuredTtl7_applies7Days`) configura el TTL y no lo restaura. Aislamiento roto, ajeno a esta feature.
- `SiteEvent` no está en `ResetDataAsync`: cada corrida deja las filas que no limpió un test. Los tests de esta feature limpian las suyas en `finally`, así que el crecimiento es marginal; añadirlo al reset requiere autorización porque es soporte E2E existente.

### Desviación honesta

En el backend los tests se escribieron DESPUÉS del código (no se observó RED para T1-T3). En el frontend sí se observó RED antes de implementar. Queda dicho para que nadie lo lea como test-first cuando no lo fue.

## Log

- **L1** (2026-10-26) "actualiza esta rama test..." — contexto previo, no aplica a esta feature.
- **L2** "se pone alguna estadisticas de cuando se accede al landing page del POS?" — punto de partida: no había instrumentación en el landing.
- **L3** "anja dale, en este caso tambien para el login, register, y ademas todo lo de */api/*. Dime tambien si hay otros urls que no sean los catalogos y que sean online que se debe medir en la telemetria"
- **L4** "en lo del */api/* vamos a poner solo lo las url publicas del manual, OK?"
- **L5** "SOn solo landing, /login, /register, /private-police, /terms-conditions y api/manual/ por el momento."
- **L6** "se debe hacer todo en las mismas tablas o hay que adicionar mas tablas?????" — decisión: una tabla nueva, `SiteEvent`.
- **L7** "y el PDF tambien como otra entrada aparte al igual que manaul otra entrada a parte."
- **L8** "dale" — autorización de implementación.
- **L9** (2026-10-26) Suite E2E completa no verde: `Test host process crashed` tras 21/37/53 tests en corridas distintas. No es una aserción: el proceso muere. Primera corrida con 795 fallos SÍ fue el fixture (`23503` en `ResetDataAsync`), problema distinto. Se compara contra `ac53907f` en worktree para decidir causalidad antes de tocar nada.
