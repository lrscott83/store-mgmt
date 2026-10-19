import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import type { UserModel } from '@store-mgmt/domain';
import { Currency } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { toLocalDayKey } from '~/shared/lib/date-utils';
import { CashClosingOfflineService } from '~/sales/lib/cash-closing/cash-closing-offline-service';
import { CashClosingPage } from '../cash-closing';

const STORE = 'store-cash';
const DAY = toLocalDayKey(new Date());

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'cashier',
    fullName: 'Test User',
    cellPhone: '',
    email: 'cashier@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1_000_000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: STORE,
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <CashClosingPage />
    </IntlProvider>,
  );
}

function seedDraft(openingCash: number, count: number): void {
  new CashClosingOfflineService(STORE).saveDraft(
    {
      dayKey: DAY,
      currency: Currency.CUP,
      openingCash,
      denominations: [{ value: 1_000, count }],
      comment: '',
    },
    'cashier',
  );
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  useAuthStore.setState({ user: makeUser(), isAuthenticated: true, isLoading: false, error: null });
});

describe('CashClosingPage', () => {
  it('muestra el header "Cierre Efectivo", el resumen, la Apertura y el Conteo', () => {
    renderPage();

    expect(screen.getByText('Cierre Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Esperado')).toBeInTheDocument();
    expect(screen.getByText('Contado')).toBeInTheDocument();
    expect(screen.getByText('Diferencia')).toBeInTheDocument();
    expect(screen.getByLabelText('Apertura')).toBeInTheDocument();
    expect(screen.getByText('Conteo')).toBeInTheDocument();
    // Denominaciones por defecto (S11), de mayor a menor.
    expect(screen.getByTestId('denomination-row-20000')).toBeInTheDocument();
    expect(screen.getByTestId('denomination-row-2000')).toBeInTheDocument();
    expect(screen.getByTestId('denomination-row-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar Caja' })).toBeInTheDocument();
  });

  it('pinta la Diferencia negativa en rojo con signo -, y positiva en verde', () => {
    // Contado 1 000, Esperado 5 000 → diferencia -4 000.
    seedDraft(5_000, 1);
    const { unmount } = renderPage();

    const negative = screen.getByTestId('cash-closing-difference');
    expect(negative).toHaveClass('text-danger');
    expect(negative.textContent).toContain('-');
    unmount();

    // Contado 1 000, Esperado 0 → diferencia +1 000.
    localStorage.clear();
    seedDraft(0, 1);
    renderPage();
    const positive = screen.getByTestId('cash-closing-difference');
    expect(positive).toHaveClass('text-success');
  });

  it('cierra la caja solo cuando la diferencia no es cero y el comentario está lleno', () => {
    seedDraft(5_000, 1); // no cuadra
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Caja' }));

    const confirm = screen.getByTestId('cash-closing-confirm-button');
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByTestId('cash-closing-comment'), {
      target: { value: 'faltan 4 000' },
    });
    expect(confirm).not.toBeDisabled();

    fireEvent.click(confirm);
    expect(screen.getByTestId('cash-closing-status')).toHaveTextContent('Cerrada');
  });
});
