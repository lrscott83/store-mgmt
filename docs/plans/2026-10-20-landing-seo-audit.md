# Auditoría SEO — landing pública del POS (`/`)

**Fecha:** 2026-10-20
**Alcance:** `frontend-react/apps/web-store-pos` (React). Angular (`frontend/`) no se inspecciona: legacy congelado.
**Pregunta:** ¿la optimización SEO actual de la landing es la más idónea para el objetivo declarado?
**Objetivo declarado (owner):** "la idea no es indexar el POS en sí, es tener datos para que se pueda describir el POS desde búsquedas en Google".
**Veredicto:** la infraestructura de metadata está bien construida, pero está incompleta para el objetivo. Se resolvió el *preview* de redes sociales, no la *descripción* del producto por buscadores.

---

## 1. Qué existe hoy (verificado en código)

| Pieza | Dónde | Estado |
|---|---|---|
| Shell SPA (`ssr:false`) | `apps/web-store-pos/react-router.config.ts:8` | Sin `<title>` ni contenido en `<body>` |
| Variante con metadata | `scripts/generate-landing-page.mjs` | Inyecta `<title>`, description, canonical, OG, `twitter:card` |
| Servido solo en `/` | `frontend-react/deploy/nginx.conf:116-120` | `location = /` → `landing.html`, fallback `index.html` |
| Service worker | `app/shared/lib/pwa/sw-strategy.ts` | Sirve `/landing.html` en navegaciones a `/` |
| Contenido de la landing | `app/home/routes/landing-deep.tsx` | Renderizado 100% en cliente |

El patrón es correcto: `landing.html` no contamina el shell de las rutas privadas ni la plantilla de los
catálogos pre-generados (el backend solo elimina `title`/`description` del shell; un `og:*` ahí se
duplicaría en cada catálogo).

---

## 2. Hallazgos, por impacto

### H1 (alto) — El `<body>` del HTML servido no tiene contenido

`landing.html` es el shell con el `<head>` inyectado. El `<body>` sigue siendo
`<div id="root"></div>` + runtime (`build/client/index.html`, 3.4 KB). No hay `<h1>`, ni features, ni
precios.

- Google **sí** ejecuta JavaScript, pero en cola de render diferida.
- Los crawlers de IA (**GPTBot, ClaudeBot, PerplexityBot, Bing/Copilot sin render**) y los previews de
  redes **no** ejecutan JS: hoy no tienen nada que describir.
- Los precios de `PlanPricingSection` vienen de `fetchPublicPlanPricing` (fetch en cliente): tampoco
  están en el HTML.

**Es el límite estructural del enfoque "head-only".** Resolverlo de verdad requiere cuerpo estático
(prerender real o inyección de un bloque semántico equivalente), no más metas.

### H2 (alto) — No hay datos estructurados (JSON-LD)

No existe ningún `application/ld+json` en el repositorio. Es el mecanismo más directo para "datos que
describan el POS" y el que consumen agregadores, rich results e IAs.

### H3 (alto) — El `<h1>` no aporta señal temática

`landing-deep.tsx:690-694`:

```
Vende más.
Controla todo.
```

No contiene "POS", "punto de venta", "software de ventas" ni "inventario". El `<h1>` es uno de los
mayores signals on-page y hoy está dedicado a un eslogan. La línea que sí describe el producto
("POS offline + catálogo web con pedidos por WhatsApp") es un `<p>` (`landing-deep.tsx:686-689`).

### H4 (medio) — Open Graph incompleto para compartir

`generate-landing-page.mjs:73-87`:

- `og:image` = `/icons/icon-512x512.png` (512×512 cuadrado, no 1200×630) → WhatsApp/Facebook lo
  muestran pequeño y recortado.
- `twitter:card` = `summary` (no `summary_large_image`).
- Faltan `og:image:width`, `og:image:height`, `og:image:alt`, `twitter:title`, `twitter:description`,
  `twitter:image`.

### H5 (medio) — Descubrimiento y canibalización

- El sitemap en curso (`backend/.../CatalogStaticPageSitemapBuilder.cs:19-37`) itera **solo**
  `publishedSlugs`: `/` quedaría fuera del sitemap.
- `BuildRobots` emite `Allow: /` sin exclusiones: `/login`, `/register`, `/sales/*`, `/admin/*` y
  cualquier URL inventada quedan indexables (el fallback SPA responde 200 → soft 404s).

### H6 (medio, riesgo operativo) — El canonical por defecto apunta a staging

`frontend-react/Dockerfile:24` → `ARG PUBLIC_BASE_URL=https://pos.playground.sceiba.net`. Si el build de
producción no sobreescribe el ARG, `canonical`, `og:url` y `og:image` apuntan al entorno de pruebas.
Hay que verificarlo en el despliegue real, no en el repo.

### H7 (bajo) — Longitudes

- `title`: 62 caracteres (borde de truncado en SERP, ~60).
- `description`: 145 caracteres (correcto).

---

## 3. Decisiones tomadas en esta iteración

1. **Se implementan H2, H3 y H4** (lo pedido: puntos 1-3 del informe).
2. **`offers` en JSON-LD: implementado en runtime, no en el build.** Los precios reales viven en la API
   (`/v1/public/plans`) y cambian sin deploy. Congelarlos en el build los desactualiza en silencio y
   hace que el build dependa de la red. En su lugar, el JSON-LD estático (Organization +
   SoftwareApplication) se completa con `offers` cuando la landing recibe los mismos precios que ya
   pinta en la sección "Precios": una sola fuente, sin drift.
   **Límite conocido:** los `offers` aparecen tras ejecutar JS, igual que los precios visibles. Google
   los lee (renderiza y parsea el DOM renderizado); un crawler sin JS no los ve. Es el mismo techo que
   el punto P1 (cuerpo estático); si algún día se resuelve P1 de raíz, `offers` debería generarse del
   lado servidor.
3. **El `<h1>` conserva el eslogan como segunda línea**, para no destruir la jerarquía visual: la
   primera línea pasa a llevar la keyword. El eyebrow (`<p>`) gana "punto de venta" (término de
   búsqueda real en español) sin repetir literalmente el `<h1>`.
4. **La imagen OG se genera una vez y se versiona** en `public/og-image.png` (1200×630). No se
   rasteriza en cada build: añadiría una dependencia binaria al pipeline por un asset que cambia con
   el diseño, no con el código.

---

## 4. Cambios de esta iteración

| # | Cambio | Archivo |
|---|---|---|
| 1 | JSON-LD `@graph`: `Organization` + `SoftwareApplication` | `scripts/generate-landing-page.mjs` |
| 2 | `<h1>` con keyword + eyebrow "Punto de venta" | `app/home/routes/landing-deep.tsx` |
| 3 | OG 1200×630 + dimensiones + alt + `summary_large_image` + twitter completo | `scripts/generate-landing-page.mjs`, `public/og-image.png` |
| 4 | Tests de los tres puntos | `scripts/generate-landing-page.test.mjs`, `app/home/routes/__tests__/landing-deep.test.tsx` |
| 5 | `offers` con precios vivos en el JSON-LD | `app/home/lib/landing-json-ld.ts`, `app/home/components/plan-pricing-section.tsx` |

### Detalle de la implementación

- **JSON-LD** (`buildLandingJsonLd`): `Organization` (`name`, `url`, `logo`) y `SoftwareApplication`
  (`name`, `description`, `applicationCategory: BusinessApplication`, `operatingSystem: Web`,
  `inLanguage: es`, `url`, `publisher`). El payload escapa `<` como `\u003c` para que una descripción
  hostil no cierre el `<script>` antes de tiempo. Se elimina cualquier `ld+json` previo del shell
  antes de inyectar (idempotente).
- **H1**: `Tu POS offline.` (con "offline." en el color de acento). El eslogan `Vende más. Controla
  todo.` baja a `<p>` con el mismo peso visual, justo debajo. El eyebrow pasa de
  "POS offline + catálogo web…" a "Punto de venta + catálogo web…" para no repetir el H1 y cubrir el
  término de búsqueda real en español.
- **Imagen OG**: `public/og-image.png`, 1200×630, generada una vez con System.Drawing (logo, marca,
  H1 y propuesta de valor). No participa del build ni del precache del service worker
  (`precache-patterns.mjs` solo incluye `icons/*.png`, `images/**/*.png`, `favicon.png` y
  `**/*.{js,css,html,woff2,webmanifest}`), así que no añade peso a la instalación de la PWA.

### Evidencia

- RED: 5 tests fallando antes de implementar (`summary_large_image`, dimensiones OG, JSON-LD, H1).
- GREEN: `pnpm vitest run scripts/generate-landing-page.test.mjs app/home/routes/__tests__/landing-deep.test.tsx`
  → 27/27.
- `pnpm lint` → exit 0. `pnpm typecheck` → exit 0.
- Suite completa del app: 393 archivos, 5685 passed, 6 skipped.
- `node scripts/generate-landing-page.mjs` sobre el `build/client` existente → `landing.html` con el
  bloque `<head>` completo (canonical, OG 1200×630, twitter `summary_large_image`, JSON-LD).
- Ningún E2E de `frontend-react/e2e` referencia el texto del hero: no se toca la suite E2E.

**Riesgo:** ninguno de la lista de alto riesgo (sin datos, seguridad, contratos de API, concurrencia
ni configuración de despliegue). Cambio de contenido público + metadata de build, con tests.

### Iteración 2 — `offers`

- `app/home/lib/landing-json-ld.ts`: `buildPlanOffers()` (orden por `order`, `price` como string de 2
  decimales, descarta precios no numéricos o negativos) y `applyPlanOffersToDocument()`, que fusiona
  `offers` en el nodo `SoftwareApplication` del JSON-LD existente. No crea el script si no existe (dev
  server), es idempotente y devuelve `false` sin tocar el DOM ante JSON inválido o grafo sin
  `SoftwareApplication`.
- `PlanPricingSection`: al resolver `fetchPublicPlanPricing` aplica los `offers`. Si el endpoint cae
  no se publica nada y la landing sigue igual.
- Tests: 7 casos de la librería + 1 de integración en la sección de precios (RED observado antes de
  cablear).
- Evidencia: enfocados 33/33; `pnpm lint` 0; `pnpm typecheck` 0; suite completa 394 archivos / 5693
  passed, 6 skipped. Un test ajeno (`channel-rates`, timeout de 5 s bajo carga) falló en la corrida
  completa y pasa aislado 24/24: flake de tiempo, no relacionado con este cambio.

### Iteración 3 — hallazgos advisory del RDD

La review nativa aprobó la slice (`review-580989d6afd87df5`, autoridad quemada) con 8 hallazgos
advisory no bloqueantes. Se cierran los dos `WARNING`:

- **Acoplamiento por literales de schema** → `scripts/landing-schema.mjs` (+ `landing-schema.d.mts`
  para el lado TypeScript) es la única fuente de `https://schema.org`, `Organization`,
  `SoftwareApplication` y `Offer`. El build que escribe el grafo y el runtime que lo completa leen
  las mismas constantes: renombrar un tipo ya no puede degradar a "sin offers" en silencio.
- **Dimensiones del OG sin verificar** → test que lee el IHDR real de `public/og-image.png` y exige
  que ancho y alto coincidan con `LANDING_META.ogImageWidth/Height` (1200×630). Un PNG corrupto o de
  otro tamaño ahora rompe CI.

Sugerencias restantes (no bloqueantes, sin acción): catch inalcanzable en `JSON.stringify`, parámetro
`priceCurrency` sin uso, booleano de retorno descartado, `document` global sin guard, re-escapado del
`<` al re-serializar y falta de test de doble inyección.

- Evidencia: enfocados 27/27; `node scripts/generate-landing-page.mjs` OK; `pnpm lint` 0;
  `pnpm typecheck` 0; suite completa 394 archivos / 5694 passed, 6 skipped. Un test ajeno
  (`store-plan`, timeout bajo carga) falló en la corrida completa y pasa aislado 12/12: mismo
  patrón de flake ambiental que `channel-rates` en la iteración anterior.

---

## 5. Pendiente (no incluido aquí)

| # | Tema | Nota |
|---|---|---|
| P1 | Cuerpo estático en el HTML | prerender real o bloque semántico inyectado. Es el cambio caro y el único que resuelve H1 de raíz |
| P2 | JSON-LD `offers` generados del lado servidor | hoy se inyectan en runtime desde `/v1/public/plans`; solo los ve un crawler que ejecute JS (Google sí) |
| P3 | `sitemap.xml` con `/` incluido | el builder actual solo lista catálogos |
| P4 | `robots.txt` con `Disallow` de rutas privadas | o `X-Robots-Tag: noindex` en el fallback SPA |
| P5 | Verificar `PUBLIC_BASE_URL` en el build de producción | riesgo de canonical a staging |
| P6 | Title a ≤ 60 caracteres | opcional |
