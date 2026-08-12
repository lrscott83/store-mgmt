# Proposal: e2e-s2-01-backend — Cerrar el hueco E2E de S2-01 (módulos + StoreRoleFeature)

## Intent

Cerrar la brecha detectada en la auditoría del 2026-08-07 (`docs/testing/e2e-stage-1/S2-01-backend.md`): 4 aserciones de la US S2-01 (DG-7) marcadas `[x]` como cubiertas sin test E2E .NET que las afirme. Verificado por lectura: `StoreGetByIdTests.cs` no menciona `IsActive` ni la identidad de los ids. El cambio agrega tests E2E NUEVOS que afirmen:

1. `GET /v1/stores/{id}` devuelve SOLO módulos activos (include filtrado — `StoreRepository.cs:73,83`).
2. Los ids de `StoreDto.Modules` son ids de catálogo, no de fila `StoreModule` (`ModuleProfile.cs:22`).
3. Remover módulos vía `PUT /v1/stores/{id}` deja sus `StoreRoleFeature` con `IsActive = false` (`UpdateStoreCommand.cs:113-131`).
4. Insertar módulos nuevos genera `StoreRoleFeature` para sus features (`UpdateStoreCommand.cs:133-147`, `StoreRoleFeatureGenerator.cs:17-37`).

## Why

La US misma explica por qué #2 importa: que los ids sean de catálogo es lo que hace funcionar el merge del frontend contra `/v1/modules/ToStore`. Si algún día `ModuleDto.Id` pasara a ser el id de fila, el frontend rompería de forma difícil de diagnosticar sin que ningún test lo viera. Las 4 aserciones describen comportamiento real de producción que hoy no está protegido contra regresión.

## What Changes

**In Scope**
- Fichero de tests E2E NUEVO en `backend/src/SMCA.WebApi.E2ETests/Stores/` (nombre a decidir en design, p. ej. `StoreModuleLifecycleTests.cs`): 2 tests sobre GET (#1, #2) y 2 sobre PUT (#3, #4).
- Docs: `docs/testing/e2e-stage-1/S2-01.md` (estado de cobertura con refs a los tests nuevos) y `S2-01-backend.md` (plan resuelto); `README.md` solo si el estado del plan amerita nota.
- Entrega: commits a `feat/e2e-s2-01-backend`, sin PR.

**Out of Scope**
- Reactivación de módulos y `PaymentStartDate` (decisión de usuario).
- **REQUIERE-AUTORIZACIÓN (no planificado)**: modificar producción, tests E2E existentes o soporte E2E. ADD-only estricto; si apply descubre que hace falta tocarlos, para y pregunta.

## Capabilities

**New Capabilities**
- `store-module-lifecycle-e2e`: requirements de cobertura E2E .NET del ciclo de vida `StoreModule`/`StoreRoleFeature` (solo módulos activos en GET, ids de catálogo, SRF desactivadas al remover, SRF generadas al insertar). Sigue la convención del repo (`billing-e2e-coverage`, `features-e2e`, `users-e2e`).

**Modified Capabilities**
- None — ningún requirement de `openspec/specs/` cambia; la brecha es de cobertura, no de comportamiento.

## How

Patrón de la suite: `[Collection("e2e")]`, fixture `WebAppFixture`, SuperAdmin vía `DbTestHelpers.SeedSuperAdminAsync` + `AuthedClient`, cleanup en `try/finally`, toda lectura a base con scope + `.IgnoreQueryFilters()`.

- **#1 (GET)**: tienda con un módulo inactivo en base (removido por PUT previo o sembrado directo); GET; assert de ausencia/presencia.
- **#2 (GET)**: tienda paga (módulos 7+6); GET; assert `ModuleDto.Id` = ids de catálogo (7, 6) y ≠ ids de fila `StoreModule`.
- **#3 (PUT)**: sembrar SRF con feature real `AvailableToStore` del módulo removido (feature 60 → módulo 6; 70/72/73/74 → módulo 7); PUT removiendo ese módulo; assert SRF `IsActive = false`.
- **#4 (PUT)**: tienda gratis (solo módulo 7); PUT agregando módulo 6; assert SRF generadas = features del módulo filtradas por el enum `StoreRoleFeatures`, una fila por rol en `HasRoles` — esperado COMPUTADO, no hardcodeado (`StoreRoleFeaturesExtensions.cs:8-18`).

## Impact / Risks

| Area | Impact |
|------|--------|
| `backend/src/SMCA.WebApi.E2ETests/Stores/StoreModuleLifecycleTests.cs` | New |
| `docs/testing/e2e-stage-1/S2-01.md` | Modified |
| `docs/testing/e2e-stage-1/S2-01-backend.md` | Modified |
| `docs/testing/e2e-stage-1/README.md` | Modified (si aplica) |

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| Lectura sin `.IgnoreQueryFilters()` → 0 filas (filtros tenant: `StoreModuleEntityTypeConfiguration.cs:21`, `StoreRoleFeatureEntityTypeConfiguration.cs:19`) | Alta | Obligatorio en toda lectura de `StoreModule`/`StoreRoleFeature` |
| SRF sembrada con feature ajena al módulo removido → handler la ignora (`StoreRoleFeatureRepository.cs:25-32`) | Media | Usar features reales: 60→6, 70/72/73/74→7 |
| Esperado de #4 hardcodeado → frágil ante catálogo nuevo | Media | Computar desde enum `StoreRoleFeatures` + `HasRoles` |
| FK Restrict SRF→Feature → violación de integridad | Media | Solo features de catálogo reales |
| Diff > presupuesto de 400 líneas | Baja | Un fichero, sin helpers duplicados |

**Rollback**: `git revert`/`git reset` de la rama. No toca producción ni tests existentes → regresión nula; los tests nuevos se eliminan sin efecto en la suite.

**Success Criteria**
- [ ] 4 aserciones afirmadas por tests E2E nuevos; suite E2E verde.
- [ ] Docs sincronizadas (checkboxes reflejan la cobertura real).
- [ ] Cero cambios a producción/tests existentes (verificable en `git diff`).
- [ ] Diff total ≤ 400 líneas.

## Open Questions

Técnicos, para revisión del usuario (producto ya decidido): nombre del fichero de tests, agrupación exacta (2 GET + 2 PUT vs 1 test por aserción), y si `README.md` amerita nota. Se resuelven en design.
