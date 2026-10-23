import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { FileInput } from '~/shared/components/ui/file-input';
import { InfoBox } from '~/shared/components/ui/info-box';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { showToastSuccess } from '~/shared/lib/toast';
import {
  parseCsvProducts,
  type CsvRowError,
  type ParsedProductRow,
} from '../lib/csv-product-parser';
import {
  importCatalogCsv,
  type CatalogCsvImportRow,
  type CatalogCsvImportSummary,
} from '../lib/services/catalog-http-service';

interface CatalogCsvImportCardProps {
  /** Tienda de la RUTA (vista del SuperAdmin). El import es siempre store-scoped. */
  storeId: string;
  /** Recarga el catálogo después de importar (el servidor manda). */
  onImported: () => void | Promise<void>;
}

/** Máximo de errores de fila que se listan: el conteo completo va en el encabezado. */
const MAX_LISTED_ROW_ERRORS = 5;

/**
 * Import CSV del catálogo (SuperAdmin): categoría, producto, precio de venta y moneda.
 *
 * El CSV se parsea en el NAVEGADOR con el mismo parser del POS (`parseCsvProducts`), y al backend
 * solo viajan las filas ya normalizadas. El backend hace UPSERT por categoría + producto: crea lo
 * que falta y actualiza precio y moneda de lo existente. Una fila inválida rechaza el import
 * completo (el backend revalida).
 *
 * Ojo con el efecto: el catálogo publica directamente `Product`/`ProductCategory`, así que lo
 * importado son productos REALES de la tienda (también visibles en el POS/inventario).
 */
export function CatalogCsvImportCard({ storeId, onImported }: CatalogCsvImportCardProps) {
  const intl = useIntl();
  const [rows, setRows] = useState<ParsedProductRow[]>([]);
  const [parseErrors, setParseErrors] = useState<CsvRowError[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<CatalogCsvImportSummary | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError('');
    setSummary(null);
    try {
      // `allowCurrencyNames`: este CSV documenta la moneda por código (`USD`). El import del POS
      // del dueño conserva el modo estricto (solo número del enum), que es su contrato previo.
      const parsed = parseCsvProducts(await file.text(), { allowCurrencyNames: true });
      setRows(parsed.products);
      setParseErrors(parsed.errors);
    } catch {
      setRows([]);
      setParseErrors([]);
      setError(intl.formatMessage({ id: 'WEB_CATALOG.IMPORT.FAILED' }));
    }
  }

  async function handleImport() {
    if (rows.length === 0 || isImporting) return;

    const payload: CatalogCsvImportRow[] = rows.map((row) => ({
      categoryName: row.category,
      productName: row.name,
      price: row.price,
      ...(row.currency !== undefined ? { currency: row.currency } : {}),
    }));

    setIsImporting(true);
    setError('');

    let result: Awaited<ReturnType<typeof importCatalogCsv>>;
    try {
      result = await importCatalogCsv(storeId, payload);
    } catch (err) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        intl.formatMessage({ id: httpErrorKey(err, 'WEB_CATALOG.IMPORT.FAILED') }),
      );
      return;
    } finally {
      setIsImporting(false);
    }

    if (!result.succeeded) {
      // El backend rechaza el import completo con el número de fila; ese detalle es lo único que
      // le dice al operador qué corregir, así que se muestra tal cual en vez de un texto genérico.
      setError(
        result.errors[0]?.description || intl.formatMessage({ id: 'WEB_CATALOG.IMPORT.FAILED' }),
      );
      return;
    }

    setSummary(result.data);
    setRows([]);
    setParseErrors([]);
    showToastSuccess(intl.formatMessage({ id: 'WEB_CATALOG.IMPORT.DONE' }));

    // La recarga es SEPARADA del import a propósito: si falla, el import YA se hizo y no puede
    // reportarse como fallo. La siguiente navegación o recarga manual vuelve a leer del servidor.
    try {
      await onImported();
    } catch {
      // Silencio deliberado: el resumen ya muestra lo importado.
    }
  }

  return (
    <Card padding="tight" title={intl.formatMessage({ id: 'WEB_CATALOG.IMPORT.TITLE' })}>
      <div data-testid="catalog-csv-import">
        <p className="text-sm text-text-muted">
          {intl.formatMessage({ id: 'WEB_CATALOG.IMPORT.SUBTITLE' })}
        </p>

        <div className="mt-3">
          <FileInput
            accept=".csv,text/csv"
            onFileChange={(file) => void handleFile(file)}
            disabled={isImporting}
            data-testid="catalog-csv-import-file"
          />
        </div>

        {parseErrors.length > 0 && (
          <InfoBox variant="danger" className="mt-3">
            <p>
              {intl.formatMessage({ id: 'PRODUCTS.CSV.ERROR_ROWS' }, { count: parseErrors.length })}
            </p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {parseErrors.slice(0, MAX_LISTED_ROW_ERRORS).map((rowError) => (
                <li key={`${rowError.row}-${rowError.errorCode}`}>
                  {intl.formatMessage(
                    { id: 'WEB_CATALOG.IMPORT.ROW_ERROR' },
                    {
                      row: rowError.row,
                      reason: intl.formatMessage({
                        id: `PRODUCTS.CSV.ERROR.${rowError.errorCode}`,
                      }),
                    },
                  )}
                </li>
              ))}
            </ul>
          </InfoBox>
        )}

        {rows.length > 0 && (
          <p className="mt-3 text-sm text-text" data-testid="catalog-csv-import-valid-rows">
            {intl.formatMessage({ id: 'PRODUCTS.CSV.VALID_ROWS' }, { count: rows.length })}
          </p>
        )}

        {error && (
          <InfoBox variant="danger" className="mt-3">
            <span data-testid="catalog-csv-import-error">{error}</span>
          </InfoBox>
        )}

        {summary && (
          <InfoBox variant="info" className="mt-3">
            <span data-testid="catalog-csv-import-summary">
              {intl.formatMessage(
                { id: 'WEB_CATALOG.IMPORT.SUMMARY' },
                {
                  categories: summary.categoriesCreated,
                  created: summary.productsCreated,
                  updated: summary.productsUpdated,
                },
              )}
            </span>
          </InfoBox>
        )}

        <InfoBox variant="info" className="mt-3">
          {intl.formatMessage({ id: 'WEB_CATALOG.IMPORT.REAL_PRODUCTS_NOTE' })}
        </InfoBox>

        <div className="mt-3 flex justify-end">
          <Button
            variant="fab"
            onClick={() => void handleImport()}
            disabled={rows.length === 0 || isImporting}
            data-testid="catalog-csv-import-button"
          >
            {intl.formatMessage(
              { id: isImporting ? 'WEB_CATALOG.IMPORT.IMPORTING' : 'WEB_CATALOG.IMPORT.IMPORT' },
              { count: rows.length },
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
