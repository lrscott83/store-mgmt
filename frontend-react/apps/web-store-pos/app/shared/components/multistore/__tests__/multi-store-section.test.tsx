import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { useState } from 'react';
import { MultiStoreSection, MultiStoreTotal } from '../multi-store-section';

const messages = {
  'MULTISTORE.ALL_STORES': 'Todas las tiendas',
  'MULTISTORE.NO_LOCAL_DATA': 'Sin datos de esta tienda en este dispositivo',
  'MULTISTORE.STORE_SELECT_ARIA': 'Seleccionar tienda',
};

const stores = [
  { id: 's1', name: 'Tienda A', isActive: true },
  { id: 's2', name: 'Tienda B', isActive: true },
];

function Harness() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <IntlProvider locale="es" messages={messages}>
      <MultiStoreSection
        stores={stores}
        selectedStoreId={selected}
        onSelectedStoreIdChange={setSelected}
        filters={<input data-testid="global-filter" placeholder="filtro global" />}
        totals={<MultiStoreTotal label="Total" value={123.45} />}
        renderStoreTotals={(store) => <span>({store.name})</span>}
      >
        {(store) => <div data-testid={`content-${store.id}`}>contenido {store.name}</div>}
      </MultiStoreSection>
    </IntlProvider>
  );
}

describe('MultiStoreSection', () => {
  beforeEach(() => {
    localStorage.setItem('language', 'es');
  });

  it('renders the global select with "Todas las tiendas" + one option per store, and the filters slot outside panels', () => {
    render(<Harness />);
    const select = screen.getByTestId('multistore-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toEqual(['Todas las tiendas', 'Tienda A', 'Tienda B']);
    expect(select).toHaveAccessibleName('Seleccionar tienda');
    expect(screen.getByTestId('global-filter')).toBeInTheDocument();
    // The "Tienda:" label was removed from the global controls row.
    expect(screen.queryByText('Tienda:')).toBeNull();
  });

  it('starts with all panels collapsed (totals visible via header only)', () => {
    render(<Harness />);
    expect(screen.queryByTestId('content-s1')).toBeNull();
    expect(screen.queryByTestId('content-s2')).toBeNull();
  });

  it('toggles a store panel open/closed without touching the other', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('multistore-panel-toggle-s1'));
    expect(screen.getByTestId('content-s1')).toBeInTheDocument();
    expect(screen.queryByTestId('content-s2')).toBeNull();
    fireEvent.click(screen.getByTestId('multistore-panel-toggle-s1'));
    expect(screen.queryByTestId('content-s1')).toBeNull();
  });

  it('"Todas" shows every panel; picking a store shows only that one', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('multistore-panel-toggle-s1'));
    fireEvent.click(screen.getByTestId('multistore-panel-toggle-s2'));
    const select = screen.getByTestId('multistore-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 's2' } });
    expect(screen.queryByTestId('content-s1')).toBeNull();
    expect(screen.getByTestId('content-s2')).toBeInTheDocument();
    fireEvent.change(select, { target: { value: '' } });
    expect(screen.getByTestId('content-s1')).toBeInTheDocument();
  });

  it('renders the outside-panels totals row', () => {
    render(<Harness />);
    expect(screen.getByTestId('multistore-totals')).toHaveTextContent('Total');
  });

  it('panels use compact chrome (px-2 py-2 header) — the space requirement', () => {
    const { container } = render(<Harness />);
    const toggle = container.querySelector('[data-testid="multistore-panel-toggle-s1"]');
    expect(toggle?.className).toContain('px-2');
    expect(toggle?.className).toContain('py-2');
  });
});
