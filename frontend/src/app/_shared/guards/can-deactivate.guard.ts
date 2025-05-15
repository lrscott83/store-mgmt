import { inject } from "@angular/core";
import { CanDeactivateFn, UrlTree } from "@angular/router";
import { TranslateService } from "@ngx-translate/core";
import { Observable, Subject } from "rxjs";
import Swal from "sweetalert2";

export type CanDeactivateType = Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree;

export interface CanComponentDeactivate {
    canDeactivate: () => CanDeactivateType;
    savePendingChanges: () => Promise<boolean>;
}

export const CanDeactivateGuard: CanDeactivateFn<CanComponentDeactivate> = (component: CanComponentDeactivate) => {
    // if there are no pending changes, just allow deactivation; else confirm first
    if (!component || !component.canDeactivate || component.canDeactivate())
        return true;

    const deactivateSubject = new Subject<boolean>();
    const translate = inject(TranslateService);
    Swal.fire({
        title: translate.instant('GENERAL.CONFIRM_TITLE'),
        text: translate.instant('GENERAL.WIZARD_DIRTY_MESSAGE'),
        icon: "question",
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonColor: "#3456ff",
        denyButtonColor: "#dc3545",
        confirmButtonText: translate.instant('GENERAL.YES'),
        cancelButtonText: translate.instant('GENERAL.CANCEL'),
        denyButtonText: translate.instant('GENERAL.NO'),
    }).then((result) => {
        if (result.isConfirmed) {
            // Yes
            component.savePendingChanges()
                .then((response) => deactivateSubject.next(response));
        } else if (result.isDenied) {
            // No
            deactivateSubject.next(true);
        } else {
            // Cancel
            deactivateSubject.next(false);
        }
    });
    return deactivateSubject;
};