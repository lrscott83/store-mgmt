# Etapa 3 — Plan general: Módulo de Inventario

> Documento de **especificación de pruebas**, no de implementación.
>
> **Regla del proyecto (`CLAUDE.md`, innegociable)**: *"Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."*

## 1. Alcance

La Etapa 3 cubre **las pantallas del módulo de Inventario** que operan contra `localStorage` (offline-first). El módulo tiene 6 pantallas:

| Pantalla | Ruta | Tipo |
|---|---|---|
| Disponible | `/inventory/available` | Read-only (consulta de stock) |
| Entradas del día | `/inventory/today-entries` | CRUD (crear/editar/eliminar entradas) |
| Cantidades del día | `/inventory/today-quantities` | Read-only (resumen de cantidades) |
| Ganancias del día | `/inventory/today-sales-profit` | Read-only (cálculo de ganancia) |
| Salida | `/inventory/egress` | CRUD (venta Mayorista) |
| Entradas | `/inventory/entries` | Read-only (historial agrupado por día) |

### Diferencia con Etapa 2

La Etapa 2 ya cubrió tests básicos de inventario (crear entrada, egreso, smoke tests). La Etapa 3 **profundiza** en:
- **Editar y eliminar entradas** de inventario
- **Verificar cantidades** después de crear entradas y ventas
- **Verificar ganancia** después de crear entradas con costo y ventas
- **Historial de entradas** agrupado por día
- **Venta Mayorista** completa (crear orden con tipo Mayorista)

---

## 2. Bloques de User Stories

### Bloque A — Disponible (consulta de stock)

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S3-A1](S3-A1.md) | Ver stock por categoría | ALTA | Expandir categoría, verificar cantidades de productos |
| [S3-A2](S3-A2.md) | Stock refleja entradas y ventas | ALTA | Crear entrada + venta, verificar stock descontado |

### Bloque B — Entradas del día (CRUD)

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S3-B1](S3-B1.md) | Editar entrada existente | ALTA | Cambiar cantidad y costo de una entrada |
| [S3-B2](S3-B2.md) | Eliminar entrada | ALTA | Soft-delete de una entrada con confirmación |
| [S3-B3](S3-B3.md) | Entradas persisten tras recargar | MEDIA | Verificar localStorage después de reload |

### Bloque C — Cantidades del día

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S3-C1](S3-C1.md) | Resumen muestra cantidades correctas | ALTA | Crear entrada + venta, verificarBeginning/Entries/Available/Sold/Ending |
| [S3-C2](S3-C2.md) | Sin productos muestra empty state | MEDIA | Página sin entradas ni ventas |

### Bloque D — Ganancias del día

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S3-D1](S3-D1.md) | Ganancia refleja costo vs precio de venta | ALTA | Crear entrada con costo + venta, verificar profit |
| [S3-D2](S3-D2.md) | Sin ventas muestra empty state | MEDIA | Página sin ventas |

### Bloque E — Salida (Venta Mayorista)

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S3-E1](S3-E1.md) | Crear venta Mayorista | ALTA | Venta con orderType=Mayorista, verificar en Ventas del día |
| [S3-E2](S3-E2.md) | Selector de tipo de orden funciona | MEDIA | Cambiar entre Normal/Mayorista/etc |

### Bloque F — Entradas (Historial)

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S3-F1](S3-F1.md) | Historial muestra entradas agrupadas por día | ALTA | Crear entradas, verificar agrupación por fecha |
| [S3-F2](S3-F2.md) | Expandir panel de día muestra entradas | MEDIA | Click en día muestra las entradas de ese día |

---

## 3. Prioridad de implementación

### 🔴 ALTA (8 items) — Implementar primero

| # | US | Esfuerzo | Descripción |
|---|---|---|---|
| 1 | S3-B1 | Bajo | Editar entrada (abrir modal, cambiar cantidad, guardar) |
| 2 | S3-B2 | Bajo | Eliminar entrada (confirmar → entrada desaparece) |
| 3 | S3-A1 | Bajo | Ver stock por categoría (expandir, verificar cantidades) |
| 4 | S3-C1 | Medio | Verificar cantidades del día (requiere crear datos primero) |
| 5 | S3-D1 | Medio | Verificar ganancia (requiere entrada con costo + venta) |
| 6 | S3-E1 | Medio | Crear venta Mayorista completa |
| 7 | S3-F1 | Bajo | Historial de entradas agrupadas por día |
| 8 | S3-A2 | Medio | Stock refleja entradas y ventas (flujo completo) |

### 🟡 MEDIA (4 items) — Implementar después

| # | US | Esfuerzo | Descripción |
|---|---|---|---|
| 9 | S3-B3 | Bajo | Persistencia de entradas tras recargar |
| 10 | S3-C2 | Bajo | Empty state de cantidades |
| 11 | S3-D2 | Bajo | Empty state de ganancias |
| 12 | S3-E2 | Bajo | Selector de tipo de orden |
| 13 | S3-F2 | Baso | Expandir panel de día en historial |

---

## 4. Enfoque de testing

### Playwright (E2E) — la capa principal

La Etapa 3 se prueba con **Playwright** para flujos de UI completos:

1. **CRUD de entradas**: crear → editar → eliminar → verificar cantidades
2. **Flujo completo**: entrada → venta → verificar stock/ganancia
3. **Venta Mayorista**: crear orden con tipo Mayorista
4. **Historial**: verificar agrupación por día

### vitest — complementario

Los tests unitarios de servicios offline ya existen (`inventory-offline-service.test.ts`, `profit-calculator.test.ts`). La Etapa 3 NO requiere nuevos vitest.

### Backend .NET — N/A

El módulo de inventario es 100% offline (localStorage).

---

## 5. Convenciones

### Datos de prueba

Los tests crean datos inline (entradas, ventas) usando `page.evaluate` para modificar localStorage, o navegando por la UI para crear datos reales.

### Patrón de flujo completo

Para tests que requieren datos previos (cantidades, ganancia), el patrón es:
1. Crear entrada de inventario (cantidad + costo)
2. Crear venta del producto
3. Navegar a la pantalla de lectura
4. Verificar los cálculos

### Estado de cobertura

- **CUBIERTO** — test E2E existe y pasa
- **PENDIENTE** — no existe test
