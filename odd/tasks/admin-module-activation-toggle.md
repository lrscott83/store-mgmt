# Feature: admin-module-activation-toggle

**Objective:** Que el SuperAdmin pueda **activar/desactivar un módulo** desde la vista del
catálogo de módulos (`/admin/modules`) con un checkbox al inicio de cada fila. El precio
—el total por plan y el total de la tabla— cuenta **solo módulos activos**. Y en la
edición de planes de cada tienda (owner en `/management/stores/plan` y SuperAdmin en el
modal por tienda de `/admin/stores`) se muestran **solo módulos activos**.

## Decisiones (tomadas con el usuario)

1. **Se toca backend y frontend** (autorizado).
2. **El toggle se persiste extendiendo `PUT /v1/modules/pricing`**: cada fila del payload
   lleva `isActive` como **booleano requerido** (no nullable). El guardado aplica
   `IsActive` además de los tres precios.
3. **El filtro de inactivos para la edición de planes va en el backend**, en el read de
   planes (`GetPlans`).
4. **`/admin/modules` lista también los `AvailableToStore` inactivos**, para que el
   checkbox sea bidireccional (se pueda reactivar). Requiere un read de catálogo que no
   filtre por `Module.IsActive`.
5. **Se autoriza modificar el E2E `ModuleCatalogPricingTests.cs`** (codifica el contrato
   viejo: "el guardado de precios no toca los flags"). Pasa a afirmar que el guardado
   **sí aplica** `IsActive`.

## Estado actual (explorado)

- `/admin/modules` (`module-catalog.tsx` + `module-catalog-table.tsx`) edita SOLO precios
  vía `PUT /v1/modules/pricing`; el comando excluye deliberadamente `IsActive`.
- El read `GET /v1/modules/ToStore` → `ModuleRepository.GetAvailableModulesToStore()`
  filtra `IsActive && AvailableToStore` y es el MISMO que usan el editor por tienda del
  SuperAdmin, `ChangeStorePlan`, `CreateStore`/`UpdateStore` y `ToggleStorePlan`.
- El precio (`ModulePriceCalculator` / `totalModulePricing`) ya excluye inactivos.
- `GET /v1/plans` (`GetActivePlansIncludingModulesForCatalogAsync` + `PlanProfile`)
  devuelve `plan.modules` sin filtrar por `Module.IsActive` → un módulo inactivo hoy sí
  aparece en los paneles del owner.

## Cambios

### Backend
| # | Cambio | Archivo |
|---|---|---|
| B1 | `ModuleCatalogPricingRequest` gana `bool IsActive` (requerido); el handler lo persiste | `Features/Administration/Modules/Commands/UpdateModuleCatalogPricing/UpdateModuleCatalogPricingCommand.cs` |
| B2 | Read de catálogo que incluye inactivos (repo + query + `GET /v1/modules/catalog`) | `IModuleRepository` / `ModuleRepository` / `GetModuleCatalog/` / `ModulesController` |
| B3 | `GetPlans` filtra módulos inactivos del `plan.modules` | `Features/Administration/Plans/Queries/GetPlans/GetPlansQuery.cs` |

### Frontend
| # | Cambio | Archivo |
|---|---|---|
| F1 | `ModuleCatalogPricingPayload` + `isActive` (dominio) | `packages/domain` |
| F2 | `getModuleCatalog()` | `management/stores/lib/services/store-http-service.ts` |
| F3 | Checkbox al inicio de la tabla + `isActive` en la fila | `admin/modules/components/module-catalog-table.tsx` |
| F4 | Carga del read nuevo, toggle en el draft y en el payload | `admin/modules/routes/module-catalog.tsx` |
| F5 | Clave i18n de la columna | `shared/lib/i18n/es.ts` |

### Tests
- E2E `ModuleCatalogPricingTests.cs`: `PricingRow`/`PricingBody` con `IsActive`; el test
  "leaves the catalog flags intact" se convierte en "aplica IsActive".
- Unit backend nuevos: comando (aplica IsActive), query del catálogo (incluye inactivos),
  `GetPlans` (excluye inactivos).
- Vitest frontend: `module-catalog.test.tsx` cubre el checkbox y el payload.

## Verificación
- `dotnet build backend/src/SMCA.sln`
- `dotnet test` de `Domain.UnitTests` y `Application.Tests`
- `pnpm typecheck`, `pnpm lint`, `pnpm test` en `frontend-react/`
- E2E backend del archivo tocado y E2E frontend de `/admin/modules` (si aplica)
