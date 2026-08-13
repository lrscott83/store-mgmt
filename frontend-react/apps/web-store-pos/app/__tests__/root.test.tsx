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
    // `Meta`/`Links` need the framework-mode router context that only the real dev/SSR
    // server provides (`<HydratedRouter>`); Vitest never runs that server. They render
    // nothing user-visible, so they're stubbed as no-ops here to let `Layout` render in
    // isolation for the ToastContainer assertion below.
    Meta: () => null,
    Links: () => null,
    ScrollRestoration: () => null,
    Scripts: () => null,
  };
});

const mockWillLogoutRedirect = vi.fn(() => true);
vi.mock('~/shared/lib/stores/auth-store', () => ({
  registerAuthRedirect: (fn: (path: string) => void) => mockRegisterAuthRedirect(fn),
  willLogoutRedirect: () => mockWillLogoutRedirect(),
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

// design D5: root.tsx owns the two seams through which a decryption failure
// reaches the app-wide policy. The policy itself is unit-tested in
// storage/__tests__/decryption-failure-policy.test.ts; these tests assert only
// the WIRING, so the module is stubbed rather than exercised (which also keeps
// the real one's auth-store import out of this file's mock graph).
const mockRegisterDecryptionFailurePolicy = vi.fn();
const mockUnregisterDecryptionFailurePolicy = vi.fn();
const mockHandleDecryptionFailure = vi.fn().mockReturnValue(false);
const mockClassifyDecryptionFailure = vi.fn<(error: unknown) => string | null>(() => null);
vi.mock('~/shared/lib/storage/decryption-failure-policy', () => ({
  registerDecryptionFailurePolicy: () => {
    mockRegisterDecryptionFailurePolicy();
    return mockUnregisterDecryptionFailurePolicy;
  },
  handleDecryptionFailure: (error: unknown) => mockHandleDecryptionFailure(error),
  classifyDecryptionFailure: (error: unknown) => mockClassifyDecryptionFailure(error),
}));

// TOAST-CONTAINER (toast-notifications-parity): recording stub so the test can assert
// root.tsx mounts exactly one <ToastContainer> with the Angular-equivalent config, without
// pulling in the real react-toastify runtime.
const containerProps = vi.fn();
vi.mock('react-toastify', () => ({
  ToastContainer: (props: Record<string, unknown>) => {
    containerProps(props);
    return null;
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

import App, { ErrorBoundary, Layout } from '../root';

function mockRouteError(status: number, statusText = '') {
  return { status, statusText, internal: false, data: null };
}

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

// TOAST-CONTAINER (toast-notifications-parity): mirrors Angular's `ToastrModule.forRoot({
// closeButton: true, timeOut: 1000, positionClass: 'toast-top-right' })` (app.module.ts:50-55).
describe('Layout — mounts a single global <ToastContainer> (Angular ToastrModule.forRoot parity)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts exactly one ToastContainer configured top-right, 1000ms autoClose, close button enabled', () => {
    render(
      <MemoryRouter>
        <Layout>{null}</Layout>
      </MemoryRouter>,
    );

    expect(containerProps).toHaveBeenCalledTimes(1);
    expect(containerProps).toHaveBeenCalledWith(
      expect.objectContaining({ position: 'top-right', autoClose: 1000, closeButton: true }),
    );
  });
});

// design D5: one app-wide response to a decryption failure, installed once at
// the root, instead of a guard at each of the ~20 authenticated routes that
// read entity storage.
describe('App (root) — installs the app-wide decryption-failure policy (design D5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleDecryptionFailure.mockReturnValue(false);
    useLoadingStore.setState({ count: 0, isLoading: false });
  });

  it('registers the policy once on mount', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(mockRegisterDecryptionFailurePolicy).toHaveBeenCalledTimes(1);
    expect(mockUnregisterDecryptionFailurePolicy).not.toHaveBeenCalled();
  });

  it('tears the listener down on unmount, so a remount does not stack two of them', () => {
    const { unmount } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    unmount();

    expect(mockUnregisterDecryptionFailurePolicy).toHaveBeenCalledTimes(1);
  });
});

// The second seam: a decryption failure that THROWS during render or in a
// loader never becomes an unhandled rejection — react-router routes it here.
describe('ErrorBoundary — routes a decryption failure to the same policy (design D5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleDecryptionFailure.mockReturnValue(false);
    mockClassifyDecryptionFailure.mockReturnValue(null);
    mockWillLogoutRedirect.mockReturnValue(true);
  });

  it('hands the error to the policy and renders nothing once the policy owns it', () => {
    mockClassifyDecryptionFailure.mockReturnValue('missing-key');
    mockHandleDecryptionFailure.mockReturnValue(true);
    const error = new Error('no data key');

    const { container } = render(<ErrorBoundary error={error} params={{}} />);

    expect(mockHandleDecryptionFailure).toHaveBeenCalledWith(error);
    // The policy already showed its own blocking message and signed the user
    // out; rendering the generic error page under it would say two different
    // things about one failure.
    expect(container).toBeEmptyDOMElement();
  });

  it('does not touch the policy during render — the side effects run in an effect', () => {
    mockClassifyDecryptionFailure.mockReturnValue('missing-key');
    mockHandleDecryptionFailure.mockReturnValue(true);

    // `renderHook`-free way to observe render vs effect ordering: React runs
    // effects only on commit, so a render that never commits calls nothing.
    // `handleDecryptionFailure` fires a SweetAlert, a zustand set() and a
    // navigate(); doing that mid-render made React warn about updating one
    // component while rendering another.
    expect(mockHandleDecryptionFailure).not.toHaveBeenCalled();

    render(<ErrorBoundary error={new Error('no data key')} params={{}} />);

    expect(mockHandleDecryptionFailure).toHaveBeenCalledTimes(1);
  });

  it('renders the generic error page unchanged when the policy declines the error', () => {
    mockClassifyDecryptionFailure.mockReturnValue(null);

    render(<ErrorBoundary error={mockRouteError(404)} params={{}} />);

    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
    expect(mockHandleDecryptionFailure).not.toHaveBeenCalled();
  });

  it('shows the generic page instead of a blank one when no redirect will follow', () => {
    // Cold boot: App()'s effect has not registered the router navigate yet, so
    // logout() moves the user nowhere. Hiding the UI here would strand them.
    mockClassifyDecryptionFailure.mockReturnValue('missing-key');
    mockHandleDecryptionFailure.mockReturnValue(true);
    mockWillLogoutRedirect.mockReturnValue(false);

    const { container } = render(<ErrorBoundary error={new Error('no key')} params={{}} />);

    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByRole('heading', { name: 'Error' })).toBeInTheDocument();
  });
});

describe('ErrorBoundary — view-text-parity: Spanish copy (Angular parity, no i18n context available)', () => {
  it('renders heading "404" and GENERAL.RESPONSE.ERROR404_MESSAGE details for a 404 route error', () => {
    render(<ErrorBoundary error={mockRouteError(404)} params={{}} />);

    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Puede que necesite estar conectado a Internet para hacer esta operación. Por favor, vuelva a intentarlo y si persiste el error contacte al equipo de soporte técnico.'
      )
    ).toBeInTheDocument();
  });

  it('renders heading "Error" and GENERAL.RESPONSE.ERROR500_MESSAGE details for a non-404 route error', () => {
    render(<ErrorBoundary error={mockRouteError(500, 'Internal Server Error')} params={{}} />);

    expect(screen.getByRole('heading', { name: 'Error' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Por favor, vuelva a intentarlo y si persiste el error contacte al equipo de soporte técnico.'
      )
    ).toBeInTheDocument();
  });
});
