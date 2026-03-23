import { Injectable } from '@angular/core';
import { AuthService } from './services.index';
import { IconSetupService } from './icon-setup.service';

console.log('[AppInit] Service instantiated');

@Injectable()
export class AppInitService {
  constructor(
    private authService: AuthService,
    private iconSetupService: IconSetupService
  ) {
    console.log('[AppInit] Constructor called');
  }

  Init() {
    console.log('[AppInit] Init() called - STARTING');

    // Initialize Material Icons font from local assets
    this.iconSetupService.init();

    return new Promise<void>((resolve, reject) => {
      try {
        console.log('[AppInit] Calling authService.getUserByToken()...');
        this.authService.getUserByToken().subscribe({
          next: (user) => {
            console.log('[AppInit] getUserByToken completed, user:', user);
            resolve();
          },
          error: (err) => {
            console.log('[AppInit] getUserByToken ERROR:', err);
            resolve();
          }
        });
      } catch (exception) {
        console.log('[AppInit] Exception in Init:', exception);
        resolve();
      }
    });
  }
}
