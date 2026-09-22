import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { CsvProductImporterModal } from '../csv-product-importer-modal';
import * as csvParser from '../../lib/csv-product-parser';
import { EModules } from '@store-mgmt/domain';

// Angular's handleError (component.ts:71-78) opens a blocking Swal error dialog, mirrored here
// via showBlockingError — assert the wrapper call, not inline DOM text.
const showBlockingErrorMock = vi.fn();
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

// MultiMonedas CSV (2026-09-22): el template depende del gate del módulo (15).
const mockUser = vi.hoisted(() => ({ storeModuleIds: [] as number[] }));
vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: mockUser, isAuthenticated: true };
  return {
    useAuthStore: vi.fn((selector?: (s: typeof state) => unknown) =>
      typeof selector === 'function' ? selector(state) : state,
    ),
  };
});

// Reset del gate MultiMonedas: la mutacion de un test no debe fugarse al siguiente.
beforeEach(() => {
  mockUser.storeModuleIds = [];
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// Canonical template shape since 2026-09-03 — Spanish headers (categoria,nombre,precio,costo,cantidad).
function makeFile(): File {
  return new File(
    ['categoria,nombre,precio,costo,cantidad\nBebidas,Coke,1.5,1,2'],
    'products.csv',
    { type: 'text/csv' },
  );
}

// Legacy Angular-era headers (English) — must still import unchanged (decision #4).
function makeLegacyFile(): File {
  return new File(['category,name,price\nBebidas,Coke,1.5'], 'products-legacy.csv', {
    type: 'text/csv',
  });
}

// Strict parity with Angular's csv-product-importer-modal: expected-structure card + sample
// download, a required file field, and Cerrar / Importar. No client-side preview table.
describe('CsvProductImporterModal — Angular structure/sample parity', () => {
  it('renders the required CSV structure literal and the sample rows', () => {
    render(
      <Wrapper>
        <CsvProductImporterModal onImport={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Estructura requerida del archivo (.csv):')).toBeInTheDocument();
    // sampleData is a single <code> node — assert on its text content.
    expect(screen.getByText(/Pizzas,Pizza con Queso,150/)).toBeInTheDocument();
    expect(screen.getByText('Descargar Ejemplo')).toBeInTheDocument();
  });

  // MultiMonedas CSV (2026-09-22): el template del importador depende del gate
  // del módulo (15) — las columnas de moneda solo se anuncian con él activo.
  describe('CsvProductImporterModal — template MultiMonedas (2026-09-22)', () => {
    it('SIN MultiMonedas: el template NO anuncia precio_moneda/precio_costo', () => {
      mockUser.storeModuleIds = [];
      render(
        <Wrapper>
          <CsvProductImporterModal onImport={vi.fn()} onClose={vi.fn()} />
        </Wrapper>,
      );
      expect(screen.getByText(/categoria,nombre,precio,costo,cantidad/)).toBeInTheDocument();
      expect(screen.queryByText(/precio_moneda/)).not.toBeInTheDocument();
    });

    it('CON MultiMonedas: el template anuncia precio_moneda y precio_costo al lado de cantidad', () => {
      mockUser.storeModuleIds = [EModules.MultiMonedas];
      render(
        <Wrapper>
          <CsvProductImporterModal onImport={vi.fn()} onClose={vi.fn()} />
        </Wrapper>,
      );
      expect(
        screen.getByText(/categoria,nombre,precio,precio_moneda,costo,precio_costo,cantidad/),
      ).toBeInTheDocument();
      // Ejemplo con moneda minúscula: el parser la acepta case-insensitive.
      expect(screen.getByText(/Pizzas,Pizza con Queso,150,USD,100,USD,10/)).toBeInTheDocument();
    });
  });

  // REQ-7: the sample template gains cost/quantity columns with concrete non-blank values on
  // every example row (csv-import-cost-quantity-entries, 2026-08-04). The header row is in
  // Spanish — categoria,nombre,precio,costo,cantidad (2026-09-03).
  it('renders the 5-column Spanish header exactly, with concrete cost/quantity values on every example row', () => {
    render(
      <Wrapper>
        <CsvProductImporterModal onImport={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const sample = screen.getByText(/Pizzas,Pizza con Queso/).textContent ?? '';
    const lines = sample.trim().split('\n');
    expect(lines[0]).toBe('categoria,nombre,precio,costo,cantidad');
    expect(lines).toHaveLength(4);
    for (const line of lines.slice(1)) {
      const cells = line.split(',');
      expect(cells).toHaveLength(5);
      const [, , , cost, quantity] = cells;
      expect(cost.trim()).not.toBe('');
      expect(quantity.trim()).not.toBe('');
    }
  });

  it('downloadSample triggers an anchor download of productos_ejemplo.csv', () => {
    // jsdom implements neither URL.createObjectURL nor revokeObjectURL — define them so the
    // component's blob-download path can run (and be asserted) without a real object URL.
    const createUrl = vi.fn().mockReturnValue('blob:sample');
    const revokeUrl = vi.fn();
    URL.createObjectURL = createUrl as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeUrl as unknown as typeof URL.revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <Wrapper>
        <CsvProductImporterModal onImport={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText('Descargar Ejemplo'));

    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });
});

describe('CsvProductImporterModal — required-file guard (Angular importProducts form validation)', () => {
  it('shows the required error and does NOT import when Importar is clicked with no file', () => {
    const onImport = vi.fn();
    render(
      <Wrapper>
        <CsvProductImporterModal onImport={onImport} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('csv-import-button'));

    expect(screen.getByText('Fichero es requerido')).toBeInTheDocument();
    expect(onImport).not.toHaveBeenCalled();
  });
});

describe('CsvProductImporterModal — parse-on-import + error text parity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    showBlockingErrorMock.mockClear();
  });

  it('parses the file on Importar and hands the parsed rows to onImport', async () => {
    const onImport = vi.fn();
    render(
      <Wrapper>
        <CsvProductImporterModal onImport={onImport} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeFile()] } });
    fireEvent.click(screen.getByTestId('csv-import-button'));

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'Coke',
        price: 1.5,
        category: 'Bebidas',
        cost: 1,
        quantity: 2,
      }),
    ]);
  });

  // Legacy Angular-era files keep importing unchanged — headers are matched by name and the
  // English aliases (category,name,price,cost,quantity) are still accepted (decision #4).
  it('imports a legacy English-header file unchanged', async () => {
    const onImport = vi.fn();
    render(
      <Wrapper>
        <CsvProductImporterModal onImport={onImport} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('csv-file-input'), {
      target: { files: [makeLegacyFile()] },
    });
    fireEvent.click(screen.getByTestId('csv-import-button'));

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Coke', price: 1.5, category: 'Bebidas' }),
    ]);
  });

  // T3 (Angular parity, component.ts:71-78 handleError): `error.message || fallback` — the
  // caught error's OWN message surfaces verbatim, not always the hardcoded literal.
  it("T3: surfaces the caught error's own message (Angular error.message || fallback)", async () => {
    vi.spyOn(csvParser, 'parseCsvProducts').mockImplementation(() => {
      throw new Error('boom');
    });
    render(
      <Wrapper>
        <CsvProductImporterModal onImport={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeFile()] } });
    fireEvent.click(screen.getByTestId('csv-import-button'));

    await waitFor(() => expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'boom'));
  });

  it('T3: falls back to "Error al importar los productos" when the thrown error has no message', async () => {
    vi.spyOn(csvParser, 'parseCsvProducts').mockImplementation(() => {
      throw new Error('');
    });
    render(
      <Wrapper>
        <CsvProductImporterModal onImport={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeFile()] } });
    fireEvent.click(screen.getByTestId('csv-import-button'));

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'Error al importar los productos',
      ),
    );
  });

  it('shows the SAME "Error al importar los productos" message when reading the file fails', async () => {
    const originalReadAsText = FileReader.prototype.readAsText;
    FileReader.prototype.readAsText = function (this: FileReader) {
      this.onerror?.(new ProgressEvent('error') as unknown as ProgressEvent<FileReader>);
    };

    render(
      <Wrapper>
        <CsvProductImporterModal onImport={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeFile()] } });
    fireEvent.click(screen.getByTestId('csv-import-button'));
    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith(
        'Error',
        'Error al importar los productos',
      ),
    );

    FileReader.prototype.readAsText = originalReadAsText;
  });
});
