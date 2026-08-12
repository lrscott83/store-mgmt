import { useIntl } from 'react-intl';
import type { Product } from '@store-mgmt/domain';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { formatCurrency } from '~/shared/lib/format-currency';
import { InactiveBadge } from './inactive-badge';

interface CategoryProductListProps {
  products: Product[];
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
}

/**
 * Per-category product panel — matches Angular's
 * `category-product-list.component.html`. Rendered inside one accordion panel per
 * category by `ProductsPage`. Shows the per-category empty state and the product list
 * (name + price) with a per-product edit/delete actions menu.
 *
 * The category-level actions (Editar Categoría / Nuevo Producto / Nuevo Productos)
 * now live in the header's CategoryActionsMenu (gear), not here.
 */
export function CategoryProductList({
  products,
  onEditProduct,
  onDeleteProduct,
}: CategoryProductListProps) {
  const intl = useIntl();

  return (
    <div className="space-y-4">
      {products.length === 0 && (
        // Angular's `alert-light-primary` renders in Bootstrap/Metronic blue
        // ($primary: $blue #3699FF), NOT the Material purple used by buttons.
        <InfoBox variant="info" className="text-center">
          {/* PRODUCT_CATEGORY.NO_PRODUCT_FOUND */}
          {intl.formatMessage({ id: 'PRODUCT_CATEGORY.NO_PRODUCT_FOUND' })}
        </InfoBox>
      )}

      {products.length > 0 && (
        <ul className="divide-y divide-border">
          {products.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              onEdit={() => onEditProduct(product)}
              onDelete={() => onDeleteProduct(product.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface ProductRowProps {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}

function ProductRow({ product, onEdit, onDelete }: ProductRowProps) {
  const intl = useIntl();
  const formattedPrice = formatCurrency(product.price);

  return (
    <li className={`flex items-center justify-between py-3 ${product.isActive ? '' : 'opacity-60'}`.trim()}>
      <span className="flex items-center gap-2">
        <span className="text-sm text-text">{product.name}</span>
        {!product.isActive && <InactiveBadge />}
      </span>
      <div className="flex items-center gap-4">
        {/* Angular formats with `currency:'USD':'symbol':'1.2-2'` -> literal $X.XX,
            not locale-formatted (es locale would render "2,00 US$"). formatCurrency
            hard-codes 'en-US' to match, independent of the app's own 'es' display locale. */}
        <span className="text-sm font-medium text-primary">{formattedPrice}</span>
        <ActionMenu>
          <ActionMenuItem intent="edit" onClick={onEdit}>
            {/* PRODUCT.EDIT_PRODUCT */}
            {intl.formatMessage({ id: 'PRODUCT.EDIT_PRODUCT' })}
          </ActionMenuItem>
          <ActionMenuItem intent="delete" separatorBefore onClick={onDelete}>
            {/* PRODUCT.DELETE_PRODUCT */}
            {intl.formatMessage({ id: 'PRODUCT.DELETE_PRODUCT' })}
          </ActionMenuItem>
        </ActionMenu>
      </div>
    </li>
  );
}
