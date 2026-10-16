# Feature — Páginas estáticas indexables por catálogo público

**Objetivo:** que cada catálogo público (`/catalog/<slug>`) se sirva con HTML que ya contenga título,
descripción, canonical, Open Graph y (después) JSON-LD — para que Google **y** las redes/WhatsApp
(que no ejecutan JS) lo vean — **sin tocar el SPA del POS**.
**Rama:** main (main despliega a `pos.playground.sceiba.net`) · **Delivery:** work-unit commits, deploy manual del owner.

## Specs

- **S1** — Cada `/catalog/<slug>` se sirve con HTML que YA contiene (sin ejecutar JS): `<title>`,
  `<meta name="description">`, `<link rel="canonical">`, Open Graph (`og:type`, `og:title`,
  `og:description`, `og:url`, `og:image`, `og:site_name`, `og:locale`) y `twitter:card`. El resto de
  la página sigue siendo el SPA actual (misma experiencia; el catálogo interactivo no cambia).
- **S2** — Los datos salen de la configuración de tienda/catálogo guardada en la BD. La página se
  **regenera** cuando esos datos cambian.
- **S3** — Para los catálogos **ya existentes** se generan una vez (**backfill**) y se regeneran en
  cada deploy. La regeneración es automática; el owner no edita páginas a mano.
- **S4** — nginx sirve la página pre-generada si existe; si no, cae al SPA como hoy (nada se rompe).
- **S5** — `sitemap.xml` generado con todos los slugs publicados + `robots.txt` que lo referencia
  (arranque de indexación; ya con Search Console verificado).
- **S6** (fase posterior) — Campos de ubicación por tienda (dirección estructurada, teléfono,
  coordenadas, horario) + JSON-LD `schema.org` para la ficha de Google Maps/Search.
- **S7** — El POS no se toca: las rutas autenticadas y su SPA quedan idénticas.
- **S8** — **Todo el catálogo web sigue funcionando igual**: la página servida es el **MISMO shell del
  SPA** (mismos assets hasheados, mismo bootstrap) con metadatos añadidos en `<head>`. El navegador
  carga la misma app, así que carrito, checkout, pedidos por WhatsApp, estado del pedido, catálogo,
  marca, escaparate y **gestión de pedidos** (módulos 18 WebCatalog, 19 PedidosWhatsApp y 20
  GestionPedidos) no cambian. La API pública (`/api/v1/public/catalog/**`, `/public/ordering/**`) y
  las rutas del POS (`sales/web-catalog`, `sales/online-orders*`, `sales/orders`, `sales/today-orders`)
  **no se tocan**.
- **S9** — **La página generada debe regenerarse en CADA deploy del frontend.** Copia el shell del
  build, y ese shell referencia assets con hash que cambian en cada build; una página no regenerada
  apuntaría a assets inexistentes y rompería el catálogo. Por eso T6 (regeneración en deploy) es
  REQUISITO DE CORRECCIÓN, no solo frescura, y el deploy debe dejar la ventana sin páginas válidas lo
  más corta posible.
- **S10** — nginx sirve la página pre-generada **solo** para la ruta exacta del catálogo
  (`/catalog/<slug>`); cualquier otra ruta (assets, `/api`, `/hubs`, el resto del SPA) sigue como hoy.

## Tasks

| ID | Qué | S# | Ruta | Estado |
|---|---|---|---|---|
| T1 | Builder puro: inyecta meta en el HTML shell (title, description, canonical, OG, twitter) + tests | S1 | inline | COMPLETADO (`dc03913e`) |
| T2 | Servicio de escritura: lee el shell de un directorio configurable y escribe `/catalog/<slug>/index.html` | S1,S2 | inline | COMPLETADO (`0cda93ac`) |
| T3 | Servicio de generación: carga tienda + marca del catálogo de la BD → meta → writer | S1,S2 | inline | COMPLETADO (`bdff2f10`) |
| T4 | Disparador: regenerar al guardar la config/estado del catálogo público | S2 | — | PENDIENTE |
| T5 | Servido: nginx (alias + fallback, **solo la ruta exacta** — S10) + directorio compartido + publicar el shell del SPA en él | S1,S4,S10 | — | PENDIENTE |
| T6 | Backfill de catálogos existentes + **regeneración en cada deploy (obligatoria — S9)** | S3,S9 | — | PENDIENTE |
| T7 | `sitemap.xml` + `robots.txt` | S5 | — | PENDIENTE |
| T8 | Campos de ubicación por tienda + JSON-LD | S6 | — | PENDIENTE |

## Log

- **L1 (2026-10-16, owner, verbatim):** "necesito que desde aqui desde Cuba poder poner en google map
  un negocio de restaurante que tendria en catalago publico ... Lo que estoy buscando es visibilidad
  en Internet." → investigación en `docs/google/2026-10-16-visibilidad-google-maps-cuba.md`.
- **L2 (owner, verbatim):** "el POS no se puede cambiar eso es solo para los catalogos publicos que
  estan en la ruta /catalog. Si es preciso podemos hacer por cada catalogo una pagina usando la misma
  que tenemos en default para que se pueda indexar mejor todo ... Los datos los proporciona el
  cliente y se guardaran en la BD, pero deben estar estaticos en la pagina mejor?"
- **L3 (owner, verbatim):** "dale entonces. Pero entonces en el VPS como hago esto para los catalogos
  que estan? Seria como actualizar los campos de configuracion del catalogo?"
- **Evidencia (código):** `react-router.config.ts` → `ssr: false` (SPA estático deliberado); sin
  `<title>` ni `meta` en el shell; el POS depende de estado en `localStorage` (por eso no se activa
  SSR). `/catalog/:storeSlug` → `app/catalog/routes/public-catalog.tsx`; datos por
  `catalogHttpService` desde el cliente. nginx: `try_files $uri /index.html`.
- **L4 (progreso):** T1 completado (`b4967ea7`) — builder puro `CatalogStaticPageBuilder` +
  6 tests. Suites: Application.Tests 1291/1291, Domain.UnitTests 165/165. Nota: se trabaja en `main`
  (rama que despliega el owner); `main` va por detrás de `test`.
- **L5 (owner, verbatim):** "dale y eso tiene que actualizar en la BD el template del catalogo que se
  genero." → T2 completado. Sobre la BD: **descartado** por el owner (2026-10-16: "olvida lo de la
  BD") — no se añade registro de generación; el template ya vive en `StoreCatalogSettings.TemplateId`.
- **L6 (corrección de rama + progreso):** el owner ordenó que la feature viva en **test** (main solo
  la verificación de Google). Cherry-pick a `test`: T1 `dc03913e`, T2 `0cda93ac` (los SHAs de los
  commits originales en main quedaron obsoletos tras el reset). **T3 completado (`bdff2f10`)**:
  `CatalogStaticPageGenerator` arma la página desde tienda + marca (logo/banner) con canonical y
  media absolutos. Suites: Application.Tests 1335/1335, Domain.UnitTests 165/165.
- **L7 (owner, verbatim):** "los pedidos por whatsapp y la gestion de pedidos todo eso se mantiene
  funcionando no? porque todo debe seguir funcionando. revisa bien todos los features del catalago web
  con los tres modulos que tenemos que todo debe seguir funcionando" → **Sí, verificado**: la página
  generada es el mismo shell del SPA + meta (mismos assets y bootstrap), la API pública y las rutas del
  POS no se tocan, y los tres módulos (18/19/20) siguen igual (S8). Hallazgo que se añade al plan:
  **S9** (regenerar en cada deploy es requisito de corrección por los assets hasheados) y **S10**
  (nginx sirve la página solo para la ruta exacta del catálogo). Evidencia: `app/routes.ts`
  (`catalog/:storeSlug`; detalle de producto y estado del pedido son modales, no rutas), rutas del POS
  `sales/web-catalog`, `sales/online-orders`, `.../settings`, `.../drivers`, `.../sales`,
  `sales/today-orders`, `sales/orders`; endpoints `PublicCatalogController` y `PublicOrderingController`.
