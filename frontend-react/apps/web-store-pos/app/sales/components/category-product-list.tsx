import { useIntl } from 'react-intl';
import type { Product } from '@store-mgmt/domain';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { formatCurrency } from '~/shared/lib/format-currency';
import { InactiveBadge } from './inactive-badge';

interface CategoryProductListProps {
  products: Product[];
  onEditProduct: (product: Product) => void;
  onDeactivateProduct: (productId: string) => void;
  onActivateProduct: (product: Product) => void;
}

/**
 * Per-category product panel — matches Angular's
 * `category-product-list.component.html`. Rendered inside one accordion panel per
 * category by `ProductsPage`. Shows the per-category empty state and the product list
 * (name + price) with a per-product edit/activate-or-deactivate actions menu.
 *
 * The category-level actions (Editar Categoría / Nuevo Producto / Nuevo Productos)
 * now live in the header's CategoryActionsMenu (gear), not here.
 */
export function CategoryProductList({
  products,
  onEditProduct,
  onDeactivateProduct,
  onActivateProduct,
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
              onDeactivate={() => onDeactivateProduct(product.id)}
              onActivate={() => onActivateProduct(product)}
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
  onDeactivate: () => void;
  onActivate: () => void;
}

function ProductRow({ product, onEdit, onDeactivate, onActivate }: ProductRowProps) {
  const intl = useIntl();
  const formattedPrice = formatCurrency(product.price);

  return (
    // The inactive styling (opacity) stays on the NAME/PRICE content, not on the row
    // wrapper: an opacity on the <li> also dims the ActionMenu's dropdown (it renders
    // inside the row), making the menu look disabled and its options unreadable. The
    // InactiveBadge already communicates the state; the menu must stay fully legible.
    <li className="flex items-center justify-between py-3">
      <span className={`flex items-center gap-2 ${product.isActive ? '' : 'opacity-60'}`.trim()}>
        <span className="text-sm text-text">{product.name}</span>
        {!product.isActive && <InactiveBadge />}
      </span>
      <div className="flex items-center gap-4">
        {/* Angular formats with `currency:'USD':'symbol':'1.2-2'` -> literal $X.XX,
            not locale-formatted (es locale would render "2,00 US$"). formatCurrency
            hard-codes 'en-US' to match, independent of the app's own 'es' display locale. */}
        <span className={`text-sm font-medium text-primary ${product.isActive ? '' : 'opacity-60'}`.trim()}>
          {formattedPrice}
        </span>
        <ActionMenu>
          <ActionMenuItem intent="edit" onClick={onEdit}>
            {/* PRODUCT.EDIT_PRODUCT */}
            {intl.formatMessage({ id: 'PRODUCT.EDIT_PRODUCT' })}
          </ActionMenuItem>
          {product.isActive ? (
            <ActionMenuItem intent="delete" separatorBefore onClick={onDeactivate}>
              {/* PRODUCT.DEACTIVATE_PRODUCT — deleteProduct is a soft delete (isActive: false,
                  row stays in storage), so the row menu item is labelled for what it actually
                  does. Still intent="delete": deactivation is still the destructive action in
                  this menu, hence the red styling. */}
              {intl.formatMessage({ id: 'PRODUCT.DEACTIVATE_PRODUCT' })}
            </ActionMenuItem>
          ) : (
            <ActionMenuItem intent="activate" separatorBefore onClick={onActivate}>
              {/* PRODUCT.ACTIVATE_PRODUCT — an inactive row's menu offers the reverse action.
                  intent="activate" (success green + check icon), NOT delete/danger. */}
              {intl.formatMessage({ id: 'PRODUCT.ACTIVATE_PRODUCT' })}
            </ActionMenuItem>
          )}
        </ActionMenu>
      </div>
    </li>
  );
}
