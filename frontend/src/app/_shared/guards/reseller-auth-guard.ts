import { inject } from '@angular/core';
import { ActivatedRouteSnapshot } from '@angular/router';
import { AuthorizationService } from 'src/app/_services/authorization/authorization.service';
import { AuthService } from 'src/app/_services/services.index';

export const ReSellerAuthGuard = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const authorizationService = inject(AuthorizationService);
  if (!authService.currentUserValue || !(authService.currentUserValue.isSuperAdmin || authService.currentUserValue.isReSeller)) {
    authService.logout();
    return false;
  }
  const expectedFeatures = route.data["expectedFeatures"];
  if (expectedFeatures && authorizationService.isUserAuthorize(expectedFeatures))
    return true;

  authService.logout();
  return false;
}