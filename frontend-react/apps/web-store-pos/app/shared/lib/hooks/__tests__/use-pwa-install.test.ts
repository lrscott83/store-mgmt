// The install affordance, which is offered on a best-effort basis by design.
//
// The hook is a thin projection: `useSyncExternalStore` over the
// framework-agnostic `pwa-install-prompt` store (which captures
// `beforeinstallprompt` as early as `entry.client.tsx`, long before hydration),
// plus a persisted "this origin's PWA is installed" flag. The button appears
// only when service workers are supported, the app is not running standalone,
// and the app is not known to be installed — and it stays disabled until a real
// prompt has been captured.
//
// Nothing internal is mocked: the capture store is the REAL module, and the
// browser surface it listens to (window events, `navigator.serviceWorker`,
// `window.matchMedia`, `localStorage`) is stubbed the way a browser would
// provide it. `renderHook` + `act` follow the convention of
// `use-online-status.test.ts` / `use-click-outside.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  initPwaInstallCapture,
  resetPwaInstallPromptForTests,
} from '../../pwa/pwa-install-prompt';
import { usePwaInstall } from '../use-pwa-install';

/** The localStorage key the hook writes on `appinstalled` (see the module). */
const INSTALLED_FLAG_KEY = 'pwa-installed';

type InstallPromptEvent = Event & {
  prompt: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: string }>;
};

/** A real `beforeinstallprompt`, with the non-standard prompt()/userChoice API. */
function makeBeforeInstallPrompt(): InstallPromptEvent {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as InstallPromptEvent;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  return event;
}

function setServiceWorkerSupported(supported: boolean): void {
  if (supported) {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {},
      configurable: true,
    });
  } else {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  }
}

/** jsdom ships no `matchMedia`; the hook guards for its absence, so supply it. */
function stubDisplayMode(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes('standalone') ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function setIosStandalone(value: boolean | undefined): void {
  Object.defineProperty(navigator, 'standalone', {
    value,
    configurable: true,
  });
}

function setRelatedApps(implementation: () => Promise<Array<{ platform: string }>>): void {
  Object.defineProperty(navigator, 'getInstalledRelatedApps', {
    value: implementation,
    configurable: true,
  });
}

beforeEach(() => {
  localStorage.clear();
  resetPwaInstallPromptForTests();
  setServiceWorkerSupported(true);
  stubDisplayMode(false);
  setIosStandalone(undefined);
  Reflect.deleteProperty(navigator, 'getInstalledRelatedApps');
});

afterEach(() => {
  resetPwaInstallPromptForTests();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('usePwaInstall — initial state', () => {
  it('offers the affordance in a plain tab on a service-worker-capable browser', () => {
    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.canInstall).toBe(true);
    // Nothing has been captured yet, so the button must stay disabled.
    expect(result.current.canPrompt).toBe(false);
    expect(typeof result.current.promptInstall).toBe('function');
  });

  it('hides the affordance when the browser has no service worker support', () => {
    setServiceWorkerSupported(false);

    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.canInstall).toBe(false);
  });

  it('hides the affordance in standalone display mode', () => {
    stubDisplayMode(true);

    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.canInstall).toBe(false);
  });

  it('hides the affordance on iOS, which exposes standalone on navigator, not matchMedia', () => {
    setIosStandalone(true);

    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.canInstall).toBe(false);
  });

  it('hides the affordance when this origin was installed in a previous session', () => {
    // `appinstalled` only fires at install time, so an app installed in another
    // session is invisible to JS without the persisted flag.
    localStorage.setItem(INSTALLED_FLAG_KEY, 'true');

    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.canInstall).toBe(false);
  });

  it('promptInstall is a no-op while no prompt is captured', async () => {
    const { result } = renderHook(() => usePwaInstall());

    await expect(result.current.promptInstall()).resolves.toBeUndefined();
  });
});

describe('usePwaInstall — prompt capture', () => {
  it('picks up a beforeinstallprompt captured after mount', () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canPrompt).toBe(false);

    act(() => {
      window.dispatchEvent(makeBeforeInstallPrompt());
    });

    expect(result.current.canPrompt).toBe(true);
  });

  it('adopts a prompt the early inline <head> script parked before hydration', () => {
    // Chrome fires beforeinstallprompt once, often before the bundle runs. The
    // inline script in root.tsx parks it on `window.__pwaInstallPrompt`, and
    // the store adopts it when the hook first subscribes. A hook that only
    // listened from a useEffect would miss it and the button would stay
    // disabled for the lifetime of the session.
    const event = makeBeforeInstallPrompt();
    (window as unknown as { __pwaInstallPrompt?: unknown }).__pwaInstallPrompt = event;

    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.canPrompt).toBe(true);
  });

  it('reflects a prompt captured by the store before the hook mounted', () => {
    initPwaInstallCapture();
    act(() => {
      window.dispatchEvent(makeBeforeInstallPrompt());
    });

    const { result } = renderHook(() => usePwaInstall());

    expect(result.current.canPrompt).toBe(true);
  });

  it('promptInstall fires the captured prompt exactly once', async () => {
    const event = makeBeforeInstallPrompt();
    const { result } = renderHook(() => usePwaInstall());
    act(() => {
      window.dispatchEvent(event);
    });

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
    // A prompt can only be used once, so the affordance goes back to disabled.
    expect(result.current.canPrompt).toBe(false);
  });

  it('self-heals a stale installed flag: a fresh prompt means the app is NOT installed', async () => {
    localStorage.setItem(INSTALLED_FLAG_KEY, 'true');
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canInstall).toBe(false);

    const event = makeBeforeInstallPrompt();
    act(() => {
      window.dispatchEvent(event);
    });

    // beforeinstallprompt never fires for an installed app, so this can only
    // mean the previous install was undone.
    expect(result.current.canInstall).toBe(true);
    expect(localStorage.getItem(INSTALLED_FLAG_KEY)).toBeNull();
  });
});

describe('usePwaInstall — the installed transition', () => {
  it('hides the affordance on appinstalled and remembers it for the next load', () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canInstall).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.canInstall).toBe(false);
    expect(localStorage.getItem(INSTALLED_FLAG_KEY)).toBe('true');
  });

  it('drops the captured prompt on appinstalled — the prompt is spent', () => {
    const { result } = renderHook(() => usePwaInstall());
    act(() => {
      window.dispatchEvent(makeBeforeInstallPrompt());
    });
    expect(result.current.canPrompt).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.canPrompt).toBe(false);
  });
});

describe('usePwaInstall — the Chromium getInstalledRelatedApps signal', () => {
  it('hides the affordance when the browser reports the app as installed', async () => {
    setRelatedApps(async () => [{ platform: 'webapp' }]);

    const { result } = renderHook(() => usePwaInstall());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.canInstall).toBe(false);
    expect(localStorage.getItem(INSTALLED_FLAG_KEY)).toBe('true');
  });

  it('keeps offering the affordance when no related app is reported', async () => {
    setRelatedApps(async () => [{ platform: 'other' }]);

    const { result } = renderHook(() => usePwaInstall());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.canInstall).toBe(true);
  });

  it('falls back to showing the affordance when the query rejects', async () => {
    setRelatedApps(async () => {
      throw new Error('not permitted');
    });

    const { result } = renderHook(() => usePwaInstall());

    await act(async () => {
      await Promise.resolve();
    });

    // Best-effort signal: a failure must not hide the install button.
    expect(result.current.canInstall).toBe(true);
  });

  it('ignores a late answer after unmount', async () => {
    let resolveRelated: ((apps: Array<{ platform: string }>) => void) | null = null;
    setRelatedApps(
      () =>
        new Promise<Array<{ platform: string }>>((resolve) => {
          resolveRelated = resolve;
        }),
    );

    const { result, unmount } = renderHook(() => usePwaInstall());
    unmount();

    await act(async () => {
      resolveRelated?.([{ platform: 'webapp' }]);
      await Promise.resolve();
    });

    expect(localStorage.getItem(INSTALLED_FLAG_KEY)).toBeNull();
    expect(result.current.canInstall).toBe(true);
  });
});

describe('usePwaInstall — listener cleanup', () => {
  it('removes the appinstalled listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => usePwaInstall());
    unmount();

    const removedEvents = removeEventListenerSpy.mock.calls.map((call) => call[0]);
    expect(removedEvents).toContain('appinstalled');
  });

  it('an appinstalled after unmount neither writes the flag nor throws', () => {
    const { unmount } = renderHook(() => usePwaInstall());
    unmount();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(localStorage.getItem(INSTALLED_FLAG_KEY)).toBeNull();
  });
});
