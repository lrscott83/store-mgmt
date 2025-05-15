import { CanDeactivate } from '@angular/router';
import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';
import Swal from 'sweetalert2';
import { TranslateService } from '@ngx-translate/core';

export interface ComponentCanDeactivate {
    canDeactivate: () => boolean | Observable<boolean>;
    savePendingChanges: () => Promise<boolean>;
}

@Injectable({ providedIn: 'root' })
export class PendingChangesGuard implements CanDeactivate<ComponentCanDeactivate> {
    constructor(private translate: TranslateService) { }

    canDeactivate(component: ComponentCanDeactivate): Observable<boolean> | boolean {
        // if there are no pending changes, just allow deactivation; else confirm first
        if (!component || !component.canDeactivate || component.canDeactivate())
            return true;

        //return window.confirm('Do you really want to cancel?');

        // NOTE: this warning message will only be shown when navigating elsewhere within your angular app;
        // when navigating away from your angular app, the browser will show a generic warning message
        // see http://stackoverflow.com/a/42207299/7307355

        //const canDeactivateSubject: Subject<boolean> = new Subject<boolean>();

        return Observable.create((observer: Observer<boolean>) => {
            Swal.fire({
                title: this.translate.instant('GENERAL.CONFIRM_TITLE'),
                text: this.translate.instant('CARRIER.WIZARD_DIRTY_MESSAGE'),
                icon: "question",
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonColor: "#3456ff",
                denyButtonColor: "#dc3545",
                confirmButtonText: this.translate.instant('GENERAL.YES'),
                cancelButtonText: this.translate.instant('GENERAL.CANCEL'),
                denyButtonText: this.translate.instant('GENERAL.NO'),
            }).then((result) => {
                if (result.isConfirmed) {
                    // Yes
                    component.savePendingChanges()
                        .then((response) => observer.next(response))
                        .finally(() => observer.complete());
                } else if (result.isDenied) {
                    // No
                    observer.next(true);
                    observer.complete();
                } else {
                    // Cancel
                    observer.next(false);
                    observer.complete();
                }
            });
        });

        // return canDeactivateSubject.pipe(map((result) => {
        //     return result;
        // }));
    }
}