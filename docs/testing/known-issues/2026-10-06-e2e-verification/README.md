# Fichas de test E2E — carpeta única (verificación del 2026-10-06)

**Qué es esta carpeta.** Es la **única** carpeta de fichas del proyecto: todas las fichas de tests E2E
problemáticos viven juntas, bajo la fecha de la última verificación. El **2026-10-06** se retiraron las
carpetas por corrida que ya no tenían ninguna ficha de test (`2026-10-01-e2e-verification/`,
`2026-10-03-e2e-verification/`, `group-g/`, `qa-merge-2026-09-29/` y `2026-10-05-e2e-verification/`):
su texto completo sigue en el historial de git y su resumen está en el
[Registro de fichas retiradas](#registro-de-fichas-retiradas) de este documento.

## Fichas vivas

| Archivo | Estado | Qué documenta |
| --- | --- | --- |
| [`01-change-password-boton-offline-no-monta.md`](01-change-password-boton-offline-no-monta.md) | ✅ **causa raíz confirmada** | Corrida del 2026-10-05: el botón offline no montó dentro de los 5 s de la aserción bajo carga. **La aserción corre dentro de la ventana de pre-hidratación del shell SPA** (medida: 337→819 ms en ruta fría); **fix aplicado y verificado el 2026-10-06** (espera del montaje antes de la aserción, `2 passed (24.8s)`) |
| [`02-store-create-security-setup-timeout.md`](02-store-create-security-setup-timeout.md) | ✅ **causa raíz medida** | Corrida del 2026-10-05: el fixture `signedInPage` agotó los 120 s. **Medido el 2026-10-06 con `--trace on` bajo contención (8 workers): el setup sube de 32.3 s a 63.6 s y el presupuesto se agota por suma de esperas acotadas** (12 s de `POST /auth/register`, 26.7 s de `waitForURL` tras registrar, frío de Vite); **causa raíz definitiva y fix aplicado el 2026-10-06 (opciones 2+3+4)** — el `POST /auth/register` del mint aborta bajo contención (`net::ERR_ABORTED`) y el `waitForURL` de `session.ts:255` esperaba SIN LÍMITE (`navigationTimeout` default 0, verificado en el fuente de Playwright 1.62.1); fix: `navigationTimeout: 60_000` + mint con detección por diálogo propio, 1 retry y error nombrado + `workers` local default 4; timeout del spec restaurado a 120_000 (el 240_000 se revirtió). Verificado: solitario 2 passed (18.6 s), 4 workers 27 passed (42.2 s); a 16 workers los 4 specs que caían pasan |
| [`03-store-switcher-refresh-boton-crear-no-aparece.md`](03-store-switcher-refresh-boton-crear-no-aparece.md) | ✅ **causa raíz confirmada** | Corrida del 2026-10-05 (SWR-1): el botón de crear tienda no apareció en 120 s. **La selección persistida en la base apunta a una tienda creada por la interfaz (plan Pago, sin el módulo 14)**: el `/me` no trae el 14 y el botón no existe. Reproducido de forma determinista y **fix aplicado y verificado el 2026-10-06** (realineado de la selección, autorización 1 a 1) |
| [`04-store-switcher-refresh-swr2-locator-actual.md`](04-store-switcher-refresh-swr2-locator-actual.md) | ✅ **fix aplicado y verificado** | Locator acotado a `getByText('Actual', { exact: true })` el 2026-10-06 (autorización 1 a 1): la sonda midió que el locator viejo casa con **2 nodos distintos** (aviso + marca) y el nuevo con 1. Spec verde dos corridas seguidas en solitario (22.4 s / 21.7 s) |
| [`funcionan-en-solitario.md`](funcionan-en-solitario.md) | inventario | No es una ficha: es la medición de qué specs pasan cuando se corren solos, con el comando exacto y las reglas para mantenerla |

## Cómo se corrieron estas fichas

| Pieza | Detalle |
| --- | --- |
| Backend | perfil `http-e2e` en `:5019`, BD `smca_test` (confirmada por el teardown de cada corrida) |
| Dev server | `:3333`, levantado por Playwright en cada corrida |
| Corrida completa del 2026-10-05 | `pnpm test:e2e --workers=4`: 354 tests, **351 passed / 0 failed / 3 flaky**, 12.2 min, exit 0 — de ahí salen las fichas 01 a 03 |
| Verificación dirigida del 2026-10-06 | un spec por corrida, `--workers=1 --retries=0` (nunca la suite completa) — de ahí sale la ficha 04 y la re-verificación de las otras tres |
| Logs | `/tmp/e2e-full.log` (2026-10-05), `/tmp/iso-<spec>.log`, `/tmp/iso-swr-run2.log`, `/tmp/pwa-run1.log`, `/tmp/pwa-rebuild.log` |

## Barrido de confirmación de causas (2026-10-06)

| Causa documentada | Veredicto |
| --- | --- |
| Ficha 5 del merge de qa — `precache-split`: "el service worker nunca se activa" | ⚠️ Era el **síntoma**; la causa real era el config. Cerrada el 2026-10-06 |
| Ficha 7 del merge de qa — caché de dependencias de Vite | ✅ Cierto, y el arreglo ya estaba aplicado el 2026-10-02 |
| Ficha 01 — `change-password`: inestable de carga | ✅ **Sostenida** — el archivo entero pasa en solitario en 50.0 s |
| Ficha 02 — `store-create-security`: inestable de carga en el setup | ✅ **Sostenida** — los dos tests con su fixture completo pasan en solitario en 42.6 s |
| Ficha 03 — `store-switcher-refresh` SWR-1: inestable de carga | ✅ **Sostenida** — SWR-1 pasa en solitario en las dos corridas aisladas |
| Grupo E (`plan-catalog-superadmin`, `auth-me-*`): "solo carga" | ✅ **Re-confirmada** — 2/2, 11/11 y 3/3 en solitario |
| `movement-reversal` E-R7: "no se reproduce" (2026-10-01) | ✅ **Re-confirmada** — 20/20 en solitario, 4.2 m |
| `store-switcher-refresh` SWR-2: nunca falló / sin modo documentado | ❌ **Refutada** — cae en solitario (1 de 2 corridas) por un locator ambiguo: **ficha 04** |
| Grupos B, C y D del 2026-09-24; fallos 1 a 4 y 6 del merge; corridas del 2026-10-01 y del 2026-10-03 | ⏸️ **No re-corridos el 2026-10-06** — sus arreglos están aplicados y verificados en sus propias corridas. Este barrido no los re-ejecutó: eso se dice, no se asume |

### Cierre: las tres causas "no confirmadas" quedaron confirmadas

Las fichas 01, 02 y 03 estaban en 🟡 *mecanismo sin cerrar*. El 2026-10-06 se cerraron con
instrumentación desechable (specs y sondas temporales, **eliminados** después de medir; ningún test
existente ni código de la app fue tocado):

| Ficha | Qué se midió | Resultado |
| --- | --- | --- |
| 01 | El HTML que el dev server sirve para `/profile/change-password`, y el DOM cada ~20 ms entre `page.goto()` y `#oldPassword` visible | El `<body>` servido **es** el snapshot del fallo (`<section class="Toastify" … aria-label="Notifications Alt+T">` y nada más). La ventana de shell pelado es de ~480 ms (ruta fría) y ~250 ms (caliente); la aserción solo tiene los 5 s por defecto de `expect` |
| 02 | El coste real del setup del fixture `signedInPage` para `store-user`, llamando a la misma función que el fixture | **32 324 ms** el primer *resolve* (mint + replay) y 3 340 ms el memoizado. Además se corrigió la lectura del snapshot: es el **layout de invitado** (`GENERAL.APP_NAME` + `GENERAL.APP_SUBTITLE` de `auth-layout.tsx`), no la portada pública, con la app a mitad de un login. El 2026-10-06 se midió además con `--trace on` bajo contención: **63.6 s de setup con 8 workers** (2× los 32.3 s en solitario), por suma de esperas acotadas |
| 03 | El estado que deja el spec vecino en la base, y una demostración determinista del mecanismo | `sel=e2e-ssr-second-… (plan 2, module14=0)`; con la selección persistida en esa tienda, `/me` devuelve `storeModuleIds=[2..11]` (**sin el 14**) y `my-stores-create-button` **nunca** se hace visible |

De los tres fixes propuestos, el de **03** (realinear la selección persistida) quedó **aplicado y
verificado el 2026-10-06** con autorización 1 a 1 del usuario: ver la [ficha
03](03-store-switcher-refresh-boton-crear-no-aparece.md) y el doc de tarea
[`odd/tasks/e2e-switcher-session-realign.md`](../../../../odd/tasks/e2e-switcher-session-realign.md)
(`2 passed (45.1s)` en solitario; `2 passed (2.3m)` con el drift de SSR-1 presente). Los de **01**
(esperar el formulario) y de **04** (locator `getByText('Actual', { exact: true })`) quedaron
aplicados y verificados el 2026-10-06 con autorización 1 a 1: `change-password` verde
(`2 passed (24.8s)`) y `store-switcher-refresh` verde dos corridas seguidas (22.4 s / 21.7 s). En
**02** la opción 1 (`240_000`) se aplicó y luego se **revirtió por pedido del usuario** (timeout
de vuelta a `120_000`); con su autorización "arregla 2, del modo que sea… haz las otras partes"
quedaron aplicadas y verificadas las opciones 2 a 4: `actionTimeout: 30_000` +
`navigationTimeout: 60_000` en la config, mint acotado con detección por diálogo propio, 1 retry
y error nombrado en `session.ts`, y `workers` local default 4. Causa raíz definitiva medida con
trace: el registro aborta (`net::ERR_ABORTED`) y el `waitForURL` del mint era espera infinita
(`navigationTimeout` default 0). Ningún test E2E se tocó.

## Registro de fichas retiradas

Todo lo que se documentó y ya no falla. El texto completo de cada corrida (con el detalle de cada
ficha) está en el historial de git hasta el commit que retiró su carpeta; acá queda el dato que
importa: qué era, por qué fallaba y con qué se cerró.

| Corrida | Spec / asunto | Causa raíz | Cierre |
| --- | --- | --- | --- |
| 2026-09-24 | Grupos A a E (`valid-session-navigation` 6/10/11/12, `multipayments` T10.2, `owner-plan-change-dialog`, `store-plan-lock-regression`, `wholesale-cart-floor`, `configurations`, plan-catalog y `auth-me-*`) | Grupo A: defecto real de la app (lectura de la config de pagos durante el render sin llave de datos). B y D: defectos del test (fecha comparada con `toBe`; visibilidad de una `<option>`). C: spec obsoleto por la feature de mayoristas. E: solo carga | ✅ Cerrados entre el 2026-09-24 y el 2026-09-25. Detalle en [`../../known-issues.md`](../../known-issues.md) |
| 2026-09-25 | `group-g`: `warehouses` (StoreUser sin Almacenes) | El test estaba **duplicado** línea por línea por `create-store-user.spec.ts` | ✅ Retirado con autorización; el gating del menú sigue pineado por el otro test |
| 2026-09-25 | `group-g`: `store-switch-back-logout` SSR-1 | El setup podía avanzar con el nombre de la tienda **vacío** → regex vacía que casaba con todos los botones (strict mode violation) | ✅ Endurecido con reintentos acotados del refresh de sesión; el timeout x2 se retiró — la causa nunca fue el tiempo |
| 2026-09-29 | `store-module-pricing` y `plan-catalog-superadmin` | El caché de dependencias optimizadas de Vite servía un `@store-mgmt/domain` viejo (`SyntaxError` que React Router mostraba como `No result returned from dataStrategy`) | ✅ 2026-09-30 (borrar `.vite`); arreglo definitivo el 2026-10-02, commit `d6f47d53` |
| 2026-09-29 | `web-catalog` | Defecto del test: esperaba el aviso por producto, reemplazado por el guardado por lotes | ✅ 2026-10-04, commit `ede7e030` |
| 2026-09-29 | `mayorista-sale` | Defecto del test: buscaba `Transferencia (CUP)`; con el módulo 15 activo el sufijo se omite a propósito | ✅ 2026-10-04, commit `ede7e030` |
| 2026-09-29 | `precache-split` (ficha 5) | Corría con `playwright.config.ts`, que **bloquea los service workers** y cuyo SW de dev no precachea nada: `ready` no resuelve y el poll de 30 s moría como `Test timeout of 30000ms exceeded` | ✅ 2026-10-06 — arreglo aplicado el 2026-10-01 (`78f3d804`, `testIgnore` + config PWA). Verificado 3/3 (21.1 s, exit 0); el fallo se reprodujo a voluntad devolviéndolo al config equivocado |
| 2026-09-29 | Defecto sistémico: caché de dependencias de Vite (ficha 7) | `optimizeDeps.include: ['@store-mgmt/domain']` en `vite.config.ts`: Vite re-empaqueta mirando el lockfile, no `dist/` | ✅ 2026-10-02, commit `d6f47d53` (Opción A); verificado el 2026-10-06 (sin `optimizeDeps`, sin artefactos en `.vite/deps`) y por la corrida completa del 2026-10-05, posterior al fix |
| 2026-10-01 | Guard preflight `assertDevServerBackend` | Confundía el comodín `ws:`/`wss:` del CSP de SignalR con el origen de la API y abortaba la suite antes del primer test | ✅ 2026-10-01, commit `9fa2eada` |
| 2026-10-01 | `login-offline.spec.ts` (4 tests) | El chat (MessageShell) se monta siempre desde el merge de qa y su tráfico rompía el invariante de cero requests | ✅ 2026-10-01, commit `4c4f37a0` (whitelist de tráfico de fondo con autorización 1 a 1; 12/12 ×2) |
| 2026-10-01 | `sync-export-import-v2.spec.ts` (2 tests) | Copia del mismo whitelist | ✅ 2026-10-01, commit `4c4f37a0` (2/2) |
| 2026-10-01 | `movement-reversal` E-R7 | No reproducía ni aislado ni con 1/4 workers; fallaba solo bajo la carga total | ⚪ Sin defecto demostrado: pasó el 2026-10-03, el 2026-10-05 y **20/20 en solitario el 2026-10-06** |
| 2026-10-03 | `multipayments-cart-v2`, `store-module-pricing` | Defectos del test: sembraban el módulo 16 (MultiPayments) y abrían pantallas condicionadas al **15** (MultiMonedas); precondición insatisfacible | ✅ 2026-10-03 / 2026-10-04, sin tocar la app. El par 15/16 es la trampa central de esa corrida |
| 2026-10-03 | `wholesale-cart-floor` | Defecto del test: buscaba el rótulo `Precio:` que la app quitó el 2026-10-02 | ✅ 2026-10-04 |
| 2026-10-03 | `multipayments` (T10.2) | Defecto de la **app**: una excepción sin capturar tumbaba la pantalla al calcular el vuelto | ✅ 2026-10-04, único arreglo de código de app de esa corrida (autorizado por separado) |
| 2026-10-03 | `warehouses` | Defecto de la **app** todavía vivo: el botón flotante "Instalar App" tapa "Desactivar" e intercepta el clic | 🟡 El test se arregló el 2026-10-04 y **ya no vigila ese defecto**: nadie lo cubre hoy |

## Regla de la carpeta

1. **Antes de correr** los E2E: leer el índice maestro [`../../known-issues.md`](../../known-issues.md) y
   estas fichas, para no re-diagnosticar lo ya sabido.
2. **Después de correr**:
   - Si un test falla —o queda **inestable** (falla en su primer intento y pasa en el reintento)— se le
     crea o actualiza su ficha en esta carpeta, con el contrato del índice maestro.
   - Si un test que tenía ficha ya no falla, se retira la ficha y su resumen pasa al
     [Registro de fichas retiradas](#registro-de-fichas-retiradas).
   - Actualizar el índice maestro: veredicto de la corrida, estado de cada fallo y qué fichas quedan
     vivas.
   - Una corrida **en verde no cierra las fichas por sí sola**: cierra lo que efectivamente ejecutó
     (si un spec está en `testIgnore`, sigue sin verificar; eso se dice, no se asume).
   - Si la verificación abre una fecha nueva, la carpeta se renombra a esa fecha — sigue habiendo
     **una sola** carpeta de fichas.
3. **Autorización 1 a 1.** Editar un test E2E existente o código de la aplicación requiere autorización
   explícita del usuario, ficha por ficha. Una corrida verde no autoriza nada por sí sola.
