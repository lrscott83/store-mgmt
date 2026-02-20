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
import { OwnersComponent } from './presentation/owners/owners.component';
import { SuperAdminAuthGuard } from './_shared/guards/super-admin-auth-guard';
import { StoresComponent } from './presentation/stores/stores.component';
import { AdminAuthGuard } from './_shared/guards/admin-auth-guard';
import { SaleComponent } from './presentation/sale/sale.component';
import { ProductsComponent } from './presentation/products/products.component';
import { TodayStatsComponent } from './presentation/sale/today-stats/today-stats.component';
import { CreateOwnerComponent } from './presentation/owners/create-owner/create-owner.component';
import { EditStoreComponent } from './presentation/stores/edit-store/edit-store.component';
import { UsersComponent } from './presentation/users/users.component';
import { CreateStoreUserComponent } from './presentation/users/create-store-user/create-store-user.component';
import { EditOwnerComponent } from './presentation/owners/edit-owner/edit-owner.component';
import { ReSellerAuthGuard } from './_shared/guards/reseller-auth-guard';
import { ResellersComponent } from './presentation/resellers/resellers.component';
import { CreateResellerComponent } from './presentation/resellers/create-reseller/create-reseller.component';
import { EditResellerComponent } from './presentation/resellers/edit-reseller/edit-reseller.component';
import { EditProfileComponent } from './presentation/profile/edit-profile/edit-profile.component';
import { ChangePasswordComponent } from './presentation/profile/change-password/change-password.component';
import { InventoryAvailableComponent } from './presentation/inventory/inventory-available/inventory-available.component';
import { EntriesComponent } from './presentation/inventory/entries/entries.component';
// import { InventoryStatsComponent } from './presentation/inventory/inventory-stats/inventory-stats.component';
import { SendDataComponent } from './presentation/synchronization/send-data/send-data.component';
import { ReceiveDataComponent } from './presentation/synchronization/receive-data/receive-data.component';
import { TodayOrdersComponent } from './presentation/sale/today-orders/today-orders.component';
import { ConfigurationsComponent } from './presentation/configurations/configurations.component';
import { EditUserComponent } from './presentation/users/edit-user/edit-user.component';
import { InventoryTodaySaleComponent } from './presentation/reports/inventory-today-sale/inventory-today-sale.component';
import { TutorialComponent } from './presentation/help/tutorial/tutorial.component';
// import { LandingComponent } from './presentation/home/landing/landing.component';
// import { Landing2Component } from './presentation/home/landing2/landing2.component';
import { LandingDeepComponent } from './presentation/home/landing-deep/landing-deep.component';
import { EgressComponent } from './presentation/inventory/egress/egress.component';
import { DashboardComponent } from './presentation/statistics/dashboard/dashboard.component';
import { FeaturesComponent } from './presentation/features/features.component';
import { AdminDashboardComponent } from './presentation/admin-dashboard/admin-dashboard.component';
import { ExpensesTodayComponent } from './presentation/expenses/expenses-today/expenses-today.component';
import { SaleCreditsComponent } from './presentation/sale/sale-credits/sale-credits.component';
import { TodaySaleCreditsComponent } from './presentation/sale/today-sale-credits/today-sale-credits.component';
import { ExpensesComponent } from './presentation/expenses/expenses/expenses.component';
import { OrdersComponent } from './presentation/sale/orders/orders.component';
import { TodayEntriesComponent } from './presentation/inventory/today-entries/today-entries.component';

const routes: Routes = [
  // { path: '', redirectTo: "login", pathMatch: 'full' },
  { path: '', component: LandingDeepComponent },
  { 
    path: 'login', 
    component: LoginComponent
    //loadComponent: () => import('./presentation/auth/login/login.component').then(c => c.LoginComponent)
  },
  {
    path: 'register', component: RegisterComponent,
    //canDeactivate: [CanDeactivateGuard] 
  },
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
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
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
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.AdminDashboard] }
      },
      {
        path: 'admin/stores',
        component: StoresComponent,
        canActivate: [SuperAdminAuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.AdminStores] }
      },
      {
        path: 'admin/owners',
        component: OwnersComponent,
        canActivate: [ReSellerAuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Owners] }
      },
      {
        path: 'admin/owners/create',
        component: CreateOwnerComponent,
        canActivate: [ReSellerAuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Owners] }
      },
      {
        path: 'admin/owners/edit/:id',
        component: EditOwnerComponent,
        canActivate: [ReSellerAuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Owners] }
      },
      {
        path: 'admin/resellers',
        component: ResellersComponent,
        canActivate: [SuperAdminAuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.ReSellers] }
      },
      {
        path: 'admin/resellers/create',
        component: CreateResellerComponent,
        canActivate: [SuperAdminAuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.ReSellers] }
      },
      {
        path: 'admin/resellers/edit/:id',
        component: EditResellerComponent,
        canActivate: [SuperAdminAuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.ReSellers] }
      },
      {
        path: 'admin/features',
        component: FeaturesComponent,
        canActivate: [SuperAdminAuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Features] }
      },
      {
        path: 'admin/roles',
        component: OwnersComponent,
        canActivate: [SuperAdminAuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Roles] }
      },
      {
        path: 'sales/products',
        component: ProductsComponent,
        canActivate: [AuthGuard],
        //: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Products] }
      },
      {
        path: 'sales/sale',
        component: SaleComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Sale] }
      },
      {
        path: 'sales/today-orders',
        component: TodayOrdersComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.TodayOrders] }
      },
      {
        path: 'sales/today-credits',
        component: TodaySaleCreditsComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.CreditSale] }
      },
      {
        path: 'sales/credits',
        component: SaleCreditsComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.CreditSale] }
      },
      {
        path: 'sales/orders',
        component: OrdersComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.SalesHistory] }
      },
      {
        path: 'sales/stats',
        component: TodayStatsComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Sale] }
      },
      {
        path: 'expenses/today',
        component: ExpensesTodayComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.TodayExpenses] }
      },
      {
        path: 'expenses/expenses',
        component: ExpensesComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.ExpensesHistory] }
      },
      {
        path: 'inventory/available',
        component: InventoryAvailableComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Available] }
      },
      {
        path: 'inventory/today-entries',
        component: TodayEntriesComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Entries] }
      },
      {
        path: 'inventory/egress',
        component: EgressComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Egress] }
      },
      {
        path: 'inventory/entries', 
        component: EntriesComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.EntriesHistory] }
      },
      {
        path: 'synchronization/export',
        component: SendDataComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Send] }
      },
      {
        path: 'synchronization/import',
        component: ReceiveDataComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Receive] }
      },
      {
        path: 'statistics/dashboard',
        component: DashboardComponent,
        //canActivate: [AdminAuthGuard],
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        //data: { expectedFeatures: [EFeatures.Dashboard] }
        data: { expectedFeatures: [] }
      },
      {
        path: 'reports/today',
        component: InventoryTodaySaleComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.TodayReports] }
      },
      // {
      //   path: 'management/stores', 
      //   component: StoresComponent,
      //   canActivate: [AdminAuthGuard],
      //   data: { expectedFeatures: [EFeatures.Stores] }
      // },
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
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Stores] }
      },
      {
        path: 'management/stores/edit/:id',
        component: EditStoreComponent,
        canActivate: [AdminAuthGuard],
        //canDeactivate: [CanDeactivateGuard],
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
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Users] }
      },
      {
        path: 'management/users/edit/:id',
        component: EditUserComponent,
        canActivate: [AdminAuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Users] }
      },
      {
        path: 'management/configurations',
        component: ConfigurationsComponent,
        canActivate: [AdminAuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Configurations] }
      },
      {
        path: 'profile/edit',
        component: EditProfileComponent,
        canActivate: [AuthGuard],
        //canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Profile] }
      },
      {
        path: 'profile/change-password',
        component: ChangePasswordComponent,
        canActivate: [AuthGuard],
        ////canDeactivate: [CanDeactivateGuard],
        data: { expectedFeatures: [EFeatures.Profile] }
      },
      // {
      //   path: 'dashboard/default',
      //   loadComponent: () => import('./demo/default/dashboard/dashboard.component').then((c) => c.DefaultComponent),
      //   // canActivate: [AuthGuardLogin],
      //   // data: { expectedFeatures: [EFeatures.Dashboard] }
      //   data: { expectedFeatures: [] }
      // },
      // {
      //   path: 'typography',
      //   loadComponent: () => import('./demo/ui-component/typography/typography.component')
      // },
      // {
      //   path: 'color',
      //   loadComponent: () => import('./demo/ui-component/ui-color/ui-color.component')
      // },
      // {
      //   path: 'sample-page',
      //   loadComponent: () => import('./demo/other/sample-page/sample-page.component')
      // }
    ]
  },

];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
