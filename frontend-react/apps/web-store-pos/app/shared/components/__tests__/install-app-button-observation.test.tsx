// Forensic observation of the visibly disabled "Instalar App" button.
//
// The pill is amber at 60% opacity whenever it is shown but no
// `beforeinstallprompt` has been captured. That is the NORMAL startup state:
// the event fires after mount (the service-worker registration is deferred by
// 5 s), so only a button that STAYS disabled beyond
// `DISABLED_OBSERVATION_MS` is an anomaly worth reporting. The button must not
// change its rendering: it only records in memory, and a later prompt marks
// the observation resolved so the export never states a disproved cause.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { InstallAppButton } from '../install-app-button';
import { resetPwaInstallPromptForTests } from '~/shared/lib/pwa/pwa-install-prompt';
import {
  DISABLED_OBSERVATION_MS,
  getLastObservedInstallState,
  resetInstallDiagnosticsForTests,
} from '~/shared/lib/pwa/pwa-install-diagnostics';

/** Builds a fake `beforeinstallprompt` event with the prompt()/userChoice API. */
function makeInstallPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const evt = new Event('beforeinstallprompt') as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  evt.prompt = vi.fn().mockResolvedValue(undefined);
  evt.userChoice = Promise.resolve({ outcome });
  return evt;
}

function setStandalone(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

function setServiceWorkerSupported(supported: boolean) {
  if (supported) {
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
  } else if ('serviceWorker' in navigator) {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  }
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('InstallAppButton — forensic install-state observation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setServiceWorkerSupported(true);
    setStandalone(false);
    localStorage.clear();
    resetInstallDiagnosticsForTests();
    resetPwaInstallPromptForTests();
  });

  afterEach(() => {
    setServiceWorkerSupported(false);
    localStorage.clear();
    resetInstallDiagnosticsForTests();
    resetPwaInstallPromptForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('records awaiting-prompt once the button has stayed disabled for the whole window', () => {
    render(<InstallAppButton />);
    expect(screen.getByRole('button', { name: /instalar app/i })).toBeDisabled();

    advance(DISABLED_OBSERVATION_MS);

    const observed = getLastObservedInstallState();
    expect(observed?.availability).toBe('awaiting-prompt');
    expect(observed?.resolvedAt).toBeNull();
    expect(new Date(observed?.observedAt ?? '').toISOString()).toBe(observed?.observedAt);
  });

  it('records nothing while the stabilization window has not elapsed', () => {
    render(<InstallAppButton />);

    advance(DISABLED_OBSERVATION_MS - 1);

    expect(getLastObservedInstallState()).toBeNull();
  });

  it('records nothing on a healthy device whose prompt arrives inside the window', () => {
    render(<InstallAppButton />);

    act(() => {
      window.dispatchEvent(makeInstallPromptEvent('accepted'));
    });
    advance(DISABLED_OBSERVATION_MS * 2);

    expect(screen.getByRole('button', { name: /instalar app/i })).toBeEnabled();
    expect(getLastObservedInstallState()).toBeNull();
  });

  it('marks an existing observation resolved when a prompt finally arrives', () => {
    render(<InstallAppButton />);
    advance(DISABLED_OBSERVATION_MS);
    expect(getLastObservedInstallState()?.availability).toBe('awaiting-prompt');

    act(() => {
      window.dispatchEvent(makeInstallPromptEvent('accepted'));
    });

    const observed = getLastObservedInstallState();
    expect(observed?.availability).toBe('awaiting-prompt');
    expect(observed?.resolvedAt).not.toBeNull();
    expect(new Date(observed?.resolvedAt ?? '').toISOString()).toBe(observed?.resolvedAt);
  });
});
