# Problemas conocidos — E2E frontend (Playwright)

> Documento vivo de hallazgos de corridas E2E. Cada entrada declara: **qué prueba el test**, **qué falla** (en lenguaje simple), **causa raíz** (con su estado: confirmada / a confirmar) y **propuesta de solución**. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Corrida del 2026-09-24

**Contexto.** Suite completa contra backend real (`:5019`, BD `smca_test`): **316 pasados, 13 fallidos, 3 flaky, 1 sin correr** (de 333). Re-corrida en solitario de los fallidos: 11 son **deterministas** (fallan solos también) y 2 pasan solos (eran carga de la suite completa).

Resumen de los 11 deterministas:

| # | Test | Estado de la causa raíz |
|---|---|---|
| 1 | `roster-recovery` E2E 4 | ✅ **Confirmada** — bug real de la app (crash al pintar sin llave) |
| 2 | `roster-recovery` E2E 5 | ✅ **Confirmada** — mismo bug |
| 3 | `valid-session-navigation` 6 | 🔶 Misma familia confirmada (mismo punto de código) |
| 4 | `valid-session-navigation` 12 | 🔶 Misma familia confirmada (mismo punto de código) |
| 5 | `valid-session-navigation` 10 | ⏸ **Anotado** — la app se comporta bien; apunta a lentitud del entorno |
| 6 | `valid-session-navigation` 11 | ⏸ **Anotado** — ídem |
| 7 | `multipayments` T10.2 | ⏸ **Anotado** — el spec fue reescribirse en dev; hay que correr la versión nueva antes de concluir |
| 8 | `owner-plan-change-dialog` | ✅ **Confirmada** — defecto del test (compara fechas con el comparador equivocado) |
| 9 | `store-plan-lock-regression` | ✅ **Confirmada** — mismo defecto del test |
| 10 | `wholesale-cart-floor` | ✅ **Confirmada** — spec obsoleto por feature "mayoristas solo Superior/VIP" |
| 11 | `configurations` FC-B2 | ✅ **Confirmada** — locator frágil del test (la app está bien) |

---

## Grupo A — Bug real de la app: la interfaz se cae cuando falta la llave de datos (1)

**El problema en una frase (para un usuario).** Si abres la aplicación con tu sesión iniciada pero el dispositivo todavía no tiene la "llave" para abrir los datos guardados (por ejemplo, después de cambiar la contraseña, perder la activación sin conexión o recuperar el equipo), en lugar de pedirte la llave o avisarte, **cualquier pantalla que muestre el carrito o la configuración de la tienda muestra una página de "Error"** y la sesión queda colgada ahí.

**Causa raíz (confirmada con el snapshot de Playwright).** Al dibujar la pantalla, el carrito lee la configuración de formas de pago de la tienda directamente de los datos guardados (cifrados). Esa lectura se hace *en el momento de dibujar* y, sin llave, lanza el error "no hay llave de datos en memoria". Como el lanzamiento ocurre durante el dibujo, la red de seguridad de React reemplaza **toda la interfaz** por la página de Error — el aviso oficial de "no se pudo abrir la información" y el cierre de sesión controlado (que sí existen y funcionan en los caminos asíncronos) nunca llegan a ejecutarse.

**Propuesta de solución (código de la app, no de tests).** En los puntos donde se lee la configuración durante el dibujo (el carrito es el confirmado; auditar los demás), si la lectura falla por falta de llave, **usar el catálogo por defecto** (Efectivo / Transferencia, con las reglas de plan de siempre) en vez de reventar. El comportamiento asíncrono — anunciar una sola vez y cerrar la sesión — queda exactamente igual. Así la app sigue viva hasta que el cierre de sesión controlado te lleve al login con su mensaje.

### Tests afectados, uno a uno

**1. `roster-recovery` — E2E 4: "un fallo de descifrado no toca un solo byte de lo guardado"**

- **Qué prueba:** con la sesión abierta, se le quita al navegador toda llave para abrir sus propios datos y se recarga la pantalla. La app debe anunciar el problema, cerrar la sesión sola y — lo central — **no borrar ni modificar ni un solo dato guardado**.
- **Qué falla:** en lugar del aviso + cierre de sesión, la interfaz entera cae en la página de "Error" y nunca llega al login; el test se queda esperando el mensaje que nunca aparece.
- **Causa raíz:** ✅ confirmada — la del Grupo A (crash al pintar sin llave).
- **Propuesta:** el arreglo del Grupo A. El test no necesita cambios.

**2. `roster-recovery` — E2E 5: "un fallo de descifrado con la sesión abierta se anuncia y termina la sesión en /login"**

- **Qué prueba:** mismo disparador que el E2E 4, pero afirmando lo que el usuario ve: el aviso con las dos vías de recuperación (entrar con conexión o importar roster) y que la sesión termina en la pantalla de login.
- **Qué falla:** el aviso nunca se muestra — la página de "Error" lo tapa todo.
- **Causa raíz:** ✅ confirmada — la del Grupo A.
- **Propuesta:** el arreglo del Grupo A. El test no necesita cambios.

**3. `valid-session-navigation` — 6 (online) y 4. 12 (offline): "recargar la vista mantiene la sesión"**

- **Qué prueba:** con la sesión iniciada y el navegador sin llave de dispositivo (el estado del problema reportado por el usuario), **recargar la página no debe cerrar la sesión**: el menú de usuario sigue visible y sigues en tu pantalla de inicio.
- **Qué falla:** tras recargar, el menú de usuario nunca llega a pintarse — la interfaz no termina de levantarse.
- **Causa raíz:** 🔶 misma familia confirmada — el carrito se dibuja en las pantallas de venta/productos (el home de un usuario con datos), así que el mismo crash sin llave impide el pintado. La firma es idéntica a la confirmada en roster-recovery.
- **Propuesta:** el arreglo del Grupo A. El test no necesita cambios.

**5. `valid-session-navigation` — 10 (offline) y 6. 11 (offline): "ir a /login o /register con sesión abierta redirige al inicio"**

- **Qué prueba:** con la sesión abierta (y navegador sin llave), escribir la dirección del login o del registro en el navegador debe devolverte a tu pantalla de inicio (nadie con sesión activa debe quedarse en el login).
- **Qué falla:** el test se agota esperando la redirección.
- **Causa raíz:** ⏸ **anotada, no confirmada** — el log de la corrida muestra que **la redirección SÍ ocurre** (el navegador llega a la pantalla de inicio): el comportamiento de la app es correcto. Lo que se agota es la espera del test porque la página tarda más de 15 segundos en terminar de cargar (servidor de desarrollo con recarga de módulos pesada, más notoria bajo la carga de la suite).
- **Propuesta:** dejar anotado y decidir más adelante — la solución apunta a la espera del test (o al entorno), no a la app, y tocar el test requiere tu permiso.

**7. `multipayments` — T10.2: "fila por defecto, segundo canal por el popup, recálculo y bloqueo por subpago"**

- **Qué prueba:** con el módulo de multipagos activo, pagar una venta en dos partes por canales distintos (p. ej. mitad efectivo y mitad transferencia), que el total y el vuelto se recalculan bien, y que no te dejan registrar una venta pagada de menos.
- **Qué falla:** antes de llegar al carrito, el test tiene que registrar una tasa de cambio en la pantalla de "tasas de cambio"; el formulario nunca aparece (el campo donde se escribe la tasa no se dibuja) y el test muere ahí.
- **Causa raíz:** ⏸ **anotada, no confirmada** — dos motivos para no concluir todavía:
  1. El spec fue **reescrito en dev el 23/09** ("currency block and popup flow"); la versión que falló en esta corrida ya no existe en el repo. La versión nueva hay que correrla antes de decir nada definitivo.
  2. La pantalla de tasas también lee datos guardados; si ese lectura se hace al pintar, sería **el mismo bug del Grupo A** matando el formulario antes de dibujarlo — pero eso hay que verificarlo con la corrida del spec nuevo.
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
| Implementar el fix del Grupo A (fallback al catálogo por defecto en lecturas al pintar) y re-verificar los tests 1–4 | Pendiente de aprobar (es código de la app) |
| Ajustes de tests de los Grupos B, C y D (4 aserciones en 4 specs, sin correr suite completa) | Pendiente de permiso explícito |
| Correr el spec `multipayments` reescrito por dev para confirmar la causa del T10.2 | Pendiente de aprobación de corrida |
| Tests 10/11 de `valid-session-navigation` (entorno) | Anotados para más adelante |

*Actualizado por última vez: 2026-09-24.*
