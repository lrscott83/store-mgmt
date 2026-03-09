import { Component } from "@angular/core";
import { EFeatures, EModules } from "src/app/_shared/const/enums";
import { ProductsHelpDialogComponent } from "../help-dialogs/products-help-dialog/products-help-dialog.component";
import { OwnersHelpDialogComponent } from "../help-dialogs/owners-help-dialog/owners-help-dialog.component";
import { SaleHelpDialogComponent } from "../help-dialogs/sale-help-dialog/sale-help-dialog.component";
import { TodayOrdersHelpDialogComponent } from "../help-dialogs/today-orders-help-dialog/today-orders-help-dialog.component";
import { TodaySalesStatsHelpDialogComponent } from "../help-dialogs/today-sales-stats-help-dialog/today-sales-stats-help-dialog.component";
import { AvailableHelpDialogComponent } from "../help-dialogs/available-help-dialog/available-help-dialog.component";
import { EntriesHelpDialogComponent } from "../help-dialogs/entries-help-dialog/entries-help-dialog.component";
import { TodayInventoryStatsHelpDialogComponent } from "../help-dialogs/today-inventory-stats-help-dialog/today-inventory-stats-help-dialog.component";
import { SendHelpDialogComponent } from "../help-dialogs/send-help-dialog/send-help-dialog.component";
import { DownloadHelpDialogComponent } from "../help-dialogs/download-help-dialog/download-help-dialog.component";
import { ReceiveHelpDialogComponent } from "../help-dialogs/receive-help-dialog/receive-help-dialog.component";
import { DashboardHelpDialogComponent } from "../help-dialogs/dashboard-help-dialog/dashboard-help-dialog.component";
import { ProfileHelpDialogComponent } from "../help-dialogs/profile-help-dialog/profile-help-dialog.component";
import { StoresHelpDialogComponent } from "../help-dialogs/stores-help-dialog/stores-help-dialog.component";
import { UsersHelpDialogComponent } from "../help-dialogs/users-help-dialog/users-help-dialog.component";
import { ConfigurationsHelpDialogComponent } from "../help-dialogs/configurations-help-dialog/configurations-help-dialog.component";
import { ResellersHelpDialogComponent } from "../help-dialogs/resellers-help-dialog/resellers-help-dialog.component";
import { TodayReportsHelpDialogComponent } from "../help-dialogs/today-reports-help-dialog/today-reports-help-dialog.component";
import { FeaturesHelpDialogComponent } from "../help-dialogs/features-help-dialog/features-help-dialog.component";
import { SalesHelpDialogComponent } from "../help-dialogs/sales-help-dialog/sales-help-dialog.component";
import { InventoryHelpDialogComponent } from "../help-dialogs/inventory-help-dialog/inventory-help-dialog.component";
import { SynchronizationHelpDialogComponent } from "../help-dialogs/synchronization-help-dialog/synchronization-help-dialog.component";
import { ReportsHelpDialogComponent } from "../help-dialogs/reports-help-dialog/reports-help-dialog.component";
import { StatisticsHelpDialogComponent } from "../help-dialogs/statistics-help-dialog/statistics-help-dialog.component";
import { StoreConfigurationsHelpDialogComponent } from "../help-dialogs/store-configurations-help-dialog/store-configurations-help-dialog.component";
import { ExpensesHelpDialogComponent } from "../help-dialogs/expenses-help-dialog/expenses-help-dialog.component";
import { TodayExpenseHelpDialogComponent } from "../help-dialogs/today-expense-help-dialog/today-expense-help-dialog.component";
import { SaleCreditsHelpDialogComponent } from "../help-dialogs/sale-credits-help-dialog/sale-credits-help-dialog.component";
import { TodaySaleCreditsHelpDialogComponent } from "../help-dialogs/today-sale-credits-help-dialog/today-sale-credits-help-dialog.component";
import { OrdersHelpDialogComponent } from "../help-dialogs/orders-help-dialog/orders-help-dialog.component";
import { TodayEntriesHelpDialogComponent } from "../help-dialogs/today-entries-help-dialog/today-entries-help-dialog.component";
import { InventoryTodayQuantitiesHelpDialogComponent } from "../help-dialogs/inventory-today-quantities-help-dialog/inventory-today-quantities-help-dialog.component";
import { InventoryTodaySalesProfitHelpDialogComponent } from "../help-dialogs/inventory-today-sales-profit-help-dialog/inventory-today-sales-profit-help-dialog.component";

export interface NavigationItem {
  id: string;
  title: string;
  type: 'item' | 'collapse' | 'group';
  translate?: string;
  icon?: string;
  hidden?: boolean;
  url?: string;
  classes?: string;
  groupClasses?: string;
  exactMatch?: boolean;
  external?: boolean;
  target?: boolean;
  breadcrumbs?: boolean;
  children?: NavigationItem[];
  link?: string;
  description?: string;
  path?: string;
  module: number;
  feature?: number;
  helpDialog?: any;
}

export const NavigationItems: NavigationItem[] = [
  {
    id: 'admin',
    title: 'MENU.ADMIN.TITLE',
    type: 'group',
    icon: 'icon-navigation',
    module: EModules.Administration,
    helpDialog: OwnersHelpDialogComponent,
    children: [
      {
        id: 'admin_dashboard',
        title: 'MENU.ADMIN.DASHBOARD',
        type: 'item',
        classes: 'nav-item',
        url: '/admin/dashboard',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Administration,
        feature: EFeatures.AdminDashboard,
        helpDialog: StoresHelpDialogComponent,
      },
      {
        id: 'admin_stores',
        title: 'MENU.ADMIN.STORES',
        type: 'item',
        classes: 'nav-item',
        url: '/admin/stores',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Administration,
        feature: EFeatures.AdminStores,
        helpDialog: StoresHelpDialogComponent,
      },
      {
        id: 'admin_owners',
        title: 'MENU.ADMIN.OWNERS',
        type: 'item',
        classes: 'nav-item',
        url: '/admin/owners',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Administration,
        feature: EFeatures.Owners,
        helpDialog: OwnersHelpDialogComponent,
      },
      {
        id: 'admin_resellers',
        title: 'MENU.ADMIN.RESELLERS',
        type: 'item',
        classes: 'nav-item',
        url: '/admin/resellers',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Administration,
        feature: EFeatures.ReSellers,
        helpDialog: ResellersHelpDialogComponent,
      },
      {
        id: 'admin_featuress',
        title: 'MENU.ADMIN.FEATURES',
        type: 'item',
        classes: 'nav-item',
        url: '/admin/features',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Administration,
        feature: EFeatures.Features,
        helpDialog: FeaturesHelpDialogComponent,
      },
    ]
  },
  {
    id: 'sales',
    title: 'MENU.SALE_MGMT.TITLE',
    type: 'group',
    icon: 'icon-navigation',
    module: EModules.Sales,
    helpDialog: SalesHelpDialogComponent,
    children: [
      {
        id: 'sales_products',
        title: 'MENU.SALE_MGMT.PRODUCTS',
        type: 'item',
        classes: 'nav-item',
        url: '/sales/products',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Sales,
        feature: EFeatures.Products,
        helpDialog: ProductsHelpDialogComponent,
      },
      {
        id: 'sales_sale',
        title: 'MENU.SALE_MGMT.SALE',
        type: 'item',
        classes: 'nav-item',
        url: '/sales/sale',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Sales,
        feature: EFeatures.Sale,
        helpDialog: SaleHelpDialogComponent,
      },
      {
        id: 'sales_orders',
        title: 'MENU.SALE_MGMT.TODAY_ORDERS',
        type: 'item',
        classes: 'nav-item',
        url: '/sales/today-orders',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Sales,
        feature: EFeatures.TodayOrders,
        helpDialog: TodayOrdersHelpDialogComponent,
      },
      {
        id: 'today_sales_credits',
        title: 'MENU.SALE_MGMT.TODAY_SALE_CREDITS',
        type: 'item',
        classes: 'nav-item',
        url: '/sales/today-credits',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Credits,
        feature: EFeatures.CreditSale,
        helpDialog: TodaySaleCreditsHelpDialogComponent,
      },
      {
        id: 'sales_stats',
        title: 'MENU.SALE_MGMT.TODAY_STATS',
        type: 'item',
        classes: 'nav-item',
        url: '/sales/stats',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Sales,
        feature: EFeatures.TodayOrdersStats,
        helpDialog: TodaySalesStatsHelpDialogComponent,
      },
      {
        id: 'sales_credits',
        title: 'MENU.SALE_MGMT.SALE_CREDITS_HISTORY',
        type: 'item',
        classes: 'nav-item',
        url: '/sales/credits',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Credits,
        feature: EFeatures.CreditSale,
        helpDialog: SaleCreditsHelpDialogComponent,
      },
      {
        id: 'orders',
        title: 'MENU.SALE_MGMT.ORDER_HISTORY',
        type: 'item',
        classes: 'nav-item',
        url: '/sales/orders',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Histories,
        feature: EFeatures.SalesHistory,
        helpDialog: OrdersHelpDialogComponent,
      }
    ]
  },
  {
    id: 'inventory',
    title: 'MENU.INVENTORY_MGMT.TITLE',
    type: 'group',
    icon: 'icon-navigation',
    module: EModules.Inventory,
    helpDialog: InventoryHelpDialogComponent,
    children: [
      {
        id: 'inventory_available',
        title: 'MENU.INVENTORY_MGMT.AVAILABLE',
        type: 'item',
        classes: 'nav-item',
        url: '/inventory/available',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Inventory,
        feature: EFeatures.Available,
        helpDialog: AvailableHelpDialogComponent,
      },
      {
        id: 'inventory_today_entries',
        title: 'MENU.INVENTORY_MGMT.TODAY_ENTRIES',
        type: 'item',
        classes: 'nav-item',
        url: '/inventory/today-entries',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Inventory,
        feature: EFeatures.Entries,
        helpDialog: TodayEntriesHelpDialogComponent,
      },
      {
        id: 'inventory_today_quantities',
        title: 'MENU.INVENTORY_MGMT.TODAY_QUANTITIES',
        type: 'item',
        classes: 'nav-item',
        url: 'inventory/today-quantities',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Inventory,
        feature: EFeatures.InventoryTodayQuantities,
        helpDialog: InventoryTodayQuantitiesHelpDialogComponent,
      },
      {
        id: 'inventory_today_sales_profit',
        title: 'MENU.INVENTORY_MGMT.TODAY_SALES_PROFIT',
        type: 'item',
        classes: 'nav-item',
        url: '/inventory/today-sales-profit',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Inventory,
        feature: EFeatures.InventoryTodaySaleProfit,
        helpDialog: InventoryTodaySalesProfitHelpDialogComponent,
      },
      {
        id: 'inventory_sale',
        title: 'MENU.INVENTORY_MGMT.EGRESS',
        type: 'item',
        classes: 'nav-item',
        url: '/inventory/egress',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Inventory,
        feature: EFeatures.Egress,
        helpDialog: EntriesHelpDialogComponent,
      },
      {
        id: 'inventory_entries',
        title: 'MENU.INVENTORY_MGMT.HISTORY_ENTRIES',
        type: 'item',
        classes: 'nav-item',
        url: '/inventory/entries',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Histories,
        feature: EFeatures.EntriesHistory,
        helpDialog: EntriesHelpDialogComponent,
      },
      // {
      //   id: 'inventory_stats',
      //   title: 'MENU.INVENTORY_MGMT.TODAY_STATS',
      //   type: 'item',
      //   classes: 'nav-item',
      //   url: '/inventory/stats',
      //   icon: 'aim',
      //   breadcrumbs: false,
      //   module: EModules.Inventory,
      //   feature: EFeatures.TodayInventoryStats,
      //   helpDialog: TodayInventoryStatsHelpDialogComponent,
      // }
    ]
  },
  {
    id: 'expenses',
    title: 'MENU.EXPENSES.TITLE',
    type: 'group',
    icon: 'icon-navigation',
    module: EModules.Expenses,
    helpDialog: ExpensesHelpDialogComponent,
    children: [
      {
        id: 'today_expense',
        title: 'MENU.EXPENSES.TODAY_EXPENSES',
        type: 'item',
        classes: 'nav-item',
        url: '/expenses/today',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Expenses,
        feature: EFeatures.TodayExpenses,
        helpDialog: TodayExpenseHelpDialogComponent,
      },
      {
        id: 'today_expense',
        title: 'MENU.EXPENSES.EXPENSES_HISTORY',
        type: 'item',
        classes: 'nav-item',
        url: '/expenses/expenses',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Histories,
        feature: EFeatures.ExpensesHistory,
        helpDialog: ExpensesHelpDialogComponent,
      }
    ]
  },
  {
    id: 'synchronization',
    title: 'MENU.SYNCHRONIZATION.TITLE',
    type: 'group',
    icon: 'icon-navigation',
    module: EModules.Synchronization,
    helpDialog: SynchronizationHelpDialogComponent,
    children: [
      {
        id: 'synchronization_send',
        title: 'MENU.SYNCHRONIZATION.EXPORT',
        type: 'item',
        classes: 'nav-item',
        url: '/synchronization/export',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Synchronization,
        feature: EFeatures.Send,
        helpDialog: SendHelpDialogComponent,
      },
      // {
      //   id: 'synchronization_download',
      //   title: 'MENU.SYNCHRONIZATION.DOWNLOAD',
      //   type: 'item',
      //   classes: 'nav-item',
      //   url: '/synchronization/download',
      //   icon: 'aim',
      //   breadcrumbs: false,
      //   module: EModules.Synchronization,
      //   feature: EFeatures.Download,
      //   helpDialog: DownloadHelpDialogComponent,
      // },
      {
        id: 'synchronization_receive',
        title: 'MENU.SYNCHRONIZATION.IMPORT',
        type: 'item',
        classes: 'nav-item',
        url: '/synchronization/import',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Synchronization,
        feature: EFeatures.Receive,
        helpDialog: ReceiveHelpDialogComponent,
      }
    ]
  },
  {
    id: 'reports',
    title: 'MENU.REPORTS.TITLE',
    type: 'group',
    icon: 'icon-navigation',
    module: EModules.Reports,
    helpDialog: ReportsHelpDialogComponent,
    children: [
      {
        id: 'reports_today',
        title: 'MENU.REPORTS.TODAY_REPORTS',
        type: 'item',
        classes: 'nav-item',
        url: '/reports/today',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Reports,
        feature: EFeatures.TodayReports,
        helpDialog: TodayReportsHelpDialogComponent,
      }
    ]
  },
  {
    id: 'statistics',
    title: 'MENU.STATISTICS.TITLE',
    type: 'group',
    icon: 'icon-navigation',
    module: EModules.Statistics,
    helpDialog: StatisticsHelpDialogComponent,
    children: [
      {
        id: 'statistic_dashboard',
        title: 'MENU.STATISTICS.DASHBOARD',
        type: 'item',
        classes: 'nav-item',
        url: '/statistics/dashboard',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Statistics,
        feature: EFeatures. Dashboard,
        helpDialog: DashboardHelpDialogComponent,
      }
    ]
  },
  {
    id: 'management',
    title: 'MENU.STORE_MGMT.TITLE',
    type: 'group',
    icon: 'icon-navigation',
    module: EModules.Management,
    helpDialog: StoreConfigurationsHelpDialogComponent,
    children: [
      // {
      //   id: 'management_profile',
      //   title: 'MENU.STORE_MGMT.PROFILE',
      //   type: 'item',
      //   classes: 'nav-item',
      //   url: '/management/profile',
      //   icon: 'aim',
      //   breadcrumbs: false,
      //   module: EModules.Management,
      //   feature: EFeatures.Profile,
      //   helpDialog: ProfileHelpDialogComponent,
      // },
      {
        id: 'management_stores',
        title: 'MENU.STORE_MGMT.STORES',
        type: 'item',
        classes: 'nav-item',
        url: '/management/stores',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Management,
        feature: EFeatures.Stores,
        helpDialog: StoresHelpDialogComponent,
      },
      {
        id: 'management_users',
        title: 'MENU.STORE_MGMT.USERS',
        type: 'item',
        classes: 'nav-item',
        url: '/management/users',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Management,
        feature: EFeatures.Users,
        helpDialog: UsersHelpDialogComponent,
      },
      {
        id: 'management_configurations',
        title: 'MENU.STORE_MGMT.CONFIGURATIONS',
        type: 'item',
        classes: 'nav-item',
        url: '/management/configurations',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Management,
        feature: EFeatures.Configurations,
        helpDialog: ConfigurationsHelpDialogComponent
      }
    ]
  },
];
