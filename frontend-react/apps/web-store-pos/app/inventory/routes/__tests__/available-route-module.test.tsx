// Reproduction for the /inventory/available blank-page bug: the route module
// `app/inventory/routes/available.tsx` lost its `export default` in commit f9d4f0fa.
// React Router v7 framework mode mounts the route's `default` (or `Component`) export;
// with neither, the matched leaf renders nothing → empty page. These two tests pin the
// route-module contract and the actual render path a router would take.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import * as availableRoute from '../available';

// ─── Global mocks (mirrors the established pattern in this __tests__ folder) ──

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = {
    user: {
      selectedStoreId: 's1',
      storeModuleIds: [] as number[],
      isOwnerAdmin: true,
      storeList: [],
    },
    isAuthenticated: true,
  };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getInventoryCategoriesView: vi.fn().mockReturnValue({
      data: [],
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    }),
  })),
}));

vi.mock('~/sales/lib/repositories/product-repository', () => ({
  ProductRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('~/sales/lib/repositories/product-category-repository', () => ({
  ProductCategoryRepository: vi.fn().mockImplementation(() => ({})),
}));

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

describe('available route module — React Router default-export contract', () => {
  it('exports a default component and a clientLoader', () => {
    // React Router v7 framework mode needs a default (or Component) export; without it
    // the matched leaf renders a null <Outlet/> → empty page.
    expect(availableRoute.default).toBeTypeOf('function');
    expect(availableRoute.clientLoader).toBeTypeOf('function');
  });

  it('renders the view title when mounted through the default export', () => {
    const RouteComponent = availableRoute.default as ComponentType;
    expect(RouteComponent).toBeTypeOf('function');

    render(
      <Wrapper>
        <RouteComponent />
      </Wrapper>,
    );

    // INVENTORY.AVAILABLE.TITLE = 'Inventario'.
    expect(screen.getByText(/Inventario/i)).toBeInTheDocument();
  });
});
