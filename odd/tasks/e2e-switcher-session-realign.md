# Feature: e2e-switcher-session-realign

## Objective

Cerrar la causa raíz de la ficha 03 (`store-switcher-refresh` SWR-1: "el botón de crear tienda nunca
aparece, timeout 120 s"): que la precondición del spec no dependa de la tienda que la sesión tenga
seleccionada **persistida en la base**, sino de la tienda de su snapshot.

## Problem / Why

Causa confirmada el 2026-10-06 (ficha
[`03-store-switcher-refresh-boton-crear-no-aparece.md`](../../docs/testing/known-issues/2026-10-06-e2e-verification/03-store-switcher-refresh-boton-crear-no-aparece.md)
+ demo determinista): `User.SelectedStoreId` se persiste server-side (`SwitchMyStoreCommand.cs:98`) y
`/me` devuelve los módulos de **esa** tienda (`GetMeQuery.cs:103`). Una tienda creada por la interfaz
nace en el plan Pago y `CreateStoreCommand` la clampa a ese catálogo, que **no incluye MultiStores
(14)**. Si un archivo anterior del mismo worker dejó ahí la selección (el spec vecino
`store-switch-back-logout` la persiste al cambiar de tienda), el spec siembra el 14 en una tienda que
nadie mira, `my-stores.tsx:37` queda false y el clic agota los 120 s del test.

## Scope

- `frontend-react/e2e/store-switcher-refresh.spec.ts` — único archivo de código tocado.
  - Helper nuevo `realignSelectedStore(page, storeId)`: `PUT /v1/stores { storeId }`
    (`SetMyStoreCommand`, que persiste la selección; no-op cuando ya coincide), el mismo realineado
    que el spec vecino aplica desde el 2026-09-26 (`realignBackendSelectedStore`).
  - Llamada al helper **antes** de `seedMultiStoresModule` + `refreshSessionFromMe`, en SWR-1 y SWR-2.
  - Nota de cabecera "SETUP — REALIGN" con la causa raíz y su fecha.

## Constraints (NON-NEGOCIABLE)

- **Autorización 1 a 1**: alcanza solo a este archivo y a este cambio (pedido del usuario,
  2026-10-06: "Arregla la precondición de sesión de store-switcher-refresh (SWR-1 y SWR-2)").
- No se toca ningún otro E2E ni support file; tampoco `frontend/` (Angular congelado) ni código de
  producción del backend.
- La ficha 04 (locator `getByText('Actual')` de SWR-2) queda **fuera** de este cambio: SWR-2 conserva
  su defecto intermitente documentado y no se "arregla" acá.
- Nunca la suite completa: la verificación es dirigida (`--workers=1 --retries=0`).

## Tasks

- [x] **T1** — Helper `realignSelectedStore` + llamada en SWR-1/SWR-2 + nota de cabecera.
- [x] **T2** — Corrida en solitario del spec → `2 passed (45.1s)`.
- [x] **T3** — Escenario del drift (`SSR-1` + `SWR-1`, un solo worker, sonda de BD) → `2 passed
      (2.3m)`, `EXITCODE=0`.
- [x] **T4** — Limpieza de la instrumentación temporal y verificación de integridad de los docs.

## Authorized scope

`frontend-react/e2e/store-switcher-refresh.spec.ts` y los `.md` de `docs/testing/known-issues*` /
`odd/`. Cualquier otro archivo requiere parar y preguntar.

## Acceptance criteria

- [x] SWR-1 y SWR-2 pasan en solitario: `2 passed`, exit 0.
- [x] Con la selección persistida dejada por SSR-1 en una tienda sin el módulo 14, SWR-1 realinea y
      completa su flujo (crea su tienda): `2 passed`, exit 0.
- [x] Ningún otro E2E ni código de producción modificado.

## Verification (observed)

```
cd frontend-react
npx playwright test e2e/store-switcher-refresh.spec.ts --workers=1 --retries=0 --reporter=line
# 2 passed (45.1s)

# escenario del drift — un worker, dos archivos:
#   [1/2] store-switch-back-logout.spec.ts  SSR-1  → deja la selección en B (sin el 14)
#   [2/2] store-switcher-refresh.spec.ts    SWR-1  → realinea y pasa
# 2 passed (2.3m) · EXITCODE=0

# sonda de BD (solo cambios):
# 15:33:15  sel=e2e-ssr-second-1791300784013 (module14=0, stores=2)   ← drift que dejó SSR-1
# 15:33:20  sel=E2E Store 20261006T113239-7fjx25 (module14=1, stores=2)  ← realineado de SWR-1
# 15:33:23  sel=E2E Store 20261006T113239-7fjx25 (module14=1, stores=3)  ← SWR-1 creó su tienda
```


## 2026-10-06 (tarde) — cierre ficha 02: causa raíz definitiva y fix (opciones 2+3+4)

- Causa raíz con trace: `POST /v1/auth/register` → `net::ERR_ABORTED` bajo contención; la app
  pinta el diálogo "Ocurrió un error inesperado en la creación de la cuenta" (es.ts:193) y el
  `waitForURL` de `mintOwnerAdmin` (session.ts:255) no expiraba nunca: `waitForURL` resuelve por
  `navigationTimeout`, cuyo default del runner es 0 = sin límite (verificado en el fuente de
  Playwright 1.62.1, no en la doc). El `actionTimeout` de la opción 2 no cubre esa familia.
- Fix: config `navigationTimeout: 60_000` + `workers` local default 4 (antes `undefined` = 8
  con esta máquina); `session.ts` mint acotado (race espera-vs-diálogo, 30 s) con 1 retry
  (identidad/contexto nuevos) y error nombrado al agotar; timeout del spec de vuelta a
  `120_000` (el `240_000` se revirtió por pedido del usuario: diagnosticar, no tapar).
- Prueba:
  - solitario: `npx playwright test e2e/store-create-security.spec.ts --workers=1 --retries=0`
    → 2 passed (18.6 s), EXIT=0
  - estrés (8 specs / 27 tests, --workers=16 --retries=0 --trace on): 19 passed / 5 failed —
    los 5 son specs ajenos (contención, mezcla distinta a la corrida anterior); los 4 que antes
    caían con "while setting up signedInPage" pasan; 0 colgaderos silenciosos
  - modo oficial (--workers=4, ya default del config): 27 passed (42.2 s), EXIT=0
- Docs: ficha 02 (sección definitiva), README.md de la carpeta, funcionan-en-solitario.md,
  known-issues.md (fila 2). Sin tocar ningún test E2E existente.
