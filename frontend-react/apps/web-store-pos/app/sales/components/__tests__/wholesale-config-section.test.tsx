import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { WholesaleConfig } from '@store-mgmt/domain';
import { WholesaleConfigSection } from '../wholesale-config-section';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

/**
 * Harness controlado que replica al modal real (create/edit product): guarda en estado
 * la config emitida por el componente, de modo que el input re-renderice con el valor
 * devuelto. Sin esto, un test no podría observar el valor visual del input tras un
 * cambio (el componente es puramente controlado).
 */
function Harness({
  initialValue,
  retailPrice,
  onChange,
}: {
  initialValue: WholesaleConfig | undefined;
  retailPrice: number;
  onChange: (config: WholesaleConfig | undefined) => void;
}) {
  const [config, setConfig] = useState<WholesaleConfig | undefined>(initialValue);
  return (
    <Wrapper>
      <WholesaleConfigSection
        value={config}
        retailPrice={retailPrice}
        onChange={(next) => {
          setConfig(next);
          onChange(next);
        }}
      />
    </Wrapper>
  );
}

function renderSection(initialValue: WholesaleConfig | undefined, retailPrice = 700, onChange = vi.fn()) {
  render(<Harness initialValue={initialValue} retailPrice={retailPrice} onChange={onChange} />);
  return onChange;
}

describe('WholesaleConfigSection — formulario mayorista del producto', () => {
  it('arranca desactivado sin config: solo el toggle visible', () => {
    renderSection(undefined);
    expect(screen.getByTestId('wholesale-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('wholesale-pack-size-input')).not.toBeInTheDocument();
  });

  it('al activar emite una config con packSize y tier base en minPacks 1 con el precio retail', () => {
    const onChange = renderSection(undefined);
    fireEvent.click(screen.getByTestId('wholesale-toggle'));
    expect(onChange).toHaveBeenCalledWith({
      packSize: 24,
      tiers: [{ minPacks: 1, pricePerUnit: 700 }],
    });
  });

  it('editar packSize emite la config actualizada', () => {
    const onChange = renderSection({ packSize: 24, tiers: [{ minPacks: 1, pricePerUnit: 680 }] });
    const input = screen.getByTestId('wholesale-pack-size-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '6' } });
    expect(onChange).toHaveBeenLastCalledWith({
      packSize: 6,
      tiers: [{ minPacks: 1, pricePerUnit: 680 }],
    });
  });

  it('agregar un rango emite una config con dos tiers', () => {
    const onChange = renderSection({ packSize: 24, tiers: [{ minPacks: 1, pricePerUnit: 680 }] });
    fireEvent.click(screen.getByTestId('wholesale-add-tier'));
    const emitted = onChange.mock.calls[0][0] as WholesaleConfig;
    expect(emitted.tiers).toHaveLength(2);
    expect(emitted.tiers[1].minPacks).toBeGreaterThan(1);
  });

  it('editar el precio de un tier emite la config actualizada', () => {
    const onChange = renderSection({ packSize: 24, tiers: [{ minPacks: 1, pricePerUnit: 680 }] });
    const priceInput = screen.getByTestId('wholesale-tier-price-0') as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: '660' } });
    expect(onChange).toHaveBeenLastCalledWith({
      packSize: 24,
      tiers: [{ minPacks: 1, pricePerUnit: 660 }],
    });
  });

  it('eliminar un rango emite la config sin ese tier', () => {
    const onChange = renderSection({
      packSize: 24,
      tiers: [
        { minPacks: 1, pricePerUnit: 680 },
        { minPacks: 11, pricePerUnit: 660 },
      ],
    });
    fireEvent.click(screen.getByTestId('wholesale-remove-tier-1'));
    expect(onChange).toHaveBeenLastCalledWith({
      packSize: 24,
      tiers: [{ minPacks: 1, pricePerUnit: 680 }],
    });
  });

  it('desactivar emite undefined', () => {
    const onChange = renderSection({ packSize: 24, tiers: [{ minPacks: 1, pricePerUnit: 680 }] });
    fireEvent.click(screen.getByTestId('wholesale-toggle'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  // Vaciar un campo NO coacciona a 0: emite NaN y el input queda visualmente vacío,
  // para que reescribir un valor no sea engorroso. La validación al guardar es la
  // que exige enteros/precios válidos (validateWholesaleConfig rechaza NaN).
  it('vaciar packSize emite NaN (no 0) y el input queda vacío', () => {
    const onChange = renderSection({ packSize: 24, tiers: [{ minPacks: 1, pricePerUnit: 680 }] });
    const packInput = screen.getByTestId('wholesale-pack-size-input') as HTMLInputElement;
    fireEvent.change(packInput, { target: { value: '' } });
    const emitted = onChange.mock.calls[0][0] as WholesaleConfig;
    expect(Number.isNaN(emitted.packSize)).toBe(true);
    expect(packInput.value).toBe('');
  });

  it('vaciar el precio de un tier emite NaN (no 0) y el input queda vacío', () => {
    const onChange = renderSection({ packSize: 24, tiers: [{ minPacks: 1, pricePerUnit: 680 }] });
    const priceInput = screen.getByTestId('wholesale-tier-price-0') as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: '' } });
    const emitted = onChange.mock.calls[0][0] as WholesaleConfig;
    expect(Number.isNaN(emitted.tiers[0].pricePerUnit)).toBe(true);
    expect(priceInput.value).toBe('');
  });

  it('vaciar el mínimo de paquetes de un tier emite NaN (no 0) y el input queda vacío', () => {
    const onChange = renderSection({ packSize: 24, tiers: [{ minPacks: 1, pricePerUnit: 680 }] });
    const minInput = screen.getByTestId('wholesale-tier-min-0') as HTMLInputElement;
    fireEvent.change(minInput, { target: { value: '' } });
    const emitted = onChange.mock.calls[0][0] as WholesaleConfig;
    expect(Number.isNaN(emitted.tiers[0].minPacks)).toBe(true);
    expect(minInput.value).toBe('');
  });
});