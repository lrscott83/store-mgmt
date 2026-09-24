# Integración — Catálogo (productos, categorías, CSV)

> Specs E2E cubiertos: `products-crud.spec.ts`, `category-crud.spec.ts`, `csv-import.spec.ts`,
> `csv-import-duplicate-reimport.spec.ts`, `csv-import-shared-categories.spec.ts` (17 tests).
>
> **Leyenda**
> - ✅ **Total** — toda la afirmación es lógica de negocio y vive en servicios/repositorios/dominio.
> - ⚠️ **Parcial** — la lógica es probable sin navegador, pero el test además prueba algo que exige
>   render/router/red (se indica qué).
> - ❌ **No** — la afirmación depende del navegador o del backend real.
>
> **Regla del proyecto:** los specs E2E no se tocan sin autorización explícita del usuario.

Estos cinco specs son CRUD offline puros: el fondo (crear/editar/desactivar/importar y que persista)
son `ProductRepository` / `ProductCategoryRepository` + `product-offline-service` /
`product-category-offline-service`, cubiertos al 100% en vitest. Lo que el E2E aporta es el
formulario, la lista y el paso por el router.

| Test | Qué prueba | Clasificación | Ya cubierto en |
|---|---|---|---|
| `products-crud` — crear un producto nuevo aparece en la lista | Que un producto creado desde el formulario queda guardado y se ve en la lista | ⚠️ **Parcial** — el guardado es del repositorio/servicio; **visual:** el formulario, el toast y la fila en la lista | `sales/lib/repositories/__tests__/product-repository*` (5 archivos), `sales/lib/services/__tests__/product-offline-service*` (13) |
| `products-crud` — editar un producto modifica nombre y precio | Que la edición persiste nombre y precio | ⚠️ **Parcial** — igual: `updateProduct` es del repositorio; **visual:** el modal pre-cargado y la lista | ídem |
| `products-crud` — desactivar un producto lo marca como inactivo | Que desactivar es un soft-delete visible | ⚠️ **Parcial** — el flag es de negocio; **visual:** el "inactivo" en la lista | ídem |
| `products-crud` — crear producto sin nombre muestra error de validación | Que el nombre es obligatorio | ⚠️ **Parcial** — el mensaje tipado es del dominio/servicio; **visual:** el error en el formulario | `sales/lib/__tests__/`, dominio `product-errors` |
| `products-crud` — la operación funciona correctamente en modo offline | Que crear/editar funciona sin red | ❌ **No** — prueba el modo offline del navegador (contexto sin red de Playwright) | Lógica equivalente en `shared/lib/offline/__tests__/` |
| `products-crud` — los datos persisten tras recargar | Que tras recargar la página los datos siguen | ⚠️ **Parcial** — la persistencia es del repositorio (`localStorage`); **visual:** el reload y el re-render de la lista | ídem |
| `category-crud` — crear una categoría nueva aparece en la lista | Que una categoría creada queda guardada y visible | ⚠️ **Parcial** — `createProductCategory` del repositorio; **visual:** formulario y lista | `sales/lib/repositories/__tests__/product-category-repository*`, `sales/lib/services/__tests__/product-category-offline-service*` |
| `category-crud` — editar una categoría modifica el nombre | Que la edición persiste | ⚠️ **Parcial** — ídem; **visual:** modal y lista | ídem |
| `category-crud` — crear categoría sin nombre muestra error de validación | Que el nombre es obligatorio | ⚠️ **Parcial** — error tipado; **visual:** el mensaje | ídem |
| `category-crud` — la operación funciona correctamente en modo offline | Que funciona sin red | ❌ **No** — modo offline del navegador | `shared/lib/offline/__tests__/` |
| `category-crud` — los datos persisten tras recargar | Que sobreviven al reload | ⚠️ **Parcial** — persistencia del repositorio; **visual:** el reload | ídem |
| `csv-import` — seleccionar un CSV válido importa los productos | Que un CSV válido crea los productos y sus categorías | ⚠️ **Parcial** — el parseo e inserción son del servicio (`createCsvProducts`); **visual:** el input de archivo y la lista resultante | `sales/lib/services/__tests__/product-offline-service*` (caso `createCsvProducts`), `package/domain` |
| `csv-import` — sin archivo seleccionado muestra error | Que no se importa sin archivo | ⚠️ **Parcial** — el guard es del formulario; **visual:** el error | ídem |
| `csv-import` — la operación funciona correctamente en modo offline | Que importa sin red | ❌ **No** — modo offline del navegador | `shared/lib/offline/__tests__/` |
| `csv-import-duplicate-reimport` — una segunda importación reutiliza productos, actualiza precios y agrega entradas, sin diálogo de duplicados | La regla por fila del 2026-09-02: re-importar no duplica productos | ⚠️ **Parcial** — la regla de reutilización es del servicio; **visual:** el diálogo que NO aparece y la lista | `sales/lib/services/__tests__/product-offline-service*`, `sales/lib/repositories/__tests__/product-repository*` |
| `csv-import-shared-categories` — 3 productos con la misma categoría en un CSV importan bien | Que una categoría repetida dentro del mismo CSV no se duplica ni falla | ⚠️ **Parcial** — regla del servicio; **visual:** la lista de categorías | ídem |
| `csv-import-shared-categories` — agregar otro producto a la misma categoría, en una segunda importación | Que la categoría existente se reutiliza entre importaciones | ⚠️ **Parcial** — ídem | ídem |

**Nota.** Ninguno de estos 17 tests es ✅ Total: todos asertan, además de la regla, algo del formulario
o de la lista renderizada. La parte de negocio ya está cubierta en vitest; lo que falta para
"integración" es solo el render, que no es objeto de esta carpeta.

- *Actualizado: 2026-09-24.*
