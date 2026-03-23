import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { AuthService } from 'src/app/_services/services.index';
import { GlobalConfig } from '../configs/global.config';
import { AuthorizationService } from 'src/app/_services/authorization/authorization.service';

console.log('[AuthGuard] Module loaded');

export const AuthGuard = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  console.log('[AuthGuard] CALLED - url:', state.url);
  const authService = inject(AuthService);
  const authorizationService = inject(AuthorizationService);
  const currentUser = authService.currentUserValue;
  console.log('[AuthGuard] currentUserValue:', currentUser);
  console.log('[AuthGuard] currentUserSubject value:', authService.currentUserSubject?.value);

  if (currentUser) {
    console.log('[AuthGuard] User is authenticated');
    return isUserAuthorized(authService, route, currentUser, authorizationService);
  }

  console.log('[AuthGuard] User NOT authenticated, logging out');
  authService.logout();
  return false;
};

// export function AuthGuardLogin(): CanActivateFn {
//   return (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
//
//   };
// }

function isUserAuthorized(
  authService: AuthService,
  route: ActivatedRouteSnapshot,
  currentUser: UserModel,
  authorizationService: AuthorizationService
): boolean {
  // this will be passed from the route config
  // on the data property

  // Validate Application Management module
  if (currentUser.isSuperAdmin || currentUser.isOwnerAdmin) return true;

  const expectedFeatures = route.data['expectedFeatures'];
  if (expectedFeatures && authorizationService.isUserAuthorize(expectedFeatures)) return true;

  authService.logout();
  return false;
}
