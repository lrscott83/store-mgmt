import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { InstallAppButton } from '../install-app-button';

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

describe('InstallAppButton — Angular app.component pwa-install-btn parity', () => {
  beforeEach(() => {
    setServiceWorkerSupported(true);
    setStandalone(false);
  });

  afterEach(() => {
    setServiceWorkerSupported(false);
    vi.restoreAllMocks();
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
});
