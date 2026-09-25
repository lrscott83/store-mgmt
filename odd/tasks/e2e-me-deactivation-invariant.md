# e2e-me-deactivation-invariant — tests E2E de desactivación módulo/feature en `/auth/me`

## Objetivo

Probar el invariante, para TODOS los módulos y features del catálogo: *si X está
activo → X aparece en `/v1/auth/me`; si X se desactiva → X deja de aparecer*. Cobertura
lineal (16 módulos + 34 features OwnerAdmin-visibles), nunca exhaustiva (2^17 × 2^42 ≈
600 mil billones de combinaciones — imposible e innecesario).

## Problema / por qué

El usuario pidió que al desactivar un módulo (o un feature) ya no salga en `/me`, y
cómo cubrir todos los módulos y features. El sistema es determinista: cada elemento
contribuye por separado, así que basta un caso por elemento con el patrón
assert-antes → desactivar → assert-después.

## Alcance autorizado

- **Solo AGREGAR tests E2E nuevos** (regla del repo): un archivo nuevo,
  `backend/src/SMCA.WebApi.E2ETests/Auth/MeModuleFeatureDeactivationTests.cs`.
- NO se toca producción, NO se tocan tests E2E existentes, NO se toca Angular.
- Rutas de desactivación probadas:
  - Módulo: soft-delete `StoreModule.IsActive=false` + `StoreRoleFeature.IsActive=false`
    (replica exacta de `ChangeStorePlanCommand.ApplyPlanModules`).
  - Feature: `Feature.IsActive=false` en el catálogo — el toggle real que respeta
    `FeatureRepository.FilterAvailableToStoreByIds`; restaurado en `finally` (catálogo
    global compartido, colección `e2e` serial → sin paralelismo).

## Diseño

- Listas de módulos/features leídas de BD en runtime (patrón del canary
  `FeatureSeedCoherenceTests`): auto-extensible cuando el catálogo crezca.
- `FeatureIds` del OwnerAdmin = enum `StoreRoleFeatures` (rol OwnerAdmin + módulo en
  `storeModuleIds`) ∩ features activas/available en BD — mismo cálculo que
  `AllowedFeaturesService.GetAllowedFeatureIdsByRoleAsync`.
- `Roles` = SRF de BD vía `GetStoreRoleFeaturesByUserIdAsync` (filtra
  `srf.IsActive`, `Feature.IsActive`, `Module.IsActive`, `storeModuleIds`).
- Gotcha cubierto: `GetAvailableModulesByStoreIdAsync` exige
  `Module.Features.Any(active && available)` → si desactivo el ÚNICO feature de un
  módulo, el módulo completo desaparece de `StoreModuleIds` (módulos de feature único:
  5, 6, 8, 9[OwnerAdmin], 11, 12, 14, 15, 16).
- 91 StorePayment: mapping enum SuperAdmin/ReSeller (NO OwnerAdmin) → probado como
  centinela: OwnerAdmin nunca lo ve en FeatureIds; queda fuera del barrido de features.
- `paymentStartDate: null` → billing NoAplica → `FilterForBilling` no-op
  (los tests existentes pinnean StorePlanId Gratis para este escenario).

## Tareas

- [x] T1 (exploración) — mapear cadena `/me` + desactivación real + catálogo BD
  (17 módulos/42 features en smca_test; 16 módulos y 35 features disponibles).
- [x] T2 (implementación) — crear `MeModuleFeatureDeactivationTests.cs` con:
  - `Me_deactivated_module_disappears_from_me_keeping_others_intact`: 1 store con
    los 16 módulos; por módulo: antes presente, desactivar
    (StoreModule.IsActive=false + SRF.IsActive=false, réplica de ApplyPlanModules),
    después ausente + resto intacto (BeEquivalentTo exacto).
  - `Me_deactivated_feature_disappears_from_me_keeping_others_intact`: por feature
    OwnerAdmin-visible: antes presente, desactivar `Feature.IsActive` (toggle global
    real que respeta `FilterAvailableToStoreByIds`), después ausente de
    FeatureIds/Roles + gotcha de feature-única (módulo desaparece) + resto intacto;
    centinela 91 ∉ FeatureIds.
  - Seeden/cleanup locales replicando `AuthMePlanModulesTests` (regla: no tocar
    helpers existentes); `ExecuteUpdateAsync` para mutaciones (gotcha NoTracking).
- [x] T3 (verificación) — `dotnet test` filtrando la clase nueva: **2/2 PASS**
  (error previo del gate de coherencia corregido — ver detalles abajo).
- [ ] T4 (commits + RDD) — work-unit commit en `qa`; assessment RDD del commit.

## Rutas de implementación

| Task | Ruta | Evidencia de trigger |
| --- | --- | --- |
| T1 | inline (reads dirigidos) | 1–3 archivos/consulta por decisión |
| T2 | inline (un archivo nuevo) | 1 archivo no-trivial, diseño resuelto; delegar un writer para 2+ |
| T3 | inline (run filtrado) | acción acotada por test |
| T4 | inline (git, assessment) | bash de estado |

## Checks aplicables

- `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter FullyQualifiedName~MeModuleFeatureDeactivationTests`
- Requiere PostgreSQL local `smca_test` (WebAppFixture la migra y hace reset data-only).

## Progreso / evidencia

- T1–T3 completas. Archivo `MeModuleFeatureDeactivationTests.cs` creado (nuevo, sin
  tocar nada existente) y **2/2 tests PASS**:
  `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter FullyQualifiedName~MeModuleFeatureDeactivationTests`
  → `Failed: 0, Passed: 2, Duration: 2 s` (build 0 errores; run final 15:07).
- Hallazgo durante T3: `Roles` en `/me` NO es un grupo por módulo — la producción
  agrupa SRF por `(srf.Store, srf.Feature.Module)` sobre entidades NoTracking, así que
  cada fila activa materializa su propio objeto y el `GroupBy` produce un grupo por
  fila (34 grupos para 16 módulos, ids duplicados). Mi gate de coherencia inicial
  (`Roles.Select(ModuleId) == {16 módulos}`) falló por eso; corregido a verificación
  de presencia (`Contain(availableModuleIds)`). El invariante por caso (módulo/feature
  ausente tras desactivar) no cambió y pasa.
- Pendiente T4: commit work-unit + assessment RDD del commit. Push/PR: decisión del
  usuario.