import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  // Public landing page â€” no auth required, matches Angular's unguarded '' route.
  // NOTE (frontend-parity-audit 2.6.3, investigated 2026-07-02): Angular's
  // app-routing.module.ts ALSO registers a second '' route nested inside
  // ClientLayoutComponent with `redirectTo: '/sales/sale', pathMatch: 'full'`
  // (line ~99). That entry is Angular DEAD CODE, not a live redirect: the
  // Angular Router resolves route arrays in declaration order and the FIRST
  // `{ path: '', component: LandingDeepComponent }` (no guard, no children)
  // fully matches the exact root URL with zero leftover segments and wins
  // outright â€” the nested ClientLayoutComponent '' redirect is unreachable
  // for '/'. Confirmed by tracing: LandingDeepComponent has no auth check in
  // its .ts/.html, and AppComponent has no root-level redirect either. So an
  // authenticated Angular user hitting '/' ALSO sees the public landing page,
  // same as an unauthenticated one â€” this index route intentionally has NO
  // clientLoader/redirect for authenticated users, matching real Angular
  // behavior. Do NOT "fix" this into an authenticated-root redirect without
  // first re-verifying against a live running Angular instance.
  index('home/routes/landing-deep.tsx'),

  // Guest-only routes (no auth required)
  layout('auth/components/auth-layout.tsx', [
    route('login', 'auth/routes/login.tsx'),
    route('register', 'auth/routes/register.tsx'),
    // Device provisioning (offline-auth-frontend): imports a roster bundle so
    // this device can authenticate offline. No `clientLoader` â€” a
    // `guestOnlyLoader` would redirect an authenticated admin away, but
    // provisioning must work regardless of this device's current auth state.
    route('auth/provision', 'auth/routes/provision.tsx'),
  ]),

  // Catálogo público (módulo 18, plan 2026-09-27): la tienda que publicó su
  // catálogo en /catalog/<slug>. SIN layout autenticado y SIN guard — lo abre el
  // cliente final, y el backend lo sirve de forma anónima (PublicCatalogController).
  route('catalog/:storeSlug', 'catalog/routes/public-catalog.tsx'),

  // Authenticated routes (require auth via authLoader)
  layout('shared/components/app-layout.tsx', { id: 'app-layout' }, [
    // Sales â€” Products
    route('sales/products', 'sales/routes/products.tsx'),
    // Catálogo Web (módulo 18, plan 2026-09-27): publica la tienda en /catalog/<slug>.
    route('sales/web-catalog', 'sales/routes/web-catalog.tsx'),
    // Pedidos WhatsApp (módulo 18, F1): configuración del pedido online. Mismo gate que el
    // catálogo (ownerModuleLoader + WebCatalogAdmin) — configurar la tienda es cosa del dueño.
    route('sales/online-orders/settings', 'sales/routes/ordering-settings.tsx'),
    // Sales â€” POS & Orders
    route('sales/new', 'sales/routes/sale.tsx'),
    // Sales â€” Wholesale (mismo guard de Ventas)
    route('sales/wholesale', 'sales/routes/wholesale.tsx'),
    route('sales/today-orders', 'sales/routes/today-orders.tsx'),
    route('sales/orders', 'sales/routes/orders.tsx'),
    route('sales/today-stats', 'sales/routes/today-stats.tsx'),
    // Sales â€” Credits
    route('sales/today-credits', 'sales/routes/today-credits.tsx'),
    route('sales/credits', 'sales/routes/credits.tsx'),

    // Inventory
    route('inventory/available', 'inventory/routes/available.tsx'),
    route('inventory/today-entries', 'inventory/routes/today-entries.tsx'),
    route('inventory/entries', 'inventory/routes/entries.tsx'),
    route('inventory/today-quantities', 'inventory/routes/today-quantities.tsx'),
    route('inventory/today-sales-profit', 'inventory/routes/today-sales-profit.tsx'),
    route('inventory/egress', 'inventory/routes/egress.tsx'),
    route('inventory/warehouses', 'inventory/routes/warehouses.tsx'),
    // Almacenes — Movimientos (feature 37, vista dedicada)
    route('inventory/warehouse-movements', 'inventory/routes/warehouse-movements.tsx'),
    // Elaboración (módulo 17) — Recetas (feature 120) y Elaboraciones (feature 121)
    route('inventory/recipes', 'inventory/routes/recipes.tsx'),
    route('inventory/elaborations', 'inventory/routes/elaborations.tsx'),

    // Expenses
    route('expenses/today', 'expenses/routes/today-expenses.tsx'),
    route('expenses/expenses', 'expenses/routes/expenses-history.tsx'),

    // Reports
    route('reports/today', 'reports/routes/today-report.tsx'),

    // Statistics
    route('stats/dashboard', 'statistics/routes/dashboard.tsx'),
    route('stats/cuadre-por-fechas', 'statistics/routes/cuadre-por-fechas.tsx'),

    // Sync â€” Export / Import
    route('sync/export', 'sync/routes/export.tsx'),
    route('sync/import', 'sync/routes/import.tsx'),

    // Management â€” Stores
    // Plan split: the store-DATA form never touches the plan. The PLAN view
    // lives at `management/stores` and the owner plan modal in my-stores;
    // data editing at `management/stores/edit/:id`
    // (no moduleIds on save), and creation at `management/stores/create` (data
    // only — the store is born on the Superior plan).
    // Distinct route `id`s are required because RR7 rejects reusing one file across
    // multiple route() entries without one (see design.md).
    route('management/stores', 'management/stores/routes/store-plan.tsx', {
      id: 'management-stores-index',
    }),
    // Owner's "my stores" cards listing (owner-stores-cards plan, 2026-09-08):
    // every store the current user owns (active AND inactive) with plan data.
    route('management/my-stores', 'management/stores/routes/my-stores.tsx', {
      id: 'management-my-stores',
    }),
    route('management/stores/create', 'management/stores/routes/edit-store.tsx', {
      id: 'management-stores-create',
    }),
    route('management/stores/edit/:id', 'management/stores/routes/update-store.tsx', {
      id: 'management-stores-edit',
    }),

    // Management â€” Stores â€” Billing (Req: billing-collections; DG-4 resellerFeatureLoader)
    route('management/stores/collections', 'management/stores/routes/collections.tsx'),
    route('management/stores/commissions', 'management/stores/routes/reseller-commissions.tsx'),

    // Management - Channel rates (multipayments): append-only register of the
    // rate per channel (method + currency); same guard as Configurations.
    route('management/channel-rates', 'management/channel-rates/routes/channel-rates.tsx', {
      id: 'management-channel-rates',
    }),

    // Management â€” Users
    route('management/users', 'management/users/routes/user-list.tsx'),
    // storeId is optional: matches both /create (from user list) and /create/:storeId
    // (after store creation), mirroring Angular's single CreateStoreUserComponent.
    route('management/users/create/:storeId?', 'management/users/routes/user-create.tsx'),
    route('management/users/edit/:id', 'management/users/routes/user-edit.tsx'),

    // Management â€” Configurations
    route('management/configurations', 'management/configurations/routes/configurations.tsx'),

    // Admin â€” Features
    route('admin/features', 'admin/features/routes/features.tsx'),

    // Admin â€” Stores
    route('admin/stores', 'admin/stores/routes/store-list.tsx'),

    // Admin â€” Global module catalog pricing (SuperAdmin only, superAdminLoader in the
    // route module; the menu item gates the same role). Distinct from the per-STORE module
    // pricing editor on /admin/stores: this one writes the Module catalog itself.
    route('admin/modules', 'admin/modules/routes/module-catalog.tsx'),

    // Admin â€” Dashboard
    route('admin/dashboard', 'admin/dashboard/routes/dashboard.tsx'),

    // Admin â€” Messages (SuperAdmin-only ownerâ†”admin inbox)
    route('admin/messages', 'admin/messages/routes/messages.tsx'),

    // Admin â€” Resellers
    route('admin/resellers', 'admin/resellers/routes/reseller-list.tsx'),
    route('admin/resellers/create', 'admin/resellers/routes/reseller-create.tsx'),
    route('admin/resellers/edit/:id', 'admin/resellers/routes/reseller-edit.tsx'),

    // Admin â€” Owners
    route('admin/owners', 'admin/owners/routes/owner-list.tsx'),
    route('admin/owners/create', 'admin/owners/routes/owner-create.tsx'),
    route('admin/owners/edit/:id', 'admin/owners/routes/owner-edit.tsx'),

    // Profile â€” User profile management
    route('profile/edit', 'profile/routes/edit-profile.tsx'),
    route('profile/change-password', 'profile/routes/change-password.tsx'),

    // Diagnostics — client-error-log ring buffer viewer (client-error-log plan).
    // adminLoader = SuperAdmin or OwnerAdmin only; the menu item gates the same set.
    route('diagnostics', 'diagnostics/routes/diagnostics.tsx'),
  ]),

  // Help â€” Tutorial (PUBLIC â€” mirrors Angular's app-routing.module.ts:89-97,
  // which nests help/tutorial inside ClientLayoutComponent with NO canActivate
  // guard). Same chrome as app-layout, but reached via a layout module that
  // does NOT re-export authLoader as its clientLoader.
  layout('shared/components/public-app-layout.tsx', { id: 'public-app-layout' }, [
    route('help/tutorial', 'help/routes/tutorial.tsx'),
  ]),

  // Utility routes
  route('health', 'shared/routes/health.tsx'),
  route('*', 'shared/routes/$.tsx'),
] satisfies RouteConfig;
