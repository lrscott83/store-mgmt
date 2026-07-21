import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { CsvProductImporterModal } from '../csv-product-importer-modal';
import * as csvParser from '../../lib/csv-product-parser';

// Angular's handleError (component.ts:71-78) opens a blocking Swal error dialog, mirrored here
// via showBlockingError — assert the wrapper call, not inline DOM text.
const showBlockingErrorMock = vi.fn();
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeFile(): File {
  return new File(['category,name,price\nBebidas,Coke,1.5'], 'products.csv', { type: 'text/csv' });
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
    expect(screen.getByText(/Pizzas,Pizza de Queso,150/)).toBeInTheDocument();
    expect(screen.getByText('Descargar Ejemplo')).toBeInTheDocument();
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
      expect.objectContaining({ name: 'Coke', price: 1.5, category: 'Bebidas' }),
    ]);
  });

  it('shows "Error al importar los productos" when parsing throws on import', async () => {
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

    await waitFor(() =>
      expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'Error al importar los productos'),
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
      expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', 'Error al importar los productos'),
    );

    FileReader.prototype.readAsText = originalReadAsText;
  });
});
