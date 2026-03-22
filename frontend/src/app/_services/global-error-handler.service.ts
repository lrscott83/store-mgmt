import { Injectable, ErrorHandler, NgZone } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private ngZone: NgZone) {}

  handleError(error: any): void {
    let message = error?.message || error?.toString() || 'Unknown error';
    const stack = error?.stack || '';

    console.error('[GlobalErrorHandler] ERROR:', message);
    console.error('[GlobalErrorHandler] STACK:', stack);
    console.error('[GlobalErrorHandler] FULL ERROR:', error);

    // NG04002 is typically about missing provider - show more context
    if (message.includes('NG04002') || message.includes("'local'")) {
      message = this.getEnhancedMessage(message, error);
    }

    this.showErrorInUI(message, stack);
  }

  private getEnhancedMessage(message: string, error: any): string {
    let enhanced = message;

    if (message.includes("'local'")) {
      enhanced =
        `NG04002: Missing provider for 'local' token. ` +
        `This is likely a circular dependency or missing provider in the app. ` +
        `Full error: ${message}`;
    }

    return enhanced;
  }

  private showErrorInUI(message: string, stack: string): void {
    this.ngZone.run(() => {
      const existingError = document.getElementById('pwa-error');
      if (existingError) existingError.remove();

      const safeMessage = message.length > 500 ? message.substring(0, 500) + '...' : message;
      const safeStack = stack.length > 1000 ? stack.substring(0, 1000) + '...' : stack;

      const errorDiv = document.createElement('div');
      errorDiv.id = 'pwa-error';
      errorDiv.style.cssText = `
        position: fixed;
        top: 5%;
        left: 5%;
        right: 5%;
        bottom: 5%;
        background: #1a1a1a;
        color: #ff6b6b;
        padding: 20px;
        border-radius: 8px;
        max-width: 90%;
        font-family: monospace;
        font-size: 12px;
        z-index: 999999;
        text-align: left;
        border: 1px solid #ff6b6b;
        overflow: auto;
      `;
      errorDiv.innerHTML = `
        <h3 style="margin: 0 0 10px; color: #ff6b6b; font-size: 16px;">Error en la app</h3>
        <p style="margin: 0 0 10px; color: #f5b026; font-weight: bold; word-break: break-word;">${safeMessage}</p>
        <details>
          <summary style="color: #888; cursor: pointer;">Stacktrace</summary>
          <pre style="background: #000; padding: 10px; overflow: auto; max-height: 300px; color: #666; font-size: 10px;">${safeStack}</pre>
        </details>
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
