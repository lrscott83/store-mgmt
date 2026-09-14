# Plan — Paneles de plan: listar solo los módulos adicionales (delta) en los planes de pago

- **Fecha:** 2026-09-14
- **Ámbito:** Solo frontend React (`web-store-pos`). **Cero cambios de backend.**
- **Estado:** Implementado con TDD.

## 1. Objetivo

En los paneles de planes (popup "Editar el plan" de Mis tiendas **y** la página de plan de la tienda — comparten el componente `plan-panels.tsx`), los planes de pago **no deben repetir los módulos del plan anterior**. Cada panel de pago muestra el texto *"Incluye todo lo del plan {nombre_plan_anterior} y además:"* y debajo **solo sus módulos adicionales**.

Ejemplo con el catálogo real (acumulativo):

| Plan | Lista del backend (acumulativa) | Lo que se muestra |
|---|---|---|
| Gratis | Ventas, Inventario, Sincronización, Reportes, Gestión | Todos (texto "Incluye:") |
| Pago | (los 5 de Gratis) + Estadísticas, Ventas Mayoristas, Gastos, Facturación, Historiales, Créditos | Solo Estadísticas, Ventas Mayoristas, Gastos, Facturación, Historiales, Créditos |
| Superior | (los 11 de Pago) + Almacenes, MultiStores | Solo Almacenes, MultiStores |

## 2. Causa raíz (verificada en código)

- `plan-panels.tsx` renderiza `plan.modules` **completo**; el backend siembra las listas de forma **acumulativa** (`StorePlanModuleEntityTypeConfiguration.cs`).
- El texto acumulativo ya existía (`STORES.PLAN.INCLUDES_PREVIOUS_PLAN`) y el predecesor ya se calculaba por `Order` del catálogo (AD8), pero:
  1. No se filtraban módulos → la lista repetía los del plan anterior bajo un texto que dice "y además".
  2. El panel **activo** mostraba "Incluye:" con la lista completa acumulativa → engañoso (los módulos repetidos que motivó este cambio aparecían justo ahí).

## 3. Decisiones de diseño

- **D1 — Delta por `moduleId` vs predecesor por `Order`:** el predecesor de un plan es el plan del catálogo con mayor `order` menor al suyo (cadena Superior → Pago → Gratis, misma lógica AD8). Delta = `plan.modules` menos los `moduleId` presentes en el predecesor. Plan sin predecesor (Gratis / dato raro): lista completa (fallback defensivo).
- **D2 — El texto acumulativo aplica también al panel activo:** "Incluye todo lo del plan X y además:" en **todo** panel de pago (activo o no); "Incluye:" solo en Gratis. Sustituye la decisión vieja AD8 que mantenía "Incluye:" en el panel activo.
- **D3 — Precios intactos:** el total del header (y el tachado rojo si hay descuento) sigue siendo la **suma de TODOS los módulos** del plan; solo cambia la lista debajo del texto.
- **D4 — Sin cambios de backend ni E2E nuevo:** es un delta de presentación cubierto por tests de componente/página. Los specs E2E existentes (`store-plan-activation`, `owner-stores`, `owner-plan-change-dialog`) fijan headers, badge, texto y botón — ninguno fija la lista de módulos; quedan intactos y en verde.

## 4. Cambios

### 4.1 Código (1 archivo)

**`app/management/stores/components/plan-panels.tsx`:**
- Nuevo helper `deltaModules(target)`: excluye los `moduleId` del plan predecesor (por `Order`); sin predecesor → `target.modules` completo.
- El cuerpo de cada panel renderiza `deltaModules(plan)`.
- Regla de texto: `planType === 'Gratis' || !predecessor` → "Incluye:"; si no → "Incluye todo lo del plan {predecesor} y además:" (ya no depende de `isActive`).

### 4.2 Tests (TDD — rojo primero)

- **`plan-panels.test.tsx`** (reescrito): catálogo acumulativo explícito (Gratis [Ventas], Pago [Ventas, Reportes], Superior [Ventas, Reportes, Créditos], con `order` 1/2/3). Suite nueva DELTA-1 (Pago lista Reportes y NO Ventas; Superior lista Créditos y NO Ventas/Reportes; panel activo Pago aplica el mismo filtrado; Gratis lista todo; header mantiene el total completo) y DELTA-2 (texto acumulativo en todo panel de pago, incluido el activo; "Incluye:" solo en Gratis). Se preservan las suites existentes (badge, Activar Plan, tooltips, error inline) adaptadas al catálogo nuevo.
- **`store-plan.test.tsx`**: catálogo a forma acumulativa con `order` explícito (el factory `makePlan` tiene `order: 1` por defecto — sin `order` explícito no existe predecesor y el delta degrada a lista completa). Aserción de página nueva: tienda en Pago → el panel activo muestra "Module A" y **no** "Free Module".
- **`my-stores.test.tsx`**: `order` explícito en su catálogo + aserción de popup con el mismo filtrado.

## 5. Verificación

1. Tests targeted de los 3 ficheros en verde.
2. Suite completa del frontend (`vitest run`) + typecheck + lint, todo verde.

## 6. Fuera de alcance

- Backend (ya envía listas acumulativas por diseño).
- Cambio de precios, tooltips "?" y flujo de activación (no se tocan).
