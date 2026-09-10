import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useIntl } from 'react-intl';
import type {
  Product,
  Warehouse,
  WarehouseMovementType,
  WarehouseStockMovement,
} from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isOwnerAdmin } from '~/shared/lib/auth/authorization-service';
import { confirmDialog, showBlockingError } from '~/shared/lib/blocking-alert';
import { showToastSuccess } from '~/shared/lib/toast';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { ChevronDownIcon, InOutIcon, SwapHorizontalIcon, TruckIcon } from '~/shared/components/ui/icons';
import { formatLocalDate, groupByLocalDay } from '~/shared/lib/date-utils';
import { WarehouseOfflineService } from '../lib/services/warehouse-offline-service';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { WarehouseMovementModal } from '../components/warehouse-movement-modal';
import type { WarehouseMovementFields, WarehouseMovementMode } from '../components/warehouse-movement-modal';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';

/**
 * Guard por feature: Movimientos de almacén (FeatureType 37, backend).
 * SuperAdmin/OwnerAdmin pasan por bypass (mismo patrón que warehouses.tsx).
 */
export const clientLoader = featureLoader([EFeatures.WarehouseStockMovements]);

const MOVEMENT_TYPE_LABEL: Record<WarehouseMovementType, string> = {
  purchase_in: 'WAREHOUSES.TYPE_PURCHASE_IN',
  sale_out: 'WAREHOUSES.TYPE_SALE_OUT',
  transfer_in: 'WAREHOUSES.TYPE_TRANSFER_IN',
  transfer_out: 'WAREHOUSES.TYPE_TRANSFER_OUT',
  // Reversa — compensa una fila anterior (plan 2026-09-09, D7a/F5).
  reversal: 'WAREHOUSES.TYPE_REVERSAL',
};

/**
 * Movimientos de almacén — vista dedicada (antes vivía dentro del CRUD de
 * Almacenes): historial global de todos los almacenes, agrupado por días en
 * acordeón (mismo patrón que Entradas y Créditos) con icono por tipo,
 * producto, cantidad y almacén origen → destino.
 */
export function WarehouseMovementsPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [movements, setMovements] = useState<WarehouseStockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  /** Días expandidos del historial (acordeón agrupado por día). */
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
    setMovements([...service.getStorageMovements()].reverse());
    const productRepo = new ProductRepository(storeId, new ProductCategoryRepository(storeId));
    setProducts([...productRepo.getStorageProductsMap().values()] as Product[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads storeId/service only
  }, [service]);

  /** Icono por tipo de movimiento: entrada verde, salida naranja, transferencia azul, reversa violeta (plan 2026-09-09, F5). */
  const MOVEMENT_TYPE_ICON: Record<WarehouseMovementType, { icon: ReactElement; color: string }> = {
    purchase_in: { icon: <InOutIcon />, color: 'text-success' },
    sale_out: { icon: <TruckIcon />, color: 'text-warning' },
    transfer_in: { icon: <SwapHorizontalIcon />, color: 'text-primary' },
    transfer_out: { icon: <SwapHorizontalIcon />, color: 'text-primary' },
    // Reversa violeta con el mismo icono de intercambio (D7a/F5).
    reversal: { icon: <SwapHorizontalIcon />, color: 'text-violet-600' },
  };

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;

  /** Historial agrupado por día (más reciente primero). */
  const movementDayGroups = useMemo(
    () => groupByLocalDay(movements, (m) => new Date(m.createdDate)),
    [movements],
  );

  // ─── Plan 2026-09-09: engranaje Revertir + badge (F4/F5, D6/D10) ─────────
  const canManageMovements = user ? isOwnerAdmin(user) : false;

  /** Ids con reversa emparejada — derivado en runtime, sin migración (F5). */
  const reversedIds = useMemo(
    () =>
      new Set(
        movements
          .filter((m) => m.type === 'reversal' && m.reversalOfMovementId)
          .map((m) => m.reversalOfMovementId!),
      ),
    [movements],
  );

  /** Filas reversibles: los 3 tipos del UI, sin reversa previa (D2/D10). */
  function isReversible(movement: WarehouseStockMovement): boolean {
    return (
      canManageMovements &&
      (movement.type === 'purchase_in' ||
        movement.type === 'sale_out' ||
        movement.type === 'transfer_out') &&
      !reversedIds.has(movement.id)
    );
  }

  async function handleRevert(movement: WarehouseStockMovement) {
    if (!service) return;
    const confirmed = await confirmDialog({
      title: intl.formatMessage({ id: 'GENERAL.DELETE_CONFIRM_TITLE' }),
      message: intl.formatMessage({ id: 'WAREHOUSES.REVERSAL_CONFIRM_MESSAGE_A' }),
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;

    const result = service.reverseMovement(movement.id);
    if (!result.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        result.errors[0]?.description ?? '',
      );
      return;
    }
    showToastSuccess(intl.formatMessage({ id: 'WAREHOUSES.REVERSAL_SUCCESS' }));
    load();
  }

  // ─── Edición = reversa + recreación (F3, por fila D10) ──────────────────────

  const [editingMovement, setEditingMovement] = useState<WarehouseStockMovement | null>(null);

  function openEdit(movement: WarehouseStockMovement) {
    setEditingMovement(movement);
  }

  /**
   * F3: la edición NO muta la fila original — compensa (reversa al costo
   * exacto del lote) y registra el movimiento corregido. Si el paso 2 falla,
   * la reversa YA quedó persistida (§7.3 del plan): se informa con el error
   * específico y se recarga el historial (la guía al usuario es el propio
   * error — p.ej. InsufficientStock para la nueva cantidad).
   */
  function handleEditSubmit(fields: WarehouseMovementFields) {
    if (!service || !editingMovement) return;
    const original = editingMovement;
    const reversal = service.reverseMovement(original.id);
    if (!reversal.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        reversal.errors[0]?.description ?? '',
      );
      return;
    }
    const recreated = service.recordMovement({
      type: original.type as WarehouseMovementMode,
      warehouseId: original.warehouseId,
      productId: original.productId,
      quantity: fields.quantity,
      costPrice: fields.costPrice,
      toWarehouseId: fields.toWarehouseId ?? original.toWarehouseId,
      reason: fields.reason,
    });
    setEditingMovement(null);
    if (!recreated.succeeded) {
      // La reversa quedó huérfana (no-atómico, §7.3) — el error guía al usuario.
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        recreated.errors[0]?.description ?? '',
      );
      load();
      return;
    }
    showToastSuccess(intl.formatMessage({ id: 'WAREHOUSES.MOVEMENT_UPDATED' }));
    load();
  }

  return (
    <Card>
      <h1 className="mb-4 text-xl font-bold text-text">
        {intl.formatMessage({ id: 'MENU.WAREHOUSE_MOVEMENTS' })}
      </h1>

      <div className="mb-2 text-sm font-semibold text-text">
        {intl.formatMessage({ id: 'WAREHOUSES.MOVEMENTS_TITLE' })}
      </div>
      {movementDayGroups.length === 0 && (
        <InfoBox variant="primary" className="text-center">
          {intl.formatMessage({ id: 'WAREHOUSES.NO_MOVEMENTS' })}
        </InfoBox>
      )}
      {/* Acordeón agrupado por día — mismo patrón que los historiales de
          Entradas y Créditos: panel por día con la fecha en el header y, al
          desplegar, las filas de movimientos con icono por tipo, producto,
          cantidad y almacén origen → destino. */}
      <div className="space-y-2">
        {movementDayGroups.map((dayGroup) => {
          const dayKey = dayGroup.dayKey;
          const isDayExpanded = expandedMovementDays.has(dayKey);
          return (
            <div key={dayKey} className="rounded-lg border border-border bg-background">
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
                    <div key={movement.id} className="flex items-center gap-3 px-4 py-2">
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
                      {/* Badge Revertido en la fila original (F5) — derivado en runtime. */}
                      {reversedIds.has(movement.id) && (
                        <span
                          data-testid={`mv-reversal-badge-${movement.id}`}
                          className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700"
                        >
                          {intl.formatMessage({ id: 'WAREHOUSES.REVERSAL_BADGE' })}
                        </span>
                      )}
                      {isReversible(movement) && (
                        <ActionMenu
                          label={`${intl.formatMessage({ id: 'WAREHOUSES.ACTIONS' })} ${productName(movement.productId)}`}
                          testId={`mv-actions-toggle-${movement.id}`}
                        >
                          <ActionMenuItem
                            intent="edit"
                            data-testid={`mv-edit-${movement.id}`}
                            onClick={() => openEdit(movement)}
                          >
                            {intl.formatMessage({ id: 'WAREHOUSES.EDIT_ACTION' })}
                          </ActionMenuItem>
                          <ActionMenuItem
                            intent="delete"
                            separatorBefore
                            data-testid={`mv-revert-${movement.id}`}
                            onClick={() => void handleRevert(movement)}
                          >
                            {intl.formatMessage({ id: 'WAREHOUSES.REVERT_ACTION' })}
                          </ActionMenuItem>
                        </ActionMenu>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal de edición (F3): reutiliza el modal de movimientos con los
          valores de la fila original precargados. El producto y el almacén
          origen quedan fijos — se edita cantidad/costo/destino. */}
      {editingMovement && service && (
        <WarehouseMovementModal
          open
          mode={editingMovement.type as WarehouseMovementMode}
          warehouse={
            warehouses.find((w) => w.id === editingMovement.warehouseId) ?? {
              id: editingMovement.warehouseId,
              name: warehouseName(editingMovement.warehouseId),
              isActive: true,
              createdDate: new Date(),
              createdByName: '',
            }
          }
          targetWarehouses={warehouses.filter(
            (w) => w.isActive && w.id !== editingMovement.warehouseId,
          )}
          products={products}
          productId={editingMovement.productId}
          initial={{
            quantity: editingMovement.quantity,
            costPrice: editingMovement.costPrice,
            toWarehouseId: editingMovement.toWarehouseId,
          }}
          titleId="WAREHOUSES.REVERSAL_EDIT_TITLE"
          onClose={() => setEditingMovement(null)}
          onSubmit={handleEditSubmit}
        />
      )}
    </Card>
  );
}

export default WarehouseMovementsPage;
