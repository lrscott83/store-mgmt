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
  - `crypto.randomUUID` (Chrome 92, solo contexto seguro) → v4 generado con `crypto.getRandomValues` (Chrome 11+), **mismo formato de string**: no cambia la forma del dato, no reescribe registros existentes y no invalida ids ya guardados.
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
- **Sin `build.target`.** El default de Vite 6 (`modules` → `chrome87`) ya emite sintaxis por debajo del piso; `build.target` no polifillea APIs, así que añadirlo no protege nada y sí arriesga el output del build y los scripts de post-build (CSP, split del landing, service worker).
- **`browserslist` + `eslint-plugin-compat`: SÍ (revertido por el owner).** Ver S6. La decisión inicial era no usarlos; el owner pidió el chequeo mecánico porque una lista escrita a mano no puede probar completitud.
- **Sin nuevos tests E2E.** La verificación es unitaria más build.

S6 — Chequeo mecánico de compatibilidad (base de datos real, no lista a mano).
- `frontend-react/package.json` declara `"browserslist": ["chrome 89"]` (el piso), única fuente del target.
- `frontend-react/packages/eslint-config` añade `eslint-plugin-compat` como devDependency.
- `base.config.js` activa `compat.configs['flat/recommended']` y `settings.lintAllEsApis: true`, con `settings.polyfills` derivado de `POLYFILLED_APIS` (la misma lista de S1) para que lo polifillado no se reporte.
- La regla se aplica solo a código que corre en el navegador. Quedan fuera: `**/__tests__/**`, `**/*.test.*`, `e2e/**`, `scripts/**`, `**/*.mjs` y `app/service-worker.ts`.
- Criterio de aceptación: `pnpm lint` pasa en `frontend-react/`; y una API por encima del piso no declarada como polyfill (por ejemplo `AbortSignal.timeout`, Chrome 103) produce error al introducirla en un archivo de `app/` (prueba de mutación revertida). El inventario de violaciones encontradas al activarlo se reporta al owner antes de decidir arreglos.

S7 — Un fallo de polyfills en el arranque deja rastro (advisories del RDD de `44b0c6b9`).
- `polyfills.ts` captura el resultado del arranque en module scope y **no lo descarta**; si `failed` no está vacío, o si el arranque entero lanza, emite `console.warn` con la lista de APIs fallidas y su `reason` (sin imports nuevos, el invariante "polyfills se evalúa primero" se mantiene).
- El resultado del arranque es legible por un consumidor posterior: `readStartupPolyfillReport()`.
- `root.tsx`, junto a `installClientLog()`, vuelca el reporte con `logClientError` (nivel `warn`) cuando hubo fallos o error de arranque, para que quede persistido en el log exportable de `/diagnostics`.
- Criterio de aceptación: hay test del reparto **mixto** (`installed`, `alreadyPresent` y `failed` no vacíos en una misma pasada), test del `reason` cuando el valor lanzado **no** es un `Error` (`String(error)`) y cuando es un `Error` con `message` vacío (cae en `name`), y test del volcado a diagnóstico. El `catch` de arranque deja de estar sin cubrir.

## Findings del RDD `review-5a8ec25157b39dd5` (aprobado, 11 advisory) y su resolución

| ID | Lente | Sev. | Resolución |
|---|---|---|---|
| R1-proto-key-reparenting | risk | WARNING | U2: copiar claves propias con `defineProperty` para que un `__proto__` propio no reparente el clon. |
| R1-symbol-descriptor-shared | risk | WARNING | U2: clonar `descriptor.value` de claves símbolo, no compartir la referencia. |
| R3-001 | reliability | WARNING | U2: clonar `Error` de verdad y lanzar error de clonado para tipos no soportados en vez de devolver un cascarón. |
| R4-DEEPCLONE-SILENT-LOSS | resilience | WARNING | U2: mismo arreglo; el fallo debe ser ruidoso. |
| R3-002 | reliability | WARNING | U1: test de contrato del `snapshotPurchaseEdit` real (igualdad + independencia de referencias) por la API pública. |
| R3-003 | reliability | SUGGESTION | U5: `toSorted` preserva huecos (como el estándar) + test de arreglo disperso en `deepClone`. |
| R3-004 | reliability | SUGGESTION | U3: restaurar descriptores en `finally` y aserta la restauración; sin depender del aislamiento de realm. |
| R3-005 | reliability | SUGGESTION | U4: T4 implementado (doc y código dejan de contradecirse). |
| R4-RANDOMUUID-UNMITIGATED | resilience | WARNING | U4: polyfill de `crypto.randomUUID`. |
| R4-POLYFILL-NO-FAILSOFT | resilience | WARNING | U3: cada instalador aislado con `try/catch`; un fallo no aborta la evaluación del entry. |
| R4-DEEPCLONE-NO-PERF-MEASUREMENT | resilience | SUGGESTION | U1: guarda de rendimiento acotada por tamaño y con umbral holgado. |

## Tasks

- T6 — U1: test de contrato del snapshot (`R3-002`) + guarda de rendimiento (`R4-DEEPCLONE-NO-PERF-MEASUREMENT`). Ruta: delegated. Estado: pending.
- T7 — U2: fidelidad de `deepClone` (`R1-proto-key-reparenting`, `R1-symbol-descriptor-shared`, `R3-001`, `R4-DEEPCLONE-SILENT-LOSS`). Ruta: delegated. Estado: pending. Depende de T6.
- T8 — U3: fail-soft de polyfills (`R4-POLYFILL-NO-FAILSOFT`) + higiene de tests (`R3-004`). Ruta: delegated. Estado: pending.
- T9 — U4: polyfill `crypto.randomUUID` (T4 original; `R4-RANDOMUUID-UNMITIGATED`, `R3-005`). Ruta: delegated. Estado: done — commit `e93a7403`, RDD `review-634a0da6ab6738f4` aprobado (lentes risk + reliability), autoridad quemada.
- T10 — U5: `toSorted` con huecos (`R3-003`). Ruta: delegated. Estado: pending.
- T11 — S7: rastro de degradación en el arranque (`R3-silent-startup-degradation`, `R4-bootstrap-catch-no-diagnostic`). Ruta: delegated. Estado: done — commit `f974a24a`, RDD `review-50483731246ac81f` aprobado (lentes resilience + reliability), autoridad quemada.
- T12 — S7: huecos de test restantes (`R3-nonerror-reason-branch`, `R3-mixed-report-state-gap`). Ruta: delegated. Estado: done — commit `f974a24a`.

- T1 — S3: política base (`packages/eslint-config/browser-compat.js` + export del paquete) + `polyfills.ts` + import en `entry.client.tsx` + `polyfills.test.ts`. Ruta: delegated. Estado: done — commit `b2b8ef92` (11 tests, typecheck y lint del paquete verdes).
- T2 — S4: `deep-clone.ts` + sustitución de las 4 llamadas `structuredClone` en `warehouse-offline-service.ts` + `deep-clone.test.ts`. Ruta: delegated. Estado: pending.
- T3 — S1/S2/S5: `no-restricted-syntax` en `base.config.js` desde `BANNED_APIS` + `compat-policy.test.ts` + verificación final del feature. Ruta: delegated. Estado: done — commit `3bdfa278`, RDD `review-1c3a82d03b106fe2` (risk + reliability) approved, autoridad quemada.
- T4 — S3: polyfill de `crypto.randomUUID` (v4 con `crypto.getRandomValues`) + entrada en `POLYFILLED_APIS` + ampliación de `polyfills.test.ts`. Ruta: delegated. Estado: done — commit `e93a7403`.
- T5 — S6: `browserslist` en el root + `eslint-plugin-compat` en `packages/eslint-config` + `flat/recommended` con `lintAllEsApis` y `settings.polyfills` desde `POLYFILLED_APIS`. Ruta: delegated. Estado: pending. Depende de T4 (los polyfills deben estar declarados antes de que el plugin los exija).

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

L5 — Orden elegido para mantener el árbol verde en cada commit: T1 (polyfills + política de datos, sin regla activa) → T2 (quitar `structuredClone`) → T3 (activar la regla de lint) → T4 (`crypto.randomUUID`). Si la regla se activara antes de T2, `pnpm lint` fallaría legítimamente en cada workspace.

L6 — Auditoría de APIs por encima del piso (2026-11-10, búsqueda textual; codegraph no indexa uso de APIs globales, es el fallback documentado). Barrido sobre `apps/web-store-pos/app`, `packages/domain/src` y `packages/web-common/src`, excluyendo tests y `e2e/`, con este conjunto: `.at(`, `.findLast(`, `.findLastIndex(`, `.toSorted(`, `.toReversed(`, `.toSpliced(`, `Object.hasOwn`, `Object.groupBy`, `Map.groupBy`, `Array.fromAsync`, `structuredClone`, `randomUUID`, `AggregateError`, `.replaceAll(`, `reportError`, `AbortSignal.timeout|any`, `CompressionStream`, `DecompressionStream`, `Intl.Segmenter`, `URL.canParse`, `scheduler.postTask`.

Resultado del barrido:
- `.at(` / `.findLast(` / `.findLastIndex(` / `.toSorted(` / `.toReversed(` / `.toSpliced(`: **0 en producción** (solo tests, fixtures E2E y comentarios).
- `Object.hasOwn` (Chrome 93): **1 sitio**, `catalog/templates/registry.ts:31`.
- `structuredClone` (Chrome 98): **4 sitios**, `warehouse-offline-service.ts:1240,1244,1247,1248` (T2).
- `CompressionStream` / `DecompressionStream` (Chrome 80): **por debajo del piso**, `sync/lib/hotspot/sdp-codec.ts:108,112`. No requiere acción.
- `crypto.randomUUID` (Chrome 92): **12 llamadas directas sin protección** en producción:
  `expenses/lib/services/expense-offline-service.ts:24`, `inventory/lib/services/elaboration-offline-service.ts:23`, `inventory/lib/services/inventory-offline-service.ts:119`, `inventory/lib/services/recipe-offline-service.ts:11`, `inventory/lib/services/warehouse-offline-service.ts:41`, `sales/lib/services/product-offline-service.ts:23`, `sales/lib/services/order-offline-service.ts:119`, `sales/lib/services/sale-credit-offline-service.ts:21`, `sales/lib/repositories/product-category-repository.ts:12`, `sales/lib/repositories/product-repository.ts:14`, `management/channel-rates/lib/services/channel-rate-offline-service.ts:114`, `shared/lib/dev/demo-data-generator.ts:119`.
  Y **2 sitios que ya se protegen solos** con `typeof crypto.randomUUID === 'function'`: `shared/components/multipayments/multi-payment-list.tsx:82-83` y `shared/lib/messages/messages-offline-service.ts:33-34`.
- Resto del conjunto (`Object.groupBy`, `Map.groupBy`, `Array.fromAsync`, `AggregateError`, `.replaceAll(`, `reportError`, `AbortSignal.timeout|any`, `Intl.Segmenter`, `URL.canParse`, `scheduler.postTask`): **0 en producción**.
- Corrección de un dato previo: L4 decía "los 12 hits de `.at(` son tests y fixtures" y era correcto; lo que estaba incompleto era el conteo de `crypto.randomUUID` (se reportaron 3 sitios por un truncamiento de la búsqueda; el número real es 12 sin protección).

Límite explícito de esta auditoría: un barrido textual demuestra la ausencia de los patrones que nombra, no la ausencia de toda API por encima del piso. La lista es tan completa como el conjunto buscado.

L7 (2026-11-10, verbatim del owner): «añadelas para el chequeo mecánico». Reversa el non-goal de `browserslist` y añade `eslint-plugin-compat` como S6/T5: la completitud deja de depender de una lista escrita a mano y pasa a una base de datos real (caniuse) contra `chrome 89`. Implicaciones asumidas: nueva devDependency + `pnpm install` (churn de lockfile, antes prohibido por prudencia, ahora autorizado por necesidad del chequeo); el plugin solo entiende Web APIs por defecto, así que `settings.lintAllEsApis: true` es obligatorio para cubrir la clase de bug del `.at()`; `settings.polyfills` se deriva de `POLYFILLED_APIS` para no reportar lo que ya se polifillea; y el inventario de violaciones que aparezca al activarlo se reporta al owner antes de arreglar nada, porque puede ser un backlog grande y no fue autorizado.
L8 (2026-11-11, verbatim del owner): "continua con lo 4 advertencias. Recuerda usar los subagentes para el explorer, para el worker y las tareas que debes usar los subagentes. Usa codegraph para las cosas que debes usarlo y no usar grep o otro comando para esos casos. Ademas tienes que hacer RDD cada vez que toque. Cualquier duda me preguntas para que no asumas nada de nada."

L9 - Decision del owner (2026-11-11): el rastro de una degradacion de polyfills en el arranque va por la opcion "console.warn en module scope + volcado con logClientError en root.tsx". Motivo del ask: un console.warn antes de installClientLog no se persiste en el log exportable, e importar logClientError dentro de polyfills.ts arrastra global-config a la primera evaluacion del bundle. Se anaden T11 y T12 (S7) y el estado queda en 4 advisories no bloqueantes del RDD de 44b0c6b9.
L10 (2026-11-11) - Cierre de T11/T12 (S7) en el commit `f974a24a`.
- Estado real de la lista de tareas reconciliado con `git log` (estaba obsoleta): T2 = `05c12161`; T6 = `2df7bba6` + `422d585b` + `33e70c49` + `bdb8f28c`; T7 = `66463de5` + `a56af8b4` + `64bbe3fc` + `5ecd73e0`; T8 = `44b0c6b9`. Siguen pendientes T3, T4, T5, T9 y T10.
- RED honesto: los 3 tests de huecos (estado mixto, `String(error)`, `Error` con mensaje vacio) pasaron ya en la primera corrida porque `describeFailure` ya implementaba ambas ramas; lo que faltaba de verdad era la captura y el volcado del reporte de arranque, y ese es el rojo observado (`readStartupPolyfillReport is not a function` + import sin resolver de `../startup-diagnostics`).
- Verde: 21 tests en los dos ficheros del modulo; suite completa del workspace 461 ficheros / 6383 tests; typecheck OK; eslint de los 5 ficheros tocados OK.
- FALLO PRE-EXISTENTE EN HEAD, no de este cambio: `pnpm lint` del workspace esta rojo por 5 errores `@typescript-eslint/no-wrapper-object-types` en `__tests__/deep-clone.test.ts` (lineas 247, 248, 249, 288, 305), fichero sin diff respecto a HEAD y heredado del commit `44b0c6b9`. Verificado ejecutando eslint sobre ese fichero. Bloquea el criterio S5 del feature y queda pendiente de decision del owner.
- RDD del commit: `review-50483731246ac81f` aprobado (candidato = `f974a24a` solo, base `a1b0e477`), autoridad quemada, `consumed_revision` sha256:4b90a79d. 5 advisories no bloqueantes emitidas por esa review: `R3-1` y `R4-flush-not-idempotent` (el volcado desde `Layout` no tiene guarda de una sola vez, se reemite en cada render), `R3-2` (el test del volcado sustituye `polyfills` con `vi.mock`, no prueba el cableado real hacia `logClientError` desde `root.tsx`), `R3-3` (el mensaje dice "degraded" tambien cuando el arranque entero fallo), `R4-module-graph-server-eval` (`root.tsx` arrastra `polyfills` al grafo del servidor).
L11 (2026-11-11) - Bloqueo de S5 cerrado. Los 5 errores `no-wrapper-object-types` de `__tests__/deep-clone.test.ts` (247, 248, 249, 288, 305) se arreglan quitando la anotacion de tipo (`Object(...)` ya devuelve `any` y el comentario/titulo del test documenta el encajonado). NO se usa `--fix`: habria escrito `number`/`string`/`boolean`, que es falso para un wrapper. Verificado: eslint del fichero exit 0, 30/30 tests del fichero, y `pnpm lint` completo 4/4 workspaces con `--max-warnings=0`.

L12 (2026-11-11) - T4/T9 cerrados en `e93a7403` (RDD `review-634a0da6ab6738f4`, lentes risk + reliability, approved, consumido sha256:797d5fa6). El generador v4 toma 16 bytes de `crypto.getRandomValues`, fuerza nibble de version 4 y variante 10xx, y emite el formato nativo 8-4-4-4-12 en minusculas; no cambia la forma de los ids ya persistidos. Se instala con `defineHidden` sobre el objeto `crypto` y nunca sobrescribe una implementacion existente. Si faltan `crypto` o `getRandomValues` lanza TypeError en vez de degradar a una fuente debil, y el aislamiento por instalador lo registra en `failed`. No se toco ninguna de las 12 llamadas de produccion ni las 2 ya protegidas.
- Verificado: RED 6 fallos / 14 pasados (incluido el test de acoplamiento con POLYFILLED_APIS), GREEN 20/20, suite del workspace 461 ficheros / 6386 pruebas, typecheck exit 0, `pnpm lint` 4/4 con `--max-warnings=0`.
- Un fallo intermitente pre-existente aparecio una vez en la suite completa (`catalog-price-mode.test.tsx`, `expected 'Unit' to be 'Wholesale'`); pasa aislado (7/7) y en la repeticion de la suite. No es de este cambio, pero queda anotado.
- Advisories nuevas de esa review, no bloqueantes: `R3-1` (las dos ramas de fallo del instalador no tienen test), `R3-2` (el fichero de test desreferencia `globalThis.crypto` al cargar, asi que el caso "sin Web Crypto" no es comprobable ahi), `R3-3` (no se aserta la ruta dominante: `randomUUID` nativo heredado del prototipo).

L13 (2026-11-11) - R3-1/R3-2/R3-3 cerrados en `e1a8e871` (RDD `review-7deb8bcf9805e956`, lente reliability, approved, consumido sha256:b4798a0e). Solo test: ramas de fallo sin `crypto` y sin `getRandomValues` (con sombra del global y asercion de `failed`), ruta del nativo heredado sin sobrescribir, y carga del fichero tolerante a un host sin Web Crypto (`it.skipIf`). Sin RED posible porque el comportamiento ya existia: cada test nuevo se probo con una mutacion temporal revertida y se reporto el fallo observado.
- Verificado: 23/23 en el fichero, suite del workspace 461 ficheros / 6389 pruebas, typecheck exit 0, `pnpm lint` 4/4.
- Advisories nuevas, no bloqueantes: `R3-coverage-skip` (WARNING, cierta: los tests generales de contrato y de estado mixto pasaron a `itWithCrypto`, asi que en un host sin Web Crypto se saltan, mientras los comentarios dicen que solo se saltan los tests de crypto), `R3-host-layout` (WARNING: el test del nativo heredado asume que `randomUUID` vive en el prototipo; en un host donde sea propiedad propia fallaria sin que el instalador tenga culpa), `R3-import-unproven` (SUGGESTION: el camino real de import en un host sin Web Crypto no se ejecuta; solo se prueba en tiempo de llamada).

L14 (2026-11-11) - Cierre de `R3-coverage-skip` y `R3-host-layout` en dos commits.
- `99c0f7a5` (RDD `review-2afae45020d922e7`, approved, quemado sha256:053ba629): 5 tests generales vuelven a `it` en todo host y el test del nativo heredado deja de asumir layout (identidad de funcion + descriptor propio sin cambios). Pero la review señalo que las expectativas se derivaban del propio reporte: tautologico. Esos dos WARNING eran ciertos.
- `291fc50c` (RDD `review-f3b6073be424a758`, approved, quemado sha256:de58ae8b): expectativas derivadas de `POLYFILLED_APIS` + una sola concesion de host explicita (`ALLOWED_EXTRA_FAILURES`), sin `first.failed` ni filtrado por nombre. Probado con dos mutaciones: un fallo de instalador no-crypto y un fallo del instalador de crypto en host con Web Crypto hacen fallar la suite (antes pasaban). Verificado: 23/23, suite 461/461 ficheros, 6389 pruebas, typecheck 0, `pnpm lint` 4/4.
- Advisories de la ultima review, no bloqueantes y NO perseguidas (patron treadmill ya documentado en esta repo): `R3-A1` (WARNING inferencial: la concesion fija asume que el resto de APIs se pueden instalar en cualquier host, p. ej. con intrinsecos congelados), `R3-A2` (SUGGESTION cierta: `DECLARED_APIS` sale de la tabla del test, asi que el acoplamiento con `POLYFILLED_APIS` en el test de contabilidad depende de otra asercion del fichero; conviene volver a comparar contra la lista de la politica ahi).

L15 (2026-11-11) - T3 cerrado en `3bdfa278` (RDD `review-1c3a82d03b106fe2`, lentes risk + reliability, approved, quemado). Regla `no-restricted-syntax` en `base.config.js` generada desde `BANNED_APIS`, con el mensaje exacto de S2 leyendo el piso desde `BROWSER_FLOOR.chrome` (sin 89 hardcodeado), severidad `error`, y nuevo `compat-policy.test.ts` (listas no vacias y disjuntas, `alternative`/`selector` presentes, cada polyfill declarado reinstalable).
- Decision del owner en esta sesion: la prohibicion aplica SOLO a codigo que se envia. Los `ignores` cubren `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`, `**/*.bench.*`, `e2e/**` y `scripts/**`. Motivo verificado: hay 0 llamadas de `structuredClone` en produccion (los 9 hits de `deep-clone.ts` son comentarios) y 13 llamadas reales en tests/bench, que existen para comparar contra el nativo.
- Prueba de mutacion: `structuredClone({a:1})` en un fichero de `app/` produce `structuredClone is not available in Chrome 89 (the project browser floor) and is not polyfilled. Use deepClone from '~/shared/lib/browser-compat/deep-clone'`; la misma llamada dentro de `__tests__` no dispara la regla (exit 0). Ambas revertidas.
- Verificado: `pnpm lint` 4/4, `pnpm typecheck` 5/5, `pnpm test` 462 ficheros / 6394 pruebas, y `compat-policy.test.ts` 5/5.
- CAVEAT de S5: `pnpm build` FALLA en este workspace antes de este cambio por `verify-csp`: el `.env` ambiente de `frontend-react` trae `API_URL=https://localhost:44320/api` y el guard exige origen propio. Con el valor documentado de despliegue (`API_URL=/api`) el build completo pasa (`verify-csp`, `verify-sw-precache`, `verify-landing-prerender` OK). Es configuracion de entorno pre-existente, no del cambio; S5 no puede declararse verde con el comando literal hasta que el owner decida sobre ese `.env`.
- Advisories de la review, no bloqueantes: `R3-config-wiring-unproved` (WARNING cierta: ningun test carga `base.config.js` para asertar que la regla existe y no degenera a `["error"]` sin restricciones), `R3-presence-not-behavior` (SUGGESTION: el test comprueba instalabilidad, no equivalencia semantica), `R3-table-drift` (SUGGESTION: `API_TARGETS` solo se valida en un sentido contra la politica).
