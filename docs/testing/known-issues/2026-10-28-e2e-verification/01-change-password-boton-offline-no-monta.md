# 1. change-password.spec.ts:126 — el boton de envio offline no aparece dentro de los 5 s y el test pasa en el reintento

**Que prueba el test.**
`change-password.spec.ts:126:5` — "offline: el boton de envio esta deshabilitado". Entra con
la contrasena nueva que dejo el primer test del mismo archivo, fuerza
`navigator.onLine = false` con `addInitScript` (antes de que React monte), va a
`/profile/change-password` y afirma que el boton "Cambiar contrasena" esta deshabilitado
(`change-password.tsx:39`).

**Que fallo (en simple).**
Fallo el intento 1 de 3 de la corrida completa del 2026-10-05. El `goto` a la pantalla
resolvio, pero cuando el test fue a buscar el boton todavia no habia formulario: a los 5 s
de la asercion la pagina seguia sin renderizarlo. Paso en el reintento (por eso Playwright lo
marca inestable, no fallido). Texto literal del `error-context.md`:

```
Error: expect(locator).toBeDisabled() failed

Locator: getByRole('button', { name: 'Cambiar contraseña' })
Expected: disabled
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeDisabled" with timeout 5000ms
  - waiting for getByRole('button', { name: 'Cambiar contraseña' })
```

En el spec, la linea que revienta es la **148**:

```ts
  const submitButton = page.getByRole('button', { name: SUBMIT_TEXT });
  await expect(submitButton).toBeDisabled();   // <-- linea 148
```

**Evidencia (unica, de los artifacts de esa corrida).**
Snapshot de la pagina en el momento del fallo — asi de vacia estaba la pantalla:

```yaml
- region "Notifications Alt+T"
```

No hay ni navbar, ni heading de la pantalla, ni formulario: el arbol de accesibilidad no
tiene contenido de la ruta. Archivo:
`frontend-react/test-results/change-password-offline-el-boton-de-envio-esta-deshabilitado-chromium/error-context.md`
(el trace conservado es el del reintento, `...-retry1/trace.zip`).

**Causa raiz: CONFIRMADA (2026-10-06) — la asercion corre dentro de la ventana de pre-hidratacion.**
El arbol vacio del `error-context.md` no es una app colgada: es **el shell SPA tal como lo sirve el
dev server, antes de que React monte la ruta**. Su arbol de accesibilidad es `region "Notifications
Alt+T"` y nada mas — exactamente el snapshot del fallo. Dos mediciones hechas hoy lo cierran (banco
de diagnostico temporal, borrado despues de medir; no se toco ningun test existente):

1. **El HTML servido para esa URL es, literalmente, el del snapshot.**
   `GET http://localhost:3333/profile/change-password` responde `200`, 186 302 bytes, y el `<body>`
   empieza asi:

   ```html
   <body><section class="Toastify" aria-live="polite" aria-atomic="false" aria-relevant="additions text" aria-label="Notifications Alt+T"></section><script>window.__reactRouterContext = {...}
   ```

   El documento **no contiene navbar, ni heading, ni formulario**, y la subcadena `oldPassword` no
   aparece en el HTML. El unico nodo del arbol de accesibilidad de ese documento es la region del
   `ToastContainer` (`root.tsx:82`): el snapshot del fallo es una foto de ese documento.
2. **La ventana entre `page.goto()` y el commit de la ruta es real, y se midio.** Un spec temporal
   muestreo el DOM cada ~20 ms desde que `page.goto()` resuelve (maquina libre, sin contencion):

   | Visita | `goto` resuelve | `#oldPassword` visible | Ventana con el DOM del shell |
   |---|---|---|---|
   | ruta fria (primer request: Vite compila el modulo) | 337 ms | 819 ms | ~480 ms |
   | ruta caliente (segunda visita) | 326 ms | 575 ms | ~250 ms |

   En las dos muestras, durante cientos de milisegundos, el DOM es exactamente el del snapshot:
   `form=false`, `h1=null`, `bodyLen=95991` (el largo del shell servido). `HydrateFallback` devuelve
   `null` a proposito (`root.tsx:165-167`, SPA mode), asi que en esa ventana **no hay ningun
   fallback visible**: la pantalla es el shell pelado.

**Mecanismo (por que falla).** `change-password.spec.ts:148` afirma
`await expect(submitButton).toBeDisabled()` **sin esperar antes a que el formulario exista**. La
unica espera de esa afirmacion es el default de Playwright para `expect`: **5 s**. Cualquier cosa
que alargue el arranque del cliente por encima de esos 5 s —la compilacion bajo demanda del dev
server y, sobre todo, la contencion de la corrida completa (la config reparte los tests entre todos
los CPUs: 8+ workers contra un unico dev server + backend + PostgreSQL)— hace que la asercion corra
y muera dentro de la ventana de pre-hidratacion. No es un defecto de la app ni de la asercion: es la
espera que falta.

**Clasificacion:** inestable de entorno/carga — **confirmada** (deja de ser tentativa): la ventana
de pre-hidratacion existe siempre (medida: ~250-480 ms en una maquina libre) y su duracion es lo
unico que depende de la carga.

**Propuesta de solucion — PUESTA EN PRACTICA el 2026-10-06 con autorizacion 1 a 1**
(ver "Fix aplicado y verificado" mas abajo).
Con la causa confirmada, esta es la espera exacta que falta:
Antes de la asercion de deshabilitado, esperar a que el formulario exista
(`await expect(page.locator('#oldPassword')).toBeVisible()`), que es lo que ya hace el test 1
del mismo archivo. Es la espera que falta: convierte los 5 s de la asercion en una espera del
estado real. Alternativa, si se repite: subir el timeout de esa unica asercion.

**Verificacion.** Hasta el 2026-10-06 ninguna: no se toco nada. La corrida completa marco el
test como inestable (paso al reintento) y no hay evidencia de un fallo determinista. El fix
se aplico despues — ver "Fix aplicado y verificado" mas abajo.

**Estado final (2026-10-06):** ✅ **causa raiz confirmada** — la asercion corre dentro de la ventana
de pre-hidratacion del shell SPA (medida: ~250-480 ms en maquina libre; el shell servido es
exactamente el snapshot del fallo). El fix (esperar el formulario antes de afirmar) sigue **sin
aplicar**: tocar el test requiere autorizacion 1 a 1.

---

## Re-verificacion en solitario (2026-10-06) — pasa, y eso sostiene la clasificacion

Se corrio **solo este spec**, con un worker y sin reintentos:

```
cd frontend-react
npx playwright test e2e/change-password.spec.ts --workers=1 --retries=0 --reporter=line
# 2 passed (50.0s)
# EXITCODE=0
```

Log: `/tmp/iso-change-password.log`. Teardown: 57 filas `e2e-*` borradas de `smca_test`.
**Respuesta al punto 1 de la propuesta** ("medir antes de parchear"): el archivo entero —los dos
tests, con el montaje de la ruta que aqui fallo— completa en 50.0 s cuando la maquina esta libre, muy
por debajo de cualquier umbral. Con la suite entera (4 workers + backend + dev server + PostgreSQL) el
paso 1 de este mismo test no llego a montar en 5 s. **La clasificacion "inestable de entorno/carga"
queda sostenida por evidencia** (antes era tentativa). El mecanismo fino quedo medido despues, el
mismo 2026-10-06: **no** era el bootstrap de sesion, era la ventana de pre-hidratacion del shell SPA
(seccion "Causa raiz: CONFIRMADA" arriba).

Evidencia de la corrida aislada en
[`funcionan-en-solitario.md`](funcionan-en-solitario.md).

---

## Fix aplicado y verificado (2026-10-06) — autorizacion 1 a 1

Se aplico el paso 1 de la propuesta tal cual: una espera explicita del montaje del formulario
**antes** de la asercion de deshabilitado. Unico cambio en `change-password.spec.ts`
(+6 lineas, de las cuales 4 son comentario; CRLF preservado):

```
const submitButton = page.getByRole('button', { name: SUBMIT_TEXT });
// ... comentario de la fija 01 ...
await expect(submitButton).toBeVisible({ timeout: 15_000 });  // la espera que faltaba
await expect(submitButton).toBeDisabled();                     // asercion INTACTA
```

La asercion **no se debilito**: sigue siendo `toBeDisabled()` con su default de 5 s; lo
anadido es la espera del estado real que la propia propuesta pedia.

Verificacion (foreground, sin suite completa):

```
npx playwright test --list e2e/change-password.spec.ts           # 2 tests, OK
npx playwright test e2e/change-password.spec.ts --workers=1 --retries=0 --reporter=list
# 2 passed (24.8s) · EXITCODE=0 · teardown: 57 filas e2e-* borradas de smca_test
```

**Estado final actualizado (2026-10-06):** ✅ causa raiz confirmada **y FIX APLICADO** —
ventana de pre-hidratacion medida, espera explicita anadida antes de la asercion y spec verde
en solitario (`2 passed (24.8s)`, exit 0).
