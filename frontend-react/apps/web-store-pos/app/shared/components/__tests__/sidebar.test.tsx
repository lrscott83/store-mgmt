import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import type { UserModel } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';

// Mock useAuthStore
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

// Import the mock so we can configure it per test
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Sidebar } from '../sidebar';

const makeSuperAdmin = (): UserModel => ({
  id: 'u1',
  login: 'admin@test.com',
  fullName: 'Super Admin',
  cellPhone: '+1',
  email: 'admin@test.com',
  isActive: true,
  password: '',
  authToken: 'tok',
  refreshToken: 'ref',
  expiresIn: Date.now() + 1000000,
  roles: [],
  featureIds: [],
  storeModuleIds: [],
  isSuperAdmin: true,
  isOwnerAdmin: false,
  isReSeller: false,
  selectedStoreId: 's1',
});

const makeStoreUser = (featureIds: number[], storeId = 's1'): UserModel => ({
  id: 'u2',
  login: 'storeuser@test.com',
  fullName: 'Store User',
  cellPhone: '+1',
  email: 'storeuser@test.com',
  isActive: true,
  password: '',
  authToken: 'tok',
  refreshToken: 'ref',
  expiresIn: Date.now() + 1000000,
  roles: [{ storeId, storeName: 'Store 1', moduleId: 2, featureIds }],
  featureIds: [],
  storeModuleIds: [],
  isSuperAdmin: false,
  isOwnerAdmin: false,
  isReSeller: false,
  selectedStoreId: storeId,
});

function renderSidebar(user: UserModel, isOpen = true) {
  const onToggle = vi.fn();
  vi.mocked(useAuthStore).mockReturnValue({ user } as ReturnType<typeof useAuthStore>);

  render(
    <IntlProvider locale="es" messages={esMessages}>
      <MemoryRouter>
        <Sidebar isOpen={isOpen} onToggle={onToggle} />
      </MemoryRouter>
    </IntlProvider>
  );
  return { onToggle };
}

describe('Sidebar — SHELL-02 permission-filtered menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('SuperAdmin sees all menu items', () => {
    renderSidebar(makeSuperAdmin());

    // SuperAdmin should see items from all groups
    // Sale is feature 21, Sale menu item should be visible
    expect(screen.getAllByRole('link').length).toBeGreaterThan(5);
  });

  it('StoreUser sees only items for permitted featureIds — SHELL-02 scenario', () => {
    // StoreUser with only Sale (21) and Products (20) features
    const user = makeStoreUser([EFeatures.Sale, EFeatures.Products], 's1');
    renderSidebar(user);

    const links = screen.getAllByRole('link');
    // Should have at least Sale and Products links
    expect(links.length).toBeGreaterThan(0);
    // Should NOT see admin items (featureId 16, 15, etc.)
    const linkTexts = links.map((l) => l.textContent ?? '');
    expect(linkTexts.some((t) => t.includes('Panel de Admin') || t.includes('Tiendas (Admin)'))).toBe(false);
  });

  it('StoreUser with Sale feature sees Sale link', () => {
    const user = makeStoreUser([EFeatures.Sale], 's1');
    renderSidebar(user);

    // The Sale link key is MENU.SALE rendered as 'Venta'
    expect(screen.getByText('Venta')).toBeInTheDocument();
  });

  it('StoreUser without Sale feature does NOT see Sale link', () => {
    const user = makeStoreUser([EFeatures.Products], 's1');
    renderSidebar(user);

    // Sale (MENU.SALE -> 'Venta') should not appear
    expect(screen.queryByText('Venta')).not.toBeInTheDocument();
  });

  it('SuperAdmin sees Sale and Admin items', () => {
    renderSidebar(makeSuperAdmin());

    expect(screen.getByText('Venta')).toBeInTheDocument();
    expect(screen.getByText('Panel de Admin')).toBeInTheDocument();
  });

  it('renders nothing for user with no features', () => {
    const user = makeStoreUser([], 's1');
    renderSidebar(user);

    // No feature-gated links should appear
    const links = screen.queryAllByRole('link');
    expect(links.length).toBe(0);
  });

  it('toggle button calls onToggle', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderSidebar(makeSuperAdmin(), true);

    const toggleBtn = screen.getByRole('button', { name: /toggle sidebar/i });
    await user.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders closed sidebar when isOpen is false', () => {
    renderSidebar(makeSuperAdmin(), false);

    // When closed, sidebar has collapsed class
    const sidebar = screen.getByRole('navigation');
    expect(sidebar.className).toContain('w-16');
  });

  it('renders open sidebar when isOpen is true', () => {
    renderSidebar(makeSuperAdmin(), true);

    const sidebar = screen.getByRole('navigation');
    expect(sidebar.className).toContain('w-64');
  });
});
