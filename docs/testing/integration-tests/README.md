# Plan de Tests de Integración — Repositorios y Servicios Offline

> Documento de **especificación de pruebas**, no de implementación.
>
> **Objetivo**: Cubrir al 100% todos los métodos de cada repositorio y servicio offline con tests de integración (vitest).

## 1. Análisis de cobertura actual

### Repositorios

| Repositorio | Test unit | Crypto test | Métodos | Estado |
|---|---|---|---|---|
| `product-category-repository.ts` | ✅ | ✅ | 12 | CUBIERTO |
| `product-repository.ts` | ✅ | ✅ | 14 | CUBIERTO |

### Servicios Offline

| Servicio | Test unit | Crypto test | Métodos | Estado |
|---|---|---|---|---|
| `expense-offline-service.ts` | ❌ FALTA | ✅ | 13 | **GAP CRÍTICO** |
| `product-category-offline-service.ts` | ✅ | ❌ FALTA | 7 | GAP |
| `product-offline-service.ts` | ✅ | ❌ FALTA | 14 | GAP |
| `order-offline-service.ts` | ✅ | ✅ | 18 | CUBIERTO |
| `inventory-offline-service.ts` | ✅ | ✅ | 16 | CUBIERTO |
| `sale-credit-offline-service.ts` | ✅ | ✅ | 16 | CUBIERTO |

---

## 2. Métodos por servicio (a cubrir)

### expense-offline-service.ts (13 métodos — SIN test unitario)

| # | Método | Tipo | Descripción |
|---|---|---|---|
| 1 | `getStorageExpenses()` | Reader | Lee gastos de localStorage |
| 2 | `getExpensesInDay(date)` | Reader | Filtra gastos por día |
| 3 | `getActiveExpensesPriceBetweenDates(start, end)` | Aggregator | Suma montos entre fechas |
| 4 | `getActiveExpensesPriceToday()` | Aggregator | Suma montos de hoy |
| 5 | `getActiveExpensesPriceYesterday()` | Aggregator | Suma montos de ayer |
| 6 | `getExpensesTotalBefore(date)` | Aggregator | Total acumulado antes de fecha |
| 7 | `getExpensesTotal()` | Aggregator | Total acumulado |
| 8 | `getExpensesTotalYesterday()` | Aggregator | Total de ayer |
| 9 | `filterExpensesObservable(...)` | Reader | Filtra gastos con parámetros |
| 10 | `getExpensesInDayObservable(date)` | Reader | Observable de gastos del día |
| 11 | `create(input)` | Writer | Crea gasto |
| 12 | `update(id, patch)` | Writer | Actualiza gasto |
| 13 | `deleteExpense(id)` | Writer | Soft-delete de gasto |

### product-category-offline-service.ts (7 métodos — SIN crypto test)

| # | Método | Tipo | Descripción |
|---|---|---|---|
| 1 | `createProductCategory(name, order, isActive)` | Writer | Crea categoría |
| 2 | `updateProductCategory(id, name, order, isActive)` | Writer | Actualiza categoría |
| 3 | `getProductCategories()` | Reader | Lista todas las categorías |
| 4 | `getAvailableProductCategories()` | Reader | Lista categorías activas |
| 5 | `getProductCategoriesView()` | Reader | Vista enriquecida con conteo |
| 6 | `getMaxOrder()` | Aggregator | Máximo order global |
| 7 | `getProductCategoriesView()` (con productos) | Reader | Vista con productos |

### product-offline-service.ts (14 métodos — SIN crypto test)

| # | Método | Tipo | Descripción |
|---|---|---|---|
| 1 | `getMaxOrderByCategoryId(catId)` | Aggregator | Máximo order por categoría |
| 2 | `getAvailableProductsByCategoryId(catId)` | Reader | Productos disponibles por categoría |
| 3 | `getProductById(id)` | Reader | Producto por ID |
| 4 | `getProductByBarcode(barcode)` | Reader | Producto por código de barras |
| 5 | `deleteProduct(id)` | Writer | Soft-delete de producto |
| 6 | `getProductsToSaleByCategoryId(catId)` | Reader | Productos para vender |
| 7 | `getProductsByCategoryId(catId)` | Reader | Todos los productos de categoría |
| 8 | `setDiscountFromInvantory(id, flag)` | Writer | Cambia flag de descuento |
| 9 | `getProductsToSelect()` | Reader | Productos para dropdown |
| 10 | `createProduct(...)` | Writer | Crea producto |
| 11 | `updateProduct(...)` | Writer | Actualiza producto |
| 12 | `createProducts(catId, items)` | Writer | Crea múltiples productos |
| 13 | `createCsvProducts(csv)` | Writer | Importa desde CSV |
| 14 | `hasAnyAvailableToSaleProduct(catId)` | Reader | Verifica si categoría tiene productos |

---

## 3. Plan de implementación

### Fase 1: Tests unitarios faltantes (CRÍTICO)

| # | Archivo | Prioridad | Descripción |
|---|---|---|---|
| 1 | `expense-offline-service.test.ts` | CRÍTICA | Test unitario completo (13 métodos) |

### Fase 2: Crypto tests faltantes (ALTA)

| # | Archivo | Prioridad | Descripción |
|---|---|---|---|
| 2 | `product-category-offline-service.crypto.test.ts` | ALTA | Verificar round-trip cifrado |
| 3 | `product-offline-service.crypto.test.ts` | ALTA | Verificar round-trip cifrado |

### Fase 3: Cobertura completa de métodos (MEDIA)

| # | Archivo | Prioridad | Descripción |
|---|---|---|---|
| 4 | Verificar cobertura de `order-offline-service.test.ts` | MEDIA | Asegurar que todos los métodos están cubiertos |
| 5 | Verificar cobertura de `inventory-offline-service.test.ts` | MEDIA | Asegurar que todos los métodos están cubiertos |
| 6 | Verificar cobertura de `sale-credit-offline-service.test.ts` | MEDIA | Asegurar que todos los métodos están cubiertos |

---

## 4. Convenciones

### Patrón de test unitario

```typescript
describe('ExpenseOfflineService', () => {
  let service: ExpenseOfflineService;

  beforeEach(() => {
    localStorage.clear();
    service = new ExpenseOfflineService('test-store-id');
  });

  it('methodName does X', () => {
    // Arrange
    // Act
    // Assert
  });
});
```

### Patrón de crypto test

```typescript
describe('ExpenseOfflineService crypto', () => {
  it('provisioned + unlocked write produces ciphertext, service read round-trips', async () => {
    // 1. Provision DEK
    // 2. Write via service
    // 3. Read via service
    // 4. Verify data integrity
  });
});
```

### Datos de prueba

- Usar `localStorage.clear()` en `beforeEach`
- Store ID fijo: `'test-store-id'`
- Datos mínimos para cada método
