# 8. channel-rates-catalogue.spec.ts:106 — las tiendas nuevas nacen en plan Superior (con el módulo 15) y el spec fija el plan Pago

**Tests cubiertos (misma causa raíz):**
- `channel-rates-catalogue.spec.ts:106:7` — *"el 15 es lo que abre la vista…"* (revienta en la **línea 129**).
- `channel-rates-catalogue.spec.ts:197:7` — *"channel-rates gate sin módulo 15 (tienda en plan Pago)"*.

Esta ficha es la del **primer fallo de la corrida completa del 2026-10-13**.

## Qué prueban los tests

- **`:106`** — una tienda **recién registrada por la UI** no debe traer el módulo 15 (MultiMonedas): primero
  se prueba que el 16 solo no abre la vista (precondición negativa pineada en `:129`), y después se
  enciende el 15 para comprobar que es el gate real del catálogo de tasas.
- **`:197`** — con la persona compartida `owner-admin` (tienda en el **plan de nacimiento Pago**) el menú
  **no** debe ofrecer `/management/channel-rates` y la ruta debe quedar gateada.

En negocio: MultiMonedas (15) no viene en el plan de nacimiento; hay que comprarlo.

## Qué fallan (en simple)

```
Error: expect(received).not.toContain(expected) // indexOf
Expected value: not 15
Received array:     [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 12, 14, 15, 16, 17, 18, 19, 20]
> 129 |     expect(await sessionModuleIds(page)).not.toContain(MULTIMONEDAS_MODULE_ID);
```

```
Error: expect(locator).toHaveCount(expected) failed
Locator:  locator('a[href="/management/channel-rates"]')
Expected: 0
Received: 1
```

La sesión del usuario **sí** trae el módulo 15, así que la precondición negativa del test no se cumple y
el enlace del menú aparece donde el test exige que no esté.

## Evidencia

- **Dos corridas completas** el 2026-10-13 (`pnpm test:e2e --workers=4`): 304/17/12 y 311/17/5 — este
  spec aparece en las dos (y es el **primer** fallo de la segunda).
- **Reproducido en aislamiento** (`pnpm exec playwright test e2e/channel-rates-catalogue.spec.ts
  --workers=1 --retries=0`): **2 failed**. Sin reintentos y con 1 worker → determinista, no carga.
- Snapshots: `test-results\channel-rates-catalogue-ch-…-chromium\error-context.md`.

## Causa raíz — CONFIRMADA

`backend/src/Application/Services/Stores/CreateStoreService.cs:45` nace la tienda con
`StorePlanId = (int)StorePlanType.Superior` y en la línea 53 carga **los módulos del plan Superior**. El
plan **Superior incluye MultiMonedas (15)**, así que:

- la tienda recién registrada en `:106` llega con `[2..20]` (incluye 15) → revienta la precondición;
- la tienda de la persona `owner-admin` (mismo camino de nacimiento) tiene el 15 → el enlace aparece.

El spec (y un commit de `main`: *"fix(auth): birth registered stores onto the Pago plan module set"*)
asumen el plan **Pago**, que no trae 15 ni 16. El estado de `dev` nace las tiendas en **Superior**.

## Clasificación

**Discrepancia de negocio** (plan de nacimiento) — no es un defecto del test ni de la app *per se*: hay
que decidir **en qué plan debe nacer una tienda**. El E2E está haciendo su trabajo: detectó que `dev`
nace en Superior mientras el resto del sistema/`main` asume Pago.

## Propuesta de solución — NO APLICADA

Decisión del owner, dos caminos excluyentes:
- **Si el plan de nacimiento debe ser Pago** (lo que dice `main`): cambiar `CreateStoreService` para nacer
  en Pago y cargar sus módulos (**código de producción** → autorización explícita).
- **Si debe ser Superior** (lo que hace `dev` hoy): actualizar la precondición de los dos tests de este
  spec (**test E2E existente** → autorización explícita), y revisar la expectativa equivalente en los
  otros specs que asumen Pago (`multimonedas`, `payment-methods-plan-gate`, `wholesale-plan-gate`,
  `plan-catalog-superadmin`…), que además aparecen rojos en la corrida completa.

## Aplicación y verificación

**APLICADA (2026-10-13, autorizada).** Decisión del owner: la tienda nace en **Superior** → el corpus E2E
se actualiza, no la app. Se agregó el helper `disableStoreModule` (borra la fila `StoreModule`) y se
rediseñaron los dos tests de este spec: la mitad negativa se construye **desactivando** el 15 (la tienda
ya lo trae al nacer) y la segunda describe pasó de la persona compartida a **identidad privada** (mutar
módulos es server-side). Verificación: `pnpm exec playwright test e2e/channel-rates-catalogue.spec.ts
--workers=1 --retries=0` → **2 passed (51.9 s)**.

## Estado final

✅ **Resuelto** — 2026-10-13.
