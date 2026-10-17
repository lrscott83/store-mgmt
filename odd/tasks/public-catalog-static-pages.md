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
| T4 | Disparador: regenerar al guardar la config/estado del catálogo público (sync + marca) | S2 | inline | COMPLETADO (`21a6c935`) |
| T5 | Servido: nginx (alias + fallback, **solo la ruta exacta** — S10) + directorio compartido + publicar el shell del SPA en él + **conservar assets del build anterior** (mitigación S9) | S1,S4,S9,S10 | inline (infra) | COMPLETADO (`14131b21` + `ec8c114c`) |
| T6 | Backfill de catálogos existentes + **regeneración en cada deploy (obligatoria — S9)** | S3,S9 | inline | COMPLETADO (`6b4c4bc8`) |
| T7 | `sitemap.xml` + `robots.txt` | S5 | — | PENDIENTE |
| T8 | Campos de ubicación por tienda + JSON-LD | S6 | — | PENDIENTE |
| T9 | Disparador por renombre de tienda (`UpdateStoreCommand`: nombre/descripción → title/description) | S2 | — | PENDIENTE |

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
  funcionando no? ... revisa bien todos los features del catalago web con los tres modulos ..." →
  **Sí, verificado**: la página generada es el mismo shell del SPA + meta, la API pública y las rutas
  del POS no se tocan, y los tres módulos (18/19/20) siguen igual (S8). Hallazgos: **S9** (regenerar en
  cada deploy es requisito de corrección por los assets hasheados) y **S10** (nginx sirve la página
  solo para la ruta exacta del catálogo). Evidencia: `app/routes.ts`, `PublicCatalogController`,
  `PublicOrderingController`.
- **L8 (owner, verbatim):** "pero no es mejor hacer una pagina normal y se le pone a la tienda en el
  catalogo id y ya?" → explicado el compromiso (una página plana para todos rompería carrito/pedidos);
  el owner eligió **opción 1** (copia del SPA + meta), más la mitigación de **conservar los assets del
  build anterior** (anotada en T5) para eliminar el riesgo de S9.
- **L9 (owner, verbatim):** "y como se sabe que ese catalogo es de la tienda correspondiente? o todos
  los cambios son en el template default?" → **por el slug**: `CatalogSlug` es **único global**
  (índice parcial único, `StoreEntityTypeConfiguration.cs:29-31`), el SPA lo lee de la URL
  (`public-catalog.tsx:50`) y el backend resuelve la tienda con `GetStoreByCatalogSlugAsync`. Cada
  página vive en `catalog/<slug>/`. El template NO es compartido: es por tienda
  (`StoreCatalogSettings.TemplateId`), "default" es solo el respaldo, y la página generada es
  **independiente del template** (solo inyecta meta; el SPA aplica la vista al cargar). Los templates
  son vistas sin lógica propia (`templates/registry.ts`, `template-ids.ts`), así que **T4 resuelve
  igual con cualquier template presente o futuro**.
- **L10 (progreso):** **T4 completado (`21a6c935`)** — `CatalogStaticPageRegenerator` best-effort +
  wiring en `SyncCatalogCommandHandler` y `UpdateStoreCatalogBrandingCommandHandler` + registro en DI
  y binding de `CatalogStaticPageOptions`. Nueva tarea **T9** (renombre de tienda) anotada. Suites:
  Application.Tests 1338/1338, Domain.UnitTests 165/165.
- **L11 (progreso + verificación):** **T5 completado** (`14131b21` infra + `ec8c114c` apagado/roto).
  Volumen compartido `catalog_pages` montado en `/srv/catalog-pages` por la API y por nginx; el
  entrypoint del frontend publica el shell del build en `<volumen>/shell/index.html` y **archiva los
  assets de builds anteriores** (sin sobrescribir, sin borrar); nginx sirve la página generada **solo**
  para la ruta exacta `/catalog/<slug>`, cae al SPA en todo lo demás y rescata del archivo el asset
  cuyo hash ya no está en el build actual (S9). Config por entorno: `CatalogStaticPage__ShellPath`,
  `__OutputRoot`, `__PublicBaseUrl` (default `https://pos.playground.sceiba.net`).
  **Verificado con nginx real** — contenedor `nginx:alpine`, el `nginx.conf` del repo, no una copia:
  **22/22 aserciones**. Página generada en la ruta exacta; SPA en slug inexistente, sub-ruta y slug
  con mayúsculas (**S10**); CSP y `Cache-Control: no-cache` heredados en la generada; `/` y
  `/sales/new` intactos (**S7/S8**); asset del build actual igual que antes; asset de un build anterior
  servido desde el archivo; asset inexistente **404 y nunca HTML**; y el entrypoint publica el shell,
  lo refresca en un build nuevo, archiva el asset nuevo, conserva el anterior y no sobrescribe lo ya
  archivado — **con nginx arriba en los cuatro escenarios**.
  Hallazgo de la verificación: si el script llega *sourceado* (archivo sin permiso de ejecución) un
  `exit` dentro de él mataba el arranque de nginx → quedó sin `exit` ni `set -e`/`set -u`.
  Pendiente en el VPS: subir `PUBLIC_BASE_URL` al `.env` solo si cambia el dominio (el compose trae el
  default) y comprobar el arranque real de los dos contenedores durante el deploy (T6).
- **L12 (2026-10-17, progreso + verificación):** **T6 completado (`6b4c4bc8`)** — mecanismo: sincronizador
  automático del lado de la API, sin tocar los deploy scripts. `CatalogStaticPageSyncService`
  (BackgroundService, registrado en `Program.cs`) corre una pasada completa al arrancar — **backfill** de
  los catálogos existentes (S3) — y vigila la firma SHA-256 del shell del SPA cada 30 s (default; mínimo
  efectivo 5 s): firma nueva = build nuevo del frontend = pasada completa de nuevo (S9). Con la feature sin
  configurar el servicio no hace nada (ni abre la BD). El generador pasó a lecturas **públicas**
  (`GetStoreByIdIgnoreQueryFiltersAsync` / `GetPublicByStoreIdAsync`): sin sesión el filtro global de tenant
  no coincide con ninguna fila y la pasada habría generado CERO páginas en silencio — los flujos de guardado
  (T4) obtienen la misma fila. Compose de test cableado igual que producción
  (`catalog_pages:/srv/catalog-pages` en API y web-store-pos; `CatalogStaticPage__*` con
  `PublicBaseUrl` default `https://vdt.playground.sceiba.net`).
  **Evidencia:** RED 18 fallidos/28 pasan/46 → **GREEN 46/46** (filter `CatalogStaticPage`, 18 pruebas
  nuevas); Application.Tests **1357/1357**; Domain.UnitTests **165/165**; E2E `WebCatalogPublicApiTests`
  **8/8** (fixture real). **Sonda local end-to-end** con la API real contra `smca_test` (shell y salida en
  temp fuera del repo; `CatalogSlug` temporal en la tienda `613b6022`, revertido después): (a) el arranque
  escribió `pages/catalog/probe-bodega-t6/index.html` con title/canonical/OG de la tienda (1/1 escritas en
  el log); (b) shell reescrito → página regenerada ~5 s después con el marcador y los assets nuevos, dos
  "Shell nuevo detectado" con firma distinta; (c) sin cambio de shell no hay reescritura (mtime estable,
  exactamente 2 detecciones). Fuera de T6 (anotado, no hecho): renombrar un slug
  (`UpdateStoreCatalogSlugCommand`) deja huérfana la página del slug viejo — candidato a tarea propia.
  Pendiente en el VPS: redeploy de test y comprobar el arranque real (backfill en la primera página y
  regeneración ante un build nuevo del frontend).
- **L13 (2026-10-17, RDD):** assessment nativo del slice de T6 (`gentle-ai review assess --base-ref
  36a30639 --committed-only --json`; cubre `6b4c4bc8` + `e3e1db53`): risk **`medium`** (13 paths,
  576 líneas), `review_due: false`, motivo **`under_budget`** → ninguna review nativa forzada; el slice
  queda pendiente con base `36a30639` hasta que un commit posterior alcance el presupuesto. El modo RDD
  está `on` (global). Los cierres de T1–T5 no registran assessment RDD en este documento.
