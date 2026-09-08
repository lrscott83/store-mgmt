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
import { ChevronDownIcon, PlusIcon, InOutIcon, SwapHorizontalIcon, TruckIcon } from '~/shared/components/ui/icons';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { showToastSuccess } from '~/shared/lib/toast';
import { formatCurrency } from '~/shared/lib/format-currency';
import { formatLocalDate } from '~/shared/lib/date-utils';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { WarehouseOfflineService } from '../lib/services/warehouse-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { WarehouseFormModal } from '../components/warehouse-form-modal';
import {
  WarehouseMovementModal,
  type WarehouseMovementFields,
  type WarehouseMovementMode,
} from '../components/warehouse-movement-modal';

export const clientLoader = featureLoader([EFeatures.Warehouses]);

const MOVEMENT_TYPE_LABEL: Record<WarehouseMovementType, string> = {
  purchase_in: 'WAREHOUSES.TYPE_PURCHASE_IN',
  sale_out: 'WAREHOUSES.TYPE_SALE_OUT',
  transfer_in: 'WAREHOUSES.TYPE_TRANSFER_IN',
  transfer_out: 'WAREHOUSES.TYPE_TRANSFER_OUT',
};

/**
 * Almacenes — gestión de almacenes y movimientos (warehouses-plan):
 * - CRUD de almacenes (crear / renombrar / desactivar, con bloqueo si hay stock
 *   o movimientos) vía WarehouseFormModal.
 * - Panel global bajo el título: (unidades totales) a la izquierda y costo
 *   total de todos los almacenes a la derecha.
 * - Paneles colapsables con el mismo diseño que la vista Disponible del
 *   Inventario (InventoryProductList): header "Nombre (N) $Total" con la
 *   flecha a la derecha, y al desplegar las filas de productos con el costo
 *   promedio y el total alineados a la derecha.
 * - Gear por almacén: Entrada / Movimiento / Salida (modal de movimiento) +
 *   Editar / Desactivar. Acciones por fila equivalentes: Entrada (compra),
 *   Salida a tienda (crea una InventoryEntry en la tienda) y Transferir.
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  /** Modal state: creating XOR editing (null/undefined = closed). */
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  /** Modal de movimientos: null = cerrado; productId null = gear (elige producto). */
  const [movementModal, setMovementModal] = useState<{
    mode: WarehouseMovementMode;
    warehouseId: string;
    productId: string | null;
  } | null>(null);
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

  function handleModalSave(name: string) {
    if (!service) return;
    const result = editing ? service.updateWarehouse(editing.id, name) : service.createWarehouse(name);
    if (!result.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        result.errors[0]?.description ?? '',
      );
      return;
    }
    setModalOpen(false);
    setEditing(null);
    showToastSuccess(intl.formatMessage({ id: editing ? 'WAREHOUSES.UPDATED' : 'WAREHOUSES.CREATED' }));
    load();
  }

  function openCreateModal() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEditModal(warehouse: Warehouse) {
    setEditing(warehouse);
    setModalOpen(true);
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

  function openMovementModal(mode: WarehouseMovementMode, warehouse: Warehouse, productId: string | null) {
    setMovementModal({ mode, warehouseId: warehouse.id, productId });
  }

  function handleMovementSubmit(fields: WarehouseMovementFields) {
    if (!service || !movementModal) return;
    const result = service.recordMovement({
      type: movementModal.mode,
      warehouseId: movementModal.warehouseId,
      productId: fields.productId,
      quantity: fields.quantity,
      costPrice: fields.costPrice,
      reason: fields.reason,
      toWarehouseId: fields.toWarehouseId,
    });
    if (!result.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        result.errors[0]?.description ?? '',
      );
      return;
    }
    setMovementModal(null);
    showToastSuccess(intl.formatMessage({ id: 'WAREHOUSES.MOVEMENT_CREATED' }));
    load();
  }

  function handleAddPurchase(warehouse: Warehouse) {
    const productId = purchaseProduct[warehouse.id];
    if (!productId) return;
    openMovementModal('purchase_in', warehouse, productId);
  }

  function stockOf(warehouseId: string): WarehouseStockLevel[] {
    return stockLevels.filter((level) => level.warehouseId === warehouseId);
  }

  /** Unidades totales del almacén — el (N) del header. */
  const unitsOf = (warehouseId: string) =>
    stockOf(warehouseId).reduce((sum, level) => sum + level.onHand, 0);

  /** Costo total del almacén: Σ(onHand × costo promedio) — el total del header. */
  const totalCostOf = (warehouseId: string) =>
    stockOf(warehouseId).reduce((sum, level) => sum + level.onHand * level.costPrice, 0);

  /** Resumen global: unidades y costo de todos los almacenes. */
  const totalUnits = stockLevels.reduce((sum, level) => sum + level.onHand, 0);
  const grandTotalCost = stockLevels.reduce(
    (sum, level) => sum + level.onHand * level.costPrice,
    0,
  );

  const movementSource = movementModal
    ? warehouses.find((w) => w.id === movementModal.warehouseId)
    : undefined;

  return (
    <Card
      padding="tight"
      title={
        <div className="flex items-center justify-between">
          <span data-testid="warehouses-page-title" className="flex items-center gap-2">
            {intl.formatMessage({ id: 'WAREHOUSES.TITLE' })}
          </span>
          <Button variant="primary" onClick={openCreateModal}>
            <PlusIcon />
            {intl.formatMessage({ id: 'WAREHOUSES.NEW_WAREHOUSE' })}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <WarehouseFormModal
          open={modalOpen}
          warehouse={editing ?? undefined}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSave={handleModalSave}
        />

        {movementSource && movementModal && (
          <WarehouseMovementModal
            open
            mode={movementModal.mode}
            warehouse={movementSource}
            targetWarehouses={warehouses.filter(
              (w) => w.id !== movementSource.id && w.isActive,
            )}
            products={
              movementModal.mode === 'purchase_in' || movementModal.productId
                ? products
                : products.filter((p) =>
                    stockOf(movementSource.id).some((l) => l.productId === p.id),
                  )
            }
            productId={movementModal.productId}
            onClose={() => setMovementModal(null)}
            onSubmit={handleMovementSubmit}
          />
        )}

        {/* Resumen global bajo el título: (unidades) a la izquierda,
            costo total de todos los almacenes a la derecha. */}
        <div className="flex items-center justify-between">
          <span data-testid="warehouses-total-units" className="text-sm font-semibold text-text-muted">
            ({totalUnits})
          </span>
          <span
            data-testid="warehouses-total-cost"
            className="whitespace-nowrap text-sm font-semibold text-primary"
          >
            {formatCurrency(grandTotalCost)}
          </span>
        </div>

        {warehouses.length === 0 && (
          <InfoBox variant="primary" className="text-center">
            {intl.formatMessage({ id: 'WAREHOUSES.EMPTY' })}
          </InfoBox>
        )}

        <div className="space-y-2">
          {warehouses.map((warehouse) => {
            const isExpanded = !!expanded[warehouse.id];
            const levels = stockOf(warehouse.id);
            return (
              <div
                key={warehouse.id}
                data-testid={`warehouse-card-${warehouse.name}`}
                className="rounded-lg border border-border"
              >
                {/* Header — mismo diseño que el panel de categoría de la vista
                    Disponible (InventoryProductList): nombre (N) a la izquierda,
                    costo total + flecha a la derecha. El costo nunca se corta
                    (whitespace-nowrap + shrink-0); el nombre trunca si hace falta. */}
                <div className="flex w-full items-center justify-between gap-2 px-4 py-3">
                  <button
                    type="button"
                    data-testid={`warehouse-toggle-${warehouse.name}`}
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [warehouse.id]: !prev[warehouse.id] }))
                    }
                    aria-expanded={isExpanded}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold uppercase tracking-wide text-text-muted">
                      <span className="text-text">{warehouse.name}</span>{' '}
                      ({unitsOf(warehouse.id)})
                      {!warehouse.isActive && (
                        <span className="ml-1 text-xs normal-case text-text-muted">
                          ({intl.formatMessage({ id: 'WAREHOUSES.INACTIVE' })})
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="whitespace-nowrap text-sm font-semibold text-primary">
                        {formatCurrency(totalCostOf(warehouse.id))}
                      </span>
                      <ChevronDownIcon isExpanded={isExpanded} className="text-text-muted" />
                    </span>
                  </button>
                  <ActionMenu
                    testId={`warehouse-actions-toggle-${warehouse.id}`}
                    label={`Acciones de ${warehouse.name}`}
                  >
                    <ActionMenuItem
                      data-testid={`warehouse-entry-${warehouse.id}`}
                      onClick={() => openMovementModal('purchase_in', warehouse, null)}
                      icon={<InOutIcon />}
                    >
                      {intl.formatMessage({ id: 'WAREHOUSES.MENU_ENTRY' })}
                    </ActionMenuItem>
                    <ActionMenuItem
                      data-testid={`warehouse-movement-${warehouse.id}`}
                      onClick={() => openMovementModal('transfer_out', warehouse, null)}
                      icon={<SwapHorizontalIcon />}
                    >
                      {intl.formatMessage({ id: 'WAREHOUSES.MENU_MOVEMENT' })}
                    </ActionMenuItem>
                    <ActionMenuItem
                      data-testid={`warehouse-sale-out-${warehouse.id}`}
                      onClick={() => openMovementModal('sale_out', warehouse, null)}
                      icon={<TruckIcon />}
                    >
                      {intl.formatMessage({ id: 'WAREHOUSES.MENU_SALE_OUT' })}
                    </ActionMenuItem>
                    <ActionMenuItem
                      intent="edit"
                      separatorBefore
                      data-testid={`warehouse-edit-${warehouse.id}`}
                      onClick={() => openEditModal(warehouse)}
                    >
                      {intl.formatMessage({ id: 'WAREHOUSES.EDIT' })}
                    </ActionMenuItem>
                    <ActionMenuItem
                      intent="deactivate"
                      separatorBefore
                      data-testid={`warehouse-deactivate-${warehouse.id}`}
                      onClick={() => handleDeactivate(warehouse)}
                    >
                      {intl.formatMessage({ id: 'WAREHOUSES.DEACTIVATE' })}
                    </ActionMenuItem>
                  </ActionMenu>
                </div>

                {isExpanded && (
                  <div className="border-t border-border bg-surface px-4 py-3">
                    {warehouse.isActive && products.length > 0 && (
                      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-background p-2">
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
                              {intl.formatMessage({ id: 'WAREHOUSES.SELECT_PRODUCT' })}
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
                          onClick={() => handleAddPurchase(warehouse)}
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
                      /* Filas de productos — mismo diseño que la vista Disponible
                          del Inventario: nombre (cantidad) a la izquierda, costo
                          promedio (success) + total (primary) a la derecha. Las
                          acciones de movimiento viven al final de cada fila. */
                      <div className="divide-y divide-border border-t border-border bg-surface">
                        {levels.map((level) => (
                          <div
                            key={`${level.warehouseId}:${level.productId}`}
                            className="flex items-center justify-between gap-2 px-4 py-3"
                          >
                            <p className="min-w-0 flex-1 font-medium text-text">
                              {productName(level.productId)}{' '}
                              (<span
                                data-testid={`stock-onhand-${level.warehouseId}-${level.productId}`}
                              >
                                {level.onHand}
                              </span>)
                            </p>
                            <div className="shrink-0 text-right">
                              <p
                                data-testid={`stock-cost-${level.warehouseId}-${level.productId}`}
                                className="whitespace-nowrap text-sm font-semibold text-success"
                              >
                                {formatCurrency(level.costPrice)}
                              </p>
                              <p className="whitespace-nowrap text-sm font-semibold text-primary">
                                {formatCurrency(level.costPrice * level.onHand)}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                variant="outline"
                                onClick={() =>
                                  openMovementModal('purchase_in', warehouse, level.productId)
                                }
                              >
                                {intl.formatMessage({ id: 'WAREHOUSES.PURCHASE_IN' })}
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() =>
                                  openMovementModal('sale_out', warehouse, level.productId)
                                }
                              >
                                {intl.formatMessage({ id: 'WAREHOUSES.SALE_OUT' })}
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() =>
                                  openMovementModal('transfer_out', warehouse, level.productId)
                                }
                              >
                                {intl.formatMessage({ id: 'WAREHOUSES.TRANSFER' })}
                              </Button>
                            </div>
                          </div>
                        ))}
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
