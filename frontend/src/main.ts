import { enableProdMode, provideZoneChangeDetection } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

console.log('[MAIN] Starting app bootstrap...');
console.log('[MAIN] Environment:', environment.production ? 'production' : 'development');

if (environment.production) {
  enableProdMode();
}

console.log('[MAIN] Calling platformBrowserDynamic...');

platformBrowserDynamic()
  .bootstrapModule(AppModule, { applicationProviders: [provideZoneChangeDetection()] })
  .then((ref) => {
    console.log('[MAIN] Bootstrap SUCCESS, Angular app is running');
    // Ensure Angular destroys itself on hot reloads.
    if (window['ngRef']) {
      console.log('[MAIN] Destroying previous ngRef...');
      window['ngRef'].destroy();
    }
    window['ngRef'] = ref;
  })
  .catch((err) => {
    console.error('[MAIN] Bootstrap FAILED:', err);
    // Show error on screen for PWA
    document.body.innerHTML = `<div style="color:red;padding:20px;"><h1>Error de inicio</h1><pre>${err}</pre></div>`;
  });
