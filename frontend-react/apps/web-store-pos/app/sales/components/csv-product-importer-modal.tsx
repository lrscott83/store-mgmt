import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { PaperclipIcon, CloseIcon } from '~/shared/components/ui/icons';
import type { ParsedProductRow } from '../lib/csv-product-parser';
import { parseCsvProducts } from '../lib/csv-product-parser';
import { showBlockingError } from '~/shared/lib/blocking-alert';

// Was byte-identical to Angular's `sampleData` (csv-product-importer-modal.component.ts:27-30).
// DIVERGES DELIBERATELY (decision #15, csv-import-cost-quantity-entries, 2026-08-04): the
// template advertises the 5-column React shape. A 3-column Angular-era file still imports
// unchanged (headers matched by name, decision #4). Do not restore the 3-column template.
const SAMPLE_DATA = `category,name,price,cost,quantity
Pizzas,Pizza de Queso,150,100,10
Pizzas,Pizza Especial,200,140,5
Confituras,Caramelo,20,12,50`;

// Small inline download glyph — Angular renders <mat-icon>file_download</mat-icon>; there is no
// shared DownloadIcon in the icon set, so it is inlined here (same precedent as the cart SVG).
function DownloadIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

interface CsvProductImporterModalProps {
  onImport: (products: ParsedProductRow[]) => void;
  onClose: () => void;
}

/**
 * Strict parity with Angular's `csv-product-importer-modal.component.html/.ts` EXCEPT the sample
 * template's column set (see `SAMPLE_DATA`) — a required-file form showing the expected CSV
 * structure + a downloadable sample, then Cerrar / Importar. The file is parsed on Importar (not
 * on selection), and the parsed rows are handed to `onImport`, which owns creation (mirrors
 * Angular's importProducts -> parseCsv -> createCsvProducts split). No client-side preview table
 * — Angular has none (invalid rows are dropped by the parent's validateProducts-parity filter,
 * matching Angular).
 */
export function CsvProductImporterModal({ onImport, onClose }: CsvProductImporterModalProps) {
  const intl = useIntl();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [showRequired, setShowRequired] = useState(false);

  // Angular downloadSample() (component.ts:80-88): blob of sampleData -> productos_ejemplo.csv.
  function downloadSample() {
    const blob = new Blob([SAMPLE_DATA], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'productos_ejemplo.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    if (selected) setShowRequired(false);
  }

  // Angular handleError (component.ts:71-78): `const message = error.message || 'Error al
  // importar los productos'` — surface the caught error's own message, falling back to the
  // hardcoded literal only when the error carries none.
  function showImportError(message?: string) {
    showBlockingError(
      intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }),
      message || 'Error al importar los productos',
    );
  }

  // Angular importProducts() (component.ts:38-50): required-file guard, then parse the file and
  // hand the rows off. On ANY read/parse failure Angular's handleError (component.ts:71-78) opens a
  // blocking Swal error dialog (icon 'error', title GENERAL.RESPONSE.ERROR_TITLE, error.message
  // falling back to a hardcoded Spanish literal), surfaced here via showBlockingError.
  function handleImport() {
    if (!file) {
      setShowRequired(true);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const result = parseCsvProducts(text);
        onImport(result.products);
      } catch (err) {
        showImportError(err instanceof Error ? err.message : undefined);
      }
    };
    reader.onerror = () => showImportError(reader.error?.message);
    reader.readAsText(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-lg">
        {/* Header — Angular modal-header: title + top-right close */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-text">
            {intl.formatMessage({ id: 'PRODUCT_CATEGORY.IMPORT_PRODUCTS' })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            className="text-muted hover:text-text transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Structure card — Angular card.border-primary */}
          <div className="rounded-lg border border-primary p-4">
            {/* Angular hardcodes this literal (no translate pipe) — preserved verbatim. */}
            <p className="mb-2 text-sm text-muted">Estructura requerida del archivo (.csv):</p>
            <div className="rounded-md bg-gray-100 p-3">
              <pre className="mb-0 overflow-x-auto text-xs text-text">
                <code>{SAMPLE_DATA}</code>
              </pre>
            </div>

            <Button variant="fab" onClick={downloadSample} className="mt-4">
              <DownloadIcon className="h-5 w-5" />
              {intl.formatMessage({ id: 'PRODUCT_CATEGORY.DOWNLOAD_SAMPLE' })}
            </Button>
          </div>

          {/* File field — Angular mat-form-field "Fichero" with attach_file suffix + required */}
          <div className="mt-4">
            <label className="mb-1 block text-sm text-muted">
              {intl.formatMessage({ id: 'GENERAL.FILE' })}
              <span className="text-danger"> *</span>
            </label>
            <div
              className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                showRequired ? 'border-danger' : 'border-border'
              }`}
            >
              <span className={`min-w-0 flex-1 truncate text-sm ${file ? 'text-text' : 'text-muted'}`}>
                {file?.name ?? intl.formatMessage({ id: 'GENERAL.FILE' })}
              </span>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                aria-label={intl.formatMessage({ id: 'GENERAL.SELECT_FILE' })}
                className="shrink-0 text-primary hover:text-primary-hover transition-colors"
              >
                <PaperclipIcon />
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
                data-testid="csv-file-input"
              />
            </div>
            {showRequired && (
              <p className="mt-1 text-xs text-danger">
                {intl.formatMessage(
                  { id: 'GENERAL.VALIDATION.REQUIRED' },
                  { name: intl.formatMessage({ id: 'GENERAL.FILE' }) },
                )}
              </p>
            )}
          </div>
        </div>

        {/* Footer — Angular modal-footer: Cerrar + Importar (both always shown) */}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <Button variant="fab" onClick={onClose}>
            <CloseIcon />
            {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          </Button>
          <Button variant="fab" onClick={handleImport} data-testid="csv-import-button">
            <DownloadIcon className="h-5 w-5" />
            {intl.formatMessage({ id: 'GENERAL.IMPORT' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
