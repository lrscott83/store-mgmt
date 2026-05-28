# PRD: Vende De Todo - Store POS Frontend

## 1. Executive Summary

Vende De Todo is a point-of-sale (POS) application designed for small businesses that need to operate without a reliable internet connection. The application is a Progressive Web App (PWA) that functions entirely offline after initial authentication, storing all business data locally on the device.

This PRD covers the migration of the existing Angular 21 frontend to a React 19 + React Router v7 SSR application within a pnpm + Turborepo monorepo (`frontend-react/`). The backend (.NET API) remains unchanged.

## 2. Product Vision

Enable small business owners to manage their entire sales operation — products, inventory, orders, expenses, and reporting — from any device, even without internet connectivity. The app prioritizes speed, reliability, and simplicity over feature richness.

## 3. Target Users and Roles

### Role Hierarchy

| Role | ID | Description | Access Level |
|------|----|-------------|-------------|
| SuperAdmin | 1 | Platform administrator | Full access to all features across all stores |
| ReSeller | 4 | Reseller partner | Manages owners assigned to them |
| OwnerAdmin | 2 | Store owner/administrator | Full access to their stores, manages users and configuration |
| StoreUser | 3 | Store employee | Access limited to features assigned by their OwnerAdmin per store |

### Permission Model

Access control is feature-based with module grouping:

- Each route is associated with one or more `EFeatures` (numeric IDs)
- Features are grouped into `EModules` (Administration, Sales, Inventory, etc.)
- A user's `roles` array contains `StoreModuleFeatures` entries: `{ storeId, storeName, moduleId, featureIds[] }`
- Menu items are visible only if the user has the corresponding feature ID
- SuperAdmin and OwnerAdmin roles bypass feature checks (full access)
- ReSeller role has a separate feature set (`featureIds[]` at user level)

### Feature IDs Reference

```
Administration: Tenants(10), Owners(11), Roles(12), ReSellers(13), Features(14), AdminStores(15), AdminDashboard(16)
Sales:          Products(20), Sale(21), TodayOrders(22), TodayStats(23)
Inventory:      Available(30), Entries(31), Egress(33), TodayQuantities(34), TodaySalesProfit(35)
Sync:           Send(40), Download(41), Receive(42)
Reports:        TodayReports(50)
Statistics:     Dashboard(60)
Profile:        Profile(70)
Management:     Users(72), Stores(73), Configurations(74)
Expenses:       TodayExpenses(80)
Billing:        Billing(90)
Histories:      SalesHistory(100), EntriesHistory(101), ExpensesHistory(102), CreditsHistory(103)
Credits:        CreditSale(110)
```

### Module IDs Reference

```
Administration=1, Sales=2, Inventory=3, Synchronization=4, Reports=5,
Statistics=6, Management=7, Expenses=8, Billing=9, Histories=10, Credits=11
```

## 4. Core Features Overview

| Module | Description | PRD Document |
|--------|-------------|-------------|
| [Auth](./auth.md) | Login, registration, token management (35-day offline expiry), route guards | auth.md |
| [Landing](./landing.md) | Marketing landing page, legal pages (cookies, privacy, terms) | landing.md |
| [Sales](./sales.md) | Product catalog, POS sale screen, orders, sale credits, barcode scanning | sales.md |
| [Inventory](./inventory.md) | Stock management, entries, quantities, egress, profit tracking | inventory.md |
| [Expenses](./expenses.md) | Daily expense tracking and history | expenses.md |
| [Synchronization](./synchronization.md) | Device-to-device data sync via encrypted ZIP export/import | synchronization.md |
| [Reports](./reports.md) | Daily combined inventory and sales reports | reports.md |
| [Statistics](./statistics.md) | Dashboard with charts (sales trends, profit margins) | statistics.md |
| [Management](./management.md) | Store settings, user management, app configuration | management.md |
| [Profile](./profile.md) | User profile editing, password change | profile.md |
| [Admin](./admin.md) | Platform administration: owners, resellers, features, stores | admin.md |

## 5. Technical Architecture

### 5.1 Monorepo Structure

```
frontend-react/
├── apps/
│   └── web-store-pos/            # Main POS application
│       └── app/
│           ├── root.tsx          # App shell, global styles
│           ├── routes.ts         # Imperative route configuration
│           ├── {feature}/
│           │   ├── routes/       # Route modules (loaders, actions, UI)
│           │   ├── components/   # Feature-specific components
│           │   └── lib/          # Hooks, utils, types, services
│           └── shared/
│               ├── routes/       # Cross-cutting routes (health, 404)
│               ├── components/   # Shared UI components
│               └── lib/          # Shared hooks, utils, types
├── packages/
│   ├── domain/                   # Shared types, models, enums
│   ├── web-common/               # Shared UI, styles, utilities
│   ├── eslint-config/            # ESLint v9 flat config
│   └── typescript-config/        # Shared tsconfig
```

### 5.2 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | >= 22 |
| Package manager | pnpm | 10.33+ |
| Monorepo | Turborepo | 2.8+ |
| Language | TypeScript (strict) | 5.8.3 |
| UI | React | 19.x |
| Routing / SSR | React Router v7 (framework mode) | 7.15+ |
| Bundler | Vite | 6.x |
| CSS | Tailwind CSS v4 | 4.x |
| Linting | ESLint v9 + Prettier | 9.x / 3.6+ |
| i18n | react-intl or react-i18next | TBD |
| Charts | Lazy-loaded chart library | TBD |
| ZIP encryption | @zip.js/zip.js | Latest |
| Barcode scanning | @zxing/browser | Latest |
| PDF generation | jspdf + jspdf-autotable | Latest |

### 5.3 Offline-First Architecture

The application operates in two modes:

- **Online**: Device can reach the API (verified via ping). Only used for authentication.
- **Offline**: Default mode. All data operations use localStorage.

```
┌──────────────────────────────────────────┐
│              React Components            │
├──────────────────────────────────────────┤
│            Service Layer                 │
│  ┌─────────────────┬──────────────────┐  │
│  │  Online Service  │ Offline Service  │  │
│  │  (HTTP → API)    │ (→ Repository)   │  │
│  └────────┬─────────┴───────┬──────────┘  │
│           │                 │             │
│     ┌─────▼─────┐   ┌──────▼───────┐    │
│     │  .NET API  │   │ localStorage │    │
│     └───────────┘   └──────────────┘    │
└──────────────────────────────────────────┘
```

#### Service Factory Pattern

A global configuration flag (`USE_ONLINE_SERVICE`) determines which service implementation is used. Currently defaults to `false` (offline). The factory returns the appropriate service via React Context or a provider pattern:

```typescript
// Conceptual pattern
const ProductServiceContext = createContext<ProductService>(null);

function ProductServiceProvider({ children }) {
  const service = USE_ONLINE_SERVICE
    ? new ProductOnlineService()
    : new ProductOfflineService();
  return <ProductServiceContext.Provider value={service}>{children}</ProductServiceContext.Provider>;
}
```

#### Offline Repository Pattern

Each entity has a repository that reads/writes to localStorage:

- Data is stored as serialized `Map<string, Entity>` converted to `Array.from(map.entries())`
- Keys are namespaced per store: `lizoft.store-{entity}-{selectedStoreId}`
- Date fields require manual revival on deserialization (`new Date(dateString)`)

#### localStorage Keys

| Data | Key |
|------|-----|
| Products | `lizoft.store-products-{storeId}` |
| Categories | `lizoft.store-product-categories-{storeId}` |
| Inventory Entries | `lizoft.store-inventory-entries-{storeId}` |
| Orders | `lizoft.store-orders-{storeId}` |
| Expenses | `lizoft.store-expenses-{storeId}` |
| Sale Credits | `lizoft.store-saleCredits-{storeId}` |
| Auth token | `token` |
| Current user | `currentUser` |
| Auth model | `{appVersion}-authf496fc5a9f17` |
| Language | `language` |

### 5.4 PWA Requirements

#### Service Worker Strategy

- Register service worker with 5-second delay after app load
- **Prefetch**: all core assets (HTML, CSS, JS, icons, images, fonts, data files) on install
- **Lazy cache**: non-critical assets on first access
- After authentication, precache ALL application chunks so the app works fully offline without additional downloads

#### Web App Manifest

- Name: "Vende De Todo"
- Short name: "VendeDTo"
- Display: standalone
- Start URL: /login
- Theme color: TBD (design system)
- Icons: all standard PWA sizes (72, 96, 128, 144, 152, 192, 384, 512)
- All icon assets must be bundled locally (no CDN references)

#### Offline Behavior

- All routes except `/login` and `/register` must work fully offline
- Login requires internet connectivity (API call to authenticate)
- After successful login, the app must not require internet for any operation
- Token expiry is enforced client-side: 35 days from login, even while offline
- When token expires, user is logged out and must reconnect to authenticate

### 5.5 Authentication Flow

1. User enters credentials on login page
2. App sends `POST /v1/auth/login` to the API
3. On success, receives `AuthModel` (token, refreshToken, expiresIn)
4. Client overrides `expiresIn` to `now + 35 days` (from `AppConfig.offline.maxDaysOffline`)
5. Token and user data are stored in localStorage
6. On subsequent app launches, token is validated client-side (expiry check only)
7. A background call to `GET /v1/auth/me` refreshes user data if online (non-blocking)
8. If token is expired, user is logged out and redirected to `/login`

### 5.6 State Management

React equivalent of the Angular BehaviorSubject pattern:

- Use React Context + custom hooks for service-level state
- Each service exposes: `items`, `isLoading`, `error` via a custom hook
- Offline services read from repository (localStorage) and update state
- Online services make HTTP calls and update state

### 5.7 Navigation and Layout

#### App Shell

```
┌──────────────────────────────────────────────┐
│ NavBar (top)                                  │
│ ┌────────┬───────────────────────────────────┐│
│ │Sidebar │ Breadcrumb                        ││
│ │(nav)   │───────────────────────────────────││
│ │        │                                   ││
│ │ Menu   │      Page Content                 ││
│ │ items  │      (router outlet)              ││
│ │        │                                   ││
│ │        │                                   ││
│ └────────┴───────────────────────────────────┘│
│ Footer                                        │
└──────────────────────────────────────────────┘
```

- **Sidebar**: collapsible, responsive (auto-collapse on mobile < 1025px)
- **NavBar**: hamburger toggle (left), shopping cart + user dropdown (right)
- **Shopping cart in NavBar**: inline cart management with quantity adjustment, payment type, credit toggle, total/change calculation, order submission
- **Menu visibility**: items filtered by user's feature permissions (see Permission Model above)
- **Breadcrumb**: auto-generated from current route

### 5.8 i18n Strategy

- Set up i18n infrastructure from day one (react-intl or react-i18next)
- Ship with Spanish translations only
- Translation keys follow existing structure: `MENU.*`, `AUTH.*`, `GENERAL.*`, plus feature-specific namespaces
- Language preference stored in localStorage
- Default language: Spanish (es)

## 6. Performance Requirements

### 6.1 Login Page Load

The login page must load as fast as possible. Heavy dependencies must NOT be included in the initial bundle:

- Chart libraries (only on dashboard/statistics routes)
- Barcode scanner library (only on sale routes)
- PDF generation libraries (only on export/report routes)
- ZIP library (only on synchronization routes)

### 6.2 Post-Authentication Loading

After successful authentication, the app must:

1. Precache all remaining application chunks
2. Load all route modules so navigation is instant offline
3. Show a loading indicator during precaching
4. Once complete, the app must work fully offline

### 6.3 Bundle Strategy

- Route-based code splitting via React Router v7
- Heavy dependencies loaded only when their routes are accessed
- All static assets (fonts, icons, images) bundled locally — no external CDN references
- Target: login page < 200KB JS (compressed)

## 7. Data Models

All domain models are defined in the `@store-mgmt/domain` package. See [Angular Analysis Reference](../plans/angular-analysis.md) for complete model definitions.

Key entities:
- **Product** (id, name, barcode, categoryId, price, order, availableToSale)
- **ProductCategory** (id, name, order, isActive)
- **Order** (id, orderItems[], total, date, type, paymentType, isCredit)
- **OrderItem** (productId, quantity, price, productCosts[])
- **InventoryEntry** (id, productId, quantity, available, costPrice, date)
- **Expense** (id, type, total, date, paymentType, note)
- **SaleCredit** (id, orderId, client, total, paid, isPaid)
- **Store** (id, name, displayName, modules[])
- **User/StoreUser** (id, fullName, roles[], featureIds[])

## 8. Design System

- **CSS Framework**: Tailwind CSS v4
- **Font**: Inter (bundled locally)
- **Color palette**: Cyan/teal primary (defined in web-common/styles.css)
- **Responsive**: Mobile-first using Tailwind breakpoints
- **No component library**: Build from Tailwind primitives
- **Icons**: Bundled locally (Material Icons or equivalent, no CDN)

## 9. Migration Strategy

### Phase 1: Core Infrastructure
- Auth module (login, token management, guards)
- App shell (layout, sidebar, navigation, breadcrumbs)
- Offline service layer (repositories, localStorage)
- PWA setup (service worker, manifest, precaching)
- i18n infrastructure
- Domain models package

### Phase 2: Primary Business Features
- Products (catalog management)
- Sales (POS screen, cart, order creation)
- Inventory (stock management, entries)

### Phase 3: Secondary Business Features
- Expenses
- Orders history and sale credits
- Reports and statistics

### Phase 4: Sync and Management
- Export/Import synchronization
- Store and user management
- Configuration
- Profile

### Phase 5: Platform Administration
- Admin dashboard
- Owners, resellers, features management

### Phase 6: Polish
- Landing page and legal pages
- Tutorial/help
- Performance optimization
- PWA final validation

## 10. Non-Functional Requirements

| Requirement | Target |
|------------|--------|
| Offline capability | Full functionality after authentication |
| Token expiry | 35 days client-side enforcement |
| Login page load | < 3 seconds on 3G |
| PWA installable | Yes (standalone mode) |
| Browser support | Modern browsers (ES2022) |
| Responsive | Mobile-first, works on phones and tablets |
| Data persistence | localStorage per store |
| Sync format | Backward-compatible encrypted ZIP with Angular version |
| All assets local | No external CDN, fonts, or icon references |
| i18n | Infrastructure ready, Spanish only at launch |
| Social login | Not included (email/password only) |

## 11. Out of Scope

- Online service mode (API-backed CRUD) — infrastructure exists but not active
- Real-time synchronization between devices
- Server-side data sync when reconnecting to internet
- Google OAuth / social login
- Multi-language translations (only Spanish shipped)
- Billing module (exists in enum but not implemented)
- WebSocket/real-time messaging
