# Feature — Completar el SEO de la landing pública (`/`)

**Objetivo:** cerrar los cuatro puntos que quedaron abiertos en la auditoría
(`docs/plans/2026-10-20-landing-seo-audit.md`): cuerpo estático en el HTML, `/` en el sitemap,
`robots.txt` sin rutas privadas y verificación del canonical de producción.
**Rama:** qa · **Delivery:** work-unit commits (push = decisión del owner).
**Runners:** `pnpm vitest run` (frontend) · `dotnet test backend/src/Application.Tests/Application.Tests.csproj` (backend).

## Specs

- **S1** — La landing `/` se sirve con su CONTENIDO en el HTML estático: `<h1>`, secciones y textos
  visibles sin ejecutar JavaScript, no solo el `<head>`. La variante usada por `/` sigue siendo
  `landing.html`; `index.html` (shell de rutas privadas y plantilla de catálogos) no cambia en un
  byte.
- **S2** — Después de la hidratación no hay mismatch: el árbol que React monta en el cliente para `/`
  coincide con el HTML servido (mismo contenido, mismo orden).
- **S3** — `sitemap.xml` incluye la landing (`<base>/`) además de los catálogos publicados.
- **S4** — `robots.txt` permite `/` y `/catalog/`, y excluye las rutas privadas de la app
  (`/login`, `/register`, `/sales`, `/admin`, `/management`, `/profile`, `/diagnostics`).
- **S5** — El canonical de producción no puede quedar apuntando al host de playground sin que el
  owner lo vea: la decisión queda documentada con evidencia del despliegue real.
- **S6** — Sin cambios en `frontend/` (Angular congelado). Ningún E2E existente se modifica: si un
  E2E se rompe con este cambio, se para y se pide autorización.

## Tasks

| ID | Qué | S# | Ruta | Estado |
|---|---|---|---|---|
| T0 | Sonda de viabilidad: ¿`prerender: ['/']` funciona con `ssr:false` en este grafo de módulos? | S1,S2 | inline | COMPLETADO |
| T1 | Cuerpo estático de la landing en `landing.html` | S1,S2 | inline | COMPLETADO |
| T2 | Test de hidratación (montar el HTML servido y exigir cero warnings de mismatch) | S2 | inline | COMPLETADO (como gate de build, no como test de navegador) |
| T3 | `/` en el sitemap | S3 | inline | COMPLETADO |
| T4 | `robots.txt` con `Disallow` de rutas privadas | S4 | inline | COMPLETADO |
| T5 | Verificación del canonical de producción + evidencia documentada | S5 | inline | COMPLETADO (evidencia de repo; el deploy real lo verifica el owner) |

## Resultado

### T0 — la premisa del informe era falsa

`react-router build` con `ssr:false` + `prerender: ['/']` **funciona** y emite DOS documentos:

- `build/client/index.html` → la landing ya renderizada (27 527 B, con `<h1>` y todo el cuerpo).
- `build/client/__spa-fallback.html` → el shell limpio (3 586 B).

El informe afirmaba que prerender convertiría la landing en el shell de todas las rutas. Es cierto solo
si se sirve el `index.html` que emite el framework; el framework ofrece el fallback aparte, así que el
conflicto se resuelve renombrando, no rediseñando.

### T1 — pipeline del build

`react-router build` → `split-prerendered-landing` → `externalize-bootstrap` (dos documentos) →
`generate-landing-page` (inyecta el head en `landing.html`, en sitio) → `verify-landing-prerender` →
`build-sw` → `verify-sw-precache` → `verify-csp`.

- `landing.html`: 27 673 B, `<h1>Tu POS offline.</h1>`, 1 `<title>`, 1 bloque JSON-LD, 0 scripts inline
  ejecutables (los 8 del prerender se externalizan: sus bytes no pueden estar en el CSP estático).
- `index.html`: 3 432 B, sin `<h1>` y sin `<title>` — el shell de las rutas privadas y la plantilla de
  catálogos queda intacto.
- `verify-sw-precache`: 224 entradas (antes 216; entran los `bootstrap-*.js`). `verify-csp`: OK.

### T2 — gate en vez de test de navegador

`scripts/landing-prerender-policy.mjs` (+ 6 tests) y `verify-landing-prerender.mjs`, cableados en el
build: falla si la landing pierde el `<h1>`, el `<title>`, el JSON-LD, si le queda un script inline o si
el shell hereda markup o metadata de la landing.

### T3/T4 — backend

`CatalogStaticPageSitemapBuilder`: el sitemap lista `<base>/` primero; `robots.txt` pasa a
`Allow: /` + `Disallow` de las 16 rutas privadas (`/login`, `/register`, `/sales`, `/admin`,
`/management`, `/inventory`, `/profile`, `/diagnostics`, …), dejando `/catalog/` y las legales fuera de
la lista.

### T5 — canonical de producción

Evidencia del repo: `docker-compose.yml:53` y `:114` pasan
`PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-https://pos.playground.sceiba.net}` — **el default es el host de
playground**, en el `.env` del build y en el `CatalogStaticPage__PublicBaseUrl` de la API. Producción
DEBE definir `PUBLIC_BASE_URL`; si no, canonical, `og:url` y la URL del sitemap apuntan a playground.

Comprobación en el servidor (una línea, no requiere acceso al código):

```bash
curl -s https://<host-produccion>/ | grep -o '<link rel="canonical"[^>]*>'
curl -s https://<host-produccion>/sitemap.xml | head -5
```

Los dos deben mostrar el host de producción y coincidir.

## Evidencia de checks

- Frontend: `pnpm lint` 0 · `pnpm typecheck` 0 · suite completa 396 archivos / 5708 passed, 6 skipped
  (un fallo ajeno de `messages.test.tsx`, `scrollTop` esperado 480 recibido 0, pasa aislado 15/15:
  mismo flake de timing bajo carga).
- Backend: `Application.Tests` 1417/1417.
- Build real (`pnpm build`): cadena completa verde, incluidos los gates nuevos.
- E2E: no se tocó ninguno; no existe E2E que afirme el contenido de sitemap/robots.

**Riesgo:** item 5 (delivery/entorno): cambia la cadena de build, el CSP efectivo de la landing y la
generación del sitemap/robots que consume el despliegue.

## Log

- **L1 (2026-10-20, owner, verbatim):** "vamos con todo eso en un ODD con revision y todo"
- **Contexto (owner, 2026-10-20):** los cuatro puntos abiertos del informe de auditoría; el owner
  aprueba explícitamente tocar backend de producción (S3/S4), cosa que la regla de alcance exige.
- **Evidencia (terreno, 2026-10-20):** `entry.client.tsx` hidrata `document` completo con
  `HydratedRouter`; `build/client/index.html` no tiene `#root` (React renderiza directo en `<body>`,
  tras la sección de Toastify); `docker-compose.yml:53` y `:114` pasan
  `PUBLIC_BASE_URL=${PUBLIC_BASE_URL:-https://pos.playground.sceiba.net}` — el default del repo es
  el host de playground.
