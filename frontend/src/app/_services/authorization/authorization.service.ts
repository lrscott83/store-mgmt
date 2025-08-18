import { Injectable } from "@angular/core";
import { AuthService } from "../services.index";
import { UserModel } from "../auth/_models/auth-user.model";
import { EFeatures, EModules } from "src/app/_shared/const/enums";

@Injectable({
    providedIn: "root",
})

export class AuthorizationService {
    constructor(private authService: AuthService) { }

    isUserAuthorize(features: number[]) {
        const currentUser: UserModel = this.authService.currentUserValue;
        if (!currentUser)
            return false;
        
        if (currentUser.expiresIn < new Date())
            return false;

        if (currentUser.isSuperAdmin)
            return true;
        if (currentUser.isReSeller && this.isReSellerAuthorize(currentUser, features))
            return true;
        if (currentUser.isOwnerAdmin && this.isOwnerAuthorize(currentUser, features))
            return true;
        if (this.isStoreUserAuthorize(currentUser, features))
            return true;
        return false;

    }

    private isReSellerAuthorize(currentUser: UserModel, features: number[]): boolean {
        return features.some(f => currentUser.featureIds.some(id => f === id));
    }

    private isOwnerAuthorize(currentUser: UserModel, features: number[]): boolean {
        return features.some(f => currentUser.featureIds.some(id => f === id));
    }

    private isStoreUserAuthorize(currentUser: UserModel, features: number[]): boolean {
        return features.some(f => currentUser.roles
            .some(r => r.storeId === currentUser.selectedStoreId && r.featureIds.some(id => f === id)));
    }

    private hasModuleAvailable(moduleId: number) {
        const currentUser: UserModel = this.authService.currentUserValue;
        if (!currentUser)
            return false;
        return currentUser.storeModuleIds.some(id => id === moduleId);
    }

    public hasInventoryModuleAvailable(): boolean {
        return this.hasModuleAvailable(EModules.Inventory);
    }

    public hasOwnersAvailableFeature(): boolean {
        return this.isUserAuthorize([EFeatures.Owners]);
    }

    public hasExpensesModuleAvailable(): boolean {
        return this.hasModuleAvailable(EModules.Expenses);
    }

    public hasCreditsModuleAvailable(): boolean {
        return this.hasModuleAvailable(EModules.Credits);
    }
}