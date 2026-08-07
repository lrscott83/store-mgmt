# S2-01 — Plan de backend

> Trabajo **diferido**. Nada de acá se ejecuta sin decisión explícita del usuario.
>
> Plan de backend específico de [S2-01](S2-01.md). Sale de una auditoría del 2026-08-07 que contrastó **cada aserción declarada en la US** contra el código real de `backend/src/SMCA.WebApi.E2ETests/`. No sale de leer la sección "Estado de cobertura" de la US: esa sección es justamente lo que estaba mal.
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

Agregar un fichero de tests nuevo al lado de `StoreUpdateTests.cs` que cubra los 4 puntos: uno de lectura sobre `GET /{id}` (para #1 y #2) y dos sobre el `PUT` (para #3 y #4, mirando `StoreRoleFeature` en base antes y después).

**Alcance.** Solo agrega tests nuevos. No requiere autorización.
