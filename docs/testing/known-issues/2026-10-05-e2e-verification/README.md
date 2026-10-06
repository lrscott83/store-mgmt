# Corrida del 2026-10-05 — suite E2E completa del frontend (rama test)

**Resultado: cero tests fallidos.** 354 tests ejecutados: **351 aprobados + 3 inestables
(flaky), 0 fallidos**, 12.2 minutos, exit code 0. No se creo ninguna ficha por test fallido
porque no hubo ninguno; las tres fichas de esta carpeta son de los **inestables**, que si
fallaron en su primer intento (Playwright los reintenta y pasan).

## Como se corrio

| Pieza | Detalle |
| --- | --- |
| Backend | perfil `http-e2e` en `:5019`, guard confirmado: `Database=smca_test` |
| Comando | `pnpm test:e2e --workers=4` desde `frontend-react/` |
| Duracion | 12.2 min (archivo mas lento: `movement-reversal.spec.ts`, 5.9 min) |
| Log | `/tmp/e2e-full.log` |
| Teardown | OK — 2988 filas `e2e-*` borradas de `smca_test` (Store 54, Product 1, ProductImage 1, ProductCategory 1, StoreUser 8, User 54, Owner 46, StoreModule 568, StoreRoleFeature 2105, StoreUsage 79) |

Es la continuacion directa de la corrida del 2026-10-04 (346 aprobados, 2 fallidos):
esos dos fallidos se corrigieron el mismo 2026-10-04 (`web-catalog`, `mayorista-sale`,
commit `ede7e030`) y esta corrida confirma que quedaron cerrados. **La suite entera esta
en verde.**

## Los 3 inestables

Los tres fallaron en el intento 1 y pasaron en el reintento. Ninguno se diagnostico a fondo:
lo que hay es el estado de la pagina en el momento del fallo (los `error-context.md` que
Playwright conserva de los intentos fallidos), y esta escrito en su ficha con la causa raiz
marcada como **no confirmada** cuando corresponde.

| # | Test | Que se vio en el fallo |
| --- | --- | --- |
| 1 | `change-password.spec.ts:126:5` — "offline: el boton de envio esta deshabilitado" | La asercion de 5 s no encuentra el boton: la pagina estaba vacia (solo la region de notificaciones) |
| 2 | `store-create-security.spec.ts:88:7` — "StoreUser en /management/stores/create es deslogueado y redirigido a /login" | `Test timeout of 120000ms exceeded while setting up "signedInPage"`: la portada publica seguia en "Cargando..." |
| 3 | `store-switcher-refresh.spec.ts:173:5` — "SWR-1 — a store created this session appears in the header switcher without re-login" | `/management/my-stores` pinto sus tarjetas pero sin el boton de crear (el gate `hasMultiStores` en falso) |

Nota sobre los conteos: `SWR-2` (`store-switcher-refresh.spec.ts:196`) tambien aparece en la
fase de reintentos porque comparte bloque serial con SWR-1 — al fallar SWR-1 el bloque se
reinicia desde cero en el reintento. Nunca fallo y por eso no cuenta como inestable. Los
"351 aprobados" son tests que pasaron al primer intento.

## Lo que cerro esta corrida

Con 0 fallidos, varias fichas de corridas anteriores quedaron sin destinatario: los tests que
describian pasaron en esta corrida completa (varios ya venian arreglados y verificados, otros
no se habian vuelto a correr desde su diagnostico). Se retiraron sus archivos y el detalle del
cierre quedo en el README de cada carpeta:

- `../2026-10-01-e2e-verification/` — sus 6 fichas (1 a 6), retiradas.
- `../qa-merge-2026-09-29/` — fichas 1 a 4 y 6, retiradas; quedan la 5 (`precache-split`, sin
  verificar) y la 7 (defecto sistemico del cache de Vite, abierto).

## Lo que sigue sin verificar

- `precache-split` (2 tests): el spec esta en `testIgnore` del config principal, asi que la
  suite por defecto no lo ejecuta. Solo corre con `playwright.pwa.config.ts`. Esta corrida
  no puede cerrarlo. Ficha: `../qa-merge-2026-09-29/05-precache-split.md`.
- El defecto sistemico del cache de dependencias de Vite (`optimizeDeps.include` en
  `apps/web-store-pos/vite.config.ts`) sigue abierto y sin decision tomada: ficha
  `../qa-merge-2026-09-29/07-vite-dep-cache-stale.md`.

## Regla de la carpeta

Esta carpeta sigue el contrato de fichas documentado en el indice maestro
[`../../known-issues.md`](../../known-issues.md), seccion "Contrato de una ficha de test
fallido". Cualquier corrida E2E nueva empieza leyendo ese indice.
