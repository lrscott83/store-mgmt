import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// TEMP (testing): 2 minutes. Angular parity value is 15 * 60 * 1000 — revert before commit.
const POLL_INTERVAL_MS = 2 * 60 * 1000;

describe('setupServiceWorker — PWA-SW-1: polls registration.update() on the configured interval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls registration.update() once the interval elapses after onRegisteredSW fires', async () => {
    const registration = { update: vi.fn().mockResolvedValue(undefined) } as unknown as ServiceWorkerRegistration;
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
