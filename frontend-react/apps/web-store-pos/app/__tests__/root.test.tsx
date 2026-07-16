import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useLoadingStore } from '~/shared/lib/stores/loading-store';

const mockNavigate = vi.fn();
const mockRegisterAuthRedirect = vi.fn();

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('~/shared/lib/stores/auth-store', () => ({
  registerAuthRedirect: (fn: (path: string) => void) => mockRegisterAuthRedirect(fn),
}));

vi.mock('~/shared/lib/pwa/service-worker-registration', () => ({
  registerServiceWorker: vi.fn(),
}));

vi.mock('~/shared/lib/usage/use-store-usage-tracker', () => ({
  useStoreUsageTracker: vi.fn(),
}));

vi.mock('~/shared/lib/i18n/i18n-provider', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import App from '../root';

describe('App (root) — registers the auth-store redirect handler on mount (Decision 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLoadingStore.setState({ count: 0, isLoading: false });
  });

  it('calls registerAuthRedirect with the router navigate function on mount', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(mockRegisterAuthRedirect).toHaveBeenCalledWith(mockNavigate);
  });
});

// Angular parity: app.component.ts:33 (`loading$ = loadingService.loading$`) +
// app.component.html:2-6 (`@if (loading$ | async) { <div class="http-loading-overlay">... }`)
// — a full-screen overlay renders above the router outlet whenever an HTTP
// request is in flight, and disappears the instant it isn't.
describe('App (root) — global HTTP-loading overlay (Angular app.component.html:2-6 parity)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLoadingStore.setState({ count: 0, isLoading: false });
  });

  it('does not render the loading overlay when no request is in flight', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the loading overlay when useLoadingStore.isLoading is true', () => {
    useLoadingStore.setState({ count: 1, isLoading: true });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    // LoadingOverlay nests a Spinner, and both carry role="status" (overlay
    // container + inner spinner icon), so assert at least one is present.
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });
});

// Angular parity: app.component.html hosts <router-outlet> for the WHOLE app
// (landing, login, register, and every authenticated route), so the
// "Instalar App" pwa-install-btn renders globally, not just on authenticated
// pages. RR7's true equivalent of AppComponent is this root, not
// app-layout.tsx (which only wraps the authenticated route subtree).
describe('App (root) — global PWA install button (Angular app.component parity)', () => {
  function setServiceWorkerSupported(supported: boolean) {
    if (supported) {
      Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
    } else if ('serviceWorker' in navigator) {
      delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    }
  }

  function setStandalone(matches: boolean) {
    window.matchMedia = vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useLoadingStore.setState({ count: 0, isLoading: false });
    setServiceWorkerSupported(true);
    setStandalone(false);
  });

  afterEach(() => {
    setServiceWorkerSupported(false);
  });

  it('renders the "Instalar App" button at the global root, reachable on every route', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /instalar app/i })).toBeInTheDocument();
  });
});
