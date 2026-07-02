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
        <CsvProductImporterModal existingBarcodes={[]} onImport={vi.fn()} onClose={vi.fn()} />
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
        <CsvProductImporterModal existingBarcodes={[]} onImport={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('csv-file-input'), { target: { files: [makeFile()] } });
    await waitFor(() => expect(screen.getByText('Error al importar los productos')).toBeInTheDocument());

    FileReader.prototype.readAsText = originalReadAsText;
  });
});
