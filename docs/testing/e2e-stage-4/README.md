# Etapa 4 — Plan general: Gastos, Sincronización, Reportes, Estadísticas

> Documento de **especificación de pruebas**, no de implementación.
>
> **Regla del proyecto (`CLAUDE.md`, innegociable)**: *"Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."*

## 1. Alcance

La Etapa 4 cubre **4 módulos** que ya tienen cobertura básica de Etapa 2 pero necesitan pruebas más profundas:

| Módulo | Pantallas | Cubierto en Etapa 2 |
|---|---|---|
| **GASTOS** | Gastos del día, Gastos (historial) | `register-expense.spec.ts` (create + validation + offline), `read-only-screens.spec.ts` (history loads) |
| **SINCRONIZACIÓN** | Exportar, Importar | `data-export.spec.ts` (ZIP download + validation), `data-import.spec.ts` (round-trip + validation) |
| **REPORTES** | Reportes del día | `daily-report.spec.ts` (header + panels) |
| **ESTADÍSTICAS** | Panel de Control | `read-only-screens.spec.ts` (page loads) |

### Qué falta por probar

| Módulo | Gap | Prioridad |
|---|---|---|
| GASTOS | Editar gasto existente | ALTA |
| GASTOS | Eliminar gasto con confirmación | ALTA |
| GASTOS | Historial de gastos agrupado por día | MEDIA |
| SINCRONIZACIÓN | Export → Import round-trip completo (datos sobreviven) | ALTA |
| REPORTES | Verificar que los datos del reporte son consistentes con las pantallas individuales | MEDIA |
| ESTADÍSTICAS | Verificar métricas del dashboard (ventas, gastos, ganancia) | MEDIA |

---

## 2. Bloques de User Stories

### Bloque A — Gastos (editar/eliminar)

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S4-A1](S4-A1.md) | Editar gasto existente | ALTA | Cambiar tipo, monto y nota de un gasto |
| [S4-A2](S4-A2.md) | Eliminar gasto | ALTA | Soft-delete con confirmación |
| [S4-A3](S4-A3.md) | Historial de gastos agrupado | MEDIA | Verificar agrupación por día en historial |

### Bloque B — Sincronización (round-trip)

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S4-B1](S4-B1.md) | Export → Import round-trip | ALTA | Exportar datos, importar en contexto limpio, verificar integridad |

### Bloque C — Reportes (consistencia)

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S4-C1](S4-C1.md) | Datos del reporte consistentes | MEDIA | Verificar que totales del reporte coinciden con pantallas individuales |

### Bloque D — Estadísticas (dashboard)

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S4-D1](S4-D1.md) | Dashboard muestra métricas | MEDIA | Verificar que Panel de Control muestra ventas, gastos, ganancia |

---

## 3. Prioridad de implementación

### 🔴 ALTA (3 items)

| # | US | Esfuerzo | Descripción |
|---|---|---|---|
| 1 | S4-A1 | Bajo | Editar gasto (abrir modal, cambiar monto, guardar) |
| 2 | S4-A2 | Bajo | Eliminar gasto (confirmar → desaparece) |
| 3 | S4-B1 | Medio | Round-trip export→import con verificación de datos |

### 🟡 MEDIA (3 items)

| # | US | Esfuerzo | Descripción |
|---|---|---|---|
| 4 | S4-A3 | Bajo | Historial de gastos agrupado por día |
| 5 | S4-C1 | Medio | Verificar consistencia de datos del reporte |
| 6 | S4-D1 | Bajo | Dashboard muestra métricas correctas |

---

## 4. Estado de cobertura existente

### Lo que YA existe (Etapa 2)

| Spec | Cubre |
|---|---|
| `register-expense.spec.ts` | Crear gasto + validación + offline |
| `read-only-screens.spec.ts` | Historial de gastos carga, Dashboard carga |
| `data-export.spec.ts` | Export ZIP + validación + offline |
| `data-import.spec.ts` | Import round-trip + validación + offline |
| `daily-report.spec.ts` | Header + paneles expandibles |

### Lo que falta (Etapa 4)

| Gap | Spec nuevo |
|---|---|
| Editar gasto | `edit-delete-expense.spec.ts` |
| Eliminar gasto | `edit-delete-expense.spec.ts` |
| Historial agrupado | `expenses-history.spec.ts` |
| Round-trip export→import | `sync-roundtrip.spec.ts` |
| Consistencia reporte | `report-consistency.spec.ts` |
| Dashboard métricas | `dashboard-metrics.spec.ts` |
