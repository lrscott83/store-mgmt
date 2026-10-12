# 02. `WebCatalogSyncTests.cs:195` — el sync de galerías adjunta un `Product` que el contexto ya trackea y devuelve 500

**Tests cubiertos por esta ficha (misma causa raíz):**
- `SMCA.WebApi.E2ETests.Catalog.WebCatalogSyncTests.Null_gallery_leaves_the_photos_alone_and_an_empty_list_clears_them` (`WebCatalogSyncTests.cs:195/210`; el helper `ReadSummaryAsync` revienta en `:39`)
- `SMCA.WebApi.E2ETests.Catalog.WebCatalogSnapshotTests.Null_gallery_leaves_the_photos_alone_and_an_empty_list_clears_them` (`WebCatalogSnapshotTests.cs:221/236`; helper en `:46`)

## Qué prueban los tests

Sincronizar el catálogo desde el POS con la galería en `null` **debe dejar las fotos intactas**
(el POS no conoce la galería: sus fotos se suben desde la vista Catálogo Web), y sincronizar con la
galería como **lista vacía** debe limpiarlas. En negocio: re-sincronizar el catálogo no puede borrar
fotos por accidente ni romperse al querer limpiarlas.

## Qué falla (en simple)

Literal del test:

```
Expected response.StatusCode to be HttpStatusCode.OK {value: 200}, but found HttpStatusCode.InternalServerError {value: 500}.
```

El backend registra:

```
[ERR] Unhandled exception: System.InvalidOperationException: The instance of entity type 'Product' cannot be tracked because another instance with the same key value for {'Id'} is already being tracked. …
   at Infrastructure.Persistence.Repositories.GenericRepository`1.UpdateAsync(TEntity entity) in …\GenericRepository.cs:line 31
   at Application.Features.WebCatalog.Sync.CatalogMirrorWriter.MirrorGalleriesAsync(…) in …\CatalogMirrorWriter.cs:line 204
   at Application.Features.WebCatalog.Sync.Commands.SyncCatalog.SyncCatalogCommandHandler.Handle(…) in …\SyncCatalogCommand.cs:line 140
   at SMCA.WebApi.Controllers.v1.CatalogController.SyncCatalogAsync(SyncCatalogCommand request) in …\CatalogController.cs:line 37
```

## Evidencia

- Corrida completa: **709 passed / 6 failed**; estos 2 con el 500 de arriba.
- Reproducible en el commit base `f1cae8e5`, sin cambios de la sesión.
- **Confirmado abierto tras mergear `test` y `qa` (HEAD `dd9327fa`, 2026-10-12): **719 total → 716 passed /
  3 failed** — estos 2 siguen entre los 3 rojos (el fix `f551b031` de la causa 01 no los toca, y `qa` no
  cambió el sync de galerías).
- La ruta del fallo es exactamente la rama que limpia la imagen principal cuando la galería deja de
  contenerla (`CatalogMirrorWriter.cs:201-205`): pasa cuando la lista llega **vacía** (o sin la
  principal), no cuando la galería es `null` (esa rama hace `continue`).

## Causa raíz — CONFIRMADA (mecanismo preciso)

1. `GenericRepository.UpdateAsync` (`GenericRepository.cs:31`) hace `Entry(entity).State = Modified`,
   que **adjunta** la instancia al `DbContext`.
2. `ApplicationDbContext` es `NoTracking` por defecto (`ApplicationDbContext.cs:53`), así que cada
   consulta devuelve **instancias nuevas**. `MirrorGalleriesAsync` recarga los productos con
   `productRepository.GetProductsForCatalogSyncAsync(storeId)` (`CatalogMirrorWriter.cs:173`;
   `ProductRepository.cs:67-76`) — otra instancia con el **mismo `Id`**.
3. Si el mismo `Product` ya quedó trackeado en este contexto (fase previa del sync), adjuntar la
   instancia nueva por su `Id` lanza el `InvalidOperationException`.
4. Línea concreta: `CatalogMirrorWriter.cs:204` (`await productRepository.UpdateAsync(product)`).

Cambio que la introdujo: `0d28fa97 fix(catalog): sync clears Product.Image when its gallery row is
removed` — llegó con el merge `dev ← origin/test` (**no** es ancestro de `eac38545`).

Hipótesis descartada: no es el reset de la BD ni un test defectuoso; el 500 nace dentro del handler
de `SyncCatalog`, en la escritura.

## Clasificación

**Defecto de la aplicación** (conflicto de tracking EF en el sync de galerías).

## Propuesta de solución — NO APLICADA

Evitar adjuntar una segunda instancia con el mismo `Id`. Opciones (elegir una, no las dos):
- **Preferida:** que `GetProductsForCatalogSyncAsync` use `.AsNoTracking()` explícito y que el sync
  marque el producto como `Modified` solo si **no** está ya trackeado (o que lea la instancia ya
  trackeada desde `ChangeTracker`), o
- reemplazar el `UpdateAsync` de esa rama por un `ExecuteUpdateAsync`/`Update` acotado (solo la
  columna `Image`), que no depende del grafo de tracking y sigue el patrón ya usado en el repo para
  la trampa del `NoTracking`.

Verificación sugerida: `dotnet test Application.Tests` y re-correr `WebCatalogSyncTests` +
`WebCatalogSnapshotTests` (deben pasar). Sin prueba de mutación no se declara verde.

## Aplicación y verificación

No aplicada (pendiente de autorización 1 a 1).

## Estado final

🔴 **Abierto** — 2026-10-12.
