import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, fromEvent, merge, Subscription } from 'rxjs';
import { mapTo, debounceTime, distinctUntilChanged } from 'rxjs/operators';

export interface ConnectionStatus {
  isOnline: boolean;
  wasOffline: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ConnectionService implements OnDestroy {
  private onlineSubject = new BehaviorSubject<boolean>(navigator.onLine);
  private statusChangeSubject = new BehaviorSubject<ConnectionStatus>({
    isOnline: navigator.onLine,
    wasOffline: false
  });
  private subscriptions: Subscription[] = [];

  isOnline$ = this.onlineSubject.asObservable();
  statusChange$ = this.statusChangeSubject.asObservable();

  get isOnline(): boolean {
    return this.onlineSubject.value;
  }

  constructor() {
    this.setupNetworkStatusListeners();
  }

  private setupNetworkStatusListeners(): void {
    const online$ = fromEvent(window, 'online').pipe(mapTo(true));
    const offline$ = fromEvent(window, 'offline').pipe(mapTo(false));

    const networkStatus$ = merge(online$, offline$).pipe(debounceTime(100), distinctUntilChanged());

    const sub = networkStatus$.subscribe((isOnline: boolean) => {
      const previousStatus = this.onlineSubject.value;
      this.onlineSubject.next(isOnline);

      if (!previousStatus && isOnline) {
        this.statusChangeSubject.next({
          isOnline: true,
          wasOffline: true
        });
      }
    });

    this.subscriptions.push(sub);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }
}
