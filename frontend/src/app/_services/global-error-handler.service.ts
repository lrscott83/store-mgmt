import { Injectable, ErrorHandler, NgZone } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private ngZone: NgZone) {}

  handleError(error: any): void {
    const message = error?.message || error?.toString() || 'Unknown error';
    const stack = error?.stack || '';

    console.error('[GlobalErrorHandler] ERROR:', message);
    console.error('[GlobalErrorHandler] STACK:', stack);

    // Try to show error in the UI since console might not be visible in PWA
    this.showErrorInUI(message);
  }

  private showErrorInUI(message: string): void {
    this.ngZone.run(() => {
      const existingError = document.getElementById('pwa-error');
      if (existingError) existingError.remove();

      const errorDiv = document.createElement('div');
      errorDiv.id = 'pwa-error';
      errorDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #1a1a1a;
        color: #ff6b6b;
        padding: 20px;
        border-radius: 8px;
        max-width: 90%;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        z-index: 999999;
        text-align: center;
        border: 1px solid #ff6b6b;
      `;
      errorDiv.innerHTML = `
        <h3 style="margin: 0 0 10px; color: #ff6b6b;">Error en la app</h3>
        <p style="margin: 0; color: #888;">${message}</p>
        <button onclick="this.parentElement.remove()" style="
          margin-top: 15px;
          padding: 8px 16px;
          background: #ff6b6b;
          color: #000;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        ">Cerrar</button>
      `;
      document.body.appendChild(errorDiv);
    });
  }
}