import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import type { ProductCategory } from '@store-mgmt/domain';
import { useClickOutside } from '~/shared/lib/hooks/use-click-outside';

interface CategoryActionsMenuProps {
  category: ProductCategory;
  onEditCategory: () => void;
  onAddProduct: () => void;
  onAddProducts: () => void;
}

/**
 * Gear/settings menu shown in the collapsed category header (to the left of the
 * expand chevron). Surfaces the category-level actions that previously lived only
 * inside the expanded panel — Editar Categoría / Nuevo Producto / Nuevo Productos
 * — so they are reachable without expanding the panel.
 *
 * React-only enhancement: Angular has no category-header options menu (its gear
 * exists only per product). Modeled on the per-product ProductRow menu (same
 * dropdown + useClickOutside pattern).
 */
export function CategoryActionsMenu({
  category,
  onEditCategory,
  onAddProduct,
  onAddProducts,
}: CategoryActionsMenuProps) {
  const intl = useIntl();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setIsOpen(false));

  function runAction(action: () => void) {
    setIsOpen(false);
    action();
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="rounded-full p-1.5 text-primary hover:bg-primary-light transition-colors"
        aria-label="Opciones de categoría"
        aria-expanded={isOpen}
        data-testid={`category-actions-toggle-${category.id}`}
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

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-border bg-surface shadow-lg z-10 py-1">
          <button
            type="button"
            onClick={() => runAction(onEditCategory)}
            data-testid="edit-category-button"
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text hover:bg-primary-light transition-colors"
          >
            {intl.formatMessage({ id: 'PRODUCT_CATEGORY.EDIT_CATEGORY' })}
          </button>
          <button
            type="button"
            onClick={() => runAction(onAddProduct)}
            data-testid="add-product-button"
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text hover:bg-primary-light transition-colors"
          >
            {intl.formatMessage({ id: 'PRODUCT.NEW_PRODUCT' })}
          </button>
          <button
            type="button"
            onClick={() => runAction(onAddProducts)}
            data-testid="add-products-button"
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text hover:bg-primary-light transition-colors"
          >
            {intl.formatMessage({ id: 'PRODUCT.NEW_PRODUCTS' })}
          </button>
        </div>
      )}
    </div>
  );
}

export default CategoryActionsMenu;
