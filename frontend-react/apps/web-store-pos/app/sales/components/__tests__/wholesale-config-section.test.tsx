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

function renderSection(value: WholesaleConfig | undefined, retailPrice = 700, onChange = vi.fn()) {
  render(
    <Wrapper>
      <WholesaleConfigSection value={value} retailPrice={retailPrice} onChange={onChange} />
    </Wrapper>,
  );
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
});