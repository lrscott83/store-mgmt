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
- Cierre de vías administrativas (decisión 2026-09-23):
  - POST `/api/v1/stores` request-driven: módulo 12 NO asignable a tienda que nace Pago.
  - Toggle Gratis→Pago (`ToggleStorePlanCommand.ApplyFreeToPaid`): NO reactivar módulo 12 ni feature 39.
  - PUT `/api/v1/stores/{id}` (reemplazo manual de módulos): PENDIENTE de confirmar si también se cierra.
- E2E backend: actualizar `StorePlanCatalogTests.cs` (Pago sin 12 — YA AUTORIZADO) + test nuevo de aserción
  (Pago sin 12; Superior y VIP con 12) + test nuevo de limpieza de tiendas Pago.
- Frontend React (`frontend-react/`): adicionar `EModules.WholesaleSales = 12` y `EFeatures.WholesaleSales = 39`
  a `packages/domain` (con tests de enum); gatear `MENU.WHOLESALE` en `menu-config.ts` (feature 39 / módulo 12) y
  el loader de `wholesale.tsx` para que Pago NO vea ni entre; NUNCA tocar `frontend/` (Angular legacy).
- E2E frontend: adaptar specs wholesale existentes que corren con personas Pago (AUTORIZADO: mayorista-sale,
  wholesale-scanner, wholesale-cart-floor) usando identidad privada con plan Superior (patrón
  `store-multimonedas-fixture.ts`); adicionar tests nuevos (Pago no ve/no entra; Superior/VIP sí).

## Test E2E backend existentes afectados (INVENTARIO EXACTO)

### YA AUTORIZADOS (permiso otorgado)
1. `StorePlanCatalogTests.cs` — Pago pierde 12 en la matriz; Superior/VIP lo conservan (+ test nuevo de aserción).
2. `StoreCreatePlanTests.cs:168` — `HaveCount(11)` → `HaveCount(10)` + comentario.

### REQUIEREN APROBACIÓN ADICIONAL (se rompen con el cierre de vías — pendiente de pregunta)
3. `AuthRegisterPlanTests.Register_creates_store_with_pago_plan_and_all_available_modules` (línea 73):
   `Contain(12)` en la tienda registrada → el catálogo Pago sin 12 la rompe. Se adapta a `NotContain(12)`.
4. `AuthRegisterPlanTests.Register_generates_store_role_features_for_mapped_plan_features` (línea 127):
   `Contain(39)` → `NotContain(39)`.
5. `AuthRegisterPlanTests.Register_owner_me_shows_full_plan_module_set` (línea 152):
   `/me` `Contain(12)` → `NotContain(12)`.
6. `StoreCreatePlanTests.Create_store_with_all_paid_modules_including_new_12_14` (líneas 114/127):
   crea tienda Pago por API pidiendo 12 y espera 201 con 12. Depende de la semántica de cierre (rechazo vs. filtrado).
7. `StoreCreatePlanTests.Create_store_defaults_to_pago_but_modules_are_request_driven` (líneas 151/175):
   fullCatalogRequest incluye 12 y aserta `storeModuleIds == request`. Depende de la semántica de cierre.
8. `AuthMePlanModulesTests.Me_after_free_to_paid_toggle_modules_reappear` (línea 172):
   después del toggle Free→Paid espera 12 → pasa a `NotContain(12)`.
9. `StorePlanChangeTests.Toggle_free_to_paid_activates_new_modules_12_13_14_with_catalog_prices`
   (líneas 71-74/88): toggle espera 12 + feature 39 → pasa a esperar sin 12 ni 39.
10. SOLO SI SE CIERRA PUT: `StorePlanChangeTests.Update_module_set_upgrade_adds_new_modules_with_features`
    (líneas 230-268): PUT agrega 12 a tienda Pago → se adapta a usar solo [7, 13].

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
- Semántica de cierre de vías (rechazo 400 vs. filtrado silencioso) PENDIENTE de decisión del usuario.
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
6. Backend (según decisión pendiente): cierre PUT `/api/v1/stores/{id}` — módulo 12 no admitido en tienda Pago.
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
- PENDIENTE: aprobación para adaptar tests 3-9 del inventario; semántica de cierre (rechazo vs filtrado);
  cierre de PUT sí/no.
- (pending) Tasks 1-16 sin iniciar.

## Verification Evidence
- (pending) resultados de `dotnet test`, `pnpm typecheck/lint/test`, `pnpm test:e2e` por task.