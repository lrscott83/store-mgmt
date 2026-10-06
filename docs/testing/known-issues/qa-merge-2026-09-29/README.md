# Corrida 2026-09-29 — fallos traídos por el merge de qa

**Contexto.** Suite completa E2E del frontend contra backend real (`:5019`, BD `smca_test`),
4 workers, tras hacer merge de `origin/qa` en `test`. La última corrida conocida
(2026-09-25) tuvo **0 fallos**. Estos 8 fallos son **nuevos** — los trajo el merge.

**Resultado:** 8 fallos (7 únicos + 1 retry).

## Estado tras la investigación del 2026-09-30

| #  | Spec                       | Qué prueba                                                                                | Qué fallaba                                                                                | Estado |
|----|----------------------------|-------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|--------|
| 1  | `store-module-pricing`     | El engranaje abre el modal con el nombre de la tienda y su universo de módulos             | El botón de acciones de la tienda no aparecía — la pantalla de tiendas no cargaba datos  | ✅ **Resuelto** (8/8) |
| 2  | `plan-catalog-superadmin`  | El popup muestra los cuatro paneles de planes incluyendo VIP                              | Ídem — el botón de acciones de la tienda no aparecía                                       | ✅ **Resuelto** (2/2) |
| 3  | `web-catalog`              | Crear producto en POS, sincronizar, editarlo y verlo publicado                           | El producto no aparece en el catálogo público después de sincronizar                      | ✅ **Resuelto 2026-10-04** — defecto del test (esperaba el aviso de guardado por producto) |
| 4  | `mayorista-sale`           | Venta mayorista con Transferencia (CUP) filtrable por método de pago                      | La opción de pago Transferencia (CUP) nunca se renderiza (timeout 120 s)                   | ✅ **Resuelto 2026-10-04** — defecto del test (con el módulo 15 el sufijo de moneda se omite) |
| 5  | `precache-split` (2 tests) | Los chunks de rutas Owner/StoreUser están precacheados                                    | El service worker nunca llega a estado activado (timeout 30 s)                             | ✅ **Resuelto 2026-10-06** — corría con el config equivocado (dev server con los service workers bloqueados); ficha retirada, cierre abajo |
| 6  | `store-switcher-refresh`   | Una tienda creada en la sesión aparece en el switcher del header sin re-login             | El botón de crear tienda nunca aparece (timeout 120 s)                                     | ⚪ **Reapareció el 2026-10-05** como inestable — ficha 6 retirada, superseded por `../2026-10-05-e2e-verification/03-store-switcher-refresh-boton-crear-no-aparece.md` |
| —  | **Defecto sistémico**      | El dev server sirve la versión vigente de los paquetes del workspace                      | No es un test: `vite.config.ts` deja un caché de Vite que puede servir un `dist/` viejo    | ✅ **Resuelto 2026-10-02** (commit `d6f47d53`, Opción A); ficha retirada el 2026-10-06 |

**Los fallos 1 y 2 NO eran de la app ni del backend.** Eran el mismo defecto: el caché de
dependencias optimizadas de Vite servía un `@store-mgmt/domain` viejo. El módulo de la ruta
`store-list.tsx` fallaba al cargar con un `SyntaxError`, y React Router lo reportaba como
`No result returned from dataStrategy`. Resueltos borrando
`apps/web-store-pos/node_modules/.vite` — **sin tocar la app ni los tests**.

**Lo que quedó abierto** era si los fallos 3 a 6 eran víctimas del mismo caché o defectos reales e
independientes. Se respondió por partes: los fallos 3 y 4 (2026-10-04) eran defectos de sus propios
tests, no del caché; el fallo 6 volvió a fallar el 2026-10-05 (inestable, sin causa confirmada) y el
fallo 5 sigue sin poder verificarse porque su spec no corre en esta suite.

## Cierre del 2026-10-05 — quedan 2 fichas

La corrida completa del 2026-10-05 (351 aprobados, 0 fallidos, 3 inestables, exit 0; detalle en
[`../2026-10-05-e2e-verification/README.md`](../2026-10-05-e2e-verification/README.md)) ejecutó los
tests de las fichas 3, 4 y 6 y ninguno falló de forma determinista. Estado de la carpeta:

- **Fichas 1 a 4 y 6 — retiradas.** Su contenido quedó resumido en la tabla de arriba. Los fallos 1
y 2 eran el defecto sistémico del caché de Vite (ficha 7); los fallos 3 y 4 eran defectos del test
y se corrigieron con autorización el 2026-10-04 (commit `ede7e030`, verificado en la corrida de ese
día y en la completa del 2026-10-05).
- **Ficha 5 (`precache-split`) — resuelta y retirada el 2026-10-06.** El spec corría con el config
  equivocado, no con el que le corresponde: el dev server bloquea los service workers. Ver
  [Cierre del 2026-10-06](#cierre-del-2026-10-06--las-dos-fichas-vivas-quedaron-resueltas-y-se-retiran).
- **Ficha 6 (`store-switcher-refresh`) — retirada, pero el modo de fallo volvió.** El 2026-10-04 se
había cerrado como "no se reproduce" (2/2 verdes) sin investigar la causa. El 2026-10-05 el test
SWR-1 falló en su primer intento bajo la carga de la suite completa y pasó en el reintento: el mismo
síntoma de esta ficha (el botón de crear tienda nunca aparece, timeout 120 s). Esta vez se conservó
el snapshot del fallo, que muestra la ruta pintada sin el botón. La ficha viva es
`../2026-10-05-e2e-verification/03-store-switcher-refresh-boton-crear-no-aparece.md`.
- **Ficha 7 (`vite-dep-cache-stale`) — resuelta y retirada el 2026-10-06.** El arreglo (la Opción A)
  ya estaba aplicado desde el 2026-10-02: `optimizeDeps.include` ya no está en `vite.config.ts`
  (commit `d6f47d53`). Ver
  [Cierre del 2026-10-06](#cierre-del-2026-10-06--las-dos-fichas-vivas-quedaron-resueltas-y-se-retiran).


**Tests E2E del backend (mismo día):** 660 passed, 0 failed. Sin relación con estos fallos.

---

## Cierre del 2026-10-06 — las dos fichas vivas quedaron resueltas y se retiran

### Ficha 5 (`precache-split`) — ✅ resuelta: el spec corría con el config equivocado

**Qué pasaba realmente.** El modo de fallo no era de la aplicación ni del entorno: el spec se
ejecutaba **contra el dev server** con `playwright.config.ts`, un config que **bloquea los service
workers** (`contextOptions: { serviceWorkers: 'block' }`, `playwright.config.ts:139`) y cuyo SW de
dev **no precachea nada** (`injectManifest.globPatterns: []` en `apps/web-store-pos/vite.config.ts`,
diseño D10). Con los service workers bloqueados, `navigator.serviceWorker.ready` no resuelve nunca
y `waitForControlledServiceWorker` (`e2e/precache-split.spec.ts:31`) muere dentro de su poll. Como
el poll declara 30 s y el timeout por test de ese config también es 30 s, el fallo se reportaba
siempre como `Test timeout of 30000ms exceeded` y la causa real no se veía.

**Precondición que se confirmó primero (y que hay que cuidar).** El registro del SW arranca 5 s
después del boot (`app/root.tsx:112`, `setTimeout(..., 5000)`). Eso funciona porque
`workbox-window` solo espera el evento `load` si el documento todavía no está completo
(`workbox-window.prod.es5-*.js`: `if(!e&&document.readyState!=="complete")return …addEventListener("load",…)`);
a los 5 s el documento ya está `complete`, así que registra enseguida. Si el registro se adelantara
al `load`, el poll de 30 s volvería a ser el síntoma.

**Reproducción del modo de fallo (prueba de mutación).** Se copió `playwright.config.ts` a un
config temporal con `testIgnore: []` — nada más — para devolver el spec al config donde falló el
2026-09-29:

```
cd frontend-react
npx playwright test --config=playwright.tmp-repro.config.ts precache-split --reporter=line --retries=0
# 3 failed — Error: Test timeout of 30000ms exceeded (precache-split.spec.ts:31)
# EXITCODE=1
```

Las tres pruebas caen en la misma línea y con el mismo texto que la ficha del 2026-09-29. El config
temporal se borró al terminar la medición y no forma parte del repo.

**Arreglo (ya aplicado el 2026-10-01, commit `78f3d804`).** El spec entró en el `testIgnore` del
config principal y pasa a correr solo con `playwright.pwa.config.ts` (`vite preview` del build real
sobre :4173, service workers permitidos) — el mismo patrón que `offline-shell` ya seguía.

**Verificación (2026-10-06) con el config correcto:**

```
pnpm --filter @store-mgmt/web-store-pos build
npx playwright test --config=playwright.pwa.config.ts precache-split --reporter=line
# 3 passed (21.1s)   EXITCODE=0
```

También 3 passed (12.9 s, EXITCODE=0) contra el build que ya existía del 2026-10-03, antes de
recompilar. El paso de build imprime `verify-sw-precache: OK — 192 precached entries; shell and
route manifest each present exactly once; all 7 required families at their declared counts.`

> Nota: `pnpm build` termina con **exit 1 en esta máquina**, en el ÚLTIMO paso (`verify-csp`),
> porque el `API_URL` del `.env` local apunta a otro origen (`https://localhost:44320/api`). Es el
> verificador haciendo su trabajo contra una config de dev, no un fallo del precache: `build-sw` y
> `verify-sw-precache` ya habían pasado y `build/client/` quedó completo. No se tocó nada.

**Riesgo residual (no bloqueante).** El helper de espera no afirma ninguna precondición antes de
pollear (la lección de `AGENTS.md`, *assert the precondition first*): si el SW no se registra, el
fallo se reporta como timeout del test y no dice por qué. Endurecerlo sería tocar un test E2E
existente → requiere autorización 1 a 1.

**Estado final:** ✅ resuelto (2026-10-06). Ficha retirada.

### Ficha 7 (`vite-dep-cache-stale`) — ✅ resuelta: la Opción A ya se había aplicado el 2026-10-02

**La ficha estaba desactualizada.** La Opción A recomendada — quitar `optimizeDeps.include` de
`apps/web-store-pos/vite.config.ts` — se aplicó en el commit **`d6f47d53`** (2026-10-02,
*fix(dev): stop pre-bundling @store-mgmt/domain so a stale dep cache cannot ship*), tres días antes
de la corrida del 2026-10-05. El archivo ya no contiene el bloque.

Estado actual comprobado:

```
git grep -n "optimizeDeps" HEAD -- apps/web-store-pos/vite.config.ts   # sin resultados (exit 1)
ls apps/web-store-pos/node_modules/.vite/deps/ | grep -i store-mgmt     # sin resultados
```

**Efecto.** Vite ya no pre-empaqueta el paquete del workspace: lo sirve directo desde
`packages/domain/dist/`, que turbo compila antes de arrancar el dev server (`dev` →
`dependsOn: ["^build"]`). El modo de fallo (`SyntaxError: does not provide an export named`, que
React Router disfraza de `No result returned from dataStrategy`) **deja de ser posible por
construcción**, no por disciplina. Coste medido, documentado en ese commit: una petición pasa a 39 y
el payload de 27 KB a 266 KB por el sourcemap inline — solo en dev, el build de producción no usa
`optimizeDeps`.

**Verificación.** La corrida completa del 2026-10-05 (351 aprobados, 0 fallidos, 3 inestables,
`--workers=4`, EXITCODE=0) es **posterior** al fix: es exactamente la re-corrida de la suite que la
decisión pedía. El diagnóstico sobrevive en el índice maestro, sección *Defecto sistémico confirmado
el 2026-09-30*.

**Decisión que sobrevive (no es de esta ficha).** Reforzar `e2e/admin-routes.spec.ts`: pasaba en
verde mientras la app estaba rota porque solo afirma que el pathname no es `/login` y que el body
tiene texto. Es modificar un test E2E existente → **requiere autorización 1 a 1**.

**Estado final:** ✅ resuelto (2026-10-06; aplicado el 2026-10-02). Ficha retirada.

**No quedan fichas vivas en esta carpeta.**
