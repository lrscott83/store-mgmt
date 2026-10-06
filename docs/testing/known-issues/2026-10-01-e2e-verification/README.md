# Corrida 2026-10-01 — verificación E2E backend + frontend (rama `test`)

**Contexto.** Verificación de los tests E2E siguiendo el procedimiento del README del root
(sección "Suite de tests — ejecución manual"): primero backend, después frontend. Dos
momentos: backend en `f2b53081` (merges de `origin/qa` y `origin/dev` del 2026-09-30/10-01)
y frontend tras fast-forward a `eca8b499` (merge de qa del 2026-10-01: chat siempre visible,
web-catalog editable).

**Resultado.**

| Suite | Resultado | Estado |
|---|---|---|
| Backend E2E (`SMCA.WebApi.E2ETests`, @ `f2b53081`) | **678/678 passed** (4 m 31 s) | ✅ Sin novedades — no hay fichas |
| Frontend E2E, primer intento (@ `f2b53081`) | **0 tests ejecutados** — aborta en el preflight | ✅ Cerrado — ficha 1, fix del guard aplicado y verificado |
| Frontend E2E, corrida real (@ `eca8b499`, 4 workers, `--max-failures=1`) | **4 failed / 5 flaky / 92 passed / 252 did not run** (5.1 m), corte al primer fallo | ✅ Cerrado — ficha 2, fix del spec aplicado y verificado 12/12 ×2 |
| `sync-export-import-v2.spec.ts` (aislado, misma sesión) | **2 failed** (T1, T2) — copia del mismo whitelist | ✅ Cerrado — ficha 3, mismo fix aplicado y verificado 2/2 |
| Frontend E2E, corrida COMPLETA sin corte (@ `eca8b499`, 4 workers, 15.5 m) | **321 passed / 3 failed / 13 flaky / 16 did not run** | 🟡 Ver detalle abajo — los 3 fixes propios pasaron |

## Backend E2E — sin novedades

`dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` contra PostgreSQL
real (`smca_test`), como manda el README: **678 passed, 0 failed**. Son 7 tests más que la
última corrida conocida (671, 2026-09-29): los nuevos de Plans
(`PlanChangeRoleReactivationTests`, `PlanModuleConvergenceTests`) que llegaron con el merge
de qa. Nada que documentar.

## Frontend E2E, primer intento — la suite no arrancaba (defecto del guard de preflight) — CERRADO

Dos intentos de `pnpm test:e2e --workers=4` con el backend `http-e2e` correcto en `:5019`
(guard de arranque confirmó `Database=smca_test`) terminaron en **exit 1 antes de ejecutar
un solo test**: el guard preflight `assertDevServerBackend` (`e2e/support/dev-server-guard.ts`,
invocado desde `globalSetup`) aborta la corrida creyendo que el dev server apunta a otro
backend. El diagnóstico es una **causa raíz confirmada** con evidencia directa, no una
hipótesis: el guard confunde el comodín `ws:` del CSP de SignalR (llegado con el merge de
qa) con el origen de la API. Detalle completo en la ficha 1.

**Resolución:** el usuario autorizó el fix propuesto; se aplicó (filtrar también los tokens
exactos `ws:`/`wss:` en `apiOriginFromCsp`) y se verificó con el backend real corriendo
`pnpm test:e2e e2e/api-health.spec.ts --workers=1`: 2 passed (11.3 s), el guard volvió a
encontrar `http://localhost:5019`. Fix sin commitear. La suite ya arranca — ver corrida real
más abajo.

## Frontend E2E, corrida real — 4 failed por el chat siempre montado (ficha 2)

Con el guard arreglado, la suite corrió por primera vez desde el merge de qa:
`pnpm test:e2e --workers=4 --max-failures=1` (corte al primer fallo, como se pidió).
Detuvo la corrida al agotar reintentos el primer test afectado; los otros 3 fallidos
eran in-flight al momento del corte. Los 4 failed son del mismo spec y comparten causa
raíz: **el chat (MessageShell) se monta siempre desde el merge de qa (`77cf94af`) y, con
red disponible, dispara negotiate de SignalR + GET conversations**, rompiendo el invariante
de cero requests de `login-offline.spec.ts`. Causa raíz confirmada con reproducción 6/6
(3 corridas con backend, 3 sin backend — el fallo es independiente del backend). Detalle
completo y opciones de resolución en la ficha 2.

Los 5 flaky (pasaron en retry: admin-routes FC-D4, category-crud S2-A2, change-password,
channel-rates-catalogue, create-store-user) **no se diagnosticaron**: la instrucción fue
parar en el primer fallo. Quedan pendientes de la re-corrida completa que seguirá a la
resolución de la ficha 2, junto con la re-verificación de los fallos históricos
(`mayorista-sale`, `web-catalog`, `store-switcher-refresh`, etc.) que nunca llegaron a
correr en esta corrida (252 did not run por el corte).

**Resolución de la ficha 2:** el usuario fijó la regla de negocio — el chat está SIEMPRE
visible para el Owner autenticado y su tráfico de mensajería es comportamiento correcto.
Con autorización 1 a 1 se amplió el whitelist de `login-offline.spec.ts`
(`KNOWN_BACKGROUND_PATHS`: telemetría + `/hubs/messages` + `/api/v1/messages`; el invariante
de cero AUTH y cero products/categories queda intacto). Verificado: el spec completo
**12/12 passed, dos corridas consecutivas** (23.6 s, 20.8 s). Sin commitear.

**Resolución de la ficha 3:** con la misma autorización 1 a 1 se aplicó el fix idéntico a
la copia del whitelist en `sync-export-import-v2.spec.ts`. Verificado: **2/2 passed**
(19.4 s). Sin commitear.

**Estado final de la sesión:** 3 fichas, las 3 cerradas con fix aplicado y verificado
(guard del dev server, whitelist de login-offline, whitelist de sync-export-import-v2).
Verificación pendiente al cierre de las fichas: re-corrida completa — ejecutada más abajo.
Los 3 cambios de código siguen **sin commitear**.

## Corrida completa sin corte — estado real de los 353 tests

`pnpm test:e2e --workers=4` (sin `--max-failures=1`), backend `http-e2e` en :5019, con los
3 fixes propios aplicados. **15.5 min:**

| Resultado | Cantidad |
|---|---|
| passed | **321** |
| failed | **3** |
| flaky (pasaron en retry) | **13** |
| did not run (saltos de `describe.serial` tras fallos) | **16** |

**Los 3 fixes de esta sesión pasaron:** `login-offline.spec.ts` (los 4 tests de la ficha 2),
`sync-export-import-v2.spec.ts` (los 2 de la ficha 3) y todo lo demás. Los 5 flaky de la
corrida cortada (admin-routes FC-D4, category-crud, change-password, channel-rates,
create-store-user) **pasaron limpios sin retry** en esta corrida.

**Los 3 failed (sin diagnosticar — la instrucción fue solo correr y reportar):**

1. `mayorista-sale.spec.ts:218` — "venta mayorista con Transferencia (CUP) queda filtrable
   por método de pago": `locator.click: Test timeout of 120000ms exceeded` en el resumen
   de transferencia (líneas 239-242). **Es el MISMO fallo histórico** de la corrida de
   `78f3d804` (radio Transferencia nunca aparece) — nunca llegó a reproducirse en
   solitario; ahora vuelve a manifestarse en corrida completa.
2. `movement-reversal.spec.ts:557` (E-R7, "transferencia editada a otro destino"):
   `expect(warehouses-page-title).toBeVisible() — element(s) not found` (línea 107).
3. `web-catalog.spec.ts:77` — "crear el producto en el POS, sincronizar, ponerle imagen y
   verlo publicado": `expect('Producto guardado en el catálogo').toBeVisible() — element(s)
   not found` (línea 137). Spec reescrito en `78f3d804` (pasaba en solitario); el merge de
   qa tocó fuerte `web-catalog.tsx` (+249 líneas, editor con guardado por lotes
   `bb7967ce`) — puede ser regresión del merge o del propio rewrite.

**Los 13 flaky** (pasaron en retry, no diagnosticados — no era el pedido):
edit-delete-order S2-B2, elaboration, entry-cost-guard E-CG-1, movement-reversal E-R2,
multipayments-cart-v2, multipayments T10.2, store-create-security, store-switch-back-logout
SSR-1, warehouse-cost-propagation E-CP-1, warehouse-movement-edit-cap E-UI-2,
warehouse-movements-extended, wholesale-scanner (×2).

**Los 16 did not run:** saltos de los `describe.serial` (mayorista, web-catalog y afines)
tras los fallos — se completarían en la corrida que resuelva los 3 failed.

**Diagnóstico pedido (post-corrida completa) — estado al cierre:**

- **1) `mayorista-sale:218` → CAUSA RAÍZ CONFIRMADA — ficha 4.** Reproduce determinista en
  solitario (failed 3/3). El radio del filtro existe pero se llama `Transferencia` SIN el
  sufijo `(CUP)`: con MultiMonedas activo, `today-orders.tsx:160` omite el sufijo
  (cambio intencional de `8521d28e`, 2026-09-29). El spec busca el nombre viejo.
- **2) `movement-reversal:557` (E-R7) → NO REPRODUCE EN SOLITARIO, CAUSA NO CONFIRMADA —
  ficha 5.** El spec pasa 20/20 con `--workers=1`, 20/20 con `--workers=4` y 40/40 con
  `--repeat-each=2` (E-R7: 4/4 en solitario, 3/3 failed en corrida completa). Falló SOLO
  bajo la carga total. Los artifacts de esa corrida (error-context/trace) se borraron con
  las corridas aisladas: sin snapshot no se puede confirmar qué vio el navegador.
- **3) `web-catalog:77` → CAUSA RAÍZ CONFIRMADA — ficha 6.** Reproduce determinista en
  solitario (failed 3/3). El merge de qa (`bb7967ce`) reemplazó el guardado por producto
  con el botón único por lotes, cuyo toast es `Se guardó 1 producto en el catálogo` —
  el test espera el viejo `Producto guardado en el catálogo`.

Ninguno se tocó: los fixes propuestos están en las fichas, pendientes de autorización.

## Cierre del 2026-10-05 — las 6 fichas quedaron retiradas

La corrida completa del 2026-10-05 (351 aprobados, 0 fallidos, 3 inestables, exit 0; detalle en
[`../2026-10-05-e2e-verification/README.md`](../2026-10-05-e2e-verification/README.md)) ejecutó los
tests de todas estas fichas y ninguno falló. Con eso, las 6 fichas de esta carpeta se retiraron y su
contenido queda resumido acá:

| Ficha | Test | Cierre |
|---|---|---|
| 1 | Guard preflight `assertDevServerBackend` → `api-health.spec.ts` | ✅ **Resuelto 2026-10-01.** El guard ya no confunde el comodín `ws:`/`wss:` del CSP de SignalR con el origen de la API. La suite arranca; el preflight no volvió a abortar ninguna corrida. Fix commit `9fa2eada` |
| 2 | `login-offline.spec.ts` (4 tests) | ✅ **Resuelto 2026-10-01.** Whitelist de tráfico de fondo ampliado con autorización 1 a 1 (telemetría + `/hubs/messages` + `/api/v1/messages`), invariante de cero AUTH/productos intacto. Verificado 12/12 ×2 el mismo día. Commit `4c4f37a0` |
| 3 | `sync-export-import-v2.spec.ts` (2 tests) | ✅ **Resuelto 2026-10-01.** Mismo fix aplicado a la copia del whitelist. Verificado 2/2. Commit `4c4f37a0` |
| 4 | `mayorista-sale.spec.ts:218` | ✅ **Resuelto 2026-10-04.** Defecto del test confirmado (buscaba `Transferencia (CUP)`; con el módulo 15 activo el sufijo se omite a propósito). Corregido con autorización en el commit `ede7e030`; verde el 2026-10-04 (6/6) y en la corrida completa del 2026-10-05 |
| 5 | `movement-reversal.spec.ts:557` (E-R7) | ⚪ **Sin defecto demostrado.** No reproducía ni aislado ni con 1 o 4 workers el 2026-10-01; pasó en la corrida del 2026-10-03 y en la completa del 2026-10-05 (el spec entero en 5.9 min). Sin acción |
| 6 | `web-catalog.spec.ts:77` | ✅ **Resuelto 2026-10-04.** Defecto del test confirmado (esperaba el aviso de guardado por producto, reemplazado por el guardado por lotes). Corregido con autorización en `ede7e030`; verde el 2026-10-04 y el 2026-10-05 |

Los tres fixes de código de esta carpeta (guard + los dos whitelists) están commiteados
(`9fa2eada`, `4c4f37a0`), así que la ficha 1, 2 y 3 también quedaron cerradas del lado del árbol.

## Estado del workspace durante la verificación

- Backend levantado con `--launch-profile http-e2e`, guard confirmado (`smca_test`), puerto 5019.
- **Código tocado en esta sesión (con autorización 1 a 1):** 2 specs de E2E
  (whitelists de la ficha 2 y 3) + el guard de la ficha 1. Todo **sin commitear**.
- Docs de esta carpeta: 3 fichas (todas cerradas con su verificación) + este README.
- Fuera de esta sesión siguen sin commitear `docs/testing/known-issues.md` modificado y la
  carpeta `qa-merge-2026-09-29/` — **de otro agente, no tocar ni commitear**.
