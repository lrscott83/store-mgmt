# Reporte de cumplimiento de migración Angular → React

> **Fuente de verdad:** SOLO código fuente. Angular en `frontend/src`, React en `frontend-react`.
> No se consultaron specs (`openspec/`), memorias ni documentación — únicamente los archivos `.ts` reales de ambas apps.
> **Regla base (playbook):** por cada model, repository, service, online-service y offline-service que exista en Angular debe existir su correlato en React, espejando firma, capas y contrato (única transformación permitida `Observable<T>` → `Promise<T>`).
>
> **Leyenda de estado:**
> - ✅ Paridad — correlato existe, sin diferencias relevantes de contrato
> - 🟡 Diferencia — existe pero con divergencias (rename, capa, firma, método extra/faltante)
> - 🔴 Gap real — falta un correlato que debería existir (regla 10/12)
> - ⚙️ Mecánica de framework — Angular lo resuelve con infraestructura propia (DI, interceptors, ErrorHandler) que React reemplaza idiomáticamente; no es gap de paridad de negocio

---

## 0. Estado de resolución — SDD `angular-react-parity-fixes` (2026-07-15)

Se ejecutó un SDD sobre estos gaps con el **código como única fuente de verdad** y el **playbook como veredicto**. Verificación **PASS** (suite 1635/1635, `tsc` limpio). Archivado en `openspec/changes/archive/2026-07-15-angular-react-parity-fixes/`.

- ✅ **Resuelto:** interceptor de errores (WU3, commit `20fbbc8`), CSV robusto (WU4, commit `b82bbbf`), 3 inventos rule-12 eliminados (WU-R, commit `621d411`).
- ↩️ **No era gap (reclasificado leyendo el código):** `base.service`, `owner-details`/`getOwnerDetailsById`, `deleteReSeller`, `MessageService`, `store-module-state`, `data.service`, auth `forgotPassword`/`signInGoogle`/`createUser`/`registration`, `AddressModel`/`SocialNetworksModel`/`Message`, i18n `setLanguage`. Todos **dead-code de Angular** (call-site comentado, cuerpo vacío o componente nunca renderizado) → regla 10/12: NO se portan.
- ✅ **PWA cerrado (SDD `pwa-framework-parity`, 2026-07-15):** `preloading` portado (WU-1, commit `b0847cf`) y spinner global HTTP cableado con el `LoadingOverlay` existente (WU-2, commit `1424f07`). `download-manager` y `splash-screen` verificados como **dead-code de Angular** (output nunca renderizado / componente nunca importado) → no se portan. Verify PASS, suite 1656/1656.

Detalle por ítem en §6 (actualizada) y §7.

---

## 1. Models

Angular dispersa los modelos en `domain/entities/**`, `_services/**/_models` y `presentation/_models`. React los **consolida** en `packages/domain/src/models/*.ts` (+ `enums/index.ts`, `commons/`). La consolidación en sí es aceptable (mismo tipo, otra ubicación); lo que se marca abajo son las divergencias de forma o los faltantes.

| Angular (`frontend/src/...`) | React (`frontend-react/...`) | Estado | Diferencias |
|---|---|---|---|
| `domain/entities/entries/inventory-entry.model.ts` (`InventoryEntry`) | `packages/domain/src/models/inventory.ts` | ✅ | Campos idénticos + `AuditableBaseModel`. |
| `domain/entities/entries/inventory-entry-view.model.ts` (`InventoryEntryView`) | `packages/domain/src/models/inventory.ts` | ✅ | Consolidado en `inventory.ts`. |
| `domain/entities/expenses/expense.model.ts` (`Expense`, `ExpenseType`, `ExpenseTypeUtils`) | `models/expense.ts` (`Expense`) + `enums/index.ts` (`ExpenseType`) | 🟡 | `ExpenseType` movido a `enums`. `ExpenseTypeUtils` (helper de label) sin port localizado. |
| `domain/entities/features/feature.model.ts` (`Feature`) | `models/store.ts` (`Feature`) | ✅ | Consolidado en `store.ts`. |
| `domain/entities/messages/message.model.ts` (`Message`, `EMessageStatus`) | — | 🔴 | **Sin correlato.** No existe feature de mensajería en React (ver §Services `MessageService`). |
| `domain/entities/modules/module.model.ts` (`Module`) | `models/store.ts` (`Module`) | ✅ | Consolidado en `store.ts`. |
| `domain/entities/orders/order-item.model.ts` (`OrderItem`) | `models/order.ts` (`OrderItem`) | 🟡 | `productCosts` apunta a `InventoryEntryCost` con campo renombrado `inventoryId`→`id`. |
| `domain/entities/orders/order.model.ts` (`Order`, `OrderType`, `ProductoVenta`, `DatosVenta`) | `models/order.ts` (`Order`) + `enums/index.ts` (`OrderType`) + `sales/lib/order-type-utils.ts` | 🟡 | `Order` idéntico. `OrderTypeUtils` reubicado fuera de `domain`. `ProductoVenta`/`DatosVenta` (dead code Angular) sin port. |
| `domain/entities/owners/owner.model.ts` (`Owner`) | `models/store.ts` (`Owner`) | ✅ | Consolidado. |
| `domain/entities/owners/owner-store-module.model.ts` (`OwnerStoreModule`) | `models/store.ts` | ✅ | Consolidado. |
| `domain/entities/product-categories/product-category.model.ts` (`ProductCategory`) | `models/product.ts` (`ProductCategory` + `ProductCategoryView`) | ✅ | `ProductCategoryView` espeja el `.view.ts` de Angular. |
| `domain/entities/products/product.model.ts` (`Product`) | `models/product.ts` (`Product` + `ProductSelectView`) | ✅ | `ProductSelectView` espeja el `.view.ts` de Angular. |
| `domain/entities/sale-credits/sale-credit.model.ts` (`SaleCredit`) | `models/sale-credit.ts` | ✅ | Idéntico. |
| `domain/entities/stores/store.model.ts` (`Store`) | `models/store.ts` | ✅ | Idéntico. |
| `domain/entities/store-user/store-user.model.ts` (`StoreUser`) | `models/store.ts` | ✅ | Consolidado. |
| `domain/entities/users/credentials.model.ts` (`Credentials`, class) | `models/auth.ts` (`Credentials`, interface) | 🟡 | `class` → `interface` (sin métodos en Angular, equivalente). |
| `domain/entities/users/user.model.ts` (`User`) | `models/store.ts` (`User`) | ✅ | Consolidado. |
| `domain/resellers/reseller.model.ts` (`ReSeller`) | `models/store.ts` (`ReSeller`) | 🟡 | React agrega campo opcional `login?: string` (no está en Angular). |
| `_services/_models/base.model.ts` (`BaseModel`, `AuditableBaseModel`, `BaseResponseModel`, `BaseError`, + `IModelState`/`ICreate/Edit/Delete...Action`) | `models/base.ts` (`BaseModel`, `AuditableBaseModel`, `BaseResponseModel`, `BaseError`) | 🟡 | Modelos de datos 1:1 (`id: unknown` vs `any`; `AuditableBaseModel extends BaseModel` en React). Interfaces de ciclo de vida de componente Angular (`IModelState`, `I*Action`) sin correlato — React usa hooks. |
| `_services/_models/base-state.model.ts` (`IBaseState`, `BaseState`, `IStateView`) | — | ⚙️ | Máquina de selección de filas atada a `ngOnInit`. Sin port; reemplazada por estado local/hooks. |
| `_services/_models/order/cart-data.model.ts` (`CartData`) | `shared/lib/stores/cart-store.ts` | 🟡 | No hay tipo único `CartData`; `items`/`itemsCount`/`total` viven como campos/getters del store. |
| `_services/_models/order/cart-item.model.ts` (`CartItem`) | `shared/lib/stores/cart-store.ts` (`CartItem`) | 🟡 | React guarda `product: Product` en vez de `productId`/`name` planos; `price` opcional (Angular requerido). |
| `_services/auth/_models/address.model.ts` (`AddressModel`) | — | 🔴 | **Sin correlato** en React. |
| `_services/auth/_models/auth.model.ts` (`AuthModel`, class + `setAuth()`) | `models/auth.ts` (`AuthModel`, interface) | 🟡 | `expiresIn` tipado `number` en React vs `Date` en Angular. `setAuth()` sin correlato (interface). |
| `_services/auth/_models/auth-user.model.ts` (`UserModel`, class + `setUser()`) | `models/auth.ts` (`UserModel`, interface) | 🟡 | Campos 1:1. `setUser()` sin correlato (interface). |
| `_services/auth/_models/social-networks.model.ts` (`SocialNetworksModel`) | — | 🔴 | **Sin correlato** en React. |
| `_services/auth/_models/store-module-features.model.ts` (`StoreModuleFeatures`, class) | `models/auth.ts` (interface) | ✅ | Consolidado en `auth.ts`; class → interface. |
| `_services/csv/models/csv-product.model.ts` (`CsvProduct`) | `models/csv-product.ts` | ✅ | Port 1:1 (`barcode` deliberadamente excluido en ambos). |
| `_services/usage/store-usages.model.ts` (`StoreUsages`) | `admin/dashboard/lib/services/usage-http-service.ts` | 🟡 | Idéntico pero fuera del paquete `domain` (inline en el service). |
| `_services/usage-tracker/usage.model.ts` (`Usage`, `DailyUsage`) | `shared/lib/usage/store-usage-tracker.ts` | 🟡 | Idéntico pero fuera de `domain` (inline). |
| `presentation/_models/top-product.model.ts` (`TopProduct`) | `sales/lib/services/order-offline-service.ts` (`TopProduct`) | 🟡 | Idéntico pero inline en el offline-service, no en `domain`. |
| `presentation/_models/chart-data,model.ts` (`ChartData`) | `sales/lib/services/order-offline-service.ts` (`ChartData`) | 🟡 | React estrecha `label: any`/`value: any` a `Date`/`number`. Inline, no en `domain`. |

---

## 2. Repositories

Angular solo tiene repositorios para **products** y **product-categories**. React los espeja 1:1.

| Angular | React | Estado | Diferencias |
|---|---|---|---|
| `application/products/product.repository.ts` (`@Injectable`, ctor `categoryRepository, authService`) | `sales/lib/repositories/product-repository.ts` (plain class, ctor `storeId, categoryRepository`) | 🟡 | DI singleton → instancia por-store. `authService.currentUserValue.login` → helper `getCurrentUserLogin()`; `selectedStoreId` → param `storeId`. 26 métodos 1:1. **Extra:** `getCategoryRepository()` (accessor sin origen Angular, para que `InventoryOfflineService` alcance el repo de categorías). |
| `application/categories/product-category.repository.ts` (`@Injectable`, ctor `authService`) | `sales/lib/repositories/product-category-repository.ts` (plain class, ctor `storeId`) | 🟡 | Mismo patrón DI→`storeId`. Métodos 1:1 **salvo** `activate/deactivateProductCategory`: Angular declara 2° param muerto `isActive`; React lo elimina a 1 param (fix documentado). Arity de call-site difiere. |

---

## 3. Offline services

Angular tiene offline-service para **products, product-categories, inventory, expenses, sale-credits, orders**. React los espeja todos.

| Angular | React | Estado | Diferencias |
|---|---|---|---|
| `application/products/product-offline.service.ts` (`extends ProductService`, ctor `http, productRepo, categoryRepo`) | `sales/lib/services/product-offline-service.ts` (`implements ProductService`, ctor `storeId, productRepo?, categoryRepo?`) | ✅ | `extends` abstracta → `implements` interface; `HttpClient` eliminado (sin HTTP offline); repos opcionales con default. 14 métodos con `Observable`→`Promise`. Sin renames/faltantes/extras. |
| `application/categories/product-category-offline.service.ts` (`extends ProductCategoryService`) | `sales/lib/services/product-category-offline-service.ts` (`implements`) | ✅ | Mismo patrón. 6 métodos 1:1, `Observable`→`Promise`. |
| `application/entries/inventory-offline.service.ts` | `inventory/lib/services/inventory-offline-service.ts` | 🟡 | Método `hasAvailableProductToSale(...): Result` **sin correlato directo**: lógica de elegibilidad movida a la función libre `sales/lib/product-availability.ts` con otra firma. **Extras React:** `hasAvailableStock`, `getAvailableQuantity`, `update(...)` (duplica el caso mismo-producto de `updateInventoryEntry`). `getActiveInventoryEntriesStorage`/`getProductInventoriesByProductId` pasan de `private` a `public`. Fixes de bug documentados (FIFO decrement, copy-paste cross-product). |
| `application/expenses/expense-offline.service.ts` | `expenses/lib/services/expense-offline-service.ts` | 🟡 | `createExpense(...pos)` → `create(input)`; `updateExpense(...pos)` → `update(id, patch)` (params posicionales → objeto). **Faltante:** `getExpensesJson()` (passthrough raw) — React serializa vía `getStorageExpenses()`+`JSON.stringify()` en el serializer. Fix: `getExpensesInDay` honra `date` (Angular lo ignora). |
| `application/credits/sale-credit-offline.service.ts` | `sales/lib/services/sale-credit-offline-service.ts` | 🟡 | **Faltante:** `getSaleCreditsJson()` (mismo patrón que Expense). `getActiveSaleCreditsPriceBetweenDates` pasa de `private` a `public`; `getActiveSaleCreditsBetweenDates` → private `activeSaleCreditsBetween` (cosmético). Resto 1:1. |
| `application/orders/order-offline.service.ts` | `sales/lib/services/order-offline-service.ts` | 🟡 | **Extra:** `getByDateRange(from, to)`. Fix: `getTopProducts*` respetan param `top` (Angular hardcodea `slice(0,5)`); `getOrdersInDay` honra `date`. DI: construye Sale/Inventory/Expense offline internamente (`new X(storeId)`). Dead code Angular (`groupBy2`, `flatMap2`) sin port. |

**Confirmado:** Angular NO tiene online-service para inventory/expenses/sale-credits/orders (solo offline). React tampoco. Paridad correcta — no se inventó ni se omitió capa online.

---

## 4. Online services

Angular tiene online-service solo para **products** y **product-categories**.

| Angular | React | Estado | Diferencias |
|---|---|---|---|
| `application/products/product-online.service.ts` (`extends ProductService`, ctor `http`) | `sales/lib/services/product-online-service.ts` (`implements`, sin ctor — usa `apiClient`) | ✅ | `HttpClient` DI → `apiClient` compartido. 12 métodos, `Observable`→`Promise`. Bug de doble-slash en URL **espejado a propósito**. `_barcode?` explícito (unused) por contrato de interface. |
| `application/categories/product-category-online.service.ts` (`extends ProductCategoryService`, ctor `http`) | `sales/lib/services/product-category-online-service.ts` (`implements`, sin ctor) | 🟡 | `HttpClient` → `apiClient`. 5 métodos, `Observable`→`Promise`. **Divergencia deliberada:** `updateProductCategory`/`getMaxOrder` **normalizan** el doble-slash a slash simple (política opuesta al product-online, que lo espeja). Diferencia real de URL vs Angular. |

---

## 5. Services (dominio, aplicación e infraestructura)

### 5.1 Interfaces/abstractas de dominio

| Angular | React | Estado | Diferencias |
|---|---|---|---|
| `application/categories/product-category.service.ts` (abstract `extends BaseService<ProductCategory>`) | `packages/domain/src/services/product-category-service.ts` (interface) | 🟡 | Clase abstracta en `application/` → interface en `domain`. `extends BaseService` (y `getAll/getById/delete`) eliminado. 5 métodos exactos. |
| `domain/interfaces/product.service.ts` (abstract `extends BaseService<Product>`) | `packages/domain/src/services/product-service.ts` (interface) + `sales/lib/services/product-service.factory.ts` | 🟡 | `extends BaseService` eliminado; 12 métodos 1:1. Factory Angular (`_services/factories/product-service.factory.ts`, `inject()` + `GlobalConfig.USE_ONLINE_SERVICE`) → `createProductService(storeId)` (constructores en vez de `inject`). |
| `domain/interfaces/message.service.ts` (`MessageService`, `sendUpdateAvailableProductToSaleMessage`) | — | 🔴 | **Sin correlato** en React. (En Angular tampoco tiene call-sites fuera de su definición → posible dead code, pero es artefacto Angular sin par.) |

> Nota: el factory de categorías (`product-category-service.factory.ts` en React) espeja el mismo patrón; ambos factories son adaptación DI→constructor esperada.

### 5.2 Auth / autorización / storage

| Angular | React | Estado | Diferencias |
|---|---|---|---|
| `_services/auth/auth.service.ts` (BehaviorSubject stateful) | `shared/lib/stores/auth-store.ts` (Zustand) + `shared/lib/auth/user-home.ts` | 🟡 | Stream reactivo → store (patrón esperado). 1:1 en `login`/`logout`/`getUserByToken` (expiry 35 días). **Gaps:** sin port de `registration()`, `forgotPassword()`, `getSocialToken()`/`signInGoogle()` (login Google). |
| `_services/auth/auth-http/auth-http.service.ts` | `shared/lib/http/auth-http-service.ts` (`login`, `register`, `getMe`) | 🟡 | `registerOwner`→`register`, `getUserByToken`→`getMe`. **Faltantes:** `logout()` server-side, `signInGoogle`/`getSocialToken`, `forgotPassword`, `createUser`. |
| `_services/auth/auth-http/fake/auth-fake-http.service.ts` | — | ⚙️ | Mock dev-only DI-swappable; React mockea `apiClient` en tests. No es gap. |
| `_services/authorization/authorization.service.ts` | `shared/lib/auth/authorization-service.ts` (funciones puras) | ✅ | Clase → módulo de funciones. Superficie completa + helpers `isSuperAdmin`/`isOwnerAdmin`/`isReSeller`. Divergencia `<` vs `<=` documentada (espeja las dos comparaciones distintas de Angular). |
| `_services/base.service.ts` (abstract CRUD genérico + `items$`/`isLoading$`) | — | 🔴 | **Sin correlato único.** La base compartida (CRUD + estado reactivo de lista) no tiene módulo base en React; cada `*-http-service.ts` reimplementa URL/typing. Los endpoints *usados* sí están portados por-feature → no es gap funcional, es abstracción perdida (regla 12: aceptable solo si Angular no la tuviera — **Angular SÍ la tiene**). |
| `_services/connection/connection.service.ts` (`isOnline$`, `statusChange$`) | `shared/lib/auth/connectivity-service.ts` (`isOnline()` sync) + `shared/lib/hooks/use-online-status.ts` | 🟡 | Rename `connection`→`connectivity`; split getter + hook. **`wasOffline`/`statusChange$` (transición "volví online") sin port.** |
| `_services/storage/storage.service.ts` | `shared/lib/auth/storage-service.ts` | ✅ | 6 métodos usados 1:1. React strippea `password` antes de persistir (mejora). Dead code Angular (`currentUser$`/`authorize$`) correctamente descartado. |

### 5.3 Management / usage / features

| Angular | React | Estado | Diferencias |
|---|---|---|---|
| `_services/features/feature.service.ts` (`extends BaseService<Feature>`) | `admin/features/lib/services/feature-http-service.ts` (`activateFeatures`) | ✅ | El único consumidor Angular usa solo `activateFeatures`; el resto es CRUD heredado muerto. Superficie React correcta. |
| `_services/module/module.service.ts` (`getModulesToStore`) | `management/stores/lib/services/store-http-service.ts.getModulesToStore()` | ✅ | Fusionado en el service de stores (única consumición real). |
| `_services/owner/owner.service.ts` | `admin/owners/lib/services/owner-http-service.ts` | 🔴 | `getOwnerById`→`getOwner`, `editOwner`→`updateOwner` (renames OK). **Gap real:** `getOwnerDetailsById` sin correlato — no hay ruta `owner-details` en React (Angular sí la tiene y la consume). |
| `_services/reseller/reseller.service.ts` | `admin/resellers/lib/services/reseller-http-service.ts` | 🔴 | **Gap real:** `deleteReSeller` falta en el HTTP service Y en la UI (`reseller-list.tsx` sin acción delete; Angular sí la tiene). `getReSellerDetailsById` sin port (orphan también en Angular). |
| `_services/store/store.service.ts` | `management/stores/lib/services/store-http-service.ts` | 🟡 | Paridad completa (renames `getStoresByCurrentUser`→`listStores`, etc.). **Extras:** `getModulesToStore` (de ModuleService), `listOwners` (de OwnerService) y `deactivateStore` (DELETE sin método Angular directo). |
| `_services/storeuser/store-user.service.ts` | `management/users/lib/services/user-http-service.ts` (`createUser`→POST `/v1/storeusers`) | 🟡 | Colapso asimétrico: React fusiona `UserService` + `StoreUserService.createStoreUser` (solo el *create*). `getStoreUsers`/`getStoreUserById`/`editStoreUser` sin correlato distinto; se usan los endpoints `/v1/users/*`. |
| `_services/user/user.service.ts` | `management/users/lib/services/user-http-service.ts` + `profile/lib/services/profile-http-service.ts` (`changePassword`) | 🟡 | `changePassword` movido a `profile-http-service`. `createUser` genérico (sin store) no está — solo el create store-scoped (ver StoreUser). |
| `_services/usage/usage.service.ts` | `admin/dashboard/lib/services/usage-http-service.ts` | ✅ | Renames 1:1 (`getLastWeek/Month...`→`getStoresLastWeek/Month`). |
| `_services/usage-tracker/store-usage-tracker.service.ts` | `shared/lib/usage/store-usage-tracker.ts` + `use-store-usage-tracker.ts` | ✅ | Port 1:1 (sentinel `Guid.EMPTY`, mutex `sending`, `cleanOldData(30)`). Router events → `useLocation()` hook. |
| `_services/order/shopping-cart.service.ts` (abstract stateful, valida inventario en `addCartItem`) | `shared/lib/stores/cart-store.ts` (Zustand persist) | 🟡 | Stream → store (patrón esperado). **Divergencias:** `addItem` NO revalida inventario dentro del store (la validación vive en `cart-submission-validation.ts`/call-sites); agrega `persist` (Angular es in-memory). |
| `_services/shared/store-module-state.service.ts` (`modulesUpdated$` broadcast) | — | 🔴 | **Sin correlato.** Señal pub/sub "módulos actualizados" ausente; probablemente mitigado por `revalidator` de React Router, pero no hay equivalente directo. |
| `_services/data/data.service.ts` (`loadProducts`/`loadCategories` JSON estático) | — | 🔴 | **Sin correlato** localizado. Probable loader legacy de demo-data superado por repos/offline, pero es artefacto Angular sin par. |

### 5.4 Sincronización

| Angular | React | Estado | Diferencias |
|---|---|---|---|
| `application/synchronization/data-serializer.service.ts` | `sync/lib/services/data-serializer-service.ts` | 🟡 | Renames + cambio de forma: `serializeEncryptedZip(pwd): void` (descarga DOM) → `export(pwd): Uint8Array` (bytes; descarga movida al caller). `deserializeEncryptedZip(...): DataFile[]` → `import(...): ParsedData` (objeto tipado por entidad). Helpers `getDataFiles`/`generateFileName`/`pad` sin correlato. Deriv. de password + nombres de entry 1:1. |
| `application/synchronization/data-synchronizer.service.ts` | `sync/lib/services/data-synchronizer-service.ts` | 🟡 | `synchronizeFiles(DataFile[]): Result` → `sync(ParsedData): SyncResult` (retorno con `merges`/counters que Angular no produce). Métodos privados renombrados (`synchronize*`→`merge*`). Fix: cada entidad emite su código de error propio (Angular tenía copy-paste `OrdersUnexpectedError`). |
| `application/synchronization/data.file.model.ts` (`DataFile`, `EDataFileName`) | — (disperso en `data-serializer-service.ts`) | 🟡 | El modelo de intercambio compartido/exportado no tiene archivo standalone; React usa `ParsedData` tipado + const privada `ENTRY_NAMES`. |
| `_services/csv/csv-product.service.ts` (`@Injectable`, papaparse, `Observable<CsvProduct[]>`) | `sales/lib/csv-product-parser.ts` (función `parseCsvProducts(text): CsvParseResult`) | ✅ **Resuelto (WU4)** | Antes 🔴. Ahora tokenizer RFC4180 (maneja comillas con comas internas), `category` requerido (`MISSING_CATEGORY`) y coerción de `price` espejando `validateProducts`. Sigue siendo función (no service) a propósito: se espeja el comportamiento, no la capa. Sin nueva dependencia (papaparse no agregado). Commit `b82bbbf`. |

### 5.5 Mecánicas de framework (⚙️ — sin correlato de service, esperado)

Estos services Angular resuelven infraestructura que React implementa de forma idiomática (interceptors → interceptor axios / ErrorBoundary / hooks). Se listan por completitud; **no** son gaps de paridad de negocio salvo las notas 🔴.

| Angular | React | Nota |
|---|---|---|
| `_services/app-init.service.ts` (`APP_INITIALIZER`) | `auth-store.ts` `initialize()` en evaluación de módulo | Reemplazo intencional documentado. |
| `_services/icon-setup.service.ts` (`MatIconRegistry`) | `shared/components/ui/icons.tsx` (SVG) | Nada que portar (no usa Material). |
| `_services/loading.service.ts` + `_interceptors/loading-interceptor.service.ts` | — (estado local por ruta) | ⚠️ `LoadingOverlay` existe pero **no está cableado** a `api-client.ts`; sin spinner global de "request en vuelo". |
| `_services/preloading.service.ts` (prefetch de chunks post-auth) | — | 🔴 Sin lógica explícita de preload post-login (React Router puede code-split, pero el prefetch proactivo no está portado). |
| `_services/global-error-handler.service.ts` (`ErrorHandler`) | `root.tsx` `ErrorBoundary` | Diferencia: Angular suprime network errors y muestra stack en prod; React solo muestra stack en dev. |
| `_services/update/update.service.ts` (`SwUpdate`) | `shared/lib/pwa/service-worker-registration.ts` | Port cercano 1:1 (poll 15 min, confirm, reload). `SwUpdate` → `vite-plugin-pwa`. |
| `_services/download-manager/download-manager.service.ts` (progreso instalación/descarga SW) | — | 🔴 Sin port; maquinaria real de progreso de descarga PWA. |
| `presentation/splash-screen/splash-screen.service.ts` (fade `AnimationBuilder`) | — | 🔴 Sin lógica de splash en TS (posible CSS/HTML, no localizado). |
| `_modules/i18n/translation.service.ts` (`ngx-translate`) | `shared/lib/i18n/i18n-provider.tsx` (`react-intl`) + `es.ts` | 🔴 Sin `setLanguage`/`loadTranslations` (solo lectura, locale único `es`). |
| `_interceptors/interceptor.service.ts` (Bearer token) | `api-client.ts` request interceptor | ✅ Port 1:1 funcional. |
| `_interceptors/error-interceptor.service.ts` (timeout 30s, 401→logout, 500→Swal) | `api-client.ts` response interceptor | ✅ **Resuelto (WU3)** — antes 🔴. 401→`useAuthStore.getState().logout()` (respeta guardia anti-loop + token stale), 500→dialog `blocking-alert`, network taggeado `isNetworkError`. Timeout 30s ya estaba. Salvedad menor (regla 9): envelope network-error no byte-idéntico, sin consumidor vivo. Commit `20fbbc8`. |
| `_interceptors/connection-interceptor.service.ts` | — (hook `useOnlineStatus` en call-sites) | Idioma React; sin gate global de request. |

---

## 6. Estado de los "gaps" tras el SDD

Los 12 ítems que el reporte marcó como 🔴, re-verificados contra call-sites vivos de Angular:

| # | Ítem | Estado | Detalle (código) |
|---|---|---|---|
| 1 | `base.service.ts` estado reactivo | ↩️ No era gap | Grep de consumidores vivos de `items$`/`fetch()`: solo poblado de dropdowns; React ya lo cubre con `useEffect`+`listX()`+`useState`. Un base/store nuevo sería invención (regla 12) + mejora (regla 2). |
| 2 | `owner.service.ts::getOwnerDetailsById` | ↩️ No era gap | `OwnerDetailsComponent` importado (`owners.component.ts:32`) pero **nunca renderizado** (0 `<app-owner-details>` en HTML, sin ruta). `ngOnInit` no corre → método muerto. |
| 3 | `reseller.service.ts::deleteReSeller` | ↩️ No era gap | `resellers.component.ts:47` tiene **cuerpo VACÍO**; el botón engancha a un no-op, nunca llama al service. Dead code. |
| 4 | `MessageService` | ↩️ No era gap | Único call-site comentado (`sale-product-row.component.ts:96`). Dead code. |
| 5 | `store-module-state.service.ts` | ↩️ No era gap | Emisión viva pero suscriptor comentado (`nav-content.component.ts:126`) → efecto nulo. Dead code. |
| 6 | `data.service.ts` loaders | ↩️ No era gap | Llamadas comentadas (`register.component.ts:87-88`). Dead code. |
| 7 | `CsvProductService` | ✅ **Resuelto (WU4)** | Tokenizer con comillas + `category` requerido, espeja `validateProducts`. Commit `b82bbbf`. |
| 8 | auth `forgotPassword`/`signInGoogle`/`createUser`/`registration`/server-`logout` | ↩️ No era gap | Sin call-sites vivos (solo `registerOwner`, ya portado como `register`). Dead code. |
| 9 | Interceptor de errores | ✅ **Resuelto (WU3)** | 401→`authStore.logout()`, 500→dialog, network tag. Commit `20fbbc8`. Salvedad: envelope network-error no byte-idéntico (sin consumidor vivo). |
| 10 | `AddressModel`/`SocialNetworksModel`/`Message` | ↩️ No era gap | Cero usos en Angular. Dead code. |
| 11 | PWA: `preloading`, `LoadingService`/spinner | ✅ **Resuelto (SDD pwa-framework-parity)** | `preloading` portado (WU-1, `b0847cf`); spinner global HTTP cableado al `LoadingOverlay` existente (WU-2, `1424f07`). Verify PASS. |
| 11b | PWA: `download-manager`, `splash-screen` | ↩️ No era gap | Verificado en código: `download-manager` output nunca renderizado (`app.component.html` no bindea sus observables); `splash-screen` módulo/componente nunca importado. Dead code. |
| 12 | i18n `setLanguage`/`loadTranslations` | ↩️ No era gap | Solo `loadTranslations` vivo (cubierto por `es.ts` estático); `setLanguage` sin caller, locale único `es`. Dead code. |

**Balance:** todo cerrado. Resueltos con código: interceptor (WU3), CSV (WU4), `preloading` + spinner global (SDD `pwa-framework-parity`). El resto reclasificado como dead-code de Angular (regla 10/12 → no se portan). **Nada abierto.**

## 7. Extras React sin origen Angular (rule 12) — decididos por grep de consumidores

| Extra | Decisión | Motivo |
|---|---|---|
| `InventoryOfflineService.hasAvailableStock` | ✅ **Eliminado (WU-R)** | Solo call-sites de test, sin origen Angular. Commit `621d411`. |
| `OrderOfflineService.getByDateRange` | ✅ **Eliminado (WU-R)** | Solo tests; el propio comentario admitía "sin correlato Angular". |
| `store-http-service.deactivateStore` | ✅ **Eliminado (WU-R)** | Solo tests; Angular `store.service` no tiene deactivate/delete. |
| `ReSeller.login?` (campo) | ⏹️ **Conservado** | Consumidor vivo `reseller-edit.tsx:80` que espeja el control disabled de Angular (`edit-reseller-details.component.ts:129`). El modelo Angular lo omite pero el payload lo trae. |
| `ProductRepository.getCategoryRepository()` | ⏹️ Conservado | Consumidor vivo `inventory-offline-service.ts:202`; puente DI mecánico (regla 5). |
| `InventoryOfflineService.getAvailableQuantity` / `update` | ⏹️ Conservado | Consumidores vivos; descomposición mecánica / rename a auditar vs `updateInventoryEntry`. |
| `sales/lib/product-availability.ts` | ⏹️ Conservado | Extracción de la lógica inline `hasAvailableProductToSale` (regla 10 mecánica). |
| Tipos `SyncResult`/`EntityMergeResult`/`ParsedData`/`CsvParseResult` | ⏹️ Conservado | Formas necesarias de la capa de sync/CSV React. |
| `user-home.ts` / `current-user.ts` | ⏹️ Conservado | Extracciones de lógica inline Angular (mecánicas). |
| `menu-config.ts` / `global-config.ts` | ⏹️ Conservado | Config declarativa idiomática React. |

> **Nota metodológica:** varias divergencias 🟡 están documentadas en el código React como "fixes" de bugs Angular. El playbook (regla 8) exige consultar todo fix; en este ciclo se ratificó **KEEP** para todos (paridad = contratos, no bugs). El reporte constata la diferencia contra el source, no re-abre esos fixes.
