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
- `../qa-merge-2026-09-29/` — fichas 1 a 4 y 6, retiradas. Las dos que quedaban vivas (5 y 7)
  **se cerraron y retiraron el 2026-10-06**: ver
  [`../2026-10-06-e2e-verification/README.md`](../2026-10-06-e2e-verification/README.md).

## Cierre del 2026-10-06 — no queda nada sin verificar de esta corrida

- **`precache-split` (2 tests) — cerrado.** Corría con el config equivocado, no con el que le
  corresponde: el config principal bloquea los service workers. Con `playwright.pwa.config.ts`
  pasa **3/3** (21.1 s, exit 0) y el fallo se reprodujo a voluntad devolviéndolo al config
  equivocado. Cierre en `../qa-merge-2026-09-29/README.md`.
- **El defecto sistemico del cache de dependencias de Vite — cerrado.** La Opcion A
  (`optimizeDeps.include` fuera de `vite.config.ts`) ya estaba aplicada desde el 2026-10-02
  (commit `d6f47d53`); esta corrida del 2026-10-05, posterior al fix, es su verificacion.
- **Los tres inestables de esta corrida — re-verificados en solitario el 2026-10-06.** Las fichas
  1 y 2 pasan solas (50.0 s y 42.6 s); SWR-1 (ficha 3) tambien. El archivo del switcher esconde un
  **cuarto** hallazgo: SWR-2 cae en solitario (1 de 2 corridas) por un locator ambiguo — defecto del
  test, con ficha nueva en
  [`../2026-10-06-e2e-verification/01-store-switcher-refresh-swr2-locator-actual.md`](../2026-10-06-e2e-verification/01-store-switcher-refresh-swr2-locator-actual.md).
- Evidencia en solitario de los tres:
  [`../funcionan-en-solitario/README.md`](../funcionan-en-solitario/README.md).

## Regla de la carpeta

Esta carpeta sigue el contrato de fichas documentado en el indice maestro
[`../../known-issues.md`](../../known-issues.md), seccion "Contrato de una ficha de test
fallido". Cualquier corrida E2E nueva empieza leyendo ese indice.
