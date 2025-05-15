import { inject } from '@angular/core';
import { AuthService } from 'src/app/_services/services.index';

export const SuperAdminAuthGuard = () => {
  const authService = inject(AuthService);
  if (!authService.currentUserValue || !authService.currentUserValue.isSuperAdmin) {
    authService.logout();
    return false;
  }
  return true;
}