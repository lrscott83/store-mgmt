# Catálogo público — header fijo, navegación, carrusel corregido y banner fuera

## Objetivo

Rehacer la cabecera y la portada de la carta pública (`/catalog/{storeSlug}`) para que:

1. El **header sea fijo arriba**, con logo y nombre de la tienda a la izquierda, y a la derecha la
   navegación (**Inicio · Destacados · Productos**); en móvil esa navegación va en un desplegable.
2. El **carrusel vaya debajo del header** y se vea **de a una imagen** (hoy las diapositivas se
   apilan y reservan altura para todas).
3. **El banner desaparezca** de la página y de la configuración del dueño.
4. El **carrito** pase a ser el ícono con badge del POS, y "Mi pedido" salga como popup desde ahí.
5. El botón **"Añadir"** pase a ser un botón de ícono con el carrito.
6. Al añadir, se muestre un **toast**: "Añadido al carrito de venta".
7. El botón flotante **"Ver Productos"** se oculte cuando el cliente ya está en la sección de productos.

## Problema

- El carrusel actual (`catalog-carousel.tsx`) monta las diapositivas **en flujo normal**: solo la
  activa lleva `opacity-100`, pero **todas ocupan altura** (`h-56`/`h-72`/`h-96`). El marco crece
  N×alto, la imagen visible salta entre posiciones y las flechas/puntos quedan anclados al fondo de
  toda la pila, no al borde de la imagen. Es el "una imagen arriba y otra debajo" que reporta el owner.
- La cabecera no tiene navegación; el botón de carrito es de texto y su badge es distinto al del POS.
- El banner es una banda que el owner ya no quiere.

## Por qué

- Una portada que se mueve sola y salta no se puede leer; el defecto estructural rompe cualquier ajuste de estilo.
- El header fijo es lo que sostiene navegación y carrito en móvil.
- Unificar carrito y badge con el POS da el mismo lenguaje en los dos lados del producto.
- El aviso de "añadido" es hoy un `<p>` pegado en el header; un toast es un evento, no un texto persistente.

## Alcance

### Autorizado (solo frontend `frontend-react/`)

- `app/catalog/components/catalog-carousel.tsx` — arreglo estructural de las diapositivas.
- `app/catalog/routes/public-catalog.tsx` — orden, header, navegación, carrito, botón añadir, toast, banner fuera.
- `app/catalog/components/catalog-see-products.tsx` — ocultar en la sección de productos.
- `app/shared/components/ui/icons.tsx` — `CartIcon` (extraído del SVG inline del POS).
- `app/sales/routes/web-catalog.tsx` — quitar el control de **banner** de la marca (el logo se queda).
- `app/shared/lib/i18n/es.ts` — claves nuevas / obsoletas.
- Tests unitarios afectados: `app/catalog/routes/__tests__/public-catalog.test.tsx`,
  `app/catalog/components/__tests__/storefront-flow.test.tsx`,
  `app/catalog/components/__tests__/storefront-checkout-staff.test.tsx`,
  `app/sales/routes/__tests__/web-catalog.test.tsx`.

### Fuera de alcance

- **Backend y BD**: no se toca. La columna `BannerKey` (`StoreCatalogSettings.cs`) y el endpoint
  `UpdateStoreCatalogBranding` **se quedan** aunque el banner no se use (decisión D10).
- **E2E**: no hay ningún spec que cubra el banner del catálogo — se verificó. No se toca ninguno.
- El POS (`shared/components/cart-shell.tsx`) no se modifica: solo se copia su SVG a `icons.tsx`.
- El flujo de pedido (checkout + WhatsApp) se mantiene tal cual (D5).
- La consulta de estado del pedido sale del header (D1); el modal que confirma el pedido recién creado
  se deja como está porque es parte del flujo de checkout.

## Decisiones del owner (2026-10-08)

| # | Decisión |
| --- | --- |
| D1 | El botón "Consultar mi pedido" del header **se va**. |
| D2 | Las secciones son **Inicio (el carrusel), Destacados y Productos**. Categorías es un filtro, no una sección. |
| D3 | **Sin banner**: se quita de la configuración y no se usa en ningún lado; **no** se quita de la BD. |
| D4 | Orden de la portada: **header → carrusel**. |
| D5 | El flujo final del pedido (checkout / WhatsApp) **se mantiene**. |
| D6 | El botón "Añadir" es **solo el ícono** del carrito de venta. |
| D7 | El badge del carrito es **exactamente como el POS**: siempre visible, mostrando "0" cuando está vacío. |
| D8 | El toast usa el sistema actual y dice: **"Añadido al carrito de venta"**. |
| D9 | El flotante "Ver Productos" es **solo visible cuando no se está en la sección de productos**. |
| D10 | El popup "Mi pedido" es el modal de carrito actual, abierto desde el ícono, **con precio como el POS**. |

## Diseño técnico

### Carrusel — el arreglo (raíz)

Hoy (roto):

```
<section class="relative …">
  <div class="transition-opacity … opacity-100">  ← en flujo, reserva altura
  <div class="transition-opacity … opacity-0">    ← en flujo, reserva altura
```

Corregido: el `<section>` mantiene `relative` y **fija la altura**; cada diapositiva pasa a
`absolute inset-0` con `transition-opacity`, de modo que las N comparten **un** marco, las flechas
(`top-1/2`) y los puntos (`bottom-2`) se anclan al borde real de la imagen, y el auto-avance es un
fundido en el mismo sitio. Se conserva: pausa en hover/focus, `prefers-reduced-motion`, `aria-hidden`
en inactivas, `aria-roledescription`, flechas y puntos.

### Header

- Fijo arriba (`sticky top-0 z-40`), `bg-surface` + `border-b border-border`. La página recibe el
  `scroll-margin-top` correspondiente en las anclas para que el header fijo no tape los títulos.
- Izquierda: logo + nombre de la tienda (se conserva la línea `CATALOG_PUBLIC.FOOTER`).
- Derecha (escritorio): enlaces de sección **Inicio · Destacados · Productos** + botón de carrito.
- Derecha (móvil): botón `☰` que despliega las 3 secciones + botón de carrito.
- El carrito y el botón de añadir siguen **gateados por `orderingEnabled`**.

### Carrito

- Botón copiado del POS: `relative rounded-lg p-2 text-text-muted hover:bg-primary-light` + SVG del
  carrito (`h-5 w-5`, `stroke`), badge `absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary
  text-xs font-bold text-white`, tope `99+`, **siempre visible**.
- El ícono abre el modal `StorefrontCart` existente. No se crea un modal nuevo.

### Toast

- Se usa `react-toastify` (el `ToastContainer` global ya está montado en `root.tsx`).
- Al añadir: `showToastSuccess` con el texto de la clave nueva. Se elimina el `<p data-testid="catalog-add-notice">`.

### Sección de productos

- `CatalogSeeProducts` recibe si la rejilla está en pantalla (`IntersectionObserver` sobre `gridRef`)
  y no se pinta cuando el cliente ya está en la sección de productos.
- Se actualiza el comentario del archivo: la decisión anterior ("un botón que huye es peor") queda
  revocada por decisión del owner (D9).

## Tareas

- [x] **T1** — `CartIcon` en `icons.tsx` (extraído del SVG del POS).
- [x] **T2** — Carrusel: diapositivas superpuestas (`absolute inset-0`) + altura fija del marco.
- [x] **T3** — `public-catalog.tsx`: orden header → carrusel; banner fuera del render.
- [x] **T4** — Header fijo con navegación (escritorio inline / móvil desplegable) y anclas.
- [x] **T5** — Carrito POS-style (ícono + badge siempre visible) y quitar el botón "Consultar mi pedido".
- [x] **T6** — Botón "Añadir" → botón de ícono (solo carrito, con `aria-label` del producto).
- [x] **T7** — Toast "Añadido al carrito de venta"; quitar el aviso estático.
- [x] **T8** — "Ver Productos" oculto cuando la sección de productos está en pantalla.
- [x] **T9** — `web-catalog.tsx`: quitar el control de banner (el logo se queda).
- [x] **T10** — i18n: claves nuevas y limpieza de las de banner.
- [x] **T11** — Actualizar los tests unitarios afectados.
- [x] **T12** — Verificación (`typecheck`, `lint`, `vitest`).

## Criterios de aceptación

1. El header queda fijo arriba con logo+nombre a la izquierda y navegación a la derecha; en móvil las
   3 secciones salen del desplegable.
2. El carrusel se ve **de a una imagen**, con flechas y puntos sobre el borde real de la imagen, y el
   marco no reserva altura por las demás diapositivas.
3. No se pinta ningún banner en la página pública, y el control de banner ya no existe en la
   configuración del dueño. La BD y el backend no cambian.
4. El carrito se ve como el del POS, con badge siempre visible (incluido "0"), y abre el modal
   "Mi pedido" con precio por línea y subtotal.
5. El botón de cada tarjeta es un ícono de carrito, y al añadir aparece el toast
   "Añadido al carrito de venta".
6. "Ver Productos" no se ve cuando el cliente ya está en la sección de productos.
7. `orderingEnabled` sigue gateando carrito y botón de añadir.
8. No se toca `frontend/` (Angular) ni ningún E2E.

## Comandos de verificación

```bash
cd frontend-react/apps/web-store-pos
pnpm typecheck
pnpm lint
pnpm exec vitest run app/catalog app/sales/routes/__tests__/web-catalog.test.tsx
```

## Riesgos

- **Tests que fijan el banner**: `public-catalog.test.tsx` (casos de banner) y `web-catalog.test.tsx`
  fallarán por diseño; se actualizan en T11 (autorizado por el owner).
- **Header fijo + anclas**: sin `scroll-margin-top` las anclas quedan tapadas por el header.
- **No inventar alcance**: quedan **fuera** el doble hover de la tarjeta y cualquier cambio de escala
  tipográfica — no fueron pedidos.

## Evidencia de verificación

| Comando | Resultado |
| --- | --- |
| `pnpm typecheck` | 0 errores |
| `pnpm lint` | 0 errores (`--max-warnings=0`) |
| `pnpm exec vitest run app/catalog app/sales/routes/__tests__/web-catalog.test.tsx` | **162 passed**, 7 archivos, 0 fallos |

Commits: `c97a33fe` (implementación) + el commit del cierre del warning `act()`.

## Progreso

- 2026-10-08 — Feature creado. Decisiones D1–D10 del owner aprobadas. Sin implementación.
- 2026-10-09 — **Implementado y verificado** (T1–T12). El único cambio fuera de lo pedido fue
  arreglar el warning `act(...)` que introdujo un test nuevo: `useStorefrontCartStore.setState`
  dentro de `act()`. Sin cambios en backend, BD ni E2E.
- **RDD nativa**: se intentó y quedó bloqueada por el transporte del plugin de OpenCode
  (`opencode_review_transport_relay_refused: output_refused`); el owner decidió no perseguirla.
  El candidato queda **sin revisar**; la entrega sigue siendo decisión de política ordinaria.
