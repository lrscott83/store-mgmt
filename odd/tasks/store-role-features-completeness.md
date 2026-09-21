# Feature: store-role-features-completeness (fix de producción autorizado)

Workflow: **ODD**. Rama: `qa`. Entrega: commits por unidad de trabajo; push/PR = decisión del usuario.

**Origen:** hallazgos de #5 (`odd/tasks/e2e-plan-gated-modules-gaps.md`), autorizados por el usuario
2026-09-20: *"debes adicionar los dos... Lo debes incluir también"*.

## Objetivo

1. **Completar el mapeo módulo→feature** en `Domain/Common/Enums/StoreRoleFeatures.cs`: hoy faltan
   WholesaleSales (módulo **12** → feature **39**) y MultiStores (módulo **14** → feature **38**),
   así que `AllowedFeaturesService` nunca resuelve 38/39 y `StoreRoleFeatureGenerator` los descarta →
   `FeatureIds` no puede contenerlos. **Todos los módulos/features deben estar presentes.**
2. **Incluir `StoreUser.IsActive`** en `StoreRoleFeatureRepository.GetStoreRoleFeaturesByUserIdAsync`
   (hoy filtra solo por `UserRole.IsActive`) → un store user inactivo no debe aparecer en `Roles` de
   `/me`. Sin romper el caso OwnerAdmin (que no tiene fila `StoreUser`).

## Restricciones

- **Aprobación explícita del usuario** para tocar producción backend: **concedida** (2026-09-20).
- No tocar tests E2E EXISTENTES; sí se pueden ajustar los tests NUEVOS de #5 (son propios).
- Los E2E corren contra `smca_test`; `WebAppFixture` aplica las migraciones solo.

## Tareas

- [ ] **P1** `StoreRoleFeatures.cs`: agregar `WholesaleSalesAdmin` (12/39) y `MultiStoresAdmin` (14/38)
  con los roles correctos (verificar contra el uso real de cada feature).
- [ ] **P2** `GetStoreRoleFeaturesByUserIdAsync`: exigir `StoreUser.IsActive` para el rol StoreUser,
  sin excluir OwnerAdmin.
- [ ] **P3** (si aplica por convención del repo) backfill de `StoreRoleFeature` 38/39 para tiendas
  existentes, espejo de `MultiMonedasModuleBackfill` + script VPS.
- [ ] **P4** Ajustar los tests nuevos de #5: E2-5 → `FeatureIds ⊇ {36,37,38,39}`; E1-6 → desactivar
  SOLO `StoreUser.IsActive` y probar que desaparece de `Roles`.
- [ ] **P5** `dotnet build` + suite E2E completa verde.
- [ ] **P6** Documentar el requisito (módulos/features completos) en `AGENTS.md` y en Engram.

## Verificación

- `dotnet build` limpio; suite E2E completa verde (sin tocar tests existentes).
