# Feature: cart-wholesale-by-order-type — gate del comportamiento mayorista del carrito por tipo de venta

**Estado**: COMPLETADO (verificado, commit local, sin push) · **Rama**: qa (local) · **Creado**: 2026-09-23

## Objetivo

Un producto habilitado para venta mayorista debe comportarse según el **tipo de venta real del carrito** (`orderType`), no según su configuración de producto. La venta normal se mantiene normal (unidades, precio retail, paso ±1) y la mayorista sigue siendo mayorista (paquetes, tier de precio, paso = packSize). El mismo producto puede venderse en ambos modos con el comportamiento esperado en cada uno.

## Problema

Causa raíz (investigación 2026-09-23): `CartShell` decide que el carrito "es mayorista" mirando la **config mayorista del producto** (`wholesaleEnabled`/`packSize`/`tiers`) en lugar del `orderType` del carrito. Manifestaciones con un producto mayorista en una venta NORMAL:

1. `handleQuantityChange` (cart-shell.tsx:282-347): los botones +/− saltan `packSize` unidades por click, aplican la regla de piso (`getWholesaleMinPacks`) y re-calcular el precio por unidad con el rango mayorista (`wholesaleTierUnitPrice`).
2. Badge del carrito (`cartBadgeCount`, wholesale-cart-display.ts:44-50): cuenta paquetes → 1 unidad suma 0 → parece que "no se agregó"; `itemCount === 0` deshabilita "Registrar" / `validateCartSubmission` responde "carrito vacío".
3. `formatWholesaleLine` (cart-shell.tsx:88-101): la línea se muestra como "Cajas: 0 · Precio: $24" en lugar de "Precio: $5 (1)".

`guardOrderType` bloquea mezclar Normal/Mayorista en un mismo carrito pero eso no protege contra este caso: la config del producto es una capacidad, no el modo de venta; la autoridad del modo es `cart.orderType` (fijado en `sale.tsx:256` → Normal, `wholesale.tsx:229` → Mayorista), y `CartShell` nunca la consulta.

## Por qué

Comportamiento esperado de negocio: un mismo producto puede venderse normal y por mayor; el modo lo define la pantalla/venta en curso.

## Scope (qué y dónde)

- `frontend-react/apps/web-store-pos/app/sales/lib/wholesale-cart-display.ts`
- `frontend-react/apps/web-store-pos/app/sales/lib/__tests__/wholesale.test.ts` (unit, ajuste de firma + casos nuevos)
- `frontend-react/apps/web-store-pos/app/shared/components/cart-shell.tsx`
- `frontend-react/apps/web-store-pos/app/shared/components/__tests__/cart-shell.test.tsx` (unit, casos nuevos)
- `odd/tasks/cart-wholesale-by-order-type.md` (este doc)

FUERA DE SCOPE (reglas no negociables del repo):
- `frontend/` (Angular legacy) — CONGELADO, nunca se toca.
- `frontend-react/e2e/**` y `frontend-react/e2e/support/**` (E2E Playwright existentes) — intocables; solo se permiten NUEVOS tests E2E, no se necesitan aquí.

## Restricciones

- Regla repo: el frontend Angular (`frontend/`) es legacy y NO se toca; todo cambio va en `frontend-react/`.
- Regla repo: nunca modificar, borrar, renombrar, saltar, debilitar o "arreglar" un test E2E existente sin autorización explícita (aplica a `frontend-react/e2e/`, `frontend-react/e2e/support/*`, y `backend/src/SMCA.WebApi.E2ETests/`). Aquí no se toca ningún E2E.
- Convencional commits, sin "Co-Authored-By" ni atribución AI.
- Artefactos técnicos en inglés (código, tests, mensajes de commit); el doc ODD puede seguir el idioma del repo (los docs odd existentes están en inglés con notación `docs(odd)`).

## Checklist

- [x] T0 — Investigación: causa raíz identificada y documentada arriba (2026-09-23).
- [x] T1 — `wholesale-cart-display.cartBadgeCount` recibe el `orderType` y cuenta unidades cuando la venta NO es Mayorista (producto con config mayorista incluido).
- [x] T2 — `CartShell.formatWholesaleLine` recibe el `orderType` y muestra la línea retail (precio unitario + cantidad) cuando la venta NO es Mayorista.
- [x] T3 — `CartShell.handleQuantityChange`: el paso de +/−, la regla de piso y el re-tier de precio solo aplican cuando `orderType === OrderType.Mayorista`; en Normal el paso es 1, sin re-tier ni piso.
- [x] T4 — Tests unit: (a) badge/display/paso en venta Normal con producto mayorista → unidades/precio retail/paso 1; (b) venta Mayorista conserva paquetes/paso packSize/re-tier/piso; (c) ajustar firmas existentes de `cartBadgeCount` en wholesale.test.ts.
- [x] T5 — Verificación: tests dirigidos, typecheck y lint del app; commit de unidad de trabajo.

## Criterios de aceptación

- Venta normal con producto `wholesaleEnabled`: al agregar 1 unidad el badge suma 1, la línea muestra "Precio: $X (1)", +/− mueve de a 1 unidad y NO re-calcula precio mayorista ni aplica piso de paquetes; "Registrar" habilita.
- Venta mayorista del mismo producto: badge en paquetes, línea "Cajas: N · Precio: $P", +/− en pasos de `packSize` con re-tier de precio y piso `minPacks` (sin regresión).
- Ningún E2E existente tocado; `frontend/` no tocado.

## Chequeos aplicables

- Desde `frontend-react/apps/web-store-pos`: `pnpm vitest run` (dirigido a `cart-shell.test.tsx`, `wholesale.test.ts`, `sale.test.tsx`, `wholesale.test.tsx`; luego suite completa del app si el tiempo lo permite).
- `pnpm typecheck` y `pnpm lint` en el app (o al menos sobre los archivos cambiados).

## Progreso y evidencia

- T0: evidencia en investigación — `cart-shell.tsx:282-347`, `:88-101`, `:159`; `wholesale-cart-display.ts:21-50`; `sale.tsx:256`; `wholesale.tsx:229`.
- T1-T4: implementadas (escritor delegado; el server se reinició a mitad de la delegación, se revisó el diff contra el contrato y se completó la verificación desde el orquestador).
- T5: verificación observada (2026-09-23):
  - `pnpm exec vitest run cart-shell.test.tsx wholesale.test.ts sale.test.tsx wholesale.test.tsx`: 4 files / 175 tests passed.
  - `pnpm vitest run` (suite completa del app, con `NODE_OPTIONS=--max-old-space-size=8192`): 298 files / 4203 tests passed. El OOM inicial era solo del heap por defecto (límite del entorno, no del cambio).
  - `pnpm typecheck`: pass — requirió reconstruir el `dist/` desactualizado del paquete `@store-mgmt/domain` (condición preexistente del merge test→qa: enums `WholesaleSales` ya en el source, ausentes en el dist compilado; los archivos con errores NO eran los tocados).
  - `pnpm lint`: pass.
- Commits (rama `qa`, sin push — política ordinaria del repo):
  - `f0f66a5e` — docs(odd): track cart-wholesale-by-order-type feature plan
  - `496b4544` — fix(cart): keep normal-sale behavior for wholesale-enabled products (171+/19-)
  - `73590f39` — docs(odd): mark cart-wholesale-by-order-type completed with verification evidence
- RDD (receipt-driven development): `gentle-ai review assess --cwd . --agent opencode --base-ref 39e39d88 --committed-only --json` devolvió `risk: high` / `review_due_reason: high_risk` por `unassessable` — **el runtime OpenCode actual no es elegible para immutable receipt review** (soportados: claude-code, codex); no se ofreció `next_transition.command`. Resultado registrado: **unavailable**; modo RDD sigue ON (decisión del usuario), sin START ni review lanzado.

## Siguiente paso

Sin push ni PR (decisión del usuario bajo política ordinaria del repo). Pendiente: notificar al usuario el resultado (reporte en español) y esperar su decisión sobre push/PR y sobre una posible prueba manual en qa.