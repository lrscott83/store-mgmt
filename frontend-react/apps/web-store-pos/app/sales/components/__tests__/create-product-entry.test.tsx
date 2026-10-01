import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { ProductCategory } from '@store-mgmt/domain';
import { Currency, EModules } from '@store-mgmt/domain';
import { CreateProductModal } from '../create-product-modal';

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
    decodeFromVideoDevice: vi.fn().mockResolvedValue({ stop: vi.fn() }),
  })),
}));

// Three independent gates now drive this modal's conditional UI:
//  - isOwnerAdmin   -> renders cost + quantity (an inventory entry is the owner's call)
//  - storeModuleIds -> Inventory (3), or there is no day's entry to book the purchase into
//  - storeModuleIds -> MultiMonedas (15), which CurrencySelect reads for BOTH selectors
let mockUser: { isOwnerAdmin: boolean; storeModuleIds: number[] } = {
  isOwnerAdmin: false,
  storeModuleIds: [],
};
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: (selector?: (s: { user: unknown }) => unknown) =>
    typeof selector === 'function' ? selector({ user: mockUser }) : { user: mockUser },
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

const category: ProductCategory = { id: 'cat-1', name: 'Bebidas', order: 1, isActive: true };

/** Owner WITH the Inventory module — the only profile that sees the entry controls. */
function ownerWith(...modules: number[]) {
  return { isOwnerAdmin: true, storeModuleIds: [EModules.Inventory, ...modules] };
}

function renderModal(onSave = vi.fn()) {
  render(
    <Wrapper>
      <CreateProductModal category={category} defaultOrder={1} onSave={onSave} onClose={vi.fn()} />
    </Wrapper>,
  );
  return onSave;
}

/** Fill the always-required fields; the optional ones are left to each test. */
function fillRequiredFields() {
  fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Ron' } });
  fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '500' } });
}

function submit() {
  fireEvent.click(screen.getByTestId('create-product-submit'));
}

describe('CreateProductModal — costo/cantidad solo para el owner con Inventario', () => {
  beforeEach(() => {
    mockUser = { isOwnerAdmin: false, storeModuleIds: [] };
  });

  it('NO muestra costo ni cantidad a un usuario que no es owner', () => {
    renderModal();
    expect(screen.queryByTestId('product-cost-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-quantity-input')).not.toBeInTheDocument();
  });

  it('un no-owner con Inventario + MultiMonedas sigue sin ver costo ni cantidad', () => {
    // The owner gate must NOT leak the entry controls to a plain store user: that would let
    // them open the day's entry through the product popup.
    mockUser = { isOwnerAdmin: false, storeModuleIds: [EModules.Inventory, EModules.MultiMonedas] };
    renderModal();
    expect(screen.getByTestId('product-currency-select')).toBeInTheDocument();
    expect(screen.queryByTestId('product-cost-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-quantity-input')).not.toBeInTheDocument();
  });

  it('NO muestra costo ni cantidad a un owner SIN el módulo Inventario', () => {
    // Sin Inventario no existe la pantalla de entradas del día donde esa compra quedaría
    // contabilizada: ofrecer los campos sería llevar al owner a un destino que no existe.
    mockUser = { isOwnerAdmin: true, storeModuleIds: [EModules.MultiMonedas] };
    renderModal();
    expect(screen.queryByTestId('product-cost-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-quantity-input')).not.toBeInTheDocument();
    // El precio conserva SU moneda: el gate es del bloque de entrada, no de todo el popup.
    expect(screen.getByTestId('product-currency-select')).toBeInTheDocument();
  });

  it('NO muestra costo ni cantidad cuando el usuario cacheado no trae storeModuleIds', () => {
    // Defensivo: un perfil cacheado de una sesión previa puede cargar sin el campo y
    // `storeModuleIds.includes(...)` reventaría la pantalla entera.
    mockUser = { isOwnerAdmin: true, storeModuleIds: undefined as unknown as number[] };
    renderModal();
    expect(screen.queryByTestId('product-cost-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-quantity-input')).not.toBeInTheDocument();
  });

  it('muestra costo y cantidad a un owner con Inventario, y la moneda de costo solo con MultiMonedas', () => {
    mockUser = ownerWith();
    renderModal();
    expect(screen.getByTestId('product-cost-input')).toBeInTheDocument();
    expect(screen.getByTestId('product-quantity-input')).toBeInTheDocument();
    // Sin el módulo, CurrencySelect devuelve null — y el precio sigue siendo moneda única.
    expect(screen.queryByTestId('product-cost-currency-select')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-currency-select')).not.toBeInTheDocument();
  });

  it('muestra AMBAS monedas a un owner con Inventario + MultiMonedas', () => {
    mockUser = ownerWith(EModules.MultiMonedas);
    renderModal();
    expect(screen.getByTestId('product-cost-currency-select')).toBeInTheDocument();
    expect(screen.getByTestId('product-currency-select')).toBeInTheDocument();
  });
});

describe('CreateProductModal — las dos monedas cambian y la del precio sigue al costo UNA vez', () => {
  beforeEach(() => {
    mockUser = ownerWith(EModules.MultiMonedas);
  });

  it('ambas monedas arrancan en CUP', () => {
    renderModal();
    expect((screen.getByTestId('product-cost-currency-select') as HTMLSelectElement).value).toBe(
      String(Currency.CUP),
    );
    expect((screen.getByTestId('product-currency-select') as HTMLSelectElement).value).toBe(
      String(Currency.CUP),
    );
  });

  it('cada moneda nombra su campo (no dos etiquetas idénticas "Moneda" contiguas)', () => {
    renderModal();
    expect(screen.getByText('Moneda del costo')).toBeInTheDocument();
    expect(screen.getByText('Moneda del precio')).toBeInTheDocument();
  });

  it('el PRIMER cambio de la moneda del costo arrastra la del precio', () => {
    // Atajo para quien compra y vende en la misma moneda: no tener que elegirlo dos veces.
    renderModal();
    fireEvent.change(screen.getByTestId('product-cost-currency-select'), {
      target: { value: String(Currency.USD) },
    });
    expect((screen.getByTestId('product-currency-select') as HTMLSelectElement).value).toBe(
      String(Currency.USD),
    );
  });

  it('el SEGUNDO cambio de la moneda del costo YA NO pisa la del precio', () => {
    // El latch es de un solo disparo: después el usuario fija la moneda del precio que quiera
    // y seguir cambiando la del costo no puede pisar esa elección explícita.
    renderModal();
    fireEvent.change(screen.getByTestId('product-cost-currency-select'), {
      target: { value: String(Currency.USD) },
    });
    fireEvent.change(screen.getByTestId('product-currency-select'), {
      target: { value: String(Currency.EUR) },
    });
    fireEvent.change(screen.getByTestId('product-cost-currency-select'), {
      target: { value: String(Currency.CLA) },
    });
    expect((screen.getByTestId('product-cost-currency-select') as HTMLSelectElement).value).toBe(
      String(Currency.CLA),
    );
    expect((screen.getByTestId('product-currency-select') as HTMLSelectElement).value).toBe(
      String(Currency.EUR),
    );
  });

  it('cada moneda viaja a su propio campo del payload', async () => {
    const onSave = renderModal();
    fillRequiredFields();
    fireEvent.change(screen.getByTestId('product-cost-currency-select'), {
      target: { value: String(Currency.USD) },
    });
    fireEvent.change(screen.getByTestId('product-currency-select'), {
      target: { value: String(Currency.EUR) },
    });
    fireEvent.change(screen.getByTestId('product-cost-input'), { target: { value: '300' } });
    fireEvent.change(screen.getByTestId('product-quantity-input'), { target: { value: '5' } });
    submit();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.costCurrency).toBe(Currency.USD);
    expect(payload.currency).toBe(Currency.EUR);
  });

  it('sin MultiMonedas NO hay ningún selector y todo queda en CUP', async () => {
    mockUser = ownerWith();
    const onSave = renderModal();
    fillRequiredFields();
    fireEvent.change(screen.getByTestId('product-cost-input'), { target: { value: '300' } });
    fireEvent.change(screen.getByTestId('product-quantity-input'), { target: { value: '5' } });
    submit();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.currency).toBe(Currency.CUP);
    expect(payload.costCurrency).toBe(Currency.CUP);
  });
});

describe('CreateProductModal — la entrada del día solo si ambos valores califican', () => {
  beforeEach(() => {
    mockUser = ownerWith();
  });

  it('envía costo y cantidad cuando ambos están presentes y la cantidad es > 0', async () => {
    const onSave = renderModal();
    fillRequiredFields();
    fireEvent.change(screen.getByTestId('product-cost-input'), { target: { value: '300' } });
    fireEvent.change(screen.getByTestId('product-quantity-input'), { target: { value: '5' } });
    submit();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.cost).toBe(300);
    expect(payload.quantity).toBe(5);
    expect(payload.price).toBe(500);
  });

  it('NO envía entrada si falta el costo, aunque la cantidad sea válida', async () => {
    // Decisión del usuario, y una divergencia deliberada del importador: el import usa
    // `cost ?? price` y bookearía el precio de venta como costo. Aquí no se bookea nada.
    const onSave = renderModal();
    fillRequiredFields();
    fireEvent.change(screen.getByTestId('product-quantity-input'), { target: { value: '5' } });
    submit();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.cost).toBeUndefined();
    expect(payload.quantity).toBeUndefined();
    // El producto se crea igual: los campos opcionales no bloquean el alta.
    expect(payload.name).toBe('Ron');
  });

  it('NO envía entrada si falta la cantidad, aunque el costo sea válido', async () => {
    const onSave = renderModal();
    fillRequiredFields();
    fireEvent.change(screen.getByTestId('product-cost-input'), { target: { value: '300' } });
    submit();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.cost).toBeUndefined();
    expect(payload.quantity).toBeUndefined();
  });

  it('NO envía entrada si AMBOS campos quedan vacíos', async () => {
    const onSave = renderModal();
    fillRequiredFields();
    submit();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.cost).toBeUndefined();
    expect(payload.quantity).toBeUndefined();
  });

  it('acepta un costo explícito de 0 como costo válido', async () => {
    // Espeja la decisión #7/#16 del importador: 0 es un costo real, "vacío" es lo que significa
    // ausente. Es lo que permite contabilizar algo que me regalaron.
    const onSave = renderModal();
    fillRequiredFields();
    fireEvent.change(screen.getByTestId('product-cost-input'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('product-quantity-input'), { target: { value: '3' } });
    submit();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.cost).toBe(0);
    expect(payload.quantity).toBe(3);
  });

  it.each([
    ['cero', '0'],
    ['negativa', '-4'],
    ['negativa decimal', '-0.5'],
  ])('NO envía entrada con cantidad %s', async (_label, value) => {
    // `!quantity` no basta: `!(-4)` es `false` en JS, así que un guardia ingenuo dejaría
    // pasar una cantidad negativa a createInventoryEntry.
    const onSave = renderModal();
    fillRequiredFields();
    fireEvent.change(screen.getByTestId('product-cost-input'), { target: { value: '300' } });
    fireEvent.change(screen.getByTestId('product-quantity-input'), { target: { value } });
    submit();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.quantity).toBeUndefined();
    expect(payload.cost).toBeUndefined();
  });

  it.each([
    ['media unidad', '1.5', 1.5],
    ['un cuarto', '0.25', 0.25],
    ['tres decimales', '0.333', 0.333],
  ])('acepta la fracción %s sin truncar', async (_label, value, expected) => {
    // Decisión del usuario: mismas fracciones libres que la fila de venta del POS (`step="any"`).
    // Un `parseInt` mandaría 1.5 al inventario como 1 — una cantidad equivocada y silenciosa
    // en una entrada contable.
    const onSave = renderModal();
    fillRequiredFields();
    fireEvent.change(screen.getByTestId('product-cost-input'), { target: { value: '300' } });
    fireEvent.change(screen.getByTestId('product-quantity-input'), { target: { value } });
    submit();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].quantity).toBe(expected);
  });

  it('el control de cantidad admite cualquier fracción, igual que el POS', () => {
    // Coherencia con `sales/decimal-quantity` (obs 898): la fila de venta del POS usa
    // `step="any"`. Si este popup limitara a 2 decimales, el mismo dato se aceptaría en una
    // pantalla y se rechazaría en la otra.
    renderModal();
    expect(screen.getByTestId('product-quantity-input')).toHaveAttribute('step', 'any');
  });

  it.each([
    ['costo', 'product-cost-input'],
    ['cantidad', 'product-quantity-input'],
  ])('el %s con texto no numérico queda vacío y NO bloquea el alta', async (label, testId) => {
    // Comportamiento REAL y contraintuitivo: `type="number"` aplica el algoritmo de saneamiento
    // del HTML y un valor que no es un número flotante válido ("abc", "-", "1e", ".") NUNCA llega
    // al estado del formulario — el input queda en "". Así que la rama de validación que
    // bloquea con mensaje es defensiva (mismo idioma que precio/orden, y lo que pidió el
    // usuario), pero por la UI es inalcanzable: lo observable es que el campo opcional sigue
    // opcional. Un test que afirmara lo contrario estaría probando algo que no puede pasar.
    const onSave = renderModal();
    fillRequiredFields();
    fireEvent.change(screen.getByTestId(testId), { target: { value: 'abc' } });
    expect((screen.getByTestId(testId) as HTMLInputElement).value).toBe('');
    submit();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.cost).toBeUndefined();
    expect(payload.quantity).toBeUndefined();
    expect(payload.name).toBe('Ron');
  });

  it('el alta NO se bloquea con el campo vacío (los tres controles son opcionales)', async () => {
    const onSave = renderModal();
    fillRequiredFields();
    submit();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/es requerido/)).not.toBeInTheDocument();
  });

  it('viaja la moneda del costo cuando el owner qualify la entrada', async () => {
    mockUser = ownerWith(EModules.MultiMonedas);
    const onSave = renderModal();
    fillRequiredFields();
    fireEvent.change(screen.getByTestId('product-cost-input'), { target: { value: '300' } });
    fireEvent.change(screen.getByTestId('product-quantity-input'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('product-cost-currency-select'), {
      target: { value: String(Currency.USD) },
    });
    submit();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].costCurrency).toBe(Currency.USD);
  });
});
