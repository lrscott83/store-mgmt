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

- [x] **T1** — Entidad `StoreCatalogImage` + enum `StoreCatalogImageKind` + config EF + `DbSet`.
- [x] **T2** — `ICatalogImageStorage.SaveCatalogImageAsync` + impl.
- [x] **T3** — `GetStoreCatalogImagesQuery`.
- [x] **T4** — `AddStoreCatalogImageCommand` (+validator) y `RemoveStoreCatalogImageCommand`.
- [x] **T5** — `ReorderStoreCatalogImagesCommand`.
- [x] **T6** — `CatalogShowcaseController` (`[HasPermission(WebCatalogAdmin)]`).
- [x] **T7** — Exponer `carouselImages`/`dailyImages` en el config público.
- [x] **T8** — Migración EF + script generado (tabla nueva).
- [x] **T9** — Config UI: dos secciones en Catálogo Web.
- [x] **T10** — Público: carrusel + botón flotante + bloque del día.
- [x] **T11** — i18n.
- [x] **T12** — Tests unitarios (backend + React).
- [x] **T13** — Verificación.

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

## Resultado

Implementado en **4 slices** (rama `feat/catalogo-publico-carrusel-dia`, sobre `dev`):

| Commit | Contenido |
| --- | --- |
| `a3833e62` | Entidad `StoreCatalogImage` + enum + config EF + **migración EF + script 30** |
| `decd847e` | Repositorio, `SaveCatalogImageAsync`, comandos/queries, `CatalogShowcaseController` y exposición pública (`carouselImages`/`dailyImages`) |
| `4708e53e` | **Fix** del binding multipart del POST (`[FromForm]`) — CRITICAL detectado por la revisión y corregido |
| `4036affb` | UI admin: secciones **Carrusel** e **Imágenes del día** en la vista Catálogo Web |
| `d346ab92` | UI pública: **carrusel**, botón flotante **"Ver Productos"** y bloque de **imágenes del día** |

## Evidencia de verificación

| Comando | Resultado |
| --- | --- |
| `dotnet build` | 0 errores |
| `dotnet test Application.Tests` | **991 passed** |
| `dotnet test Domain.UnitTests` | 154 passed |
| `turbo typecheck` / `lint` | 0 errores |
| `vitest app/catalog/` | **79 passed** (34 public-catalog) |
| `vitest web-catalog.test.tsx` | **41 passed** |
| E2E | No se corrió (excluido) |

## Revisión nativa (RDD)

Los 4 slices pasaron por la revisión nativa. Incidencias:
- El primer candidato del backend (combinado) excedía el **lens budget**; se reparticionó en entidad+migración / comandos+público.
- El reviewer marcó **CRITICAL** que la entidad se añadía **sin migración** (artefacto de la repartición) → se incluyó la migración en el slice de la entidad.
- El reviewer detectó un **CRITICAL real**: el POST multipart no bindeaba `kind`/`caption` del form (faltaba `[FromForm]`) → **corregido y validado** (`4708e53e`).

Hallazgos **advisory** (no bloqueantes):

- [x] **SC-R1** — La subida escribe el archivo **antes** de persistir la fila: si `SaveChanges` falla, queda archivo huérfano. Y el borrado quita la fila antes del archivo (fallo no idempotente). Destino: seguimiento.
  - **Cerrado (2026-10-08).** Subida: `AddAsync` + `SaveChangesAsync` van en un `try/catch` que, al fallar, borra el archivo recién escrito (`DeleteAsync` es idempotente) y **relanza** el error original — el que se reporta es el de persistencia, no el de la limpieza. Borrado: se conserva el orden fila→archivo y la guarda `if (saved)`, pero el `DeleteAsync` va en su propio `try/catch` que registra `LogWarning` y **no relanza**: la fila es la fuente de verdad y la operación ya está confirmada, así que un fallo de disco es deuda de disco, no un error (relanzar daba un 500 cuyo reintento recibía 404).
- [x] **SC-R2** — La regla `Content NotNull` del validador es inalcanzable (el controller coacciona a `Stream.Null`). Destino: limpieza.
  - **Cerrado (2026-10-08).** La regla ahora es `RuleFor(x => x.Length).GreaterThan(0)`: la longitud es la señal REAL de que el multipart trajo archivo, porque el controller nunca manda `Content` en null (pasa `Stream.Null` y `file?.Length ?? 0`). Cubierto por `Validate_WithZeroLength_ShouldFail_EvenThoughTheStreamIsNotNull` (falla) y `Validate_WithAFile_ShouldPass` (pasa).
- [x] **SC-R3** — El config público no filtra por `IsActive` (latente; nada lo apaga hoy). Destino: endurecer.
  - **Cerrado (2026-10-08).** `&& image.IsActive` añadido al filtro de `Showcase(...)`. Endurecimiento **explícito del contrato público**: el repositorio ya devolvía solo activas, así que el cambio no altera el comportamiento de hoy — evita que el contrato dependa de un detalle interno de la lectura. Cubierto por tests que montan una imagen inactiva (el mock del repositorio no aplica los filtros del repo, así que el test sí distingue el caso).
- [x] **SC-R4** — UI: el input file no se resetea; ramas de fallo parcial/red sin test; el test del halo con reduced-motion comprueba clases CSS, no comportamiento.
  - **Cerrado (2026-10-08).** `handleSelectFiles` vacía `event.target.value` justo después de leer los archivos: un `<input type="file">` sin limpiar NO vuelve a disparar `change` al elegir el mismo archivo, así que corregir una selección inválida no hacía nada. Se limpia también en las salidas tempranas (selección rechazada). El halo de "Ver productos" decide ahora la animación **en JS** (`readReducedMotion` + `useState`, mismo patrón que `CatalogCarousel`) y expone `data-reduced-motion`, conservando `motion-reduce:animate-none` como red para SSR/sin JS; su test pasa a ser conductual en vez de assertar clases. Tres tests nuevos en la vista del admin: reset del input, fallo parcial (1 de 2 → `showBlockingError` con el mensaje parcial, lista recargada, 1 imagen retenida, sin toast de éxito) y fallo de red (aviso + archivo retenido + sin recarga).
- [x] **SC-R5** — Tests del carrusel: pausa por hover/focus y el caso de **una sola imagen** sin cubrir.
  - **Cerrado (2026-10-08).** Tres tests nuevos con `vi.useFakeTimers({ shouldAdvanceTime: true })`: el carrusel avanza solo, se congela con `mouseEnter` y **vuelve a avanzar** con `mouseLeave`; se congela al enfocar un control (`onFocusCapture`, cualquier flecha o punto) y reanuda al perder el foco; y con **una sola imagen** no hay flechas ni puntos y 20 s de timers no mueven nada.

## Progreso

- 2026-10-07 — Feature creado. Decisiones C1–C4 del owner. Sin implementación.
- 2026-10-08 — **Implementado** en 4 slices, todos **revisados y aprobados/acknowledgeados**. Un CRITICAL real (binding multipart) corregido vía el circuito de corrección + validador. UI admin y pública completas. Push = decisión del owner.
- 2026-10-08 — **Cerrados SC-R4 y SC-R5 (frontend).** Reset del `<input type="file">` tras leer los archivos, para que re-seleccionar el mismo archivo vuelva a disparar `change`. El halo del botón "Ver productos" decide la animación en JS a partir de `prefers-reduced-motion` (`motion-reduce:animate-none` se queda como red SSR) y su test comprueba el efecto, no las clases. Tests nuevos: reset del input, fallo parcial del upload (avisa cuántas entraron de cuántas, no canta éxito y retiene solo la que falló), fallo de red (avisa y conserva el archivo retenido), pausa del carrusel por hover y por foco/teclado con reanudación, y una sola imagen sin flechas, sin puntos y sin auto-avance. Verificación observada: `pnpm vitest run app/catalog/ app/sales/routes/__tests__/` → 28 archivos / 494 tests, todos verdes; `pnpm exec eslint` sobre los 4 archivos tocados → limpio; `pnpm typecheck` → el único error es **preexistente** y ajeno (`storefront-checkout-staff.test.tsx(24,7)`, `PublicOrderingConfig` sin `carouselImages`/`dailyImages`), ningún archivo de este cambio aparece. Sin commit (writer acotado).
- 2026-10-08 — **Cerrados los 3 hallazgos backend (SC-R1, SC-R2, SC-R3).** Compensación del archivo huérfano en el alta (borrado del archivo recién escrito + rethrow del error de persistencia); borrado tolerante a fallo de disco (orden fila→archivo intacto, `LogWarning`, sin relanzar); regla de "archivo presente" alcanzable sobre `Length > 0` en vez de `Content NotNull`; e `IsActive` explícito en el config público. 7 tests nuevos/ampliados. Verificación observada: `dotnet build src/SMCA.sln` → Build succeeded, 0 errors, sin `error MSB`; `Application.Tests --filter FullyQualifiedName~Showcase` → 113/113; `--filter FullyQualifiedName~GetPublicOrderingConfig` → 43/43. Sonda de mutación: revirtiendo cada fix caen exactamente sus tests (4 y 4), así que los tests fijan el comportamiento y no pasan por casualidad. Sin commit (writer acotado).
