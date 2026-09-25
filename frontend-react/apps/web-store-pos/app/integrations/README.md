# Integración — lógica de negocio sin navegador ni E2E

> Tests de integración que prueban la **lógica de negocio usando solo servicios y repositorios**
> (y el dominio): sin render, sin navegador y sin E2E.
>
> **Regla del proyecto:** los tests E2E existentes no se tocan sin autorización explícita del usuario.

## Por qué existe esta carpeta

Del análisis de `docs/testing/known-issues/` (2026-09-24) se clasificó cada hallazgo según si su
afirmación **de negocio** puede probarse sin navegador. Aquí van las que sí, completas.

## Clasificación de las 10 entradas

| Entrada (`docs/testing/known-issues/`) | Clasificación | Dónde vive |
|---|---|---|
| `group-anotados/multipayments-t10-2.md` | ✅ **Total** | entrada movida a `docs/testing/known-issues/integrations/`; test implementado en **esta carpeta** |
| `group-a/valid-session-navigation-6.md` | ⚠️ Parcial | sigue como known-issue |
| `known-issues.md` #1 — `valid-session-navigation` 12 | ⚠️ Parcial | sigue como known-issue |
| `group-anotados/valid-session-navigation-10.md` | ⚠️ Parcial | sigue como known-issue |
| `group-anotados/valid-session-navigation-11.md` | ⚠️ Parcial | sigue como known-issue |
| `group-c/wholesale-cart-floor.md` | ⚠️ Parcial | sigue como known-issue |
| `group-d/configurations-fc-b2.md` | ⚠️ Parcial | sigue como known-issue |
| `group-b/owner-plan-change-dialog.md` | ❌ No | sigue como known-issue |
| `group-b/store-plan-lock-regression.md` | ❌ No | sigue como known-issue |
| `group-e/auth-me-setups.md` | ➖ Sin acción | sigue como known-issue |
| `group-e/plan-catalog-superadmin.md` | ➖ Sin acción | sigue como known-issue |

## ✅ Total — `multipayments` T10.2

Afirmación: *con el módulo de multipagos activo, pagar una venta en dos partes por canales
distintos recalcula bien el total y el vuelto, y no deja registrar una venta pagada de menos.*

Toda la afirmación es lógica:

- `settleMultiPayments` convierte cada fila con el dominio (`convertPaymentAmount`), talla con
  `summarizePayments` y devuelve `remainingCents` (0 = cubierta) y `firstError` (nunca un 0
  silencioso);
- las tasas salen del registro real `ChannelRateOfflineService` (misma clave y misma cascada que
  la app);
- el guard del submit (`cart-shell.tsx`) bloquea con **ese mismo resultado**
  (`firstError !== null || remainingCents > 0`), así que probarlo es probar el bloqueo.

Archivo: `multi-payment-two-channels.integration.test.ts` (5 casos: registro ida y vuelta, dos
canales que cubren el total, recálculo del vuelto, bloqueo por subpago con su borde, y fila
inconvertible que bloquea aunque las demás cubran).

Lo que **no** se prueba aquí, y por eso el E2E `multipayments` no se toca: que el popup
"Agregar pago" abra, que el router navegue y que la venta se registre contra el backend real.

## ⚠️ Parcial — lo que queda por probar es visual

| Entrada | Qué aserta visualmente |
|---|---|
| `valid-session-navigation` 6 y 12 | Que tras recargar sin la llave, el **menú de usuario siga visible** en la pantalla de inicio. La decisión pura (redirigir a `/login?unlock=1` **sin** cerrar sesión) ya está pineada en `auth/routes/__tests__/loaders.test.ts`. |
| `valid-session-navigation` 10 y 11 | Que el navegador **te devuelva a tu inicio** al escribir `/login` o `/register`. La regla pura (`guestOnlyLoader` redirige al home del usuario autenticado) ya está pineada en el mismo archivo. |
| `wholesale-cart-floor` | Que al bajar del mínimo **la línea desaparezca del carrito** y que la fila muestre el precio del rango nuevo ("Paquetes: 11 · Precio: $144"). Los predicados puros (`getWholesaleMinPacks`, `wholesaleTierUnitPrice`) ya están probados en `sales/lib/__tests__/wholesale.test.ts`; la decisión de eliminar vive en el componente del carrito. |
| `configurations` FC-B2 | Que el desplegable **"Tienda activa" liste las tiendas** con su nombre. El listado se asierta sobre el desplegable ya renderizado (jsdom). |

## ❌ No — Grupo B (fechas del plan)

`owner-plan-change-dialog` y `store-plan-lock-regression` prueban que el cambio de plan se hace por
el camino correcto y que **la fecha ancla del plan queda intacta**. Esa fecha la decide el backend:
desde el frontend solo se ve lo que devuelve HTTP, que aquí está bloqueado por diseño
(`vitest.setup.ts` → `block-real-http`). Candidato natural a un test de integración de **backend**.

## ➖ Sin acción — Grupo E

`auth-me-*` (setups) y `plan-catalog-superadmin` (PCF2) pasan en solitario; eran timeouts por carga
de la suite completa. No hay nada que probar aquí.
