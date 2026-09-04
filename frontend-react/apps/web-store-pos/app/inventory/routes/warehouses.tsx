import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import type {
  Product,
  Warehouse,
  WarehouseMovementType,
  WarehouseStockLevel,
  WarehouseStockMovement,
} from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Button } from '~/shared/components/ui/button';
import { ChevronDownIcon } from '~/shared/components/ui/icons';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { showToastSuccess } from '~/shared/lib/toast';
import { formatCurrency } from '~/shared/lib/format-currency';
import { formatLocalDate } from '~/shared/lib/date-utils';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { WarehouseOfflineService } from '../lib/services/warehouse-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';

export const clientLoader = featureLoader([EFeatures.Warehouses]);

type MovementFormMode = 'purchase_in' | 'sale_out' | 'transfer_out' | null;

interface MovementFormState {
  mode: MovementFormMode;
  warehouseId: string;
  productId: string;
}

const MOVEMENT_TYPE_LABEL: Record<WarehouseMovementType, string> = {
  purchase_in: 'WAREHOUSES.TYPE_PURCHASE_IN',
  sale_out: 'WAREHOUSES.TYPE_SALE_OUT',
  transfer_in: 'WAREHOUSES.TYPE_TRANSFER_IN',
  transfer_out: 'WAREHOUSES.TYPE_TRANSFER_OUT',
};

/**
 * Almacenes — gestión de almacenes y movimientos (warehouses-plan):
 * - CRUD de almacenes (crear / renombrar / desactivar, con bloqueo si hay stock
 *   o movimientos).
 * - Stock por producto × almacén con costo promedio; acciones por fila:
 *   Entrada (compra), Salida a tienda (crea una InventoryEntry en la tienda) y
 *   Transferir a otro almacén.
 * - Histórico de movimientos append-only.
 */
export function WarehousesPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockLevels, setStockLevels] = useState<WarehouseStockLevel[]>([]);
  const [movements, setMovements] = useState<WarehouseStockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  const [form, setForm] = useState<MovementFormState>({
    mode: null,
    warehouseId: '',
    productId: '',
  });
  const [formFields, setFormFields] = useState({
    quantity: '',
    costPrice: '',
    reason: '',
    toWarehouseId: '',
  });
  /** Producto elegido por almacén para registrar una entrada (compra) sin stock previo. */
  const [purchaseProduct, setPurchaseProduct] = useState<Record<string, string>>({});

  const service = useMemo(
    () =>
      storeId
        ? new WarehouseOfflineService(
            storeId,
            new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
            new InventoryOfflineService(
              storeId,
              new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
            ),
          )
        : null,
    [storeId],
  );

  function load() {
    if (!service) return;
    setWarehouses([...service.getStorageWarehouses()]);
    setStockLevels([...service.getStorageStockLevels()]);
    setMovements([...service.getStorageMovements()].reverse());
    const productRepo = new ProductRepository(
      storeId,
      new ProductCategoryRepository(storeId),
    );
    setProducts([...productRepo.getStorageProductsMap().values()]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads storeId/service only
  }, [service]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const warehouseName = (id: string) =>
    warehouses.find((w) => w.id === id)?.name ?? id;

  function handleCreate() {
    if (!service || !newName.trim()) return;
    const result = service.createWarehouse(newName);
    if (!result.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        result.errors[0]?.description ?? '',
      );
      return;
    }
    setNewName('');
    setCreating(false);
    showToastSuccess(intl.formatMessage({ id: 'WAREHOUSES.CREATED' }));
    load();
  }

  function handleRename(warehouse: Warehouse) {
    if (!service) return;
    const name = renaming[warehouse.id];
    if (name === undefined) {
      setRenaming((prev) => ({ ...prev, [warehouse.id]: warehouse.name }));
      return;
    }
    const result = service.updateWarehouse(warehouse.id, name);
    if (!result.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        result.errors[0]?.description ?? '',
      );
      return;
    }
    setRenaming((prev) => {
      const next = { ...prev };
      delete next[warehouse.id];
      return next;
    });
    showToastSuccess(intl.formatMessage({ id: 'WAREHOUSES.UPDATED' }));
    load();
  }

  function handleDeactivate(warehouse: Warehouse) {
    if (!service) return;
    const result = service.deactivateWarehouse(warehouse.id);
    if (!result.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        result.errors[0]?.description ?? '',
      );
      return;
    }
    load();
  }

  function openForm(mode: Exclude<MovementFormMode, null>, warehouseId: string, productId: string) {
    setForm({ mode, warehouseId, productId });
    setFormFields({ quantity: '', costPrice: '', reason: '', toWarehouseId: '' });
  }

  function handleAddPurchase(warehouseId: string) {
    const productId = purchaseProduct[warehouseId];
    if (!productId) return;
    openForm('purchase_in', warehouseId, productId);
  }

  function submitMovement() {
    if (!service || !form.mode) return;
    const quantity = parseFloat(formFields.quantity);
    const result = service.recordMovement({
      type: form.mode,
      warehouseId: form.warehouseId,
      productId: form.productId,
      quantity,
      costPrice: form.mode === 'purchase_in' ? parseFloat(formFields.costPrice) : undefined,
      reason: formFields.reason || null,
      toWarehouseId: form.mode === 'transfer_out' ? formFields.toWarehouseId || undefined : undefined,
    });
    if (!result.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        result.errors[0]?.description ?? '',
      );
      return;
    }
    setForm({ mode: null, warehouseId: '', productId: '' });
    showToastSuccess(intl.formatMessage({ id: 'WAREHOUSES.MOVEMENT_CREATED' }));
    load();
  }

  function stockOf(warehouseId: string): WarehouseStockLevel[] {
    return stockLevels.filter((level) => level.warehouseId === warehouseId);
  }

  const totalOnHand = (warehouseId: string) =>
    stockOf(warehouseId).reduce((sum, level) => sum + level.onHand, 0);

  return (
    <Card
      padding="tight"
      title={
        <div className="flex items-center justify-between">
          <span data-testid="warehouses-page-title" className="flex items-center gap-2">
            {intl.formatMessage({ id: 'WAREHOUSES.TITLE' })}
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              ({warehouses.length})
            </span>
          </span>
          <Button variant="primary" onClick={() => setCreating((prev) => !prev)}>
            {intl.formatMessage({ id: 'WAREHOUSES.NEW_WAREHOUSE' })}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {creating && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-3">
            <input
              data-testid="warehouse-name-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={intl.formatMessage({ id: 'WAREHOUSES.NAME_PLACEHOLDER' })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-primary"
            />
            <Button variant="primary" onClick={handleCreate}>
              {intl.formatMessage({ id: 'WAREHOUSES.SAVE' })}
            </Button>
            <Button variant="outline" onClick={() => setCreating(false)}>
              {intl.formatMessage({ id: 'WAREHOUSES.CANCEL' })}
            </Button>
          </div>
        )}

        {warehouses.length === 0 && (
          <InfoBox variant="primary" className="text-center">
            {intl.formatMessage({ id: 'WAREHOUSES.EMPTY' })}
          </InfoBox>
        )}

        <div className="space-y-2">
          {warehouses.map((warehouse) => {
            const isExpanded = !!expanded[warehouse.id];
            const levels = stockOf(warehouse.id);
            const renamingValue = renaming[warehouse.id];
            return (
              <div
                key={warehouse.id}
                data-testid={`warehouse-card-${warehouse.name}`}
                className="rounded-lg border border-border bg-background"
              >
                <div className="flex w-full items-center justify-between gap-4 px-4 py-3">
                  <button
                    type="button"
                    data-testid={`warehouse-toggle-${warehouse.name}`}
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [warehouse.id]: !prev[warehouse.id] }))
                    }
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                    <span className="text-sm font-medium text-text">
                      {warehouse.name}
                      {!warehouse.isActive && (
                        <span className="ml-2 text-xs text-text-muted">
                          ({intl.formatMessage({ id: 'WAREHOUSES.INACTIVE' })})
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-text-muted">
                      {intl.formatMessage({ id: 'WAREHOUSES.ON_HAND' })}:{' '}
                      {totalOnHand(warehouse.id)}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => handleRename(warehouse)}>
                      {intl.formatMessage({ id: 'WAREHOUSES.EDIT' })}
                    </Button>
                    <Button variant="outline" onClick={() => handleDeactivate(warehouse)}>
                      {intl.formatMessage({ id: 'WAREHOUSES.DEACTIVATE' })}
                    </Button>
                  </div>
                </div>

                {renamingValue !== undefined && (
                  <div className="flex items-center gap-2 border-t border-border px-4 py-3">
                    <input
                      data-testid={`warehouse-rename-${warehouse.name}`}
                      value={renamingValue}
                      onChange={(e) =>
                        setRenaming((prev) => ({ ...prev, [warehouse.id]: e.target.value }))
                      }
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-primary"
                    />
                    <Button variant="primary" onClick={() => handleRename(warehouse)}>
                      {intl.formatMessage({ id: 'WAREHOUSES.SAVE' })}
                    </Button>
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t border-border px-4 py-3">
                    <div className="mb-2 text-sm font-semibold text-text">
                      {intl.formatMessage({ id: 'WAREHOUSES.STOCK_TITLE' })}
                    </div>
                    {warehouse.isActive && products.length > 0 && (
                      <div className="mb-2 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-background p-2">
                        <div className="min-w-40 flex-1">
                          <div className="mb-1 text-xs text-text-muted">
                            {intl.formatMessage({ id: 'WAREHOUSES.PRODUCT' })}
                          </div>
                          <select
                            data-testid={`purchase-select-${warehouse.name}`}
                            value={purchaseProduct[warehouse.id] ?? ''}
                            onChange={(e) =>
                              setPurchaseProduct((prev) => ({
                                ...prev,
                                [warehouse.id]: e.target.value,
                              }))
                            }
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-primary"
                          >
                            <option value="">
                              {intl.formatMessage({ id: 'WAREHOUSES.SELECT_WAREHOUSE' })}
                            </option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Button
                          variant="outline"
                          disabled={!purchaseProduct[warehouse.id]}
                          onClick={() => handleAddPurchase(warehouse.id)}
                        >
                          {intl.formatMessage({ id: 'WAREHOUSES.PURCHASE_IN' })}
                        </Button>
                      </div>
                    )}
                    {levels.length === 0 && (
                      <InfoBox variant="primary" className="text-center">
                        {intl.formatMessage({ id: 'WAREHOUSES.NO_STOCK' })}
                      </InfoBox>
                    )}
                    {levels.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left text-xs text-text-muted">
                              <th className="px-2 py-1 font-medium">
                                {intl.formatMessage({ id: 'WAREHOUSES.PRODUCT' })}
                              </th>
                              <th className="px-2 py-1 font-medium">
                                {intl.formatMessage({ id: 'WAREHOUSES.ON_HAND' })}
                              </th>
                              <th className="px-2 py-1 font-medium">
                                {intl.formatMessage({ id: 'WAREHOUSES.AVG_COST' })}
                              </th>
                              <th className="px-2 py-1" />
                            </tr>
                          </thead>
                          <tbody>
                            {levels.map((level) => (
                              <tr
                                key={`${level.warehouseId}:${level.productId}`}
                                className="border-b border-border/50"
                              >
                                <td className="px-2 py-2 text-text">
                                  {productName(level.productId)}
                                </td>
                                <td
                                  data-testid={`stock-onhand-${level.warehouseId}-${level.productId}`}
                                  className="px-2 py-2 text-text"
                                >
                                  {level.onHand}
                                </td>
                                <td
                                  data-testid={`stock-cost-${level.warehouseId}-${level.productId}`}
                                  className="px-2 py-2 text-text"
                                >
                                  {formatCurrency(level.costPrice)}
                                </td>
                                <td className="px-2 py-2">
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="outline"
                                      onClick={() =>
                                        openForm('purchase_in', warehouse.id, level.productId)
                                      }
                                    >
                                      {intl.formatMessage({ id: 'WAREHOUSES.PURCHASE_IN' })}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={() =>
                                        openForm('sale_out', warehouse.id, level.productId)
                                      }
                                    >
                                      {intl.formatMessage({ id: 'WAREHOUSES.SALE_OUT' })}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={() =>
                                        openForm('transfer_out', warehouse.id, level.productId)
                                      }
                                    >
                                      {intl.formatMessage({ id: 'WAREHOUSES.TRANSFER' })}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {form.mode && form.warehouseId === warehouse.id && (
                        <div
                          data-testid={`movement-form-${form.mode}`}
                          className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-background p-3"
                        >
                          <div>
                            <div className="mb-1 text-xs text-text-muted">
                              {intl.formatMessage({ id: 'WAREHOUSES.QUANTITY' })}
                            </div>
                            <input
                              data-testid="movement-quantity"
                              type="number"
                              min="0"
                              step="0.01"
                              value={formFields.quantity}
                              onChange={(e) =>
                                setFormFields((prev) => ({ ...prev, quantity: e.target.value }))
                              }
                              className="w-28 rounded-md border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-primary"
                            />
                          </div>
                          {form.mode === 'purchase_in' && (
                            <div>
                              <div className="mb-1 text-xs text-text-muted">
                                {intl.formatMessage({ id: 'WAREHOUSES.COST_PRICE' })}
                              </div>
                              <input
                                data-testid="movement-cost"
                                type="number"
                                min="0"
                                step="0.01"
                                value={formFields.costPrice}
                                onChange={(e) =>
                                  setFormFields((prev) => ({ ...prev, costPrice: e.target.value }))
                                }
                                className="w-28 rounded-md border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-primary"
                              />
                            </div>
                          )}
                          {form.mode === 'transfer_out' && (
                            <div>
                              <div className="mb-1 text-xs text-text-muted">
                                {intl.formatMessage({ id: 'WAREHOUSES.TO_WAREHOUSE' })}
                              </div>
                              <select
                                data-testid="movement-target"
                                value={formFields.toWarehouseId}
                                onChange={(e) =>
                                  setFormFields((prev) => ({
                                    ...prev,
                                    toWarehouseId: e.target.value,
                                  }))
                                }
                                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-primary"
                              >
                                <option value="">
                                  {intl.formatMessage({ id: 'WAREHOUSES.SELECT_WAREHOUSE' })}
                                </option>
                                {warehouses
                                  .filter((w) => w.id !== warehouse.id && w.isActive)
                                  .map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                          <div>
                            <div className="mb-1 text-xs text-text-muted">
                              {intl.formatMessage({ id: 'WAREHOUSES.REASON' })}
                            </div>
                            <input
                              data-testid="movement-reason"
                              value={formFields.reason}
                              onChange={(e) =>
                                setFormFields((prev) => ({ ...prev, reason: e.target.value }))
                              }
                              className="w-48 rounded-md border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-primary"
                            />
                          </div>
                          <Button variant="primary" onClick={submitMovement}>
                            {intl.formatMessage({ id: 'WAREHOUSES.SAVE' })}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setForm({ mode: null, warehouseId: '', productId: '' })}
                          >
                            {intl.formatMessage({ id: 'WAREHOUSES.CANCEL' })}
                          </Button>
                        </div>
                      )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-text">
            {intl.formatMessage({ id: 'WAREHOUSES.MOVEMENTS_TITLE' })}
          </div>
          {movements.length === 0 && (
            <InfoBox variant="primary" className="text-center">
              {intl.formatMessage({ id: 'WAREHOUSES.NO_MOVEMENTS' })}
            </InfoBox>
          )}
          {movements.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-muted">
                    <th className="px-2 py-1 font-medium">
                      {intl.formatMessage({ id: 'WAREHOUSES.DATE' })}
                    </th>
                    <th className="px-2 py-1 font-medium">
                      {intl.formatMessage({ id: 'WAREHOUSES.TYPE' })}
                    </th>
                    <th className="px-2 py-1 font-medium">
                      {intl.formatMessage({ id: 'WAREHOUSES.PRODUCT' })}
                    </th>
                    <th className="px-2 py-1 font-medium">
                      {intl.formatMessage({ id: 'WAREHOUSES.QUANTITY' })}
                    </th>
                    <th className="px-2 py-1 font-medium">Almacén</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id} className="border-b border-border/50">
                      <td className="px-2 py-2 text-text">
                        {formatLocalDate(movement.createdDate)}
                      </td>
                      <td className="px-2 py-2 text-text">
                        {intl.formatMessage({ id: MOVEMENT_TYPE_LABEL[movement.type] })}
                      </td>
                      <td className="px-2 py-2 text-text">{productName(movement.productId)}</td>
                      <td
                        data-testid={`mv-qty-${movement.id}`}
                        className="px-2 py-2 text-text"
                      >
                        {movement.quantity}
                      </td>
                      <td className="px-2 py-2 text-text">
                        {warehouseName(movement.warehouseId)}
                        {movement.toWarehouseId && ` → ${warehouseName(movement.toWarehouseId)}`}
                        {movement.fromWarehouseId && ` ← ${warehouseName(movement.fromWarehouseId)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default WarehousesPage;