// angular import
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Project import
import { ClientLayoutComponent } from './presentation/layouts/client-layout/client-layout.component';
import LoginComponent from './presentation/auth/login/login.component';
import RegisterComponent from './presentation/auth/register/register.component';
import { CookiesPrivateComponent } from './presentation/shared/components/cookies-private/cookies-private.component';
import { PrivatePoliceComponent } from './presentation/shared/components/private-police/private-police.component';
import { TermsConditionsComponent } from './presentation/shared/components/terms-conditions/terms-conditions.component';
import { AuthGuard } from './_shared/guards/auth-guard';
import { EFeatures } from './_shared/const/enums';
import { SuperAdminAuthGuard } from './_shared/guards/super-admin-auth-guard';
import { AdminAuthGuard } from './_shared/guards/admin-auth-guard';
import { ReSellerAuthGuard } from './_shared/guards/reseller-auth-guard';
import { LandingDeepComponent } from './presentation/home/landing-deep/landing-deep.component';

// Admin components
import { AdminDashboardComponent } from './presentation/admin-dashboard/admin-dashboard.component';
import { StoresComponent } from './presentation/stores/stores.component';
import { OwnersComponent } from './presentation/owners/owners.component';
import { CreateOwnerComponent } from './presentation/owners/create-owner/create-owner.component';
import { EditOwnerComponent } from './presentation/owners/edit-owner/edit-owner.component';
import { ResellersComponent } from './presentation/resellers/resellers.component';
import { CreateResellerComponent } from './presentation/resellers/create-reseller/create-reseller.component';
import { EditResellerComponent } from './presentation/resellers/edit-reseller/edit-reseller.component';
import { FeaturesComponent } from './presentation/features/features.component';

// Sales components
import { ProductsComponent } from './presentation/products/products.component';
import { SaleComponent } from './presentation/sale/sale.component';
import { TodayOrdersComponent } from './presentation/sale/today-orders/today-orders.component';
import { TodaySaleCreditsComponent } from './presentation/sale/today-sale-credits/today-sale-credits.component';
import { SaleCreditsComponent } from './presentation/sale/sale-credits/sale-credits.component';
import { OrdersComponent } from './presentation/sale/orders/orders.component';
import { TodayStatsComponent } from './presentation/sale/today-stats/today-stats.component';

// Expenses components
import { ExpensesTodayComponent } from './presentation/expenses/expenses-today/expenses-today.component';
import { ExpensesComponent } from './presentation/expenses/expenses/expenses.component';

// Inventory components
import { InventoryAvailableComponent } from './presentation/inventory/inventory-available/inventory-available.component';
import { TodayEntriesComponent } from './presentation/inventory/today-entries/today-entries.component';
import { InventoryTodayQuantitiesComponent } from './presentation/inventory/inventory-today-quantities/inventory-today-quantities.component';
import { InventoryTodaySalesProfitComponent } from './presentation/inventory/inventory-today-sales-profit/inventory-today-sales-profit.component';
import { EgressComponent } from './presentation/inventory/egress/egress.component';
import { EntriesComponent } from './presentation/inventory/entries/entries.component';

// Synchronization components
import { SendDataComponent } from './presentation/synchronization/send-data/send-data.component';
import { ReceiveDataComponent } from './presentation/synchronization/receive-data/receive-data.component';

// Statistics components
import { DashboardComponent } from './presentation/statistics/dashboard/dashboard.component';

// Reports components
import { InventoryTodaySaleComponent } from './presentation/reports/inventory-today-sale/inventory-today-sale.component';

// Management components
import { EditStoreComponent } from './presentation/stores/edit-store/edit-store.component';
import { UsersComponent } from './presentation/users/users.component';
import { CreateStoreUserComponent } from './presentation/users/create-store-user/create-store-user.component';
import { EditUserComponent } from './presentation/users/edit-user/edit-user.component';
import { ConfigurationsComponent } from './presentation/configurations/configurations.component';

// Profile components
import { EditProfileComponent } from './presentation/profile/edit-profile/edit-profile.component';
import { ChangePasswordComponent } from './presentation/profile/change-password/change-password.component';

// Help components
import { TutorialComponent } from './presentation/help/tutorial/tutorial.component';

const routes: Routes = [
  { path: '', component: LandingDeepComponent },
  // Scanner route - disabled for offline PWA
  // {
  //   path: 'scanner',
  //   loadComponent: () =>
  //     import('./presentation/shared/components/html5-scanner/html5-scanner.component').then((m) => m.Html5ScannerComponent)
  // },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'cookies-private', component: CookiesPrivateComponent },
  { path: 'private-police', component: PrivatePoliceComponent },
  { path: 'terms-conditions', component: TermsConditionsComponent },

  {
    path: '',
    component: ClientLayoutComponent,
    children: [
      {
        path: 'help/tutorial',
        component: TutorialComponent,
        data: { expectedFeatures: [] }
      },
      {
        path: '',
        redirectTo: '/sales/sale',
        pathMatch: 'full'
      },
      {
        path: 'admin/dashboard',
        component: AdminDashboardComponent,
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.AdminDashboard] }
      },
      {
        path: 'admin/stores',
        component: StoresComponent,
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.AdminStores] }
      },
      {
        path: 'admin/owners',
        component: OwnersComponent,
        canActivate: [ReSellerAuthGuard],
        data: { expectedFeatures: [EFeatures.Owners] }
      },
      {
        path: 'admin/owners/create',
        component: CreateOwnerComponent,
        canActivate: [ReSellerAuthGuard],
        data: { expectedFeatures: [EFeatures.Owners] }
      },
      {
        path: 'admin/owners/edit/:id',
        component: EditOwnerComponent,
        canActivate: [ReSellerAuthGuard],
        data: { expectedFeatures: [EFeatures.Owners] }
      },
      {
        path: 'admin/resellers',
        component: ResellersComponent,
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.ReSellers] }
      },
      {
        path: 'admin/resellers/create',
        component: CreateResellerComponent,
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.ReSellers] }
      },
      {
        path: 'admin/resellers/edit/:id',
        component: EditResellerComponent,
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.ReSellers] }
      },
      {
        path: 'admin/features',
        component: FeaturesComponent,
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Features] }
      },
      {
        path: 'admin/roles',
        component: OwnersComponent,
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Roles] }
      },
      {
        path: 'sales/products',
        component: ProductsComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Products] }
      },
      {
        path: 'sales/sale',
        component: SaleComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Sale] }
      },
      {
        path: 'sales/today-orders',
        component: TodayOrdersComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.TodayOrders] }
      },
      {
        path: 'sales/today-credits',
        component: TodaySaleCreditsComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.CreditSale] }
      },
      {
        path: 'sales/credits',
        component: SaleCreditsComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.CreditSale] }
      },
      {
        path: 'sales/orders',
        component: OrdersComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.SalesHistory] }
      },
      {
        path: 'sales/stats',
        component: TodayStatsComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Sale] }
      },
      {
        path: 'expenses/today',
        component: ExpensesTodayComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.TodayExpenses] }
      },
      {
        path: 'expenses/expenses',
        component: ExpensesComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.ExpensesHistory] }
      },
      {
        path: 'inventory/available',
        component: InventoryAvailableComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Available] }
      },
      {
        path: 'inventory/today-entries',
        component: TodayEntriesComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Entries] }
      },
      {
        path: 'inventory/today-quantities',
        component: InventoryTodayQuantitiesComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.InventoryTodayQuantities] }
      },
      {
        path: 'inventory/today-sales-profit',
        component: InventoryTodaySalesProfitComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.InventoryTodaySaleProfit] }
      },
      {
        path: 'inventory/egress',
        component: EgressComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Egress] }
      },
      {
        path: 'inventory/entries',
        component: EntriesComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.EntriesHistory] }
      },
      {
        path: 'synchronization/export',
        component: SendDataComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Send] }
      },
      {
        path: 'synchronization/import',
        component: ReceiveDataComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Receive] }
      },
      {
        path: 'statistics/dashboard',
        component: DashboardComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Dashboard] }
      },
      {
        path: 'reports/today',
        component: InventoryTodaySaleComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.TodayReports] }
      },
      {
        path: 'management/stores',
        component: EditStoreComponent,
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Stores] }
      },
      {
        path: 'management/stores/create',
        component: EditStoreComponent,
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Stores] }
      },
      {
        path: 'management/stores/edit/:id',
        component: EditStoreComponent,
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Stores] }
      },
      {
        path: 'management/users',
        component: UsersComponent,
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Users] }
      },
      {
        path: 'management/users/create/:storeId',
        component: CreateStoreUserComponent,
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Users] }
      },
      {
        path: 'management/users/edit/:id',
        component: EditUserComponent,
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Users] }
      },
      {
        path: 'management/configurations',
        component: ConfigurationsComponent,
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Configurations] }
      },
      {
        path: 'profile/edit',
        component: EditProfileComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Profile] }
      },
      {
        path: 'profile/change-password',
        component: ChangePasswordComponent,
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Profile] }
      }
    ]
  },
  { path: 'local', redirectTo: '' },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
