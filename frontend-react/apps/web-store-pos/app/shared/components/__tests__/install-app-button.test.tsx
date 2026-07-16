import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { InstallAppButton } from '../install-app-button';
import { initPwaInstallCapture, resetPwaInstallPromptForTests } from '~/shared/lib/pwa/pwa-install-prompt';

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
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  }
}

function setInstalledRelatedApps(apps: Array<{ platform: string }> | null) {
  if (apps === null) {
    delete (navigator as unknown as Record<string, unknown>).getInstalledRelatedApps;
    return;
  }
  Object.defineProperty(navigator, 'getInstalledRelatedApps', {
    value: vi.fn().mockResolvedValue(apps),
    configurable: true,
  });
}

describe('InstallAppButton — Angular app.component pwa-install-btn parity', () => {
  beforeEach(() => {
    setServiceWorkerSupported(true);
    setStandalone(false);
    resetPwaInstallPromptForTests();
  });

  afterEach(() => {
    setServiceWorkerSupported(false);
    setInstalledRelatedApps(null);
    vi.restoreAllMocks();
    resetPwaInstallPromptForTests();
  });

  it('renders the "Instalar App" button when installable, disabled until a prompt is captured', () => {
    render(<InstallAppButton />);
    const btn = screen.getByRole('button', { name: /instalar app/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it('does NOT render when the app is already running standalone (installed)', () => {
    setStandalone(true);
    render(<InstallAppButton />);
    expect(screen.queryByRole('button', { name: /instalar app/i })).not.toBeInTheDocument();
  });

  // DIVERGENCE FROM ANGULAR (product decision): Angular keeps showing the
  // install button (disabled) in a browser tab even when the PWA is already
  // installed. React hides it. An app installed in a PREVIOUS session and now
  // viewed in a NON-standalone tab is only detectable via
  // `navigator.getInstalledRelatedApps()` (beforeinstallprompt never fires for
  // an installed app; appinstalled only fires at install time).
  it('does NOT render once getInstalledRelatedApps reports the PWA is already installed', async () => {
    setInstalledRelatedApps([{ platform: 'webapp' }]);
    render(<InstallAppButton />);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /instalar app/i })).not.toBeInTheDocument(),
    );
  });

  it('KEEPS rendering when getInstalledRelatedApps reports no installed webapp', async () => {
    setInstalledRelatedApps([]);
    render(<InstallAppButton />);
    const btn = await screen.findByRole('button', { name: /instalar app/i });
    // Give the async detection a chance to (wrongly) hide it.
    await waitFor(() => expect(btn).toBeInTheDocument());
  });

  it('does NOT render when service workers are unsupported', () => {
    setServiceWorkerSupported(false);
    render(<InstallAppButton />);
    expect(screen.queryByRole('button', { name: /instalar app/i })).not.toBeInTheDocument();
  });

  it('enables the button after beforeinstallprompt and fires prompt() on click', async () => {
    render(<InstallAppButton />);
    const evt = makeInstallPromptEvent('accepted');
    act(() => {
      window.dispatchEvent(evt);
    });

    const btn = screen.getByRole('button', { name: /instalar app/i });
    await waitFor(() => expect(btn).toBeEnabled());

    fireEvent.click(btn);
    expect(evt.prompt).toHaveBeenCalledTimes(1);
  });

  // Regression: Chrome fires `beforeinstallprompt` once, early in page load —
  // often before React hydrates. A `useEffect`-only listener attaches AFTER
  // hydration and misses it, leaving the button stuck disabled even though
  // the browser considers the app installable. `entry.client.tsx` calls
  // `initPwaInstallCapture()` at module scope (before hydration) so the
  // window listener exists before mount; here we simulate that exact
  // ordering — capture initialized, event dispatched, THEN the component
  // (and its hook) mounts — and assert the already-captured prompt is still
  // reflected. Against the old useEffect-only hook this fails: its listener
  // only exists after mount, so an event dispatched beforehand is lost.
  it('reflects a beforeinstallprompt event fired BEFORE the component mounts (early-capture fix)', async () => {
    initPwaInstallCapture();
    const evt = makeInstallPromptEvent('accepted');
    window.dispatchEvent(evt);

    render(<InstallAppButton />);

    const btn = await screen.findByRole('button', { name: /instalar app/i });
    await waitFor(() => expect(btn).toBeEnabled());
  });
});
