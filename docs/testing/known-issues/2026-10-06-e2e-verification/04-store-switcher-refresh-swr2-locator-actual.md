# 4. store-switcher-refresh.spec.ts (SWR-2) — caía de forma intermitente por un locator que también casa con su propio aviso de éxito — FIX APLICADO 2026-10-06

**Qué prueba el test.**
`store-switcher-refresh.spec.ts:196:5` — "SWR-2 — a store deactivated this session disappears from
the switcher (current store never does)", dentro de un bloque
`test.describe.configure({ mode: 'serial', timeout: 120_000 })`. Sobre la persona `owner-admin`:
siembra el módulo MultiStores (14) por SQL en su tienda seleccionada, refresca el perfil con un
`GET /v1/auth/me` real (`refreshSessionFromMe` reescribe `localStorage.currentUser` y recarga), crea
una tienda por la interfaz, **la desactiva por el flujo real** (menú de la tarjeta → Editar → apagar
"Activa" → Guardar → confirmar el diálogo) y afirma que el switcher del header deja de ofrecerla —
mientras la tienda actual nunca desaparece del selector.

**Qué falla (en simple).**
Cuando falla, no es el fallo que documentan las fichas previas de esta suite (*el botón de crear
tienda nunca aparece*): la tienda se desactiva, la base de datos queda con `isActive = false` y el
switcher hace lo que debe. Lo que falla es **la aserción que busca la marca "Actual" dentro del popup
del switcher**: hay dos elementos en pantalla con la palabra "Actual" al mismo tiempo y Playwright se
niega a elegir. Texto literal del reporte (corrida en solitario del 2026-10-06, intento 1):

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Actual')
Expected: visible
Error: strict mode violation: getByText('Actual') resolved to 2 elements:
    1) <span class="shrink-0 rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-medium text-cyan-700">Actual</span>
       aka getByRole('button', { name: 'E2E Store 20261006T093215-' })
    2) <div tabindex="0" data-in="false" id="Tienda actualizada correctamente."
       class="Toastify__toast Toastify__toast-theme--light Toastify__toast--success Toastify--animate Toastify__bounce-exit--top-right">…</div>
       aka getByText('Tienda actualizada')

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Actual')
```

La línea que revienta es la **170** del spec, dentro del ayudante `openSwitcherPopup`:

```ts
async function openSwitcherPopup(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cambiar tienda' }).click();
  await expect(page.getByText('Actual')).toBeVisible();   // <-- línea 170
}
```

La otra aparición del mismo locator, ya en el cuerpo de SWR-2, es la línea **245**.

**Causa raíz: CONFIRMADA — defecto del test (locator demasiado amplio).**

- `getByText('Actual')` busca **substring** y **sin distinguir mayúsculas** — es el comportamiento por
  defecto de Playwright (`exact: false`). El aviso de éxito del guardado dice
  «Tienda **actual**izada correctamente.» (`app/shared/lib/i18n/es.ts:1095`, `STORES.UPDATE_SUCCESS`,
  emitido por `app/management/stores/routes/my-stores.tsx:202`). Contiene la cadena "actual".
- La marca legítima ("Actual") es un `<span>` **dentro del botón de la tienda** — Playwright la nombra
  en el propio reporte: `getByRole('button', { name: 'E2E Store …' })`. Un locator por rol y nombre
  accesible no tendría esta colisión.
- **El aviso lo dispara el propio test**, dos pasos antes: la desactivación pasa por el guardado del
  formulario, que es exactamente el `showToastSuccess(STORES.UPDATE_SUCCESS)` de la línea 202.
- El nodo del aviso aparece en el reporte **todavía montado y en plena animación de salida**
  (`data-in="false"`, `Toastify__bounce-exit--top-right`), capturado al final de los 5 s de la
  aserción. El `ToastContainer` de `app/root.tsx:82` usa `autoClose={1000}` y saca el nodo del DOM
  cuando termina su salida: la ventana de colisión depende de una animación, y ahí está la carrera.

**Es intermitente, no determinista — en las dos direcciones.** Se corrio el spec en solitario **dos
veces** el 2026-10-06:

| Corrida | Resultado | Duración | Exit |
| --- | --- | --- | --- |
| 1 (09:31:45) | **1 failed (SWR-2)** + 1 passed (SWR-1) | 48.7 s | 1 |
| 2 (09:40:24) | **2 passed** | 25.8 s | 0 |

En la suite completa nunca fallo con este modo (2026-10-04: 2/2 verde; 2026-10-05: SWR-1 inestable,
SWR-2 sin fallar). La explicación mas simple —y la unica compatible con las tres observaciones— es una
carrera entre la vida del aviso y el momento en que la aserción resuelve: cuanto mas rapido llega el
test a `openSwitcherPopup` (poll de la base de datos al instante, como en la corrida 1), mas probable
que el aviso siga en el DOM. No es un fallo que se pueda "arreglar" subiendo un timeout: el locator
sigue siendo ambiguo.

**Contraste que cierra el diagnostico (mismo ayudante, mismo momento, unico cambio = el texto).**
SWR-1 llama al **mismo** `openSwitcherPopup` en la misma situación y no cae nunca por esto, porque su
ultimo aviso es el de creacion, «Tienda creada correctamente.» (`es.ts:1094`, `STORES.CREATE_SUCCESS`,
`my-stores.tsx:175`) — que **no** contiene la cadena "actual". SWR-2 hace crear **y** editar, y el
aviso de edicion si la contiene.

**Evidencia.**

- Reporte de strict mode citado arriba, con los dos elementos nombrados por Playwright y el artifact
  `frontend-react/test-results/store-switcher-refresh-SWR-d86fc-r-current-store-never-does--chromium/error-context.md`.
  El directorio de artifacts se regenera en **cada** corrida de Playwright, asi que la cita completa
  del reporte quedo preservada en el log de la corrida que fallo: `/tmp/iso-store-switcher-refresh.log`
  (la corrida benigna es `/tmp/iso-swr-run2.log`).
- Comandos exactos, desde `frontend-react/`:

  ```
  npx playwright test e2e/store-switcher-refresh.spec.ts --workers=1 --retries=0 --reporter=line
  ```

- Teardown de ambas corridas: 161 filas `e2e-*` borradas de `smca_test` — el backend era el correcto
  en las dos.

**Clasificación:** defecto del test. La aplicación y el entorno quedan descartados: la pantalla, la
desactivación por la interfaz y el switcher hicieron exactamente lo que el test esperaba.

**Propuesta de solución — APLICADA el 2026-10-06 con autorización 1 a 1 (opción 2).**
Acotar el locator de la marca de "tienda actual" a lo que de verdad la representa. Las dos formas
que se plantearon, en orden de preferencia:

1. Por rol y nombre accesible del **botón de esa tienda** (que es el contenedor real de la marca), o
   por un `getByTestId` del marcador dentro de ese botón. — **no usada**.
2. **APLICADA:** `getByText('Actual', { exact: true })` — cierra la colisión con el aviso sin cambiar
   la semántica de la aserción. Aplicada en los dos sitios: el ayudante `openSwitcherPopup` y la
   aserción final de SWR-2, cada una con su comentario del porqué.

**Prueba de mutación — HECHA el 2026-10-06 con una sonda desechable (borrada tras medir).**
Se provocó el aviso «Tienda actualizada correctamente.» por el flujo real de guardado y se midieron
los DOS estados por separado: la ventana del aviso es de 1 s (`root.tsx:82 autoClose={1000}`), así
que intentar medirlos a la vez era una carrera (medido: al contar, el aviso ya había desaparecido).

```
[sonda] ESTADO aviso  -> locator viejo=1  locator exacto=0
[sonda] ESTADO marca  -> locator viejo=1  locator exacto=1  aviso=0
1 passed (17.9s) · EXITCODE=0
```

Es decir: el locator viejo casa con **dos nodos distintos** (aviso y marca), así que con ambos en
el DOM resuelve a 2 y `toBeVisible()` revienta con `strict mode violation` — el fallo observado. El
locator nuevo (`exact: true`) nunca ve más de uno.

**Verificación del fix (foreground, sin suite completa).** `--list` OK (4 tests en 2 ficheros) y el
spec en solitario **dos veces seguidas**, sin reintentos:

```
npx playwright test e2e/store-switcher-refresh.spec.ts --workers=1 --retries=0 --reporter=list
# corrida 1: 2 passed (22.4s) · EXITCODE=0
# corrida 2: 2 passed (21.7s) · EXITCODE=0
```

**Estado final (2026-10-06):** ✅ **fix aplicado y verificado** — locator acotado a
`getByText('Actual', { exact: true })` en los dos sitios con autorización 1 a 1; la sonda midió que
el locator viejo casa con 2 nodos y el nuevo con 1; spec verde dos corridas seguidas en solitario
(`2 passed`, 22.4 s y 21.7 s, exit 0). La sonda se borró tras medir; el test existente solo se tocó
en esas dos líneas de locator y sus comentarios.
