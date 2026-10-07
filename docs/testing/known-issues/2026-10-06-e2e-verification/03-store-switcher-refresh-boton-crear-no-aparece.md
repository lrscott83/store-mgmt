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

**Causa raiz: CONFIRMADA (2026-10-06) — el boton depende de la tienda de la seleccion PERSISTIDA,
no de la tienda que el spec siembra.**
El snapshot ya decia lo esencial: la ruta pinto con sus tarjetas y sin el boton, o sea
`user.storeModuleIds` sin el 14 (`my-stores.tsx:37`). Lo que faltaba era **por que** ese perfil no
traia el 14, y la respuesta esta en el repo: `GetMeQuery.cs:103` calcula `StoreModuleIds` con los
modulos de la tienda **`user.SelectedStoreId`** —la seleccion del usuario en la BASE, no la que el
spec cree tener—, y esa seleccion la **persiste la app**: `SwitchMyStoreCommand.cs:98`
(`user.SelectedStoreId = request.StoreId`). El spec, mientras tanto, siembra el 14 en la tienda de
su **snapshot** (`selectedStoreId`) y confia en el /me.

La pieza que hace que la condicion sea silenciosa: **una tienda creada por la interfaz nace en el
plan Pago, y ese catalogo NO incluye MultiStores (14)**. `CreateStoreCommand` la clampa
explicitamente (*"12..17 — WholesaleSales, Warehouses, MultiStores, ... inherited from a
Superior/VIP selected store are never copied"*). O sea: apenas la seleccion persistida apunta a
una tienda creada por la UI, el /me responde sin el 14 y el boton de crear **no existe** para el
`getByTestId('my-stores-create-button').click()`, que reintenta hasta los 120 s del test.

**Este mismo modo ya estaba diagnosticado en este repo, en el spec vecino.**
`store-switch-back-logout.spec.ts` (SSR-2, 2026-09-26) lo dice con esas palabras: *"SSR-1 (the
serial test right before this one) ends with store B persisted server-side, so /me would answer
with B's modules and the '+ Tienda' button would never render"*, y por eso agrega
`realignBackendSelectedStore(page, selectedStoreId)` (un `PUT /v1/stores {storeId}`) **antes** de
sembrar. SSR-3 lo repite: *"its module set lacks MultiStores 14 and '+ Tienda' never renders"*.
`store-switcher-refresh.spec.ts` **no tiene ese realineado**: confia en que la seleccion persistida
sigue siendo la de su snapshot. En una corrida aislada lo es (por eso SWR-1 pasa en solitario
2/2); en una corrida completa no, porque el worker reutiliza su `personaCache` entre archivos y
cualquier archivo que cambio la seleccion antes que el —o el propio archivo del switcher, que es
`serial` y **salta sus realineados (SSR-2/SSR-3) cuando SSR-1 falla**— deja la seleccion apuntando a
una tienda sin el 14. El snapshot del 2026-10-05 incluso muestra la huella de esa convivencia: la
segunda tarjeta es `E2E-EDIT-1791239440732`, una tienda que creo **otro** spec en el mismo worker.

**Evidencia medida hoy (instrumentacion desechable, borrada despues):**

1. **Estado real que deja el spec vecino.** Un run dirigido de `SSR-1` (dos archivos en un worker)
   dejo en `smca_test` exactamente esto, leido por polling de la base:
   `e2e-20261006T110140-8r405v -> sel=e2e-ssr-second-1791298918420 (plan 2, module14=0, stores=2)`.
   La seleccion persistida en una tienda creada por la interfaz: plan Pago y **0 filas** de
   `StoreModule` para el modulo 14.
2. **La demostracion deterministica del mecanismo** (spec temporal que pasa porque el boton NO
   aparece):

   ```
   [tmp-drift] A=6baaae58-... (module14=1) · B=56a1220e-... (module14=0)
   [tmp-drift] perfil tras /me: selectedStoreId=56a1220e-... storeModuleIds=[2,3,4,5,6,7,8,9,10,11]
   [tmp-drift] boton de crear visible = false
   1 passed (2.8m)
   ```

   A es la tienda del snapshot (con el 14 sembrado por el SQL del propio spec), B es una tienda
   creada por el modal real, y la seleccion se movio con `PUT /v1/stores` —el mismo primitivo que
   usa `realignBackendSelectedStore`, en la direccion contraria—. Con esa seleccion, el /me devuelve
   un perfil sin el 14 (`storeModuleIds` = [2..11]) y `my-stores-create-button` **nunca se hace
   visible**; el clic del spec habria esperado los 120 s y muerto igual que el 2026-10-05.

**Tercera aparicion de un modo conocido — ya diagnosticado en el spec vecino, nunca conectado con
esta ficha.**

- `2026-09-29` — el mismo sintoma exacto ("el boton de crear tienda nunca aparece, timeout 120 s")
  quedo como fallo 6 de la corrida del merge de qa (registro en
  [`README.md`](README.md#registro-de-fichas-retiradas)) y
  se cerro como **"no se reproduce"** (2/2 verdes el 2026-10-04, sin causa raiz investigada).
- `2026-09-25` — en la serie de estabilidad de 7 corridas, SWR-1 fue el **unico flaky** de la
  corrida 7 (etiquetado entonces como "esporadico, segunda aparicion, absorbido por el reintento").
- `2026-10-05` — vuelve a fallar en el intento 1 de la corrida completa. Esta es la primera vez que
  se conserva el snapshot del momento del fallo, y es el que muestra que la ruta pinto sin el boton.

**Clasificacion:** defecto de **precondicion del test** (no de la aplicacion) — **confirmado**: el
boton esta detras de un permiso de la SESION, y la sesion depende de una seleccion que otra parte
del suite puede haber movido y que la app persiste en la base. No hay defecto de la app.

**Propuesta de solucion — APLICADA el 2026-10-06 (autorizacion 1 a 1 del usuario, solo a este spec).**
La misma que ya usa el spec vecino, en el mismo punto: **realinear la seleccion persistida antes de
la precondicion** — un `PUT /v1/stores { storeId: selectedStoreId }` (el equivalente a
`realignBackendSelectedStore`, que es no-op cuando ya coincide) al principio de SWR-1 y de SWR-2, y
recien despues sembrar el 14 y refrescar con el /me. Alternativa si se prefiere no tocar el spec:
que la restauracion de la sesion realinee la seleccion en la base, para que la del snapshot y la de
la base no puedan divergir. Como red de seguridad del diagnostico: esperar el boton como
precondicion visible (`await expect(button).toBeVisible()`) para que un fallo futuro apunte a
"perfil sin permiso" en vez de a un clic que espera 120 s.

**Los dos puntos de la propuesta original — respondidos por la medicion de hoy:** (1) en solitario
el 14 SI llega al perfil (SWR-1 pasa; el sembrado y el /me funcionan), y (2) el perfil no lo pierde
por la recarga: lo pierde porque el /me describe la tienda de la **seleccion persistida**, que no
es la del snapshot.

**Verificacion (2026-10-05).** Ninguna: no se toco nada en esa fecha. La corrida completa marco el
test como inestable (paso al reintento).

**Aplicada y verificada (2026-10-06, sobre `store-switcher-refresh.spec.ts`).** Se agrego el helper
`realignSelectedStore(page, storeId)` —un `PUT /v1/stores { storeId }`, el mismo realineado del spec
vecino— y se lo llama antes de `seedMultiStoresModule` + `refreshSessionFromMe` en SWR-1 y en SWR-2,
con la causa raiz documentada en la cabecera del archivo. La red de seguridad del diagnostico
(esperar el boton como precondicion visible) NO se agrego: queda para una autorizacion aparte. La
instrumentacion de medicion (sonda de base y runner) fue temporal y se elimino.

Verificacion, comandos y resultados observados:

```
cd frontend-react
npx playwright test e2e/store-switcher-refresh.spec.ts --workers=1 --retries=0 --reporter=line
# 2 passed (45.1s)

# escenario del drift, un worker, dos archivos (SSR-1 deja la seleccion en B, sin el 14; SWR-1 corre despues):
npx playwright test e2e/store-switch-back-logout.spec.ts e2e/store-switcher-refresh.spec.ts \
  --grep "SSR-1|SWR-1" --workers=1 --retries=0 --reporter=line
# 2 passed (2.3m) · EXITCODE=0
```

Sonda de base (solo cambios) durante la segunda corrida:

```
15:33:15  e2e-…-7fjx25 -> sel=e2e-ssr-second-1791300784013 (module14=0, stores=2)     <- el drift que deja SSR-1
15:33:20  e2e-…-7fjx25 -> sel=E2E Store 20261006T113239-7fjx25 (module14=1, stores=2)  <- realineado de SWR-1
15:33:23  e2e-…-7fjx25 -> sel=E2E Store 20261006T113239-7fjx25 (module14=1, stores=3)  <- SWR-1 creo su tienda
```

La misma condicion que reproducia el timeout de 120 s —seleccion persistida en una tienda creada por
la interfaz, sin el modulo 14— ahora termina en verde, y la sonda muestra el realineado en el momento
exacto en que SWR-1 arranca.

**Estado final (2026-10-06):** ✅ **causa raiz confirmada y fix aplicado y verificado** — precondicion
de sesion: la seleccion persistida puede apuntar a una tienda creada por la interfaz (plan Pago, sin
el modulo 14), y el boton de crear no existe para ese perfil. El realineado quedo aplicado en
`store-switcher-refresh.spec.ts` con autorizacion 1 a 1 del usuario (2026-10-06) y verificado en el
escenario del drift (`2 passed`, exit 0).

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
  en 120 s) no se reproduce con la maquina libre. La respuesta al punto 1 de la propuesta ("medir en
  solitario") queda dada: la preparacion de la sesion —sembrar el 14 por SQL y refrescar con un /me
  real— **si trae el modulo 14** cuando no hay contencion, porque el spec llega a crear la tienda por
  la interfaz y a abrir el switcher. Lo que hoy se sabe —y esta corrida aislada ya lo anticipaba— es
  que eso vale **siempre que nadie haya movido antes la seleccion persistida**: aislado no puede
  pasar; en la corrida completa, si.
- **SWR-2 — cae en solitario en una de dos corridas, con un modo que ninguna ficha tenia
  documentado.** (Corrida 1: falla; corrida 2, 25.8 s: 2 passed.) El fallo no es el de esta ficha: es
  la asercion de la marca "Actual" del popup, que choca con el aviso de exito del guardado («Tienda
  **actual**izada correctamente.») por un locator de substring. Es un defecto propio del test, y
  **no** de carga: por eso SWR-2 no entra a la lista de "pasa en solitario".
  **Ficha nueva:** [`04-store-switcher-refresh-swr2-locator-actual.md`](04-store-switcher-refresh-swr2-locator-actual.md).

Evidencia de la corrida aislada en
[`funcionan-en-solitario.md`](funcionan-en-solitario.md).

**Estado final actualizado (2026-10-06):** ✅ causa raiz **confirmada y cerrada** — SWR-1 pasa en
solitario (2/2) porque aislado la seleccion persistida no puede estar movida; el mecanismo
(precondicion de sesion sobre la tienda de la seleccion PERSISTIDA, sin realineado) quedo confirmado
con la medicion de arriba, y el unico fallo del archivo en solitario es el de SWR-2, que tiene ficha
propia: [`04-store-switcher-refresh-swr2-locator-actual.md`](04-store-switcher-refresh-swr2-locator-actual.md).
