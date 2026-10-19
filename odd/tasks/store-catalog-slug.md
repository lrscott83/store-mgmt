# store-catalog-slug

Slug público del catálogo web configurable por el SuperAdmin desde la MISMA vista que ya
actualiza la plantilla de una tienda. Rama: `test`. Runner: `vitest` (frontend) + `xunit` (backend).

## Specs

- **S1** — El SuperAdmin puede fijar el slug del catálogo web de una tienda desde la misma vista
  del template (`PUT /v1/stores/{storeId}/catalog-slug`). Un caller que no sea SuperAdmin recibe
  **403** (mismo patrón que `catalog-template`). El endpoint escribe **solo** `Store.CatalogSlug`.
- **S2** — El slug se guarda **normalizado** con `SlugNormalizer.Normalize`: minúsculas, sin
  tildes ni ñ, `[a-z0-9-]`, sin guiones al borde, máximo 63 caracteres. Entrada `"Café & Té"`
  → `"cafe-te"`; `"Ñoño ÑÁÉÍÓÚ"` → `"nono-naeiou"`. La UI muestra el resultado normalizado en vivo
  antes de guardar.
- **S3** — Si el slug ya lo usa **otra** tienda, se rechaza con un error legible y **no se guarda**.
  Sin sufijo automático (`-2`, `-3`). Guardar el mismo slug que la tienda ya tiene es válido
  (no colisiona consigo misma).
- **S4** — Slug vacío o en blanco → **rechazado** (una tienda con catálogo no puede quedarse sin
  slug). El `FallbackSlug` se usa solo al autogenerar, nunca al guardar una entrada vacía.
- **S5** — La lectura del slug viaja con la lectura del template (`GET {storeId}/catalog-template`
  devuelve además `catalogSlug`), porque la UI es la misma.
- **S6** — Ninguna funcionalidad se rompe: todos los endpoints públicos resuelven la tienda por
  `Store.CatalogSlug` (`GetStoreByCatalogSlugAsync`), así que el valor nuevo aplica a todo el
  catálogo y sus features (productos, detalle, media, showcase, marca, config de pedidos, estado
  y creación de pedido). Solo cambia la **URL pública** `/catalog/<slug>`; los usuarios usan el
  slug nuevo. El autogenerado de `SyncCatalogCommand` solo actúa si el slug está vacío, así que
  nunca sobrescribe un slug puesto a mano.
- **S7** — Consecuencia aceptada: el carrito del cliente final se indexa en el navegador por slug
  (`itemsByStore[slug]`); el carrito guardado bajo el slug viejo queda huérfano. **No** se migra.
- **S8** — No se toca ningún E2E existente (backend ni Playwright) ni `frontend/` (Angular).

## Tasks

- [x] T1. Backend: `UpdateStoreCatalogSlugCommand` + handler + validator (S1–S4).
- [x] T2. Backend: `StoreCatalogTemplateDto.CatalogSlug` + poblar en `GetStoreCatalogTemplateQuery` (S5).
- [x] T3. Backend: acción `PUT {storeId}/catalog-slug` en `StoresController` (S1).
- [x] T4. Backend: tests unitarios (validator + handler + lectura) (S1–S5).
- [x] T5. Frontend: servicio, modal (plantilla + slug con preview normalizado), glue, i18n (S1–S3, S5).
- [x] T6. Frontend: tests vitest (S1–S5).
- [x] T7. Verificación (build/typecheck/lint/tests).

## Log

- **L1** (2026-10-13, petición del owner, verbatim): «Poder configurar el slum de una tienda para
  el catálogo web desde el SuperAdmin? El Super admin ya tiene una vista para actualizar el
  template de una tienda pudiera ser en esa misma vista».
- **L2** (aclaración del owner, verbatim): «que cosa es que rompe los enlaces compratidos? la idea
  es que todo el catalogo y todas sus funcionalidades usen ese slug, esta claro que la url publica
  cambia y los usuarios deben usar ese nuevo slug pero eso no puede romper nada de funcionalidad
  que tenemos».
- **L3** (decisiones del owner): normalizar automáticamente (no rechazar por formato); colisión →
  rechazar con error (sin auto-sufijo); el carrito local huérfano es aceptable (sin migración).
- **L4** (autorización): el owner autoriza tocar código de producción del backend + frontend.
- **L5** (implementación, 2026-10-13). Backend: `UpdateStoreCatalogSlugCommand` (+validator) y
  `StoreCatalogSlugDto` nuevos; `StoreCatalogTemplateDto.CatalogSlug` + lectura en
  `GetStoreCatalogTemplateQuery`; `PUT {storeId}/catalog-slug` en `StoresController`; claves
  `CatalogSlugInUse` en `I18n.resx`/`I18n.en.resx`; `StoreCatalogSlugTests` nuevo (14 casos).
  Frontend: `lib/catalog-slug.ts` (normalizador espejo), `store-http-service` (tipo +
  `updateStoreCatalogSlug`), `store-catalog-template-modal` (campo slug + preview + bloqueo),
  glue en `store-list.tsx`, claves `STORES.CATALOG_SLUG.*` y título "Catálogo de la tienda".
- **L6** (verificación observada). Backend: `StoreCatalog` 273/273 (incluye los 14 nuevos y los de
  plantilla, que siguen verdes con el DTO ampliado). Frontend: `app/management/stores` +
  `app/admin/stores` 236/236; suite completa 373 archivos verdes (un primer run marcó 1 fallo que
  NO se reprodujo: flakiness conocida por interferencia de suite); `typecheck` 0; `lint 0` con
  `--max-warnings=0`.
- **L7** (E2E). Ningún E2E existente toca esta vista (grep en `frontend-react/e2e`: cero
  referencias a `catalog-template`/`Plantilla`), así que no hay E2E que actualizar y no se tocó
  ninguno. **AÑADIDO** `StoreCatalogSlugE2ETests` (la regla solo permite añadir): 6 casos contra
  PostgreSQL real —normaliza+persiste, el catálogo público resuelve por el slug nuevo y ya no por
  el viejo, colisión 409, blanco 400, OwnerAdmin 403 y la lectura combinada— **6/6 verdes**
  (`[E2E Guard] Database=smca_test`).
