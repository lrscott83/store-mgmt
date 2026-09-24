# Plan — Revisar E2E backend: la expectativa se calibra contra la BD viva, no contra el seed

**Fecha:** 2026-09-24 · **Rama:** qa · **Estado:** pendiente de ejecución — anotado para retomar después de un trabajo más importante en curso.

## Hallazgo (verificado 2026-09-24)

Los E2E de cambio de plan **no fallan** pese al drift de la BD de test porque su expectativa se calibra contra **la BD viva** (`smca_test`), no contra el seed de código ni el enum. Ambos lados (handler y mapa esperado) derivan de la misma realidad con drift → el test es una tautología respecto al drift.

Evidencia concreta:

1. `PlanChangeMatrixTests.cs:98–126` — el mapa estático `FeaturesByModule` fue escrito a mano para **mirror lo que `smca_test` expone**: Inventory sin Egress(33), Billing sin StorePayment(91), `MultiPayments = []` (línea 124, porque el enum no tiene entrada para 44). El comentario líneas 98–106 lo declara: *"AUTHORITATIVE SOURCE is the migrated DB (verified via SQL 2026-09-24), NOT the code enum/config"*.
2. `ChangeStorePlanCommand.cs:225,233` → `FeatureRepository.GetAvailableFeatureIdsByModuleIdsAsync` (`FeatureRepository.cs:25–30`) materializa features **solo desde la tabla `Feature` real** (`IsActive && AvailableToStore`): si la fila no existe, el feature id nunca llega al `StoreRoleFeatureGenerator` y jamás se materializa.
3. `StoreRoleFeatureGenerator.cs:19–21` — filtra por `StoreRoleFeatures` enum: el feature 44 existe en `smca_test` pero no tiene entrada, por eso se descarta.

## Drift conocido (ya comprobado, sin análisis nuevo)

| Feature/módulo | Seed de código | `smca_test` | `smca` (dev) / VPS (según reporte) |
|---|---|---|---|
| 33 Egress (mód 3) | definido | ❌ ausente | ✅ presente |
| 91 StorePayment (mód 9) | definido | ❌ ausente | ❌ ausente |
| 44 MultiPayments (mód 16) | definido | ✅ presente | ❌ módulo ausente |
| Módulos 15/16/17 | definidos | ✅ presentes | ❌ ausentes (tabla Module solo 1–14) |

## Por qué hay que arreglarlo

- Los tests **pin el drift como comportamiento esperado**: si `smca_test` se regenerara desde el seed completo (33/91 presentes) o el enum ganara entrada para MultiPayments(44), estos tests **fallarían** hasta actualizar el mapa estático.
- La suite E2E **no puede detectar** que la BD produzca menos de lo que el catálogo debería; valida el contrato de cambio de plan **contra el estado actual**, no contra el catálogo correcto.
- La BD de producción (VPS) parece estar en un estado de migración anterior (módulos 15/16/17 ausentes, 91 ausente): un cambio de plan a Superior/VIP en prod materializaría menos features de las anunciadas (riesgo distinto que la suite no detecta porque corre contra `smca_test`).

## Acciones pendientes (a retomar)

1. Definir la **fuente autoritativa** del catálogo de features (seed/migraciones vs BD) y alinear las tres BD locales/test/VPS.
2. Confirmar el estado real del VPS con la consulta podman completa (módulos 1–17 + features por módulo).
3. Revisar **todos** los E2E del backend que calibren expectativas contra la BD viva (matriz de planes, `MeAfterOwnerPlanChangeTests`, `ToggleStorePlanTests`, `StoreModuleLifecycleTests`, etc.) y decidir cómo evolucionan al corregir el catálogo.
4. Cualquier cambio en E2E existentes o en backend de producción requiere **aprobación explícita del usuario** (reglas innegociables del repo).