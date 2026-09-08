import { useEffect, useMemo, useState, type ReactElement } from 'react';
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
import {
  ChevronDownIcon,
  PlusIcon,
  InOutIcon,
  SwapHorizontalIcon,
  TruckIcon,
} from '~/shared/components/ui/icons';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { showToastSuccess } from '~/shared/lib/toast';
import { formatCurrency } from '~/shared/lib/format-currency';
import { formatLocalDate, groupByLocalDay } from '~/shared/lib/date-utils';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { WarehouseOfflineService } from '../lib/services/warehouse-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import type { InventoryCategoryView } from '../lib/services/inventory-offline-service';
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
  const [categories, setCategories] = useState<Map<string, { id: string; name: string }>>(
    new Map(),
  );
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
  /** Categorías expandidas dentro del panel de cada almacén (estilo Disponible). */
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  /** Búsqueda dentro del panel del almacén (igual que Disponible). */
  const [search, setSearch] = useState('');
  /** Días expandidos del historial de movimientos (acordeón agrupado por día). */
  const [expandedMovementDays, setExpandedMovementDays] = useState<Set<string>>(new Set());

  function toggleMovementDay(dayKey: string) {
    setExpandedMovementDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  }

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
    const productRepo = new ProductRepository(storeId, new ProductCategoryRepository(storeId));
    setProducts([...productRepo.getStorageProductsMap().values()]);
    setCategories(new Map(productRepo.getCategoryRepository().getStorageCategoriesMap()));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads storeId/service only
  }, [service]);

  /** Icono por tipo de movimiento: entrada verde, salida naranja, transferencia azul. */
  const MOVEMENT_TYPE_ICON: Record<WarehouseMovementType, { icon: ReactElement; color: string }> = {
    purchase_in: { icon: <InOutIcon />, color: 'text-success' },
    sale_out: { icon: <TruckIcon />, color: 'text-warning' },
    transfer_in: { icon: <SwapHorizontalIcon />, color: 'text-primary' },
    transfer_out: { icon: <SwapHorizontalIcon />, color: 'text-primary' },
  };

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;

  function handleModalSave(name: string) {
    if (!service) return;
    const result = editing
      ? service.updateWarehouse(editing.id, name)
      : service.createWarehouse(name);
    if (!result.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        result.errors[0]?.description ?? '',
      );
      return;
    }
    setModalOpen(false);
    setEditing(null);
    showToastSuccess(
      intl.formatMessage({ id: editing ? 'WAREHOUSES.UPDATED' : 'WAREHOUSES.CREATED' }),
    );
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

  function openMovementModal(
    mode: WarehouseMovementMode,
    warehouse: Warehouse,
    productId: string | null,
  ) {
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

  function stockOf(warehouseId: string): WarehouseStockLevel[] {
    return stockLevels.filter((level) => level.warehouseId === warehouseId);
  }

  /** Unidades totales del almacén — el (N) del header. */
  const unitsOf = (warehouseId: string) =>
    stockOf(warehouseId).reduce((sum, level) => sum + level.onHand, 0);

  /**
   * Vista por categorías del stock del almacén — mismo modo y diseño que la
   * vista Disponible del Inventario (InventoryProductList): agrupa por
   * categoría con Σ cantidades y Σ costo total, y filas de producto con
   * costo promedio. Filtra por búsqueda igual que `filterInventoryCategories`.
   */
  function categoryViewsOf(warehouseId: string): InventoryCategoryView[] {
    const levels = stockOf(warehouseId);
    const byCategory = new Map<string, WarehouseStockLevel[]>();
    for (const level of levels) {
      const product = products.find((p) => p.id === level.productId);
      if (!product) continue; // producto eliminado: no se muestra
      const categoryId = (product as { categoryId?: string }).categoryId ?? '';
      const group = byCategory.get(categoryId);
      if (group) group.push(level);
      else byCategory.set(categoryId, [level]);
    }

    const q = search.trim().toLowerCase();
    const views: InventoryCategoryView[] = [];
    byCategory.forEach((catLevels, categoryId) => {
      const categoryName = categories.get(categoryId)?.name ?? '';
      const items = catLevels.map((level) => {
        const product = products.find((p) => p.id === level.productId)!;
        return {
          productId: level.productId,
          productName: product.name,
          categoryId,
          categoryName,
          totalAvailable: level.onHand,
          avgCostPrice: level.costPrice,
        };
      });
      const categoryMatches = categoryName.toLowerCase().includes(q);
      const filteredItems = q
        ? categoryMatches
          ? items
          : items.filter((p) => p.productName.toLowerCase().includes(q))
        : items;
      if (filteredItems.length === 0) return;
      views.push({
        categoryId,
        categoryName,
        totalQuantity: filteredItems.reduce((sum, p) => sum + p.totalAvailable, 0),
        totalCostPrice: filteredItems.reduce(
          (sum, p) => sum + p.avgCostPrice * p.totalAvailable,
          0,
        ),
        products: filteredItems,
      });
    });
    return views;
  }

  const isSearching = search.trim() !== '';

  /** Costo total del almacén: Σ(onHand × costo promedio) — el total del header. */
  const totalCostOf = (warehouseId: string) =>
    stockOf(warehouseId).reduce((sum, level) => sum + level.onHand * level.costPrice, 0);

  /** Resumen global: unidades y costo de todos los almacenes. */
  const totalUnits = stockLevels.reduce((sum, level) => sum + level.onHand, 0);
  const grandTotalCost = stockLevels.reduce(
    (sum, level) => sum + level.onHand * level.costPrice,
    0,
  );

  /** Historial de movimientos agrupado por día (más reciente primero), como
   *  los historiales del resto de las vistas (Entradas, Créditos). */
  const movementDayGroups = useMemo(
    () => groupByLocalDay(movements, (m) => new Date(m.createdDate)),
    [movements],
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
            targetWarehouses={warehouses.filter((w) => w.id !== movementSource.id && w.isActive)}
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
          <span
            data-testid="warehouses-total-units"
            className="text-sm font-semibold text-text-muted"
          >
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
                      <span className="text-text">{warehouse.name}</span> ({unitsOf(warehouse.id)})
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
                    {/* Búsqueda — mismo modo y diseño que la vista Disponible. */}
                    {levels.length > 0 && (
                      <div className="mb-3">
                        <input
                          role="searchbox"
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder={intl.formatMessage({ id: 'GENERAL.SEARCH' })}
                          data-testid={`warehouse-search-${warehouse.id}`}
                          className="w-full rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    )}
                    {levels.length === 0 && (
                      <InfoBox variant="primary" className="text-center">
                        {intl.formatMessage({ id: 'WAREHOUSES.NO_STOCK' })}
                      </InfoBox>
                    )}
                    {levels.length > 0 && categoryViewsOf(warehouse.id).length === 0 && (
                      <InfoBox variant="primary" className="text-center">
                        {intl.formatMessage({ id: 'WAREHOUSES.NO_STOCK' })}
                      </InfoBox>
                    )}
                    {levels.length > 0 &&
                      /* Productos agrupados por categoría — mismo modo y diseño
                          que la vista Disponible del Inventario (InventoryProductList):
                          acordeón de categorías "Nombre (N) $Total" y filas de
                          productos con costo promedio + total. Dentro del panel
                          no hay selector de compra ni botones por fila: los
                          movimientos se hacen desde el gear del almacén. */
                      categoryViewsOf(warehouse.id).map((cat) => {
                        const catExpanded = isSearching
                          ? true
                          : !!expandedCategories[cat.categoryId];
                        return (
                          <div
                            key={cat.categoryId}
                            className="space-y-1 rounded-lg border border-border"
                          >
                            <button
                              type="button"
                              data-testid={`warehouse-category-toggle-${warehouse.id}-${cat.categoryId}`}
                              onClick={() =>
                                setExpandedCategories((prev) => ({
                                  ...prev,
                                  [cat.categoryId]: !prev[cat.categoryId],
                                }))
                              }
                              aria-expanded={catExpanded}
                              className="flex w-full items-center justify-between px-4 py-3 text-left"
                            >
                              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                                {cat.categoryName} ({cat.totalQuantity})
                              </h2>
                              <span className="flex items-center gap-2">
                                <span className="whitespace-nowrap text-sm font-semibold text-primary">
                                  {formatCurrency(cat.totalCostPrice)}
                                </span>
                                <ChevronDownIcon
                                  isExpanded={catExpanded}
                                  className="text-text-muted"
                                />
                              </span>
                            </button>
                            {catExpanded && (
                              <div className="divide-y divide-border border-t border-border bg-surface">
                                {cat.products.map((p) => (
                                  <div
                                    key={p.productId}
                                    data-testid={`warehouse-product-row-${warehouse.id}-${p.productId}`}
                                    className="flex items-center justify-between px-4 py-3"
                                  >
                                    <div>
                                      <p className="font-medium text-text">
                                        {p.productName} ({p.totalAvailable})
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p
                                        data-testid={`warehouse-product-cost-${warehouse.id}-${p.productId}`}
                                        className="whitespace-nowrap text-sm font-semibold text-success"
                                      >
                                        {formatCurrency(p.avgCostPrice)}
                                      </p>
                                      <p
                                        data-testid={`warehouse-product-total-${warehouse.id}-${p.productId}`}
                                        className="whitespace-nowrap text-sm font-semibold text-primary"
                                      >
                                        {formatCurrency(p.avgCostPrice * p.totalAvailable)}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
          {movementDayGroups.length === 0 && (
            <InfoBox variant="primary" className="text-center">
              {intl.formatMessage({ id: 'WAREHOUSES.NO_MOVEMENTS' })}
            </InfoBox>
          )}
{/* Acordeón agrupado por día — mismo patrón que los historiales de
              Entradas (entries.tsx) y Créditos: panel por día con la fecha en
              el header y, al desplegar, las filas de movimientos con icono por
              tipo, producto, cantidad y almacén origen → destino. */}
          <div className="space-y-2">
            {movementDayGroups.map((dayGroup) => {
              const dayKey = dayGroup.dayKey;
              const isDayExpanded = expandedMovementDays.has(dayKey);
              return (
                <div
                  key={dayKey}
                  className="rounded-lg border border-border bg-background"
                >
                  <button
                    type="button"
                    onClick={() => toggleMovementDay(dayKey)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                    data-testid={`mv-day-panel-toggle-${dayKey}`}
                    aria-expanded={isDayExpanded}
                  >
                    <span className="text-sm font-medium text-text">
                      {formatLocalDate(dayGroup.date)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="whitespace-nowrap text-sm font-semibold text-text-muted">
                        ({dayGroup.items.length})
                      </span>
                      <ChevronDownIcon isExpanded={isDayExpanded} className="text-text-muted" />
                    </span>
                  </button>
                  {isDayExpanded && (
                    <div className="divide-y divide-border border-t border-border">
                      {dayGroup.items.map((movement) => (
                        <div
                          key={movement.id}
                          className="flex items-center gap-3 px-4 py-2"
                        >
                          <span
                            data-testid={`mv-type-icon-${movement.id}`}
                            className={MOVEMENT_TYPE_ICON[movement.type].color}
                            title={intl.formatMessage({ id: MOVEMENT_TYPE_LABEL[movement.type] })}
                          >
                            {MOVEMENT_TYPE_ICON[movement.type].icon}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-text">
                            {productName(movement.productId)}
                          </span>
                          <span
                            data-testid={`mv-qty-${movement.id}`}
                            className="shrink-0 text-sm font-semibold text-text"
                          >
                            {movement.quantity}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-right text-sm text-text-muted">
                            {warehouseName(movement.warehouseId)}
                            {movement.toWarehouseId && ` → ${warehouseName(movement.toWarehouseId)}`}
                            {movement.fromWarehouseId && ` ← ${warehouseName(movement.fromWarehouseId)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default WarehousesPage;
