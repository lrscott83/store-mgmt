# Plan — Revisar E2E backend: la expectativa se calibra contra la BD viva, no contra el seed

**Fecha:** 2026-09-24 · **Rama:** qa · **Estado:** **resuelto en BD locales 2026-09-25** (catálogo corregido, enum 44 añadido, E2E recalibrados); **pendiente:** confirmar estado del VPS.

## Resolución (2026-09-25) — el drift se corrigió y los E2E se recalibraron

El plan original se ejecutó el 2026-09-25 bajo el feature `e2e-drift-canary-helpers` (autorización explícita del usuario para producción + E2E existentes). Estado final:

1. **Backfill en BD locales** (idempotente, `ON CONFLICT DO NOTHING`, sobrevive a `dotnet test`):
   - `smca` (dev local): insertados módulos 15/16/17 + features 43/44/91/120/121 + filas `PlanModule` → `modules=17, features=42`.
   - `smca_test`: insertadas SOLO las features 33 y 91 → `modules=17, features=42`.
2. **Enum `StoreRoleFeatures`**: añadida la entrada `MultiPaymentsAdmin` (feature 44, módulo 16, roles OwnerAdmin+StoreUser) — commit `f9f5a899`. Antes el generador descartaba 44; ahora lo materializa para tiendas VIP.
3. **E2E recalibrados** (commit `41a039fc`): `PlanChangeMatrixTests` (Inventory +Egress 33, MultiPayments `[44]`, lectura DB filtrada por `RoleId == OwnerAdmin` para excluir 91 del universo del owner — 91 es SuperAdmin/ReSeller y **debe** seguir en la BD, ver nota abajo) y los 3 helpers `FeaturesForModule` re-incluyen 33. Resultado: filtered set `Failed: 0, Passed: 38, Total: 38` (9 matrix + 1 canary + 28 helpers); el canary `FeatureSeedCoherenceTests` pasa porque ya no hay drift seed↔BD.
4. **Nota sobre 91 (StorePayment)**: aunque el mapa del test no la lista (el owner no la recibe), 91 **sí** existe en la BD y el enum `StorePaymentAdmin` (SuperAdmin/ReSeller) la materializa para ReSeller/SuperAdmin — es el comportamiento correcto. El filtro `OwnerAdmin` de la lectura DB del matrix solo alinea la expectativa del test con lo que `/me` del owner ve; no elimina ni desactiva nada.

**Queda pendiente del plan original:** verificar el VPS (punto 2 de Acciones) — las BD locales ya no son la "BD rota" descrita abajo; el análisis histórico se conserva tal cual se verificó el 2026-09-24.

## Hallazgo (verificado 2026-09-24)

Los E2E de cambio de plan **no fallan** pese al drift de la BD de test porque su expectativa se calibra contra **la BD viva** (`smca_test`), no contra el seed de código ni el enum. Ambos lados (handler y mapa esperado) derivan de la misma realidad con drift → el test es una tautología respecto al drift.

Evidencia concreta:

1. `PlanChangeMatrixTests.cs:98–126` — el mapa estático `FeaturesByModule` fue escrito a mano para **mirror lo que `smca_test` expone**: Inventory sin Egress(33), Billing sin StorePayment(91), `MultiPayments = []` (línea 124, porque el enum no tiene entrada para 44). El comentario líneas 98–106 lo declara: *"AUTHORITATIVE SOURCE is the migrated DB (verified via SQL 2026-09-24), NOT the code enum/config"*.
2. `ChangeStorePlanCommand.cs:225,233` → `FeatureRepository.GetAvailableFeatureIdsByModuleIdsAsync` (`FeatureRepository.cs:25–30`) materializa features **solo desde la tabla `Feature` real** (`IsActive && AvailableToStore`): si la fila no existe, el feature id nunca llega al `StoreRoleFeatureGenerator` y jamás se materializa.
3. `StoreRoleFeatureGenerator.cs:19–21` — filtra por `StoreRoleFeatures` enum: el feature 44 existe en `smca_test` pero no tiene entrada, por eso se descarta.

## Drift conocido (comprobado 2026-09-24; estado tras resolución 2026-09-25)

| Feature/módulo | Seed de código | `smca_test` (hoy) | `smca` dev (hoy) | VPS (según reporte) |
|---|---|---|---|---|
| 33 Egress (mód 3) | definido | ✅ corregido (backfill) | ✅ presente | ⏳ pendiente confirmar |
| 91 StorePayment (mód 9) | definido | ✅ corregido (backfill) | ✅ corregido (backfill) | ⏳ pendiente confirmar |
| 44 MultiPayments (mód 16) | definido + enum 44 (f9f5a899) | ✅ presente | ✅ corregido (módulo + feature) | ⏳ pendiente confirmar |
| Módulos 15/16/17 | definidos | ✅ presentes | ✅ corregidos (tabla Module completa) | ⏳ pendiente confirmar |

## Por qué hay que arreglarlo

- Los tests **pin el drift como comportamiento esperado**: si `smca_test` se regenerara desde el seed completo (33/91 presentes) o el enum ganara entrada para MultiPayments(44), estos tests **fallarían** hasta actualizar el mapa estático.
- La suite E2E **no puede detectar** que la BD produzca menos de lo que el catálogo debería; valida el contrato de cambio de plan **contra el estado actual**, no contra el catálogo correcto.
- La BD de producción (VPS) parece estar en un estado de migración anterior (módulos 15/16/17 ausentes, 91 ausente): un cambio de plan a Superior/VIP en prod materializaría menos features de las anunciadas (riesgo distinto que la suite no detecta porque corre contra `smca_test`).

## Acciones pendientes (estado tras resolución 2026-09-25)

1. ~~Definir la **fuente autoritativa** del catálogo de features (seed/migraciones vs BD) y alinear las tres BD locales/test/VPS.~~ → **RESUELTO para BD locales** (2026-09-25): catálogo completo 17 módulos/42 features en `smca` y `smca_test`; el canary `FeatureSeedCoherenceTests` valida seed↔BD. La fuente autoritativa de cara a los E2E queda en la BD viva.
2. **Confirmar el estado real del VPS** con la consulta podman completa (módulos 1–17 + features por módulo). — **PENDIENTE** (requiere acceso/confirmación del usuario; si el VPS está en estado de migración anterior, aplicar el mismo backfill tras validar).
3. ~~Revisar **todos** los E2E del backend que calibren expectativas contra la BD viva (matriz de planes, `MeAfterOwnerPlanChangeTests`, `ToggleStorePlanTests`, `StoreModuleLifecycleTests`, etc.) y decidir cómo evolucionan al corregir el catálogo.~~ → **PARCIAL**: la matriz de planes y los 3 helpers (`AuthMePlanModulesTests`, `ExportOfflineRosterPlanTests`, `StorePlanChangeTests`) fueron recalibrados en `41a039fc`. Los demás archivos listados quedan por revisar si ejercitan features 33/91/44.
4. Cualquier cambio en E2E existentes o en backend de producción requiere **aprobación explícita del usuario** (reglas innegociables del repo).