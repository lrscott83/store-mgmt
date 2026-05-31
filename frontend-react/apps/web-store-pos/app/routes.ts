import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  // Guest-only routes (no auth required)
  layout('auth/components/auth-layout.tsx', [
    route('login', 'auth/routes/login.tsx'),
    route('register', 'auth/routes/register.tsx'),
  ]),

  // Authenticated routes (require auth via authLoader)
  layout('shared/components/app-layout.tsx', { id: 'app-layout' }, [
    index('home/routes/index.tsx'),

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

    // Profile — User profile management
    route('profile/edit', 'profile/routes/edit-profile.tsx'),
    route('profile/change-password', 'profile/routes/change-password.tsx'),
  ]),

  // Utility routes
  route('health', 'shared/routes/health.tsx'),
  route('*', 'shared/routes/$.tsx'),
] satisfies RouteConfig;
