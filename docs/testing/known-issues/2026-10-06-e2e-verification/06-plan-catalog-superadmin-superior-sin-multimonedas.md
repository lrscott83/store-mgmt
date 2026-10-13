# 6. plan-catalog-superadmin.spec.ts:59 — el popup de planes no muestra "Múltiples monedas" en Superior (PCF2)

## Qué prueba el test

`plan-catalog-superadmin.spec.ts:59:7` — *"PCF2 — Superior lists 'Múltiples monedas' and
'Elaboración'; VIP lists its exclusive 'Múltiples pagos'"*. Abre el popup de cambio de plan de una
tienda (SuperAdmin) y verifica que el panel de **Superior** lista **"Múltiples monedas"** y
**"Elaboración"**, y que el de **VIP** lista su exclusivo **"Múltiples pagos"**.

En negocio: el catálogo de planes que ve el SuperAdmin tiene que reflejar qué módulos trae cada plan.

## Qué falla (en simple)

```
Error: expect(locator).toBeVisible() failed
Locator: locator('[data-testid^="owner-store-plan-modal-"]').getByText('Múltiples monedas')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

  64 |     // Superior delta vs Pago: Warehouses, MultiStores, MultiMonedas, Elaboración…
  65 |     await modal.getByRole('button', { name: /^Superior/ }).click();
> 66 |     await expect(modal.getByText('Múltiples monedas')).toBeVisible();
```

Al seleccionar **Superior**, el texto "Múltiples monedas" **no aparece** en el popup.

## Evidencia

- Corrida completa del **2026-10-13** (`pnpm test:e2e --workers=4`): 304 passed / 17 failed / 12 flaky;
  este test entre los fallidos.
- **Reproducido en aislamiento** el 2026-10-13 (`--workers=2 --retries=0`): 11 passed / **3 failed** —
  este es uno. **Sin reintentos** → determinista, no carga.
- Snapshot: `test-results\plan-catalog-superadmin-…-chromium\error-context.md`.

## Causa raíz — NO CONFIRMADA

**Hechos:** tras pulsar "Superior", el popup no contiene el texto "Múltiples monedas" (módulo 15
MultiMonedas). El test llega hasta la aserción (el popup abre y el botón "Superior" existe).

**Hipótesis por confirmar/descartar:**
- (a) el catálogo de planes cambió y **Superior ya no incluye el módulo 15** (o su etiqueta cambió);
- (b) el popup pinta los módulos por otra vía (delta calculado en cliente) y el seed/estado del plan
  difiere del que asume el test;
- (c) la etiqueta visible ya no es exactamente "Múltiples monedas".

Falta inspeccionar el componente del popup de planes y el seed del catálogo (`StorePlanCatalogTests`
pinea la matriz de planes según el propio comentario del spec).

## Clasificación

Por confirmar: **defecto de la app** (si el plan perdió el módulo que debía tener) **o defecto del
test** (si la etiqueta/lista cambió a propósito). Se decide con la inspección.

## Propuesta de solución — NO APLICADA

Inspeccionar el popup de planes y la matriz `StorePlanModule` del seed. Si Superior debe traer el
módulo 15, corregir el catálogo/seed; si la etiqueta o la composición cambiaron, alinear el spec.
Ambas requieren **autorización 1 a 1**.

## Aplicación y verificación

No aplicada.

## Estado final

🔴 **Abierto** — 2026-10-13.
