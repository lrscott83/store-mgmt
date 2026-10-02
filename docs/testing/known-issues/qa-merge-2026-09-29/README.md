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
| 3  | `web-catalog`              | Crear producto en POS, sincronizar, editarlo y verlo publicado                           | El producto no aparece en el catálogo público después de sincronizar                      | 🔍 Sin verificar |
| 4  | `mayorista-sale`           | Venta mayorista con Transferencia (CUP) filtrable por método de pago                      | La opción de pago Transferencia (CUP) nunca se renderiza (timeout 120 s)                   | 🔍 Sin verificar |
| 5  | `precache-split` (2 tests) | Los chunks de rutas Owner/StoreUser están precacheados                                    | El service worker nunca llega a estado activado (timeout 30 s)                             | 🔍 Sin verificar |
| 6  | `store-switcher-refresh`   | Una tienda creada en la sesión aparece en el switcher del header sin re-login             | El botón de crear tienda nunca aparece (timeout 120 s)                                     | 🔍 Sin verificar |
| —  | **Defecto sistémico**      | El dev server sirve la versión vigente de los paquetes del workspace                      | No es un test: `vite.config.ts` deja un caché de Vite que puede servir un `dist/` viejo    | 🔴 **Abierto — ver ficha 7** |

**Los fallos 1 y 2 NO eran de la app ni del backend.** Eran el mismo defecto: el caché de
dependencias optimizadas de Vite servía un `@store-mgmt/domain` viejo. El módulo de la ruta
`store-list.tsx` fallaba al cargar con un `SyntaxError`, y React Router lo reportaba como
`No result returned from dataStrategy`. Resueltos borrando
`apps/web-store-pos/node_modules/.vite` — **sin tocar la app ni los tests**.

**Lo que queda abierto** es si los fallos 3 a 6 son víctimas del mismo caché o defectos
reales e independientes. No se reprodujeron.

Cada fallo tiene su ficha individual en esta carpeta.

**Tests E2E del backend (mismo día):** 660 passed, 0 failed. Sin relación con estos fallos.
