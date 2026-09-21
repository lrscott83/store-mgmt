# Plan — Catálogo de planes del SuperAdmin: VIP visible + MultiMonedas en Superior

**Fecha:** 2026-09-21 · **Rama:** test · **Estado:** aprobado por el usuario ("resuelve las cosas con los tests y la BD de test")

## Síntoma (lo que ve un usuario)

En el popup "Cambiar plan" de las tiendas del SuperAdmin:
1. El panel **Superior** no muestra el módulo **"Múltiples monedas"** (MultiMonedas, id 15).
2. El plan **VIP** no aparece para poder cambiarlo.

## Causa raíz (investigada, con evidencia)

### 1. VIP ausente — bug de código (afecta a todos los entornos)

`PlanRepository.GetActivePlansIncludingModulesForCatalogAsync()` (Infrastructure/Persistence/Repositories/PlanRepository.cs:20) excluye VIP **incondicionalmente**:

```csharp
.Where(p => p.IsActive && p.Id != (int)StorePlanType.VIP)
```

`GET /v1/plans` alimenta el popup del SuperAdmin → VIP nunca llega al frontend, para nadie. El resto de la cadena ya soporta VIP: el modal solo oculta planes a no-SuperAdmin (`edit-plan-modal.tsx` visiblePlans), el backend de `ChangeStorePlan` ya acepta VIP para SuperAdmin (E2E `StorePlanCanonicalPriceTests.P5` crea tiendas VIP), y el E2E de semilla (`StorePlanCatalogTests`) afirma que VIP(4) tiene su matriz de módulos.

**Fix:** el repositorio deja de excluir; el **handler** (`GetPlansQueryHandler`) filtra por tipo de caller:
- **SuperAdmin:** los 4 planes (Gratis, Pago, Superior, VIP).
- **OwnerAdmin/otros:** igual que hoy — se excluye solo VIP (Gratis/Pago/Superior). Así la página de plan del owner (`store-plan.tsx`) conserva el upsell de Superior y no hay regresión.

La exclusión se **mueve** del repo (incondicional) al handler (condicional por caller) — cambio mínimo.

### 2. MultiMonedas ausente en el panel Superior — el código está correcto; el problema es la BD del entorno probado

- La migración EF `20260917143901_Add-MultiMonedas-Module` inserta `StorePlanModule { ModuleId=15, PlanId=3 }` y `{ 15, 4 }` (líneas 25-33) + script VPS `backend/scripts/17-20260917-Add-MultiMonedas-Module.sql` idéntico.
- El E2E `StorePlanCatalogTests.StorePlanModule_seed_matches_documented_plan_matrix` corrió **544/544 en verde** hoy contra `smca_test` real: la semilla del código SÍ incluye 15 en Superior y VIP.
- El frontend no filtra módulos (`PlanPanels` renderiza `plan.modules`; el delta vs Pago no puede quitar 15 porque Pago no lo tiene).

**Conclusión:** si en el entorno donde te autenticaste no aparece, esa BD no tiene aplicada la migración/script 17 (o el backend desplegado es anterior). Con la BD de test `smca_test` queda demostrado por tests. Para la BD del entorno afectado, aplicar el script 17 según el readme (Opción A: `dotnet ef database update`, Opción B: script manual) — **con tu permiso**, es operación sobre entorno.

## Diseño de la solución

| Caller | GET /v1/plans devuelve |
|---|---|
| SuperAdmin | Gratis(1), Pago(2), Superior(3), **VIP(4)** |
| OwnerAdmin | Gratis, Pago, Superior (sin VIP — igual que hoy) |

- **Backend:** `PlanRepository` sin exclusión; `GetPlansQueryHandler` filtra VIP solo para no-SuperAdmin (`IHttpContextService.IsSuperAdmin`). El gate `IsSuperAdminOrOwnerAdmin` se queda como autorización de entrada.
- **Frontend:** solo se necesita la etiqueta — `PLAN_NAME_KEYS` no conoce `VIP` → añadir `'STORES.PLAN.VIP_TAB': 'VIP'` en `es.ts`. El modal ya muestra todos los planes al SuperAdmin y el filtro de no-SuperAdmin ya existe.

## Tests (TDD — primero en rojo, luego implementación)

### Unit backend (libres de modificar — NO son E2E)
`Application.Tests/.../GetPlans/PlanRepositoryTests.cs` + `GetPlansQueryHandlerTests.cs`:
- Repo: el catálogo **incluye** VIP (revierte el viejo `ExcludesVip`) y mantiene orden/activos/módulos.
- Handler: SuperAdmin recibe 4 planes; no-SuperAdmin recibe 3 (VIP filtrado, Superior conservado).

### E2E backend NUEVOS (archivo nuevo, ninguno existente tocado)
`SMCA.WebApi.E2ETests/Plans/PlanCatalogVisibilityTests.cs` `[Collection("e2e")]`:
- **PC1** — SuperAdmin: `GET /v1/plans` devuelve 4 planes, incluida VIP.
- **PC2** — OwnerAdmin: devuelve 3 planes y **no** contiene VIP.
- **PC3** — Superior contiene el módulo 15 "Múltiples monedas" en el catálogo servido (cobra vida el reclamo del usuario contra BD real).
- **PC4** — VIP contiene sus módulos (15, 16, 17) en el catálogo servido.

Qué prueba, en simple: *"el SuperAdmin ve todos los planes con sus módulos reales al cambiar el plan de una tienda; el owner sigue viendo lo de siempre"*. Propuesta de solución: mover el filtro VIP del repo al handler condicionado por caller.

### Unit frontend (libres)
- `plan-panels.test.tsx`: con catálogo de 4 planes renderiza panel "VIP" (nueva clave i18n) y el panel Superior lista "Múltiples monedas".
- Los tests existentes de owner (my-stores/store-plan) no cambian: sus catálogos mockeados ya no incluyen VIP.

### E2E frontend NUEVO
`frontend-react/e2e/plan-catalog.spec.ts`: SuperAdmin abre el popup "Cambiar plan" → 4 paneles incluido VIP; panel Superior desplegado muestra "Múltiples monedas". Según readme: backend `http-e2e` (guard `Database=smca_test`, puerto 5019) + `pnpm exec playwright test e2e/plan-catalog.spec.ts`.

## Riesgo revisado en E2E existentes (innegociable)

- `StorePlanCanonicalPriceTests.P5` menciona en un **comentario** que VIP está excluida del catálogo, pero **no lo afirma** (compara precios vía lista de tiendas) → no se rompe.
- `StorePlanCatalogTests` (semilla) no consulta el endpoint → no se rompe.
- Ningún E2E existente necesita modificación. Si algún E2E existente rompiera, se pide permiso 1-a-1 con qué prueba / causa / propuesta.

## Verificación (readme del root)

1. Backend unit: `dotnet test backend/src/Application.Tests/Application.Tests.csproj`
2. E2E backend: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` (BD `smca_test` real)
3. Frontend: `pnpm turbo run typecheck lint test` (unit) + spec Playwright nuevo con backend `http-e2e`.

## Nota de entorno

Para que el entorno del usuario (BD de dev/VPS) muestre MultiMonedas en Superior hace falta tener aplicada la migración 17 — verificación y corrección con comandos del readme, ejecutables solo con autorización explícita.
