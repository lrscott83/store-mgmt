# 4. store-switcher-refresh.spec.ts:196 — SWR-2 cae de forma intermitente por un locator que también casa con su propio aviso de éxito

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

**Propuesta de solución (NO aplicada — tocar un test E2E existente requiere autorización 1 a 1).**
Acotar el locator de la marca de "tienda actual" a lo que de verdad la representa. Dos formas, en
orden de preferencia:

1. Por rol y nombre accesible del **botón de esa tienda** (que es el contenedor real de la marca), o
   por un `getByTestId` del marcador dentro de ese botón.
2. Mínima y quirúrgica: `getByText('Actual', { exact: true })` — cierra la colisión con el aviso sin
   cambiar la semántica de la aserción. Se aplica igual en la línea 170 (ayudante) y en la 245.

**Prueba de mutación propuesta** (cuando haya autorización): con el arreglo puesto, provocar de nuevo
el aviso «Tienda actualizada correctamente.» justo antes de abrir el popup y comprobar que el test
sigue verde — hoy esa es la forma mas barata de reintroducir el fallo; sin el arreglo, vuelve a caer en
la línea 170 con el mismo `strict mode violation` de dos elementos.

**Verificación.** Ninguna sobre el codigo: no se toco el test ni la aplicación. Lo hecho es correr el
spec en solitario dos veces y leer los reportes de Playwright.

**Estado final (2026-10-06):** 🔴 abierto — defecto del test confirmado, intermitente, sin autorización
para corregirlo.
