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

const routes: Routes = [
  { path: '', component: LandingDeepComponent },
  {
    path: 'scanner',
    loadComponent: () =>
      import('./presentation/shared/components/html5-scanner/html5-scanner.component').then((m) => m.Html5ScannerComponent)
  },
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
        loadComponent: () => import('./presentation/help/tutorial/tutorial.component').then((c) => c.TutorialComponent),
        data: { expectedFeatures: [] }
      },
      {
        path: '',
        redirectTo: '/sales/sale',
        pathMatch: 'full'
      },
      {
        path: 'admin/dashboard',
        loadComponent: () => import('./presentation/admin-dashboard/admin-dashboard.component').then((c) => c.AdminDashboardComponent),
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.AdminDashboard] }
      },
      {
        path: 'admin/stores',
        loadComponent: () => import('./presentation/stores/stores.component').then((c) => c.StoresComponent),
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.AdminStores] }
      },
      {
        path: 'admin/owners',
        loadComponent: () => import('./presentation/owners/owners.component').then((c) => c.OwnersComponent),
        canActivate: [ReSellerAuthGuard],
        data: { expectedFeatures: [EFeatures.Owners] }
      },
      {
        path: 'admin/owners/create',
        loadComponent: () => import('./presentation/owners/create-owner/create-owner.component').then((c) => c.CreateOwnerComponent),
        canActivate: [ReSellerAuthGuard],
        data: { expectedFeatures: [EFeatures.Owners] }
      },
      {
        path: 'admin/owners/edit/:id',
        loadComponent: () => import('./presentation/owners/edit-owner/edit-owner.component').then((c) => c.EditOwnerComponent),
        canActivate: [ReSellerAuthGuard],
        data: { expectedFeatures: [EFeatures.Owners] }
      },
      {
        path: 'admin/resellers',
        loadComponent: () => import('./presentation/resellers/resellers.component').then((c) => c.ResellersComponent),
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.ReSellers] }
      },
      {
        path: 'admin/resellers/create',
        loadComponent: () =>
          import('./presentation/resellers/create-reseller/create-reseller.component').then((c) => c.CreateResellerComponent),
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.ReSellers] }
      },
      {
        path: 'admin/resellers/edit/:id',
        loadComponent: () => import('./presentation/resellers/edit-reseller/edit-reseller.component').then((c) => c.EditResellerComponent),
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.ReSellers] }
      },
      {
        path: 'admin/features',
        loadComponent: () => import('./presentation/features/features.component').then((c) => c.FeaturesComponent),
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Features] }
      },
      {
        path: 'admin/roles',
        loadComponent: () => import('./presentation/owners/owners.component').then((c) => c.OwnersComponent),
        canActivate: [SuperAdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Roles] }
      },
      {
        path: 'sales/products',
        loadComponent: () => import('./presentation/products/products.component').then((c) => c.ProductsComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Products] }
      },
      {
        path: 'sales/sale',
        loadComponent: () => import('./presentation/sale/sale.component').then((c) => c.SaleComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Sale] }
      },
      {
        path: 'sales/today-orders',
        loadComponent: () => import('./presentation/sale/today-orders/today-orders.component').then((c) => c.TodayOrdersComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.TodayOrders] }
      },
      {
        path: 'sales/today-credits',
        loadComponent: () =>
          import('./presentation/sale/today-sale-credits/today-sale-credits.component').then((c) => c.TodaySaleCreditsComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.CreditSale] }
      },
      {
        path: 'sales/credits',
        loadComponent: () => import('./presentation/sale/sale-credits/sale-credits.component').then((c) => c.SaleCreditsComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.CreditSale] }
      },
      {
        path: 'sales/orders',
        loadComponent: () => import('./presentation/sale/orders/orders.component').then((c) => c.OrdersComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.SalesHistory] }
      },
      {
        path: 'sales/stats',
        loadComponent: () => import('./presentation/sale/today-stats/today-stats.component').then((c) => c.TodayStatsComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Sale] }
      },
      {
        path: 'expenses/today',
        loadComponent: () =>
          import('./presentation/expenses/expenses-today/expenses-today.component').then((c) => c.ExpensesTodayComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.TodayExpenses] }
      },
      {
        path: 'expenses/expenses',
        loadComponent: () => import('./presentation/expenses/expenses/expenses.component').then((c) => c.ExpensesComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.ExpensesHistory] }
      },
      {
        path: 'inventory/available',
        loadComponent: () =>
          import('./presentation/inventory/inventory-available/inventory-available.component').then((c) => c.InventoryAvailableComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Available] }
      },
      {
        path: 'inventory/today-entries',
        loadComponent: () => import('./presentation/inventory/today-entries/today-entries.component').then((c) => c.TodayEntriesComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Entries] }
      },
      {
        path: 'inventory/egress',
        loadComponent: () => import('./presentation/inventory/egress/egress.component').then((c) => c.EgressComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Egress] }
      },
      {
        path: 'inventory/entries',
        loadComponent: () => import('./presentation/inventory/entries/entries.component').then((c) => c.EntriesComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.EntriesHistory] }
      },
      {
        path: 'synchronization/export',
        loadComponent: () => import('./presentation/synchronization/send-data/send-data.component').then((c) => c.SendDataComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Send] }
      },
      {
        path: 'synchronization/import',
        loadComponent: () =>
          import('./presentation/synchronization/receive-data/receive-data.component').then((c) => c.ReceiveDataComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Receive] }
      },
      {
        path: 'statistics/dashboard',
        loadComponent: () => import('./presentation/statistics/dashboard/dashboard.component').then((c) => c.DashboardComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [] }
      },
      {
        path: 'reports/today',
        loadComponent: () =>
          import('./presentation/reports/inventory-today-sale/inventory-today-sale.component').then((c) => c.InventoryTodaySaleComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.TodayReports] }
      },
      {
        path: 'management/stores',
        loadComponent: () => import('./presentation/stores/edit-store/edit-store.component').then((c) => c.EditStoreComponent),
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Stores] }
      },
      {
        path: 'management/stores/create',
        loadComponent: () => import('./presentation/stores/edit-store/edit-store.component').then((c) => c.EditStoreComponent),
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Stores] }
      },
      {
        path: 'management/stores/edit/:id',
        loadComponent: () => import('./presentation/stores/edit-store/edit-store.component').then((c) => c.EditStoreComponent),
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Stores] }
      },
      {
        path: 'management/users',
        loadComponent: () => import('./presentation/users/users.component').then((c) => c.UsersComponent),
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Users] }
      },
      {
        path: 'management/users/create/:storeId',
        loadComponent: () =>
          import('./presentation/users/create-store-user/create-store-user.component').then((c) => c.CreateStoreUserComponent),
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Users] }
      },
      {
        path: 'management/users/edit/:id',
        loadComponent: () => import('./presentation/users/edit-user/edit-user.component').then((c) => c.EditUserComponent),
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Users] }
      },
      {
        path: 'management/configurations',
        loadComponent: () => import('./presentation/configurations/configurations.component').then((c) => c.ConfigurationsComponent),
        canActivate: [AdminAuthGuard],
        data: { expectedFeatures: [EFeatures.Configurations] }
      },
      {
        path: 'profile/edit',
        loadComponent: () => import('./presentation/profile/edit-profile/edit-profile.component').then((c) => c.EditProfileComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Profile] }
      },
      {
        path: 'profile/change-password',
        loadComponent: () =>
          import('./presentation/profile/change-password/change-password.component').then((c) => c.ChangePasswordComponent),
        canActivate: [AuthGuard],
        data: { expectedFeatures: [EFeatures.Profile] }
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
