# El catálogo público (`/catalog/<slug>`) no pide actualizar ni expone nada del POS

## Objetivo

Ninguna página del catálogo web público (`/catalog/<slug>`) puede pedir que se actualice la app,
ni mostrar ninguna otra mecánica de la PWA del POS. Es una página para el cliente final de la
tienda: anónima, ajena al POS.

## Problema

El catálogo público **ya es anónimo**. Lo que se cuela es la PWA.

`app/root.tsx` monta el flujo del service worker para **todas** las rutas:

```ts
// root.tsx:111-114
useEffect(() => {
  const timer = setTimeout(() => registerServiceWorker(), 5000);
  return () => clearTimeout(timer);
}, []);
```

`registerServiceWorker()` cablea `onNeedRefresh`, que abre el diálogo `¡Nueva versión disponible!`.
En `/catalog/<slug>` eso aparece ante un visitante anónimo que no tiene nada que ver con el POS.

La causa raíz del bug es una **excepción aplicada a medias**: `root.tsx:106` ya excluye el botón
"Instalar App" del catálogo (`!pathname.startsWith('/catalog/')`), pero la misma excepción **no** se
aplicó a `registerServiceWorker()` tres líneas más abajo. La regla se escribió en un sitio y se
olvidó en el otro.

## Lo que YA está bien (no tocar)

- `/catalog/:storeSlug` es ruta **top-level** (`routes.ts:36`), hermana de `index()`. **No** cuelga
  del layout autenticado: `authLoader` vive en `app-layout.tsx:17` y esta ruta no está debajo.
- `public-catalog.tsx` **no exporta `loader`**. Lee el auth store solo para `staffMode`, nunca como
  puerta.
- Backend `[AllowAnonymous]` en `PublicCatalogController` y `PublicOrderingController`.
- Guardián existente: `app/__tests__/routes.app-layout-membership.test.ts:20-31` fija que
  `catalog/routes/public-catalog.tsx` siga fuera del layout autenticado. **Debe quedar verde.**

## Alcance

**Entra:**
- Extraer un predicado único `isPublicCatalogPath(pathname)` y usarlo en los dos sitios, para que la
  excepción no pueda volver a desincronizarse.
- `root.tsx`: no llamar `registerServiceWorker()` en rutas de catálogo público.
- `service-worker-registration.ts`: suprimir el diálogo si `onNeedRefresh` dispara estando en una
  ruta de catálogo público. Cubre la navegación SPA POS → catálogo, donde el SW ya está registrado.
- Tests nuevos.

**No entra / no tocar:**
- `root.tsx:72`, el `<script src="/pwa-install-capture.js">`. Solo parkea el evento
  `beforeinstallprompt` en `window.__pwaInstallPrompt`, sin UI. Su posición en `<head>` es
  **load-bearing para el hydration**: el comentario `:66-71` documenta que moverlo provoca un
  mismatch `#418` solo en producción. No vale el riesgo.
- `entry.client.tsx:13` `initPwaInstallCapture()`: adopta el evento parkeado, sin UI.
- El comportamiento global de actualización de la PWA del POS. Eso es otra decisión.
- `frontend/` (Angular, congelado).

## Por qué un solo predicado y no dos `startsWith`

El bug **es** la duplicación de la regla. Dos copias del mismo `startsWith` vuelven a divergir en el
próximo cambio. Una función con nombre, testeada, hace que la excepción sea una sola cosa.

## Archivos a tocar

1. `frontend-react/apps/web-store-pos/app/shared/lib/pwa/public-catalog-route.ts` *(nuevo)* — el predicado.
2. `frontend-react/apps/web-store-pos/app/root.tsx` — usarlo en `:106` y en el efecto de `:111`.
3. `frontend-react/apps/web-store-pos/app/shared/lib/pwa/service-worker-registration.ts` — guarda en `onNeedRefresh`.
4. Tests nuevos junto a los existentes.

## Tareas

- [ ] **T1** — predicado `isPublicCatalogPath` + su test (incluye `/catalog`, `/catalog/x`, y que
      NO capture `/sales/web-catalog` ni `/admin/modules` ni `/catalogo`).
- [ ] **T2** — `root.tsx`: no registrar el SW en catálogo público; el botón "Instalar App" pasa a
      usar el predicado. Test nuevo: no se llama `registerServiceWorker` en `/catalog/x`; sí en `/`.
- [ ] **T3** — `service-worker-registration.ts`: `onNeedRefresh` no abre el diálogo en catálogo
      público. Test nuevo.

## Criterios de aceptación

1. En `/catalog/<slug>` **nunca** aparece el diálogo de nueva versión.
2. En `/catalog/<slug>` el service worker **no se registra** (ni el poll de 5 min).
3. El botón "Instalar App" sigue oculto ahí, y ahora por el mismo predicado que lo demás.
4. El POS (`/`, `/sales/...`, `/admin/...`) conserva su comportamiento **exacto** de hoy: registro
   a los 5 s, aviso de nueva versión, poll de 5 min.
5. `/sales/web-catalog` y `/admin/modules` NO se ven afectados — contienen "catalog" en el path pero
   no son el catálogo público.
6. `routes.app-layout-membership.test.ts` sigue verde.

## Ruta de delegación

| Tarea | Ruta | Motivo |
| --- | --- | --- |
| T1–T3 | delegated writer | 3 archivos de fuente + tests, con lectura preparatoria de patrones de test existentes |
| verificación | parent spot check | re-correr los tests de las 4 suites tocadas |

## Progresión

- **T1** ✅ — `public-catalog-route.ts` con `isPublicCatalogPath`. Predicado puro, sin React ni
  `window`. Normaliza la barra final y recorta `?`/`#` en el borde, no en el llamador. 18 casos.
- **T2** ✅ — `root.tsx`: un único `onPublicCatalog` alimenta el botón "Instalar App" y el efecto
  del service worker. **Las dependencias siguen `[]` a propósito**, con un
  `eslint-disable-next-line react-hooks/exhaustive-deps` justificado: `registerServiceWorker()`
  cablea `registerSW` —y con él `onNeedRefresh` y el poll de 5 min— **una vez por llamada**, así
  que reevaluar en cada navegación dejaría que un POS que va al catálogo y vuelve lo cableara dos
  veces (doble diálogo, doble poll). El ejecutor lo midió: con `[onPublicCatalog]` el test de
  "registra una sola vez" pasó a `expected "spy" to be called 1 times, but got 2 times`. Y del POS
  al catálogo solo se llega por URL absoluta con `target="_blank"` (`web-catalog.tsx:1120`), o sea
  con carga de página nueva donde el efecto arranca de cero.
- **T3** ✅ — `onNeedRefresh` retorna temprano en ruta de catálogo público. Supresión **total**: sin
  toast ni aviso sustituto, solo el `console.info` que el módulo ya usa para cada evento. Cubre el
  salto SPA POS → catálogo, donde el SW ya está registrado y `onNeedRefresh` está vivo.

### Evidencia observada

| Verificación | Resultado |
| --- | --- |
| RED observado por el ejecutor | **8 fallos reales**: `root.test.tsx` (`spy` llamado 1 vez cuando debía ser 0) y `service-worker-registration.test.ts` (`Swal.fire` recibió las opciones del diálogo) — ambos sobre código de producción real |
| `pnpm vitest run app/shared/lib/pwa app/__tests__/root.test.tsx app/__tests__/routes.app-layout-membership.test.ts` | **7 archivos, 74/74**, `Type Errors: no errors` |
| Guardián `routes.app-layout-membership` | verde — el catálogo sigue fuera del layout autenticado |
| `pnpm typecheck` | 5/5 |
| `pnpm lint` | 4/4 |
| `public-app-layout.test.ts` (spot check del padre) | 2/2 aislado en 3.1 s — el timeout de 15 s del full run es de carga, no de este cambio |

### Donde NO hubo RED

El ejecutor lo declara: la matriz del predicado no podía fallar contra código real (no existía), así
que la montó contra un stub `() => false` deliberado para convertirla en RED de aserción genuino en
vez de fingir un error de resolución. El test "registra una sola vez aunque la SPA navegue al
catálogo y vuelva" **pasa hoy**: es un guardián de regresión de la decisión `[]`, no una
reproducción del bug, y su mordida se probó con un mutation probe.

### Cambio en un archivo de test compartido (revisable)

`app/__tests__/root.test.tsx` recibió un mock **aditivo** de `useLocation`: las 5 casos nuevos
sobreescriben el pathname, y para **todos los demás tests del archivo** el mock devuelve `null`, o
sea queda inerte. Sigue siendo un cambio en un archivo compartido y se declara como tal.

### Límite de verificación

No se corrió Playwright (no autorizado). El camino de navegación SPA queda cubierto por unitarios y
lectura de código, **no end-to-end**. El ejecutor documenta por qué no pudo conducir navegación real:
`createMemoryRouter().navigate()` post-mount rompe en jsdom con
`TypeError: RequestInit: Expected signal ("AbortSignal {}") to be an instance of AbortSignal`, y
ningún test del repo navega post-mount sobre un data router.

### Fuera de alcance (no tocado)

`root.tsx:72` (`<script src="/pwa-install-capture.js">`, posición load-bearing para el hydration
`#418`) y `entry.client.tsx` (`initPwaInstallCapture()`). Ninguno muestra UI.

## Riesgo / presupuesto

Bien por debajo de las ~400 líneas authored. Sin migración, sin backend.
