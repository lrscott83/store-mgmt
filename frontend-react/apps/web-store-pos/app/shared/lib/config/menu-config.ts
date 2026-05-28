import { EFeatures, EModules } from '@store-mgmt/domain';

export interface MenuItem {
  label: string;
  path: string;
  featureIds?: number[];
  moduleId?: number;
  icon?: string;
}

export interface MenuGroup {
  groupLabel: string;
  moduleId?: number;
  items: MenuItem[];
}

export const MENU_GROUPS: MenuGroup[] = [
  {
    groupLabel: 'MENU.ADMIN',
    moduleId: EModules.Administration,
    items: [
      { label: 'MENU.ADMIN_DASHBOARD', path: '/admin/dashboard', featureIds: [EFeatures.AdminDashboard], moduleId: EModules.Administration },
      { label: 'MENU.ADMIN_STORES', path: '/admin/stores', featureIds: [EFeatures.AdminStores], moduleId: EModules.Administration },
      { label: 'MENU.OWNERS', path: '/admin/owners', featureIds: [EFeatures.Owners], moduleId: EModules.Administration },
      { label: 'MENU.RESELLERS', path: '/admin/resellers', featureIds: [EFeatures.ReSellers], moduleId: EModules.Administration },
      { label: 'MENU.FEATURES', path: '/admin/features', featureIds: [EFeatures.Features], moduleId: EModules.Administration },
    ],
  },
  {
    groupLabel: 'MENU.SALES',
    moduleId: EModules.Sales,
    items: [
      { label: 'MENU.PRODUCTS', path: '/sales/products', featureIds: [EFeatures.Products], moduleId: EModules.Sales },
      { label: 'MENU.SALE', path: '/sales/new', featureIds: [EFeatures.Sale], moduleId: EModules.Sales },
      { label: 'MENU.TODAY_ORDERS', path: '/sales/today-orders', featureIds: [EFeatures.TodayOrders], moduleId: EModules.Sales },
      { label: 'MENU.TODAY_STATS', path: '/sales/today-stats', featureIds: [EFeatures.TodayStats], moduleId: EModules.Sales },
    ],
  },
  {
    groupLabel: 'MENU.INVENTORY',
    moduleId: EModules.Inventory,
    items: [
      { label: 'MENU.AVAILABLE', path: '/inventory/available', featureIds: [EFeatures.Available], moduleId: EModules.Inventory },
      { label: 'MENU.TODAY_ENTRIES', path: '/inventory/today-entries', featureIds: [EFeatures.Entries], moduleId: EModules.Inventory },
      { label: 'MENU.TODAY_QUANTITIES', path: '/inventory/today-quantities', featureIds: [EFeatures.InventoryTodayQuantities], moduleId: EModules.Inventory },
      { label: 'MENU.TODAY_SALES_PROFIT', path: '/inventory/today-sales-profit', featureIds: [EFeatures.InventoryTodaySaleProfit], moduleId: EModules.Inventory },
      { label: 'MENU.EGRESS', path: '/inventory/egress', featureIds: [EFeatures.Egress], moduleId: EModules.Inventory },
    ],
  },
  {
    groupLabel: 'MENU.EXPENSES',
    moduleId: EModules.Expenses,
    items: [
      { label: 'MENU.TODAY_EXPENSES', path: '/expenses/today', featureIds: [EFeatures.TodayExpenses], moduleId: EModules.Expenses },
      { label: 'MENU.EXPENSES_HISTORY', path: '/expenses/expenses', featureIds: [EFeatures.ExpensesHistory], moduleId: EModules.Expenses },
    ],
  },
  {
    groupLabel: 'MENU.SYNCHRONIZATION',
    moduleId: EModules.Synchronization,
    items: [
      { label: 'MENU.EXPORT', path: '/sync/export', featureIds: [EFeatures.Send], moduleId: EModules.Synchronization },
      { label: 'MENU.IMPORT', path: '/sync/import', featureIds: [EFeatures.Receive], moduleId: EModules.Synchronization },
    ],
  },
  {
    groupLabel: 'MENU.REPORTS',
    moduleId: EModules.Reports,
    items: [
      { label: 'MENU.TODAY_REPORTS', path: '/reports/today', featureIds: [EFeatures.TodayReports], moduleId: EModules.Reports },
    ],
  },
  {
    groupLabel: 'MENU.STATISTICS',
    moduleId: EModules.Statistics,
    items: [
      { label: 'MENU.DASHBOARD', path: '/stats/dashboard', featureIds: [EFeatures.Dashboard], moduleId: EModules.Statistics },
    ],
  },
  {
    groupLabel: 'MENU.MANAGEMENT',
    moduleId: EModules.Management,
    items: [
      { label: 'MENU.STORES', path: '/management/stores', featureIds: [EFeatures.Stores], moduleId: EModules.Management },
      { label: 'MENU.USERS', path: '/management/users', featureIds: [EFeatures.Users], moduleId: EModules.Management },
      { label: 'MENU.CONFIGURATIONS', path: '/management/configurations', featureIds: [EFeatures.Configurations], moduleId: EModules.Management },
    ],
  },
  {
    groupLabel: 'MENU.PROFILE',
    items: [
      { label: 'MENU.EDIT_PROFILE', path: '/profile/edit', featureIds: [EFeatures.Profile] },
      { label: 'MENU.CHANGE_PASSWORD', path: '/profile/change-password', featureIds: [EFeatures.Profile] },
    ],
  },
];
