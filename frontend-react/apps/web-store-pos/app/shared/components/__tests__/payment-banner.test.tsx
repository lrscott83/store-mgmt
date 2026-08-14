import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { UserModel } from '@store-mgmt/domain';

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
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
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

let mockUser: UserModel | null = null;

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: { user: UserModel | null }) => unknown) => {
    const state = { user: mockUser };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider locale="es" messages={esMessages}>
      {children}
    </IntlProvider>
  );
}

async function renderBanner() {
  const { PaymentBanner } = await import('../payment-banner');
  return render(
    <Wrapper>
      <PaymentBanner />
    </Wrapper>,
  );
}

describe('PaymentBanner — visibility matrix', () => {
  it('renders nothing when paymentStatus is NoAplica', async () => {
    mockUser = makeUser({ paymentStatus: 'NoAplica' });
    const { container } = await renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when paymentStatus is AlDia', async () => {
    mockUser = makeUser({ paymentStatus: 'AlDia' });
    const { container } = await renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the user is missing (null)', async () => {
    mockUser = null;
    const { container } = await renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when paymentStatus is missing on the user object (stale payload)', async () => {
    mockUser = makeUser();
    delete (mockUser as Partial<UserModel>).paymentStatus;
    const { container } = await renderBanner();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PaymentBanner — trial notice (PorVencer/EnGracia + isInTrial=true)', () => {
  it('shows the trial notice with the formatted due date for PorVencer', async () => {
    mockUser = makeUser({ paymentStatus: 'PorVencer', isInTrial: true, paymentDueDate: '2026-08-15' });
    await renderBanner();
    expect(
      screen.getByText('Probando el plan de pago. El primer cobro del plan pago será el 15/08/2026.'),
    ).toBeInTheDocument();
  });

  it('shows the trial notice for EnGracia (triangulation: different status, same isInTrial branch)', async () => {
    mockUser = makeUser({ paymentStatus: 'EnGracia', isInTrial: true, paymentDueDate: '2026-09-01' });
    await renderBanner();
    expect(
      screen.getByText('Probando el plan de pago. El primer cobro del plan pago será el 01/09/2026.'),
    ).toBeInTheDocument();
  });
});

describe('PaymentBanner — due notice (PorVencer/EnGracia + isInTrial=false)', () => {
  it('shows the due notice with the formatted due date for PorVencer', async () => {
    mockUser = makeUser({ paymentStatus: 'PorVencer', isInTrial: false, paymentDueDate: '2026-08-15' });
    await renderBanner();
    expect(
      screen.getByText('El pago del plan vence el 15/08/2026. Realice el pago para evitar interrupciones en el servicio.'),
    ).toBeInTheDocument();
  });

  it('shows the due notice for EnGracia (triangulation)', async () => {
    mockUser = makeUser({ paymentStatus: 'EnGracia', isInTrial: false, paymentDueDate: '2026-09-01' });
    await renderBanner();
    expect(
      screen.getByText('El pago del plan vence el 01/09/2026. Realice el pago para evitar interrupciones en el servicio.'),
    ).toBeInTheDocument();
  });
});

describe('PaymentBanner — overdue notice (Vencido outranks trial)', () => {
  it('shows the overdue notice when Vencido and isInTrial=true (overdue wins)', async () => {
    mockUser = makeUser({ paymentStatus: 'Vencido', isInTrial: true, paymentDueDate: '2026-07-01' });
    await renderBanner();
    expect(
      screen.getByText('El pago del plan está vencido. Algunas funciones pueden estar restringidas hasta regularizar la situación.'),
    ).toBeInTheDocument();
  });

  it('shows the overdue notice when Vencido and isInTrial=false', async () => {
    mockUser = makeUser({ paymentStatus: 'Vencido', isInTrial: false, paymentDueDate: '2026-07-01' });
    await renderBanner();
    expect(
      screen.getByText('El pago del plan está vencido. Algunas funciones pueden estar restringidas hasta regularizar la situación.'),
    ).toBeInTheDocument();
  });
});
