# Corrida E2E backend — 2026-10-12

Punto de entrada de las fichas de esta corrida del **suite E2E del backend** (xUnit +
`WebAppFixture`, PostgreSQL real `smca_test`). Es un suite DISTINTO del Playwright del frontend:
el contrato de fichas es el mismo ([`../known-issues.md`](../../known-issues.md#contrato-de-una-ficha-de-test-fallido)),
pero las referencias son `*.cs` (clase:método:línea), no `*.spec.ts`.

## Contexto de la corrida

- Comando: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` (README raíz, sección 3).
- **Estado actual (tras mergear `test` y `qa`, HEAD `dd9327fa`): `719 total → 716 passed / 3 failed`.**
- Corrida inicial (base `f1cae8e5`): **715 total → 709 passed / 6 failed**. Los 6 eran deterministas y
  pre-existentes (fallaban igual sin ningún cambio propio); los introdujo el merge `dev ← test`
  (los commits causantes no son ancestros de `eac38545`).

## Causas raíz

| # | Causa | Estado actual |
| --- | --- | --- |
| 01 | Clave `CatalogImagePathTooLong` **duplicada** en el `.resx` con aridad distinta → `FormatException` al construir el validador → 500 | ✅ **RESUELTA** — ver "Fichas retiradas" |
| 02 | `CatalogMirrorWriter.MirrorGalleriesAsync` re-adjunta un `Product` ya trackeado → `InvalidOperationException` → 500 en `SyncCatalog` | 🔴 abierto — [`02-catalogmirrorwriter-producto-ya-trackeado.md`](02-catalogmirrorwriter-producto-ya-trackeado.md) |
| 03 | La validación rechaza una clave de imagen que no es de la tienda → 400, y el test envía una clave ficticia | 🔴 abierto — [`03-product-image-key-no-es-de-la-tienda.md`](03-product-image-key-no-es-de-la-tienda.md) |

## Registro paralelo (mismo hallazgo, documentado aparte)

El trabajo del branch `test` ya había registrado estos mismos fallos en
[`../../plans/2026-10-11-api-endpoint-review-catalogo-pedidos.md`](../../plans/2026-10-11-api-endpoint-review-catalogo-pedidos.md),
sección "Problemas de errores en los tests E2E". Correspondencia:

| Este folder | Registro del plan | Estado allá |
| --- | --- | --- |
| causa 01 | `C1-E2E-1` | `[x]` ARREGLADO (`f551b031`) |
| causa 02 | `C1-E2E-2` | `[ ]` abierto |
| causa 03 | `C1-E2E-3` | `[ ]` abierto |

## Fichas vivas

| Ficha | Título corto | Estado |
| --- | --- | --- |
| [`02-catalogmirrorwriter-producto-ya-trackeado.md`](02-catalogmirrorwriter-producto-ya-trackeado.md) | Sync de galerías adjunta un `Product` ya trackeado | 🔴 abierto |
| [`03-product-image-key-no-es-de-la-tienda.md`](03-product-image-key-no-es-de-la-tienda.md) | Validación nueva vs. fixture con clave de imagen ficticia | 🔴 abierto |

## Registro de fichas retiradas

### Causa 01 — clave `CatalogImagePathTooLong` duplicada (retirada 2026-10-12)

- **Qué era:** los validadores NUEVOS de imágenes (`ReorderProductImagesCommandValidator.cs:25`,
  `RemoveProductImageCommandValidator.cs:24`) llamaban a `CatalogImagePathTooLong` con **1** argumento
  mientras la clave resuelta esperaba **2** (la usa bien `UpdateProductCatalogFieldsCommandValidator.cs:36`)
  → `FormatException` del localizador al construir el validador → **500** en reorder/delete de imagen.
  Además la clave estaba **duplicada** en `I18n.resx` (`:288` 2 placeholders, `:345` 1) y en `I18n.en.resx`.
- **Causa raíz:** confirmada (aridad de recurso) — introducida por los validadores del merge,
  `f649a6f8`.
- **Arreglo:** `f551b031 fix(catalog): pass the two message args CatalogImagePathTooLong requires`
  (llegó al mergear `test`): los 2 validadores pasan 2 args y la entrada duplicada del `.resx` se eliminó.
  Verificado en HEAD `dd9327fa`: la clave está **única** en ambos `.resx`.
- **Verificación (exit code preservado):** `dotnet test …E2ETests` → **719 total / 716 passed / 3 failed**;
  los 3 tests que cubría (`WebCatalogImagesTests.Reorder_…`, `WebCatalogImagesTests.Delete_…`,
  `WebCatalogProductFieldsTests.Removing_the_main_image_…`) pasaron. Los 3 fallos restantes son las
  causas 02 y 03, ajenas a este fix.
- **Ficha:** retirada (era `01-catalogimagepathtoolong-resx-duplicado.md`).

> Ninguna propuesta de las fichas vivas está aplicada. Editar tests E2E existentes o código de la
> aplicación requiere autorización explícita del usuario, ficha por ficha.
