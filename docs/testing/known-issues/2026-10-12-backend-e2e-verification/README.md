# Corrida E2E backend — 2026-10-12

Punto de entrada de las fichas de esta corrida del **suite E2E del backend** (xUnit +
`WebAppFixture`, PostgreSQL real `smca_test`). Es un suite DISTINTO del Playwright del frontend:
el contrato de fichas es el mismo ([`../known-issues.md`](../../known-issues.md#contrato-de-una-ficha-de-test-fallido)),
pero las referencias son `*.cs` (clase:método:línea), no `*.spec.ts`.

## Contexto de la corrida

- Comando: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` (README raíz, sección 3).
- Resultado: **715 total → 709 passed / 6 failed**.
- Los 6 fallos son **deterministas** (se repiten igual en corridas sucesivas).
- **No son de ningún cambio de esta sesión**: los mismos 6 fallan en el commit base `f1cae8e5`
  (el `dev` tras el merge `dev ← test`), sin el feature de columnas móviles ni el arreglo del
  reset. Verificado con `git stash` + `git checkout f1cae8e5` + re-corrida del filtro de las 4 clases.
- **Los introdujo el merge `dev ← origin/test`** (los commits citados como causantes NO son
  ancestros de `eac38545`, el `dev` previo al merge).

## Causas raíz (3, compartidas entre los 6 tests)

| # | Causa | Tests que cubre |
| --- | --- | --- |
| 01 | Clave `CatalogImagePathTooLong` **duplicada** en el `.resx` con aridad distinta → `FormatException` al construir el validador → 500 | `WebCatalogImagesTests.Reorder_…`, `WebCatalogImagesTests.Delete_…` (y toda llamada a los endpoints de imágenes) |
| 02 | `CatalogMirrorWriter.MirrorGalleriesAsync` re-adjunta un `Product` ya trackeado en el mismo contexto → `InvalidOperationException` → 500 en `SyncCatalog` | `WebCatalogSyncTests.Null_gallery_…`, `WebCatalogSnapshotTests.Null_gallery_…`, `WebCatalogProductFieldsTests.Removing_the_main_image_…` |
| 03 | La nueva validación rechaza una clave de imagen que no es de la tienda → 400, pero el test envía una clave ficticia | `WebCatalogProductFieldsTests.Saving_the_fields_…` |

Detalle completo en las fichas `01-…`, `02-…` y `03-…`.

## Índice de fichas

| Ficha | Título corto | Estado |
| --- | --- | --- |
| [`01-catalogimagepathtoolong-resx-duplicado.md`](01-catalogimagepathtoolong-resx-duplicado.md) | Clave de recurso duplicada rompe los validadores de imágenes | 🔴 abierto |
| [`02-catalogmirrorwriter-producto-ya-trackeado.md`](02-catalogmirrorwriter-producto-ya-trackeado.md) | Sync de galerías adjunta un `Product` ya trackeado | 🔴 abierto |
| [`03-product-image-key-no-es-de-la-tienda.md`](03-product-image-key-no-es-de-la-tienda.md) | Validación nueva vs. fixture con clave de imagen ficticia | 🔴 abierto |

> Ninguna propuesta está aplicada. Editar tests E2E existentes o código de la aplicación requiere
> autorización explícita del usuario, ficha por ficha.
