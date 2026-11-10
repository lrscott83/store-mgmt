# Browser compatibility — plan de trabajo (siguiente sesión)

> Nota para retomar en otra sesión. Resumen completo del diagnóstico, lo ya resuelto,
> el hueco verificado y el plan ordenado. Memoria persistente: topic `frontend/browser-compat`.

## Contexto

Un usuario real en producción reportó que la landing (`/`) se rompía con:

```
TypeError: l.filter(...).at is not a function
```

Dispositivo: `Chrome/89.0.4389.116` (Android 9, Redmi 7A, MIUI Browser). El navegador
quedó congelado en Chrome 89, que **no tiene** `Array.prototype.at` (ES2022, Chrome 92+).

## Lo ya resuelto (NO rehacer)

Causa raíz: `frontend-react/packages/domain/src/commons/plan-module-groups.ts:79` era el
**único** `.at()` de código de producción del repo:

```ts
// antes
const previous = orderedPlans.filter((p) => p.order < plan.order).at(-1);
// después
const predecessors = orderedPlans.filter((p) => p.order < plan.order);
const previous = predecessors[predecessors.length - 1];
```

- Fix: commit `e70aa283` (`fix(domain): replace Array.prototype.at with index access for Chrome 89`).
- Test: `frontend-react/packages/domain/src/commons/__tests__/plan-module-groups.test.ts`
  (borra `Array.prototype.at` en runtime y aserta que la agrupación no cambia).
- Hardening de la suite: commits `cf856e3c`, `62523936`.
- Todo mergeado a `dev` (local y remoto), rama eliminada, 3 candidatos con RDD aprobado.

## El hueco verificado (explorer, todo confirmado)

| Guarda | Estado |
|---|---|
| `browserslist` | No existe en ningún lado |
| `@vitejs/plugin-legacy` | No instalado |
| `core-js` | No está, ni importado |
| `eslint-plugin-compat` | No está |
| `no-restricted-properties` / `no-restricted-syntax` | No existen |
| Escaneo del bundle buscando APIs prohibidas | No existe |
| `build.target` en `vite.config.ts` | Ausente |
| tsconfig `target`/`lib` | ES2022 (acepta cualquier API ES2022 sin avisar) |
| Playwright | 5 configs, un solo Chromium moderno sin pin (`@playwright/test ^1.62.1`) |
| E2E del landing `/` | No hay cobertura (solo hero/CSP/hidratación) |

## Advertencia clave (no perderla)

`build.target` de Vite **solo baja sintaxis, nunca polifilla APIs**. Poner `build.target`
solo NO arregla este tipo de bug. Hace falta una capa de polyfill Y/O una regla de lint que
prohíba APIs por encima del piso.

## Plan ordenado

Cada paso: chico, testeado (unit + integración + E2E), con RDD. **Preguntar el piso de
compatibilidad al owner antes de fijarlo — no asumirlo.**

1. **Definir el piso** (navegador + versión) y pedir aprobación. Dispositivo observado: Chrome 89.
2. **Regla de lint** (`no-restricted-properties` o `eslint-plugin-compat`) que prohíba las
   APIs ES2022+ de riesgo: `Array.prototype.at`, `.findLast`/`.findLastIndex`,
   `.toSorted`/`.toReversed`/`.toSpliced` (Chrome 110), `Object.hasOwn`, `structuredClone`,
   `Promise.any` (Chrome 85), `String.replaceAll` (Chrome 85), etc. Empezar conservador.
3. **Re-scan** de `.at(` restante (hoy solo el fixture E2E y tests lo usan; el fixture corre
   en Node, es seguro).
4. **Decidir lint-only vs polyfills de runtime** (`core-js` / `@vitejs/plugin-legacy`);
   lo segundo toca build y bundle, es más grande.
5. **Verificación de compat**: test unitario que borra la API en runtime (patrón de
   `plan-module-groups.test.ts`) por cada API prohibida, y repro de carga fría con Playwright
   `addInitScript`. Playwright NO puede correr Chrome 89 — lo más cercano es un dispositivo
   real/BrowserStack o la simulación con init-script.
6. **Cubrir el landing con E2E** (hoy es cero) — hueco de regresión real.

## Receta de reproducción

```js
// Playwright — carga fría fiel:
await page.addInitScript(() => { delete Array.prototype.at; });
await page.goto('/');

// DevTools — navegación SPA (un reload descarta el override por realm nuevo):
//   delete Array.prototype.at
```

## Restricciones

- No romper nada: unit + integración + E2E verdes, RDD en cada cambio.
- E2E del frontend según README raíz: backend `http-e2e` en 5019, luego
  `pnpm exec playwright test e2e/<spec>.spec.ts --workers=2` (o `pnpm test:e2e --workers=2`).
  Nunca en paralelo con el E2E del backend (que resetea `smca_test`).
- E2E existentes intocables sin autorización explícita (solo se agregan tests nuevos).
- Angular `frontend/` es legacy — nunca tocar.
- Evitar `pnpm install` / churn de lockfile.

## Archivos que probablemente tocar

- `frontend-react/packages/eslint-config/base.config.js` (regla de lint)
- `frontend-react/apps/web-store-pos/vite.config.ts` (`build.target`)
- `frontend-react/package.json` (`core-js` / `@vitejs/plugin-legacy`)
