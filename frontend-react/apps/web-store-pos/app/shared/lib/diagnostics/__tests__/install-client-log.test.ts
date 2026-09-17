import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── install-client-log: hooks globales de captura ───────────────────────────
// Contrato (docs/plans/2026-09-14-client-error-log-pwa-plan.md §3.2):
//  - window 'error' y 'unhandledrejection' quedan en el buffer como level 'error'
//  - console.error/console.warn envueltos: llaman al original Y capturan
//  - eventos 'online'/'offline' generan entradas 'info'
//  - uninstallClientLog() restaura TODO (listeners + console) y no captura más

describe('installClientLog — captura global', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(async () => {
    const { uninstallClientLog } = await import('../install-client-log');
    uninstallClientLog();
  });

  it('captures window error events into the buffer as level error', async () => {
    const { installClientLog } = await import('../install-client-log');
    const { getClientLogs } = await import('../client-log');
    installClientLog();

    const event = new ErrorEvent('error', {
      message: 'TypeError: boom',
      filename: '/assets/index.js',
      lineno: 42,
      colno: 7,
      error: new Error('boom'),
    });
    window.dispatchEvent(event);

    const logs = getClientLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('error');
    expect(logs[0].message).toContain('boom');
  });

  it('captures unhandledrejection events with the rejection reason', async () => {
    const { installClientLog } = await import('../install-client-log');
    const { getClientLogs } = await import('../client-log');
    installClientLog();

    const event = new Event('unhandledrejection', { cancelable: true }) as Event & {
      reason: unknown;
    };
    event.reason = new Error('promise rejected');
    const claimed = !window.dispatchEvent(event);

    // The logger must NOT claim the event (preventDefault) — vitest's bridge
    // and any other listener keep their right to see it.
    expect(claimed).toBe(false);
    const logs = getClientLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('error');
    expect(logs[0].message).toContain('promise rejected');
  });

  it('wraps console.error: calls the original AND captures the message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { installClientLog } = await import('../install-client-log');
    const { getClientLogs } = await import('../client-log');
    installClientLog();

    console.error('something failed', 42);

    const logs = getClientLogs();
    expect(consoleSpy).toHaveBeenCalledWith('something failed', 42);
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('error');
    expect(logs[0].message).toContain('something failed');
    expect(logs[0].message).toContain('42');
    consoleSpy.mockRestore();
  });

  it('wraps console.warn the same way, as level warn', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { installClientLog } = await import('../install-client-log');
    const { getClientLogs } = await import('../client-log');
    installClientLog();

    console.warn('deprecation notice');

    const logs = getClientLogs();
    expect(consoleSpy).toHaveBeenCalledWith('deprecation notice');
    expect(logs[0].level).toBe('warn');
    expect(logs[0].message).toContain('deprecation notice');
    consoleSpy.mockRestore();
  });

  it('records online/offline transitions as info entries', async () => {
    const { installClientLog } = await import('../install-client-log');
    const { getClientLogs } = await import('../client-log');
    installClientLog();

    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));

    const logs = getClientLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0].level).toBe('info');
    expect(logs[0].message).toMatch(/offline|sin conexión/i);
    expect(logs[1].level).toBe('info');
    expect(logs[1].message).toMatch(/online|conexión restaurada/i);
  });
});

describe('installClientLog — seguridad en prerender (regresión de build)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('es no-op durante el prerender SPA (window undefined): no lanza y no captura', async () => {
    // El probe imprime a stderr de forma deliberada; el spy solo silencia la
    // salida. La semántica de captura no cambia (sin window no hay hooks).
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { installClientLog } = await import('../install-client-log');
    const { getClientLogs } = await import('../client-log');

    // El prerender de react-router (build) ejecuta root.tsx sin `window`.
    // Antes del guard, esto lanzaba ReferenceError y abortaba el build.
    vi.stubGlobal('window', undefined);
    expect(typeof window).toBe('undefined');

    expect(() => installClientLog()).not.toThrow();

    // Sin window no se montan hooks: un console.error no debe quedar en el buffer.
    console.error('prerender probe');
    expect(getClientLogs()).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it('tras el no-op de prerender, con window presente vuelve a instalar y captura', async () => {
    // El probe imprime a stderr de forma deliberada; el spy solo silencia la
    // salida. Debe instalarse ANTES de installClientLog(): el wrapper captura el
    // spy como `originalConsoleError`, así el mensaje sigue entrando al buffer.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { installClientLog, uninstallClientLog } = await import('../install-client-log');
    const { getClientLogs } = await import('../client-log');

    vi.stubGlobal('window', undefined);
    installClientLog(); // no-op en prerender — no marca `installed`

    vi.unstubAllGlobals(); // simula el hidratado en el navegador
    installClientLog();

    console.error('browser probe');
    expect(getClientLogs()).toHaveLength(1);
    expect(getClientLogs()[0].message).toContain('browser probe');

    // Orden importante: primero uninstall (restaura `console.error` al valor que
    // el wrapper capturó, el spy) y luego mockRestore (vuelve al console.error
    // original) — al revés dejaría el spy instalado y rompería el próximo spyOn.
    uninstallClientLog();
    consoleSpy.mockRestore();
  });
});

describe('uninstallClientLog — restauración completa', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('after uninstall nothing else is captured and console is restored', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { installClientLog, uninstallClientLog } = await import('../install-client-log');
    const { getClientLogs } = await import('../client-log');

    installClientLog();
    console.error('captured');
    expect(getClientLogs()).toHaveLength(1);

    uninstallClientLog();

    console.error('not captured anymore');
    window.dispatchEvent(new ErrorEvent('error', { message: 'also not captured' }));
    expect(getClientLogs()).toHaveLength(1);
    expect(getClientLogs()[0].message).toContain('captured');
    expect(getClientLogs()[0].message).not.toContain('not captured anymore');
    consoleSpy.mockRestore();
  });

  it('install is idempotent — calling it twice does not double-capture', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { installClientLog, uninstallClientLog } = await import('../install-client-log');
    const { getClientLogs } = await import('../client-log');

    installClientLog();
    installClientLog();

    console.error('once is enough');
    expect(getClientLogs()).toHaveLength(1);

    uninstallClientLog();
    consoleSpy.mockRestore();
  });
});
