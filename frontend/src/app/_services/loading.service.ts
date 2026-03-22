import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private count = 0;
  private _loading = new BehaviorSubject<boolean>(false);
  loading$ = this._loading.asObservable();

  constructor() {
    console.log('[LoadingService] CONSTRUCTOR called');
  }

  start(): void {
    this.count++;
    console.log('[LoadingService] start() - count:', this.count);
    this._loading.next(true);
  }

  stop(): void {
    this.count = Math.max(0, this.count - 1);
    console.log('[LoadingService] stop() - count:', this.count);
    if (this.count === 0) {
      this._loading.next(false);
    }
  }
}
