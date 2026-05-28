import { useIntl } from 'react-intl';
import type { Product } from '@store-mgmt/domain';

interface SaleProductRowProps {
  product: Product;
  quantity: number;
  onAdd: (product: Product) => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
}

export function SaleProductRow({
  product,
  quantity,
  onAdd,
  onIncrease,
  onDecrease,
}: SaleProductRowProps) {
  const intl = useIntl();
  const inCart = quantity > 0;

  return (
    <div className="flex items-center justify-between rounded border p-3 bg-white hover:bg-gray-50">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-800">{product.name}</p>
        <p className="text-sm text-gray-500">
          {intl.formatMessage({ id: 'GENERAL.PRICE' })}: ${product.price.toFixed(2)}
        </p>
      </div>
      <div className="ml-3 flex items-center gap-2">
        {inCart ? (
          <>
            <button
              onClick={() => onDecrease(product.id)}
              className="h-8 w-8 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
              aria-label="Disminuir cantidad"
            >
              −
            </button>
            <span className="w-6 text-center font-semibold">{quantity}</span>
            <button
              onClick={() => onIncrease(product.id)}
              className="h-8 w-8 rounded bg-blue-600 text-white hover:bg-blue-700"
              aria-label="Aumentar cantidad"
            >
              +
            </button>
          </>
        ) : (
          <button
            onClick={() => onAdd(product)}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            {intl.formatMessage({ id: 'GENERAL.QUANTITY' })}+
          </button>
        )}
      </div>
    </div>
  );
}
