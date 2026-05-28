# Angular Frontend Analysis Reference

Source: `/home/coder/sources/appollo/store-mgmt/frontend/`

## Application Identity

- Name: "Vende De Todo"
- Short name: "VendeDTo"
- Theme color: #1976d2
- Display: standalone PWA
- Start URL: /login

## Routing Tree

### Public Routes (no guard, no layout)

| Path | Component | Notes |
|------|-----------|-------|
| `/` | LandingDeepComponent | Landing/marketing page |
| `/login` | LoginComponent | Login form |
| `/register` | RegisterComponent | Registration form |
| `/cookies-private` | CookiesPrivateComponent | Cookie policy |
| `/private-police` | PrivatePoliceComponent | Privacy policy |
| `/terms-conditions` | TermsConditionsComponent | Terms and conditions |

### Authenticated Routes (inside ClientLayoutComponent)

Default redirect: `'' -> /sales/sale`

#### Admin (SuperAdminAuthGuard)

| Path | Component | EFeatures |
|------|-----------|-----------|
| `/admin/dashboard` | AdminDashboardComponent | AdminDashboard (16) |
| `/admin/stores` | StoresComponent | AdminStores (15) |
| `/admin/resellers` | ResellersComponent | ReSellers (13) |
| `/admin/resellers/create` | CreateResellerComponent | ReSellers (13) |
| `/admin/resellers/edit/:id` | EditResellerComponent | ReSellers (13) |
| `/admin/features` | FeaturesComponent | Features (14) |
| `/admin/roles` | OwnersComponent | Roles (12) |

#### Admin Owners (ReSellerAuthGuard)

| Path | Component | EFeatures |
|------|-----------|-----------|
| `/admin/owners` | OwnersComponent | Owners (11) |
| `/admin/owners/create` | CreateOwnerComponent | Owners (11) |
| `/admin/owners/edit/:id` | EditOwnerComponent | Owners (11) |

#### Sales (AuthGuard)

| Path | Component | EFeatures |
|------|-----------|-----------|
| `/sales/products` | ProductsComponent | Products (20) |
| `/sales/sale` | SaleComponent | Sale (21) |
| `/sales/today-orders` | TodayOrdersComponent | TodayOrders (22) |
| `/sales/today-credits` | TodaySaleCreditsComponent | CreditSale (110) |
| `/sales/credits` | SaleCreditsComponent | CreditSale (110) |
| `/sales/orders` | OrdersComponent | SalesHistory (100) |
| `/sales/stats` | TodayStatsComponent | Sale (21) |

#### Expenses (AuthGuard)

| Path | Component | EFeatures |
|------|-----------|-----------|
| `/expenses/today` | ExpensesTodayComponent | TodayExpenses (80) |
| `/expenses/expenses` | ExpensesComponent | ExpensesHistory (102) |

#### Inventory (AuthGuard)

| Path | Component | EFeatures |
|------|-----------|-----------|
| `/inventory/available` | InventoryAvailableComponent | Available (30) |
| `/inventory/today-entries` | TodayEntriesComponent | Entries (31) |
| `/inventory/today-quantities` | InventoryTodayQuantitiesComponent | InventoryTodayQuantities (34) |
| `/inventory/today-sales-profit` | InventoryTodaySalesProfitComponent | InventoryTodaySaleProfit (35) |
| `/inventory/egress` | EgressComponent | Egress (33) |
| `/inventory/entries` | EntriesComponent | EntriesHistory (101) |

#### Synchronization (AuthGuard)

| Path | Component | EFeatures |
|------|-----------|-----------|
| `/synchronization/export` | SendDataComponent | Send (40) |
| `/synchronization/import` | ReceiveDataComponent | Receive (42) |

#### Statistics (AuthGuard)

| Path | Component | EFeatures |
|------|-----------|-----------|
| `/statistics/dashboard` | DashboardComponent | Dashboard (60) |

#### Reports (AuthGuard)

| Path | Component | EFeatures |
|------|-----------|-----------|
| `/reports/today` | InventoryTodaySaleComponent | TodayReports (50) |

#### Management (AdminAuthGuard)

| Path | Component | EFeatures |
|------|-----------|-----------|
| `/management/stores` | EditStoreComponent | Stores (73) |
| `/management/stores/create` | EditStoreComponent | Stores (73) |
| `/management/stores/edit/:id` | EditStoreComponent | Stores (73) |
| `/management/users` | UsersComponent | Users (72) |
| `/management/users/create/:storeId` | CreateStoreUserComponent | Users (72) |
| `/management/users/edit/:id` | EditUserComponent | Users (72) |
| `/management/configurations` | ConfigurationsComponent | Configurations (74) |

#### Profile (AuthGuard)

| Path | Component | EFeatures |
|------|-----------|-----------|
| `/profile/edit` | EditProfileComponent | Profile (70) |
| `/profile/change-password` | ChangePasswordComponent | Profile (70) |

#### Help (no feature gate)

| Path | Component |
|------|-----------|
| `/help/tutorial` | TutorialComponent |

## Domain Models

### Base Models

```typescript
BaseModel { id: any }
AuditableBaseModel extends BaseModel {
  isActive: boolean
  createdDate: Date
  createdByName: string
  updatedDate?: Date
  updatedByName?: string
}
BaseResponseModel<T> { data: T, succeeded: boolean, message: string, actionCode: number, errors: BaseError[] }
BaseError { code: string, description: string }
```

### Product

```typescript
Product extends AuditableBaseModel {
  id: string
  name: string
  barcode?: string
  categoryId: string
  categoryName: string
  price: number
  order: number
  availableToSale: boolean
  discountFromInvantory: boolean
  businessId: string
}
```

### ProductCategory

```typescript
ProductCategory {
  id: string
  name: string
  order: number
  isActive: boolean
}
```

### Order

```typescript
Order extends AuditableBaseModel {
  id: string
  orderItems: OrderItem[]
  total: number
  itemsCount: number
  date: Date
  type: OrderType
  paymentType: PaymentType
  isCredit: boolean
  description: string
}

OrderItem {
  productId: string
  productName: string
  categoryId: string
  categoryName: string
  name: string
  quantity: number
  price: number
  productBusinessId: string
  productCosts: InventoryEntryCost[]
  order: number
}

enum OrderType { Normal=1, Mayorista=2, Merma=3, Ajuste=4, Otro=100 }
```

### InventoryEntry

```typescript
InventoryEntry extends AuditableBaseModel {
  id: string
  productId: string
  categoryId: string
  quantity: number
  available: number
  costPrice: number
  date: Date
  order: number
}

InventoryEntryView {
  id: string
  productId: string
  productName: string
  quantity: number
  costPrice: number
  date: Date
  isActive: boolean
}
```

### Expense

```typescript
Expense extends AuditableBaseModel {
  id: string
  type: ExpenseType
  total: number
  date: Date
  paymentType: PaymentType
  note: string
}

enum ExpenseType {
  Salario=1, Transporte=2, Alquiler=3, Corriente=4, Agua=5,
  Comida=6, Operaciones=7, Viaje=8, Divisa=9, Impuesto=10, Otro=100
}
```

### SaleCredit

```typescript
SaleCredit extends AuditableBaseModel {
  id: string
  orderId: string
  client: string
  total: number
  date: Date
  paid: number
  isPaid: boolean
  paidDate: Date
  paidType: PaymentType
  note: string
}
```

### User / StoreUser

```typescript
User { id: string, fullName: string, cellPhone: string, email: string, isActive: boolean }
StoreUser { id: string, storeId: string, storeName: string, login: string, fullName: string, cellPhone: string, email: string, isActive: boolean }
Credentials { userId: string, oldPassword: string, newPassword: string }
```

### Store

```typescript
Store {
  id: string, name: string, displayName: string,
  ownerId: string, ownerName: string,
  address: string, description: string,
  approved: boolean, paymentStartDate: Date,
  modules: Module[], isActive: boolean
}
```

### Owner

```typescript
Owner extends AuditableBaseModel {
  id: string, userId: string, fullName: string,
  cellPhone: string, email: string, description: string,
  guest: boolean, storeModules: OwnerStoreModule[],
  reSellerId: string, reSellerName: string, approved: boolean
}

OwnerStoreModule { storeName: string, storeModuleTotalCurrentPrice: number }
```

### ReSeller

```typescript
ReSeller extends AuditableBaseModel {
  id: string, userId: string, fullName: string,
  percentDiscountPrice: number, discountPrice: number,
  cellPhone: string, email: string, description: string, guest: boolean
}
```

### Feature / Module

```typescript
Feature { id: number, name: string, moduleId: number, displayName: string, description: string, order: number, availableToStore: boolean }
Module { id: number, name: string, price: number, currentPrice: number, priceIncluded: boolean, discountText: string, selected: boolean }
```

### Shared Enums

```typescript
enum PaymentType { Efectivo=1, Tarjeta=2, Zelle=3 }
enum ERoles { SuperAdmin=1, OwnerAdmin=2, StoreUser=3, ReSeller=4 }
enum EModules { Administration=1, Sales=2, Inventory=3, Synchronization=4, Reports=5, Statistics=6, Management=7, Expenses=8, Billing=9, Histories=10, Credits=11 }
enum EFeatures {
  Tenants=10, Owners=11, Roles=12, ReSellers=13, Features=14, AdminStores=15, AdminDashboard=16,
  Products=20, Sale=21, TodayOrders=22, TodayStats=23,
  Available=30, Entries=31, Egress=33, InventoryTodayQuantities=34, InventoryTodaySaleProfit=35,
  Send=40, Download=41, Receive=42,
  TodayReports=50, Dashboard=60,
  Profile=70, Users=72, Stores=73, Configurations=74,
  TodayExpenses=80, Billing=90,
  SalesHistory=100, EntriesHistory=101, ExpensesHistory=102, CreditsHistory=103,
  CreditSale=110
}
```

## Auth Model

```typescript
AuthModel { login: string, authToken: string, refreshToken: string, expiresIn: Date }

UserModel extends AuthModel {
  id: string, fullName: string, cellPhone: string, email: string,
  isActive: boolean, password: string,
  roles: StoreModuleFeatures[],
  featureIds: number[],
  storeModuleIds: number[],
  isSuperAdmin: boolean, isOwnerAdmin: boolean, isReSeller: boolean,
  selectedStoreId: string
}

StoreModuleFeatures { storeId: string, storeName: string, moduleId: number, featureIds: number[] }
```

## localStorage Keys

| Data | Key Pattern |
|------|-------------|
| Products | `lizoft.store-products-{selectedStoreId}` |
| Categories | `lizoft.store-product-categories-{selectedStoreId}` |
| Inventory Entries | `lizoft.store-inventory-entries-{selectedStoreId}` |
| Orders | `lizoft.store-orders-{selectedStoreId}` |
| Expenses | `lizoft.store-expenses-{selectedStoreId}` |
| Sale Credits | `lizoft.store-saleCredits-{selectedStoreId}` |
| Auth token | `token` |
| Current user | `currentUser` |
| Auth model | `{appVersion}-authf496fc5a9f17` |
| Language | `language` |

## Navigation Menu Structure

| Group | Item | Route | EFeatures | EModules |
|-------|------|-------|-----------|----------|
| Admin | Admin Dashboard | /admin/dashboard | 16 | Administration |
| Admin | Stores (admin) | /admin/stores | 15 | Administration |
| Admin | Owners | /admin/owners | 11 | Administration |
| Admin | Resellers | /admin/resellers | 13 | Administration |
| Admin | Features | /admin/features | 14 | Administration |
| Sales | Products | /sales/products | 20 | Sales |
| Sales | Sale | /sales/sale | 21 | Sales |
| Sales | Today Orders | /sales/today-orders | 22 | Sales |
| Sales | Today Sale Credits | /sales/today-credits | 110 | Credits |
| Sales | Today Stats | /sales/stats | 23 | Sales |
| Sales | Sale Credits History | /sales/credits | 110 | Credits |
| Sales | Order History | /sales/orders | 100 | Histories |
| Inventory | Available | /inventory/available | 30 | Inventory |
| Inventory | Today Entries | /inventory/today-entries | 31 | Inventory |
| Inventory | Today Quantities | /inventory/today-quantities | 34 | Inventory |
| Inventory | Today Sales Profit | /inventory/today-sales-profit | 35 | Inventory |
| Inventory | Egress | /inventory/egress | 33 | Inventory |
| Inventory | Entries History | /inventory/entries | 101 | Histories |
| Expenses | Today Expenses | /expenses/today | 80 | Expenses |
| Expenses | Expenses History | /expenses/expenses | 102 | Histories |
| Synchronization | Export | /synchronization/export | 40 | Synchronization |
| Synchronization | Import | /synchronization/import | 42 | Synchronization |
| Reports | Today Reports | /reports/today | 50 | Reports |
| Statistics | Dashboard | /statistics/dashboard | 60 | Statistics |
| Management | Stores | /management/stores | 73 | Management |
| Management | Users | /management/users | 72 | Management |
| Management | Configurations | /management/configurations | 74 | Management |

## Guards

| Guard | Checks |
|-------|--------|
| AuthGuard | User logged in + feature check (SuperAdmin/OwnerAdmin bypass) |
| SuperAdminAuthGuard | isSuperAdmin === true |
| AdminAuthGuard | isSuperAdmin OR isOwnerAdmin + feature check |
| ReSellerAuthGuard | isSuperAdmin OR isReSeller + feature check |
| CanDeactivateGuard | Dirty form protection with save/discard/cancel dialog |

## Menu Visibility Logic

1. Items with no `feature` or no `module` are always shown
2. Items with both fields shown only if `AuthorizationService.isUserAuthorize([child.feature])` returns true
3. Authorization chain: isSuperAdmin (all access) > isReSeller (check featureIds) > isOwnerAdmin (check featureIds) > StoreUser (check storeId + featureIds in roles)
4. Empty groups are hidden
5. Session expiry blocks access

## PWA Configuration

- Service worker: ngsw-worker.js, registers with 5s delay
- Asset caching: prefetch for core assets (index.html, CSS, JS, icons, images, data files, fonts)
- Lazy caching: other assets
- API caching: freshness strategy for general API (100 entries, 1-day TTL, 10s timeout), performance strategy for categories/products/stores (200 entries, 7-day TTL)

## Export/Import Format

Export creates a password-encrypted ZIP (via @zip.js/zip.js):
- Password: `userPassword + selectedStoreId`
- Filename: `datos{YYMMDD-HHmm}.zip`
- Contains 6 JSON files: categories.json, products.json, inventory-entries.json, orders.json, expenses.json, sale-credits.json

Import: decrypts ZIP, processes categories first (referential integrity), then upserts all entities by ID.

## App Configuration

```typescript
AppConfig = {
  offline: { maxDaysOffline: 35 },
  api: { timeout: 30000, retryAttempts: 3 },
  storage: { prefix: 'vdt_' }
}

GlobalConfig = {
  ONLY_DATE_FORMAT: 'dd/MM/yyyy',
  DATE_TIME_FORMAT: 'dd/MM/yyyy, h:mm a',
  TIME_FORMAT: 'h:mm a',
  USE_ONLINE_SERVICE: false
}
```

## App Shell Structure

```
ClientLayoutComponent
├── NavigationComponent (sidebar)
│   └── NavContentComponent (filtered menu items)
│       ├── NavGroupComponent (group headers)
│       └── NavItemComponent (menu links)
├── NavBarComponent (top bar)
│   ├── NavLeftComponent (hamburger toggle)
│   └── NavRightComponent (cart, user dropdown, order creation)
├── BreadcrumbComponent
├── <router-outlet> (page content)
└── ClientFooterComponent
```

NavRightComponent manages the shopping cart inline: item count badge, quantity adjustment, payment type selection, credit sale toggle, total/change calculation, and order submission.

## i18n

- Library: @ngx-translate/core
- Default: Spanish (es)
- Files: es.ts (complete), en.ts, fr.ts, de.ts, ch.ts, jp.ts (skeleton only)
- Storage: localStorage['language']
