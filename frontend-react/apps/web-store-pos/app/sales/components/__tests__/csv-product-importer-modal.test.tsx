import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { CsvProductImporterModal } from '../csv-product-importer-modal';
import * as csvParser from '../../lib/csv-product-parser';

// Text parity with Angular's csv-product-importer-modal.component.ts:71-78 — a single
// hardcoded Spanish fallback message ('Error al importar los productos') shown for ANY
// import failure, regardless of whether it was a parse error or a file-read error.
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeFile(): File {
  return new File(['name,price\nCoke,1.5'], 'products.csv', { type: 'text/csv' });
}

describe('CsvProductImporterModal — error text parity (Angular generic import-error message)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows "Error al importar los productos" when parsing throws', async () => {
    vi.spyOn(csvParser, 'parseCsvProducts').mockImplementation(() => {
      throw new Error('boom');
    });
    render(
      <Wrapper>
        <CsvProductImporterModal onImport={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByText('Error al importar los productos')).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText('Error al importar los productos')).toBeInTheDocument());

    FileReader.prototype.readAsText = originalReadAsText;
  });
});

// This client-side CSV preview table (parse + per-row validation) has NO Angular
// counterpart — flagged separately as React-added scope. Regardless, all its rendered text
// must be Spanish per the blanket text-parity rule; these table headers/badges/row-error
// messages were previously hardcoded English.
describe('CsvProductImporterModal — preview table text is Spanish (no hardcoded English)', () => {
  it('renders Spanish column headers and a Spanish "Válido" status badge for a valid row', async () => {
    render(
      <Wrapper>
        <CsvProductImporterModal onImport={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const csv = ['name,price,barcode,category', 'Coca Cola,1.50,123456,Bebidas'].join('\n');
    fireEvent.change(screen.getByTestId('csv-file-input'), {
      target: { files: [new File([csv], 'products.csv', { type: 'text/csv' })] },
    });
    await waitFor(() => expect(screen.getByText('Coca Cola')).toBeInTheDocument());

    expect(screen.getByText('Fila')).toBeInTheDocument();
    expect(screen.getByText('Estado')).toBeInTheDocument();
    expect(screen.getByText('Válido')).toBeInTheDocument();
    expect(screen.queryByText('Row')).not.toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Valid')).not.toBeInTheDocument();
  });

  it('renders the Spanish PRODUCTS.CSV.ERROR message (not a raw English errorCode) for an invalid row', async () => {
    render(
      <Wrapper>
        <CsvProductImporterModal onImport={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const csv = ['name,price', ',1.50'].join('\n');
    fireEvent.change(screen.getByTestId('csv-file-input'), {
      target: { files: [new File([csv], 'products.csv', { type: 'text/csv' })] },
    });
    await waitFor(() => expect(screen.getByText('El nombre es requerido')).toBeInTheDocument());
    expect(screen.getByText('Estado')).toBeInTheDocument();
  });
});
