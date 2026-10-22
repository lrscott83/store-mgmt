# Feature: catalogo-publico-contenido-estatico

Objetivo: que los productos y precios de un catálogo público sean legibles por un rastreador **sin ejecutar JavaScript**, sin romper el SPA servido hoy.
Rama: `qa` (merge de `origin/test` = `044d1bc7`).
Entrega: work-unit commits en `qa`; push/PR/merge son decisión del usuario.
Runner: `dotnet test backend/src/Application.Tests/Application.Tests.csproj --filter CatalogStaticPage`.

## Specs

- **S1** — La página generada de cada `/catalog/<slug>` incluye, además del JSON-LD `LocalBusiness` actual, un bloque JSON-LD `ItemList` con los productos **publicados** del catálogo: `name`, `image` (absoluta), `url` (canonical del catálogo), y `offers` (`price`, `priceCurrency`, `availability`) cuando el precio pueda mantenerse fresco (ver S6). Orden: el mismo que sirve `/api/v1/public/catalog/<slug>/products`. Máximo configurable (`CatalogStaticPage__ItemListSize`, default **12**, tope 60). El default NO es arbitrario: `public-catalog.tsx:29` fija `PAGE_SIZE = 12`, la primera página que el visitante ve. El JSON-LD describe exactamente esa página; el resto del catálogo queda detrás de la paginación del SPA y no se declara (no hay URL por producto).
- **S2** — **Nada se inyecta en `<body>`.** `entry.client.tsx` hace `hydrateRoot(document, <HydratedRouter/>)` y `root.tsx` renderiza `<html><body>` dentro del árbol de React: cualquier nodo extra en el body es un hydration mismatch y React lo borra al montar. El contenido estructurado va en `<head>`.
- **S3** — `title` y `site_name` se emiten **sin espacios sobrantes** a los extremos. Hoy `https://pos.playground.sceiba.net/catalog/pacas-gamez` sirve `Pacas Gamez ` (espacio final) y `og:site_name` con el mismo espacio.
- **S4** — Si `twitter:card` declara `summary_large_image`, se emite `twitter:image` con la misma URL de `og:image`; si no hay imagen, **no se emite `twitter:card` `summary_large_image`** (tarjeta rota hoy en `pacas-gamez`).
- **S5** — Cuando `og:image` no existe todavía (sin logo ni banner), se emite `og:image` con la imagen de marca por defecto `https://<host>/og-image.png` (la que ya usa la landing) antes que dejarlo ausente.
- **S6** — Los precios del `ItemList` deben regenerarse cuando cambie el producto: si la regeneración por cambio de producto no queda cubierta, el `ItemList` se emite **sin `offers`** (nombre, imagen y url solamente). Un precio obsoleto en Google es peor que ningún precio.
- **S7** — El resto del contrato de la feature `public-catalog-static-pages` no cambia: mismo shell, mismos assets hasheados, mismo `<head>` inyectado, CSP heredada del `server`, y los disparadores de regeneración existentes siguen siendo válidos.

## Tasks

| ID | Qué | S# | Ruta | Estado |
|---|---|---|---|---|
| T1 | `CatalogStaticPageBuilder`: bloque `ItemList` + escape de `<`/`>` en JSON + tests del builder | S1,S2 | inline | COMPLETADO |
| T2 | `CatalogStaticPageGenerator`: leer productos publicados (`GetPublishedPageAsync`) y mapear a `CatalogStaticPageItem` | S1 | inline | COMPLETADO |
| T3 | `title`/`site_name` con trim, `twitter:image`, fallback de `og:image` | S3,S4,S5 | inline | COMPLETADO |
| T4 | Decisión y disparador: precios SÍ; `SyncCatalogCommand` ya regenera la página, así que la frescura queda acotada al último sync del catálogo | S6 | inline | COMPLETADO (decisión del owner: "con precio") |
| T5 | Evidencia: `nginx:alpine` no aplica (no cambia el servido); sonda real pendiente de deploy | S1,S7 | inline | PENDIENTE (requiere deploy de `test`) |

## Log

- **L1 (owner, verbatim, 2026-10-22):** "si"
- **L0 (contexto, owner, verbatim):** "como puedes revisar si el generador esta escribiendo porque si accedo al catalogo desde la web si veo cosas y todos sus productos y precios"
- **Evidencia del hueco (2026-10-22):** `https://pos.playground.sceiba.net/catalog/pacas-gamez` → 200, 4.221 bytes, `<body>` de 1.040 bytes con solo el `Toastify` vacío y tres `<script>` del router. El producto real `"Mujer y hombres primavera #1 y #2"` (250.00 USD, vía `/api/v1/public/catalog/pacas-gamez/products`, 7.268 bytes) **no aparece** en el HTML. `MIXTAS` y `SIMPLES` tampoco.
- **Por qué el body no se puede tocar:** `entry.client.tsx:16` `hydrateRoot(document, ...)` + `root.tsx:75` `<body>` dentro del árbol de React. La landing sí tiene body prerenderizado porque `react-router.config.ts` la prerenderiza en build (`prerender: ['/']`); `/catalog/<slug>` no.
- **Hallazgos colaterales confirmados en producción:** `description = "Tienda de prueba"` (dato, no código), sin `og:image` en `pacas-gamez`, `twitter:card: summary_large_image` sin `twitter:image`, `LocalBusiness` sin `address`/`telephone` en tiendas sin ubicación, espacio final en `title`/`og:site_name`.
- **Decisión abierta:** JSON-LD estructurado (barato, seguro, sin tocar el servir) vs página estática real con contenido visible (requiere decidir si el catálogo deja de servirse como shell del SPA, contra S8 de `public-catalog-static-pages`).
- **L2 (owner, verbatim):** "vamos con A. SI tienes alguna duda me preguntas para que no asumas nadad de nada en esas tareas"
- **L3 (owner, verbatim):** "con precio pero por que 24 productos maximo?"
- **Corrección de una suposición mía:** el 24 salía de `NormalizePageSize` (fallback del backend), pero el catálogo pide `PAGE_SIZE = 12` (`public-catalog.tsx:29`). El default pasó a **12** con tope 60 (`MaxPageSize`).
- **L4 (owner, verbatim):** "dale"
- **Implementación (2026-10-22):** `CatalogStaticPageItem` + `Meta.Items`; `ItemListJsonLd` en el builder; el generador inyecta `IProductRepository` y usa `GetPublishedPageAsync` con `skip 0, take EffectiveItemListSize` (misma consulta y orden que el endpoint público). Trim de `title`/`site_name`, `twitter:image` y `twitter:card: summary` cuando no hay imagen, fallback `og:image` → `<base>/og-image.png`.
- **Verificación:** RED observado (4 tests nuevos fallando: `Build_emits_item_list_json_ld_with_the_effective_price`, `Build_omits_the_item_list_when_there_are_no_items`, `Build_trims_surrounding_spaces_from_title_and_site_name`, `Build_emits_twitter_image_and_falls_back_to_summary_without_image`; 11 verdes) → GREEN `--filter CatalogStaticPage` **86/86** → `Application.Tests` **1478/1478**.
- **Diferencial:** `Generate_omits_the_image_when_the_store_has_no_branding` se reemplazó por `Generate_falls_back_to_the_default_brand_image_when_the_store_has_no_branding` — el cambio de comportamiento es S5, decidido en la spec, no una regresión.
- **Pendiente real:** sonda contra `test` tras el deploy (el JSON-LD no se puede probar sin la API escribiendo la página).
- **RDD (2026-10-22, tarde):** se omitió el assessment antes de commitear (`5422560d`) — error de proceso. Corrido después: `gentle-ai review assess --cwd <repo> --agent opencode --base-ref 044d1bc7 --committed-only --json` → `risk: medium`, 6 paths / 388 líneas, `review_due: false`, `review_due_reason: under_budget`. El slice queda **pendiente**: el siguiente commit se evalúa contra el mismo `--base-ref 044d1bc7` hasta que cruce el presupuesto.
