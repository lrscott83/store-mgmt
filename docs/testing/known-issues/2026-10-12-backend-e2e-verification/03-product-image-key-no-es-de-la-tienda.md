# 03. `WebCatalogProductFieldsTests.cs:74` — el test guarda una clave de imagen ficticia y la validación nueva la rechaza (400)

**Test cubierto:** `SMCA.WebApi.E2ETests.Catalog.WebCatalogProductFieldsTests.Saving_the_fields_exposes_them_in_the_catalog_view` (`WebCatalogProductFieldsTests.cs:74`).

## Qué prueba el test

Guardar los campos de catálogo de un producto (descripción, `%` de descuento, monto rebajado, `IsNew`
e imagen) responde 200 y esos campos quedan visibles en la vista del catálogo. En negocio: el dueño
edita un producto en la vista Catálogo Web y lo que guarda es lo que se publica.

## Qué falla (en simple)

Literal del test:

```
Expected response.StatusCode to be HttpStatusCode.OK {value: 200}, but found HttpStatusCode.BadRequest {value: 400}.
```

El backend registra un rechazo de validación (`Request rejected: One or more validation failures have
occurred.`), es decir, un 400 de negocio, no una caída.

## Evidencia

- Corrida completa: **709 passed / 6 failed**; este con el 400 de arriba.
- Reproducible en el commit base `f1cae8e5`, sin cambios de la sesión.
- **Confirmado abierto tras mergear `test` y `qa` (HEAD `dd9327fa`, 2026-10-12): 719 total → 716 passed /
  3 failed** — sigue rojo. `qa` endureció `BelongsToStore` (anti-traversal) pero la regla base (prefijo
  `{tenant}/{store}/`) es la misma, así que `"k/main.jpg"` sigue siendo rechazada.
- El cuerpo que envía el test (`WebCatalogProductFieldsTests.cs:72-74`):
  `new CatalogFieldsBody(Description: "Camisa de algodón\nSegunda línea", PercentDiscountPrice: 1250, DiscountPrice: 500, IsNew: true, Image: "k/main.jpg")`.

## Causa raíz — CONFIRMADA

El handler valida que la clave de imagen principal **pertenezca a la tienda del contexto**:

```csharp
// UpdateProductCatalogFieldsCommand.cs:135-136
if (!_catalogImageStorage.BelongsToStore(request.Image, tenantId, storeId))
    throw new ApiException(_localizer["CatalogImageNotFound"], HttpStatusCode.BadRequest);
```

`BelongsToStore` exige el prefijo `{tenantId}/{storeId}/` (`ICatalogImageStorage`). El test envía
`"k/main.jpg"`, una clave **inventada** que no cumple ese prefijo → 400 `CatalogImageNotFound`.

Cambio que lo introdujo: `9bcc1e7a fix(catalog): reject a main-image key that is not the store's`,
llegado con el merge `dev ← origin/test` (**no** es ancestro de `eac38545`). La validación es
correcta en sí (endurecimiento de seguridad); el test quedó desalineado con ella.

Hipótesis descartada: no es el estado de la BD ni un fallo del handler; es un rechazo deliberado con
400 por una clave que el test nunca sembró como real.

## Clasificación

**Defecto del test** (fixture): el test usa una clave ficticia para un campo que ahora se valida
contra el almacenamiento real. La app hace lo correcto al rechazarla.

## Propuesta de solución — NO APLICADA

Que el fixture del test **siembre una imagen real** de la tienda (subir una imagen vía el endpoint de
imágenes del producto, o sembrar la fila/archivo con una clave `{tenantId}/{storeId}/…`) y use esa
clave en `Image:` en lugar de `"k/main.jpg"`. Así se prueba el guardado con una imagen que sí
pertenece a la tienda. No tocar la validación del comando.

Verificación sugerida: re-correr `WebCatalogProductFieldsTests` — debe pasar; **prueba de mutación**:
volver la clave a `"k/main.jpg"` y comprobar que el test vuelve a caer con el 400 (sin eso no se
distingue un fix real de un falso verde).

## Aplicación y verificación

No aplicada (pendiente de autorización 1 a 1).

## Estado final

🔴 **Abierto** — 2026-10-12.
