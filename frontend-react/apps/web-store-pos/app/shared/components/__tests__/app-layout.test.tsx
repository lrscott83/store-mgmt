import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

vi.mock('~/shared/lib/stores/auth-store', () => {
  const mockUser = {
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
  };
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
    const sidebar = screen.getByRole('navigation', { name: /main navigation/i });
    expect(sidebar.className).toContain('w-0');
  });

  it('does not force-open the sidebar on resize to desktop width', () => {
    renderLayout();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1920 });
    window.dispatchEvent(new Event('resize'));
    const sidebar = screen.getByRole('navigation', { name: /main navigation/i });
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

    fireEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));

    const mainAfter = screen.getByRole('main');
    expect(mainAfter.className).toBe(widthClassesBefore);
  });

  it('clicking the sidebar backdrop closes the sidebar (in-app-layout wiring)', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));
    const sidebar = screen.getByRole('navigation', { name: /main navigation/i });
    expect(sidebar.className).toContain('w-64');

    fireEvent.click(screen.getByTestId('sidebar-backdrop'));

    const sidebarAfterClose = screen.getByRole('navigation', { name: /main navigation/i });
    expect(sidebarAfterClose.className).toContain('w-0');
  });

  it('clicking the in-sidebar collapse button closes the sidebar (in-app-layout wiring)', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));
    expect(screen.getByRole('navigation', { name: /main navigation/i }).className).toContain('w-64');

    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));

    expect(screen.getByRole('navigation', { name: /main navigation/i }).className).toContain('w-0');
  });
});
