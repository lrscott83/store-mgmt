# SuperAdmin: limpieza de imágenes huérfanas del catálogo web

> **Estado:** plan. **No implementado.** Nada de este documento se ha escrito en código.
> **Fecha:** 2026-10-02 · **Origen:** decisión del owner tras el commit `cd4c6246`
> (`Product.Image` como única fuente de imagen).

## Objetivo

Una vista **Catálogos Web** en el panel del SuperAdmin que:

1. liste las tiendas que tienen catálogo web,
2. muestre, al lado de cada una, **cuántas imágenes se pueden borrar**,
3. ofrezca un botón solo cuando haya algo que borrar, que ejecute la limpieza contra la API,
4. pida confirmación explícita con un **checkbox** que declara el alcance de la eliminación.

Hoy esa limpieza **no existe**: ningún E2E ni endpoint la expone, y los huérfanos se acumulan en el
volumen `storage_data` sin que nadie los mida.

## Qué es una imagen «borrable»

Después de `cd4c6246` la fuente única es `Product.Image`. Entonces una fila `ProductImage` es
**borrable si su `Path` no es igual al `Image` de su producto**. Tres casos:

| Caso | `Product.Image` | Fila de galería | ¿Borrable? |
| --- | --- | --- | --- |
| A | `null` | `k/1.jpg` | **Sí** — y todas las de ese producto |
| B | `k/main.jpg` | `k/otra.jpg` | **Sí** — sobra respecto de la principal |
| C | `k/main.jpg` | `k/main.jpg` | **NO** — es la principal por duplicado |

> **El caso C es la trampa.** Desde `cd4c6246`, `AddProductImageCommand` fija `Product.Image` **y**
> crea la fila `ProductImage` cuando la imagen es la primera del producto. Las dos cosas apuntan al
> mismo archivo. Una limpieza que borre «la galería del producto» sin comparar contra
> `Product.Image` **borraría el archivo de la imagen principal** y dejaría al producto con un
> enlace roto en producción.
>
> Por eso la condición es siempre una comparación explícita por producto
> (`ProductImage.Path <> Product.Image`), nunca un borrado ciego por colección.

El caso C es además la razón por la que el E2E
`WebCatalogPublicApiTests.Product_detail_exposes_the_plain_text_description_and_the_gallery` sigue
verde: tras subir una imagen hay fila **e** `Product.Image` apuntando al mismo archivo.

### Archivos sin fila

Un archivo huérfano **no tiene fila**: existe en `storage/catalog/{tenantId}/{storeId}/…` y nada en
la base lo referencia (subida interrumpida, borrado manual, un `RemoveImage` antiguo). Esiori la
definición del owner —«todo lo que no esté en `Product.Image`»— también lo cubre, pero **no se puede
enumerar desde la base**: requiere recorrer el sistema de archivos.

**Decisión abierta O-1.** ¿La purga incluye archivos sin fila?
- **No (recomendado al principio):** solo filas. Es una operación SQL + `File.Delete` acotada y
  auditable. Los archivos sueltos se resuelven con un barrido de disco aparte, que es otra
  herramienta.
- **Sí:** la purga recorre `{CatalogImageRoot}/{tenantId}/{storeId}/` y borra lo que no esté en
  `Product.Image` **ni** en ninguna fila. Es estrictamente más completa y estrictamente más
  peligrosa: un archivo subido hace un segundo y aún sin fila se perdería.

## El hallazgo que condiciona el diseño

El owner pidió «hacer el llamado a ese command vía API», es decir
`RemoveProductImageCommand`. Ese command **no puede servir esta vista tal como está**:

```
DELETE /api/v1/catalog/products/{productId}/images?path=…
[HasPermission(StoreRoleFeatures.WebCatalogAdmin)]   ← CatalogController.cs:22
```

Tres bloqueos, los tres verificables:

1. **Está atado a la tienda seleccionada.** `HasPermission` se resuelve contra el store del
   `HttpContext`, y `RemoveProductImageCommandHandler` no recibe `IHttpContextService`. Un SuperAdmin
   que recorra 40 tiendas no puede invocarlo para la tienda #17 sin seleccionarla antes.
2. **Es de a una.** Un `path` por llamada. Un catálogo con 300 huérfanos son 300 requests, 300
   transacciones, 300 oportunidades de fallo parcial.
3. **No hay endpoint para contar.** No existe forma de saber cuántos huérfanos hay sin enumerarlos.

### Las dos salidas

| Opción | Cómo | Coste |
| --- | --- | --- |
| **A — endpoint nuevo de purga (recomendada)** | `POST /api/v1/admin/web-catalog/stores/{storeId}/purge-images`, transaccional, devuelve `{rowsDeleted, filesDeleted}`. El frontend **no** llama al command por imagen. | Backend nuevo que revisar |
| **B — el frontend lo arma** | El SuperAdmin selecciona cada tienda y el frontend itera el endpoint actual. Respeta «llamar a ese command» al pie de la letra. | N×M requests, necesita impersonación por tienda, y un fallo a mitad deja la tienda a medias sin reporte |

**Se recomienda A.** El command por imagen se conserva intacto para la vista Catálogo Web del
owner; la purga cross-store es un caso distinto y necesita su propio endpoint, su propia
autorización (SuperAdmin, no `WebCatalogAdmin`) y su propio reporte.

Con A, la invariante de `RemoveProductImageCommand.cs:39-64` se replica dentro del handler nuevo:
**las filas van en la transacción y los archivos se borran solo si `SaveChangesAsync` devolvió
éxito — nunca al revés.** Un fallo de base no puede dejar archivos borrados con filas vivas.

## Decisiones del owner ya tomadas

| Decisión | Respuesta |
| --- | --- |
| Dónde | Vista Catálogos Web del **SuperAdmin** |
| Qué lista | Tiendas **con** catálogo web |
| Qué muestra | Contador de imágenes borrables, al lado de cada tienda |
| Botón | Solo cuando el contador es > 0 |
| Confirmación | Alerta antes de ejecutar |
| Alcance | Todo lo que no esté en `Product.Image` |

## Decisiones abiertas

| # | Pregunta | Recomendación |
| --- | --- | --- |
| **O-1** | ¿La purga incluye archivos sin fila? | No, solo filas. El barrido de disco es otra tarea |
| **O-2** | ¿El checkbox cambia el alcance o solo es un segundo consentimiento? | **Solo consentimiento.** El botón abre un diálogo con el conteo exacto; la casilla debe marcarse para habilitar el botón destructivo. Marcada por defecto: **desmarcada** |
| **O-3** | ¿Alcance por tienda o global? | Por tienda. Un botón global multiplica el radio de impacto, y el SuperAdmin puede querer limpiar tienda por tienda |
| **O-4** | ¿Qué pasa con filas `IsActive = false`? | Borrarlas también (son basura pura, sin archivo). El reporte cuenta activas e inactivas por separado para que el número mostrado sea el que importa |
| **O-5** | ¿Bloqueo por tienda mientras purga? | Sí, esa fila queda deshabilitada hasta que termine, como `busyProductId` en la vista Catálogo Web |

> **O-2 es la única con riesgo de malentendido.** La lectura literal de «un checkbox para limpiar
> todo lo que no esté en `Product.Image`» es que la casilla *selecciona el alcance*. La lectura
> defensiva es que la casilla es un **segundo consentimiento** y el alcance es siempre el mismo.
> La segunda es la recomendada: con la primera, marcar la casilla ampliaría el daño en lugar de
> autorizarlo, que es el orden invertido.

## Alcance

### Backend — nuevo

- `Application/Features/WebCatalog/Admin/Queries/GetCatalogOrphanImageReport/GetCatalogOrphanImageReportQuery.cs`
  — por tienda con `CatalogSlug IS NOT NULL`: `storeId`, `storeName`, `catalogSlug`, `activeOrphans`,
  `inactiveOrphans`. Un `LEFT JOIN` con la condición `pi."Path" <> p."Image"`; **sin** enumerar
  archivos.
- `Application/Features/WebCatalog/Admin/Commands/PurgeStoreOrphanImages/PurgeStoreOrphanImagesCommand.cs`
  — borra filas y archivos de **una** tienda, con la invariante filas→guardar→archivos.
- `SMCA.WebApi/Controllers/v1/AdminWebCatalogController.cs` — dos endpoints, autorizados por rol
  **SuperAdmin** (no por `WebCatalogAdmin`, que es del owner de tienda).
- Repositorio: los métodos de conteo y de purga sobre `ProductImage` (el `GetByProductIdAsync`
  actual sirve por producto; para el reporte hace falta uno por tienda).

**No hace falta migración.** No hay cambio de esquema: se leen y se borran filas existentes.

### Frontend — nuevo

- `app/admin/web-catalog/routes/web-catalog-admin.tsx` — la vista.
- `app/admin/web-catalog/components/store-orphan-row.tsx` — tienda + contador + botón.
- `app/admin/web-catalog/components/purge-confirm-dialog.tsx` — confirmación + checkbox.
- `app/admin/web-catalog/lib/services/web-catalog-admin-http-service.ts` — los dos endpoints.
- `app/routes.ts` — registrar la ruta.
- `app/shared/lib/config/menu-config.ts` — entrada de navegación (junto a `/admin/stores`).
- `app/shared/lib/i18n/es.ts` — textos.

### Fuera de alcance

- **Angular `frontend/`**: congelado. No se lee, no se toca.
- **La vista Catálogo Web del owner** (`/sales/web-catalog`): no cambia. Su galería sigue
  comentada.
- **`RemoveProductImageCommand`**: no se modifica. La purga es un camino nuevo.
- **Migración de datos**: esto es una herramienta, no un barrido inicial. Corre cuando el owner la
  abra.
- **E2E existentes**: intocables. Si esta feature los pone en rojo, se reporta antes de tocar nada.

## La vista

```
Catálogos Web                                    [Limpiar todo]   ← opcional, ver O-3

┌────────────────────────────────────────────────────────────────────────┐
│ Tienda          │ Catálogo        │ Imágenes borrables │ Acción        │
├────────────────────────────────────────────────────────────────────────┤
│ Ferretería Sur  │ ferreteria-sur  │  12                │ [ Limpiar ]   │
│ Museo Ojeda     │ museo-ojeda     │  0                 │ —             │
│ Kiosco Norte    │ kiosco-norte    │  3                 │ [ Limpiar ]   │
└────────────────────────────────────────────────────────────────────────┘
```

- Solo tiendas con `CatalogSlug IS NOT NULL` (las que nunca sincronizaron no aparecen).
- El botón **solo aparece** con contador > 0. Con 0, la celda muestra «—».
- Al pulsar: diálogo con el nombre de la tienda, el **número exacto**, la advertencia de que es
  irreversible (`File.Delete`, sin papelera) y el checkbox.

```
┌──────────────────────────────────────────────────┐
│ Limpiar imágenes de «Ferretería Sur»             │
│                                                  │
│ Se eliminarán 12 imágenes que no son la imagen   │
│ principal de su producto.                        │
│                                                  │
│ La operación es irreversible: los archivos no    │
│ van a una papelera.                               │
│                                                  │
│ [ ] Entiendo y quiero borrar todo lo que no      │
│     esté en Product.Image                         │
│                                                  │
│        [ Cancelar ]   [ Borrar 12 imágenes ]      │
└──────────────────────────────────────────────────┘
```

El botón destructivo arranca **deshabilitado** y solo se habilita con la casilla marcada. Ese es el
sentido de O-2.

## Tareas

- [ ] **B1** — Método de conteo en `ProductImageRepository`: filas de una tienda cuya `Path` difiere
  del `Image` de su producto, separadas en activas e inactivas.
- [ ] **B2** — `GetCatalogOrphanImageReportQuery` + endpoint de lectura.
- [ ] **B3** — `PurgeStoreOrphanImagesCommand`: una tienda, filas en la transacción, archivos
  **después** del `SaveChangesAsync` exitoso. Devuelve `{ rowsDeleted, filesDeleted }`.
- [ ] **B4** — `AdminWebCatalogController` con los dos endpoints y autorización **SuperAdmin**.
- [ ] **B5** — Tests unitarios de B1-B4, incluyendo el caso C: la fila cuyo `Path` **iguala** al
  `Image` del producto **no** se borra y su archivo **no** se toca.
- [ ] **B6** — Servicio HTTP + tipos del frontend.
- [ ] **B7** — Vista + fila + diálogo de confirmación.
- [ ] **B8** — Ruta en `app/routes.ts` + entrada en `menu-config.ts` + textos i18n.
- [ ] **B9** — Tests de React: el botón no aparece con 0, aparece con > 0, el diálogo exige la
  casilla, el fallo se reporta sin limpiar la fila.
- [ ] **B10** — Verificación completa.

## Criterios de aceptación

1. La lista muestra solo tiendas con `CatalogSlug`, con su slug y su contador.
2. El contador coincide con lo que la purga borra: no se muestra un número que no se va a borrar.
3. Con contador 0 no hay botón.
4. El botón destructivo no se habilita hasta marcar la casilla.
5. La purga de una tienda **no** toca ninguna fila ni archivo cuya `Path` sea el `Image` de su
   producto (caso C).
6. Si `SaveChangesAsync` falla, **no** se borró ningún archivo.
7. Correrla dos veces: la segunda reporta 0 y no falla (idempotente).
8. Un SuperAdmin no puede llamarla desde un contexto de tienda, y un OwnerAdmin no puede verla.
9. Tras purgar, el catálogo público de esa tienda sigue sirviendo la imagen principal de cada
   producto. **Este es el criterio que importa**: la limpieza no puede romper nada visible.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| **Borrar el archivo de la principal** (caso C) | La comparación es siempre `Path <> Image` por producto. Test dedicado (B5) |
| Irreversible, sin papelera | Confirmación con el número exacto + checkbox + alcance por tienda (O-3) |
| Radio de impacto si se elige purga global | O-3 recomienda por tienda |
| Que el conteo mienta | Un solo origen: el reporte y la purga share la misma condición SQL |
| Archivos sin fila invisibles | Documentado en O-1; no se pierden, quedan para un barrido aparte |
| E2E afectados | La feature **no corre** E2E (excluido por el owner). Si los toca, se reporta antes de tocar nada |

## Verificación

```bash
cd backend
dotnet build src/SMCA.sln
dotnet test src/Application.Tests/Application.Tests.csproj --no-build
cd ../frontend-react
pnpm exec turbo run typecheck --force --filter=@store-mgmt/web-store-pos
pnpm exec turbo run lint --force --filter=@store-mgmt/web-store-pos
pnpm --filter @store-mgmt/web-store-pos exec vitest run app/admin/web-catalog
```

`--force` en turbo es **obligatorio**: sin él devuelve `FULL TURBO` (replay de caché, cero ejecución
real) y el exit 0 no prueba nada. **E2E no se corre.**

## Siguiente paso

Esperar O-1 a O-5 del owner. **O-2 es la que bloquea**: define si la casilla autoriza o amplía el
alcance, y de eso depende el texto del diálogo y el estado inicial del botón.
