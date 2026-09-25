# Problemas conocidos — E2E frontend (Playwright)

> Documento vivo de hallazgos de corridas E2E. Cada entrada declara: **qué prueba el test**, **qué falla** (en lenguaje simple), **causa raíz** (con su estado: confirmada / a confirmar) y **propuesta de solución**. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Corrida del 2026-09-24

**Contexto.** Suite completa contra backend real (`:5019`, BD `smca_test`): **316 pasados, 13 fallidos, 3 flaky, 1 sin correr** (de 333). Re-corrida en solitario de los fallidos: 11 son **deterministas** (fallan solos también) y 2 pasan solos (eran carga de la suite completa).

> **Re-verificación 2026-09-24 (tras implementar el fix del Grupo A):** 3 tests quedaron **resueltos y eliminados de esta lista** — `roster-recovery` E2E 4, E2E 5 y la variante online de `valid-session-navigation` (la que recarga la vista con la llave presente). `valid-session-navigation` 12 sigue fallando y su causa se **corrige** en la entrada 1: no era el crash del Grupo A, sino el unlock gate de cifrado at-rest (`/login?unlock=1`, sin logout).

> **Cierre 2026-09-24 (segunda tanda, con autorización explícita del usuario):** quedaron resueltos los 4 anotados restantes — `valid-session-navigation` **12** (el test pinea el diseño del unlock gate: `/login?unlock=1` con la sesión viva y el re-login que recupera el home), los tests **10 y 11** (mismo gate vía `guestOnlyLoader`: el usuario autenticado se queda en el login/registro sin logout; la ficha original culpaba a la lentitud del entorno y era incorrecta) y `multipayments` **T10.2** (la versión reescrita del spec pasa 2/2 y su núcleo de negocio está pineado en el test de integración sin navegador). El spec `valid-session-navigation` quedó **12/12**. Detalle en las entradas de abajo.

Resumen de la corrida (los 3 resueltos en la primera tanda se eliminaron de la lista; las entradas 1, 1b, 2, 3 y 4 quedaron resueltas en esta segunda tanda — quedan abiertos solo los Grupos B, C y D):

| #   | Test                          | Estado de la causa raíz                                                                                                                            |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `valid-session-navigation` 12 | ✅ **Resuelto 2026-09-24** — pineado con autorización del usuario: aterriza en `/login?unlock=1` con la sesión viva y el re-login recupera el home |
| 1b  | `valid-session-navigation` 6  | ✅ **Resuelto 2026-09-24** — spec alineado con el 12 con permiso del usuario: pinea `/login?unlock=1` sin logout + re-login                        |
| 2   | `valid-session-navigation` 10 | ✅ **Resuelto 2026-09-24** — la ficha anotada culpaba al entorno; la causa era el unlock gate (`guestOnlyLoader`); pineado con autorización        |
| 3   | `valid-session-navigation` 11 | ✅ **Resuelto 2026-09-24** — ídem (mismo gate, formulario de registro)                                                                             |
| 4   | `multipayments` T10.2         | ✅ **Resuelto 2026-09-24** — spec reescrito por dev verificado 2/2; el núcleo queda pineado en el test de integración sin navegador                |
| 5   | `owner-plan-change-dialog`    | ✅ **Resuelto 2026-09-24** — defecto del test corregido con autorización (aserción del ancla compara la fecha serializada)                         |
| 6   | `store-plan-lock-regression`  | ✅ **Resuelto 2026-09-24** — mismo defecto, corregido igual con autorización                                                                       |
| 7   | `wholesale-cart-floor`        | ✅ **Resuelto 2026-09-24** — spec actualizado con autorización: persona privada Superior (módulo 12 + feature 39)                                  |
| 8   | `configurations` FC-B2        | ✅ **Resuelto 2026-09-24** — locator frágil corregido con autorización (afirma por valor/selección)                                                |

---

## Grupo A — Bug real de la app: la interfaz se cae cuando falta la llave de datos (resuelto 2026-09-24)

**El problema en una frase (para un usuario).** Si abres la aplicación con tu sesión iniciada pero el dispositivo todavía no tiene la "llave" para abrir los datos guardados (por ejemplo, después de cambiar la contraseña, perder la activación sin conexión o recuperar el equipo), en lugar de pedirte la llave o avisarte, **cualquier pantalla que muestre el carrito o la configuración de la tienda muestra una página de "Error"** y la sesión queda colgada ahí.

**Causa raíz (confirmada con el snapshot de Playwright).** Al dibujar la pantalla, el carrito lee la configuración de formas de pago de la tienda directamente de los datos guardados (cifrados). Esa lectura se hace _en el momento de dibujar_ y, sin llave, lanza el error "no hay llave de datos en memoria". Como el lanzamiento ocurre durante el dibujo, la red de seguridad de React reemplaza **toda la interfaz** por la página de Error — el aviso oficial de "no se pudo abrir la información" y el cierre de sesión controlado (que sí existen y funcionan en los caminos asíncronos) nunca llegan a ejecutarse.

**Propuesta de solución (código de la app, no de tests).** En los puntos donde se lee la configuración durante el dibujo (el carrito es el confirmado; auditar los demás), si la lectura falla por falta de llave, **usar el catálogo por defecto** (Efectivo / Transferencia, con las reglas de plan de siempre) en vez de reventar. El comportamiento asíncrono — anunciar una sola vez y cerrar la sesión — queda exactamente igual. Así la app sigue viva hasta que el cierre de sesión controlado te lleve al login con su mensaje.

> **Estado (re-verificado 2026-09-24).** El fix se implementó en `StorePaymentMethodsConfigService.getConfigFromLocalStorage()` (try/catch de `MissingDataKeyError` → default **sin persistir**; `EntityUnreadableError` sigue lanzando) y se verificó con unit tests nuevos (29 passed), typecheck, lint y los 4 tests E2E del Grupo A. Resultado: **los 3 tests que verificaban el crash al pintar quedaron resueltos (eliminados de esta lista)** — `roster-recovery` E2E 4, E2E 5 y la variante online de `valid-session-navigation`; `valid-session-navigation` 12 sigue fallando por una causa distinta (unlock gate de cifrado at-rest hacia `/login?unlock=1`, entrada 1) — no es el crash del Grupo A.

### Tests afectados, uno a uno

**1. `valid-session-navigation` — 12 (offline): "recargar la vista mantiene la sesión" — ✅ RESUELTO 2026-09-24 (con autorización del usuario)**

- **Qué prueba:** con una sesión iniciada en frío **offline por roster** (el usuario se autenticó sin conexión usando el roster guardado), y con la llave de dispositivo borrada, recargar la vista no debe cerrar la sesión: el menú de usuario debe seguir visible en la pantalla de inicio.
- **Qué fallaba (histórico):** tras recargar con la llave de dispositivo borrada (`deleteDeviceKeyDatabase` — solo IndexedDB; tabla de wraps en localStorage **intacta**), la app navega a **`/login?unlock=1`** y el menú de usuario nunca se pinta (el test esperaba `USER_MENU` en el home y moría en el timeout).
- **Causa raíz (corregida 2026-09-24 — NO es el Grupo A):** el `authLoader` corre **antes** de montar la ruta (`auth/routes/loaders.ts:36-39`): `bootstrapDeviceDek` no recupera la DEK (IndexedDB vacío) y el gate **`unlockGate`** redirige cuando `needsUnlock(user)` — roster v2 con `wrappedDek`/`wrapSalt`/`wrapIv` y `hasDeviceDekWrap()` por la tabla `lizoft.device-dek` en localStorage intacto — **y** `hasUnreadableCiphertext()` (el auto-init del carrito dejó entidades `lizoft.store-*` cifradas). Es una redirección **sin logout**: la sesión y el roster sobreviven. Es la excepción legítima del contrato (`docs/contracts/authenticated-session-redirect.md:22`: el gate de cifrado at-rest puede mostrar `/login?unlock=1` con sesión válida cuando el DEK no se puede recuperar en este boot) y está pineada en el unit test `auth/routes/__tests__/loaders.test.ts` ("authLoader — locked-provisioned WITH ciphertext: redirects to /login?unlock=1 WITHOUT logging out"). Por eso este test **nunca falló por la página de Error**: el redirect ocurre antes de cualquier render. La clasificación original como "misma familia que los tests de recovery" fue una inferencia sin snapshot y queda corregida.
- **Corrección (2026-09-24) del contraste con el caso "online":** este razonamiento quedó obsoleto — el backend devuelve `storeDekWraps` en el login online igual que en el offline (`LoginCommand.TryBuildLoginDekWrapsAsync`), así que la tabla de wraps de `lizoft.device-dek` existe en **ambos** flujos y el gate dispara igual; por eso el test 6 se alineó con el 12 (commit `8e22b884`). Lo que distingue hoy los casos no es la tabla de wraps, sino la llave física: online re-provisiona con la contraseña; offline, con el roster y su contraseña.
- **Resolución (2026-09-24, autorización explícita del usuario):** el test quedó alineado con el diseño — "12. offline/sin clave: recargar con ciphertext ilegible va a /login?unlock=1 SIN logout" (pineado desde `0ea94c58`). Afirmar la URL `/login?unlock=1`, la sesión viva (roster y tabla `lizoft.device-dek` intactos) y el re-login offline por roster con la contraseña, que desenvuelve la DEK y devuelve al home — exactamente lo que pinea la ficha F4 de `login-offline`. El diseño es la fuente: `docs/contracts/authenticated-session-redirect.md` permite el gate con sesión válida cuando la DEK no se puede recuperar en ese boot. Spec completo: **12/12**.

**2. `valid-session-navigation` — 10 (offline) y 11 (offline): "ir a /login o /register con sesión abierta redirige al inicio" — ✅ RESUELTO 2026-09-24 (con autorización del usuario)**

- **Qué prueba:** con la sesión abierta (y navegador sin llave), escribir la dirección del login o del registro en el navegador debe devolverte a tu pantalla de inicio (nadie con sesión activa debe quedarse en el login).
- **Qué fallaba (histórico):** el test esperaba la redirección de vuelta a la pantalla de inicio y moría por timeout (15 s) sin llegar a la aserción.
- **Causa raíz (confirmada 2026-09-24 — la ficha anotada era incorrecta):** la redirección al home **no ocurre**: con la tabla de wraps en localStorage y ciphertext ilegible, `needsUnlock(user) && hasUnreadableCiphertext()` es cierto y `guestOnlyLoader` renderiza el login/registro **en el lugar**, sin redirigir y sin cerrar la sesión (`denyAccess()` es lo único que limpia `AUTH_MODEL`). Es el mismo diseño que pinean el test 12 y la ficha F4 de `login-offline`; la hipótesis de la lentitud del entorno quedó descartada.
- **Resolución (2026-09-24, autorización explícita del usuario):** los tests 10 y 11 pinean ahora el comportamiento diseñado — quedan en `/login` y `/register` con la sesión viva (`readAuthModel()` ≠ null; roster y tabla de wraps intactos) y el re-login por roster desenvuelve la DEK y devuelve al home. Fichas `group-anotados/valid-session-navigation-10.md` y `-11.md` retiradas. Spec completo: **12/12** (commit `6ff25ccb`).

**3. `multipayments` — T10.2: "fila por defecto, segundo canal por el popup, recálculo y bloqueo por subpago" — ✅ RESUELTO 2026-09-24**

- **Qué prueba:** con el módulo de multipagos activo, pagar una venta en dos partes por canales distintos (p. ej. mitad efectivo y mitad transferencia), que el total y el vuelto se recalculan bien, y que no te dejan registrar una venta pagada de menos.
- **Qué fallaba (histórico, versión vieja del spec):** antes de llegar al carrito, el test tenía que registrar una tasa de cambio en la pantalla de "tasas de cambio"; el formulario nunca aparecía (el campo donde se escribe la tasa no se dibujaba) y el test moría ahí.
- **Causa raíz (confirmada 2026-09-24):** la versión que falló era la vieja — el spec fue **reescrito en dev el 23/09** ("currency block and popup flow") y la corrida de la versión nueva pasó **2/2 (T10.1 + T10.2, ~35 s)** como `describe.serial`. Limitación documentada del spec: **T10.2 necesita la sesión que crea T10.1** (si se corre aislado, falla; hay que ejecutarlo como el serial completo).
- **Resolución (2026-09-24):** además, el **núcleo de negocio** de T10.2 quedó pineado sin navegador en `apps/web-store-pos/app/integrations/multi-payment-two-channels.integration.test.ts` (5 casos, todos en verde) — ver `docs/testing/integrations/multipayments/README.md`. La ficha `group-anotados/multipayments-t10-2.md` se retiró; su contenido vive en el README de integraciones.

---

## Grupo B — Defecto del test: comparar fechas con el comparador equivocado (2 — resuelto 2026-09-24)

**Tests:** `owner-plan-change-dialog` y `store-plan-lock-regression`.

- **Qué prueban:** que el cambio de plan de una tienda se hace por el camino correcto (cambio de plan, nunca una edición directa) y que la fecha ancla del plan (de donde se calcula la fecha de vencimiento) **queda intacta** después del cambio.
- **Qué falla:** la comparación de la fecha dice "esperado: 2026-09-23T04:00:00.000Z / recibido: serializa al mismo string" — es decir, **las dos fechas son la misma**, pero el test las compara con el comparador más estricto, que para fechas dice "diferentes" aunque el valor sea idéntico. La lógica de negocio funciona; el test no puede verlo.
- **Causa raíz:** ✅ confirmada — el test guarda la fecha antes y la lee después, y las compara con `toBe` (igualdad estricta de objeto); dos objetos de fecha con el mismo valor nunca pasan esa comparación. La base de datos devuelve fechas como objetos, no como texto, y el test las declara como texto.
- **Aplicada (2026-09-24, con autorización explícita del usuario):** la aserción del ancla compara el **texto** de la fecha (`toISOString()` de ambos lados). Cero cambios en la app. Verificado: los 2 specs en verde contra el backend real (`:5019`, BD `smca_test`, teardown "54 filas e2e-\* borradas").

## Grupo C — Spec obsoleto por una feature nueva (1 — resuelto 2026-09-24)

**Test:** `wholesale-cart-floor`.

- **Qué prueba:** en la venta mayorista, el precio por escalones de cantidad nunca debe bajar del precio del escalón más bajo (protección del piso de precio en el carrito).
- **Qué falla:** la vista de venta mayorista ya **no aparece** para la persona que usa el test, así que "Ventas Mayoristas" nunca se encuentra en pantalla.
- **Causa raíz:** ✅ confirmada — la feature "mayoristas solo para planes Superior/VIP" (módulo 12, traída de dev) dejó fuera a la persona del test, que fue creada antes de esa regla. No es un bug de la app: la app hace exactamente lo que la nueva regla dice.
- **Aplicada (2026-09-24, con autorización explícita del usuario):** el spec usa la persona privada Superior del fixture `store-wholesale-fixture.ts` (módulo 12 + feature 39), minteada una vez y replicada por snapshot — el mismo patrón de los specs nuevos de dev. De paso, dos aserciones internas quedaron alineadas al formato real del carrito (`Precio: N CUP`): el spec viejo nunca las había ejercido porque moría antes en el gate del menú. Verificado: 2/2 en verde contra el backend real (`:5019`, BD `smca_test`).

## Grupo D — Locator frágil del test (1 — resuelto 2026-09-24)

**Test:** `configurations` FC-B2.

- **Qué prueba:** que el selector "Tienda activa" de la pantalla de configuración lista las tiendas cuando hay varias (MultiStores).
- **Qué falla:** el test afirma que la **opción** dentro del selector "es visible". Los navegadores consideran las opciones de un desplegable "ocultas" por definición (solo son visibles al abrir el desplegable), así que Playwright lo rechaza siempre — el log confirma 13 veces que la opción existe y tiene el nombre correcto de la tienda.
- **Causa raíz:** ✅ confirmada — la app está bien; el locator del test elige un tipo de aserción (visibilidad de una `<option>`) que Playwright no concede.
- **Aplicada (2026-09-24, con autorización explícita del usuario):** la aserción afirma que el selector tiene opciones y que el valor seleccionado es la tienda de la persona (`toHaveValue`), en vez de visibilidad de la `<option>` — los navegadores no conceden visibilidad a las opciones de un desplegable colapsado. Verificado: 2/2 en verde contra el backend real (`:5019`, BD `smca_test`).

## Grupo E — Solo carga de la suite (2, sin acción)

**Tests:** `plan-catalog-superadmin` (PCF2) y los setups de `auth-me-*`. **Pasan en solitario** — eran timeouts por la carga de la suite completa. Sin defecto de app ni de test; no requieren cambio.

> **Re-verificado 2026-09-24:** los 3 specs del grupo corren en verde en solitario contra el backend real (`:5019`, BD `smca_test`) — `plan-catalog-superadmin` + `auth-me-session-rejection` + `auth-me-deleted-user`, **16/16 (~31 s)**.

---

## Corrida completa del 2026-09-25 — verificación de estabilidad (suite por defecto, sin rate-limit)

Contexto: backend real `:5019` (BD `smca_test`, confirmada por el teardown en ambas corridas), dev server `:3333`, suite por defecto `pnpm test:e2e` (340 tests, excluye `@rate-limit`).

| Corrida | Workers                              | Resultado                           | Duración | Flaky            |
| ------- | ------------------------------------ | ----------------------------------- | -------- | ---------------- |
| 1       | 8 (default de esta máquina, 16 CPUs) | 317 passed + 23 flaky, **0 failed** | 12.0 min | 23 (en 18 specs) |
| 2       | 4                                    | 336 passed + 4 flaky, **0 failed**  | 7.7 min  | 4 (en 4 specs)   |
| 3       | 3                                    | 338 passed + 2 flaky, **0 failed**  | 7.3 min  | 2 (en 2 specs)   |

- **Cero rate-limits reales**: ni un 429 en el log de ninguna corrida — las únicas 2 menciones de "429" son el flag `--grep-invert @rate-limit` del comando y el contador `[429/340]` de progreso. Las cuotas (40 logins/min, 50 registros/10 min) no se agotaron con la suite por defecto.
- **Causa raíz del flakiness (confirmada por contraste)**: contención de recursos por número de workers — 8 workers contra un único dev server + backend + PostgreSQL flakean ~23 tests al azar (nunca los mismos dos veces, y todos pasan al reintento y en solitario); con 4 workers el flakiness cae a ~4 y la corrida es 4 minutos más rápida.
- **Recomendación operativa**: correr la suite completa con `--workers=4` (o menos) en esta máquina; los reintentos (`retries: 2`) absorben el resto. Sin cambios en la app ni en los tests. La corrida 3 (3 workers, 7.3 min, 2 flaky) confirma la tendencia monótona 23 → 4 → 2; el readme ya recomienda `--workers=4` como default operativo.

---

## Flaky recurrentes — Grupo F (fichas por test)

De los 29 flaky de las tres corridas (23 + 4 + 2), 25 fueron tests distintos al azar — contención pura: pasan al reintento y en solitario. Dos specs recayeron en más de una corrida y tienen ficha autocontenida con el modo de fallo literal, los pasos de verificación previa, la hipótesis por confirmar y la solución candidata:

| Ficha                                                                          | Test                                                  | Recurrencia                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`group-f/store-plan-activation.md`](group-f/store-plan-activation.md)         | `store-plan-activation` (POST change-plan)            | Corridas 2 y 3 — precondición de BD ya nula al arrancar (hipótesis: solapamiento con el seed directo de `store-plan-lock-regression` sobre la persona compartida) |
| [`group-f/auth-me-session-rejection.md`](group-f/auth-me-session-rejection.md) | `auth-me-session-rejection` (setup/mints de arranque) | Corridas 1 y 3 — timeouts de setup/navegación en arranque en frío (hipótesis: contención; el reintento siempre pasa)                                              |

Ambos quedan ⏸ intocables hasta confirmar la hipótesis — cada ficha dice cómo verificarlo primero.

## Estado de decisiones pendientes (2026-09-24)

_Sin decisiones pendientes._ Todas las entradas de la corrida del 2026-09-24 quedaron cerradas: entrada 1, anotadas 2/3/4 y Grupos B, C y D; el Grupo E no requiere acción.

Historial: en la segunda tanda se cerró la decisión del test 12 (el spec pinea el diseño del gate con autorización del usuario), los tests 10/11 (ídem) y el T10.2 (spec reescrito verificado + núcleo pineado en integración) — detalle en las entradas 1, 2 y 3. En la tercera tanda se cerró el Grupo B (los 2 specs comparan la fecha ancla serializada), en la cuarta el Grupo C (el spec usa la persona privada Superior del fixture de dev y pasa 2/2) y en la quinta el Grupo D (aserción por valor/selección).

_Actualizado por última vez: 2026-09-24 (quinta actualización: corrida del 2026-09-24 cerrada por completo)._
