# Problemas conocidos — E2E frontend (Playwright)

> Documento vivo de hallazgos de corridas E2E. Cada entrada declara: **qué prueba el test**, **qué falla** (en lenguaje simple), **causa raíz** (con su estado: confirmada / a confirmar) y **propuesta de solución**. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Corrida del 2026-09-24

**Contexto.** Suite completa contra backend real (`:5019`, BD `smca_test`): **316 pasados, 13 fallidos, 3 flaky, 1 sin correr** (de 333). Re-corrida en solitario de los fallidos: 11 son **deterministas** (fallan solos también) y 2 pasan solos (eran carga de la suite completa).

> **Re-verificación 2026-09-24 (tras implementar el fix del Grupo A):** 3 tests quedaron **resueltos y eliminados de esta lista** — `roster-recovery` E2E 4, E2E 5 y la variante online de `valid-session-navigation` (la que recarga la vista con la llave presente). `valid-session-navigation` 12 sigue fallando y su causa se **corrige** en la entrada 1: no era el crash del Grupo A, sino el unlock gate de cifrado at-rest (`/login?unlock=1`, sin logout).

Resumen de los que siguen (8 de los 11 deterministas de la corrida; los 3 resueltos se eliminaron):

| # | Test | Estado de la causa raíz |
|---|---|---|
| 1 | `valid-session-navigation` 12 | 🔶 **Causa corregida 2026-09-24** — unlock gate de cifrado at-rest (no era el crash del Grupo A); sigue fallando |
| 1b | `valid-session-navigation` 6 | ✅ **Resuelto 2026-09-24** — spec alineado con el 12 con permiso del usuario: pinea `/login?unlock=1` sin logout + re-login |
| 2 | `valid-session-navigation` 10 | ⏸ **Anotado** — la app se comporta bien; apunta a lentitud del entorno |
| 3 | `valid-session-navigation` 11 | ⏸ **Anotado** — ídem |
| 4 | `multipayments` T10.2 | ⏸ **Anotado** — el spec fue reescribirse en dev; hay que correr la versión nueva antes de concluir |
| 5 | `owner-plan-change-dialog` | ✅ **Confirmada** — defecto del test (compara fechas con el comparador equivocado) |
| 6 | `store-plan-lock-regression` | ✅ **Confirmada** — mismo defecto del test |
| 7 | `wholesale-cart-floor` | ✅ **Confirmada** — spec obsoleto por feature "mayoristas solo Superior/VIP" |
| 8 | `configurations` FC-B2 | ✅ **Confirmada** — locator frágil del test (la app está bien) |

---

## Grupo A — Bug real de la app: la interfaz se cae cuando falta la llave de datos (resuelto 2026-09-24)

**El problema en una frase (para un usuario).** Si abres la aplicación con tu sesión iniciada pero el dispositivo todavía no tiene la "llave" para abrir los datos guardados (por ejemplo, después de cambiar la contraseña, perder la activación sin conexión o recuperar el equipo), en lugar de pedirte la llave o avisarte, **cualquier pantalla que muestre el carrito o la configuración de la tienda muestra una página de "Error"** y la sesión queda colgada ahí.

**Causa raíz (confirmada con el snapshot de Playwright).** Al dibujar la pantalla, el carrito lee la configuración de formas de pago de la tienda directamente de los datos guardados (cifrados). Esa lectura se hace *en el momento de dibujar* y, sin llave, lanza el error "no hay llave de datos en memoria". Como el lanzamiento ocurre durante el dibujo, la red de seguridad de React reemplaza **toda la interfaz** por la página de Error — el aviso oficial de "no se pudo abrir la información" y el cierre de sesión controlado (que sí existen y funcionan en los caminos asíncronos) nunca llegan a ejecutarse.

**Propuesta de solución (código de la app, no de tests).** En los puntos donde se lee la configuración durante el dibujo (el carrito es el confirmado; auditar los demás), si la lectura falla por falta de llave, **usar el catálogo por defecto** (Efectivo / Transferencia, con las reglas de plan de siempre) en vez de reventar. El comportamiento asíncrono — anunciar una sola vez y cerrar la sesión — queda exactamente igual. Así la app sigue viva hasta que el cierre de sesión controlado te lleve al login con su mensaje.

> **Estado (re-verificado 2026-09-24).** El fix se implementó en `StorePaymentMethodsConfigService.getConfigFromLocalStorage()` (try/catch de `MissingDataKeyError` → default **sin persistir**; `EntityUnreadableError` sigue lanzando) y se verificó con unit tests nuevos (29 passed), typecheck, lint y los 4 tests E2E del Grupo A. Resultado: **los 3 tests que verificaban el crash al pintar quedaron resueltos (eliminados de esta lista)** — `roster-recovery` E2E 4, E2E 5 y la variante online de `valid-session-navigation`; `valid-session-navigation` 12 sigue fallando por una causa distinta (unlock gate de cifrado at-rest hacia `/login?unlock=1`, entrada 1) — no es el crash del Grupo A.

### Tests afectados, uno a uno

**1. `valid-session-navigation` — 12 (offline): "recargar la vista mantiene la sesión"**

- **Qué prueba:** con una sesión iniciada en frío **offline por roster** (el usuario se autenticó sin conexión usando el roster guardado), y con la llave de dispositivo borrada, recargar la vista no debe cerrar la sesión: el menú de usuario debe seguir visible en la pantalla de inicio.
- **Qué falla (re-verificado 2026-09-24):** tras recargar con la llave de dispositivo borrada (`deleteDeviceKeyDatabase` — solo IndexedDB; tabla de wraps en localStorage **intacta**), la app navega a **`/login?unlock=1`** y el menú de usuario nunca se pinta (el test espera `USER_MENU` en el home y muere en el timeout).
- **Causa raíz (corregida 2026-09-24 — NO es el Grupo A):** el `authLoader` corre **antes** de montar la ruta (`auth/routes/loaders.ts:36-39`): `bootstrapDeviceDek` no recupera la DEK (IndexedDB vacío) y el gate **`unlockGate`** redirige cuando `needsUnlock(user)` — roster v2 con `wrappedDek`/`wrapSalt`/`wrapIv` y `hasDeviceDekWrap()` por la tabla `lizoft.device-dek` en localStorage intacto — **y** `hasUnreadableCiphertext()` (el auto-init del carrito dejó entidades `lizoft.store-*` cifradas). Es una redirección **sin logout**: la sesión y el roster sobreviven. Es la excepción legítima del contrato (`docs/contracts/authenticated-session-redirect.md:22`: el gate de cifrado at-rest puede mostrar `/login?unlock=1` con sesión válida cuando el DEK no se puede recuperar en este boot) y está pineada en el unit test `auth/routes/__tests__/loaders.test.ts` ("authLoader — locked-provisioned WITH ciphertext: redirects to /login?unlock=1 WITHOUT logging out"). Por eso este test **nunca falló por la página de Error**: el redirect ocurre antes de cualquier render. La clasificación original como "misma familia que los tests de recovery" fue una inferencia sin snapshot y queda corregida.
- **Por qué el caso "online" del mismo archivo no dispara el gate (contraste autocontenido):** cuando la sesión se crea con login online, **no** queda tabla de wraps en localStorage (la DEK/wrap vive en IndexedDB, que el trigger borra), así que `needsUnlock` da **false** → no hay hijack → el render del carrito (ya con el fix del Grupo A) no revienta → la sesión se mantiene en el home. La diferencia observable entre ambos casos es exactamente **la tabla de wraps de localStorage**, no la lógica del test.
- **Propuesta / decisión pendiente:** la expectativa del test (sesión visible **dentro de la app** tras recargar sin llave) y el diseño del unlock gate (mostrar el formulario de unlock en `/login?unlock=1` para **nunca exponer texto plano** cuando hay datos cifrados ilegibles) son opuestas para este estado. Ajustar el test o el diseño requiere permiso explícito (tests E2E intocables + contrato de invariante de auth: re-leer antes de tocar `authLoader`/`needsUnlock`). **El fix del Grupo A no toca este camino.**

**2. `valid-session-navigation` — 10 (offline) y 11 (offline): "ir a /login o /register con sesión abierta redirige al inicio"**

- **Qué prueba:** con la sesión abierta (y navegador sin llave), escribir la dirección del login o del registro en el navegador debe devolverte a tu pantalla de inicio (nadie con sesión activa debe quedarse en el login).
- **Qué falla:** el test espera la redirección de vuelta a la pantalla de inicio y muere por timeout (15 s) sin llegar a la aserción.
- **Causa raíz:** ⏸ **anotada, no confirmada** — el log de la corrida muestra que **la redirección SÍ ocurre** (el navegador llega a la pantalla de inicio): el comportamiento de la app es correcto. Lo que se agota es la espera del test porque la página tarda más de 15 segundos en terminar de cargar (servidor de desarrollo con recarga de módulos pesada, más notoria bajo la carga de la suite).
- **Propuesta:** dejar anotado y decidir más adelante — la solución apunta a la espera del test (o al entorno), no a la app, y tocar el test requiere tu permiso.

**3. `multipayments` — T10.2: "fila por defecto, segundo canal por el popup, recálculo y bloqueo por subpago"**

- **Qué prueba:** con el módulo de multipagos activo, pagar una venta en dos partes por canales distintos (p. ej. mitad efectivo y mitad transferencia), que el total y el vuelto se recalculan bien, y que no te dejan registrar una venta pagada de menos.
- **Qué falla:** antes de llegar al carrito, el test tiene que registrar una tasa de cambio en la pantalla de "tasas de cambio"; el formulario nunca aparece (el campo donde se escribe la tasa no se dibuja) y el test muere ahí.
- **Causa raíz:** ⏸ **anotada, no confirmada** — dos motivos para no concluir todavía:
  1. El spec fue **reescrito en dev el 23/09** ("currency block and popup flow"); la versión que falló en esta corrida ya no existe en el repo. La versión nueva hay que correrla antes de decir nada definitivo.
  2. La pantalla de tasas también lee datos guardados; si esa lectura se hace al pintar, sería **el mismo bug del Grupo A** (la app lee datos cifrados durante el render y, sin la llave, reemplaza toda la pantalla por la página de Error) matando el formulario antes de dibujarlo — pero eso hay que verificarlo con la corrida del spec nuevo.
- **Propuesta:** correr una vez el spec reescrito. Si el formulario sigue sin aparecer, aplicar el mismo arreglo del Grupo A y re-verificar.

---

## Grupo B — Defecto del test: comparar fechas con el comparador equivocado (2)

**Tests:** `owner-plan-change-dialog` y `store-plan-lock-regression`.

- **Qué prueban:** que el cambio de plan de una tienda se hace por el camino correcto (cambio de plan, nunca una edición directa) y que la fecha ancla del plan (de donde se calcula la fecha de vencimiento) **queda intacta** después del cambio.
- **Qué falla:** la comparación de la fecha dice "esperado: 2026-09-23T04:00:00.000Z / recibido: serializa al mismo string" — es decir, **las dos fechas son la misma**, pero el test las compara con el comparador más estricto, que para fechas dice "diferentes" aunque el valor sea idéntico. La lógica de negocio funciona; el test no puede verlo.
- **Causa raíz:** ✅ confirmada — el test guarda la fecha antes y la lee después, y las compara con `toBe` (igualdad estricta de objeto); dos objetos de fecha con el mismo valor nunca pasan esa comparación. La base de datos devuelve fechas como objetos, no como texto, y el test las declara como texto.
- **Propuesta (requiere permiso, 2 líneas por test):** comparar el **texto** de la fecha (`toISOString()` de ambos lados). Cero cambios en la app.

## Grupo C — Spec obsoleto por una feature nueva (1)

**Test:** `wholesale-cart-floor`.

- **Qué prueba:** en la venta mayorista, el precio por escalones de cantidad nunca debe bajar del precio del escalón más bajo (protección del piso de precio en el carrito).
- **Qué falla:** la vista de venta mayorista ya **no aparece** para la persona que usa el test, así que "Ventas Mayoristas" nunca se encuentra en pantalla.
- **Causa raíz:** ✅ confirmada — la feature "mayoristas solo para planes Superior/VIP" (módulo 12, traída de dev) dejó fuera a la persona del test, que fue creada antes de esa regla. No es un bug de la app: la app hace exactamente lo que la nueva regla dice.
- **Propuesta (requiere permiso):** sembrar el módulo 12 en la persona del spec, igual que hicieron los specs nuevos que llegaron de dev.

## Grupo D — Locator frágil del test (1)

**Test:** `configurations` FC-B2.

- **Qué prueba:** que el selector "Tienda activa" de la pantalla de configuración lista las tiendas cuando hay varias (MultiStores).
- **Qué falla:** el test afirma que la **opción** dentro del selector "es visible". Los navegadores consideran las opciones de un desplegable "ocultas" por definición (solo son visibles al abrir el desplegable), así que Playwright lo rechaza siempre — el log confirma 13 veces que la opción existe y tiene el nombre correcto de la tienda.
- **Causa raíz:** ✅ confirmada — la app está bien; el locator del test elige un tipo de aserción (visibilidad de una `<option>`) que Playwright no concede.
- **Propuesta (requiere permiso):** afirmar por valor/selección (`toHaveValue` / `selectOption`) en vez de visibilidad de la opción.

## Grupo E — Solo carga de la suite (2, sin acción)

**Tests:** `plan-catalog-superadmin` (PCF2) y los setups de `auth-me-*`. **Pasan en solitario** — eran timeouts por la carga de la suite completa. Sin defecto de app ni de test; no requieren cambio.

---

## Estado de decisiones pendientes (2026-09-24)

| Decisión | Dueño |
|---|---|
| Decidir `valid-session-navigation` 12: expectativa del test (sesión visible en la app) vs. diseño del unlock gate (`/login?unlock=1`, nunca texto plano) | Pendiente — requiere permiso explícito (test E2E intocable y/o cambio de auth con aprobación del contrato) |
| Ajustes de tests de los Grupos B, C y D (4 aserciones en 4 specs, sin correr suite completa) | Pendiente de permiso explícito |
| Correr el spec `multipayments` reescrito por dev para confirmar la causa del T10.2 | Pendiente de aprobación de corrida |
| Tests 10/11 de `valid-session-navigation` (entorno) | Anotados para más adelante |

*Actualizado por última vez: 2026-09-24.*
