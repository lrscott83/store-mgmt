import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

// ─── Auth store mock ──────────────────────────────────────────────────────────

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = {
    user: {
      selectedStoreId: 'store-s1',
      isSuperAdmin: true,
      isOwnerAdmin: false,
      isReSeller: false,
      id: 'u1',
      login: 'user@test.com',
      fullName: 'Test User',
      cellPhone: '+1',
      email: 'user@test.com',
      isActive: true,
      password: '',
      authToken: 'tok',
      refreshToken: 'ref',
      expiresIn: Date.now() + 1_000_000,
      roles: [],
      featureIds: [],
      storeModuleIds: [],
    },
    isAuthenticated: true,
    logout: () => {},
  };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  (useAuthStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useAuthStore };
});

// ─── Service mocks ────────────────────────────────────────────────────────────

vi.mock('~/sales/lib/services/product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
    save: vi.fn(),
  })),
}));

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('~/inventory/lib/repositories/inventory-repository', () => ({
  InventoryRepository: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue(new Map()),
    save: vi.fn(),
  })),
}));

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
  })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ─── Export loader (T-6.1) ────────────────────────────────────────────────────

describe('Export route loader — S-ROUTE-1', () => {
  it('loader is exported from export.tsx', async () => {
    const mod = await import('../export');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('loader redirects to /login when user lacks EFeatures.Send (40)', async () => {
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    const restrictedState = {
      user: {
        selectedStoreId: 'store-s1',
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        id: 'u2',
        login: 'user@test.com',
        fullName: 'Test User',
        cellPhone: '+1',
        email: 'user@test.com',
        isActive: true,
        password: '',
        authToken: 'tok',
        refreshToken: 'ref',
        expiresIn: Date.now() + 1_000_000,
        roles: [{ storeId: 'store-s1', storeName: 'S1', moduleId: 1, featureIds: [99] }],
        featureIds: [],
        storeModuleIds: [],
      },
      isAuthenticated: true,
      logout: () => {},
    };
    (
      useAuthStore as unknown as { getState: () => typeof restrictedState }
    ).getState = () => restrictedState;

    const { clientLoader } = await import('../export');
    const result = await clientLoader({ params: { storeId: 'store-s1' } } as never);
    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.headers.get('Location')).toBe('/login');
  });
});

// ─── Import loader (T-6.2) ────────────────────────────────────────────────────

describe('Import route loader — S-ROUTE-2', () => {
  it('loader is exported from import.tsx', async () => {
    const mod = await import('../import');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('loader redirects to /login when user lacks EFeatures.Receive (42)', async () => {
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    const restrictedState = {
      user: {
        selectedStoreId: 'store-s1',
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        id: 'u2',
        login: 'user@test.com',
        fullName: 'Test User',
        cellPhone: '+1',
        email: 'user@test.com',
        isActive: true,
        password: '',
        authToken: 'tok',
        refreshToken: 'ref',
        expiresIn: Date.now() + 1_000_000,
        roles: [{ storeId: 'store-s1', storeName: 'S1', moduleId: 1, featureIds: [99] }],
        featureIds: [],
        storeModuleIds: [],
      },
      isAuthenticated: true,
      logout: () => {},
    };
    (
      useAuthStore as unknown as { getState: () => typeof restrictedState }
    ).getState = () => restrictedState;

    const { clientLoader } = await import('../import');
    const result = await clientLoader({ params: { storeId: 'store-s1' } } as never);
    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.headers.get('Location')).toBe('/login');
  });
});

// ─── ExportPage render (T-6.3) ───────────────────────────────────────────────

describe('ExportPage — smoke render', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders export title', async () => {
    const { default: ExportPage } = await import('../export');
    render(
      <Wrapper>
        <ExportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Exportar datos/i)).toBeInTheDocument();
  });

  it('renders default export', async () => {
    const mod = await import('../export');
    expect(typeof mod.default).toBe('function');
  });
});

// ─── ImportPage render (T-6.4) ───────────────────────────────────────────────

describe('ImportPage — smoke render', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders import title', async () => {
    const { default: ImportPage } = await import('../import');
    render(
      <Wrapper>
        <ImportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Importar datos/i)).toBeInTheDocument();
  });

  it('renders default export', async () => {
    const mod = await import('../import');
    expect(typeof mod.default).toBe('function');
  });
});
