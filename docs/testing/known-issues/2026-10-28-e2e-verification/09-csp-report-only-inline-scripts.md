# 9. csp-report-only.spec.ts:79 — cuatro scripts inline de SSR presentes SOLO en `/` quedan fuera de la allowlist dev

## Qué prueba el test

`csp-report-only.spec.ts:79:7` — *"zero violations across the primary unauthenticated routes"*. Recorre
`/`, `/login` y `/register` sin sesión con la CSP en modo **report-only** y exige **cero violaciones**
no conocidas: es el guardián de que la política de contenido no se rompió ni perdió su allowlist.

## Qué falla (en simple)

```
Error: Expected zero CSP violations (/), observed 4: script-src-elem blocked inline on http://localhost:3333/ (report)
  sample: "((storageKey2, restoreKey) => {\n    if ("
  sample: "requestAnimationFrame(function(){$RT=per"
  sample: "$RB=[];$RV=function(a){$RT=performance.n"
  sample: "$RC(\"B:1\",\"S:1\")"
```

La aserción que revienta es `csp-report-only.spec.ts:74` (el agregado de violaciones), invocada desde
la línea 79. El barrido se detiene en la primera ruta (`/`).

## Evidencia

- Corrida completa del **2026-10-28**: falló los **3 intentos** (`retries: 2`).
- Artifacts: `frontend-react/test-results/csp-report-only-CSP-report-*/error-context.md` (original +
  `-retry1` + `-retry2`).
- **Captura directa del HTML** del dev server (`http://localhost:3333/`, 2026-10-28), sin Playwright:

| # | Script inline (primeros caracteres) | ¿En la allowlist? |
| --- | --- | --- |
| 1 | `((storageKey2, restoreKey) => { ... })("react-router-scroll-positions", null)` | ❌ **no** |
| 2 | `window.__reactRouterContext = {...}` | ✅ `^window\.__reactRouterContext` |
| 3 | `import "/@id/__x00__virtual:react-router/..."` | ✅ `^import "\/@id\/__x00__virtual:react-router` |
| 4 | `requestAnimationFrame(function(){$RT=performance.now()});` (`id="_R_"`) | ❌ **no** |
| 5 | `window.__reactRouterContext.streamController.enqueue(...)` | ✅ (misma entrada 2) |
| 6 | `$RB=[];$RV=function(a){$RT=performance.now();...}` | ❌ **no** |
| 7 | `window.__reactRouterContext.streamController.close()` | ✅ (misma entrada 2) |
| 8 | `$RC("B:1","S:1")` | ❌ **no** |

- **Las otras dos rutas del barrido no fallan:** `/login` y `/register` emiten **4** scripts inline y
  los 4 están cubiertos. Los 4 no cubiertos aparecen **solo en `/`**.

## Causa raíz — origen CONFIRMADO; cambio introductor NO CONFIRMADO

**Qué es cada script (verificado en el paquete instalado, no inferido):**

- **#1** es el script inline de `<ScrollRestoration />` de React Router. Se renderiza en
  `apps/web-store-pos/app/root.tsx:85` y su contenido se cierra con
  `("react-router-scroll-positions", null)`.
- **#4, #6 y #8** los emite **react-dom 19.2.6** en su SSR (Fizz): las cadenas `$RB=[];$RV=function...`
  y `$RT=performance.now()` aparecen literalmente en
  `node_modules/.pnpm/react-dom@19.2.6_react@19.2.6/node_modules/react-dom/cjs/react-dom-server.node.development.js`.
  `$RC("B:1","S:1")` es el `completeBoundary` del boundary **B:1**: el documento de `/` se sirve
  **streamed con un boundary pendiente**, y Fizz inyecta su runtime inline para revelarlo.
- La allowlist (`apps/web-store-pos/scripts/csp-known-dev-violations.mjs`, escrita el 2026-08-12
  contra `@react-router/dev@7.15.1`) tiene **3 entradas** y cubre el payload `__reactRouterContext`
  (3 scripts), el import virtual de Vite y el warning de HydrateFallback. No contempla ni el script de
  `ScrollRestoration` ni el runtime Fizz de streaming.

**Lo que no está confirmado:** qué cambio hizo que `/` pase a servirse con ese boundary pendiente. Hechos
que acotan la búsqueda:

- `react-router` sigue en **7.15.1** (no hubo salto de versión), así que no es una actualización del router.
- `root.tsx` solo tuvo un cambio desde el 2026-10-13: `48d89ff9` (2026-10-26, telemetría de page views),
  que monta `useSitePageView()` — no crea un boundary.
- El trabajo del landing (`landing-deep.tsx`, commits del 2026-10-20 al 2026-10-27) es lo único que
  diferencia a `/` de `/login` y `/register`, pero no se encontró `Suspense`/`lazy` en `app/home`.

## Clasificación

**Defecto del test** (allowlist dev incompleta) con un cambio de framework como disparador. No es una
vulnerabilidad ni una regresión de la CSP: el header report-only se emite bien, los scripts bloqueados
son generados por el framework y en producción se externalizan/allowlistean por hash
(`scripts/externalize-inline-scripts.mjs`, `deploy/nginx.conf`). El spec está haciendo su trabajo: avisa
que hay inline scripts nuevos.

## Propuesta de solución — NO APLICADA

Agregar **cuatro entradas** a `KNOWN_DEV_ONLY_VIOLATIONS`, cada una con `sampleMatch` anclado y su
`reason`:

1. `/^\(\(storageKey2, restoreKey\) => \{/` — script de `<ScrollRestoration />` de React Router
   (`root.tsx:85`), también por-hash en producción.
2. `/^requestAnimationFrame\(function\(\)\{\$RT=performance\.now\(\)\}\);/` — bootstrap de medición Fizz
   (dev), emitido junto al boundary `_R_`.
3. `/^\$RB=\[\];\$RV=function\(a\)\{/` — runtime de revelado Fizz (`react-dom-server`).
4. `/^\$RC\("B:1","S:1"\)/` — `completeBoundary` del boundary B:1 (Fizz).

Antes de aceptarlas hay que **confirmar que son solo de dev** (que el build de producción no las emite
inline; el mecanismo de hashes de nginx es el sitio donde debería constar si sí). Si alguna también sale
en producción, va a la lista de hashes y no a la allowlist dev.

Requiere autorización 1 a 1 para tocar el spec o la allowlist.

## Aplicación y verificación

No aplicada.

## Estado final

🔴 **Abierto** — 2026-10-28.
