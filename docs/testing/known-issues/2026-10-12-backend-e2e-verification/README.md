# Corrida E2E backend — 2026-10-12

Punto de entrada de las fichas de esta corrida del **suite E2E del backend** (xUnit +
`WebAppFixture`, PostgreSQL real `smca_test`). Es un suite DISTINTO del Playwright del frontend:
el contrato de fichas es el mismo ([`../known-issues.md`](../../known-issues.md#contrato-de-una-ficha-de-test-fallido)),
pero las referencias son `*.cs` (clase:método:línea), no `*.spec.ts`.

## Contexto de la corrida

- Comando: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` (README raíz, sección 3).
- Corrida inicial (base `f1cae8e5`): **715 total → 709 passed / 6 failed**. Los 6 eran deterministas
  y **pre-existentes**: fallaban igual sin ningún cambio propio de la sesión, y los introdujo el merge
  `dev ← test` (los commits causantes `f649a6f8`, `0d28fa97`, `9bcc1e7a` no son ancestros de `eac38545`).
- Tras mergear `test` y `qa` (HEAD `dd9327fa`): **719 total → 716 passed / 3 failed** (la causa 01 la
  resolvió `f551b031`, que llegó con `test`; aparecieron 4 E2E nuevos, todos verdes).
- **Tras los arreglos de las causas 02 y 03 (HEAD `d6bf0de9`): 719 total → 719 passed / 0 failed.**

## Causas raíz (las 3, RESUELTAS)

| # | Causa | Arreglo |
| --- | --- | --- |
| 01 | Clave `CatalogImagePathTooLong` duplicada en el `.resx` con aridad distinta → `FormatException` al construir el validador → 500 | `f551b031` (llegó con `test`) |
| 02 | `CatalogMirrorWriter.MirrorGalleriesAsync` re-leía los productos y adjuntaba una instancia ya trackeada → `InvalidOperationException` → 500 en `SyncCatalog` | `d6bf0de9` |
| 03 | El E2E de campos enviaba la clave de imagen ficticia `"k/main.jpg"` → `BelongsToStore` la rechazaba con 400 | `d6bf0de9` |

## Registro paralelo (mismo hallazgo, documentado aparte)

El trabajo del branch `test` los había registrado en
[`../../plans/2026-10-11-api-endpoint-review-catalogo-pedidos.md`](../../plans/2026-10-11-api-endpoint-review-catalogo-pedidos.md),
sección "Problemas de errores en los tests E2E":

| Este folder | Registro del plan | Estado allá |
| --- | --- | --- |
| causa 01 | `C1-E2E-1` | `[x]` ARREGLADO (`f551b031`) |
| causa 02 | `C1-E2E-2` | `[x]` ARREGLADO (`d6bf0de9`) |
| causa 03 | `C1-E2E-3` | `[x]` ARREGLADO (`d6bf0de9`) |

## Fichas vivas

Ninguna — las tres causas quedaron resueltas y sus fichas retiradas (ver abajo).

## Registro de fichas retiradas

### Causa 01 — clave `CatalogImagePathTooLong` duplicada (retirada 2026-10-12)

- **Qué era:** los validadores NUEVOS de imágenes (`ReorderProductImagesCommandValidator.cs:25`,
  `RemoveProductImageCommandValidator.cs:24`) llamaban a `CatalogImagePathTooLong` con **1** argumento
  mientras la clave resuelta esperaba **2** (la usa bien `UpdateProductCatalogFieldsCommandValidator.cs:36`)
  → `FormatException` del localizador al construir el validador → **500** en reorder/delete de imagen.
  La clave estaba **duplicada** en `I18n.resx` (`:288` 2 placeholders, `:345` 1) y en `I18n.en.resx`.
- **Causa raíz:** confirmada (aridad de recurso); introducida por los validadores del merge `f649a6f8`.
- **Arreglo:** `f551b031 fix(catalog): pass the two message args CatalogImagePathTooLong requires` —
  los 2 validadores pasan 2 args y la entrada duplicada del `.resx` se eliminó. Verificado: la clave
  quedó única en ambos `.resx`.
- **Tests que cubría:** `WebCatalogImagesTests.Reorder_…`, `WebCatalogImagesTests.Delete_…`,
  `WebCatalogProductFieldsTests.Removing_the_main_image_…` (los 3 verdes en la corrida 719/0).

### Causa 02 — tracking EF en el espejo de galerías (retirada 2026-10-12)

- **Qué era:** `CatalogMirrorWriter.MirrorGalleriesAsync` re-leía los productos
  (`GetProductsForCatalogSyncAsync`, `NoTracking`) y luego hacía `productRepository.UpdateAsync(product)`
  (`CatalogMirrorWriter.cs:204`) sobre una instancia con la MISMA clave que otra ya trackeada por la
  fase 1 → `InvalidOperationException` ("another instance with the same key value is already being
  tracked") → **500** en `SyncCatalog`.
- **Causa raíz:** confirmada; introducida por `0d28fa97` (merge `dev ← test`).
- **Arreglo (`d6bf0de9`):** `MirrorCatalogAsync` devuelve en `CatalogMirrorResult` los productos que
  cargó/creó y `MirrorGalleriesAsync` los **reusa** en vez de re-leerlos — el MISMO patrón que ya usaba
  la fase 1 para las categorías. Se evita el segundo attach.
- **Tests que cubría:** `WebCatalogSyncTests.Null_gallery_…`, `WebCatalogSnapshotTests.Null_gallery_…`.

### Causa 03 — fixture con clave de imagen ficticia (retirada 2026-10-12)

- **Qué era:** `WebCatalogProductFieldsTests.Saving_the_fields_exposes_them_in_the_catalog_view`
  enviaba `Image: "k/main.jpg"`; la validación nueva (`UpdateProductCatalogFieldsCommand.cs:135`) exige
  que la clave pertenezca a la tienda (`BelongsToStore`) → **400** `CatalogImageNotFound`. La app era
  correcta; el test quedó desalineado.
- **Causa raíz:** confirmada; la validación la introdujo `9bcc1e7a` (merge `dev ← test`).
- **Arreglo (`d6bf0de9`):** el test **sube una imagen real** por `POST /api/v1/catalog/products/{id}/images`
  y usa la clave que devuelve el endpoint.
- **Prueba de mutación:** revertida la clave a `"k/main.jpg"`, el test **cae** en la misma aserción
  tocada (`Expected response.StatusCode … 200, but found 400`); con el arreglo, verde.
- **Test que cubría:** `WebCatalogProductFieldsTests.Saving_the_fields_…`.

> Estado final de la corrida: **719/719 verde** en `d6bf0de9`. No quedan fichas vivas.
