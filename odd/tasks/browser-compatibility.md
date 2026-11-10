# browser-compatibility — piso Chrome 89

Objetivo: fijar un piso de compatibilidad de navegador (Chrome 89 / Android 9) y blindar el frontend React para que ninguna API por encima del piso pueda romper un dispositivo real.
Rama: `dev` (no es la rama por defecto, no se crea rama nueva). Entrega: `ask-on-risk`, commits por unidad de trabajo en `dev`. Runner: `pnpm --filter @store-mgmt/web-store-pos test` (Vitest) + `pnpm lint` + `pnpm typecheck` + `pnpm build` desde `frontend-react/`.

## Specs

S1 — Piso declarado en un único lugar.
La política vive en `frontend-react/packages/eslint-config/browser-compat.js` y se exporta como `@store-mgmt/eslint-config/browser-compat`. Contiene tres exports:
- `BROWSER_FLOOR = { chrome: 89 }` con un comentario que documente el dispositivo observado (**Chrome/89.0.4389.116**, Android 9, Redmi 7A, MIUI Browser).
- `POLYFILLED_APIS`: lista de APIs por encima del piso que el proyecto polifillea y por tanto permite en código.
- `BANNED_APIS`: lista de APIs por encima del piso que el proyecto NO polifillea y por tanto prohíbe.
Criterio de aceptación: `POLYFILLED_APIS` y `BANNED_APIS` son disjuntas y ambas no vacías. Ningún consumidor duplica estas listas.

S2 — Guarda de lint generada desde la política.
`frontend-react/packages/eslint-config/base.config.js` añade la regla `no-restricted-syntax` en severidad `error`, construida programáticamente desde `BANNED_APIS` (un selector + mensaje por entrada). Aplica a todos los workspaces que consumen `base`/`react-router` (`apps/web-store-pos`, `packages/domain`, `packages/web-common`, `packages/eslint-config`).
Mensaje exacto por entrada: `<api> is not available in Chrome 89 (the project browser floor) and is not polyfilled. Use <alternative>.`
Entradas iniciales (API → alternativa):
- `structuredClone` → `deepClone` de `~/shared/lib/browser-compat/deep-clone`.
Criterio de aceptación: `pnpm lint` en `frontend-react/` pasa; un uso de `structuredClone` en `apps/web-store-pos/app` produce error de lint (verificado con prueba de mutación local del worker, revertida).

S3 — Polyfills puntuales, instalados antes que cualquier otro código de la app.
Archivo nuevo `frontend-react/apps/web-store-pos/app/shared/lib/browser-compat/polyfills.ts`:
- Exporta `installBrowserPolyfills(): void`.
- Se ejecuta al importarse el módulo (efecto de módulo) y es **idempotente**: si la API ya existe, no la sobrescribe.
- Todas las definiciones son no enumerables (`Object.defineProperty` con `enumerable: false, writable: true, configurable: true`), para no alterar `for...in` ni `Object.keys`.
- APIs instaladas (todas existen en Chrome 89 y faltan por encima de él):
  - `Array.prototype.at` (Chrome 92)
  - `String.prototype.at` (Chrome 92)
  - `Array.prototype.findLast` (Chrome 97)
  - `Array.prototype.findLastIndex` (Chrome 97)
  - `Array.prototype.toSorted` (Chrome 110)
  - `Array.prototype.toReversed` (Chrome 110)
  - `Array.prototype.toSpliced` (Chrome 110)
  - `Object.hasOwn` (Chrome 93)
- Cada polyfill respeta la semántica del estándar, incluidos índices negativos en `at` y el comportamiento no mutante de `toSorted`/`toReversed`/`toSpliced`.
`frontend-react/apps/web-store-pos/app/entry.client.tsx` importa `./shared/lib/browser-compat/polyfills` como **primera** sentencia de import, con un comentario de una línea que explique por qué va primero.
Criterio de aceptación: `polyfills.test.ts` borra cada API (`delete Array.prototype.at`, etc.), invoca `installBrowserPolyfills()` y comprueba que la operación funciona con el resultado estándar; y comprueba que con la API ya presente no se sobrescribe.

S4 — `structuredClone` fuera del código de producción.
`frontend-react/apps/web-store-pos/app/inventory/lib/services/warehouse-offline-service.ts:1240,1244,1247,1248` deja de usar `structuredClone`. Se sustituye por `deepClone` en `frontend-react/apps/web-store-pos/app/shared/lib/browser-compat/deep-clone.ts`, que soporta primitivos, `Array`, objetos planos, `Date`, `Map`, `Set`, `RegExp` y `ArrayBuffer`/vistas tipadas, preserva ciclos mediante `WeakMap`, y lanza `TypeError` para tipos no clonables (funciones, símbolos).
Criterio de aceptación: `deep-clone.test.ts` prueba identidad de valor y no de referencia para objeto, array anidado, `Date`, `Map`, `Set` y ciclo; y que mutar el clon no afecta al original.

S5 — Verificación del feature.
- Tests nuevos verdes: `polyfills.test.ts`, `deep-clone.test.ts`, `compat-policy.test.ts`.
- `compat-policy.test.ts` importa `@store-mgmt/eslint-config/browser-compat` y afirma: listas disjuntas, no vacías, y que cada entrada de `POLYFILLED_APIS` tiene implementación efectiva (se borra la API en runtime, se reinstala y queda disponible).
- `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` en `frontend-react/` pasan.
- No se toca ningún E2E existente, ni `frontend/` (Angular), ni backend.

## Non-goals (decididos, no reabrir)

- **Sin CI.** El repo no tiene `.github/`; crear CI queda fuera de este feature.
- **Sin `@vitejs/plugin-legacy` ni `core-js`.** Decisión del owner: polyfills puntuales.
- **Sin `build.target` ni `browserslist`.** El default de Vite 6 (`modules` → `chrome87`) ya emite sintaxis por debajo del piso; `build.target` no polifillea APIs, así que añadirlo no protege nada y sí arriesga el output del build y los scripts de post-build (CSP, split del landing, service worker).
- **Sin nuevos tests E2E.** La verificación es unitaria más build.

## Tasks

- T1 — S3: política base (`packages/eslint-config/browser-compat.js` + export del paquete) + `polyfills.ts` + import en `entry.client.tsx` + `polyfills.test.ts`. Ruta: delegated. Estado: pending.
- T2 — S4: `deep-clone.ts` + sustitución de las 4 llamadas `structuredClone` en `warehouse-offline-service.ts` + `deep-clone.test.ts`. Ruta: delegated. Estado: pending.
- T3 — S1/S2/S5: `no-restricted-syntax` en `base.config.js` desde `BANNED_APIS` + `compat-policy.test.ts` + verificación final del feature. Ruta: delegated. Estado: pending.

## Log

L1 (2026-11-10, verbatim): «vamos con la compativilidad del browser con odd como toca. Recuerda usar los subagentes para el explorer, para el worker y las tareas que debes usar los subagentes. Usa codegraph para las cosas que debes usarlo y no usar grep o otro comando para esos casos. Ademas tienes que hacer RDD cada vez que toque. Cualquier duda me preguntas para que no asumas nada de nada.»

L2 — Decisiones del owner en esta sesión:
- Piso de compatibilidad: **Chrome 89 (dispositivo observado)**. `Chrome 89 (dispositivo observado) (Recommended)`.
- Estrategia de protección: **`Capado de lint + polyfills puntuales (Recommended)`**.
- CI: **fuera de alcance** — «quien te ha pedido algo como eso? no inventas mas nada distinto a lo que quiero. Sin CI y sin invntos distinto a lo que pedi».

L3 — Diagnóstico previo (sesión anterior, no rehacer): el crash `TypeError: l.filter(...).at is not a function` venía de `Array.prototype.at`; el único uso en producción era `packages/domain/src/commons/plan-module-groups.ts:79` y se corrigió en `e70aa283` con el test `plan-module-groups.test.ts`.

L4 — Mapa del explorer (2026-11-10), hechos que fijan las specs:
- `frontend-react` es pnpm + Turborepo; un solo `vite.config.ts` (`apps/web-store-pos/vite.config.ts`) sin `build` key.
- No existe `.github/` en el repo: no hay CI.
- `packages/typescript-config/tsconfig.base.json` no lo extiende nadie (configuración muerta).
- Ningún `.at(` en código de producción: los 12 hits son tests y fixtures E2E.
- `structuredClone` (Chrome 98) en producción: `warehouse-offline-service.ts:1240,1244,1247,1248`.
- `Object.hasOwn` (Chrome 93) en producción: `catalog/templates/registry.ts:31`.
- Sin browserslist, sin `eslint-plugin-compat`, sin `no-restricted-*`, sin polyfills en el bundle.
- `public/pwa-install-capture.js` está fuera de lint (`public/**` ignorado) y el service worker se compila aparte (`esbuild target es2020`).
- Incógnita abierta y aceptada: el crash real no se reproduce desde código propio porque ya no existe ningún `.at(` en producción; pudo venir de dependencia, de `packages/domain/dist` o de una revisión anterior. Los polyfills de S3 cubren precisamente el caso "lo llama una dependencia".

L5 — Orden elegido para mantener el árbol verde en cada commit: T1 (polyfills + política de datos, sin regla activa) → T2 (quitar `structuredClone`) → T3 (activar la regla de lint). Si la regla se activara antes de T2, `pnpm lint` fallaría legítimamente en cada workspace.
