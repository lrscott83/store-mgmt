import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import type { UserModel } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Sidebar } from '../sidebar';

function makeStoreUser(featureIds: number[], storeId = 's1'): UserModel {
  return {
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
  };
}

function renderSidebar(user: UserModel) {
  vi.mocked(useAuthStore).mockReturnValue({ user } as ReturnType<typeof useAuthStore>);

  render(
    <IntlProvider locale="es" messages={esMessages}>
      <MemoryRouter>
        <Sidebar isOpen onClose={() => {}} />
      </MemoryRouter>
    </IntlProvider>,
  );
}

describe('Sidebar — Módulo Elaboración (features 120 + 121)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the ELABORACIÓN group with Recetas and Elaboraciones for a user with both features', () => {
    renderSidebar(makeStoreUser([EFeatures.Recipes, EFeatures.Elaborations]));

    expect(screen.getByText('ELABORACIÓN')).toBeInTheDocument();
    expect(screen.getByText('Recetas')).toBeInTheDocument();
    expect(screen.getByText('Elaboraciones')).toBeInTheDocument();

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/inventory/recipes');
    expect(hrefs).toContain('/inventory/elaborations');
  });

  it('shows only Recetas when the user has just the Recipes feature', () => {
    renderSidebar(makeStoreUser([EFeatures.Recipes]));

    expect(screen.getByText('Recetas')).toBeInTheDocument();
    expect(screen.queryByText('Elaboraciones')).not.toBeInTheDocument();
  });

  it('shows only Elaboraciones when the user has just the Elaborations feature', () => {
    renderSidebar(makeStoreUser([EFeatures.Elaborations]));

    expect(screen.getByText('Elaboraciones')).toBeInTheDocument();
    expect(screen.queryByText('Recetas')).not.toBeInTheDocument();
  });

  it('hides the ELABORACIÓN group entirely without the recipes/elaborations features', () => {
    renderSidebar(makeStoreUser([EFeatures.Products]));

    expect(screen.queryByText('ELABORACIÓN')).not.toBeInTheDocument();
    expect(screen.queryByText('Recetas')).not.toBeInTheDocument();
    expect(screen.queryByText('Elaboraciones')).not.toBeInTheDocument();
  });
});
