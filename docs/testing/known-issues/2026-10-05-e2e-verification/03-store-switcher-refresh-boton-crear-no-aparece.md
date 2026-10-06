# 3. store-switcher-refresh.spec.ts:173 — el boton de crear tienda nunca aparece y el test pasa en el reintento

**Que prueba el test.**
`store-switcher-refresh.spec.ts:173:5` — "SWR-1 — a store created this session appears in the
header switcher without re-login" (bloque `test.describe.configure({ mode: 'serial',
timeout: 120_000 })`). Prepara la persona `owner-admin`: inserta el modulo MultiStores (14) en su
tienda seleccionada por SQL directo, refresca el perfil de la sesion con un GET /v1/auth/me real
(`refreshSessionFromMe` reescribe `localStorage.currentUser` y recarga), entra a
`/management/my-stores`, crea una tienda por la interfaz y afirma que el switcher del header la
ofrece sin re-login.

**Que fallo (en simple).**
Fallo el intento 1 de 3 de la corrida completa del 2026-10-05. El test llego a la pantalla y esta
pinto sus tarjetas, pero **el boton de crear tienda nunca existio en el DOM**: el clic espero los
120 s del timeout y murio. Paso en el reintento (por eso Playwright lo marca inestable, no
fallido). Texto literal del `error-context.md`:

```
Test timeout of 120000ms exceeded.

Error: locator.click: Test timeout of 120000ms exceeded.
Call log:
  - waiting for getByTestId('my-stores-create-button')
```

La linea que revienta es la **156** del spec, dentro del ayudante `createStoreViaUi`:

```ts
async function createStoreViaUi(page: Page, name: string) {
  await page.getByTestId('my-stores-create-button').click();   // <-- linea 156
```

**Evidencia (unica, de los artifacts de esa corrida).**
Snapshot de la pagina al agotarse el tiempo — la ruta si renderizo, con su titulo y sus tarjetas,
pero **sin el boton de crear**:

```yaml
- main [ref=f3e57]:
  - heading "Mis tiendas" [level=1] [ref=f3e60]
  - heading "e2e-owner-store-create-1791239308573" [level=3] [ref=f3e64]
  - button "Acciones" [ref=f3e68]
  - heading "E2E-EDIT-1791239440732" [level=3] [ref=f3e79]
  - button "Acciones" [ref=f3e83]
```

Archivo:
`frontend-react/test-results/store-switcher-refresh-SWR-7aa52-r-switcher-without-re-login-chromium/error-context.md`
(el trace conservado es el del reintento, `...-retry1/trace.zip`).

**Causa raiz: NO CONFIRMADA.**
Lo que la evidencia permite afirmar:

- No es un arranque colgado: la pantalla renderizo su titulo y las tarjetas de tiendas.
- El boton de crear esta detras de un permiso de sesion, no del dibujo de la ruta:
  `my-stores.tsx:37` calcula `hasMultiStores = (user?.storeModuleIds ?? []).includes(14)` y la
  linea **217** solo pinta `my-stores-create-button` si ese valor es verdadero. El snapshot sin el
  boton significa que el perfil en memoria **no traia el modulo 14**.
- El test hace exactamente lo que su comentario de cabecera dice que hace falta para que lo traiga
  (sembrar el 14 por SQL y refrescar el perfil con un /me real). Ninguna de esas dos cosas fallo de
  forma ruidosa: el INSERT es idempotente y `refreshSessionFromMe` lanza excepcion si el /me no
  responde. Quedo por medir **que devolvio ese /me** y si el 14 estaba en el perfil recargado.
- No puede ser una carrera de milisegundos: el clic reintenta hasta 120 s y el boton no aparecio en
  ninguno. O el perfil nunca llevo el 14, o la hidratacion posterior a la recarga lo reemplazo por
  uno sin el 14 (por ejemplo, un /me posterior filtrado por facturacion). Con un solo snapshot no
  se puede distinguir.

**Tercera aparicion de un modo conocido — nunca antes diagnosticado.**

- `2026-09-29` — el mismo sintoma exacto ("el boton de crear tienda nunca aparece, timeout 120 s")
  quedo como fallo 6 de la carpeta [`../qa-merge-2026-09-29/`](../qa-merge-2026-09-29/README.md) y
  se cerro como **"no se reproduce"** (2/2 verdes el 2026-10-04, sin causa raiz investigada).
- `2026-09-25` — en la serie de estabilidad de 7 corridas, SWR-1 fue el **unico flaky** de la
  corrida 7 (etiquetado entonces como "esporadico, segunda aparicion, absorbido por el reintento").
- `2026-10-05` — vuelve a fallar en el intento 1 de la corrida completa. Esta es la primera vez que
  se conserva el snapshot del momento del fallo, y es el que muestra que la ruta pinto sin el boton.

**Clasificacion:** inestable de entorno/carga en la preparacion de la sesion (tentativo). No hay
evidencia de defecto de la aplicacion ni de expectativa equivocada del test.

**Propuesta de solucion (no aplicada — tocar un test E2E requiere autorizacion 1 a 1).**
Medir antes de parchear:

1. Correr el spec en solitario (`pnpm exec playwright test e2e/store-switcher-refresh.spec.ts`) y
   registrar el `storeModuleIds` del perfil despues de `refreshSessionFromMe`. Si el 14 esta, el
   problema es la recarga bajo carga; si no esta, el problema es el sembrado o el filtro de
   facturacion del /me.
2. Si el modulo llega pero la recarga lo pierde, dejar de depender de la recarga: esperar el boton
   como precondicion visible antes de usarlo (`await expect(button).toBeVisible()` con el mismo
   timeout) para que el fallo apunte a la causa (perfil sin permiso) en vez de al clic.

**Verificacion.** Ninguna: no se toco nada. La corrida completa marco el test como inestable
(paso al reintento).

**Estado final (2026-10-05):** 🟡 inestable documentado — sin diagnostico cerrado, con dos
antecedentes (2026-09-25 y 2026-09-29) del mismo sintoma.

---

## Re-verificacion en solitario (2026-10-06) — SWR-1 pasa; aparecio **otro** fallo, el de SWR-2

Se corrio **solo este spec**, con un worker y sin reintentos:

```
cd frontend-react
npx playwright test e2e/store-switcher-refresh.spec.ts --workers=1 --retries=0 --reporter=line
# 1 failed (SWR-2) · 1 passed (SWR-1) · 48.7s
# EXITCODE=1
```

Log: `/tmp/iso-store-switcher-refresh.log`.

- **SWR-1 (esta ficha) — pasa en solitario.** Su modo de fallo (el boton de crear tienda no aparece
  en 120 s) no se reproduce con la maquina libre, lo que **sostiene la clasificacion de carga** de esta
  ficha. La respuesta al punto 1 de la propuesta ("medir en solitario") queda dada: la preparacion de
  la sesion —sembrar el 14 por SQL y refrescar con un /me real— **si trae el modulo 14** cuando no hay
  contencion, porque el spec llega a crear la tienda por la interfaz y a abrir el switcher.
- **SWR-2 — cae en solitario en una de dos corridas, con un modo que ninguna ficha tenia
  documentado.** (Corrida 1: falla; corrida 2, 25.8 s: 2 passed.) El fallo no es el de esta ficha: es
  la asercion de la marca "Actual" del popup, que choca con el aviso de exito del guardado («Tienda
  **actual**izada correctamente.») por un locator de substring. Es un defecto propio del test, y
  **no** de carga: por eso SWR-2 no entra a la lista de "pasa en solitario".
  **Ficha nueva:** [`../2026-10-06-e2e-verification/01-store-switcher-refresh-swr2-locator-actual.md`](../2026-10-06-e2e-verification/01-store-switcher-refresh-swr2-locator-actual.md).

Evidencia de la corrida aislada en
[`../funcionan-en-solitario/README.md`](../funcionan-en-solitario/README.md).

**Estado final actualizado (2026-10-06):** 🟡 inestable documentado — SWR-1 pasa en solitario en las
dos corridas (clasificacion de carga sostenida); el unico fallo del archivo es de SWR-2, intermitente y
propio del test, con ficha nueva en la carpeta del 2026-10-06.
