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
  paymentDueDate: null,
  isInTrial: false,
  paymentStatus: 'NoAplica',
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
  paymentDueDate: null,
  isInTrial: false,
  paymentStatus: 'NoAplica',
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

    expect(screen.getByRole('button', { name: 'Contraer barra lateral' })).toBeInTheDocument();
  });

  it('does not render the collapse button when closed', () => {
    renderSidebar(makeSuperAdmin(), false);

    expect(screen.queryByRole('button', { name: 'Contraer barra lateral' })).not.toBeInTheDocument();
  });

  it('calls onClose when the in-sidebar collapse button is clicked', () => {
    const onClose = vi.fn();
    renderSidebar(makeSuperAdmin(), true, onClose);

    fireEvent.click(screen.getByRole('button', { name: 'Contraer barra lateral' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Sidebar — nav-item click closes the sidebar (Angular closeOtherMenu parity)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onClose when a menu item is clicked', () => {
    const onClose = vi.fn();
    renderSidebar(makeSuperAdmin(), true, onClose);

    fireEvent.click(screen.getByText('Vender'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Sidebar — view-text-parity: aria-labels in Spanish (React-only, no Angular correlate)', () => {
  it('renders the nav landmark with aria-label "Navegación principal"', () => {
    renderSidebar(makeSuperAdmin(), true);
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  });

  it('renders the in-sidebar collapse button with aria-label "Contraer barra lateral"', () => {
    renderSidebar(makeSuperAdmin(), true);
    expect(screen.getByRole('button', { name: 'Contraer barra lateral' })).toBeInTheDocument();
  });
});

describe('Sidebar — sidebar-menu-parity: SALES group item set and order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SuperAdmin sees SALES group items in exact order: Products, Vender, Ventas del día, Créditos del día, Cuadre del día, Créditos, Ventas', () => {
    renderSidebar(makeSuperAdmin());

    const links = screen.getAllByRole('link');
    const linkTexts = links.map((l) => l.textContent ?? '');
    const salesOrder = [
      'Catálogo Productos',
      'Vender',
      'Ventas del día',
      'Créditos del día',
      'Cuadre del día',
      'Créditos',
      'Ventas',
    ];
    const indices = salesOrder.map((text) => linkTexts.indexOf(text));
    expect(indices.every((i) => i !== -1)).toBe(true);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it('StoreUser with CreditSale sees "Créditos del día" and "Créditos"', () => {
    const user = makeStoreUser([EFeatures.CreditSale], 's1');
    renderSidebar(user);

    expect(screen.getByText('Créditos del día')).toBeInTheDocument();
    expect(screen.getByText('Créditos')).toBeInTheDocument();
  });

  it('StoreUser without CreditSale does NOT see "Créditos del día" or "Créditos"', () => {
    const user = makeStoreUser([EFeatures.Products], 's1');
    renderSidebar(user);

    expect(screen.queryByText('Créditos del día')).not.toBeInTheDocument();
    expect(screen.queryByText('Créditos')).not.toBeInTheDocument();
  });

  it('StoreUser with SalesHistory sees "Ventas"', () => {
    const user = makeStoreUser([EFeatures.SalesHistory], 's1');
    renderSidebar(user);

    expect(screen.getByText('Ventas')).toBeInTheDocument();
  });

  it('StoreUser without SalesHistory does NOT see "Ventas"', () => {
    const user = makeStoreUser([EFeatures.Products], 's1');
    renderSidebar(user);

    expect(screen.queryByText('Ventas')).not.toBeInTheDocument();
  });
});

describe('Sidebar — sidebar-menu-parity: INVENTORY group item set and order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SuperAdmin sees INVENTORY group with "Entradas" (history) after "Salida", full 6-item order intact', () => {
    renderSidebar(makeSuperAdmin());

    const links = screen.getAllByRole('link');
    const linkTexts = links.map((l) => l.textContent ?? '');
    const inventoryOrder = [
      'Disponible',
      'Entradas del día',
      'Cantidades del día',
      'Ganancias del día',
      'Salida',
      'Entradas',
    ];
    const indices = inventoryOrder.map((text) => linkTexts.indexOf(text));
    expect(indices.every((i) => i !== -1)).toBe(true);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it('StoreUser without EntriesHistory does not see "Entradas" (history) item; other 5 INVENTORY items unaffected', () => {
    const user = makeStoreUser(
      [EFeatures.Available, EFeatures.Entries, EFeatures.InventoryTodayQuantities, EFeatures.InventoryTodaySaleProfit, EFeatures.Egress],
      's1'
    );
    renderSidebar(user);

    expect(screen.getByText('Disponible')).toBeInTheDocument();
    expect(screen.getByText('Entradas del día')).toBeInTheDocument();
    expect(screen.getByText('Cantidades del día')).toBeInTheDocument();
    expect(screen.getByText('Ganancias del día')).toBeInTheDocument();
    expect(screen.getByText('Salida')).toBeInTheDocument();
    expect(screen.queryByText('Entradas')).not.toBeInTheDocument();
  });
});

describe('Sidebar — sidebar-menu-parity: no Profile group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render the Profile group or its items for SuperAdmin', () => {
    renderSidebar(makeSuperAdmin());

    expect(screen.queryByText('Editar Perfil')).not.toBeInTheDocument();
    expect(screen.queryByText('Cambiar Contraseña')).not.toBeInTheDocument();
    const links = screen.getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).not.toContain('/profile/edit');
    expect(hrefs).not.toContain('/profile/change-password');
  });
});

describe('Sidebar — billing menu entries (superadmin/reseller only, StorePayment feature)', () => {
  const makeReseller = (): UserModel => ({
    ...makeSuperAdmin(),
    login: 'reseller@test.com',
    fullName: 'Re Seller',
    isSuperAdmin: false,
    isReSeller: true,
    featureIds: [EFeatures.StorePayment],
  });

  const makeResellerWithoutFeature = (): UserModel => ({
    ...makeSuperAdmin(),
    login: 'reseller2@test.com',
    fullName: 'Re Seller 2',
    isSuperAdmin: false,
    isReSeller: true,
    featureIds: [],
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SuperAdmin sees "Cobros pendientes" and "Comisiones" in the MANAGEMENT group', () => {
    renderSidebar(makeSuperAdmin());

    expect(screen.getByText('Cobros pendientes')).toBeInTheDocument();
    expect(screen.getByText('Comisiones')).toBeInTheDocument();

    const hrefs = screen
      .getAllByRole('link')
      .map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/management/stores/collections');
    expect(hrefs).toContain('/management/stores/commissions');
  });

  it('ReSeller with the StorePayment feature sees both billing entries', () => {
    renderSidebar(makeReseller());

    expect(screen.getByText('Cobros pendientes')).toBeInTheDocument();
    expect(screen.getByText('Comisiones')).toBeInTheDocument();
  });

  it('ReSeller WITHOUT the StorePayment feature does not see billing entries', () => {
    renderSidebar(makeResellerWithoutFeature());

    expect(screen.queryByText('Cobros pendientes')).not.toBeInTheDocument();
    expect(screen.queryByText('Comisiones')).not.toBeInTheDocument();
  });

  it('StoreUser (even with StorePayment featureId in their store roles) does not see billing entries — route guard denies non-reseller roles', () => {
    const user = makeStoreUser([EFeatures.StorePayment], 's1');
    renderSidebar(user);

    expect(screen.queryByText('Cobros pendientes')).not.toBeInTheDocument();
    expect(screen.queryByText('Comisiones')).not.toBeInTheDocument();
  });

  it('billing entries point to the gated routes', () => {
    renderSidebar(makeSuperAdmin());

    const links = screen.getAllByRole('link');
    const collections = links.find((l) => l.textContent === 'Cobros pendientes');
    const commissions = links.find((l) => l.textContent === 'Comisiones');
    expect(collections).not.toBeUndefined();
    expect(collections?.getAttribute('href')).toBe('/management/stores/collections');
    expect(commissions).not.toBeUndefined();
    expect(commissions?.getAttribute('href')).toBe('/management/stores/commissions');
  });
});

describe('Sidebar — NEW badge on recently added menu items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a NEW badge on the Almacenes item', () => {
    renderSidebar(makeSuperAdmin());

    expect(screen.getByTestId('menu-new-badge-/inventory/warehouses')).toHaveTextContent('NEW');
  });

  it('renders a NEW badge on the Vender Mayorista item', () => {
    renderSidebar(makeSuperAdmin());

    expect(screen.getByTestId('menu-new-badge-/sales/wholesale')).toHaveTextContent('NEW');
  });

  it('does NOT render NEW badges on regular items', () => {
    renderSidebar(makeSuperAdmin());

    expect(screen.queryByTestId('menu-new-badge-/sales/new')).not.toBeInTheDocument();
    expect(screen.queryByTestId('menu-new-badge-/sales/products')).not.toBeInTheDocument();
    expect(screen.queryByTestId('menu-new-badge-/management/users')).not.toBeInTheDocument();
  });

  it('NEW badge uses a color that stands out (red accent)', () => {
    renderSidebar(makeSuperAdmin());

    const badge = screen.getByTestId('menu-new-badge-/inventory/warehouses');
    expect(badge.className).toMatch(/bg-danger|bg-red/);
  });
});

describe('Sidebar — no emoji icons on menu items (plain text labels only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT render an emoji icon on the Almacenes item', () => {
    renderSidebar(makeSuperAdmin());

    const warehousesLink = screen.getByText('Almacenes').closest('a');
    expect(warehousesLink).not.toBeNull();
    // The label span must contain only the text + optional NEW badge — no emoji
    expect(warehousesLink?.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('does NOT render any emoji icon on any visible menu item', () => {
    renderSidebar(makeSuperAdmin());

    const links = screen.getAllByRole('link');
    const withEmoji = links.filter((l) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(l.textContent ?? ''));
    expect(withEmoji).toHaveLength(0);
  });

  it('still renders the help "?" button on items with helpContent', () => {
    renderSidebar(makeSuperAdmin());

    // Removing icons must not remove the help affordance
    expect(screen.getAllByRole('button', { name: 'Ayuda' }).length).toBeGreaterThan(0);
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
