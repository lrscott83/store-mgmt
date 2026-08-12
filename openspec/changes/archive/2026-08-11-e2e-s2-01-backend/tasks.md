# Tasks: e2e-s2-01-backend — Cerrar hueco E2E de S2-01 (módulos + StoreRoleFeature)

## Execution constraint (binding)

ADD-only estricto: solo se CREA `backend/src/SMCA.WebApi.E2ETests/Stores/StoreModuleLifecycleTests.cs` y se MODIFICAN `docs/testing/e2e-stage-1/S2-01.md` y `S2-01-backend.md`. Cero cambios a producción o tests existentes. Si una tarea revela que hace falta tocarlos → PARAR y reportar REQUIERE-AUTORIZACIÓN. Sin PR: entrega en commits a `feat/e2e-s2-01-backend`. Strict-TDD N/A: no hay producción; los tests E2E son el entregable.

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

| Field | Value |
|-------|-------|
| Estimated changed lines | ~260 (tests ~220; docs ~+25/−15) |
| 400-line budget risk | Low |
| Chained PRs recommended | No — entrega decidida por el usuario: commits, sin PR |
| Suggested split | 2 commits (tests, docs) — sin PR |

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| WU1 | Fichero de tests nuevo | n/a (commit 1) | `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~StoreModuleLifecycle"` | Real Postgres local `localhost:5432` db `smca_test` (`WebAppFixture`) | `git revert` del commit; fichero nuevo, sin impacto en suite existente |
| WU2 | Sync docs | n/a (commit 2) | n/a — verificación por lectura de refs | n/a — docs sin runtime | Revert independiente del commit de docs |

## Phase 1: Scaffolding + tests GET (R1, R2)

- [x] 1.1 Crear `backend/src/SMCA.WebApi.E2ETests/Stores/StoreModuleLifecycleTests.cs`: `[Collection("e2e")]`, ctor `WebAppFixture`, `_f = fixture.Factory` (patrón `StoreUpdateTests.cs:12-27`). Helpers: `Body(Guid, string, IEnumerable<int>)` (`StoreUpdateTests.cs:23`), `SeedInactiveStoreModuleAsync` (D1: `Create`+`IsActive=false`+`Add`), `GetStoreModuleIdsAsync`/`GetStoreRoleFeaturesAsync` (todas con `.IgnoreQueryFilters()`), `ComputeExpectedSrfAsync` (D4; `using Domain.Common.Extensions`).
- [x] 1.2 R1 `Get_returns_only_active_modules_when_inactive_module_seeded`: SuperAdmin (`DbTestHelpers.SeedSuperAdminAsync`+`AuthedClient`); `StoreSeed.SeedStoreAsync(approved, [7])` + módulo 6 inactivo sembrado (Added); GET `/api/v1/stores/{id}`; assert 200, `Modules` con 7 y sin 6; cleanup `try/finally` (`CleanupStoreFixtureAsync`+`CleanupUserAsync`).
- [x] 1.3 R2 `Get_returns_catalog_module_ids`: `BillingSeed.SeedPaidStoreAsync` (7+6); DB read `StoreModule` con `.IgnoreQueryFilters()`; GET; assert 200 y `Modules[].Id` set-equals DB `ModuleId` set (D2); cleanup `BillingSeed.CleanupAsync`.

## Phase 2: Tests PUT (R3, R4)

- [x] 2.1 R3 `Put_removing_module_deactivates_its_store_role_features`: `StoreSeed.SeedStoreAsync([7,6])`; sembrar SRF activa (role `OwnerAdmin`, feature real 60 módulo 6 — D3) verificada con `.IgnoreQueryFilters()`; PUT `moduleIds:[7]`; assert 200; DB: `StoreModule(6).IsActive==false` ∧ SRF(60).`IsActive==false`; cleanup.
- [x] 2.2 R4 `Put_adding_module_generates_store_role_features`: `BillingSeed.SeedFreeStoreAsync` (módulo 7); PUT `moduleIds:[7,6]`; assert 200; DB con `.IgnoreQueryFilters()`: SRF nuevas set-equals `ComputeExpectedSrfAsync([6])` (enum `StoreRoleFeatures`+`GetRoles()`, features `IsActive && AvailableToStore`), todas `IsActive==true`; NO assert `PaymentStartDate`; cleanup `BillingSeed.CleanupAsync`.

## Phase 3: Docs sync

- [x] 3.1 `docs/testing/e2e-stage-1/S2-01.md`: en aserciones .NET (líneas 72, 73, 76, 77 — R1–R4) añadir ref al fichero nuevo (checkbox queda `[x]`, ahora veraz); en "Estado de cobertura" (línea 82) añadir `Stores/StoreModuleLifecycleTests.cs`. `README.md` sin cambios (D6).
- [x] 3.2 `docs/testing/e2e-stage-1/S2-01-backend.md`: resolver el plan — banner "Trabajo diferido" → "Resuelto por e2e-s2-01-backend", y en "Qué hacer" mapear aserciones 1–4 → tests del fichero nuevo.

## Phase 4: Verification

- [x] 4.1 Compilar: `dotnet build backend/src/SMCA.sln`.
- [x] 4.2 Correr suite nueva (requiere Postgres `localhost:5432` db `smca_test`; `WebAppFixture` aplica migraciones): `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~StoreModuleLifecycle"`. Si apply no puede correrlo, dejar el comando documentado para el usuario.
- [x] 4.3 ADD-only: `git diff --stat` muestra solo fichero nuevo + 2 docs; sin cambios a producción/tests existentes.
- [x] 4.4 Commits convencionales (sin PR): `test(e2e): ...` (WU1) y `docs(testing): ...` (WU2).
