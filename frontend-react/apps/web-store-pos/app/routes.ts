import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  // Public landing page — no auth required, matches Angular's unguarded '' route
  index('home/routes/landing-deep.tsx'),

  // Guest-only routes (no auth required)
  layout('auth/components/auth-layout.tsx', [
    route('login', 'auth/routes/login.tsx'),
    route('register', 'auth/routes/register.tsx'),
  ]),

  // Authenticated routes (require auth via authLoader)
  layout('shared/components/app-layout.tsx', { id: 'app-layout' }, [
    // Sales — Products
    route('sales/products', 'sales/routes/products.tsx'),
    // Sales — POS & Orders
    route('sales/new', 'sales/routes/sale.tsx'),
    route('sales/today-orders', 'sales/routes/today-orders.tsx'),
    route('sales/orders', 'sales/routes/orders.tsx'),
    route('sales/today-stats', 'sales/routes/today-stats.tsx'),
    // Sales — Credits
    route('sales/today-credits', 'sales/routes/today-credits.tsx'),
    route('sales/credits', 'sales/routes/credits.tsx'),

    // Inventory
    route('inventory/available', 'inventory/routes/available.tsx'),
    route('inventory/today-entries', 'inventory/routes/today-entries.tsx'),
    route('inventory/entries', 'inventory/routes/entries.tsx'),
    route('inventory/today-quantities', 'inventory/routes/today-quantities.tsx'),
    route('inventory/today-sales-profit', 'inventory/routes/today-sales-profit.tsx'),
    route('inventory/egress', 'inventory/routes/egress.tsx'),

    // Expenses
    route('expenses/today', 'expenses/routes/today-expenses.tsx'),
    route('expenses/expenses', 'expenses/routes/expenses-history.tsx'),

    // Reports
    route('reports/today', 'reports/routes/today-report.tsx'),

    // Statistics
    route('stats/dashboard', 'statistics/routes/dashboard.tsx'),

    // Sync — Export / Import
    route('sync/export', 'sync/routes/export.tsx'),
    route('sync/import', 'sync/routes/import.tsx'),

    // Management — Stores
    route('management/stores', 'management/stores/routes/store-list.tsx'),
    route('management/stores/create', 'management/stores/routes/store-create.tsx'),
    route('management/stores/edit/:id', 'management/stores/routes/store-edit.tsx'),

    // Management — Users
    route('management/users', 'management/users/routes/user-list.tsx'),
    // storeId is optional: matches both /create (from user list) and /create/:storeId
    // (after store creation), mirroring Angular's single CreateStoreUserComponent.
    route('management/users/create/:storeId?', 'management/users/routes/user-create.tsx'),
    route('management/users/edit/:id', 'management/users/routes/user-edit.tsx'),

    // Management — Configurations
    route('management/configurations', 'management/configurations/routes/configurations.tsx'),

    // Admin — Features
    route('admin/features', 'admin/features/routes/features.tsx'),

    // Admin — Stores
    route('admin/stores', 'admin/stores/routes/store-list.tsx'),

    // Admin — Dashboard
    route('admin/dashboard', 'admin/dashboard/routes/dashboard.tsx'),

    // Admin — Resellers
    route('admin/resellers', 'admin/resellers/routes/reseller-list.tsx'),
    route('admin/resellers/create', 'admin/resellers/routes/reseller-create.tsx'),
    route('admin/resellers/edit/:id', 'admin/resellers/routes/reseller-edit.tsx'),

    // Admin — Owners
    route('admin/owners', 'admin/owners/routes/owner-list.tsx'),
    route('admin/owners/create', 'admin/owners/routes/owner-create.tsx'),
    route('admin/owners/edit/:id', 'admin/owners/routes/owner-edit.tsx'),

    // Profile — User profile management
    route('profile/edit', 'profile/routes/edit-profile.tsx'),
    route('profile/change-password', 'profile/routes/change-password.tsx'),

    // Help — Tutorial
    route('help/tutorial', 'help/routes/tutorial.tsx'),
  ]),

  // Utility routes
  route('health', 'shared/routes/health.tsx'),
  route('*', 'shared/routes/$.tsx'),
] satisfies RouteConfig;
