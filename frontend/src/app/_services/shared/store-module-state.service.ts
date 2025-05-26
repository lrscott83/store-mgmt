import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
    providedIn: "root"
})

export class StoreModuleStateService {
    private modulesUpdatedSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
    public modulesUpdated(updated: boolean) {
        this.modulesUpdatedSubject.next(updated);
    }
    public getModulesUpdatedObservable(): Observable<boolean> {
        return this.modulesUpdatedSubject.asObservable();
    }
}