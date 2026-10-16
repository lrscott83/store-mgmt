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

## Tasks

| ID | Qué | S# | Ruta | Estado |
|---|---|---|---|---|
| T1 | Builder puro: inyecta meta en el HTML shell (title, description, canonical, OG, twitter) + tests | S1 | inline | COMPLETADO (`b4967ea7`) |
| T2 | Servicio de escritura: lee el shell de un directorio configurable y escribe `/catalog/<slug>/index.html` | S1,S2 | — | PENDIENTE |
| T3 | Disparador: regenerar al guardar la config/estado del catálogo público | S2 | — | PENDIENTE |
| T4 | Servido: nginx (alias + fallback) + directorio compartido + publicar el shell del SPA en él | S1,S4 | — | PENDIENTE |
| T5 | Backfill de catálogos existentes + regeneración en cada deploy | S3 | — | PENDIENTE |
| T6 | `sitemap.xml` + `robots.txt` | S5 | — | PENDIENTE |
| T7 | Campos de ubicación por tienda + JSON-LD | S6 | — | PENDIENTE |

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
