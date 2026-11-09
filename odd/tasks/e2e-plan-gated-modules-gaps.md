# Feature: e2e-plan-gated-modules-gaps (filas faltantes de la matriz E1/E2)

Workflow: **ODD**. Rama: `qa`. Entrega: commits por unidad de trabajo; push/PR = decisión del usuario.

**Plan fuente:** `docs/plans/2026-09-08-e2e-plan-gated-modules-auth-roster.md` (matriz E1/E2).
**Índice:** `docs/plans/plan-resumen.md` → P1 #6.

## Objetivo

Agregar las 3 filas que la matriz del plan declara y hoy no existen en la suite E2E:
- **E1-6** `Me_inactive_storeuser_not_in_roles` — un StoreUser inactivo no aparece en `Roles`.
- **E1-7** `Me_superuser_sees_full_module_list` — SuperAdmin con `SelectedStoreId` en un store con
  todos los módulos: `StoreModuleIds == todos los AvailableToStore`.
- **E2-5** `Roster_warehouse_wholesale_multistores_in_paid_roster` — paid store con módulos 12/13/14
  activos: `StoreModuleIds ⊇ {12,13,14}` y `FeatureIds ⊇ {38,39}` (+ 36/37).

## Restricciones (AGENTS.md — NO-NEGOCIABLE)

- **Solo agregar tests E2E NUEVOS.** No modificar, borrar, renombrar, saltar ni "arreglar" tests E2E
  existentes (`backend/src/SMCA.WebApi.E2ETests/**`) ni sus support files
  (`Infrastructure/*.cs`, `*Seed.cs`) → por eso los tests van en **archivos nuevos** (convención
  `*GapTests.cs` ya presente en el repo).
- **Sin tocar código de producción backend.**
- Reusar helpers existentes (`DbTestHelpers`, `BillingSeed`, `StoreSeed`, `WebAppFixture`, `TestDtos`).
  Si hace falta un seed nuevo, definirlo **local** en el archivo nuevo.
- Si un E2E existente falla, **parar y preguntar** (es información, no un obstáculo).

## Tareas

> **Reconciliado 2026-11-03:** G1-G3 estaban hechos y sin marcar. G4 (la corrida) se deja abierta a
> propósito: no se repitió en esta reconciliación.

- [x] **G1** Verificar por búsqueda que E1-6/E1-7/E2-5 no existen ya (evitar duplicados). **HECHO**:
  los tres viven hoy en los dos archivos nuevos de G2/G3; no hay homónimos en la suite.
- [x] **G2** Nuevo `Auth/AuthMePlanModulesGapTests.cs` con E1-6 y E1-7. **HECHO**:
  `Me_inactive_storeuser_not_in_roles` y `Me_superuser_sees_full_module_list` presentes.
- [x] **G3** Nuevo `Users/ExportOfflineRosterPlanGapTests.cs` con E2-5. **HECHO**:
  `Roster_warehouse_wholesale_multistores_in_paid_roster` presente.
- [ ] **G4** `dotnet build backend/src/SMCA.sln` + `dotnet test` de los tests nuevos (PostgreSQL
  `smca_test` en localhost:5432, disponible). **Pendiente**: los 3 tests existen en el proyecto; la
  corrida no se repitió el 2026-11-03. Ejecutarla cuando el backend E2E esté levantado.

## Verificación

- `dotnet build` limpio; los 3 tests nuevos verdes; suite existente intacta.
