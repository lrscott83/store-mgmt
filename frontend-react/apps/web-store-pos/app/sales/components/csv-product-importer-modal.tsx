import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import type { ParsedProductRow, CsvRowError } from '../lib/csv-product-parser';
import { parseCsvProducts } from '../lib/csv-product-parser';

// Maps each parser errorCode to its existing Spanish i18n key — same error-code -> i18n-key
// mapping pattern as app/sales/lib/product-availability.ts's PRODUCT_AVAILABILITY_ERROR_MESSAGE_KEYS.
const CSV_ROW_ERROR_MESSAGE_KEYS: Record<CsvRowError['errorCode'], string> = {
  MISSING_NAME: 'PRODUCTS.CSV.ERROR.MISSING_NAME',
  MISSING_PRICE: 'PRODUCTS.CSV.ERROR.MISSING_PRICE',
  INVALID_PRICE: 'PRODUCTS.CSV.ERROR.INVALID_PRICE',
};

interface CsvProductImporterModalProps {
  onImport: (products: ParsedProductRow[]) => void;
  onClose: () => void;
}

export function CsvProductImporterModal({ onImport, onClose }: CsvProductImporterModalProps) {
  const intl = useIntl();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<ParsedProductRow[]>([]);
  const [errors, setErrors] = useState<CsvRowError[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [hasFile, setHasFile] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const result = parseCsvProducts(text);
        setProducts(result.products);
        setErrors(result.errors);
        setParseError(null);
        setHasFile(true);
      } catch {
        // Angular's fallback for ANY import failure is a single hardcoded Spanish literal
        // (csv-product-importer-modal.component.ts:71-78), not an i18n key. Kept byte-identical
        // and unified across both failure paths (parse error and file-read error below).
        setParseError('Error al importar los productos');
        setProducts([]);
        setErrors([]);
        setHasFile(false);
      }
    };
    reader.onerror = () => {
      setParseError('Error al importar los productos');
      setHasFile(false);
    };
    reader.readAsText(file);
  }

  function handleImport() {
    onImport(products);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {intl.formatMessage({ id: 'PRODUCTS.CSV.TITLE' })}
        </h2>

        {/* File input */}
        <div className="mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-gray-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-600 hover:file:bg-gray-100"
            data-testid="csv-file-input"
          />
        </div>

        {parseError && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{parseError}</p>
        )}

        {/* Summary */}
        {hasFile && (
          <div className="mb-3 flex gap-4 text-sm">
            <span className="text-green-700 font-medium">
              {intl.formatMessage({ id: 'PRODUCTS.CSV.VALID_ROWS' }, { count: products.length })}
            </span>
            {errors.length > 0 && (
              <span className="text-red-600 font-medium">
                {intl.formatMessage({ id: 'PRODUCTS.CSV.ERROR_ROWS' }, { count: errors.length })}
              </span>
            )}
          </div>
        )}

        {/* Preview table */}
        {hasFile && (products.length > 0 || errors.length > 0) && (
          <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg mb-4">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    {intl.formatMessage({ id: 'PRODUCTS.CSV.COL_ROW' })}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    {intl.formatMessage({ id: 'PRODUCTS.FORM.NAME' })}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    {intl.formatMessage({ id: 'PRODUCTS.FORM.PRICE' })}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    {intl.formatMessage({ id: 'PRODUCTS.FORM.CATEGORY' })}
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    {intl.formatMessage({ id: 'PRODUCTS.CSV.COL_STATUS' })}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map((product, i) => (
                  <tr key={`valid-${i}`} className="bg-white">
                    <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                    <td className="px-3 py-1.5 text-gray-800">{product.name}</td>
                    <td className="px-3 py-1.5 text-gray-800">${product.price.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-gray-500">{product.category ?? '-'}</td>
                    <td className="px-3 py-1.5">
                      <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
                        {intl.formatMessage({ id: 'PRODUCTS.CSV.STATUS_VALID' })}
                      </span>
                    </td>
                  </tr>
                ))}
                {errors.map((err) => (
                  <tr key={`err-${err.row}`} className="bg-red-50">
                    <td className="px-3 py-1.5 text-gray-500">{err.row}</td>
                    <td colSpan={3} className="px-3 py-1.5 text-red-700">
                      {intl.formatMessage({ id: CSV_ROW_ERROR_MESSAGE_KEYS[err.errorCode] })}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">
                        {intl.formatMessage({ id: 'GENERAL.ERROR' })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
          </button>
          {products.length > 0 && (
            <button
              type="button"
              onClick={handleImport}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
              data-testid="csv-import-button"
            >
              {intl.formatMessage({ id: 'PRODUCTS.CSV.IMPORT_VALID' })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
