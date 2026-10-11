# catalogo-web-mobile-hero

## Objetivo
Ajustes de la vista PÚBLICA del catálogo (`/catalog/<slug>`) en la plantilla por defecto:
hero móvil a pantalla completa con imagen completa, utilidades del header reordenadas
(carrito donde estaba el menú, menú en la esquina derecha), destacados como carrusel de
imágenes de producto con separación antes de la rejilla, y filtro de categorías sin label.

## Alcance
- `frontend-react/apps/web-store-pos/app/catalog/templates/default-catalog.tsx`
- `frontend-react/apps/web-store-pos/app/catalog/components/catalog-carousel.tsx` (nueva variante)
- `frontend-react/apps/web-store-pos/app/catalog/components/catalog-daily.tsx` (nueva variante)
- Tests: `frontend-react/apps/web-store-pos/app/catalog/routes/__tests__/public-catalog.test.tsx`
- **NO** se toca `boutique-catalog.tsx` (queda idéntica: las variantes nacen con el comportamiento actual por defecto).
- **NO** se tocan E2E (`frontend-react/e2e/`), ni `frontend/` (Angular), ni backend.

## Diseño (Pass 1 aprobado)
Tokens existentes (`packages/web-common/styles.css`): primary #673AB7, surface #FFF,
background #F5F5F5, text #141414 (usado como escenario oscuro del hero), text-muted #8C8C8C,
border #F0F0F0. Tipografía Inter. Un solo gesto audaz: el hero móvil.

### Cambios exactos
1. **`CatalogCarousel`** — nueva prop `mobileFullBleed?: boolean` (default `false` = comportamiento actual).
   - `true`: en móvil full-bleed y alta (`h-[calc(100svh-5rem)] w-full rounded-none bg-text`),
     imagen `object-contain p-4`; desde `sm`: `sm:h-72 sm:max-w-5xl sm:rounded-lg sm:bg-surface sm:p-0 sm:object-cover`, `lg:h-96`.
   - `false`: clases actuales idénticas (`h-56 max-w-5xl rounded-lg bg-surface sm:h-72 lg:h-96`, `object-cover`).
2. **`default-catalog.tsx`**
   - Header móvil: mover el botón del carrito ANTES de `CatalogNavMenu` (orden móvil carrito → menú; el menú queda en la esquina).
   - Wrapper del hero: `px-4 pt-4` → `sm:px-4 sm:pt-4`; pasar `mobileFullBleed` al carrusel.
   - Destacados: `CatalogDaily` con `variant="productCarousel"`; wrapper con `mb-10 sm:mb-12` para el aire antes de productos.
   - Filtro: label de "Categoría" → `sr-only` (sigue asociado por `htmlFor`/`id`); el select no cambia de `data-testid`.
3. **`CatalogDaily`** — nueva prop `variant?: 'cards' | 'productCarousel'` (default `'cards'` = actual).
   - `'productCarousel'`: track `flex snap-x gap-3 overflow-x-auto pb-1 no-scrollbar`; fichas `w-1/2 sm:w-1/3 lg:w-1/4`; imagen `aspect-square w-full bg-background object-contain` (completa); flechas `sm:flex` que hacen `scrollBy` de una ficha. Se conservan `data-testid` `catalog-daily`, `catalog-daily-image-N`, `catalog-daily-caption-N` y el título.

## Tareas
- [x] T1. Variante `mobileFullBleed` en `catalog-carousel.tsx`.
- [x] T2. Variante `productCarousel` en `catalog-daily.tsx`.
- [x] T3. `default-catalog.tsx`: header, hero, destacados+gap, label del filtro.
- [x] T4. Actualizar `public-catalog.test.tsx` (clases del carrusel) y añadir tests de lo nuevo.
- [x] T5. Correr tests del catálogo + suite completa; verificar que boutique sigue igual.

## Criterios de aceptación
- Móvil: el hero cubre la primera pantalla y la imagen sale completa (`object-contain`).
- Header móvil: carrito antes del menú; menú en la esquina derecha.
- Destacados en carrusel, imagen de producto completa, tarjeta ≈½ viewport en móvil, y aire antes de la rejilla.
- El filtro de categorías no muestra el label "Categoría".
- `boutique` sin cambios visuales; E2E intactos.
- Tests verdes.

## Evidencia / bitácora
- Implementado en 3 componentes + 1 test. Ruta: delegated direct (escritor acotado). `boutique` intacta: las variantes nacen con el default igual al comportamiento previo.
- RED→GREEN: 6 tests fallando antes de la implementación; `app/catalog` → **9 archivos / 183 tests** verdes; `boutique-catalog.test.tsx` → **14/14**; eslint limpio en los archivos tocados.
- Suite completa: **372 archivos / 5512 verdes, 1 fallo** — el fallo es `channel-rates.test.tsx`, ajeno al cambio (pasa 74/74 en aislamiento). Flakiness por interferencia de suite, no del catálogo.
- **Review RDD** (lineage `review-e6dade944c2521c1`): riesgo medio, lens `review-reliability` → **approved** + acknowledged (authority burned). 3 hallazgos informativos, ninguno abre corrección:
  - R3-001 (WARNING): el `scrollByCard` de las flechas de destacados no está probado (jsdom da rects de ancho 0); solo se asserta que las flechas existen y su aria-label.
  - R3-002 (SUGGESTION): el borde `images.length > 1` (flechas ocultas con una sola foto) no se prueba.
  - R3-003 (SUGGESTION): ningún test fija el camino default (boutique) pese a que el doc afirma que queda igual.
- (Nota de proceso) El primer intento del reviewer devolvió `provider_failed`; STATUS reofreció el mismo slot y el relanzamiento aprobó.

## Autocrítica (Pass 2 — checklist de restraint del skill)
- **Un solo gesto audaz:** el hero móvil full-screen con escenario oscuro. Destacados, header y filtro se quedan quietos. ✓
- **Sin tells genéricos:** sin copia desenfocada detrás del hero, sin máscaras de degradado en los carruseles, sin eyebrows nuevos; donde el brief pedía restar (label de categorías) se restó. ✓
- **Responsive de verdad:** móvil-first; `sm+` recupera el hero enmarcado de siempre. ✓
- **Movimiento reducido:** el carrusel no autoavanza y las flechas usan scroll `auto` con `prefers-reduced-motion`. ✓
- **Accesibilidad:** el `label` de categorías queda `sr-only` (el control conserva su nombre accesible). ✓
- **Lo que quitaría (Chanel):** nada nuevo; ya se quitó el rótulo visible del filtro.
- **Deuda honesta:** `calc(100svh - 5rem)` asume un header de ~80 px; con el aviso de tienda cerrada el header crece y el hero puede desbordar unos px. Aceptable; si molesta, medir el header con un ref.
- Pendiente: decisión del usuario sobre commit/entrega.
