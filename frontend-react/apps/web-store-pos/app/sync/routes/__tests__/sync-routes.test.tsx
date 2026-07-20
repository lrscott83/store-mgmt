import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
//
// NOTE: import.tsx/export.tsx no longer construct ProductCategoryOfflineService/
// ProductOfflineService for the DataSerializerService (Flag #2 re-point —
// ProductCategoryRepository/ProductRepository now, real classes backed by
// jsdom localStorage; no mock needed since these smoke tests never invoke
// handleExport/handleImport). Inventory's read side is InventoryOfflineService
// (rule 12 — InventoryRepository has no Angular correlate, deleted in WU3) —
// also unmocked, real class backed by jsdom localStorage, same reasoning.

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getStorageOrders: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => ({
    getStorageExpenses: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    getStorageSaleCredits: vi.fn().mockReturnValue([]),
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

// ─── ExportPage delivery — Angular parity (always download, never share) ─────
//
// Angular's `serializeEncryptedZip` (data-serializer.service.ts:68-73) delivers
// the encrypted zip with a PLAIN download anchor, unconditionally. It never
// calls `navigator.share` — that lives only in the separate `shareData()` path
// (send-data.component.ts:37) which shares products.json, not the backup zip.
// React's export must mirror this: always download, never share. Calling
// `navigator.share({ files })` on desktop (where `navigator.share` exists but
// file-sharing is unsupported) throws and breaks the export.

describe('ExportPage — delivery (Angular parity: always download, never share)', () => {
  const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
  const revokeObjectURLMock = vi.fn();
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
  const hadShare = 'share' in navigator;
  const shareMock = vi.fn().mockRejectedValue(new Error('file share not supported'));

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    createObjectURLMock.mockReturnValue('blob:mock-url');
    URL.createObjectURL = createObjectURLMock;
    URL.revokeObjectURL = revokeObjectURLMock;
    // Simulate a desktop browser: `navigator.share` EXISTS as a function but
    // rejects when handed files (the real desktop failure mode).
    Object.defineProperty(navigator, 'share', {
      value: shareMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    if (!hadShare) {
      delete (navigator as unknown as { share?: unknown }).share;
    }
  });

  it('downloads via an anchor and never calls navigator.share', async () => {
    const { default: ExportPage } = await import('../export');
    render(
      <Wrapper>
        <ExportPage />
      </Wrapper>,
    );

    fireEvent.change(screen.getByLabelText(/Contraseña de cifrado/i), {
      target: { value: 'my-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(shareMock).not.toHaveBeenCalled();
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
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
