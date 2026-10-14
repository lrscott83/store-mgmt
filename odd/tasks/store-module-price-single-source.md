# store-module-price-single-source

Objective: UN solo cálculo del precio de una tienda —la suma sobre las filas de configuración
de la tienda (`StoreModule`) que están activas y no incluidas— usado por **todas** las vistas
(vista de módulos por tienda, card SuperAdmin y Owner, cobro, por-cobrar) y espejado en el
frontend. Hoy la vista de módulos por tienda calcula sobre el universo del catálogo y por eso
difiere de la card (10 vs 12.5).

Branch: `test`. Runner: backend `dotnet test`; frontend `pnpm -C frontend-react test`.
Decisión del owner (2026-10-14): el precio sale de la configuración de la tienda; una fila
activa fuera del catálogo **SÍ cuenta** (12.5).

## Specs

S1 — El precio de una tienda = Σ `GetCurrentPrice(Price, PercentDiscountPrice, DiscountPrice)`
     sobre SUS filas `StoreModule` con `IsActive` y `!ModulePriceIncluded`. El `IsActive`/
     `AvailableToStore` del catálogo **NO** altera esta suma. Fórmula: `price − price·pct/100 −
     flat`, con piso en 0 (`CurrentPriceServiceUtils.cs:11-17`).

S2 — Para la MISMA tienda, el total de la vista de módulos por tienda debe ser IGUAL al de la
     card (SuperAdmin y Owner). Es la invariante que se reprocha hoy.

S3 — La vista de módulos por tienda debe LISTAR el universo del catálogo **más** cualquier
     módulo del que la tienda tenga fila (aunque esté fuera del catálogo), para que una fila
     activa fuera del catálogo sea visible y se pueda desactivar. (Decisión del owner: 12.5.)

S4 — El backend usa UN método para todo total (`ModulePriceCalculator`); la lectura y el eco del
     guardado de la vista por tienda dejan de re-implementar la regla.

S5 — El espejo del frontend (`totalModulePricing` en `@store-mgmt/domain`) sigue siendo la única
     regla de cliente y coincide con el backend.

S6 — No-regresión: para tiendas cuya configuración está toda dentro del catálogo, nada cambia.

## Tasks

- [x] T1 — Backend `GetStoreModulePricingQuery`: incluye en el listado las filas de la tienda
        fuera del catálogo, y calcula `TotalCurrentPrice` con `ModulePriceCalculator` sobre las
        filas de la tienda. `GetStoreModulePricingQuery.cs`. (inline)
- [x] T2 — Eco del guardado (`UpdateStoreModulePricingCommand`): verificado por test que coincide
        con el total de la tienda (el cliente envía todas las filas); sin cambio de código. (inline)
- [x] T3 — Tests: la reproducción ahora afirma coincidencia; + caso de guardado. Sólo mi archivo
        nuevo (`StorePriceSingleSourceReproTests.cs`); no toqué tests existentes. (inline)
- [x] T4 — Frontend: el espejo (`totalModulePricing`/`isBillableModule`/`currentModulePrice`) ya
        implementa la misma regla y el modal usa las filas de la lectura; sin cambio de código. (inline)

## Log

L1 (request original, verbatim, 2026-10-14):

> "un solo modo de calcular el precio en el backend y en el frontend el espejo. La idea es un
> metodo donde se pasa el conjunto de modulos con todos sus datos o quizas otro dto con los
> datos necesarios, AvailableToStore, IsActive, Price, Descount, PercentDescout y todo lo que se
> necesita y luego todo el mundo transforma y usa ese. EL precio de una tienda sale de la
> configuracion de la tienda, no de ningun otro lugar."

L2 (decisión, 2026-10-14): la fila activa fuera del catálogo **SÍ cuenta** → el precio es 12.5;
la vista de módulos debe mostrar esa fila y sumarla. El card/cobro ya estaban bien.

L3 (causa raíz, 2026-10-14): dos cálculos sobre dos conjuntos de filas — card/cobro suman
`store.StoreModules` (`GetMyStoresQuery.cs:99-100`, `GetStoresByCurrentUserQuery.cs:92-93`,
`BillingService.cs:81`); la vista por tienda itera `GetAvailableModulesToStore()`
(`GetStoreModulePricingQuery.cs:77,89-112`). Reproducido en E2E:
`backend/src/SMCA.WebApi.E2ETests/Stores/StorePriceSingleSourceReproTests.cs` (card 12.5, popup 10).

L4 (implementación, 2026-10-14): T1–T4 hechos inline.

- Cambio de producción (autorizado por el owner): `GetStoreModulePricingQuery.cs` — la lista es
  el universo del catálogo **más** las filas propias de la tienda; el total es
  `ModulePriceCalculator.CalculateTotal(existing)`, la MISMA regla de la card y del cobro.
- Tests: `dotnet test … --filter "FullyQualifiedName~StorePriceSingleSourceReproTests"` → 3/3
  (control 10=10; fuera del catálogo lista+suma 12.5 en ambas vistas; eco del guardado = 12.5).
  `--filter "FullyQualifiedName~StoreModulePricingTests"` → 10/10.
  `--filter "FullyQualifiedName~SMCA.WebApi.E2ETests.Stores"` → 206/206 (sin regresión).
- Frontend: sin cambio; el modal usa las filas de la lectura y `totalModulePricing` (espejo).
  El spec Playwright `store-module-pricing.spec.ts` deriva su expectativa del MISMO endpoint
  (`readStoreModulePricing`), así que se mueve con el cambio; no se ejecutó Playwright aquí
  (requiere app+backend en vivo).
