import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

function renderSidebar(user: UserModel, isOpen = true, onClose = () => {}) {
  vi.mocked(useAuthStore).mockReturnValue({ user } as ReturnType<typeof useAuthStore>);

  render(
    <IntlProvider locale="es" messages={esMessages}>
      <MemoryRouter>
        <Sidebar isOpen={isOpen} onClose={onClose} />
      </MemoryRouter>
    </IntlProvider>
  );
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
    // Angular exact strings: MENU.ADMIN.DASHBOARD = 'Dashboard', MENU.ADMIN.STORES = 'Tiendas'
    expect(linkTexts.some((t) => t.includes('Dashboard'))).toBe(false);
  });

  it('StoreUser with Sale feature sees Sale link', () => {
    const user = makeStoreUser([EFeatures.Sale], 's1');
    renderSidebar(user);

    // The Sale link key is MENU.SALE rendered as Angular's exact 'Vender' (MENU.SALE_MGMT.SALE)
    expect(screen.getByText('Vender')).toBeInTheDocument();
  });

  it('StoreUser without Sale feature does NOT see Sale link', () => {
    const user = makeStoreUser([EFeatures.Products], 's1');
    renderSidebar(user);

    // Sale (MENU.SALE -> 'Vender') should not appear
    expect(screen.queryByText('Vender')).not.toBeInTheDocument();
  });

  it('SuperAdmin sees Sale and Admin items', () => {
    renderSidebar(makeSuperAdmin());

    expect(screen.getByText('Vender')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders nothing for user with no features', () => {
    const user = makeStoreUser([], 's1');
    renderSidebar(user);

    // No feature-gated links should appear
    const links = screen.queryAllByRole('link');
    expect(links.length).toBe(0);
  });

  it('renders closed sidebar when isOpen is false — zero width, no blank column (Angular navbar-collapsed: width 0)', () => {
    renderSidebar(makeSuperAdmin(), false);

    // When closed, sidebar collapses to zero width so it fully disappears
    const sidebar = screen.getByRole('navigation');
    expect(sidebar.className).toContain('w-0');
    expect(sidebar.className).not.toContain('w-16');
  });

  it('renders open sidebar when isOpen is true', () => {
    renderSidebar(makeSuperAdmin(), true);

    const sidebar = screen.getByRole('navigation');
    expect(sidebar.className).toContain('w-64');
  });
});

describe('Sidebar — SHELL-03: overlays content instead of pushing it (fixed/absolute positioning)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('open sidebar has fixed/absolute overlay positioning classes', () => {
    renderSidebar(makeSuperAdmin(), true);

    const sidebar = screen.getByRole('navigation');
    expect(sidebar.className).toMatch(/\b(fixed|absolute)\b/);
    expect(sidebar.className).toContain('inset-y-0');
    expect(sidebar.className).toContain('left-0');
  });

  it('open sidebar has a high z-index so it renders above content', () => {
    renderSidebar(makeSuperAdmin(), true);

    const sidebar = screen.getByRole('navigation');
    expect(sidebar.className).toMatch(/\bz-(40|50)\b/);
  });

  it('open sidebar spans full viewport height', () => {
    renderSidebar(makeSuperAdmin(), true);

    const sidebar = screen.getByRole('navigation');
    expect(sidebar.className).toContain('h-full');
  });
});

describe('Sidebar — SHELL-04: backdrop/scrim closes the sidebar on click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a backdrop when open', () => {
    renderSidebar(makeSuperAdmin(), true);

    expect(screen.getByTestId('sidebar-backdrop')).toBeInTheDocument();
  });

  it('does not render a backdrop when closed', () => {
    renderSidebar(makeSuperAdmin(), false);

    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    renderSidebar(makeSuperAdmin(), true, onClose);

    fireEvent.click(screen.getByTestId('sidebar-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Sidebar — SHELL-05: in-sidebar collapse toggle (top-right of sidebar header)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a collapse button in the sidebar header when open', () => {
    renderSidebar(makeSuperAdmin(), true);

    expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument();
  });

  it('does not render the collapse button when closed', () => {
    renderSidebar(makeSuperAdmin(), false);

    expect(screen.queryByRole('button', { name: /collapse sidebar/i })).not.toBeInTheDocument();
  });

  it('calls onClose when the in-sidebar collapse button is clicked', () => {
    const onClose = vi.fn();
    renderSidebar(makeSuperAdmin(), true, onClose);

    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Sidebar — SHELL-06: brand logo at the top of the sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the VendeDTo brand text when open', () => {
    renderSidebar(makeSuperAdmin(), true);

    expect(screen.getByText('VendeDTo')).toBeInTheDocument();
  });

  it('applies primary color and bold weight to the brand text', () => {
    renderSidebar(makeSuperAdmin(), true);

    const brand = screen.getByText('VendeDTo');
    expect(brand.className).toContain('text-primary');
    expect(brand.className).toContain('font-bold');
  });
});
