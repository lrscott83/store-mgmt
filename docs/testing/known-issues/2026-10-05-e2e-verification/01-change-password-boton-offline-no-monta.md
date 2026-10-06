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

**Causa raiz: NO CONFIRMADA.**
Lo que la evidencia permite afirmar:

- No es un defecto de la asercion: el boton existe y se deshabilita cuando la pagina esta
  montada (el reintento y las corridas anteriores pasan). La asercion esta bien escrita.
- El modo de fallo es de **tiempo de montaje**: la asercion tiene solo 5 s (default de
  Playwright para `expect`) y espera el boton sin esperar antes a que el formulario este en
  pantalla. Bajo la carga de la suite completa (4 workers + backend + dev server + PostgreSQL)
  el arranque de esa ruta no completo dentro de esa ventana.
- No hay snapshot intermedio (que pantalla se veia en lugar del formulario) porque la pagina
  no renderizo ningun nodo: no se puede distinguir entre "app arrancando" y "ruta colgada en
  el bootstrap de sesion".

**Clasificacion:** inestable de entorno/carga (tentativo). Ni defecto del test (la asercion
es correcta) ni defecto de la aplicacion demostrado.

**Propuesta de solucion (no aplicada — tocar un test E2E requiere autorizacion 1 a 1).**
Antes de la asercion de deshabilitado, esperar a que el formulario exista
(`await expect(page.locator('#oldPassword')).toBeVisible()`), que es lo que ya hace el test 1
del mismo archivo. Es la espera que falta: convierte los 5 s de la asercion en una espera del
estado real. Alternativa, si se repite: subir el timeout de esa unica asercion.

**Verificacion.** Ninguna: no se toco nada. La corrida completa marco el test como inestable
(paso al reintento) y no hay evidencia de un fallo determinista.

**Estado final (2026-10-05):** 🟡 inestable documentado — sin diagnostico cerrado.

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
queda sostenida por evidencia** (antes era tentativa); el mecanismo fino —si el retraso fue del
bootstrap de sesion o del montaje de la ruta— sigue sin medirse, y por eso el estado no cambia.

Evidencia de la corrida aislada en
[`../funcionan-en-solitario/README.md`](../funcionan-en-solitario/README.md).

**Estado final actualizado (2026-10-06):** 🟡 inestable documentado — clasificacion de carga
confirmada por corrida aislada, mecanismo sin cerrar.
