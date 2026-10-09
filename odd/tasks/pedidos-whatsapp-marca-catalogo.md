# Pedidos WhatsApp — marca del catálogo (F8)

## Objetivo

Permitir a la tienda **personalizar la carta pública** (`/catalog/{storeSlug}`) con **logo, banner y
una paleta de colores predefinida**. La configuración vive en la **vista actual Catálogo Web**
(`/sales/web-catalog`, OwnerAdmin), se guarda en la tabla por tienda `StoreCatalogSettings`
(`LogoKey`, `BannerKey`, `PaletteId`) y se aplica en la página pública. La **paleta por defecto es la
actual** (`frontend-react/packages/web-common/styles.css`, bloque `@theme`).

## Problema

Hoy el catálogo público se ve siempre con la identidad visual genérica del producto: no hay forma de
que la tienda suba su logo, un banner de cabecera ni de elegir un esquema de color. La marca de la
tienda existe fuera del catálogo, pero la carta pública no la refleja.

## Por qué

- Una carta pública con la marca de la tienda da confianza al cliente anónimo que va a pedir por
  WhatsApp (F3/F4).
- Reusar el **patrón de media del catálogo** (clave relativa persistida + endpoint público que sirve
  por slug) evita inventar otro mecanismo de archivos y respeta el aislamiento por tienda.
- Una **paleta predefinida** (no color libre) mantiene la coherencia visual y evita combinaciones que
  rompan contraste o accesibilidad.
- Guardar la marca en la **misma tabla por tienda** que la config de pedidos evita una segunda tabla
  y mantiene el despliegue en una sola migración.

## Alcance

### Autorizado

- Backend (módulo Catálogo Web, sin crear módulo nuevo):
  - Columnas de marca en `StoreCatalogSettings` (`LogoKey?`, `BannerKey?`, `PaletteId`) — definidas en
    F2 y creadas por la **migración de F2**.
  - `GetStoreCatalogBrandingQuery` / `UpdateStoreCatalogBrandingCommand` (o la parte de marca de
    `UpsertStoreCatalogSettingsCommand`; **propuesta**) para leer/grabar logo, banner y paleta.
  - Reutilizar (o extender) el **patrón de media del catálogo** para servir logo/banner
    (**propuesta**; ver Diseño técnico).
  - Exponer logo/banner/paleta en el config público
    `GET /api/v1/public/ordering/{storeSlug}/config` (F1).
- UI React (`frontend-react/`):
  - Sección de marca (subir/cambiar logo y banner; selector de paleta predefinida) **dentro de la
    vista actual Catálogo Web** (`sales/routes/web-catalog.tsx`).
  - Aplicación de logo, banner y paleta en la página pública `app/catalog/routes/public-catalog.tsx`.
  - Claves i18n y tests unitarios nuevos.
- La **paleta por defecto** es la actual (`web-common/styles.css`, `@theme`).

### Fuera de alcance

- **No** se crea una vista nueva de marca: se configura en la **vista actual Catálogo Web**
  (`/sales/web-catalog`), no en "Pedidos WhatsApp".
- **No** se permite color libre: solo **paletas predefinidas** (`PaletteId`).
- **No** se crea módulo ni feature nuevos: la marca sigue bajo `WebCatalogAdmin` (OwnerAdmin, D15).
- No se altera el comportamiento del catálogo web existente (queries, `SyncCatalogCommand`, campos de
  catálogo e imágenes) ni sus UI más allá de la sección nueva.
- No se implementa la config de pedidos (F1) ni el carrito/checkout/envío (F3/F4).
- No se toca el POS (D14).

## Dependencias

- **F2**: define la tabla `StoreCatalogSettings` con las columnas de marca y **la migración EF + script
  29** que las crea. F8 no añade migración propia.
- **F1**: el config público `GET /api/v1/public/ordering/{storeSlug}/config` expone los campos de
  marca que F8 escribe.
- **F3**: la página pública donde se aplica la marca es la misma del carrito/checkout.
- Patrón de media del catálogo: `ICatalogImageStorage` (`Application/Abstractions/Storage`),
  `GetCatalogMediaQuery` y `PublicCatalogController.GetMediaAsync`
  (`GET /api/v1/public/catalog/{storeSlug}/media/{**key}`).
- Paleta actual: `frontend-react/packages/web-common/styles.css`, bloque `@theme`
  (`--color-primary: rgb(103 58 183)`, `--color-secondary`, `--color-accent`, etc.).

## Decisiones del owner aplicables

| # | Decisión | Cómo aplica a F8 |
| --- | --- | --- |
| D1 | Backend + UI React; no se altera el catálogo web | La marca se cuelga del módulo 18 sin tocar el catálogo. |
| D8 | Vistas separadas por página | La marca va dentro de la vista Catálogo Web, no en "Pedidos WhatsApp". |
| D14 | Sin sincronización POS ↔ backend | La marca solo afecta al catálogo/backend. |
| D15 | StoreUser gestiona pedidos/ventas/repartidores; OwnerAdmin configura | La marca la configura **OwnerAdmin** (`WebCatalogAdmin`). |
| D19 | Marca y config en la misma tabla; paleta predefinida; por defecto la actual | `StoreCatalogSettings` (`LogoKey`, `BannerKey`, `PaletteId`), en la vista Catálogo Web. |
| — | Precios/moneda | **Fuera de alcance**: la marca no toca precios ni moneda. |

## Decisiones resueltas y notas

**No quedan decisiones abiertas bloqueantes para F8.** Los puntos heredados quedaron resueltos así:

- **A1 → D15**: la marca es **configuración de OwnerAdmin** (`WebCatalogAdmin`), junto con la config
  de pedidos; la gestión operativa (pedidos/ventas/repartidores) es de StoreUser vía
  `OnlineOrdersAdmin`.
- **A3 → ELIMINADA**: la marca no introduce ni moneda ni precios; vienen del catálogo.
- **A6 → confirmado**: la marca no añade una vista nueva; se edita en la vista actual **Catálogo Web**
  (`/sales/web-catalog`) y se aplica en la pública.

Quedan como **propuesta (pendiente de confirmar)**:

- La **lista de paletas predefinidas** y sus `PaletteId` (incluido el id de la paleta actual por
  defecto).
- Si la lectura/escritura de marca usa queries/commands propios o la parte de marca de
  `StoreCatalogSettings`.
- El detalle del patrón de almacenamiento de logo/banner (ver Diseño técnico).

## Diseño técnico

### Datos (`StoreCatalogSettings` — definida en F2)

- `LogoKey` (`string?`): clave relativa del logo.
- `BannerKey` (`string?`): clave relativa del banner.
- `PaletteId` (`string`): id de la paleta predefinida; por defecto, la **paleta actual**.
- **Sin** columnas de color libres ni moneda.

### Backend

- **Marca (escritura/lectura)**, propuesta: `GetStoreCatalogBrandingQuery` +
  `UpdateStoreCatalogBrandingCommand` bajo `WebCatalogAdmin`; o bien `UpsertStoreCatalogSettingsCommand`
  (F1) con una sección de marca. En cualquier caso, el command de marca escribe **solo** sus columnas y
  el de pedidos **solo** las suyas, para que ambas vistas no se pisen.
- **Imágenes (propuesta)**: reutilizar el patrón del catálogo. Las claves del catálogo son relativas
  `{tenantId}/{storeId}/{productId}/{guid}{ext}` y se sirven con
  `GET /api/v1/public/catalog/{storeSlug}/media/{**key}`; `ICatalogImageStorage.BelongsToStore`
  valida la pertenencia por tenant+tienda. Para logo/banner **no hay `productId`**, así que se
  propone una variante de clave a nivel de tienda (p. ej. `{tenantId}/{storeId}/branding/{guid}{ext}`)
  servida por el **mismo** endpoint público (su `BelongsToStore` ya valida tenant+tienda).
  **Pendiente de confirmar**: si se extiende `ICatalogImageStorage` con un método de marca o se añade
  un almacén paralelo.
- **Config público (F1)**: `PublicOrderingConfigDto` añade `LogoUrl?`, `BannerUrl?`, `PaletteId`. Las
  URLs se construyen con `CatalogPublicUrls.Media(storeSlug, key)`; **nunca** se exponen rutas del
  servidor.

### UI React (propuesta)

- **Vista Catálogo Web** (`sales/routes/web-catalog.tsx`, OwnerAdmin): sección "Marca" con
  - subida/cambio de **logo** y **banner** (mismo tipo de control de archivo que las imágenes del
    catálogo),
  - **selector de paleta** predefinida (`PaletteId`),
  - guardado con el botón de la vista (o uno propio de la sección; **propuesta**).
- **Página pública** (`app/catalog/routes/public-catalog.tsx`): aplica el logo (cabecera), el banner y
  la paleta leída del config público. La paleta predefinida se materializa como variables CSS acotadas
  a la página del catálogo (sin tocar el tema global), con la **paleta actual como valor por defecto**
  cuando `PaletteId` falta o es desconocido.
- i18n en `shared/lib/i18n/es.ts`.

## Tareas

- [x] **T1** — Forma de lectura/escritura de marca: **query/command propios** (`GetStoreCatalogBrandingQuery` / `UpdateStoreCatalogBrandingCommand`), no extender el de pedidos.
- [x] **T2** — `PaletteId`: **paletas CANCELADAS por el owner (2026-10-07)** — se usa solo la actual; `PaletteId` se lee/devuelve pero **no se escribe**. Sin lista de paletas.
- [x] **T3** — Backend: lectura/escritura de `LogoKey`/`BannerKey` (sin pisar las columnas de pedidos ni `PaletteId`).
- [x] **T4** — Backend: `SaveBrandingAsync` en `ICatalogImageStorage` (clave `{tenant}/{store}/branding/{kind}/{guid}{ext}`) servido por el **mismo** endpoint público de media (valida pertenencia por tienda).
- [x] **T5** — `LogoUrl?`/`BannerUrl?` (+ `PaletteId`) en el config público (F1).
- [x] **T6** — UI: sección "Marca" en la vista Catálogo Web (subida de logo/banner, **sin** selector de paleta).
- [x] **T7** — UI: aplicar logo y banner en la página pública (sin paleta; tema actual).
- [x] **T8** — Claves i18n.
- [x] **T9** — Tests unitarios nuevos (storage/query/command con Moq; sección de marca y página pública).
- [x] **T10** — Verificación (build/tests backend, `typecheck`/`lint`/`vitest`). Sin migración propia: la cubre F2.

## Criterios de aceptación

1. En la vista actual Catálogo Web (OwnerAdmin) se puede subir/cambiar logo y banner y elegir una
   paleta predefinida.
2. La marca se persiste en `StoreCatalogSettings` (`LogoKey`, `BannerKey`, `PaletteId`) y **no** pisa
   la config de pedidos.
3. La página pública `/catalog/{storeSlug}` muestra el logo, el banner y la paleta configurados.
4. Sin marca configurada, la página pública usa la **paleta actual** por defecto y no rompe el
   catálogo existente.
5. Logo/banner se sirven por el endpoint público de media, validando que la clave pertenece a la
   tienda del slug.
6. Los endpoints de marca exigen `WebCatalogAdmin` (OwnerAdmin).
7. No se crea vista ni módulo nuevos; la migración que crea las columnas es la de F2 (script 29).

## Comandos de verificación

```bash
cd backend
dotnet build src/SMCA.sln
dotnet test src/Application.Tests/Application.Tests.csproj

cd ../frontend-react/apps/web-store-pos
pnpm typecheck
pnpm lint
pnpm vitest run app/catalog/ app/sales/routes/__tests__/
```

## Riesgos

- **Tabla compartida con la config de pedidos**: commands de marca y de pedidos deben escribir solo
  sus columnas.
- **Aislamiento por tienda**: la clave de media debe validarse por tenant+tienda (patrón
  `BelongsToStore`).
- **Accesibilidad/contraste**: las paletas deben ser predefinidas y probadas; no color libre.
- **Caché de media**: el endpoint público cachea agresivamente claves inmutables; al cambiar logo o
  banner, la clave nueva (con guid) evita servir la imagen vieja.
- **Migración**: las columnas las crea la migración de F2; **no** escribir `.sql` a mano.

## Decisiones resueltas durante la implementación (2026-10-07)

| # | Punto | Decisión | Motivo |
| --- | --- | --- | --- |
| I1 | Paletas de color | **Canceladas** (solo la actual) | Owner 2026-10-07. Sin selector, sin mapa, `PaletteId` nunca se escribe. |
| I2 | Almacenamiento de marca | Extender `ICatalogImageStorage.SaveBrandingAsync` (clave `{tenant}/{store}/branding/{kind}/{guid}{ext}`) | Comparte prefijo `{tenant}/{store}/`, así `BelongsToStore` la acepta y se sirve por el endpoint público de media actual; sin almacén paralelo. El `guid` es obligatorio: el endpoint cachea `immutable` 1 año. |
| I3 | Lectura/escritura de marca | Query/command **separados** de pedidos | `UpsertStoreCatalogSettingsCommand` no debe tocar columnas de marca (test por reflexión). |
| I4 | PUT de marca | **Parcial** (logo/banner/remove por lado) | "No menciono este lado" = no lo toco. |
| I5 | Guardado en la vista | Botón propio de la sección (`brand-save`) | Independiente del batch de productos (menor riesgo). |

## Evidencia de verificación (2026-10-07)

| Comando | Resultado |
| --- | --- |
| `dotnet build` | 0 errores |
| `dotnet test Application.Tests` | **782 passed** (+36) |
| `dotnet test Domain.UnitTests` | 154 passed |
| `turbo typecheck` / `lint` | 0 errores |
| `vitest web-catalog + public-catalog` | **46 passed** |
| E2E | No se corrió |

## Hallazgos de la revisión nativa (RDD) — TODOs rastreados (2026-10-07)

- [x] **F8-R1** (WARNING · backend) — Logo válido + banner inválido deja un **archivo huérfano** en disco (el logo se escribe antes de validar el banner). Destino: F8. **Cerrado (2026-10-08):** los dos archivos se validan up-front en `Handle`, antes de que ninguno toque el disco; `EnsureValid` sale de `ResolveAsync`.
- [x] **F8-R2** (WARNING · backend) — Al reemplazar, se **borra el archivo anterior antes** de persistir; si `SaveChanges` falla, la BD apunta a un archivo ya borrado (404). Destino: F8. **Cerrado (2026-10-08):** `ResolveAsync` ya no borra, solo encola `obsoleteKeys`/`newKeys`; el borrado ocurre tras persistir, best-effort con `LogWarning`, y si el guardado falla se compensa borrando lo nuevo mientras lo anterior sobrevive.
- [x] **F8-R3** (WARNING · frontend) — El mapeo `CatalogBrandingUpdate → FormData` de `updateBranding` **no se ejecuta en ningún test** (todo mockea el servicio). Destino: F8. **Cerrado (2026-10-08):** `HTTP-12` fija el multipart completo (logo/banner como `File`, booleanos `'true'`, header `multipart/form-data`) y `HTTP-13` el PATCH (lo no mencionado no viaja).
- [x] **F8-R4** (WARNING · frontend) — Falta el caso de archivo **demasiado grande** en la validación de marca. Destino: F8. **Cerrado (2026-10-08):** test de un PNG válido de 2 MB + 1 byte: avisa, no retiene ni sube.
- [x] **F8-R5** (SUGGESTION) — `MediaUrl` con slug null/blank. Destino: F8. **Cerrado (2026-10-08):** `MediaUrl` exige slug y clave no blank; un slug vacío devolvía `/api/v1/public/catalog//media/{key}`.
- [x] **F8-R6** (SUGGESTION) — Alt de imágenes solo por testid. Destino: F8. **Cerrado (2026-10-08):** el test asserta el `alt` del logo/banner (con nombre de tienda) y de las imágenes del carrusel y del día (pie de foto o nombre de la tienda).

## Siguiente paso

F3 (carrito/checkout del cliente), que fija el contrato de `CreateOnlineOrderCommand` con un endpoint
público por slug y trae T10 (tipos espejo TS en `@store-mgmt/domain`).

## Progreso

- 2026-10-06 — Feature creado (documento de diseño). Sin implementación.
- 2026-10-07 — **Implementado en 2 slices** (rama `feat/pedidos-whatsapp-f8-marca-catalogo`, sobre
  `dev`): `6000daca` (backend) y `c98d0b90` (frontend). Ambos **revisados y aprobados/acknowledgeados**
  por la revisión nativa. Owner **canceló las paletas** (solo la actual). Sin migración (columnas ya
  existían en F2). Push/PR = decisión del owner.
- 2026-10-08 — **Cerrados F8-R1, F8-R2 y F8-R5 (backend).** Validación up-front de logo Y banner en
  `Handle`, antes de que ningún archivo toque el disco; `ResolveAsync` ya no borra, solo encola las
  keys nuevas y obsoletas, y el borrado se hace **después** de persistir (best-effort con `LogWarning`,
  nunca relanza una operación ya confirmada); si el guardado falla se compensa borrando el archivo
  nuevo y el anterior sobrevive. `MediaUrl` exige slug no blank además de clave no blank. El handler
  pasa a llevar `ILogger<T>`, igual que `RemoveStoreCatalogImageCommandHandler`.
  Verificación observada: `dotnet build src/SMCA.sln` → Build succeeded, 0 errors, sin `error MSB`;
  `--filter UpdateStoreCatalogBranding` → 46/46; `--filter GetPublicOrderingConfig` → 45/45;
  `Application.Tests` completo → **1163/1163**. Sondas de mutación: revertir la guarda de slug rompe
  solo los 2 casos nuevos; devolver el borrado al interior de `ResolveAsync` rompe los 2 tests de
  F8-R2; devolver la validación al interior de `ResolveAsync` (la forma pre-fix) rompe **solo**
  `Handle_WithAValidLogoAndAnInvalidBanner_ShouldNotSaveAnyFile`. F8-R3/R4/R6 (frontend) siguen
  abiertos. Sin commit (writer acotado).
- 2026-10-08 — **Cerrados F8-R3, F8-R4 y F8-R6 (frontend, solo tests).** `catalog-http-service.test.ts`:
  `HTTP-12` fija el mapeo multipart de `updateBranding` y `HTTP-13` el PATCH. `web-catalog.test.tsx`:
  caso de archivo demasiado grande (2 MB + 1 byte). `public-catalog.test.tsx`: aserciones de `alt`
  en logo, banner, carrusel y bloque del día. Verificación observada:
  `pnpm vitest run public-catalog + web-catalog + catalog-http-service` → 3 archivos / **102 tests
  verdes**, 0 errores de tipo. (El writer se abortó por un reinicio del server antes de documentar;
  el orquestador verificó y documentó aquí.)
