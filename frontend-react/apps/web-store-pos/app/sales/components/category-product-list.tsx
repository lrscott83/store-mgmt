import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Button } from '~/shared/components/ui/button';
import { useClickOutside } from '~/shared/lib/hooks/use-click-outside';

interface CategoryProductListProps {
  category: ProductCategory;
  products: Product[];
  onEditCategory: () => void;
  onAddProduct: () => void;
  onAddProducts: () => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
}

/**
 * Per-category product panel — matches Angular's
 * `category-product-list.component.html`. Rendered inside one accordion panel per
 * category by `ProductsPage`. Shows: per-category empty state, product list (name +
 * price) with a per-product edit/delete actions menu, and the category's own action row
 * (Editar Categoría / Nuevo Productos [bulk] / Nuevo Producto [single]).
 */
export function CategoryProductList({
  category,
  products,
  onEditCategory,
  onAddProduct,
  onAddProducts,
  onEditProduct,
  onDeleteProduct,
}: CategoryProductListProps) {
  const intl = useIntl();

  return (
    <div className="space-y-4">
      {products.length === 0 && (
        <InfoBox variant="primary" className="text-center">
          {/* PRODUCT_CATEGORY.NO_PRODUCT_FOUND */}
          {intl.formatMessage({ id: 'PRODUCT_CATEGORY.NO_PRODUCT_FOUND' })}
        </InfoBox>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="fab" onClick={onEditCategory} data-testid="edit-category-button">
          {/* PRODUCT_CATEGORY.EDIT_CATEGORY */}
          {intl.formatMessage({ id: 'PRODUCT_CATEGORY.EDIT_CATEGORY' })}
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="fab" onClick={onAddProducts} data-testid="add-products-button">
            {/* PRODUCT.NEW_PRODUCTS (bulk add) */}
            {intl.formatMessage({ id: 'PRODUCT.NEW_PRODUCTS' })}
          </Button>
          <Button variant="fab" onClick={onAddProduct} data-testid="add-product-button">
            {/* PRODUCT.NEW_PRODUCT (single add) */}
            {intl.formatMessage({ id: 'PRODUCT.NEW_PRODUCT' })}
          </Button>
        </div>
      </div>

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const formattedPrice = `$${product.price.toFixed(2)}`;
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setIsMenuOpen(false));

  return (
    <li className="flex items-center justify-between py-3">
      <span className="text-sm text-text">{product.name}</span>
      <div className="flex items-center gap-4">
        {/* Angular formats with `currency:'USD':'symbol':'1.2-2'` -> literal $X.XX,
            not locale-formatted (es locale would render "2,00 US$"). */}
        <span className="text-sm font-medium text-primary">{formattedPrice}</span>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen((v) => !v)}
            className="rounded-full p-1.5 text-primary hover:bg-primary-light transition-colors"
            aria-label="Acciones"
            aria-expanded={isMenuOpen}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-border bg-surface shadow-lg z-10 py-1">
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onEdit();
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text hover:bg-primary-light transition-colors"
              >
                {/* PRODUCT.EDIT_PRODUCT */}
                {intl.formatMessage({ id: 'PRODUCT.EDIT_PRODUCT' })}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-danger hover:bg-danger/10 transition-colors"
              >
                {/* PRODUCT.DELETE_PRODUCT */}
                {intl.formatMessage({ id: 'PRODUCT.DELETE_PRODUCT' })}
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
