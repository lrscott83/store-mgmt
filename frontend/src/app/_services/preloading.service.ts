import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PreloadingService {
  // Scanner disabled for offline PWA
  // private authPreloadRoutes = ['/admin/dashboard', '/statistics/dashboard', '/reports/today', '/scanner'];
  private authPreloadRoutes = ['/admin/dashboard', '/statistics/dashboard', '/reports/today'];

  constructor() {
    console.log('[PreloadingService] Initialized');
  }

  preloadHeavyChunks(): void {
    console.log('[PreloadingService] Starting to preload heavy chunks after auth...');

    this.authPreloadRoutes.forEach((route) => {
      this.preloadRoute(route);
    });
  }

  private preloadRoute(route: string): void {
    let loadChildren: () => Promise<any>;

    switch (route) {
      case '/admin/dashboard':
        loadChildren = () => import('../presentation/admin-dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent);
        break;
      case '/statistics/dashboard':
        loadChildren = () => import('../presentation/statistics/dashboard/dashboard.component').then((m) => m.DashboardComponent);
        break;
      case '/reports/today':
        loadChildren = () =>
          import('../presentation/reports/inventory-today-sale/inventory-today-sale.component').then((m) => m.InventoryTodaySaleComponent);
        break;
      // Scanner disabled for offline PWA
      // case '/scanner':
      //   loadChildren = () =>
      //     import('../presentation/shared/components/html5-scanner/html5-scanner.component').then((m) => m.Html5ScannerComponent);
      //   break;
      default:
        console.warn(`[PreloadingService] Unknown route: ${route}`);
        return;
    }

    loadChildren()
      .then(() => {
        console.log(`[PreloadingService] ✅ Preloaded: ${route}`);
      })
      .catch((err) => {
        console.error(`[PreloadingService] ❌ Failed to preload: ${route}`, err);
      });
  }
}
