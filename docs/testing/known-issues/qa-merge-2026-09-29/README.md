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
| 5  | `precache-split` (2 tests) | Los chunks de rutas Owner/StoreUser están precacheados                                    | El service worker nunca llega a estado activado (timeout 30 s)                             | ⚠️ **Sin verificar** — spec en `testIgnore`; solo corre con `playwright.pwa.config.ts`. Queda la ficha 5 |
| 6  | `store-switcher-refresh`   | Una tienda creada en la sesión aparece en el switcher del header sin re-login             | El botón de crear tienda nunca aparece (timeout 120 s)                                     | ⚪ **Reapareció el 2026-10-05** como inestable — ficha 6 retirada, superseded por `../2026-10-05-e2e-verification/03-store-switcher-refresh-boton-crear-no-aparece.md` |
| —  | **Defecto sistémico**      | El dev server sirve la versión vigente de los paquetes del workspace                      | No es un test: `vite.config.ts` deja un caché de Vite que puede servir un `dist/` viejo    | 🔴 **Abierto — ver ficha 7** |

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
- **Ficha 5 (`precache-split`) — se queda.** Su spec está en `testIgnore` del config principal, así
que la suite por defecto no lo ejecuta; ninguna corrida completa puede cerrarla. Sigue sin verificar.
- **Ficha 6 (`store-switcher-refresh`) — retirada, pero el modo de fallo volvió.** El 2026-10-04 se
había cerrado como "no se reproduce" (2/2 verdes) sin investigar la causa. El 2026-10-05 el test
SWR-1 falló en su primer intento bajo la carga de la suite completa y pasó en el reintento: el mismo
síntoma de esta ficha (el botón de crear tienda nunca aparece, timeout 120 s). Esta vez se conservó
el snapshot del fallo, que muestra la ruta pintada sin el botón. La ficha viva es
`../2026-10-05-e2e-verification/03-store-switcher-refresh-boton-crear-no-aparece.md`.
- **Ficha 7 (`vite-dep-cache-stale`) — se queda.** Defecto sistémico del caché de dependencias de
Vite; sigue abierto y sin decisión tomada (`optimizeDeps.include` en `vite.config.ts`).


**Tests E2E del backend (mismo día):** 660 passed, 0 failed. Sin relación con estos fallos.
