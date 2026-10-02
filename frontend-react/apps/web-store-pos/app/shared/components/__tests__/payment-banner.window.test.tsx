import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { UserModel } from '@store-mgmt/domain';

// ═══════════════════════════════════════════════════════════════════════════
// Ventana de visibilidad del banner de pago (user request 2026-10-02):
// los dos mensajes con fecha (trial azul / vencimiento ámbar) solo se muestran
// cuando falten <= 8 días para `paymentDueDate`. El aviso rojo de Vencido no
// lleva fecha y queda exento. Una fecha ya vencida (contador negativo) también
// se muestra, porque EnGracia sigue avisando.
//
// El reloj se congela para que el límite de 8 días sea determinista: sin
// fake timers, un fixture con fecha fija se volvería "vencido" con el tiempo y
// los tests perderían el caso que pretenden cubrir (>8 días → oculto).
// ═══════════════════════════════════════════════════════════════════════════

const TODAY = new Date(2026, 9, 2, 12, 0, 0); // 2 oct 2026, mediodía local

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

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PaymentBanner — aviso de trial dentro/vacío de la ventana de 8 días', () => {
  it('oculta el trial cuando falta más de 8 días para el primer cobro', async () => {
    mockUser = makeUser({
      paymentStatus: 'AlDia',
      isInTrial: true,
      paymentDueDate: '2026-10-11', // 9 días → fuera de la ventana
    });
    const { container } = await renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra el trial justo a 8 días del primer cobro (límite inclusive)', async () => {
    mockUser = makeUser({
      paymentStatus: 'AlDia',
      isInTrial: true,
      paymentDueDate: '2026-10-10', // exactamente 8 días
    });
    await renderBanner();
    expect(
      screen.getByText('Probando el plan de pago. Primer cobro será el 10/10/2026, PERO si no pagas pasas al plan gratis.'),
    ).toBeInTheDocument();
  });

  it('muestra el trial cuando el primer cobro es hoy (0 días)', async () => {
    mockUser = makeUser({
      paymentStatus: 'AlDia',
      isInTrial: true,
      paymentDueDate: '2026-10-02',
    });
    await renderBanner();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('PaymentBanner — aviso de vencimiento dentro/vacío de la ventana de 8 días', () => {
  it('oculta el aviso ámbar cuando falta más de 8 días para el pago', async () => {
    mockUser = makeUser({
      paymentStatus: 'PorVencer',
      isInTrial: false,
      paymentDueDate: '2026-10-11', // 9 días
    });
    const { container } = await renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra el aviso ámbar justo a 8 días del pago (límite inclusive)', async () => {
    mockUser = makeUser({
      paymentStatus: 'PorVencer',
      isInTrial: false,
      paymentDueDate: '2026-10-10',
    });
    await renderBanner();
    expect(
      screen.getByText('El pago del plan vence el 10/10/2026. Realice el pago para evitar interrupciones en el servicio.'),
    ).toBeInTheDocument();
  });

  it('muestra el aviso ámbar cuando la fecha ya pasó (EnGracia, contador negativo)', async () => {
    mockUser = makeUser({
      paymentStatus: 'EnGracia',
      isInTrial: false,
      paymentDueDate: '2026-09-30', // -2 días
    });
    await renderBanner();
    expect(
      screen.getByText('El pago del plan vence el 30/09/2026. Realice el pago para evitar interrupciones en el servicio.'),
    ).toBeInTheDocument();
  });
});

describe('PaymentBanner — excepciones de la ventana', () => {
  it('Vencido se muestra siempre, aunque la fecha (si la hubiera) esté fuera de la ventana', async () => {
    mockUser = makeUser({
      paymentStatus: 'Vencido',
      isInTrial: false,
      paymentDueDate: null, // sin fecha: el aviso rojo no depende de la ventana
    });
    await renderBanner();
    expect(screen.getByText(/El pago del plan está vencido/)).toBeInTheDocument();
  });

  it('fecha desconocida (null): el aviso cae al comportamiento previo y se muestra', async () => {
    // No se puede contar días → no se oculta en silencio (payload estale/DG-2).
    mockUser = makeUser({
      paymentStatus: 'PorVencer',
      isInTrial: false,
      paymentDueDate: null,
    });
    await renderBanner();
    expect(screen.getByText(/El pago del plan vence el/)).toBeInTheDocument();
  });

  it('fecha malformada: también cae al comportamiento previo y se muestra', async () => {
    mockUser = makeUser({
      paymentStatus: 'PorVencer',
      isInTrial: false,
      paymentDueDate: 'not-a-date',
    });
    await renderBanner();
    expect(screen.getByText(/not-a-date/)).toBeInTheDocument();
  });

  it('la ventana no cambia los estados que ya eran silenciosos', async () => {
    mockUser = makeUser({ paymentStatus: 'AlDia', isInTrial: false, paymentDueDate: '2026-10-10' });
    const { container } = await renderBanner();
    expect(container).toBeEmptyDOMElement();
  });
});
