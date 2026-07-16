# Reporte de paridad de migración Angular → React

> **Fecha:** 2026-07-15
> **Alcance:** por cada `model`, `repository`, `service`, `online service` y `offline service` que existe en Angular, ¿existe su contraparte en React? ¿qué difiere?
> **Fuente de verdad:** ÚNICAMENTE el código fuente (`frontend/` Angular vs `frontend-react/` React). No se consultaron specs, openspec ni memorias.
> **Reglas aplicadas:** [playbook-migracion-servicios-angular-react.md](./playbook-migracion-servicios-angular-react.md) — migrar = espejar Angular, no mejorar. Toda estructura/campo/método que React tenga y Angular no, o viceversa, es un hallazgo de paridad.

## Leyenda

| Estado | Significado |
|---|---|
| ✅ | Paridad — contraparte presente y equivalente |
| ⚠️ | Difiere — existe contraparte pero hay diferencias de campo/firma/comportamiento |
| ❌ | Falta en React — sin contraparte |
| ➕ | Solo en React — artefacto sin correlato en Angular |
| 🔧 | Lo cubre el framework (Next.js/router/browser) — sin fichero 1:1 |

## Resumen ejecutivo

- **Modelos:** 33 archivos Angular. 22 en paridad, 8 difieren, 3 faltan (los 3 son *dead code* en Angular).
- **Repositorios:** 2/2 presentes, ambos con diferencias menores (drop de parámetro muerto, DI→param, un accessor extra en React).
- **Factories:** 2/2 presentes (renombradas). **Interfaces base:** `BaseService<T>` de Angular **no tiene contraparte** en React (abstracción no reproducida); `MessageService` falta (dead code).
- **Offline services:** 6/6 presentes. 2 en paridad (product, product-category), 4 difieren (sale-credit, inventory, expense, order) — varios *bug-fixes* conscientes no replicados + métodos JSON export faltantes.
- **Online services:** 2/2 presentes, ambos difieren (manejo de doble-slash en URL y aridad de `createProduct`).
- **Servicios de dominio/datos:** 20 archivos Angular mapeados; la mayoría portados (varios como `*-http-service`), con relocalizaciones estructurales (auth→store zustand, module/store-user fusionados).
- **Framework/infra:** cobertura parcial — 3 servicios Angular sin contraparte (splash-screen, download-manager, store-module-state) + diferencias en error-handling e i18n.

---

## 1. Modelos

| Archivo Angular | Contraparte React | Estado | Diferencias |
|---|---|---|---|
| `domain/entities/entries/inventory-entry.model.ts` | `packages/domain/src/models/inventory.ts` (`InventoryEntry`) | ✅ | — |
| `domain/entities/entries/inventory-entry-view.model.ts` | `packages/domain/src/models/inventory.ts` (`InventoryEntryView`) | ✅ | — |
| `domain/entities/expenses/expense.model.ts` | `packages/domain/src/models/expense.ts` (`Expense`) + `enums` (`ExpenseType`) | ✅ | `ExpenseTypeUtils` (helpers) no es campo de modelo, no evaluado |
| `domain/entities/features/feature.model.ts` | `packages/domain/src/models/store.ts` (`Feature`) | ✅ | — |
| `domain/entities/messages/message.model.ts` | — | ❌ | Sin `Message` ni `EMessageStatus`. **Dead code en Angular** (`MessageService` nunca se inyecta) → ausencia probablemente correcta |
| `domain/entities/modules/module.model.ts` | `packages/domain/src/models/store.ts` (`Module`) | ✅ | — |
| `domain/entities/orders/order-item.model.ts` | `packages/domain/src/models/order.ts` (`OrderItem`) | ⚠️ | El tipo anidado `InventoryEntryCost` renombra el campo `inventoryId` (Angular) → `id` (React). Divergencia real de nombre de campo en `productCosts[]` |
| `domain/entities/orders/order.model.ts` | `packages/domain/src/models/order.ts` (`Order`) + `enums` (`OrderType`) | ⚠️ | `Order` y `OrderType` en paridad. Faltan `ProductoVenta`/`DatosVenta` (shapes de ticket) — pero son **dead code** en Angular (solo referenciados en método comentado) |
| `domain/entities/owners/owner.model.ts` | `packages/domain/src/models/store.ts` (`Owner`) | ✅ | — |
| `domain/entities/owners/owner-store-module.model.ts` | `packages/domain/src/models/store.ts` (`OwnerStoreModule`) | ✅ | — |
| `domain/entities/product-categories/product-category.model.ts` | `packages/domain/src/models/product.ts` (`ProductCategory`) | ✅ | `ProductCategoryView` co-localizada en React (Angular la tiene separada) — no es issue |
| `domain/entities/products/product.model.ts` | `packages/domain/src/models/product.ts` (`Product`) | ✅ | — |
| `domain/entities/sale-credits/sale-credit.model.ts` | `packages/domain/src/models/sale-credit.ts` (`SaleCredit`) | ✅ | — |
| `domain/entities/stores/store.model.ts` | `packages/domain/src/models/store.ts` (`Store`) | ✅ | — |
| `domain/entities/store-user/store-user.model.ts` | `packages/domain/src/models/store.ts` (`StoreUser`) | ✅ | ⚠️ Nota: el archivo Angular exporta la clase/tipo con nombre literal `n` (posible artefacto de find/replace/minificación en el source Angular) — revisar a mano |
| `domain/entities/users/credentials.model.ts` | `packages/domain/src/models/auth.ts` (`Credentials`) | ✅ | — |
| `domain/entities/users/user.model.ts` | `packages/domain/src/models/store.ts` (`User`) | ✅ | — |
| `domain/resellers/reseller.model.ts` | `packages/domain/src/models/store.ts` (`ReSeller`) | ⚠️ | React **agrega** `login?: string` (no existe en el modelo Angular; Angular lo tiene solo como form-control runtime, no tipado) |
| `_services/auth/_models/address.model.ts` | — | ❌ | Sin correlato. **Dead code en Angular** (0 referencias) → ausencia correcta |
| `_services/auth/_models/auth.model.ts` | `packages/domain/src/models/auth.ts` (`AuthModel`) | ⚠️ | `expiresIn`: `Date` (Angular) vs `number` (React). Además el método `setAuth()` (clase Angular) no tiene correlato de modelo (lógica movida a `auth-store.ts`) |
| `_services/auth/_models/auth-user.model.ts` | `packages/domain/src/models/auth.ts` (`UserModel`) | ✅ | — |
| `_services/auth/_models/social-networks.model.ts` | — | ❌ | Sin correlato. **Dead code en Angular** (0 referencias) → ausencia correcta |
| `_services/auth/_models/store-module-features.model.ts` | `packages/domain/src/models/auth.ts` (`StoreModuleFeatures`) | ✅ | — |
| `_services/_models/base.model.ts` | `packages/domain/src/models/base.ts` | ⚠️ | React: `AuditableBaseModel extends BaseModel { id: unknown }`; Angular NO extiende nada y tiene `id` comentado. `BaseResponseModel`/`BaseError` en paridad. Las interfaces de contrato de UI (`IModelState`, `ICreateAction`, `IEditAction`, `IDeleteAction`, `IDeleteSelectedAction`, `IFetchSelectedAction`, `IUpdateStatusForSelectedAction`) **no están portadas** |
| `_services/_models/base-state.model.ts` | — | ❌ | `IBaseState`/`BaseState` (estado de selección de filas) sin ningún correlato en React |
| `_services/_models/order/cart-data.model.ts` | `shared/lib/stores/cart-store.ts` (`CartState`, análogo cercano) | ⚠️ | `CartData { items, itemsCount, total }`: React no tiene `itemsCount`; `total` es método computado, no campo |
| `_services/_models/order/cart-item.model.ts` | `shared/lib/stores/cart-store.ts` (`CartItem`) | ⚠️ | Angular `{ productId, name, quantity, price }` vs React `{ product: Product, quantity, price? }`: React embebe el `Product` entero (denormaliza distinto) y hace `price` opcional |
| `_services/csv/models/csv-product.model.ts` | `packages/domain/src/models/csv-product.ts` | ✅ | — |
| `_services/usage/store-usages.model.ts` | `admin/dashboard/lib/services/usage-http-service.ts` (`StoreUsages`) | ✅ | — |
| `_services/usage-tracker/usage.model.ts` | `shared/lib/usage/store-usage-tracker.ts` (`Usage`, `DailyUsage`) | ✅ | — |
| `presentation/_models/chart-data,model.ts` | `sales/lib/services/order-offline-service.ts` (`ChartData`) | ⚠️ | Angular `{ label: any, value: any }` vs React `{ label: Date, value: number }` (React estrecha los tipos) |
| `presentation/_models/top-product.model.ts` | `sales/lib/services/order-offline-service.ts` (`TopProduct`) | ✅ | — |
| `application/synchronization/data.file.model.ts` | `sync/lib/services/data-serializer-service.ts` | ⚠️ | `EDataFileName` (enum TS) → `ENTRY_NAMES` (const object, claves camelCase); `DataFile { name, content }` no se materializa en React (usa strings crudos + `Map`/`ParsedData`) |

### Solo en React (modelos)
- `packages/domain/src/models/base.ts` → `BaseModel { id: unknown }`: abstracción base-id que Angular **no tiene** (cada interfaz Angular declara su `id: string` inline). No cambia shapes concretos pero es una capa nueva.

---

## 2. Repositorios

| Archivo Angular | Contraparte React | Estado | Diferencias |
|---|---|---|---|
| `application/categories/product-category.repository.ts` | `sales/lib/repositories/product-category-repository.ts` | ⚠️ | Superficie pública 1:1. Diffs: (1) `activate/deactivateProductCategory(id, isActive)` — Angular tiene 2 params pero nunca lee el 2º; React expone 1 solo param (drop de param muerto). (2) DI: Angular inyecta `AuthService` para `selectedStoreId`; React recibe `storeId: string` explícito |
| `application/products/product.repository.ts` | `sales/lib/repositories/product-repository.ts` | ⚠️ | Todos los métodos Angular presentes 1:1. React **agrega** `getCategoryRepository()` (accessor sin correlato Angular, usado por `InventoryOfflineService`). DI: Angular inyecta `ProductCategoryRepository`+`AuthService`; React recibe `storeId`+`categoryRepository` explícitos |

### Solo en React (repositorios)
- `ProductRepository.getCategoryRepository()` — accessor público nuevo, no existe en Angular.

---

## 3. Factories e interfaces base

| Archivo Angular | Contraparte React | Estado | Diferencias |
|---|---|---|---|
| `_services/factories/product-category-service.factory.ts` (`productCategoryServiceFactory()`) | `sales/lib/services/product-category-service.factory.ts` (`createProductCategoryService(storeId)`) | ⚠️ | Misma lógica online/offline (`GlobalConfig.USE_ONLINE_SERVICE`). Diffs: nombre distinto; `inject()` (Angular DI) → `new` + `storeId` explícito |
| `_services/factories/product-service.factory.ts` (`productServiceFactory()`) | `sales/lib/services/product-service.factory.ts` (`createProductService(storeId)`) | ⚠️ | Igual que arriba: nombre distinto + `inject()`→`new`+`storeId` |
| `_services/base.service.ts` (`BaseService<T>`) | — | ❌ | **Angular tiene clase base compartida** con estado reactivo (`items$`/`isLoading$`/…), CRUD HTTP genérico (`create`/`getAllItems`/`update`/`delete`/…), `fetch()`, `patchState`, `Success/Failure`. React **no reproduce ninguna** clase base equivalente. Las interfaces React son planas (standalone) |
| `domain/interfaces/product.service.ts` (`abstract class ProductService extends BaseService<Product>`) | `packages/domain/src/services/product-service.ts` (`interface ProductService`) | ⚠️ | Los 12 métodos y firmas coinciden exactamente (Observable→Promise). Diferencia estructural: React **no extiende** ninguna `BaseService` |
| `domain/interfaces/message.service.ts` (`MessageService extends BaseService<Message>`) | — | ❌ | Sin contraparte. **Dead code en Angular** (0 call-sites) → ausencia probablemente correcta |

---

## 4. Offline services

| Archivo Angular | Contraparte React | Estado | Diferencias |
|---|---|---|---|
| `application/categories/product-category-offline.service.ts` | `sales/lib/services/product-category-offline-service.ts` | ✅ | Los 6 métodos públicos en paridad (Observable→Promise) |
| `application/products/product-offline.service.ts` | `sales/lib/services/product-offline-service.ts` | ✅ | Los 14 métodos públicos en paridad 1:1 |
| `application/credits/sale-credit-offline.service.ts` | `sales/lib/services/sale-credit-offline-service.ts` | ⚠️ | (1) **Falta `getSaleCreditsJson(): string`** que Angular sí expone. (2) `getActiveSaleCreditsPriceBetweenDates` es `private` en Angular pero **pública** en React |
| `application/entries/inventory-offline.service.ts` | `inventory/lib/services/inventory-offline-service.ts` | ⚠️ | (1) **Falta método público `hasAvailableProductToSale`** (movido a función standalone). (2) `getAvailableInventoryCosts` gana 3er param opcional `eligibility`. (3) `getActiveInventoryEntriesStorage`/`getInventoryEntriesView`: `private`→pública, pierden guard `if(product)` y `productName` real. (4) `getInventoryCategoriesView` saltea productos con `total 0`/inexistentes (Angular no). (5) `filterInventoryEntries` params requeridos→opcionales. (6) `updateAvailableInventories` reescrito (corrige bug de orden de resta). (7) **Agrega** `update(...)` y `getAvailableQuantity(...)` sin correlato |
| `application/expenses/expense-offline.service.ts` | `expenses/lib/services/expense-offline-service.ts` | ⚠️ | (1) **Falta `getExpensesJson(): string`**. (2) `createExpense(5 params)`→`create(input)` (objeto). (3) `updateExpense(6 params)`→`update(id, patch)`. (4) `getExpensesInDay(date)`: Angular **ignora** `date` (bug), React lo honra. (5) `filterExpensesObservable` params requeridos→opcionales |
| `application/orders/order-offline.service.ts` | `sales/lib/services/order-offline-service.ts` | ⚠️ | (1) **Falta método público `updateOrders(orders)`**. (2) `getOrdersInDay(date)`: Angular ignora `date` (bug), React lo honra. (3) `getActiveOrdersPriceBetweenDates`: `private`→pública. (4) `getLastMonthSales`/`getLastMonthSaleProfits`: React **no replica** el bug de `startDate` recalculado. (5) `getTopProducts…`: Angular zero-arg (bug top ignorado), React agrega param `top=5` y corrige. (6) `filterOrdersObservable` params requeridos→opcionales. (7) `createOrder`: `details`/`client` requeridos→opcionales con default `''` |

### Solo en React (offline)
- `InventoryOfflineService.update(entryId, productId, quantity, costPrice)`
- `InventoryOfflineService.getAvailableQuantity(productId)`
- `InventoryOfflineService.getAvailableInventoryCosts(..., eligibility?)` — 3er param no existe en Angular

> **Nota de paridad importante:** varios de los ⚠️ de offline son *bug-fixes conscientes* de bugs reales de Angular (fechas ignoradas, `startDate` mal recalculado, top hardcodeado). Según el playbook (regla 8), un bug se **consulta antes de arreglar** — estos cambios de comportamiento merecen confirmación explícita si el objetivo es paridad 1:1 literal.

---

## 5. Online services

| Archivo Angular | Contraparte React | Estado | Diferencias |
|---|---|---|---|
| `application/categories/product-category-online.service.ts` | `sales/lib/services/product-category-online-service.ts` | ⚠️ | Superficie idéntica. En `updateProductCategory` y `getMaxOrder` Angular genera doble-slash (`//`) en la URL (bug real); React **normaliza** a un slash → la URL HTTP difiere |
| `application/products/product-online.service.ts` | `sales/lib/services/product-online-service.ts` | ⚠️ | 11/12 métodos idénticos, incluyendo el doble-slash mirroreado verbatim (a diferencia del sibling de categorías). Único diff: `createProduct` gana 9º param `_barcode?` (sin uso, para conformar con la interfaz compartida) |

> **Inconsistencia interna a revisar:** el online de categorías *normaliza* el doble-slash pero el de productos lo *replica*. Dos decisiones opuestas para el mismo bug de Angular.

---

## 6. Servicios de dominio / datos

| Archivo Angular | Contraparte React | Estado | Diferencias |
|---|---|---|---|
| `_services/auth/auth.service.ts` | `shared/lib/stores/auth-store.ts` (zustand) + `shared/lib/auth/current-user.ts` + `auth/routes/loaders.ts` | ⚠️ | `login`/`logout`/`getUserByToken` en paridad. `currentUser$`/`isLoading$` → estado del store (transform válida). `getCurrentUserDefaultUrl()` sin contraparte exacta (gap menor). `registration`/`forgotPassword`/`getSocialToken`/`signInGoogle` faltan pero son dead code. Extra: `setUser`/`updateUser` |
| `_services/auth/auth-http/auth-http.service.ts` | `shared/lib/http/auth-http-service.ts` | ✅ | 3 métodos vivos portados (`login`, `registerOwner`→`register`, `getUserByToken`→`getMe`). Resto dead code |
| `_services/auth/auth-http/fake/auth-fake-http.service.ts` | — | ❌ | Dead code en Angular → ausencia correcta |
| `_services/authorization/authorization.service.ts` | `shared/lib/auth/authorization-service.ts` | ⚠️ | `isUserAuthorize(features)`→`isUserAuthorized(user, featureIds, storeId)` (agrega `storeId`). Resto de guards 1:1. Extra: `isSuperAdmin`/`isOwnerAdmin`/`isReSeller` (helpers triviales) |
| `_services/connection/connection.service.ts` | `shared/lib/auth/connectivity-service.ts` + `shared/lib/hooks/use-online-status.ts` | ➕ | Angular `ConnectionService` es dead code; React lo usa activamente + agrega hook. Funcionalmente “solo en React vivo” |
| `_services/storage/storage.service.ts` | `shared/lib/auth/storage-service.ts` | ⚠️ | 4 métodos vivos portados. Diff real: `setCurrentUser` en React limpia `password:''` antes de persistir; Angular guarda el objeto completo. `currentUser$`/`authorize$`/`landingPage$` faltan (dead code) |
| `application/synchronization/data-serializer.service.ts` | `sync/lib/services/data-serializer-service.ts` | ⚠️ | Renombres `serializeEncryptedZip`→`export`, `deserializeEncryptedZip`→`import`. Angular descarga vía DOM y devuelve `void`; React devuelve `Uint8Array`. Angular usa `alert()`; React lanza `WrongPasswordError`/`CorruptFileError` |
| `application/synchronization/data-synchronizer.service.ts` | `sync/lib/services/data-synchronizer-service.ts` | ⚠️ | `synchronizeFiles`→`sync`. Entrada `DataFile[]`→`ParsedData`; retorno `Result`→`SyncResult`. React **corrige** el bug copy-paste de Angular (Expenses/SaleCredits emitiendo `OrdersUnexpectedError`) |
| `application/entries/currency.service.ts` | `statistics/lib/services/currency-service.ts` | ✅ | `setCurrency`/`getCurrentCurrency`, misma key, mismo default (CUP/370). Clase→funciones (neutro) |
| `_services/usage-tracker/store-usage-tracker.service.ts` | `shared/lib/usage/store-usage-tracker.ts` + `use-store-usage-tracker.ts` | ⚠️ | `startTracking`/`stopTracking`→ciclo de vida `useEffect`. `cleanOldData(days)`→`cleanOldStoreUsage(userId, storeId, days)`. `registerActivity` (priv)→`registerStoreActivity` (pub). Comportamiento preservado |
| `_services/usage/usage.service.ts` | `admin/dashboard/lib/services/usage-http-service.ts` | ⚠️ | `getLastWeekUsageDaysCount`→`getStoresLastWeek`, `getLastMonthUsageDaysCount`→`getStoresLastMonth`. Angular extiende `BaseService<Usage>`; React no (sin call-sites vivos) |
| `_services/features/feature.service.ts` | `admin/features/lib/services/feature-http-service.ts` | ✅ | Solo `activateFeatures` vivo, portado. Resto dead code |
| `_services/owner/owner.service.ts` | `admin/owners/lib/services/owner-http-service.ts` | ✅ | `getOwners`/`getOwnerById`/`createOwner`/`editOwner`/`deleteOwner` 1:1. Falta `getOwnerDetailsById` (dead code) |
| `_services/reseller/reseller.service.ts` | `admin/resellers/lib/services/reseller-http-service.ts` | ✅ | `getReSellers`/`getReSellerById`/`createReSeller`/`editReSeller` 1:1. Faltan `deleteReSeller` (stub vacío) y `getReSellerDetailsById` (dead code) |
| `_services/store/store.service.ts` | `management/stores/lib/services/store-http-service.ts` | ⚠️ | Métodos propios 1:1. **Fusiona** `getModulesToStore` (de `ModuleService`) y `listOwners` (de `OwnerService`) aquí — relocalización estructural, mismos endpoints |
| `_services/storeuser/store-user.service.ts` | (fusionado en `user-http-service.ts::createUser`) | ⚠️ | Solo `createStoreUser` vivo; portado dentro de `userHttpService.createUser` (mismo endpoint `/v1/storeusers`). No hay `store-user-http-service.ts` propio |
| `_services/user/user.service.ts` | `management/users/lib/services/user-http-service.ts` (+ `profile/lib/services/profile-http-service.ts`) | ⚠️ | `getUsers`/`getUserById`/`editUser`/`activateUser`/`deleteUser` 1:1. `changePassword` vive en `profile-http-service.ts` |
| `_services/module/module.service.ts` | (fusionado en `store-http-service.ts::getModulesToStore`) | ✅ | Único método vivo portado 1:1, dentro de `store-http-service.ts` |
| `_services/data/data.service.ts` | — | ✅ | `loadProducts`/`loadCategories` comentados en su único call-site → dead code. Ausencia correcta |
| `_services/csv/csv-product.service.ts` | `sales/lib/csv-product-parser.ts` (`parseCsvProducts`) | ✅ | Misma validación. Angular `Papa.parse`→`Observable`; React separa lectura (`FileReader`) de parseo síncrono |

### Solo en React (dominio/datos)
- `shared/lib/hooks/use-online-status.ts` — hook de conectividad (infra offline-first; Angular nunca tuvo consumidor vivo).
- `shared/lib/usage/use-store-usage-tracker.ts` — hook que reemplaza la suscripción a `router.events`/`ngOnInit` (en Angular vive inline en `app.component.ts`).
- `profile/lib/services/profile-http-service.ts` — migración de `UserService.editUser`/`changePassword` del módulo `presentation/profile/` de Angular (no es realmente sin correlato).

---

## 7. Servicios de framework / infraestructura

| Archivo Angular | Contraparte React | Estado | Notas |
|---|---|---|---|
| `_interceptors/interceptor.service.ts` | `shared/lib/http/api-client.ts` (interceptor request) | ✅ | Lee token con `getTokenFromLocalStorage()` y setea `Authorization: Bearer` en cada request |
| `_interceptors/loading-interceptor.service.ts` + `_services/loading.service.ts` | `shared/lib/stores/loading-store.ts` (zustand) en `api-client.ts` | ✅ | Contador idéntico: `start()`++, `stop()` `Math.max(0,n-1)`, limpia `isLoading` en 0. Ya cerrado (commit `1424f07`) |
| `_interceptors/connection-interceptor.service.ts` | `connectivity-service.ts` + `use-online-status.ts` | ⚠️ | Angular gatea request en interceptor (con `throw` comentado = no-op). React tiene `isOnline()`/hook pero NO enganchado como interceptor; solo guard pre-submit en `login`/`register` |
| `_interceptors/error-interceptor.service.ts` | `shared/lib/http/api-client.ts` (interceptor response) | ⚠️ | Cubre network/timeout, 401→logout, 500→diálogo. Angular maneja explícitamente 403/404/503 (re-throw); React los deja caer al `reject` genérico (mismo resultado, sin distinción explícita) |
| `_services/app-init.service.ts` | `shared/lib/stores/auth-store.ts` (`initialize()` a nivel módulo) | ✅ | Corre `getUserByToken()` antes de loaders — puerto de `APP_INITIALIZER` |
| `_services/icon-setup.service.ts` | — | 🔧 | Angular registra fuente Material Icons (`MatIconRegistry`). React no usa Angular Material; iconos son SVG inline (`icons.tsx`). Concepto no existe en React |
| `_services/global-error-handler.service.ts` | `root.tsx` (`ErrorBoundary`) | ⚠️ | Angular `ErrorHandler` global (cualquier excepción JS). React `ErrorBoundary` de React Router cubre errores de render/loader, **no** async sueltos (`window.onerror`/`unhandledrejection`). Cobertura menor |
| `_services/shared/store-module-state.service.ts` | — | ❌ | `BehaviorSubject<boolean>` con `modulesUpdated()`. Sin correlato ni consumidor equivalente en React |
| `presentation/splash-screen/splash-screen.service.ts` | — | ❌ | Angular anima fade-out del splash al arrancar. React no tiene splash screen |
| `_modules/i18n/translation.service.ts` | `shared/lib/i18n/i18n-provider.tsx` | ⚠️ | Angular `@ngx-translate` vs React `react-intl`. Misma key `localStorage['language']`, mismo default `es`. Angular expone `setLanguage()`/`loadTranslations()` dinámicos; React solo resuelve locale al montar (sin setter/UI de cambio en caliente) |
| `_services/update/update.service.ts` | `shared/lib/pwa/service-worker-registration.ts` | ✅ | Registra SW, confirm de update, poll de 15 min — replica `SwUpdate`→Swal→`activateUpdate`+reload |
| `_services/download-manager/download-manager.service.ts` | — | ❌ | Angular trackea progreso de descarga/instalación del SW (`progress$`/`isDownloading$`). React solo tiene `postMessage(PRECACHE_APP_CHUNKS)` sin tracking ni UI |
| `_services/preloading.service.ts` | 🔧 | 🔧 | Estrategia de preload de rutas Angular — lo cubre el router/build de Next.js |

### Solo en React (infra sin correlato Angular)
- `app/service-worker.ts` — SW propio (Workbox/`vite-plugin-pwa`): precache, network-first para navegación, cache-first para estáticos, mensajes `PRECACHE_APP_CHUNKS`/`SKIP_WAITING`. Angular delega todo a `@angular/service-worker` (`ngsw-config.json` declarativo); es la contraparte imperativa de esa config.
- `app/shared/lib/pwa/service-worker-registration.ts` — además de cubrir `UpdateService`, centraliza el registro del SW (en Angular lo hace el CLI automáticamente).

---

## Hallazgos de paridad destacados (para decisión)

Estos son los puntos que, según el playbook, **frenan y se consultan** antes de dar la migración por cerrada:

1. **`BaseService<T>` de Angular no existe en React** (regla 12). Angular tiene una clase base compartida con estado reactivo + CRUD genérico que `ProductService`/`MessageService`/`UsageService` extienden. React la aplanó. → decisión: ¿se espeja la clase base o se ratifica la divergencia?
2. **Bug-fixes conscientes no replicados en offline services** (regla 8): `getOrdersInDay`/`getExpensesInDay` ignorando `date`, `startDate` mal recalculado en `getLastMonthSales`, `top` hardcodeado en `getTopProducts…`. Cada uno cambia el resultado real vs Angular.
3. **Métodos JSON export faltantes**: `getSaleCreditsJson`, `getExpensesJson`, `updateOrders` presentes en Angular, ausentes en React.
4. **Inconsistencia doble-slash**: online de categorías normaliza la URL, online de productos la replica. Elegir uno.
5. **Métodos/params extra en React sin correlato Angular**: `ProductRepository.getCategoryRepository()`, `InventoryOfflineService.update`/`getAvailableQuantity`/param `eligibility`, `authorization` helpers.
6. **Cambios de visibilidad** `private`→`public` no justificados por la migración: `getActiveSaleCreditsPriceBetweenDates`, `getActiveOrdersPriceBetweenDates`, `getActiveInventoryEntriesStorage`, `registerActivity`.
7. **Divergencias de campo en modelos**: `InventoryEntryCost.inventoryId`→`id`, `ReSeller.login?` agregado, `CartItem` embebe `Product`, `AuthModel.expiresIn` `Date`→`number`.
8. **Infra sin contraparte**: `store-module-state.service`, `splash-screen.service`, `download-manager.service` (esta última con pérdida de UI de progreso de descarga).

> Los ítems marcados como *dead code en Angular* (message, address, social-networks, fake-http, varios métodos) NO son gaps reales de paridad: Angular no los usa. Se listan por completitud.
