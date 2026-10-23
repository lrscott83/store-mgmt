# superadmin-web-catalog

## Objetivo

Un **SuperAdmin** puede configurar el catálogo web de **cualquier tienda** desde el área de admin,
sin cambiar su tienda seleccionada ni entrar al POS. Backend: endpoints store-scoped
(`/api/v1/stores/{storeId}/catalog/...`) que ejecutan los MISMOS comandos/queries que usa el dueño.
Frontend: acción "Configurar catálogo web" en la tarjeta de tienda de `/admin/stores` y la MISMA
vista de catálogo, reutilizada.

Alcance: **solo SuperAdmin**. El OwnerAdmin sigue usando `/sales/web-catalog` sin cambios.

- Rama: `feat/superadmin-web-catalog` (desde `qa`).
- Entrega: `ask-on-risk` (default). Push/PR = decisión del owner.
- Runner: backend `dotnet test`; frontend `pnpm vitest run` + `pnpm typecheck` + `pnpm lint`.

## Specs

S1. En `/admin/stores`, la tarjeta de una tienda **activa** ofrece la acción "Configurar catálogo
web" cuando la sesión es SuperAdmin. La acción navega a `/admin/stores/{storeId}/web-catalog`.

S2. La ruta `/admin/stores/:storeId/web-catalog` solo es accesible con sesión SuperAdmin
(`superAdminLoader`). Cualquier otro rol recibe el rechazo estándar del loader (logout → `/login`),
igual que el resto de rutas admin.

S3. El backend expone los 13 endpoints de configuración del catálogo, store-scoped, bajo
`/api/v1/stores/{storeId}/catalog/...`:
`POST sync`, `GET status`, `GET products`, `PUT products/{productId}`,
`POST|DELETE products/{productId}/images`, `PUT products/{productId}/images/order`,
`GET|PUT branding`, `GET|POST showcase`, `DELETE showcase/{id}`, `PUT showcase/order`.
Todos exigen SuperAdmin y ejecutan los MISMOS comandos/queries que los endpoints del dueño.

S4. El contexto de tienda (`IHttpContextService.StoreId`) es el `{storeId}` de la ruta **solo** en
esos endpoints opt-in y **solo** para un SuperAdmin. Para cualquier otro usuario, o en cualquier
otra ruta, sigue saliendo del claim (`User.SelectedStoreId`), sin cambio de comportamiento.

S5. Los endpoints existentes del dueño (`/api/v1/catalog/...`) no cambian de contrato, permiso ni
comportamiento. `/sales/web-catalog` sigue funcionando exactamente igual.

S6. La vista per-tienda reutiliza la MISMA UI (estado, productos, marca, showcase, ubicación y
guardado por lotes). No se duplica markup ni lógica de edición.

S7. "Sincronizar Catálogo" en la vista per-tienda publica lo que ya tiene el SERVIDOR (sin snapshot
del dispositivo): el navegador del SuperAdmin no tiene catálogo local de esa tienda.

S8. La ubicación y contacto se editan con los endpoints store-scoped existentes
(`GET/PUT /api/v1/stores/{storeId}`), que ya son SuperAdmin.

S9. La acción no aparece para tiendas inactivas. No se exige el módulo 18 para configurar: la
publicación sí lo exige, pero la configuración no.

S10. No se modifican E2E existentes ni sus support files. Se permite añadir tests nuevos (frontend
unitarios y un E2E backend nuevo si aporta).

## Decisiones

| # | Punto | Decisión | Motivo |
| --- | --- | --- | --- |
| D1 | Ruta store-scoped vs header | Ruta `/api/v1/stores/{storeId}/catalog/...` | Explícita y auditable; mismo patrón que `module-pricing`, `catalog-template` y `catalog-stats`. |
| D2 | Contexto de tienda | Override por `HttpContext.Items`, activado por filtro opt-in | No toca claims, token, ni `ClaimsTransformerService`; imposible de filtrar a otras rutas. |
| D3 | Autorización | `[HasPermission(SuperAdmin)]` + `[AdminStoreScope]` (Forbid si no es SuperAdmin) | Defensa en profundidad; el filtro no depende del bypass de `HasPermission`. |
| D4 | Reutilización de comandos | Los controladores admin envían los MISMOS comandos/queries | Cero lógica duplicada; una sola fuente de reglas de negocio. |
| D5 | Cliente HTTP | `catalogHttpService.forStore(storeId)` con paths scoped | La vista no conoce rutas; el mismo cliente sirve al dueño (sin storeId) y al admin. |
| D6 | Componente compartido | Cuerpo de `web-catalog.tsx` movido a `web-catalog-settings-view.tsx`; la ruta del dueño conserva `WebCatalogPage` y `clientLoader` | No duplicar 1300 líneas; los tests existentes siguen importando lo mismo. |
| D7 | Sync | Admin: `sync()` sin snapshot; dueño: snapshot del dispositivo | S7. |
| D8 | Gate por módulo | Sin gate en la acción | El SuperAdmin puede configurar antes de contratar; la publicación ya exige el módulo. |
| D9 | Tenant | Se asume el tenant del SuperAdmin (sistema monotentant en la práctica) | Multi-tenant usa DB por tenant; una tienda de otro tenant no es visible y responde 404. |

## Tareas

- [x] **T1** — Backend: `AdminStoreScopeAttribute` + override de `StoreId` en `HttpContextService`.
- [x] **T2** — Backend: `AdminCatalogController` (status, products, sync, product fields + imágenes).
- [x] **T3** — Backend: `AdminCatalogBrandingController` + `AdminCatalogShowcaseController`.
- [x] **T4** — Backend: tests (scope del contexto + E2E nuevo de autorización/aislamiento).
- [x] **T5** — Frontend: `catalogHttpService.forStore(storeId)` (implementado como `catalogClientForStore`).
- [x] **T6** — Frontend: extraer `WebCatalogSettingsView`; `web-catalog.tsx` queda como wrapper.
- [x] **T7** — Frontend: ruta `/admin/stores/:storeId/web-catalog` + `superAdminLoader` + registro.
- [x] **T8** — Frontend: acción en la tarjeta de tienda + navegación + i18n.
- [x] **T9** — Frontend: tests (cliente scoped, vista admin, acción de la tarjeta).
- [x] **T10** — Verificación (build, tests backend, `typecheck`, `lint`, `vitest`).

## Criterios de aceptación

1. El SuperAdmin ve la acción solo en tiendas activas y solo si es SuperAdmin (S1, S9).
2. `/admin/stores/{id}/web-catalog` carga para SuperAdmin y rechaza a OwnerAdmin/StoreUser/ReSeller (S2).
3. Los 13 endpoints admin responden y operan sobre la tienda de la ruta, no sobre la del claim (S3, S4).
4. Un usuario no SuperAdmin recibe 403 en esos endpoints (S3).
5. `/sales/web-catalog` y `/api/v1/catalog/...` no cambian (S5).
6. La vista admin permite editar estado/productos/marca/showcase/ubicación y guardar por lotes (S6, S8).
7. El botón de sincronizar en la vista admin no envía snapshot del dispositivo (S7).
8. Tests verdes; E2E existentes intactos (S10).

## Comandos de verificación

```bash
# Backend
cd backend
dotnet build src/SMCA.sln
dotnet test src/Application.Tests/Application.Tests.csproj
dotnet test src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~AdminWebCatalog"

# Frontend
cd frontend-react
pnpm typecheck
pnpm lint
pnpm --filter @store-mgmt/web-store-pos test
```

## Log

L1 (2026-10-22, verbatim):
> "- Como podemos hacer para que un SuperAdmin pueda configurar un catalogo web de una tienda?"

L2 (2026-10-22, verbatim):
> "vamos a ir con B, pero ahora analiza si con esa solucion tambien el Owner pudiera hacerlo por una via similar?"

L3 (2026-10-22, verbatim):
> "solo para SuperAdmin con la opcion 2 como habias sugerido"

L4 (2026-10-22, análisis, evidencia):
- `CatalogController`/`CatalogBrandingController`/`CatalogShowcaseController` se gatean con
  `[HasPermission(StoreRoleFeatures.WebCatalogAdmin)]`; el filtro omite la comprobación para
  SuperAdmin (`Filters/HasPermissionAttribute.cs:84`), pero los handlers resuelven la tienda desde
  `IHttpContextService.StoreId` → claim `User.SelectedStoreId` (`Services/HttpContextService.cs:48`,
  `ClaimsTransformerService.cs:41`). Sin tienda seleccionada, el SuperAdmin no tiene contexto.
- El gate del frontend lo bloquea: `ownerModuleLoader` exige `isOwnerAdmin`
  (`app/auth/routes/loaders.ts:234`) y `/sales/web-catalog` lo usa (`routes/web-catalog.tsx:34`).
- Precedente correcto en el repo: `/api/v1/stores/{storeId}/catalog-template` y `catalog-stats`,
  gateados con `[HasPermission(SuperAdmin)]` (`StoresController.cs:368-386`), con acción por tienda
  en `/admin/stores` (`store-list.tsx:420`).

L8 (2026-10-23, verificación independiente y RDD):
- Verificación independiente (`gentle-ai-verify`) sobre `697dd1d6`: **PASS**, sin bloqueantes.
  Invariantes comprobados con probes propios además de los comandos: el filtro es el único writer
  del item de contexto; `StoreId` lo lee solo con el claim SuperAdmin; los 13 endpoints dan 403 a
  un OwnerAdmin incluso con el id de otra tienda; las escrituras caen en la tienda de la ruta y un
  id ajeno responde 404 sin tocarla; con tienda seleccionada, las rutas del dueño siguen leyendo el
  claim; sync admin publica el origen del servidor; id desconocido/mal formado → 404.
- Comandos observados: build OK; `AdminWebCatalogTests` 4/4; `Application.Tests` 1478/1478;
  `typecheck` OK; Vitest de la vista + cliente scoped 59/59.
- Los probes del verificador quedaron como regresión en
  `backend/src/SMCA.WebApi.E2ETests/Catalog/AdminWebCatalogScopeProbes.cs` (5 tests, 9/9 con los 4
  originales).
- Advisories del verificador (sin corrección): el filtro cae al claim si el `storeId` de la ruta no
  parsea (inalcanzable con `{storeId:guid}`); `WebCatalogSeed.CleanupAsync` no borra
  `StoreCatalogSettings` (los probes lo limpian aparte); S8 dice "ya son SuperAdmin" y en realidad
  son `SuperAdmin, StoresAdmin` (preexistente).
- RDD del commit `697dd1d6`: **no ejecutable** — el candidato (4095 líneas, casi todo el movimiento
  mecánico de la vista) excede el presupuesto de contexto del revisor incluso con 2 lentes
  (`lens_context_budget_exceeded`, sin crear autoridad). Queda pendiente partir el commit en
  candidatos menores si se quiere un receipt nativo para esa parte.

L5 (2026-10-22, decisiones de implementación):
- Se descarta el "switch de tienda" para el SuperAdmin: arrastra el ciclo de DEK y el gate de
  unlock (`unlock-gate.ts:38-66`), con riesgo de expulsión de sesión. La vía store-scoped no muta
  la sesión.
- El Owner queda **fuera de alcance** (L3). Su vía actual (`/sales/web-catalog` + `StoreSwitcher`)
  no se toca.

L6 (2026-10-22, implementación, evidencia):
- Backend: `Filters/AdminStoreScopeAttribute.cs` (filtro opt-in: Forbid si no es SuperAdmin, publica
  el `{storeId}` de la ruta en `HttpContext.Items`); `HttpContextService.StoreId` lo honra solo con
  el claim SuperAdmin. Controladores nuevos: `AdminCatalogController`,
  `AdminCatalogBrandingController`, `AdminCatalogShowcaseController` (13 acciones, mismas
  commands/queries, rutas absolutas `~/api/v1/stores/{storeId:guid}/catalog/...`).
- `dotnet build src/SMCA.sln`: Build succeeded.
- E2E nuevo `Catalog/AdminWebCatalogTests.cs`: 4/4 verdes — status de la tienda de la RUTA (slug y
  contadores), aislamiento entre dos tiendas en `products`, 403 para OwnerAdmin en status/branding/
  showcase, 401 anónimo.
- Frontend: `catalogClientForStore(storeId)` en `catalog-http-service.ts` (factory
  `createCatalogConfigClient(basePath)`; el cliente del dueño sigue en `/v1/catalog`).
  `WebCatalogSettingsView` compartida; `web-catalog.tsx` conserva `WebCatalogPage` + `clientLoader`.
  Ruta admin `store-web-catalog.tsx` con `superAdminLoader`; acción "Configurar catálogo web" en
  `store-card-list` cableada solo para SuperAdmin desde `store-list.tsx`; i18n en `es.ts`.
- Bug atrapado por los tests: el parámetro `path` de `removeImage` sombreaba el `path` del factory
  (`k/1.jpg/products/...`); renombrado el del factory a `basePath`.
- `pnpm typecheck` y `pnpm lint` (app): sin errores. Vitest: `catalog-http-service` 15/15 +
  `store-scope` 5/5 + `web-catalog` 54/54 + `store-card-list` 30/30 + `store-list` 25/25.
- `Application.Tests`: 1478/1478.

L7 (2026-10-22, cierre de verificación):
- Instrucción del owner: la verificación E2E se limita a los tests NUEVOS de esta feature; no se
  corre la suite completa. Re-ejecutados `AdminWebCatalogTests`: 4/4 verdes con
  `[E2E Guard] Database=smca_test`.
- Nota honesta: una corrida completa lanzada antes de esa instrucción alcanzó a terminar
  (541 pruebas, 535 verdes, 6 fallos). No se investigaron: quedan fuera del alcance pedido y no
  se afirma que sean preexistentes.
- Cambios no E2E verificados: build backend OK, `Application.Tests` 1478/1478, `typecheck` y
  `lint` OK, Vitest de los archivos tocados 74/74.
