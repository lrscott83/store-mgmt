import { Injectable } from '@angular/core';
import {
  Router,
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import { AuthService } from './auth.service';
import * as _ from 'lodash';
import { UserModel } from './_models/auth-user.model';
import { Observable } from 'rxjs';
import { GlobalConfig } from '../../_shared/configs/global.config';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {

  constructor(private authService: AuthService, public router: Router) { }

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> | boolean {
    const currentUser = this.authService.currentUserValue;

    if (currentUser) {
      // logged in so check if it has access to the route
      return this.isUserAuthorized(route, currentUser);
    }

    // not logged in so redirect to login page with the return url
    this.authService.logout();
    return false;
  }

  private isUserAuthorized(route: ActivatedRouteSnapshot, currentUser: UserModel): boolean {
    // this will be passed from the route config
    // on the data property
    const expectedFeatures = route.data["expectedFeatures"];

    // Validate Application Management module
    if (currentUser.isSuperAdmin)
      return true;

    if (currentUser.isSuperAdmin 
      || currentUser.isOwnerAdmin 
      || currentUser.roles.some((r) => {
        return expectedFeatures 
        && expectedFeatures.some(f => r.featureIds.some((feature) => f === feature));
      })) {
      return true;
    }

    this.router.navigate(['error/401']);
    return false;
  }
}
