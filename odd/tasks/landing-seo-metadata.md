# Feature — Metadata SEO de la landing pública (`/`)

**Objetivo:** que la landing (`/`) se sirva con HTML que YA contenga título, descripción, canonical y
Open Graph — para que Google **y** las redes/WhatsApp (que no ejecutan JS) la vean — **sin tocar el
shell del SPA** que usan las rutas privadas y la pre-generación de catálogos.
**Rama:** dev · **Delivery:** work-unit commits (push = decisión del owner).
**Runner:** `pnpm vitest run` (frontend-react/apps/web-store-pos).

## Specs

- **S1** — La landing `/` se sirve con metadata en el HTML estático (sin ejecutar JS): `<title>`,
  `<meta name="description">`, `<link rel="canonical">`, Open Graph (`og:type`, `og:title`,
  `og:description`, `og:url`, `og:image`, `og:site_name`, `og:locale`) y `twitter:card`. El origen
  absoluto sale de `PUBLIC_BASE_URL` (default `https://pos.playground.sceiba.net`), el mismo valor que
  la API usa para los catálogos (`CatalogStaticPage__PublicBaseUrl`).
- **S2** — El shell `index.html` NO lleva metadata de la landing: es el fallback de rutas privadas Y
  la plantilla de la pre-generación de catálogos (`CatalogStaticPageBuilder` solo quita
  title/description, así que un `og:*` en el shell se duplicaría en cada catálogo).
- **S3** — nginx sirve la variante de landing SOLO en la ruta exacta `/`; cualquier otra ruta sirve el
  shell limpio. Sin `landing.html`, cae a `index.html` (nada se rompe).
- **S4** — El service worker, tras tomar control, sirve `landing.html` en navegaciones a `/` (la
  segunda visita no pierde la metadata) y `index.html` en el resto. `landing.html` entra al precache.
- **S5** — Sin cambios en `frontend/` (Angular congelado) ni en las suites E2E (unit tests sí se
  extendieron).

## Tasks

| ID | Qué | S# | Ruta | Estado |
|---|---|---|---|---|
| T1 | Script `generate-landing-page.mjs` (inyecta head en una copia del shell, reemplaza title/description previos, escapa, valida base URL) + 7 tests | S1 | inline | COMPLETADO |
| T2 | Cableado del build: `generate-landing-page` antes de `build-sw` (para que entre al precache) | S1,S4 | inline | COMPLETADO |
| T3 | `shellUrlFor` en `sw-strategy.ts` + service worker sirviendo la landing en `/` + 3 tests | S4 | inline | COMPLETADO |
| T4 | nginx `location = /` (sirve `landing.html` solo en `/`, `expires -1`) | S3 | inline | COMPLETADO |
| T5 | `PUBLIC_BASE_URL` como build arg (Dockerfile, docker-compose, turbo `globalEnv`) | S1 | inline | COMPLETADO |

## Log

- **L1 (2026-10-19, owner, verbatim):** "dale con la metadata del lanidng page" [sic].
- **L0 (contexto, owner, verbatim, sesión previa):** "la idea no es indexar el POS en si, es tener
  datos para que se pueda describir el POS desde busquedas en Google".
- **Decisión (por qué NO se pre-renderiza la ruta con React Router):** con `ssr:false` React Router
  renderiza solo la raíz en `index.html`; un `prerender: ['/']` convertiría la landing en el shell de
  TODAS las rutas (flash de landing en el POS) y exigiría que la ruta renderice en Node (la landing
  depende de `localStorage`/stores). Se usa el mismo patrón que los catálogos: variante del shell con
  head inyectado, servida en la ruta exacta.
- **Evidencia (código):** `react-router.config.ts` → `ssr: false`; `build/client/index.html` sin
  `<title>`/`description`; `CatalogStaticPageWriter` lee `<volumen compartido>/shell/index.html` como
  plantilla; `service-worker.ts` servía `/index.html` fijo para toda navegación (`SHELL_URL`).
- **Evidencia (checks, 2026-10-19):** tests enfocados 22/22 (`sw-strategy` + `generate-landing-page`);
  `pnpm lint` exit 0; build real (`API_URL=/api` — el `.env` local trae la URL de dev y `verify-csp`
  falla por diseño; pre-existente) → `landing.html` generado; `verify-sw-precache` 216 entradas
  (antes 215: ya incluye `/landing.html`); `verify-csp` OK; artefactos: `index.html` sin
  title/description/og, cuerpo byte-idéntico, SW referencia `/landing.html`; nginx real (docker
  29.1.2, conf del repo + `build/client`): `/` → título OK, `/sales/new` y `/catalog/abc` → shell
  limpio; suite completa 393 archivos / 5673 passed, 6 skipped.
- **Pendiente:** verificación independiente NO disponible — el agente `gentle-ai-verify` está
  configurado con un modelo inexistente (`opencode/space-bunny-free`). Se registra como no
  disponible; no se sustituye por un PASS.
- **Riesgo:** item 5 (deploy: nginx, Dockerfile, docker-compose, pipeline de build).
- **Cierre:** work unit `b338aaeb` (11 archivos, +386/−5) — T1–T5 completadas; este documento viaja en ese commit.
- **Siguiente (fuera de esta rama):** `robots.txt` + `sitemap.xml` (T7 de `public-catalog-static-pages`) — **ya en curso en otra rama/sesión** (estado 2026-10-19, owner); no retomar desde `dev`.
