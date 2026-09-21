import { useEffect, useMemo, useState } from 'react';
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
import {
  ArrowInIcon,
  ArrowOutIcon,
  ChevronDownIcon,
  SwapHorizontalIcon,
} from '~/shared/components/ui/icons';
import { formatLocalDate, groupByLocalDay } from '~/shared/lib/date-utils';
import { formatCurrency } from '~/shared/lib/format-currency';
import { WarehouseOfflineService } from '../lib/services/warehouse-offline-service';
import type { PurchasePropagationPreview } from '../lib/services/warehouse-offline-service';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { WarehouseMovementModal } from '../components/warehouse-movement-modal';
import type { WarehouseMovementFields, WarehouseMovementMode } from '../components/warehouse-movement-modal';
import { remainingPurchaseUnits } from '../lib/warehouse';
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
  // Elaboración (módulo 17): insumo consumido y terminado producido.
  consumption_out: 'WAREHOUSES.TYPE_CONSUMPTION_OUT',
  elaboration_in: 'WAREHOUSES.TYPE_ELABORATION_IN',
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
            // Fase 3: propagación de costo a las ventas activas.
            new OrderOfflineService(storeId),
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

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;
  const storeName = (id?: string) =>
    user?.storeList?.find((s) => s.id === id)?.name ??
    user?.roles?.find((r) => r.storeId === id)?.storeName ??
    id;

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
      title: intl.formatMessage({ id: 'WAREHOUSES.DELETE_MOVEMENT_TITLE' }),
      message: intl.formatMessage(
        { id: 'WAREHOUSES.DELETE_MOVEMENT_CONFIRM' },
        {
          product: productName(movement.productId),
          quantity: movement.quantity,
          warehouse: warehouseName(movement.warehouseId),
        },
      ),
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
  /**
   * A9d: error del PASO 2 (recreación) mostrado inline dentro del modal. El paso
   * 1 (reversa) ya quedó persistido, así que cerrar el modal perdería el trabajo
   * del usuario sin explicar nada; el mensaje se limpia al reintentar.
   */
  const [editError, setEditError] = useState<string | null>(null);
  /**
   * Reversa ya aplicada para la edición en curso. Sin esta bandera, un reintento
   * revertiría OTRA VEZ y descontaría stock dos veces.
   */
  const [editReversed, setEditReversed] = useState(false);

  /**
   * A1: tope editable de la compra — lo que QUEDA de su lote, congelado al abrir
   * el modal. Se congela porque la reversa modifica el propio nivel: recalcularlo
   * tras el paso 1 daría 0 y el reintento quedaría bloqueado por el modal.
   */
  const editMaxQuantity = useMemo(() => {
    if (!editingMovement || !service || editingMovement.type !== 'purchase_in') return undefined;
    const level = service.getStockLevel(editingMovement.warehouseId, editingMovement.productId);
    return remainingPurchaseUnits(level, editingMovement);
  }, [editingMovement, service]);

  /** Fase 3: una compra sin remanente en almacén solo corrige el costo de lo vendido. */
  const editCostOnly = editMaxQuantity === 0;

  /**
   * Valores precargados de edición. Memoizado: el modal reinicia su formulario
   * cuando cambia la identidad de `initial`, y un literal inline la cambiaba en
   * cada render.
   */
  const editInitial = useMemo(() => {
    if (!editingMovement) return null;
    return {
      // A1: precargar el ORIGINAL en una compra recrearía de más (unidades
      // fantasma); el punto de partida correcto es lo que queda del lote.
      quantity:
        editingMovement.type === 'purchase_in' && editMaxQuantity !== undefined
          ? editMaxQuantity
          : editingMovement.quantity,
      costPrice: editingMovement.costPrice,
      toWarehouseId: editingMovement.toWarehouseId,
    };
  }, [editingMovement, editMaxQuantity]);

  function openEdit(movement: WarehouseStockMovement) {
    setEditingMovement(movement);
    setEditError(null);
    setEditReversed(false);
  }

  function closeEdit() {
    setEditingMovement(null);
    setEditError(null);
    setEditReversed(false);
  }

  /**
   * Fase 3: al editar una COMPRA el costo se propaga a las ventas ya hechas y al
   * stock en tienda, de forma ATÓMICA (`applyPurchaseCostEdit`). Si hay unidades
   * fuera del almacén, se confirma con detalle antes de aplicar. Las salidas y
   * transferencias conservan el flujo reversa + recreación por pasos.
   */
  function handleEditSubmit(fields: WarehouseMovementFields) {
    if (!service || !editingMovement) return;
    const original = editingMovement;
    setEditError(null);

    if (original.type === 'purchase_in') {
      void applyPurchaseCostEdit(original, fields);
      return;
    }

    if (!editReversed) {
      const reversal = service.reverseMovement(original.id);
      if (!reversal.succeeded) {
        showBlockingError(
          intl.formatMessage({ id: 'GENERAL.ERROR' }),
          reversal.errors[0]?.description ?? '',
        );
        return;
      }
      setEditReversed(true);
    }

    const recreated = service.recordMovement({
      type: original.type as WarehouseMovementMode,
      warehouseId: original.warehouseId,
      productId: original.productId,
      quantity: fields.quantity,
      costPrice: fields.costPrice,
      toWarehouseId: fields.toWarehouseId ?? original.toWarehouseId,
      toStoreId: original.toStoreId,
      reason: fields.reason,
    });
    if (!recreated.succeeded) {
      // La reversa quedó huérfana (no-atómico, §7.3): el error guía al usuario
      // sin cerrar el modal. NO se recarga aquí — `load()` reemplaza `movements`
      // y regenera la compra original como fila vieja, lo que dejaría el modal
      // apuntando a datos obsoletos en pleno reintento.
      setEditError(recreated.errors[0]?.description ?? '');
      return;
    }

    closeEdit();
    showToastSuccess(intl.formatMessage({ id: 'WAREHOUSES.MOVEMENT_UPDATED' }));
    load();
  }

  /** Detalle de la confirmación de propagación (Fase 3). */
  function propagationMessage(preview: PurchasePropagationPreview): string {
    const base = intl.formatMessage(
      { id: 'WAREHOUSES.PROPAGATION_CONFIRM' },
      {
        soldUnits: preview.soldUnits,
        sales: preview.activeOrders,
        storeUnits: preview.storeUnits,
        from: formatCurrency(preview.from),
        to: formatCurrency(preview.to),
      },
    );
    if (preview.deactivatedOrders > 0) {
      return `${base} ${intl.formatMessage(
        { id: 'WAREHOUSES.PROPAGATION_LEFT_OUT' },
        { count: preview.deactivatedOrders },
      )}`;
    }
    return base;
  }

  async function applyPurchaseCostEdit(
    original: WarehouseStockMovement,
    fields: WarehouseMovementFields,
  ) {
    if (!service) return;
    const newCostPrice = fields.costPrice ?? original.costPrice ?? 0;

    const preview = service.getPurchasePropagationPreview(original.id, newCostPrice);
    if (!preview.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        preview.errors[0]?.description ?? '',
      );
      return;
    }
    if (preview.data!.hasOutflow) {
      const confirmed = await confirmDialog({
        title: intl.formatMessage({ id: 'WAREHOUSES.PROPAGATION_TITLE' }),
        message: propagationMessage(preview.data!),
        confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
        cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
      });
      if (!confirmed) return;
    }

    const result = service.applyPurchaseCostEdit(original.id, fields.quantity, newCostPrice);
    if (!result.succeeded) {
      setEditError(result.errors[0]?.description ?? '');
      return;
    }

    closeEdit();
    showToastSuccess(intl.formatMessage({ id: 'WAREHOUSES.MOVEMENT_UPDATED' }));
    load();
  }

  const movementRoute = (movement: WarehouseStockMovement): string => {
    switch (movement.type) {
      case 'purchase_in':
        return `${intl.formatMessage({ id: 'WAREHOUSES.COMPRA' })} → ${warehouseName(movement.warehouseId)}`;
      case 'sale_out': {
        const dest = storeName(movement.toStoreId);
        return dest ? `${warehouseName(movement.warehouseId)} → ${dest}` : warehouseName(movement.warehouseId);
      }
      case 'transfer_out':
        return `${warehouseName(movement.warehouseId)} → ${warehouseName(movement.toWarehouseId ?? '')}`;
      case 'transfer_in':
        return `${warehouseName(movement.fromWarehouseId ?? '')} → ${warehouseName(movement.warehouseId)}`;
      default:
        // reversal: mantener el rendering actual (solo almacén + campos presentes).
        return [
          warehouseName(movement.warehouseId),
          movement.toWarehouseId ? ` → ${warehouseName(movement.toWarehouseId)}` : '',
          movement.fromWarehouseId ? ` ← ${warehouseName(movement.fromWarehouseId)}` : '',
        ].join('');
    }
  };

  return (
    <Card padding="tight">
      <h1 className="mb-4 text-xl font-bold text-text">
        {intl.formatMessage({ id: 'MENU.WAREHOUSE_MOVEMENTS' })}
      </h1>

      {movementDayGroups.length === 0 && (
        <InfoBox variant="primary" className="text-center">
          {intl.formatMessage({ id: 'WAREHOUSES.NO_MOVEMENTS' })}
        </InfoBox>
      )}
      {/* Acordeón agrupado por día — mismo patrón que los historiales de
          Entradas y Créditos: panel por día con la fecha en el header y, al
          desplegar, un bloque compacto de 3 filas por movimiento (producto y
          cantidad; tipo/importe; ruta). */}
      <div className="space-y-2">
        {movementDayGroups.map((dayGroup) => {
          const dayKey = dayGroup.dayKey;
          const isDayExpanded = expandedMovementDays.has(dayKey);
          return (
            <div key={dayKey} className="rounded-lg border border-border bg-background">
              <button
                type="button"
                onClick={() => toggleMovementDay(dayKey)}
                className="flex w-full items-center justify-between gap-4 px-3 py-3 text-left"
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
                  {dayGroup.items.map((movement) => {
                    const isPurchase = movement.type === 'purchase_in';
                    return (
                      <div key={movement.id} className="flex flex-col gap-1 px-3 py-2">
                        {/* Fila 1: producto · (cantidad) · badge Revertido · engranaje. */}
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm text-text">
                            {productName(movement.productId)}
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-text">
                            (
                            <span data-testid={`mv-qty-${movement.id}`}>
                              {movement.quantity}
                            </span>
                            )
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

                        {/* Fila 2: tipo — compra con total; salida ←; transferencia/reversa ⇄
                            (mismo lenguaje que el gear de Almacenes; reversa violeta F5). */}
                        <div className="flex items-center justify-between gap-2 text-sm">
                          {isPurchase ? (
                            <>
                              <span className="font-medium text-text">
                                {intl.formatMessage({ id: 'WAREHOUSES.COMPRA' })}
                              </span>
                              {movement.costPrice != null && (
                                <span className="shrink-0 text-sm font-semibold text-text">
                                  {formatCurrency(movement.quantity * movement.costPrice)}
                                </span>
                              )}
                            </>
                          ) : (
                            <span
                              data-testid={`mv-type-icon-${movement.id}`}
                              className={
                                movement.type === 'reversal' ? 'text-violet-600' : 'text-primary'
                              }
                              title={intl.formatMessage({ id: MOVEMENT_TYPE_LABEL[movement.type] })}
                            >
                              {movement.type === 'sale_out' ? (
                                <ArrowOutIcon />
                              ) : (
                                <SwapHorizontalIcon />
                              )}
                            </span>
                          )}
                        </div>

                        {/* Fila 3: ruta — compra -> almacén; resto, la ruta existente. */}
                        <div className="flex items-center gap-1 text-xs text-text-muted">
                          {isPurchase ? (
                            <>
                              <ArrowInIcon className="text-primary" />
                              <span className="min-w-0 truncate">
                                {warehouseName(movement.warehouseId)}
                              </span>
                            </>
                          ) : (
                            <span className="min-w-0 truncate">{movementRoute(movement)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
          initial={editInitial}
          titleId="WAREHOUSES.REVERSAL_EDIT_TITLE"
          maxQuantity={editMaxQuantity}
          costOnly={editCostOnly}
          errorMessage={editError}
          onClose={closeEdit}
          onSubmit={handleEditSubmit}
        />
      )}
    </Card>
  );
}

export default WarehouseMovementsPage;
