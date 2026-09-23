# Feature: remove-almacenes-from-gratis-pago — limpieza de módulo 13 en tiendas no Superior/VIP

**Estado**: COMPLETADO (verificado, commits locales en qa, sin push) · **Rama**: qa (local) · **Creado**: 2026-09-23

## Objetivo

El módulo Almacenes (13) debe existir SOLO en tiendas con plan Superior (3) o VIP (4). Limpiar los datos
persistentes que lo asignaron a tiendas Gratis (1) y Pago (2) durante el backfill del 2026-09-05
(`20260905224007_Add-Warehouses-Module`), que se ejecutó ANTES de que existieran los planes (tabla `StorePlan`
creada el 2026-09-08). Entregable: migración EF + script VPS (patrón espejo del precedente
`WholesaleSalesPagoRemoval` / script 21). SIN test E2E nuevo (decisión explícita del usuario 2026-09-23).

## Problema (forma simple para el usuario)

**Almacenes es un módulo de los planes Superior y VIP.** El catálogo de planes ya lo dice bien desde el
2026-09-08. Pero el 5 de septiembre, cuando se creó el módulo, una migración de datos lo asignó a TODAS las
tiendas activas que existían — y en esa fecha los planes todavía no existían (se crearon 3 días después).
Cuando llegaron los planes, todas esas tiendas quedaron en Pago... y se quedaron con Almacenes activo de por
vida. Hoy una tienda en Pago o Gratis sigue teniendo el módulo 13 y las features 36/37 encendidas (`/me` las
reporta, el menú "Almacenes" aparece) sin estar pagando un plan que lo incluya. Es la misma enfermedad que
tuvo Ventas Mayoristas (módulo 12) — y esa sí se curó el 23 de septiembre. Almacenes nunca recibió su
limpieza.

## Causa raíz (investigación 2026-09-23, evidencia)

1. Catálogo de planes correcto — `StorePlanModuleEntityTypeConfiguration.cs:31-88`: Almacenes (13) solo en
   Superior (línea 65) y VIP (línea 82). Gratis/Pago NO lo incluyen.
2. Backfill global sin filtro de plan — `WarehousesModuleBackfill.StoreModuleSql` (migración
   `20260905224007_Add-Warehouses-Module.cs`, 2026-09-05):
   `SELECT s."Id", 13, ... FROM "Store" s WHERE s."IsActive" = TRUE` — TODAS las tiendas activas, sin
   condición de plan (los planes no existían todavía; `StorePlanId` se añadió el 08-09 con DEFAULT 2 vía
   `20260908194349_Add-StorePlans.cs:52` → todas las tiendas existentes pasaron a Pago).
3. Contraste: el backfill posterior `MultiMonedasModuleBackfill.cs:29` SÍ filtra
   `WHERE s."IsActive" = TRUE AND s."StorePlanId" IN (3, 4)` — el patrón correcto se aprendió más tarde;
   Warehouses usó el patrón viejo.
4. Sin limpieza posterior — NO existe migración ni script que retire módulo 13/features 36-37 de tiendas no
   Superior/VIP. A diferencia de WholesaleSales (migración `20260923155514_RemoveWholesaleSalesFromPagoPlan`
   + script `21-20260923-Remove-WholesaleSales-From-Pago.sql`, 2026-09-23).
5. Los flujos nuevos ya respetan la gating (solo corrigen tiendas nuevas o cambios de plan):
   - `RegisterCommand.cs:71-95` — tienda nueva recibe exactamente los módulos del plan Pago; comenta
     "keeps Superior/VIP-only modules (Warehouses 13, ...) out of a Pago store".
   - `ChangeStorePlanCommand.ApplyPlanModules` — al cambiar de plan, soft-deletea módulos fuera del universo
     del plan objetivo.
   → Las tiendas preexistentes en Gratis/Pago conservan Almacenes hasta que alguien cambie su plan. Este
   cambio entrega esa limpieza de datos pendiente.

## Scope (autorizado por el usuario 2026-09-23: "dale con ODD")

- Clase compartida `backend/src/Infrastructure/Migrations/WarehousesPlanCleanup.cs` (CleanupSql/DownSql —
  single source of truth, patrón espejo de `WholesaleSalesPagoRemoval.cs`).
- Migración EF nueva `RemoveWarehousesFromGratisPago` (data-only: `migrationBuilder.Sql(...)` en Up;
  Down no-op documentado como el precedente).
- Script VPS `backend/scripts/22-20260923-Remove-Warehouses-From-Gratis-Pago.sql` idempotente con parity
  (patrón script 21: BEGIN/COMMIT, DELETE, registro en `__EFMigrationsHistory`, SELECT de verificación).
- Alcance de limpieza: `StorePlanId NOT IN (3, 4)` → tiendas Gratis (1) Y Pago (2). El backfill del 05-09
  alcanzó a todas las tiendas activas sin importar plan; el catálogo excluye Almacenes de Gratis y Pago.
- Tests: NO se crea test E2E nuevo (decisión explícita del usuario) y NO se modifica ningún test existente.
  Verificación con la suite existente (`dotnet test` — la fixture WebAppFixture aplica migraciones sobre
  `smca_test`, y el punto 1 del script VPS + migration quedan cubiertos por la verificación SELECT).

FUERA DE SCOPE (reglas no negociables del repo):
- `frontend/` (Angular legacy) — CONGELADO, nunca se toca.
- `frontend-react/e2e/**`, `frontend-react/e2e/support/**` y `backend/src/SMCA.WebApi.E2ETests/**` —
  NINGÚN test E2E existente se modifica, borra, renombra, salta o debilita. El usuario declinó incluso el
  test E2E NUEVO.
- Cierre de vías administrativas (PUT/POST/toggle que puedan reintroducir 13 en Pago) — NO es parte de esta
  feature; es una decisión de negocio separada. Documentado aquí como pendiente opcional.

## Restricciones

- Regla repo: el frontend Angular (`frontend/`) es legacy y NO se toca.
- Regla repo: nunca modificar tests E2E existentes sin autorización explícita (aplica a backend y frontend).
- Regla repo backend-test-coverage (2026-08-08): añadir E2E nuevos permitido; modificar producción requiere
  notificación + aprobación — el usuario YA aprobó migración + script en esta conversación.
- Orden FK: borrar `StoreRoleFeature` (36/37) ANTES que `StoreModule` (13).
- Idempotente: DELETE naturalmente idempotente (re-ejecutar = no-op). `ON CONFLICT DO NOTHING` en el INSERT
  de `__EFMigrationsHistory`.
- Parity: el SQL del script VPS debe ser el MISMO texto que `WarehousesPlanCleanup.CleanupSql`.
- `ProductVersion` en el script: '8.0.3' (parity con script 21 registrado el 2026-09-23).
- Convencional commits, sin "Co-Authored-By" ni atribución AI.
- Artefactos técnicos en inglés (código, script SQL, mensajes de commit); conversación en español.

## Checklist

- [x] T0 — Investigación: causa raíz identificada y documentada arriba (2026-09-23, evidencia en
  `WarehousesModuleBackfill.cs` vs `MultiMonedasModuleBackfill.cs`, `StorePlanModuleEntityTypeConfiguration.cs`,
  `WholesaleSalesPagoRemoval.cs`).
- [x] T1 — Clase compartida `WarehousesPlanCleanup.cs` (constantes + CleanupSql + DownSql no-op).
- [x] T2 — Migración EF `20260923215148_RemoveWarehousesFromGratisPago` (data-only, Up=`CleanupSql`,
  Down=`DownSql`; snapshot de modelo sin cambios — migración data-only).
- [x] T3 — Script VPS `backend/scripts/22-20260923-Remove-Warehouses-From-Gratis-Pago.sql` con parity
  (texto idéntico al `CleanupSql`, registro EF, SELECT de verificación).
- [x] T4 — Verificación: build OK + suite completa verde + migración aplicada en `smca_test` (ver
  "Progreso y evidencia" abajo); 2 commits de unidad de trabajo en `qa`.

## Criterios de aceptación

- `WarehousesPlanCleanup.CleanupSql` borra StoreRoleFeature 36/37 y StoreModule 13 de toda tienda cuyo
  `StorePlanId NOT IN (3,4)` (activas, soft-deleted, y tiendas inactivas incluidas — sin filtro de
  `IsActive`, parity con el precedente: "soft state is not enough").
- Tiendas Superior/VIP intocadas.
- Migración EF + script VPS aplicables (idempotentes) y con parity de texto.
- Ningún test E2E existente tocado; `frontend/` no tocado.

## Chequeos aplicables

- `dotnet build backend/src/SMCA.WebApi` (o `dotnet build backend/src/SMCA.sln` según README raíz).
- `dotnet test backend/src/SMCA.sln` — la suite E2E existente (`SMCA.WebApi.E2ETests`) aplica las
  migraciones al arrancar (WebAppFixture) contra `smca_test` real; no modifica ningún test.
- Verificación SELECT del script/migración: 0 tiendas no-Superior/VIP con StoreModule 13 /
  StoreRoleFeature 36/37 tras aplicar.
- (Si RDD disponible: `gentle-ai review assess` — runtime OpenCode no elegible en esta sesión, registrar
  resultado, no inventar.)

## Progreso y evidencia

- T0: evidencia en la sección Causa raíz (2026-09-23). Exploración read-only del orquestador: seeds de
  planes, migraciones 05-09 / 08-09 / 23-09, `WholesaleSalesPagoRemoval.cs`, script 21, README raíz + scripts.
- T1-T4: implementados por el orquestador (escritura directa inline — cambio mecánico de parity con
  precedente verificado, un solo feature pequeño; sin delegación necesaria).
- Decisión del usuario (2026-09-23, vía pregunta): NO crear test E2E nuevo — solo migración + script.
- Verificación ejecutada (2026-09-23):
  - `dotnet build src/SMCA.WebApi/SMCA.WebApi.csproj` → **Build succeeded**, 0 errores.
  - `dotnet test src/SMCA.sln` → **Domain.UnitTests 27/27 PASSED**, **Application.Tests 503/503 PASSED**,
    **SMCA.WebApi.E2ETests 556/556 PASSED** (WebAppFixture aplicó la migración nueva contra `smca_test`
    real al arrancar; ningún test E2E existente fue tocado).
  - `dotnet ef migrations list --connection .../smca_test` → `20260923215148_RemoveWarehousesFromGratisPago`
    listada **sin `(Pending)`** (aplicada).
- Commits de unidad de trabajo (rama `qa`, local):
  - `f922e35c` `docs(odd): track remove-almacenes-from-gratis-pago feature plan`
  - `21ea7ed0` `feat(plan): remove Warehouses module from Gratis/Pago stores (migration, VPS script)`
  - (este commit) `docs(odd): mark remove-almacenes-from-gratis-pago completed with verification evidence`
- RDD: runtime OpenCode no elegible para revisión inmutable (mismo resultado registrado en
  cart-wholesale-by-order-type); no se ejecuta assess con un agente no elegible.
- Nota de entorno: se detuvo el dev server `SMCA.WebApi` (PID 11092) que bloqueaba el build — atención si
  se necesita relanzar (`dotnet run --project backend/src/SMCA.WebApi`) para pruebas manuales/E2E frontend.

## Siguiente paso

Push/PR a decisión del usuario (política ordinaria del repo). Pendiente opcional (NO parte de esta
feature, requiere decisión de negocio): cerrar vías administrativas (PUT/POST/toggle) que puedan
reintroducir módulo 13 en tiendas no Superior/VIP.