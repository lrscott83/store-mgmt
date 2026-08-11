# S2-01 — Plan de backend

> **Resuelto por `e2e-s2-01-backend`** (2026-08-11). Las 4 aserciones sin test de esta auditoría quedaron cubiertas por `Stores/StoreModuleLifecycleTests.cs` — ver el mapeo en "Qué hacer" y el estado de cobertura en [S2-01.md](S2-01.md).
>
> Histórico: este plan nació como trabajo **diferido** (nada se ejecutaba sin decisión explícita del usuario). Sale de una auditoría del 2026-08-07 que contrastó **cada aserción declarada en la US** contra el código real de `backend/src/SMCA.WebApi.E2ETests/`. No sale de leer la sección "Estado de cobertura" de la US: esa sección es justamente lo que estaba mal.
>
> **Regla del proyecto (`CLAUDE.md`, innegociable)**: tocar un test E2E existente requiere autorización explícita. Agregar tests nuevos está permitido.

## Qué encontró la auditoría

De las 11 aserciones de backend, **7 están cubiertas** por `Stores/StoreUpdateTests.cs` y `Stores/StoreAuthorizationTests.cs`. Las otras **4 no las afirma ningún test**, y están marcadas `[x]`.

| # | Aserción de la US | Estado real |
|---|---|---|
| 1 | `GET /v1/stores/{id}` devuelve **solo los módulos activos** de la tienda | Sin test. `StoreGetByIdTests.cs` no menciona `IsActive` en ninguna aserción |
| 2 | Los ids de `StoreDto.Modules` son **ids de catálogo** (`ModuleDto.Id = StoreModule.ModuleId`), no ids de fila | Sin test. Nada afirma la identidad de esos ids |
| 3 | Al **desactivar** módulos, sus `StoreRoleFeature` quedan `IsActive = false` | Sin test en el camino de stores. `StoreRoleFeature` solo se afirma en `Owners/OwnersUpdateTests`, `Features/FeaturesActivateGapTests`, `Users/ExportOfflineRosterTests` y `Stores/StoreCreateAuthorizationGapTests` |
| 4 | Al **insertar** módulos nuevos, se generan `StoreRoleFeature` para sus features | Sin test, mismo motivo |

## Por qué #2 importa más de lo que parece

La US misma lo explica: que los ids sean de catálogo es **lo que hace que el merge de módulos funcione** del lado del cliente. Si algún día `ModuleDto.Id` pasara a ser el id de la fila `StoreModule`, el frontend rompería de una forma difícil de diagnosticar, y ningún test lo vería.

## Qué hacer

✅ **Hecho** — `backend/src/SMCA.WebApi.E2ETests/Stores/StoreModuleLifecycleTests.cs` (nuevo, 2 GET + 2 PUT, patrón `[Collection("e2e")]` + `WebAppFixture`). Mapeo aserción → test:

| # | Aserción de la US | Test |
|---|---|---|
| 1 | `GET /v1/stores/{id}` devuelve **solo los módulos activos** | `Get_returns_only_active_modules_when_inactive_module_seeded` (`StoreModuleLifecycleTests.cs:99`) — siembra el módulo 6 inactivo como entidad `Added` y afirma que el GET lo excluye |
| 2 | Los ids de `StoreDto.Modules` son **ids de catálogo** | `Get_returns_catalog_module_ids` (`StoreModuleLifecycleTests.cs:125`) — igualdad de conjuntos contra `ModuleId` leído de base con `.IgnoreQueryFilters()` |
| 3 | Al **desactivar** módulos, sus `StoreRoleFeature` quedan `IsActive = false` | `Put_removing_module_deactivates_its_store_role_features` (`StoreModuleLifecycleTests.cs:146`) — siembra SRF real (feature 60, módulo 6, `OwnerAdmin`), PUT `[7]`, afirma `StoreModule(6).IsActive == false` ∧ SRF `IsActive == false` |
| 4 | Al **insertar** módulos nuevos, se generan `StoreRoleFeature` | `Put_adding_module_generates_store_role_features` (`StoreModuleLifecycleTests.cs:174`) — PUT `[7,6]` sobre tienda free, esperado computado replicando `StoreRoleFeatureGenerator` (no hardcodeado) |

El plan de la auditoría queda cerrado. Alcance respetado: solo se agregaron tests nuevos, sin tocar producción ni tests existentes.
