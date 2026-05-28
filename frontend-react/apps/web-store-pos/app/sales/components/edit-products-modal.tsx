import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product } from '@store-mgmt/domain';

interface EditProductsModalProps {
  products: Product[];
  onSave: (products: Product[]) => void;
  onClose: () => void;
}

export function EditProductsModal({ products, onSave, onClose }: EditProductsModalProps) {
  const intl = useIntl();
  const [editedPrices, setEditedPrices] = useState<Map<string, string>>(
    new Map(products.map((p) => [p.id, p.price.toString()])),
  );

  function handlePriceChange(id: string, value: string) {
    setEditedPrices((prev) => new Map(prev).set(id, value));
  }

  function handleSave() {
    const updated = products.map((p) => {
      const rawPrice = editedPrices.get(p.id) ?? p.price.toString();
      const parsed = parseFloat(rawPrice);
      return {
        ...p,
        price: isNaN(parsed) ? p.price : parsed,
        updatedDate: new Date(),
      };
    });
    onSave(updated);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {intl.formatMessage({ id: 'PRODUCTS.BULK_EDIT' })}
        </h2>

        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100">
                <th className="pb-2 text-xs font-medium text-gray-500">
                  {intl.formatMessage({ id: 'PRODUCTS.FORM.NAME' })}
                </th>
                <th className="pb-2 text-xs font-medium text-gray-500 w-28">
                  {intl.formatMessage({ id: 'PRODUCTS.FORM.PRICE' })}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="py-2 text-gray-800 truncate max-w-xs pr-4">{product.name}</td>
                  <td className="py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={editedPrices.get(product.id) ?? product.price.toString()}
                      onChange={(e) => handlePriceChange(product.id, e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      data-testid={`price-input-${product.id}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
            data-testid="bulk-save-button"
          >
            {intl.formatMessage({ id: 'GENERAL.SAVE' })}
          </button>
        </div>
      </div>
    </div>
  );
}
