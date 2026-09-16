# Moneda en costos y precios de tienda (CUP por defecto)

**Fecha:** 2026-09-16
**Estado:** Plan aprobado (pendiente de implementación)
**Alcance:** Modelos con precio/costo del negocio de la tienda — frontend (`packages/domain`) y backend (`Domain` C# + migration EF). Sin cambios en vistas ni UI. No aplica a los precios del cobro por el uso del sistema (plans/billing), que ya están en USD.

---

## 1. Objetivo

Todas las entidades del negocio de tienda que llevan precio o costo quedan explícitamente denominadas en una moneda. Se soportan **CUP, USD, EUR, CLA, MLC, CAD, MXN**. El valor por defecto es **CUP**, de modo que:

- Las entidades **nuevas** se crean con `CUP` estampado automáticamente (cero UI: el usuario no ve nada nuevo).
- Los datos **existentes** (rosters exportados, JSON locales cifrados, filas SQL) siguen leyéndose sin migración de datos: ausencia del campo = `CUP`.
- **Las vistas no cambian** en esta iteración (decisión explícita del usuario).

## 2. Representación

### Frontend — `packages/domain/src/enums/index.ts`

```ts
export enum Currency {
  CUP = 0,
  USD = 1,
  EUR = 2,
  CLA = 3,
  MLC = 4,
  CAD = 5,
  MXN = 6,
}
export const DEFAULT_CURRENCY = Currency.CUP;
```

Patrón idéntico al de `PaymentType`/`ExpenseType` ya serializados por valor en los JSON cifrados locales y en los rosters.

### Campos (opcionales, default = CUP al ausente)

| Modelo (`packages/domain/src/models/`) | Campo nuevo |
|---|---|
| `Order` | `currency?: Currency` |
| `OrderItem` | `currency?: Currency` |
| `Product` | `currency?: Currency` |
| `WholesaleTier` | `currency?: Currency` |
| `Expense` | `currency?: Currency` |
| `SaleCredit` | `currency?: Currency` |
| `InventoryEntry` | `currency?: Currency` |
| `InventoryEntryCost` | `currency?: Currency` |
| `InventoryEntryView` | `currency?: Currency` |
| `CsvProduct` | `currency?: Currency` (columna opcional del CSV) |
| `WarehouseStockLot` | `currency?: Currency` |
| `WarehouseStockLevel` | `currency?: Currency` |
| `WarehouseStockMovement` | `currency?: Currency` |

`ProductCategory`, `WholesaleConfig`, `ProductSelectView` no llevan (no tienen precio propio).

### Backend — `Domain` C#

Enum espejo con los mismos valores numéricos (convención del repo: los enums de frontend espejan el backend por valor):

```csharp
// Domain/Common/Enums/Currency.cs
public enum Currency
{
    CUP = 0, USD = 1, EUR = 2, CLA = 3, MLC = 4, CAD = 5, MXN = 6,
}
```

Entidades tocadas (propiedad `Currency Currency { get; set; } = Currency.CUP;` — inicializador, no nullable):

| Entidad | Propiedades monetarias cubiertas |
|---|---|
| `Orders/Order` | `Total` |
| `OrderItems/OrderItem` | `Price` (+ sus `InventoryEntryCosts`) |
| `Products/Product` | `Price` |
| `InventoryEntries/InventoryEntry` | `CostPrice` |
| `InventoryEntryCosts/InventoryEntryCost` | `CostPrice` |

Gastos y créditos **no existen en backend** (son offline-only en frontend) — nada que tocar allí. Los planes/pagos del sistema (billing, USD) no se tocan.

### Persistencia y defaults

- **EF Core**: la propiedad enum se mapea a `int` por convención. Migration: `AddColumn<int>(..., defaultValue: 0 /* CUP */)` — las filas existentes quedan en CUP sin tocar datos.
- **Frontend (localStorage cifrado)**: los factories/constructores de entidades nuevas estampan `currency: DEFAULT_CURRENCY`. La lectura de datos legacy sin el campo se resuelve con `?? DEFAULT_CURRENCY` en el punto de consumo (esta iteración: solo modelos, ningún consumidor lo lee aún).
- **Export/import (roster sync)**: campos aditivos opcionales — los export viejos importan igual (sin campo → CUP al consumir); los export nuevos traen el número y encajan en el enum.
- **CSV de productos**: columna `currency` opcional; ausente → `DEFAULT_CURRENCY`.

## 3. Reglas

1. **Default único**: `DEFAULT_CURRENCY = CUP` es la única fuente; ningún call-site hardcodea `0`.
2. **Aditivo y opcional**: ningún modelo cambia de forma rompiente; `currency` ausente = CUP por contrato documentado en cada interfaz.
3. **Solo modelos + estampado en creación**: se tocan interfaces de dominio, factories del frontend (donde se construyen las entidades) y entidades C# + migration. **Ningún render, formato ni selector**.
4. **No se mezclan monedas dentro de una entidad**: cada fila es homogénea (un Order entero en una moneda; sus items y costos comparten la suya propia explícita).

## 4. Cambios por capa

### Frontend
1. `packages/domain/src/enums/index.ts`: enum `Currency` + `DEFAULT_CURRENCY`.
2. `packages/domain/src/models/*.ts`: campo `currency?: Currency` en los 13 modelos de la tabla.
3. Factories/creadores que construyen esas entidades (order-create en carrito, entradas de inventario, gastos, créditos, movimientos de almacén, import CSV, import roster): añaden `currency: DEFAULT_CURRENCY` al crear. Búsqueda por `create(` / factories de cada servicio offline.
4. El import de rosters y CSV asigna la columna cuando venga.

### Backend
1. `Domain/Common/Enums/Currency.cs` (nuevo).
2. `Currency` + inicializador `= Currency.CUP` en `Order`, `OrderItem`, `Product`, `InventoryEntry`, `InventoryEntryCost`.
3. Migration EF (solo `AddColumn` con `defaultValue: 0`). Se genera con `dotnet ef migrations add AddCurrencyToStoreEntities` siguiendo el README del backend.

### Excluido explícitamente
- Precios de plans/pagos del sistema (USD, ya existentes).
- Cualquier cambio de vistas, formatos, selectores o textos.
- Tests E2E existentes (los campos son aditivos; los espejos de DTO de E2E no referencian estos campos).

## 5. Tests (alcance acordado: solo unit tests)

**E2E: nada se toca ni se crea.** Los campos son aditivos y opcionales — ningún E2E existente los referencia (verificado: los espejos de `TestDtos.cs` no mencionan `currency`). Si en el futuro un E2E necesita cubrir esto, se presentará caso a caso con tu aprobación (innegociable respetado).

Unit tests nuevos:
- **Dominio frontend**: enum `Currency` con valores exactos 0–6; `DEFAULT_CURRENCY === Currency.CUP`.
- **Factories**: cada factory estampa `currency: CUP` en entidades nuevas (orders/credits/expenses/entries/movimientos/CSV).
- **Compatibilidad legacy**: leer una entidad sin `currency` resuelve `CUP` en los puntos de consumo definidos.
- **Backend** (`Application.Tests`/`Domain.UnitTests` si aplica): `Currency.CUP` es el valor de las entidades creadas vía `Create(...)` sin parámetro de moneda.

## 6. Verificación

1. `tsc --noEmit` + `eslint` del frontend.
2. `vitest run` completo (suite actual verde + tests nuevos).
3. `dotnet build` de la solución backend + tests unitarios (no E2E) según README.

## 7. Riesgos / notas

- **CLA/MLC**: monedas locales cubanas poco comunes en ISO; se guardan como valores del enum (0–6) sin normalización ISO.
- La serialización es por **valor numérico** (0–6): si en el futuro se reordenan, rompería datos históricos — el enum queda congelado desde el día 1 (comentario en el código).
- El agregador multi-tienda (feature anterior) lee entidades crudas; como los campos son opcionales y las vistas no cambian, no lo toca.
