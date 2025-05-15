import { inject } from '@angular/core';
import { ActivatedRouteSnapshot } from '@angular/router';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { AuthorizationService } from 'src/app/_services/authorization/authorization.service';
import { AuthService } from 'src/app/_services/services.index';

export const AdminAuthGuard = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const authorizationService = inject(AuthorizationService);
  if (!authService.currentUserValue || !isAdmin(authService.currentUserValue)) {
    authService.logout();
    return false;
  }
  const expectedFeatures = route.data["expectedFeatures"];
  if (expectedFeatures && authorizationService.isUserAuthorize(expectedFeatures))
    return true;

  authService.logout();
  return false;
}

function isAdmin(user: UserModel): boolean {
  return user.isSuperAdmin || user.isOwnerAdmin;
}