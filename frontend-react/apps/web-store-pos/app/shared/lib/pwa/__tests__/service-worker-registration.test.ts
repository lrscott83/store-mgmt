import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Swal from 'sweetalert2';
import { UPDATE_POLL_INTERVAL_MS } from '../service-worker-registration';
import type { RegisterSWOptions } from '../service-worker-registration';

// ── PWA-SW-1/2 (Stage 6 Slice D — Periodic Update Check) ────────────────────
// `setupServiceWorker` is dependency-injected with a `registerSW`-shaped
// function so the interval-polling logic is unit-testable without mocking the
// `virtual:pwa-register` module (a vite-plugin-pwa virtual module vitest
// never resolves for real). `registerServiceWorker` is the thin SW-support
// guard that performs the actual dynamic import in the browser.

vi.mock('sweetalert2', () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: false }) },
}));

// Advance by the real configured interval (not a hardcoded copy) so this
// stays accurate if the production interval is ever tuned again.
const POLL_INTERVAL_MS = UPDATE_POLL_INTERVAL_MS;

describe('setupServiceWorker — PWA-SW-1: polls registration.update() on the configured interval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls registration.update() once the interval elapses after onRegisteredSW fires', async () => {
    const registration = {
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as ServiceWorkerRegistration;
    let capturedOnRegisteredSW:
      | ((swScriptUrl: string, reg: ServiceWorkerRegistration | undefined) => void)
      | undefined;

    const registerSW = vi.fn((options: RegisterSWOptions) => {
      capturedOnRegisteredSW = options.onRegisteredSW;
      return vi.fn();
    });

    const { setupServiceWorker } = await import('../service-worker-registration');
    setupServiceWorker(registerSW);
    capturedOnRegisteredSW?.('sw.js', registration);

    expect(registration.update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(registration.update).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it('does not schedule polling when no registration is available', async () => {
    let capturedOnRegisteredSW:
      | ((swScriptUrl: string, reg: ServiceWorkerRegistration | undefined) => void)
      | undefined;

    const registerSW = vi.fn((options: RegisterSWOptions) => {
      capturedOnRegisteredSW = options.onRegisteredSW;
      return vi.fn();
    });

    const setIntervalSpy = vi.spyOn(global, 'setInterval');

    const { setupServiceWorker } = await import('../service-worker-registration');
    setupServiceWorker(registerSW);
    capturedOnRegisteredSW?.('sw.js', undefined);

    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});

// El catálogo público (`/catalog/<slug>`) es la carta del cliente final: anónima y ajena al
// POS. Un usuario que venía del POS entra ahí por navegación SPA, con el service worker YA
// registrado, así que excluir el registro (root.tsx) no basta: si entonces llega una versión
// nueva, el diálogo "¡Nueva versión disponible!" se le abriría encima de la carta.
describe('setupServiceWorker — onNeedRefresh never interrupts the public catalog', () => {
  function captureOptions() {
    let captured: RegisterSWOptions | undefined;
    // Lo que `registerSW` devuelve es el `updateSW(reloadPage?)` de vite-plugin-pwa.
    const updateSW = vi.fn().mockResolvedValue(undefined);
    const registerSW = vi.fn((options: RegisterSWOptions) => {
      captured = options;
      return updateSW;
    });
    return { registerSW, updateSW, get: () => captured };
  }

  /** jsdom: `history.pushState` actualiza `window.location.pathname` sin recargar. */
  function visit(path: string) {
    window.history.pushState({}, '', path);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    visit('/');
  });

  afterEach(() => {
    visit('/');
  });

  it('shows the update dialog when a new version is waiting on a POS route', async () => {
    const { setupServiceWorker } = await import('../service-worker-registration');
    const { registerSW, get } = captureOptions();
    setupServiceWorker(registerSW);

    visit('/sales/new');
    get()?.onNeedRefresh?.();

    expect(Swal.fire).toHaveBeenCalledWith(
      expect.objectContaining({ title: '¡Nueva versión disponible!' }),
    );
  });

  it('shows no dialog at all on a public catalog route', async () => {
    const { setupServiceWorker } = await import('../service-worker-registration');
    const { registerSW, get } = captureOptions();
    setupServiceWorker(registerSW);

    visit('/catalog/mi-tienda');
    get()?.onNeedRefresh?.();

    // Supresión TOTAL: ni el diálogo ni un sustituto. Un aviso de versión aquí no le
    // significa nada a quien no usa el POS, y el diálogo es bloqueante.
    expect(Swal.fire).not.toHaveBeenCalled();
  });

  it('does not confuse a POS route that merely contains "catalog" for the storefront', async () => {
    const { setupServiceWorker } = await import('../service-worker-registration');
    const { registerSW, get } = captureOptions();
    setupServiceWorker(registerSW);

    visit('/sales/web-catalog');
    get()?.onNeedRefresh?.();

    expect(Swal.fire).toHaveBeenCalledWith(
      expect.objectContaining({ title: '¡Nueva versión disponible!' }),
    );
  });

  it('never applies the update the user cannot confirm: the catalog leaves the SW alone', async () => {
    const { setupServiceWorker } = await import('../service-worker-registration');
    const { registerSW, updateSW, get } = captureOptions();
    setupServiceWorker(registerSW);

    visit('/catalog/mi-tienda');
    get()?.onNeedRefresh?.();

    // `updateSW`/`window.location.reload` sólo se alcanzan desde el `onConfirm` del diálogo;
    // sin diálogo no hay SKIP_WAITING ni recarga hard encima de la carta de un cliente.
    expect(updateSW).not.toHaveBeenCalled();
  });
});

describe('registerServiceWorker — PWA-SW-2: inert without SW support', () => {
  const registerSWMock = vi.fn(() => vi.fn());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock('virtual:pwa-register', () => ({ registerSW: registerSWMock }));
    // jsdom has no `navigator.serviceWorker` by default — start every test
    // from that clean "unsupported" baseline instead of trusting a value
    // left behind by a previous test (setting a property to `undefined` via
    // `defineProperty` still leaves the key present, which `'x' in obj`
    // would treat as "supported").
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  afterEach(() => {
    vi.doUnmock('virtual:pwa-register');
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it('does not attempt to register when serviceWorker is unsupported', async () => {
    const { registerServiceWorker } = await import('../service-worker-registration');
    registerServiceWorker();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(registerSWMock).not.toHaveBeenCalled();
  });

  it('registers when serviceWorker is supported', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });

    const { registerServiceWorker } = await import('../service-worker-registration');
    registerServiceWorker();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(registerSWMock).toHaveBeenCalledTimes(1);
  });
});
