import { useState } from 'react';
import { useIntl } from 'react-intl';
import { CloseIcon, SaveIcon, PlusIcon } from '~/shared/components/ui/icons';
import { Button } from '~/shared/components/ui/button';

interface ProductRow {
  name: string;
  price: string;
}

interface EditProductsModalProps {
  categoryId: string;
  onSave: (categoryId: string, items: { name: string; price: number }[]) => void;
  onClose: () => void;
}

const PRICE_FORMAT = /^\d+(\.\d{1,2})?$/;

function makeBlankRow(): ProductRow {
  return { name: '', price: '' };
}

// Angular parity (edit-products-modal.component.ts): 4 blank rows to start.
function makeInitialRows(): ProductRow[] {
  return [makeBlankRow(), makeBlankRow(), makeBlankRow(), makeBlankRow()];
}

// Angular parity (edit-products-modal.component.ts:63-72): a row "participates" in submit
// validation only once the user has entered SOMETHING in it (name or price) — fully blank
// rows are silently ignored, never marked invalid/touched.
function isPartialRow(row: ProductRow): boolean {
  return row.name.trim() !== '' || row.price !== '';
}

function isNameValid(row: ProductRow): boolean {
  return row.name.trim() !== '';
}

function isPriceValid(row: ProductRow): boolean {
  return PRICE_FORMAT.test(row.price) && parseFloat(row.price) > 0;
}

// Angular parity (edit-products-modal.component.ts:63-72 hasDuplicateNames): trimmed,
// case-insensitive comparison across ALL rows (not just partial ones).
function hasDuplicateNames(rows: ProductRow[]): boolean {
  const names = rows.map((r) => r.name.trim().toLowerCase()).filter((n) => !!n);
  return new Set(names).size !== names.length;
}

export function EditProductsModal({ categoryId, onSave, onClose }: EditProductsModalProps) {
  const intl = useIntl();
  const [products, setProducts] = useState<ProductRow[]>(makeInitialRows);
  // Angular parity: mat-error only shows once a partial-filled row's controls are
  // `markAllAsTouched()` — which Angular does on submit, scoped to partial-filled rows only.
  const [touchedIndices, setTouchedIndices] = useState<Set<number>>(new Set());

  function handleNameChange(index: number, value: string) {
    setProducts((prev) => prev.map((row, i) => (i === index ? { ...row, name: value } : row)));
  }

  function handlePriceChange(index: number, value: string) {
    setProducts((prev) => prev.map((row, i) => (i === index ? { ...row, price: value } : row)));
  }

  function handleAddRow() {
    setProducts((prev) => [...prev, makeBlankRow()]);
  }

  function handleSave() {
    const partialIndices = products
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => isPartialRow(row))
      .map(({ i }) => i);

    const hasInvalidPartial = partialIndices.some(
      (i) => !isNameValid(products[i]) || !isPriceValid(products[i]),
    );

    // Angular parity (edit-products-modal.component.ts:74-88): duplicate names silently block
    // submit — Angular's own Swal error dialog for this case is dead/commented-out code, so NO
    // visible message is shown here either.
    if (hasInvalidPartial || hasDuplicateNames(products)) {
      setTouchedIndices(new Set(partialIndices));
      return;
    }

    const items = products
      .filter((row) => row.name && row.price)
      .map((row) => ({ name: row.name.trim(), price: parseFloat(row.price) }));

    onSave(categoryId, items);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {intl.formatMessage({ id: 'PRODUCT.ADD_PRODUCTS' })}
        </h2>

        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100">
                <th className="pb-2 text-xs font-medium text-gray-500">
                  {intl.formatMessage({ id: 'GENERAL.NAME' })}
                </th>
                <th className="pb-2 text-xs font-medium text-gray-500 w-28">
                  {intl.formatMessage({ id: 'GENERAL.PRICE' })}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.map((row, index) => {
                const touched = touchedIndices.has(index);
                const nameInvalid = touched && !isNameValid(row);
                const priceInvalid = touched && !isPriceValid(row);
                return (
                  <tr key={index}>
                    <td className="py-2 pr-4 align-top">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => handleNameChange(index, e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        data-testid={`product-name-${index}`}
                      />
                      {nameInvalid && (
                        <p className="mt-1 text-xs text-danger">
                          {intl.formatMessage(
                            { id: 'GENERAL.VALIDATION.REQUIRED' },
                            { name: intl.formatMessage({ id: 'GENERAL.NAME' }) },
                          )}
                        </p>
                      )}
                    </td>
                    <td className="py-2 align-top">
                      <input
                        type="number"
                        step="0.01"
                        value={row.price}
                        onChange={(e) => handlePriceChange(index, e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        data-testid={`product-price-${index}`}
                      />
                      {/* Angular parity (edit-products-modal.component.html:58-62): the price
                          error text is a literal, untranslated string in the Angular source. */}
                      {priceInvalid && <p className="mt-1 text-xs text-danger">Precio inválido</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="fab" type="button" onClick={handleAddRow} data-testid="add-product-row-button">
            <PlusIcon />
            {intl.formatMessage({ id: 'GENERAL.NEW' })}
          </Button>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-4">
          <Button variant="fab" type="button" onClick={onClose}>
            <CloseIcon />
            {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          </Button>
          <Button variant="fab" type="button" onClick={handleSave} data-testid="bulk-save-button">
            <SaveIcon />
            {intl.formatMessage({ id: 'GENERAL.SAVE' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
