import { useIntl } from 'react-intl';
import type { ProductCategory } from '@store-mgmt/domain';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';

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
 * exists only per product). Built on the shared `ActionMenu`/`ActionMenuItem`
 * primitive (gear-menu-action-styling change).
 */
export function CategoryActionsMenu({
  category,
  onEditCategory,
  onAddProduct,
  onAddProducts,
}: CategoryActionsMenuProps) {
  const intl = useIntl();

  return (
    <ActionMenu
      testId={`category-actions-toggle-${category.id}`}
      label="Opciones de categoría"
      widthClass="w-52"
    >
      <ActionMenuItem intent="edit" onClick={onEditCategory} data-testid="edit-category-button">
        {intl.formatMessage({ id: 'PRODUCT_CATEGORY.EDIT_CATEGORY' })}
      </ActionMenuItem>
      <ActionMenuItem intent="create" onClick={onAddProducts} data-testid="add-products-button">
        {intl.formatMessage({ id: 'PRODUCT.NEW_PRODUCTS' })}
      </ActionMenuItem>
      <ActionMenuItem intent="create" onClick={onAddProduct} data-testid="add-product-button">
        {intl.formatMessage({ id: 'PRODUCT.NEW_PRODUCT' })}
      </ActionMenuItem>
    </ActionMenu>
  );
}

export default CategoryActionsMenu;
