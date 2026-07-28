import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

const mockUser = vi.hoisted(() => ({
  id: 'u1',
  fullName: 'Juan Pérez',
  email: 'juan@test.com',
  cellPhone: '+54911',
  isActive: true,
  password: '',
  login: 'juan@test.com',
  authToken: 'tok',
  refreshToken: 'ref',
  expiresIn: Date.now() + 35 * 24 * 60 * 60 * 1000,
  roles: [],
  featureIds: [70],
  storeModuleIds: [],
  isSuperAdmin: true,
  isOwnerAdmin: false,
  isReSeller: false,
  selectedStoreId: 's1',
  paymentDueDate: null as string | null,
  isInTrial: false,
  paymentStatus: 'NoAplica' as string,
}));

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: mockUser, isAuthenticated: true, logout: vi.fn() };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
    user: mockUser,
    isAuthenticated: true,
    logout: vi.fn(),
  });
  return { useAuthStore };
});

import { AppLayout } from '../app-layout';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

function renderLayout() {
  const router = createMemoryRouter(
    [{ path: '/', element: <AppLayout />, children: [{ index: true, element: <div>content</div> }] }],
    { initialEntries: ['/'] },
  );
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <RouterProvider router={router} />
    </IntlProvider>,
  );
}

describe('AppLayout — sidebar default state (user preference: collapsed by default)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
  });

  it('sidebar is collapsed by default even at desktop width', () => {
    renderLayout();
    const sidebar = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(sidebar.className).toContain('w-0');
  });

  it('does not force-open the sidebar on resize to desktop width', () => {
    renderLayout();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1920 });
    window.dispatchEvent(new Event('resize'));
    const sidebar = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(sidebar.className).toContain('w-0');
  });
});

describe('AppLayout — sidebar overlays content instead of pushing it', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
  });

  it('opening the sidebar via the header toggle does not shrink the main content column', () => {
    renderLayout();

    const mainBefore = screen.getByRole('main');
    const widthClassesBefore = mainBefore.className;

    fireEvent.click(screen.getByRole('button', { name: 'Alternar barra lateral' }));

    const mainAfter = screen.getByRole('main');
    expect(mainAfter.className).toBe(widthClassesBefore);
  });

  it('clicking the sidebar backdrop closes the sidebar (in-app-layout wiring)', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Alternar barra lateral' }));
    const sidebar = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(sidebar.className).toContain('w-64');

    fireEvent.click(screen.getByTestId('sidebar-backdrop'));

    const sidebarAfterClose = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(sidebarAfterClose.className).toContain('w-0');
  });

  it('clicking the in-sidebar collapse button closes the sidebar (in-app-layout wiring)', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Alternar barra lateral' }));
    expect(screen.getByRole('navigation', { name: 'Navegación principal' }).className).toContain('w-64');

    fireEvent.click(screen.getByRole('button', { name: 'Contraer barra lateral' }));

    expect(screen.getByRole('navigation', { name: 'Navegación principal' }).className).toContain('w-0');
  });
});

// The PWA "Instalar App" button moved to app/root.tsx (Angular app.component
// parity: it must render on every route, not just authenticated ones). Guard
// against a regression that would double-mount it here too.
describe('AppLayout — does not render its own PWA install button (moved to root, avoids double-mount)', () => {
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
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
    setServiceWorkerSupported(true);
    setStandalone(false);
  });

  afterEach(() => {
    setServiceWorkerSupported(false);
  });

  it('does not render the "Instalar App" button even when installable', () => {
    renderLayout();
    expect(screen.queryByRole('button', { name: /instalar app/i })).not.toBeInTheDocument();
  });
});

// Angular mirrors pc-common.scss .pc-container .coded-content: mobile (<768px) 8px sides/16px top,
// desktop (>=768px) 48px sides/24px top, and NO bottom padding at either breakpoint. The vertical
// padding is therefore top-only (pt-*), not py-*.
describe('AppLayout — <main> responsive padding (Angular 3-breakpoint parity)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
  });

  it('applies top-only vertical padding (px-2 pt-4 md:px-12 md:pt-6) mirroring Angular .coded-content', () => {
    renderLayout();
    const main = screen.getByRole('main');
    expect(main.className).toContain('px-2 pt-4 md:px-12 md:pt-6');
  });
});

// DG-10: PaymentBanner mounts between <Navbar/> and <Breadcrumbs/>.
describe('AppLayout — mounts PaymentBanner (DG-10)', () => {
  afterEach(() => {
    mockUser.paymentStatus = 'NoAplica';
    mockUser.isInTrial = false;
    mockUser.paymentDueDate = null;
  });

  it('does not render a billing notice when paymentStatus is NoAplica', () => {
    renderLayout();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the overdue billing notice when paymentStatus is Vencido', () => {
    mockUser.paymentStatus = 'Vencido';
    renderLayout();
    expect(screen.getByRole('status')).toHaveTextContent('El pago del plan está vencido.');
  });
});

// auth-session spec: "Idle lock scoped strictly to offline sessions" (design D5).
// Reuses the existing mock shape (selector-callable + getState) rather than
// mutating it — a second mock state variant is swapped in via
// `mockImplementation` for just this describe block, and restored afterward.
describe('AppLayout — useOfflineIdleLock (D5, offline sessions only)', () => {
  type MockSelectorFn = (selector?: (s: unknown) => unknown) => unknown;
  const mockedUseAuthStore = useAuthStore as unknown as {
    mockImplementation: (fn: MockSelectorFn) => void;
    getMockImplementation: () => MockSelectorFn | undefined;
    getState: () => unknown;
  };

  const logoutMock = vi.fn();
  const defaultImpl = mockedUseAuthStore.getMockImplementation();

  function setAuthToken(authToken: string) {
    const state = { user: { ...mockUser, authToken }, isAuthenticated: true, logout: logoutMock };
    mockedUseAuthStore.mockImplementation((selector?: (s: unknown) => unknown) => {
      if (typeof selector === 'function') return selector(state);
      return state;
    });
    mockedUseAuthStore.getState = () => state;
  }

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
    logoutMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (defaultImpl) {
      mockedUseAuthStore.mockImplementation(defaultImpl);
    }
    mockedUseAuthStore.getState = () => ({
      user: mockUser,
      isAuthenticated: true,
      logout: vi.fn(),
    });
  });

  it('arms the idle timer for an offline session and invokes logout() after 1 hour of inactivity', () => {
    setAuthToken('offline-session');
    renderLayout();

    vi.advanceTimersByTime(3_600_000);

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('never arms a timer for an online session (authToken !== "offline-session")', () => {
    setAuthToken('tok');
    renderLayout();

    vi.advanceTimersByTime(3_600_000 * 2);

    expect(logoutMock).not.toHaveBeenCalled();
  });
});
