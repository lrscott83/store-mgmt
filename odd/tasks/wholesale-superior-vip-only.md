# WholesaleSales solo Superior/VIP — quitar de Pago (incl. limpieza + gates + E2E)

## Objective
Pasar Ventas Mayoristas (módulo 12 / feature 39) a SOLO Superior (3) y VIP (4); retirarlo del plan Pago (2):
catálogo de planes, limpieza de tiendas Pago existentes (migration EF + script VPS), cierre de las vías
administrativas que pueden reintroducir 12 en tiendas Pago, gates de frontend (menú + loader de ruta) y
adaptación/creación de tests E2E backend y frontend.

## Problem (forma simple para el usuario)
Ventas Mayoristas es una función de pago. Hoy el plan Pago (2) la incluye en el catálogo, pero la decisión de
negocio es que solo Superior (3) y VIP (4) la tengan. Las tiendas Pago existentes que ya tienen el módulo activo
deben perderlo (script VPS + migrations), una tienda Pago no debe verla ni entrar a la ruta en el frontend React,
y NINGUNA vía administrativa (creación request-driven, toggle Gratis→Pago, PUT de módulos) podrá volver a meter
el módulo 12 en una tienda Pago.

## Why
Decisión explícita del usuario (2026-09-23): retirar Ventas Mayoristas del plan Pago y dejarla solo en Superior/VIP,
limpiando las tiendas Pago existentes en BD de producción (VPS) y de desarrollo (migrations), y cerrando también
las vías administrativas (respuesta a pregunta del mismo día: "Cerrar también esas vías").

## Scope (autorizado por el usuario)
- Backend seed: quitar `(Pago, 12)` en `StorePlanModuleEntityTypeConfiguration.cs`.
- Migration EF nueva: DeleteData fila catálogo (2,12) + SQL limpieza tiendas Pago (StoreRoleFeature 39 ANTES que
  StoreModule 12 — FK) para `StorePlanId = 2`.
- Script VPS `backend/scripts/21-*.sql` idempotente con parity (patrón `20-20260920-*`).
- Cierre de vías administrativas (decisión 2026-09-23 — TODAS cerradas, aprobado):
  - POST `/api/v1/stores` request-driven: módulo 12 NO asignable a tienda que nace Pago → **rechazo 400**
    (`CreateStoreCommandValidator`, cuando `!IsOwnerAdmin`; clave `ModuleNotAvailableForPagoPlan`).
  - Toggle Gratis→Pago (`ToggleStorePlanCommand.ApplyFreeToPaid`): NO reactivar módulo 12 ni feature 39
    (excluido del set paid activado; no hay rechazo — el toggle no pide módulos).
  - PUT `/api/v1/stores/{id}` (reemplazo manual de módulos): **rechazo 400** si `ModuleIds` contiene 12 y el plan
    efectivo (`request.PlanId ?? store.StorePlanId`) no es Superior/VIP (`UpdateStoreCommand` handler).
  - Herencia OwnerAdmin en POST (derivación server-side, nadie pide 12): **FILTRAR 12** del set heredado
    (rechazar rompería la creación de sub-tiendas MultiStores desde tiendas Superior/VIP legítimas). Decisión
    de diseño: rechazo solo cuando alguien PIDE 12; filtrado cuando se hereda.
- E2E backend: actualizar `StorePlanCatalogTests.cs` (Pago sin 12 — YA AUTORIZADO) + test nuevo de aserción
  (Pago sin 12; Superior y VIP con 12) + test nuevo de limpieza de tiendas Pago.
- Frontend React (`frontend-react/`): adicionar `EModules.WholesaleSales = 12` y `EFeatures.WholesaleSales = 39`
  a `packages/domain` (con tests de enum); gatear `MENU.WHOLESALE` en `menu-config.ts` (feature 39 / módulo 12) y
  el loader de `wholesale.tsx` para que Pago NO vea ni entre; NUNCA tocar `frontend/` (Angular legacy).
- E2E frontend: adaptar specs wholesale existentes que corren con personas Pago (AUTORIZADO: mayorista-sale,
  wholesale-scanner, wholesale-cart-floor) usando identidad privada con plan Superior (patrón
  `store-multimonedas-fixture.ts`); adicionar tests nuevos (Pago no ve/no entra; Superior/VIP sí).

## Test E2E backend existentes afectados (INVENTARIO EXACTO)

### YA AUTORIZADOS Y ADAPTADOS (permiso otorgado 2026-09-23 — "Sí, adaptar los 8" + 2 previos)
1. `StorePlanCatalogTests.cs` — Pago pierde 12 en la matriz; Superior/VIP lo conservan; aserciones explícitas
   NotContain/Contain(12) por regla de negocio; comentario actualizado. ✅
2. `StoreCreatePlanTests.cs:168` — `HaveCount(11)` → `HaveCount(10)` + comentario. ✅
3. `AuthRegisterPlanTests.Register_creates_store_with_pago_plan_and_all_available_modules` (línea 73):
   `Contain(12)` → `NotContain(12)` (y comentario). ✅
4. `AuthRegisterPlanTests.Register_generates_store_role_features_for_mapped_plan_features` (línea 127):
   `Contain(39)` → `NotContain(39)` (se añade 39 al NotContain). ✅
5. `AuthRegisterPlanTests.Register_owner_me_shows_full_plan_module_set` (línea 152):
   `/me` `Contain(12)` → `NotContain([12,13,14])`. ✅
6. `StoreCreatePlanTests.Create_store_with_all_paid_modules_including_new_12_14` —
   RENOMBRADO a `Create_store_rejects_wholesale_sales_module_for_pago_birth`: pide 12 → **400** con
   código `ModuleIds` + verifica que no queda ninguna tienda persistida (cierre del POST). ✅
7. `StoreCreatePlanTests.Create_store_defaults_to_pago_but_modules_are_request_driven` —
   fullCatalogRequest sin 12 (13 módulos); `HaveCount(11)` → `10`; comentario actualizado. ✅
8. `AuthMePlanModulesTests.Me_after_free_to_paid_toggle_modules_reappear` (línea 172):
   quita 12 del Contain y añade `NotContain(12)`. ✅
9. `StorePlanChangeTests.Toggle_free_to_paid_activates_new_modules_12_13_14_with_catalog_prices` —
   RENOMBRADO a `..._excluding_wholesale_sales`: espera 13/14 sin 12; `NotContain(12)`; feature 39 ausente. ✅
10. `StorePlanChangeTests.Update_module_set_upgrade_adds_new_modules_with_features` (l.230-268) —
    PUT feliz con [7,13,14] (sin 12); features [36,37,38] + test NUEVO
    `Update_module_set_rejects_wholesale_sales_for_pago_store` (PUT con 12 en tienda Pago → **400**,
    y el set activo no muta). ✅

### ADAPTACIÓN ADICIONAL AUTORIZADA (2026-09-23 — "Sí, adaptar los 3"; no estaban en el inventario original)
11. `ToggleStorePlanTests.SuperAdmin_toggles_free_store_to_paid` — esperaba activar TODOS los paid del
    catálogo disponible (incl. 12). Adaptado a `expectedPaidIds = paidCatalogIds - 12` + `NotContain`/`BeEmpty(12)`
    con comentario. ✅
12. `ToggleStorePlanTests.SuperAdmin_round_trip_reactivates_modules_without_duplicates` — round-trip restauraba
    paid incl. 12/39. Adaptado: sets esperados sin 12 (módulos) y sin 39 (SRF), + `BeEmpty(12)` y comentarios. ✅
13. `ExportOfflineRosterPlanTests.Roster_after_free_to_paid_round_trip_restores_modules_without_duplicates` —
    esperaba `[7] + todos los paid` incl. 12. Adaptado: `expectedPaid - 12` + `NotContain(12)`. ✅

### NO AFECTADOS (verificado)
- `ExportOfflineRosterPlanTests.cs` / `ExportOfflineRosterPlanGapTests.cs` — siembran módulos directo en DB;
  no pasan por CreateStoreService ni toggle. No se rompen.
- `ChangePlanPermissionFlipTests.cs` — usa módulo 14 como módulo variable; no depende de 12 en Pago.
- `PlanCatalogVisibilityTests.cs` — solo aserta módulos 15/16/17 y visibilidad de planes. No se rompe.
- `AuthMePlanModulesTests` líneas 114/127 y 266/272 — siembran directo en DB. No se rompen.
- `StorePlanChangeTests.Update_module_set_downgrade_keeps_correct_modules_and_features` — no usa 12.
- `WarehousesRollbackTests`/`WarehousesRuntimePathsTests` — módulo 13, no 12.
- `wholesale.test.tsx` (unit frontend) — se revisará al cambiar el loader; si mockea `featureLoader` puede
  necesitar ajuste de unit test (no es E2E, no requiere permiso).

## Constraints (NO-NEGOCIABLE)
- NUNCA tocar `frontend/` (Angular legacy).
- NUNCA modificar tests E2E existentes SIN autorización explícita del usuario en cada caso concreto.
- Regla ask-first: ante CUALQUIER duda de negocio, preguntar antes de asumir.
- Invariante de auth redirect: un usuario con sesión válida NUNCA debe aterrizar en `/login`; el gate de módulo
  debe redirigir a home (resolveUserHomePath) sin logout, NO usar `denyAccess()`.
- `featureLoader` bypassa SuperAdmin/OwnerAdmin (loaders.ts:116-117) → NO sirve para gate de ruta de OwnerAdmin;
  se necesita un loader custom que chequee storeModuleIds (12) y redirija a home sin logout.
- Patrón de remoción: borrar `StoreRoleFeature` (feature 39) ANTES de `StoreModule` (módulo 12) — FK.
- Tiendas con plan Pago que tengan el módulo: en migration y script deben PERDER ese módulo (StoreModule 12
  activas e inactivas + StoreRoleFeature 39 + fila catálogo (Pago,12)).
- Semántica de cierre de vías RESUELTA (2026-09-23): **rechazo 400 fail-closed** cuando alguien PIDE módulo 12
  para tienda que es/será Pago (POST validator y PUT handler); el toggle NO reactiva 12 (excluido del set paid);
  en herencia OwnerAdmin (derivación server-side) se **FILTRA 12** del set heredado (no rechazo) — si se rechazara,
  la creación de sub-tiendas MultiStores desde tiendas Superior/VIP legítimas se rompería.
- Nueva clave i18n `ModuleNotAvailableForPagoPlan` (ES: "Ventas Mayoristas está reservada para los planes Superior
  y VIP; el plan Pago no puede incluirla").
- Divergencia pre-existente documentada: PUT permite hoy módulos fuera del catálogo Pago (p.ej. 13 Warehouses);
  NO se cambia eso — solo se cierra 12 si el usuario lo confirma.
- Todo artifact técnico en inglés por defecto; conversación en español.

## Tasks
1. Backend: quitar `(Pago,12)` del seed `StorePlanModuleEntityTypeConfiguration.cs`.
2. Backend: migration EF `DeleteData` catálogo (2,12) + SQL limpieza tiendas Pago (StoreRoleFeature 39 →
   StoreModule 12, `StorePlanId = 2`).
3. Backend: script VPS `backend/scripts/21-*.sql` idempotente con parity (patrón script 20 + migración).
4. Backend: cierre POST `/api/v1/stores` — módulo 12 no asignable cuando la tienda nace Pago (CreateStoreService
   y/o CreateStoreCommandValidator).
5. Backend: cierre toggle `ApplyFreeToPaid` — excluir módulo 12 (+ feature 39) del set activado.
6. Backend: cierre PUT `/api/v1/stores/{id}` — módulo 12 no admitido en tienda Pago (rechazo 400 por plan efectivo).
7. Backend E2E: actualizar `StorePlanCatalogTests.cs` (Pago sin 12) + test nuevo aserción Pago/Superior/VIP.
8. Backend E2E: test nuevo de limpieza de tiendas Pago (siembra módulo + feature → aplica SQL → verifica borrado).
9. Backend E2E: adaptar los tests listados en el inventario según permisos otorgados.
10. Frontend: enums `EModules.WholesaleSales=12` y `EFeatures.WholesaleSales=39` en `packages/domain` + tests.
11. Frontend: `menu-config.ts` item `MENU.WHOLESALE` → `featureIds: [EFeatures.WholesaleSales]` y
    `moduleId: EModules.WholesaleSales`.
12. Frontend: loader de `wholesale.tsx` → gate custom por módulo 12 (redirige a home sin logout; aplica a todos,
    incl. OwnerAdmin).
13. Frontend E2E: adaptar 3 specs wholesale existentes a identidad privada plan Superior (mayorista-sale,
    wholesale-scanner, wholesale-cart-floor) + support file nuevo si es necesario.
14. Frontend E2E: tests nuevos — Pago no ve item ni entra a `/sales/wholesale`; Superior sí ve y entra.
15. Checks: `dotnet test` (Application.Tests + SMCA.WebApi.E2ETests), `pnpm turbo run typecheck lint test`,
    `pnpm test:e2e` desde `frontend-react/`.
16. Work-unit commits en rama feature (branch first — estamos en default branch).

## Acceptance Criteria
- Catálogo `StorePlanModule`: Pago (2) SIN módulo 12; Superior (3) y VIP (4) CON 12.
- Tiendas existentes con `StorePlanId = 2`: sin StoreModule 12 y sin StoreRoleFeature 39 tras migration/script.
- `RegisterCommand` (nacimiento Pago) ya no asigna 12 (catálogo lo excluye).
- POST `/v1/stores` no puede crear tienda Pago con módulo 12; toggle Gratis→Pago no lo reactiva; (si se aprueba)
  PUT no lo admite en tienda Pago.
- Frontend React: tienda Pago no ve "Vender Mayorista" en el menú y no entra a `/sales/wholesale`; Superior/VIP
  sí. Ruta no manda a `/login` a usuarios válidos (redirige a home).
- E2E backend y frontend verdes (nuevos + adaptados autorizados).

## Progress
- (2026-09-23) Exploración completa; inventario de impacto verificado (grep `WholesaleSalesModuleId` + lecturas).
- (2026-09-23) Usuario decidió: CERRAR también las vías administrativas; autorizó StoreCreatePlanTests HaveCount.
- (2026-09-23) Usuario autorizó "adaptar los 8" tests del inventario + semántica de cierre (rechazo 400).
- (2026-09-23) Implementado WU-1+WU-2 backend: seed catálogo sin 12; migration EF
  `20260923155514_RemoveWholesaleSalesFromPagoPlan` + clase SQL compartida `WholesaleSalesPagoRemoval.cs`
  (CleanupSql/DownSql); script VPS `21-20260923-Remove-WholesaleSales-From-Pago.sql`; clave i18n nueva;
  cierres POST (validator 400 + filtro herencia OwnerAdmin), PUT (handler 400 por plan efectivo) y
  toggle (excluye 12). Compila OK (WebApi y E2ETests).
- (2026-09-23) E2E backend adaptados (10 + 3 extra autorizados) + tests nuevos: `WholesaleSalesPagoRemovalTests`
  (limpieza + idempotencia + Superior intocada) y las aserciones explícitas en StorePlanCatalogTests.
- (2026-09-23) HALLAZGO PRE-EXISTENTE (no causado por esta feature, verificado con git diff): `Application.Tests`
  NO compila en la base — `SwitchMyStoreCommandHandlerTests.cs:99` asigna `store.Id = id;` y `Entity<Guid>.Id` es
  init-only. Bloquea `dotnet test src/SMCA.sln` (solo Application.Tests), no el proyecto E2E. No se toca sin OK.
- (2026-09-23) E2E completo: `Passed! Failed: 0, Passed: 556, Total: 556` (suite completa, 3m 3s).
- (2026-09-23) Backend COMMITEADO en rama `feat/wholesale-superior-vip-only` (3 work-units, sin push):
  `c6396984` (seed+migration+script+snapshot), `06aa3061` (cierres POST/PUT/toggle+herencia+i18n),
  `ad3ba5d0` (13 tests adaptados + 3 nuevos).
- (2026-09-23) Frontend enums (`EModules.WholesaleSales=12` / `EFeatures.WholesaleSales=39`) +
  test nuevo `wholesale-enums.test.ts`; `menu-config.ts` item WHOLESALE → featureIds [39] + moduleId 12;
  loader custom en `wholesale.tsx` (módulo 12 para TODOS los roles; sin módulo → bootstrap DEK + redirect home
  sin logout; no-auth → logout + /login).
- (2026-09-23) TEST UNITARIO NUEVO del loader `wholesale-loader.test.ts` (5 tests): con módulo 12 → null;
  SuperAdmin sin 12 → redirect home (NO bypass de rol); OwnerAdmin sin 12 → redirect home sin logout
  (invariante auth-redirect); orden bootstrap DEK ANTES de resolveUserHomePath; no-auth → logout + /login.
- (2026-09-23) E2E frontend ESCRITOS (NO CORRIDOS por indicación del usuario): fixture nuevo
  `store-wholesale-fixture.ts`, 3 specs adaptados (mayorista-sale, wholesale-cart-floor, wholesale-scanner)
  + spec nuevo `wholesale-plan-gate.spec.ts` (Pago no ve menú + no entra, sin /login; Superior ve y entra).
- (2026-09-23) Frontend COMMITEADO como work-unit `b3aab43e` (ramas: feature y luego dev).
- (2026-09-23) TODO EL CAMBIO movido a la rama local `dev` (fast-forward desde `833769a0`) y PUSHEADO a
  `origin/dev` por decisión del usuario; rama local `feat/wholesale-superior-vip-only` ELIMINADA.
- E2E frontend quedan SIN ejecutar por decisión explícita del usuario ("no verifiques los tests e2e al respecto").

## Verification Evidence
- (2026-09-23) `dotnet build src/SMCA.WebApi` → 0 errores (warnings preexistentes).
- (2026-09-23) `dotnet build src/SMCA.WebApi.E2ETests` → 0 errores.
- (2026-09-23) E2E backend: `Failed: 0, Passed: 556, Total: 556`; Domain.UnitTests 27/27.
- (2026-09-23) `pnpm --filter @store-mgmt/domain test` → 22 files / 180 tests OK (incl. wholesale-enums).
- (2026-09-23) `pnpm --filter @store-mgmt/web-store-pos exec vitest run ...wholesale-loader.test.ts` → 5/5 OK.
- (2026-09-23) `pnpm turbo run typecheck lint` → 9/9 OK (web-store-pos typegen+tsc incluido).
- (2026-09-23) `pnpm turbo run test` → 4173 OK / 2 fallos CLASIFICADOS: `sales-routes.test.tsx:336`
  pre-existente (falla también sin mis cambios, verificado con stash) y `user-routes.test.tsx` flaky por
  contención (pasa aislado 28/28 con mis cambios).
- (2026-09-23) E2E frontend: PENDIENTE (NO ejecutados por decisión del usuario).