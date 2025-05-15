import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { AuthService } from 'src/app/_services/services.index';
import { GlobalConfig } from '../configs/global.config';
import { AuthorizationService } from 'src/app/_services/authorization/authorization.service';

export const AuthGuard = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const authorizationService = inject(AuthorizationService);
  const currentUser = authService.currentUserValue;

  if (currentUser) {
    // logged in so check if it has access to the route
    return isUserAuthorized(authService, route, currentUser, authorizationService);
  }

  // not logged in so redirect to login page with the return url
  authService.logout();
  return false;
}

// export function AuthGuardLogin(): CanActivateFn {
//   return (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
//     
//   };
// }

function isUserAuthorized(authService: AuthService, route: ActivatedRouteSnapshot, currentUser: UserModel, 
  authorizationService: AuthorizationService): boolean {
  // this will be passed from the route config
  // on the data property
  

  // Validate Application Management module
  if (currentUser.isSuperAdmin || currentUser.isOwnerAdmin)
    return true;

  const expectedFeatures = route.data["expectedFeatures"];
  if (expectedFeatures && authorizationService.isUserAuthorize(expectedFeatures))
    return true;

  authService.logout();
  return false;
}