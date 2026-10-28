# 6. plan-catalog-superadmin.spec.ts:59 — el clic sobre el panel de plan ya activo lo COLAPSABA (acordeón de estado único)

## Qué prueba el test

`plan-catalog-superadmin.spec.ts:59:7` — *"PCF2 — Superior lists 'Múltiples monedas' and 'Elaboración';
VIP lists its exclusive 'Múltiples pagos'"*. Abre el popup de cambio de plan (SuperAdmin) y verifica que
el panel de **Superior** lista "Múltiples monedas" y "Elaboración", y el de **VIP** su exclusivo
"Múltiples pagos".

## Qué fallaba

```
Error: expect(locator).toBeVisible() failed
Locator: locator('[data-testid^="owner-store-plan-modal-"]').getByText('Múltiples monedas')
Error: element(s) not found
> 66 |     await expect(modal.getByText('Múltiples monedas')).toBeVisible();
```

Tras pulsar "Superior", el texto no aparecía.

## Evidencia

- Corrida completa del 2026-10-13 y **reproducido en aislamiento** (`--workers=2 --retries=0`): este test
  entre los 3 fallos deterministas.
- Snapshot: `test-results\plan-catalog-superadmin-…-chromium\error-context.md`.

## Causa raíz — CONFIRMADA (2026-10-13)

**NO era el catálogo de planes.** `PlanPanels` es un **acordeón de estado único** que arranca abierto en
el plan **ACTIVO** de la tienda (`plan-panels.tsx:124,133`). El test hacía un `.click()` a ciegas sobre
"Superior": si el panel de Superior **ya estaba abierto** (la tienda del card es Superior, por el
nacimiento en Superior del 2026-10-11), el clic lo **colapsaba** y el contenido desaparecía.

## Clasificación

**Defecto del test** (locator/interacción obsoleta: asumía que el panel estaba cerrado). La app es
correcta.

## Aplicación y verificación

**APLICADA (2026-10-13, autorizada).** Se introdujo un helper `expandPlanPanel()` que solo pulsa el
panel cuando `aria-expanded !== 'true'` (expande sin colapsar), robusto ante cualquiera de los planes del
card. Header reescrito.
Verificación: `pnpm exec playwright test e2e/plan-catalog-superadmin.spec.ts --workers=1 --retries=0` →
**2 passed**.

## Estado final

✅ **Resuelto** — 2026-10-13.
