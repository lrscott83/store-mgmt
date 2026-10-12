# 01. `WebCatalogImagesTests.cs:191` — una clave de recurso duplicada rompe los validadores de imágenes y devuelve 500

**Tests cubiertos por esta ficha (misma causa raíz):**
- `SMCA.WebApi.E2ETests.Catalog.WebCatalogImagesTests.Reorder_applies_the_given_order_and_rejects_a_foreign_list` (`WebCatalogImagesTests.cs:191`)
- `SMCA.WebApi.E2ETests.Catalog.WebCatalogImagesTests.Delete_removes_the_row_and_the_file` (`WebCatalogImagesTests.cs:163`)
- `SMCA.WebApi.E2ETests.Catalog.WebCatalogProductFieldsTests.Removing_the_main_image_from_the_gallery_leaves_no_dangling_pointer` (`WebCatalogProductFieldsTests.cs:295`, hace `DELETE /api/v1/catalog/products/{id}/images`)

## Qué prueban los tests

- **Reorder:** reordenar la galería de un producto con una lista válida responde 200 y aplica ese orden; una lista que no es una biyección de las imágenes actuales se rechaza (`Catalog/WebCatalogImagesTests.cs`).
- **Delete:** borrar una imagen de la galería responde 200, elimina la fila y su archivo (mismo archivo).
- **Removing:** borrar la imagen PRINCIPAL de la galería responde 200 y deja `Product.Image` en null (sin puntero colgado).

En negocio: la vista Catálogo Web debe poder ordenar y quitar fotos de un producto sin caerse.

## Qué falla (en simple)

Literal del error del test:

```
Expected reorder.StatusCode to be HttpStatusCode.OK {value: 200}, but found HttpStatusCode.InternalServerError {value: 500}.
```

(`Delete` ídem, `delete.StatusCode … found InternalServerError`.)

El backend registra el 500 real:

```
[ERR] Unhandled exception: System.FormatException: Index (zero based) must be greater than or equal to zero and less than the size of the argument list.
   at Microsoft.Extensions.Localization.ResourceManagerStringLocalizer.get_Item(String name, Object[] arguments)
   at Application.Features.WebCatalog.Images.Commands.ReorderProductImages.ReorderProductImagesCommandValidator..ctor(IStringLocalizer`1 localizer) in …\ReorderProductImagesCommandValidator.cs:line 27
```

## Evidencia

- Corrida completa `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj`: **709 passed / 6 failed**; estos 2 entre los fallidos, con el 500 arriba.
- Reproducible sin ningún cambio de la sesión: los mismos fallos en el commit base `f1cae8e5`.
- La excepción sale de un `.ctor` de validador de FluentValidation: la construcción del validador la dispara el contenedor de DI (`ServiceProvider.GetRequiredService`), así que **cualquier** petición a esos endpoints revienta antes de llegar al handler.

## Causa raíz — CONFIRMADA

1. `backend/src/Resources/Localization/I18n.resx` define **dos veces** la clave `CatalogImagePathTooLong`:
   - línea **288**: `<value>{0} no puede superar los {1} caracteres</value>` (2 argumentos)
   - línea **345**: `<value>La ruta de la imagen no puede superar los {0} caracteres</value>` (1 argumento)
   `I18n.en.resx` también la tiene duplicada.
2. Los validadores nuevos pasan **un solo** argumento:
   - `ReorderProductImagesCommandValidator.cs:29` → `localizer["CatalogImagePathTooLong", ProductEntityLimits.ImagePathMaxLength]`
   - `RemoveProductImageCommandValidator.cs:24` → ídem
3. El proveedor resuelve la variante de **2** placeholders mientras el llamado aporta **1** → `string.Format` lanza `FormatException` **al construir el validador**.

Corroboración de cuál es la aridad canónica: `UpdateProductCatalogFieldsCommandValidator.cs:36`
usa la MISMA clave **con dos** argumentos (`"{PropertyName}", ProductEntityLimits.ImagePathMaxLength`)
y funciona; por eso el valor que resuelve el proveedor es el de 2 placeholders y son los validadores
NUEVOS de imágenes los que lo llaman mal (1 argumento).

Cambio que lo introdujo: la clave con 2 argumentos es **pre-existente** (commit `1321e84d`, ancestro
del `dev` previo al merge), pero los validadores que la llaman con 1 argumento llegaron con el merge
`dev ← origin/test`: `f649a6f8 feat(catalog): validate shape of product image commands R5-R7`
(**no** es ancestro de `eac38545`). Antes del merge esos comandos no tenían validador, así que la
clave duplicada estaba latente.

Hipótesis descartada: no es un problema del test ni de la BD; el 500 ocurre en el arranque del
pipeline de validación, antes de tocar el handler o el repositorio.

## Clasificación

**Defecto de la aplicación** (recurso duplicado en `.resx`), expuesto por los validadores nuevos.

## Propuesta de solución — NO APLICADA

Alinear los llamados NUEVOS con la clave canónica y limpiar el `.resx`. Los dos pasos:

1. **Validadores de imágenes** — pasar los MISMOS dos argumentos que el validador de campos
   (`UpdateProductCatalogFieldsCommandValidator.cs:36`), es decir
   `localizer["CatalogImagePathTooLong", "{PropertyName}", ProductEntityLimits.ImagePathMaxLength]`,
   en:
   - `ReorderProductImagesCommandValidator.cs:25` (hoy pasa 1)
   - `RemoveProductImageCommandValidator.cs:24` (hoy pasa 1)
2. **`.resx`** — borrar la entrada DUPLICADA de 1 argumento (`I18n.resx:345` y `I18n.en.resx`),
   de modo que quede una sola `CatalogImagePathTooLong` con la aridad correcta (2 placeholders).

Verificación sugerida: `dotnet build src/SMCA.sln` (0 errores), `dotnet test Application.Tests`, y
re-correr `WebCatalogImagesTests` + el `DELETE` de `WebCatalogProductFieldsTests` (deben pasar).
Sin prueba de mutación no se declara verde.

## Aplicación y verificación

No aplicada (pendiente de autorización 1 a 1).

## Estado final

🔴 **Abierto** — 2026-10-12.
