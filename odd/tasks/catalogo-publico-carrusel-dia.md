# Catálogo público — carrusel, botón "Ver Productos" e imágenes del día

## Objetivo

Añadir a la carta pública (`/catalog/{slug}`) tres cosas de presentación:

1. Un **carrusel de imágenes** al inicio, bien llamativo, para que el cliente vea el menú /
   catálogo en imágenes. **Solo se muestra si la tienda tiene imágenes de carrusel configuradas.**
2. Un **botón flotante animado "Ver Productos"** que baja (scroll) hasta la grilla de productos.
3. Un bloque de **imágenes del día** (destacadas: platos, promos, productos a resaltar).
   **Solo se muestra si hay imágenes del día configuradas.**

## Problema

Hoy el catálogo público abre directamente a filtros y productos: no hay portada visual, ni forma de
que la tienda (p. ej. un restaurante) muestre su menú en imágenes o destaque platos del día. El dueño
solo puede configurar logo/banner/paleta (F8); no tiene un conjunto de imágenes propio del catálogo.

## Por qué

- Una portada visual con el menú en imágenes comunica mucho más rápido que una lista, y es lo que un
  restaurante espera poder subir.
- El botón flotante resuelve la navegación en móvil sin obligar a recorrer la portada entera.
- "Imágenes del día" da a la tienda un espacio rotativo de destacados sin tocar el catálogo.

## Alcance

### Autorizado

- **Backend** (módulo Catálogo Web):
  - Nueva entidad **`StoreCatalogImage`** (N por tienda: `StoreId`, `Kind`, `Key`, `Order`,
    `Caption?`, `IsActive`).
  - Comandos/queries de gestión: listar, **agregar** (multipart), **quitar**, **reordenar**.
  - **Migración EF + script generado** (tabla nueva).
  - Exposición pública de las imágenes (carrusel / del día) para el catálogo.
- **UI React** (`frontend-react/`):
  - Sección de **configuración** en la vista **Catálogo Web** (`/sales/web-catalog`, OwnerAdmin):
    dos bloques (Carrusel / Imágenes del día) con subir, ordenar, pie de foto y quitar.
  - **Render público** en `app/catalog/routes/public-catalog.tsx`: carrusel, botón flotante y bloque
    de imágenes del día.
  - Cliente API + i18n + tests unitarios nuevos.

### Fuera de alcance

- No se tocan las vistas de pedidos (F5/F6/F7) ni el POS (D14).
- No se implementa pago/estado ni nada del ciclo de pedidos.
- No hay paletas de color (usamos la actual).
- **Sin caducidad por fecha** en v1: "del día" es un bloque de destacadas que el dueño cambia a mano.
- No se altera el catálogo web existente (filtros, grilla, detalle) ni su comportamiento.
- E2E intocable.

## Decisiones del owner (2026-10-07)

| # | Decisión |
| --- | --- |
| C1 | **Dos conjuntos independientes**: "carrusel" e "imágenes del día". |
| C2 | Ambos **configurables y opcionales**: pueden estar los dos, solo uno, o ninguno. |
| C3 | La config de las imágenes vive en la vista **Catálogo Web** (OwnerAdmin, `WebCatalogAdmin`). |
| C4 | Sin caducidad por fecha en v1 (destacadas manuales). |

## Diseño técnico

### Datos

**Nueva tabla `StoreCatalogImage`** (`AuditableEntity<Guid>`, `ITenantBaseEntity`):

| Campo | Tipo | Notas |
| --- | --- | --- |
| `StoreId` | Guid | índice; aislamiento por tienda |
| `TenantId` | Guid | filtro global |
| `Kind` | `StoreCatalogImageKind` (`Carousel=0`, `Daily=1`) | el conjunto |
| `Key` | string | clave relativa del archivo |
| `Order` | int | orden dentro del conjunto |
| `Caption?` | string | pie de foto opcional |
| `IsActive` | bool | |

> Una tabla (no columnas JSON) porque es **N** con orden y borrado por ítem, y porque el repo usa
> entidades EF. Implica **migración + script** (regla AGENTS.md: la migración es la fuente).

### Almacenamiento

Reutiliza el **patrón de media del catálogo** (F8). Se añade a `ICatalogImageStorage` un método
`SaveCatalogImageAsync(upload, tenantId, storeId, kind)` con clave
`{tenantN}/{storeN}/catalog/{kind}/{guidN}{ext}`, servida por el **mismo** endpoint público de media
(`GET /api/v1/public/catalog/{slug}/media/{**key}`, ya valida `BelongsToStore` por prefijo
`{tenant}/{store}/`). El `guid` en la clave es obligatorio (el endpoint cachea `immutable`).

### Gestión (JWT + `WebCatalogAdmin`)

| Método | Ruta | Command/Query |
| --- | --- | --- |
| GET | `/api/v1/catalog/showcase` | `GetStoreCatalogImagesQuery` (agrupa por kind) |
| POST | `/api/v1/catalog/showcase` (multipart: `kind`, `file`, `caption?`) | `AddStoreCatalogImageCommand` |
| DELETE | `/api/v1/catalog/showcase/{id}` | `RemoveStoreCatalogImageCommand` (borra fila + archivo) |
| PUT | `/api/v1/catalog/showcase/order` | `ReorderStoreCatalogImagesCommand` |

- Todas filtran por la tienda del contexto; el `Kind` valida contra el enum.

### Público

Se extiende el config público que ya consume la página (`PublicOrderingConfigDto` →
`GET /api/v1/public/ordering/{slug}/config`) con:

- `carouselImages: [{ url, caption? }]`
- `dailyImages: [{ url, caption? }]`

Ambas listas ordenadas y **vacías** si no hay imágenes. Las URLs se construyen con
`CatalogPublicUrls.Media(storeSlug, key)`; **nunca** rutas del servidor.

### UI React

- **Config** en `app/sales/routes/web-catalog.tsx`: dos `<Card>` (Carrusel / Imágenes del día), cada
  una con subida múltiple, vista previa, orden (subir/bajar), pie de foto y quitar.
- **Público** en `app/catalog/routes/public-catalog.tsx`:
  - **Carrusel** arriba (solo si `carouselImages.length > 0`), con auto-avance e indicadores.
  - **Botón flotante "Ver Productos"** (animado) que hace scroll a `catalog-grid`; visible cuando la
    página está cargada.
  - **Bloque de imágenes del día** (solo si `dailyImages.length > 0`), con pie de foto.
- Nada de esto rompe el catálogo si faltan las imágenes (render condicional).

## Tareas

- [ ] **T1** — Entidad `StoreCatalogImage` + enum `StoreCatalogImageKind` + config EF + `DbSet`.
- [ ] **T2** — `ICatalogImageStorage.SaveCatalogImageAsync` + impl.
- [ ] **T3** — `GetStoreCatalogImagesQuery`.
- [ ] **T4** — `AddStoreCatalogImageCommand` (+validator) y `RemoveStoreCatalogImageCommand`.
- [ ] **T5** — `ReorderStoreCatalogImagesCommand`.
- [ ] **T6** — `CatalogShowcaseController` (`[HasPermission(WebCatalogAdmin)]`).
- [ ] **T7** — Exponer `carouselImages`/`dailyImages` en el config público.
- [ ] **T8** — Migración EF + script generado (tabla nueva).
- [ ] **T9** — Config UI: dos secciones en Catálogo Web.
- [ ] **T10** — Público: carrusel + botón flotante + bloque del día.
- [ ] **T11** — i18n.
- [ ] **T12** — Tests unitarios (backend + React).
- [ ] **T13** — Verificación.

## Criterios de aceptación

1. En la vista Catálogo Web (OwnerAdmin) se pueden subir, ordenar, poner pie de foto y quitar imágenes
   de **carrusel** e **imágenes del día**, por separado.
2. El config público devuelve ambas listas (vacías si no hay) con URLs del endpoint de media.
3. La página pública muestra el carrusel solo si hay imágenes de carrusel; el bloque del día solo si
   hay imágenes del día; con **ninguna** de las dos, la página funciona igual que hoy.
4. El botón flotante "Ver Productos" baja a la grilla y no aparece/estorba cuando no corresponde.
5. Las imágenes se sirven por el endpoint público de media validando pertenencia por tienda.
6. Los endpoints de gestión exigen `WebCatalogAdmin`.
7. No se altera el catálogo existente ni el POS.

## Comandos de verificación

```bash
cd backend
dotnet build src/SMCA.sln
dotnet test src/Application.Tests/Application.Tests.csproj
cd ../frontend-react/apps/web-store-pos
pnpm typecheck && pnpm lint
pnpm vitest run app/catalog/ app/sales/routes/__tests__/
```

## Riesgos

- **Tabla nueva + migración**: la migración es la fuente; el `.sql` se genera, nunca a mano.
- **Rendimiento**: no traer cientos de imágenes; limitar por conjunto.
- **Caché**: el `guid` en la clave invalida la caché inmutable al cambiar una imagen.
- **No romper el catálogo**: todo el render nuevo es condicional a que haya imágenes.

## Siguiente paso

Implementar en slices: **backend** (entidad+comandos+controller+público), **migración+script**,
**config UI**, **público UI**.

## Progreso

- 2026-10-07 — Feature creado. Decisiones C1–C4 del owner. Sin implementación.
