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
    children: [
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
    ]
  },
  {
    id: 'sales',
    title: 'MENU.SALE_MGMT.TITLE',
    type: 'group',
    icon: 'icon-navigation',
    module: EModules.Sales,
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
        url: '/sales/orders',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Sales,
        feature: EFeatures.TodayOrders,
        helpDialog: TodayOrdersHelpDialogComponent,
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
      }
    ]
  },
  {
    id: 'inventory',
    title: 'MENU.INVENTORY_MGMT.TITLE',
    type: 'group',
    icon: 'icon-navigation',
    module: EModules.Inventory,
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
        id: 'inventory_entries',
        title: 'MENU.INVENTORY_MGMT.ENTRIES',
        type: 'item',
        classes: 'nav-item',
        url: '/inventory/entries',
        icon: 'aim',
        breadcrumbs: false,
        module: EModules.Inventory,
        feature: EFeatures.Entries,
        helpDialog: EntriesHelpDialogComponent,
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
        feature: null,
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
    id: 'synchronization',
    title: 'MENU.SYNCHRONIZATION.TITLE',
    type: 'group',
    icon: 'icon-navigation',
    module: EModules.Synchronization,
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
