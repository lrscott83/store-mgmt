import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { UserModel } from '@store-mgmt/domain';

// ═══════════════════════════════════════════════════════════════════════════════
// RED — these tests FAIL against the current PaymentBanner. They define the
// behaviour the "every new store starts in trial" rule requires.
//
// Why they fail — the arithmetic, not an opinion:
//   PaymentStartDate = creation date, TestingPeriodInMonths = 1, DueSoonDays = 5.
//   GetNextDueDate  = start + trialMonths + 1  = start + 2 months.
//   IsInTrial       is true while  today <= start + 1 month.
//   PorVencer       begins at      due - 5d    = start + 2 months - 5 days.
//   start + 2 months - 5 days  >  start + 1 month, so PorVencer can NEVER
//   overlap the trial window. During the whole trial the status is `AlDia`.
//
// PaymentBanner returns null for `AlDia` (payment-banner.tsx:25), so the
// `isInTrial` branch below it (payment-banner.tsx:35) is unreachable in
// production for any trialMonths >= 0. Result: a store spends its entire free
// month with no indication that it is on a trial or when the first charge lands.
//
// The existing payment-banner.test.tsx covers `PorVencer + isInTrial` — a state
// the billing math cannot produce — so the suite is green while the user-facing
// behaviour is missing. These tests close that hole.
// ═══════════════════════════════════════════════════════════════════════════════

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
  return render(<Wrapper><PaymentBanner /></Wrapper>);
}

// ─── The trial must be visible during the trial ───────────────────────────────

describe('PaymentBanner — trial is visible while the plan is AlDia (the real trial state)', () => {
  it('shows the trial notice for a freshly created store (AlDia + isInTrial)', async () => {
    // Store created 2026-08-04 → trial to 2026-09-04, first charge 2026-10-04.
    mockUser = makeUser({ paymentStatus: 'AlDia', isInTrial: true, paymentDueDate: '2026-10-04' });
    await renderBanner();
    expect(
      screen.getByText(
        'Probando el plan de pago. El primer cobro del plan pago será el 04/10/2026.',
      ),
    ).toBeInTheDocument();
  });

  it('announces the trial notice politely via role=status', async () => {
    mockUser = makeUser({ paymentStatus: 'AlDia', isInTrial: true, paymentDueDate: '2026-10-04' });
    await renderBanner();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

// ─── ...and must stay quiet everywhere else (guards against over-fixing) ───────

describe('PaymentBanner — AlDia without a trial stays silent', () => {
  it('renders nothing for a paid store that is simply up to date', async () => {
    mockUser = makeUser({ paymentStatus: 'AlDia', isInTrial: false, paymentDueDate: '2026-10-04' });
    const { container } = await renderBanner();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PaymentBanner — NoAplica stays silent even if isInTrial is set', () => {
  it('renders nothing when there is no billing clock at all', async () => {
    // Defensive: NoAplica means PaymentStartDate is null, so isInTrial cannot be
    // true. If a stale payload claims otherwise, "no clock" must win.
    mockUser = makeUser({ paymentStatus: 'NoAplica', isInTrial: true, paymentDueDate: null });
    const { container } = await renderBanner();
    expect(container).toBeEmptyDOMElement();
  });
});
