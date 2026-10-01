# Catálogo: `Product.Image` como única fuente de la imagen del producto

## Objetivo

Que la imagen de un producto tenga **una sola fuente de verdad: `Product.Image`**. El catálogo
público deja de leer la colección `ProductImage`, así que un producto sin imagen principal nunca
puede mostrar una foto fantasma. Quitar la imagen **borra de verdad** lo que apunta a ella, sin
dejar filas ni archivos huérfanos.

## Problema

Un producto tiene **dos fuentes de imagen independientes**:

| Fuente | Dónde | Qué es |
| --- | --- | --- |
| `Product.Image` | columna desnormalizada en `Product` | **una** clave, la imagen principal |
| `Product.Images` | colección `ProductImage` | la galería multi-imagen |

La vista Catálogo Web solo expone la principal (la galería está **comentada**, no borrada —
`catalog-product-editor.tsx:388-445`), así que al owner le queda un único botón, que viaja como
`RemoveImage: true`.

Pero `UpdateProductCatalogFieldsCommand.cs:115-116` solo hace:

```csharp
if (request.RemoveImage)
    product.Image = null;
```

No toca la colección, no desactiva la fila y **no borra el archivo**. Resultado: la fila de galería
sigue `IsActive` y el archivo sigue en el volumen `storage_data`.

El síntoma: el mapper devuelve las dos fuentes
(`PublicCatalogProductMapper.cs:39-40`), y cada lado del frontend lee una distinta.

- **Lista pública** (`public-catalog.tsx:257`) lee solo `product.imageUrl` → vacío → «SIN IMAGEN» ✓
- **Popup de detalle** (`public-catalog.tsx:114`) hace
  `result.data.imageUrl ?? result.data.imageUrls[0] ?? null` → cae a la galería → **muestra la imagen
  borrada** ✗

No es caché: el archivo y la fila existen. La lista se ve correcta, así que el producto queda
escondido hasta que se abre.

El caso inverso también ocurre: `AddProductImageCommand` sube a la galería **sin** tocar
`Product.Image`, así que una imagen subida por esa vía es invisible en la lista y solo aparece en el
popup.

## Por qué

El botón que sí limpiaba todo (`RemoveProductImageCommand`, filas + archivo + `Product.Image`) quedó
al otro lado de un bloque comentado, y su invariante —«el archivo se borra del disco, así que la
imagen principal no puede seguir apuntando a él» (`RemoveProductImageCommand.cs:47-49`)»— nunca se
aplicó al camino de la imagen principal. Dos fuentes, una sola con cleanup.

## Alcance

### Autorizado (owner, 2026-10-01)

«Todo de la imagen debe ser de `Product.Image`, así que has los arreglos asociados al respecto.»

### Archivos

- `backend/src/Application/Features/WebCatalog/Public/PublicCatalogProductMapper.cs`
- `backend/src/Application/Features/WebCatalog/Images/Commands/AddProductImage/AddProductImageCommand.cs`
- `backend/src/Application/Features/WebCatalog/Commands/UpdateProductCatalogFields/UpdateProductCatalogFieldsCommand.cs`
- `frontend-react/apps/web-store-pos/app/catalog/routes/public-catalog.tsx`
- Tests unitarios nuevos o ajustados (`Application.Tests/`, `__tests__/` de React)

### Fuera de alcance

- **E2E intocables.** En particular
  `WebCatalogPublicApiTests.Product_detail_exposes_the_plain_text_description_and_the_gallery`
  (líneas 207-249) fija que subir **una** imagen por la galería deja `ImageUrls` con 1 entrada
  servible. Este diseño lo mantiene **verde sin tocarlo** (ver T2).
- **No borrar código comentado.** La galería de `catalog-product-editor.tsx`, el grid de
  descuentos, la nota de restauración y `MAX_CATALOG_IMAGES` siguen comentados.
- **No migrar datos existentes.** Ver «Pendiente reportado».

## Decisiones del owner (2026-10-01)

| Decisión | Respuesta |
| --- | --- |
| Fuente única | `Product.Image` |
| Galería | comentada, **no** borrada; se restaura descomentando |
| Alcance | por ahora solo la imagen principal |

## Tareas

- [x] **T1** — `PublicCatalogProductMapper`: servir `ImageUrl` **e** `ImageUrls` desde
  `Product.Image`. Sin `Product.Image` → `ImageUrls` vacío. Se elimina la enumeración de
  `product.Images` de la lectura pública.
- [x] **T2** — `AddProductImageCommand`: cuando la imagen es la **primera** del producto
  (`existingImages.Count == 0`), fijar además `Product.Image = key`. Así la galería alimenta la
  fuente única y el E2E de la galería sigue viendo 1 imagen.
- [x] **T3 — CERRADA POR DECISIÓN DEL OWNER, sin cambios de comportamiento.** `RemoveImage` sigue
  limpiando **solo** `Product.Image` (código original intacto). Lo único que aporta T3 es el
  comentario que explica por qué la galería **no** se borra, para que nadie la "arregle" después.
  **Motivo de la decisión:** `WebCatalogProductFieldsTests.Remove_image_clears_the_main_image_only`
  (`WebCatalogProductFieldsTests.cs:132-155`) afirma que la galería **sobrevive** a `RemoveImage`,
  con el `because` *"la galería es un dato aparte: limpiar la principal no borra archivos"*, y los
  E2E son intocables sin autorización. El owner eligió no autorizar el cambio.
  **Lo que se pierde:** las filas y los archivos huérfanos no se borran. Como la lectura pública ya
  no usa la galería, son invisibles al catálogo; solo ocupan espacio en `storage_data`.
- [x] **T4** — `public-catalog.tsx`: quitar el fallback `?? result.data.imageUrls[0]` de la línea
  114 para que el popup lea la misma fuente que la lista (la 107 ya lo hace).
- [x] **T5** — Tests: mapper con y sin `Product.Image`; `RemoveImage` que limpia filas y borra
  archivos; y el test de React si fijaba el fallback.
- [x] **T6** — Verificación: build + `Application.Tests` + typecheck/lint/test de React.

## Decisión tomada (2026-10-01) — T3

El bug reportado lo arregla **T1**, no T3: la foto fantasma venía de que el mapper leyera la galería.
Con T1 el popup y la lista leen la misma fuente, así que un producto sin imagen principal no puede
mostrar nada.

**T3 era higiene de datos**: que quitar la imagen borrara de verdad filas y archivos, en vez de dejar
huérfanos en la base y en el volumen `storage_data`. Chocaba con el E2E
`Remove_image_clears_the_main_image_only`, cuyo `because` —*"la galería es un dato aparte: limpiar
la principal no borra archivos"*— es exactamente la premisa que la decisión del owner dio vuelta.

**El owner eligió estrechar T3 y no tocar el E2E.** `RemoveImage` limpia **solo** `Product.Image`
(código original intacto); la galería se queda. Lo único que aporta T3 es el comentario que explica
por qué no se borra, para que nadie la "arregle" después. Coste aceptado: filas y archivos huérfanos
siguen ahí, invisibles al catálogo, ocupando espacio en `storage_data`.

## Criterios de aceptación

1. Un producto con `Product.Image = null` y filas de galería activas devuelve `ImageUrl = null` e
   `ImageUrls` vacío en ambos endpoints públicos (lista y detalle). **No hay foto fantasma.**
2. Un producto con `Product.Image` devuelve `ImageUrl` y `ImageUrls` con esa misma clave.
3. `RemoveImage: true` deja `Product.Image` en null y **no toca la galería** ni el almacenamiento.
4. Sin `RemoveImage`, `Product.Image` no se modifica.
5. Subir la primera imagen por la galería fija `Product.Image`, así que aparece en la lista.
6. La galería comentada de `catalog-product-editor.tsx` sigue comentada, byte a byte.
7. Los E2E de la galería (`Product_detail_exposes_the_plain_text_description_and_the_gallery` y
   `Remove_image_clears_the_main_image_only`) siguen verdes **sin haberlos tocado**.

## Nota sobre T3 y el almacenamiento

`RemoveProductImageCommand.cs:39-64` mantiene la invariante completa (fila + archivo + `Product.Image`
si apuntaba a ese path) y es el camino de la galería. `UpdateProductCatalogFieldsCommand` ya **no**
depende de `ICatalogImageStorage`: "no borra archivos" está garantizado por el compilador, sin
necesidad de un mock que lo afirme.

## Comandos de verificación

```bash
cd backend
dotnet build src/SMCA.sln
dotnet test src/Application.Tests/Application.Tests.csproj --no-build
cd ../frontend-react
pnpm exec turbo run typecheck --force --filter=@store-mgmt/web-store-pos
pnpm exec turbo run lint --force --filter=@store-mgmt/web-store-pos
pnpm --filter @store-mgmt/web-store-pos exec vitest run app/catalog/routes/__tests__/public-catalog.test.tsx
```

`--force` en turbo es obligatorio: sin él devuelve `FULL TURBO` (replay de caché) y el exit 0 no
prueba ejecución. **E2E no se corre** (excluido por el owner).

## Ruta y disparadores de delegación

Ruta ODD: **directa delegada** (un escritor). Disparadores cumplidos: 4 archivos no triviales
(regla de escritura) y lectura previa que prepara la escritura (regla de preparación).

## Verificación observada (2026-10-01, corrida por el padre)

| Comando | Resultado |
| --- | --- |
| `dotnet build src/SMCA.sln` | `Build succeeded`, 0 errores (warnings CS/NU preexistentes) |
| `dotnet test src/Application.Tests/Application.Tests.csproj --no-build` | **550 passed (550), 0 fallos** |
| `turbo run typecheck --force --filter=@store-mgmt/web-store-pos` | 5 successful, 0 cached |
| `turbo run lint --force --filter=@store-mgmt/web-store-pos` | 4 successful, 0 cached |
| `vitest run app/catalog/routes/__tests__/public-catalog.test.tsx` | **11 passed (11)**, 0 fallos |

550 = 539 de base + 12 nuevos − 1 (la reescritura del test de T3 quitó el caso del borrado de
archivos y lo reemplazó por la garantía de que la galería nunca se toca).

**La corrida la hizo el padre, no el escritor.** El segundo escritor reportó `ok` con números
imposibles (151 tests, 4 vitest) y afirmó haber revertido T3 cuando el `git diff` mostraba T3 intacto
—`ICatalogImageStorage` seguía inyectado y `RemoveImage` seguía borrando la galería. El revert lo
hizo el padre a mano. **Verificación a futuro: un `git diff` posterior al reporte del escritor, no
solo su palabra.**

## Prueba de que el revert de T3 quedó completo

`git diff` sobre `UpdateProductCatalogFieldsCommand.cs` da **+6 líneas y ningún borrado**: la única
adición es el comentario. No quedaron campos, parámetros de constructor ni el `using` de Storage, y
la rama `RemoveImage` es la original.

## Pendiente reportado, no bloqueante

- **Higiene de datos**: los productos que YA quedaron huérfanos (`Product.Image` null con filas de
  galería activas, más archivos huérfanos en `storage_data`) siguen ahí, y los nuevos también. Se
  limpian con una migración de datos —que además necesita su script generado según el AGENTS.md de
  la raíz— o llamando a `RemoveProductImageCommand` por API. **No se hace aquí**: borra datos de
  usuario y no lo pidió.
- **E2E sin verificar**: el diseño los mantiene verdes por construcción (T2 fija `Product.Image` al
  subir la primera imagen, así que `ImageUrls` sigue con 1 entrada; y T3 quedó sin efecto, así que la
  galería sobrevive a `RemoveImage`). Pero la suite E2E no se ejecuta (excluida por el owner). Si el
  owner la corre y algo falla, se reporta.
- **Gap latente en sync**: `CatalogMirrorWriter.MirrorGalleriesAsync` nunca fija `Product.Image`, así
  que una galería que llegara por sync no publicaría imagen principal. Hoy es **teórico**: arranca con
  `if (incoming.Images == null) continue;` (línea 174) y el snapshot del POS nunca manda galería
  (`catalog-snapshot.ts`: *"la galería no viaja"*). Esa rama está muerta en la práctica.

## Siguiente paso

Ninguno: T1-T6 cerrados. Commiteado como unidad de trabajo
`fix(catalog): make Product.Image the single source for catalog images`.
