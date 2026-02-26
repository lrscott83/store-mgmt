import { Injectable } from '@angular/core';
import { AuthService } from './services.index';

@Injectable()
export class AppInitService {
  constructor(private authService: AuthService) {}

  Init() {
    return new Promise<void>((resolve, reject) => {
      try {
        console.log('[AppInit] Starting initialization...');
        this.authService.getUserByToken().subscribe({
          next: (user) => {
            console.log('[AppInit] getUserByToken returned:', user);
            resolve();
          },
          error: (err) => {
            console.log('[AppInit] getUserByToken error:', err);
            resolve();
          }
        });
      } catch (exception) {
        console.log('[AppInit] Exception:', JSON.stringify(exception));
        resolve();
      }
    });
  }
}
