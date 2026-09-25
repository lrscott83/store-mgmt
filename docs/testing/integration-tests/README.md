# Plan de Tests de Integración — Repositorios y Servicios Offline

> Documento de **especificación y censo de pruebas**, no de implementación.
>
> **Objetivo**: Cubrir todos los métodos de cada repositorio y servicio offline del frontend React con tests de integración (Vitest, `localStorage` real, sin mocks del módulo bajo prueba). Última auditoría: 2026-09-25.

## 1. Censo de cobertura actual

> Ámbito: `frontend-react/` (app `web-store-pos` + `packages`). Quedan fuera los servicios online/API y todo lo E2E (cada capa tiene su propio plan).

### Repositorios

| Repositorio | Test unit | Crypto test | Métodos | Estado |
|---|---|---|---|---|
| `product-category-repository.ts` | ✅ | ✅ | 12 | ✅ CUBIERTO |
| `product-repository.ts` | ✅ | ✅ | 14 | ✅ CUBIERTO |

### Servicios Offline

| Servicio | Test unit | Crypto test | Métodos | Estado |
|---|---|---|---|---|
| `expense-offline-service.ts` | ✅ (31) | ✅ (3) | 13 | ✅ CUBIERTO |
| `product-category-offline-service.ts` | ✅ (19) | ✅ (3) | 7 | ✅ CUBIERTO |
| `product-offline-service.ts` | ✅ (43 + 3 wholesale) | ✅ (3) | 14 | ✅ CUBIERTO |
| `order-offline-service.ts` | ✅ (137) | ✅ (3) | 18 | ✅ CUBIERTO |
| `inventory-offline-service.ts` | ✅ (123) | ✅ (3) | 16 | ✅ CUBIERTO |
| `sale-credit-offline-service.ts` | ✅ (76) | ✅ (3) | 16 | ✅ CUBIERTO |
| `warehouse-offline-service.ts` | ✅ (82, 4 archivos) | ✅ (4) | — | ✅ CUBIERTO |
| `recipe-offline-service.ts` | ✅ (22) | ✅ (4) | — | ✅ CUBIERTO |
| `elaboration-offline-service.ts` | ✅ (14) | ✅ (4) | — | ✅ CUBIERTO |
| `exchange-rate-offline-service.ts` | ✅ (12) | ✅ (5) | — | ✅ CUBIERTO |
| `channel-rate-offline-service.ts` | ✅ (23) | ✅ (4) | — | ✅ CUBIERTO |
| `store-payment-methods-config-service.ts` | ✅ | ✅ (5) | — | ✅ CUBIERTO |

### Infraestructura compartida (DEK / offline)

| Módulo | Test file | #tests | Estado |
|---|---|---|---|
| `shared/lib/storage/decryption-failure-policy.ts` | ✅ `decryption-failure-policy.test.tsx` (preexistente, 29) + ✅ `decryption-failure-policy.client-log.test.ts` (9, seam bajo el latch) | 38 | ✅ CUBIERTO |
| `shared/lib/storage/storage-keys.ts` | ✅ `storage-keys.test.ts` | 13 | ✅ CUBIERTO |
| `shared/lib/exchange-rates/exchange-rate-daily.ts` | ✅ `exchange-rate-daily.test.ts` | 19 | ✅ CUBIERTO |
| `shared/lib/offline/offline-session.ts` | ✅ `offline-session.test.ts` | 6 | ✅ CUBIERTO |
| `shared/lib/hooks/use-pwa-install.ts` | ✅ `use-pwa-install.test.ts` | 19 | ✅ CUBIERTO |

**Total suite de la app**: 313 archivos / **4658 tests** PASS (2026-09-25, tras añadir 88 tests: 22 crypto + 66 unit).

---

## 2. Qué prueba cada test nuevo (por servicio / repositorio)

> Matriz por módulo: por cada archivo de test nuevo, qué comportamiento demuestra.

### Crypto round-trip (DEK provisionado → `enc:v1:` → lectura descifrada)

| Archivo | Qué prueba |
|---|---|
| `warehouse-offline-service.crypto.test.ts` (4) | Escritura cifrada en las 3 claves de entidad (`warehouses`, `warehouse-stock-levels`, `warehouse-stock-movements`); round-trip íntegro (nombres, `onHand`, `costPrice`, `createdDate` revivido a `Date`); lectura con DEK bloqueado lanza `MissingDataKeyError` y preserva el ciphertext byte a byte; escritura bloqueada corta en el seam de cifrado sin mutar bytes |
| `recipe-offline-service.crypto.test.ts` (4) | Round-trip ciphertext + instancia nueva (id, `outputQty`, `components` normalizado, `isActive`, fechas, `getActiveRecipeForProduct`); lectura bloqueada lanza y conserva ciphertext; mutaciones bloqueadas por el guard read-before-write (`deactivateRecipe`/`updateRecipe`/`addRecipe`) |
| `elaboration-offline-service.crypto.test.ts` (4) | Snapshot inmutable tras `confirmElaboration` real; round-trip cifrado (lotes, `producedQty`, `recipeName`, costes de componentes, `unitCost`, `createdDate`); lectura bloqueada lanza en `getStorageElaborations` Y `getStorageElaborationsJson`; `confirmElaboration` bloqueado antes de persistir |
| `exchange-rate-offline-service.crypto.test.ts` (5) | Round-trip de tasas por día (claves de día, `value`, `date` revivido); short-circuit de payload vacío — auto-init persiste `'[]'` en claro incluso con DEK; lecturas bloqueadas lanzan; `updateValue`/`addImportedExchangeRate` bloqueados sin mutar ciphertext |
| `store-payment-methods-config-service.crypto.test.ts` (5) | Round-trip de canal deshabilitado (`Zelle\|USD` — `Efectivo` sobrevive, resolución por moneda); seam de backup `setConfigFromBackup` cifra; **comportamiento deliberado**: con DEK bloqueado `getConfig()` DEGRADA al default (no lanza) mientras `getStorageStorePaymentMethods()` propaga `MissingDataKeyError` — divergencia ahora pineada por test; escritura bloqueada lanza conservando bytes |

**`data-serializer-service.ts` → NO se creó crypto test (decisión con evidencia)**: el módulo no es dueño de escrituras cifradas DEK — no importa `entity-crypto`/`data-key-store`, no escribe `localStorage.setItem`; su `export()` produce un ZIP (PBKDF2-SHA256 100k + zip.js `rawPassword` por entrada) y `import()` devuelve `ParsedData`. Las escrituras cifradas en reposo que serializa pertenecen a los servicios ya cubiertos arriba.

### Unit tests (infraestructura compartida)

| Archivo | Qué prueba |
|---|---|
| `decryption-failure-policy.client-log.test.ts` (9) | El seam que ningún test cubría: `logClientError` vive DEBAJO del check `if (announced) return true;` — con el latch armado, fallos repetidos se tragan SIN traza de client-log. Ring buffer real, latch real |
| `storage-keys.test.ts` (13) | Contrato del namespace de claves: formato, prefijo, scoping por entidad; strings estables pineadas para que un rename accidental rompa el test |
| `exchange-rate-daily.test.ts` (19) | Store localStorage de tasas por día: seed, lectura, update, remove, estados vacíos/borde — `localStorage` real, servicio offline real importado dinámicamente, sin DEK → claro |
| `offline-session.test.ts` (6) | Constantes/shape del shim de sesión offline; convención `*.purity.test.ts` del repo |
| `use-pwa-install.test.ts` (19) | Ciclo de vida del hook: estado inicial, captura de evento prompt, disparo de install, transición `appinstalled`, cleanup de listeners al desmontar — store `pwa-install-prompt` real, solo la superficie de browser stubeada (`renderHook`/`act`) |

---

## 3. Métodos por servicio (referencia de cobertura)

> Listas detalladas de métodos por servicio — ver el historial del documento y el código. El censo de la sección 1 es la fuente de verdad de estado; estas listas son referencia de superficie.

### expense-offline-service.ts (13 métodos — ✅ cubierto)

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

### product-category-offline-service.ts (7 métodos — ✅ cubierto)

| # | Método | Tipo | Descripción |
|---|---|---|---|
| 1 | `createProductCategory(name, order, isActive)` | Writer | Crea categoría |
| 2 | `updateProductCategory(id, name, order, isActive)` | Writer | Actualiza categoría |
| 3 | `getProductCategories()` | Reader | Lista todas las categorías |
| 4 | `getAvailableProductCategories()` | Reader | Lista categorías activas |
| 5 | `getProductCategoriesView()` | Reader | Vista enriquecida con conteo |
| 6 | `getMaxOrder()` | Aggregator | Máximo order global |
| 7 | `getProductCategoriesView()` (con productos) | Reader | Vista con productos |

### product-offline-service.ts (14 métodos — ✅ cubierto)

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

## 4. Problemas conocidos

1. **`expense-offline-service.test.ts` duplicado** en dos rutas (31 vs 44 tests). Detectado 2026-09-25. **No tocado** — modificar tests existentes requiere autorización explícita del usuario.
2. **Perfil de flake transitorio** (no reproducido, no corregido — tocar esos tests requiere autorización): con la máquina cargada, `decryption-failure-policy.test.tsx` (cold `import('../../../../root')` en tests de ErrorBoundary) y `sync-routes.test.tsx` (anchor/`navigator.share`) pueden exceder el `testTimeout` de 5000 ms. El run completo en verde no lo reproduce.

---

## 5. Estado final

**Todas las fases completadas (2026-09-25).** Cobertura integración offline: repositorios, servicios offline e infraestructura DEK/offline compartida al 100% del censo. Suite total de la app: **313 archivos / 4658 tests PASS**, typecheck 0 errores, lint 0 warnings.

---

## 6. Convenciones

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
    // 1. Provision DEK (convención real del repo: crypto.subtle / helper de test)
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