import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
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
import { ActionMenu, ActionMenuItem } from '~/shared/components/ui/action-menu';
import { ConfirmDialog } from '~/shared/components/ui/confirm-dialog';
import {
  ArrowInIcon,
  ArrowOutIcon,
  ChevronDownIcon,
  SwapHorizontalIcon,
} from '~/shared/components/ui/icons';
import { useClickOutside } from '~/shared/lib/hooks/use-click-outside';
import { formatLocalDate, groupByLocalDay } from '~/shared/lib/date-utils';
import { formatCurrency } from '~/shared/lib/format-currency';
import { WarehouseOfflineService } from '../lib/services/warehouse-offline-service';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
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
};

/**
 * Movimientos de almacén — vista dedicada (antes vivía dentro del CRUD de
 * Almacenes): historial global de todos los almacenes, agrupado por días en
 * acordeón (mismo patrón que Entradas y Créditos). Cada movimiento se
 * representa como un card compacto de 3 filas:
 * 1) producto + cantidad entre paréntesis + gear (Editar/Eliminar, visual)
 * 2) tipo de operación (icono de salida para salidas; texto "Compra" con el
 *    precio a la derecha en compras)
 * 3) el almacén implicado, con flecha de entrada en las entradas.
 */
export function WarehouseMovementsPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [movements, setMovements] = useState<WarehouseStockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockLevels, setStockLevels] = useState<WarehouseStockLevel[]>([]);
  /** Días expandidos del historial (acordeón agrupado por día). */
  const [expandedMovementDays, setExpandedMovementDays] = useState<Set<string>>(new Set());
  /** Movimiento cuyo popup de edición (solo visual) está abierto. */
  const [editingMovement, setEditingMovement] = useState<WarehouseStockMovement | null>(null);
  /** Movimiento cuyo popup de confirmación de borrado (solo visual) está abierto. */
  const [deletingMovement, setDeletingMovement] = useState<WarehouseStockMovement | null>(null);

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
    setStockLevels([...service.getStorageStockLevels()]);
    const productRepo = new ProductRepository(storeId, new ProductCategoryRepository(storeId));
    setProducts([...productRepo.getStorageProductsMap().values()] as Product[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads storeId/service only
  }, [service]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;

  /** Importe mostrado en compras: costPrice del propio movimiento (costo real
   *  de la compra, persistido desde el cambio de "movimientos sin cambio de
   *  costo") × cantidad; fallback al costo promedio del nivel para movimientos
   *  creados antes de que el costo se persistiera. */
  const purchasePrice = (movement: WarehouseStockMovement): string | null => {
    const unitCost = movement.costPrice ?? stockLevels.find(
      (l) => l.warehouseId === movement.warehouseId && l.productId === movement.productId,
    )?.costPrice;
    if (!unitCost) return null;
    return formatCurrency(unitCost * movement.quantity);
  };

  /** Línea de almacén(s) del movimiento. */
  const warehouseLine = (movement: WarehouseStockMovement): string => {
    if (movement.type === 'transfer_out' && movement.toWarehouseId) {
      return `${warehouseName(movement.warehouseId)} → ${warehouseName(movement.toWarehouseId)}`;
    }
    return warehouseName(movement.warehouseId);
  };

  /** Historial agrupado por día (más reciente primero). */
  const movementDayGroups = useMemo(
    () => groupByLocalDay(movements, (m) => new Date(m.createdDate)),
    [movements],
  );

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
          desplegar, los cards de movimientos. */}
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
                <div className="space-y-1.5 p-2">
                  {dayGroup.items.map((movement) => (
                    <MovementCard
                      key={movement.id}
                      movement={movement}
                      productName={productName(movement.productId)}
                      warehouseLine={warehouseLine(movement)}
                      price={purchasePrice(movement)}
                      onEdit={() => setEditingMovement(movement)}
                      onDelete={() => setDeletingMovement(movement)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Popup de edición — SOLO VISUAL: muestra los datos del movimiento según
          su tipo; el botón Guardar cierra sin persistir nada (sin implementar). */}
      {editingMovement && (
        <MovementEditDialog
          movement={editingMovement}
          productName={productName(editingMovement.productId)}
          warehouseName={warehouseName(editingMovement.warehouseId)}
          destinationName={
            editingMovement.toWarehouseId
              ? warehouseName(editingMovement.toWarehouseId)
              : editingMovement.fromWarehouseId
                ? warehouseName(editingMovement.fromWarehouseId)
                : null
          }
          onClose={() => setEditingMovement(null)}
        />
      )}

      {/* Popup de confirmación de borrado — SOLO VISUAL: muestra los datos del
          movimiento; Confirmar solo cierra (sin implementar). */}
      <ConfirmDialog
        open={deletingMovement !== null}
        onClose={() => setDeletingMovement(null)}
        onConfirm={() => setDeletingMovement(null)}
        confirmLabel={intl.formatMessage({ id: 'GENERAL.DELETE' })}
        title={intl.formatMessage({ id: 'WAREHOUSES.DELETE_MOVEMENT_TITLE' })}
        description={
          deletingMovement
            ? intl.formatMessage(
                { id: 'WAREHOUSES.DELETE_MOVEMENT_CONFIRM' },
                {
                  product: productName(deletingMovement.productId),
                  quantity: deletingMovement.quantity,
                  warehouse: warehouseName(deletingMovement.warehouseId),
                },
              )
            : undefined
        }
      />
    </Card>
  );
}

/** Icono por tipo de movimiento — mismos iconos que las opciones del gear de
 *  la gestión de almacenes: entrada → ArrowInIcon, salida → ArrowOutIcon,
 *  transferencia → SwapHorizontalIcon. Entrada verde, salida naranja,
 *  transferencia azul. */
const MOVEMENT_TYPE_ICON: Record<WarehouseMovementType, { icon: ReactElement; color: string }> = {
  purchase_in: { icon: <ArrowInIcon />, color: 'text-success' },
  sale_out: { icon: <ArrowOutIcon />, color: 'text-warning' },
  transfer_in: { icon: <SwapHorizontalIcon />, color: 'text-primary' },
  transfer_out: { icon: <SwapHorizontalIcon />, color: 'text-primary' },
};

interface MovementCardProps {
  movement: WarehouseStockMovement;
  productName: string;
  warehouseLine: string;
  price: string | null;
  onEdit: () => void;
  onDelete: () => void;
}

/** Card compacto de un movimiento (3 filas: producto+cantidad+gear, tipo,
 *  almacén). Editar/Eliminar son SOLO visuales (popups sin lógica). */
function MovementCard({
  movement,
  productName,
  warehouseLine,
  price,
  onEdit,
  onDelete,
}: MovementCardProps) {
  const intl = useIntl();
  const isEntry = movement.type === 'purchase_in' || movement.type === 'transfer_in';
  const isPurchase = movement.type === 'purchase_in';
  const typeIcon = MOVEMENT_TYPE_ICON[movement.type];
  const typeLabel = intl.formatMessage({ id: MOVEMENT_TYPE_LABEL[movement.type] });

  return (
    <div
      data-testid={`mv-card-${movement.id}`}
      className="rounded-lg border border-border bg-surface px-2.5 py-1.5"
    >
      {/* Fila 1: producto + cantidad (paréntesis) + gear */}
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
          {productName}
        </span>
        <span
          data-testid={`mv-qty-${movement.id}`}
          className="shrink-0 text-sm font-semibold text-text"
        >
          ({movement.quantity})
        </span>
        <ActionMenu testId={`mv-actions-${movement.id}`} widthClass="min-w-40">
          <ActionMenuItem
            intent="edit"
            data-testid={`mv-edit-${movement.id}`}
            onClick={onEdit}
          >
            {intl.formatMessage({ id: 'GENERAL.EDIT' })}
          </ActionMenuItem>
          <ActionMenuItem
            intent="delete"
            separatorBefore
            data-testid={`mv-delete-${movement.id}`}
            onClick={onDelete}
          >
            {intl.formatMessage({ id: 'GENERAL.DELETE' })}
          </ActionMenuItem>
        </ActionMenu>
      </div>

      {/* Fila 2: tipo de operación; en compras, "Compra" + precio a la derecha */}
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
          <span
            data-testid={`mv-type-icon-${movement.id}`}
            className={`shrink-0 ${typeIcon.color}`}
            title={typeLabel}
          >
            {typeIcon.icon}
          </span>
          <span className="truncate">
            {isPurchase
              ? intl.formatMessage({ id: 'WAREHOUSES.COMPRA' })
              : typeLabel}
          </span>
        </span>
        {isPurchase && price && (
          <span
            data-testid={`mv-price-${movement.id}`}
            className="shrink-0 text-xs font-semibold text-text"
          >
            {price}
          </span>
        )}
      </div>

      {/* Fila 3: almacén implicado; flecha de entrada en las entradas */}
      <div className="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
        {isEntry && <ArrowInIcon className="size-3.5 shrink-0" />}
        <span className="truncate">{warehouseLine}</span>
      </div>
    </div>
  );
}

interface MovementEditDialogProps {
  movement: WarehouseStockMovement;
  productName: string;
  warehouseName: string;
  destinationName: string | null;
  onClose: () => void;
}

/** Popup de edición de movimiento — SOLO VISUAL: muestra los campos según el
 *  tipo del movimiento (producto, cantidad, almacenes, motivo). El botón
 *  Guardar no persiste nada; la edición real no está implementada. */
function MovementEditDialog({
  movement,
  productName,
  warehouseName,
  destinationName,
  onClose,
}: MovementEditDialogProps) {
  const intl = useIntl();
  const dialogRef = useRef<HTMLDivElement>(null);

  useClickOutside(dialogRef, onClose);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const typeLabel = intl.formatMessage({ id: MOVEMENT_TYPE_LABEL[movement.type] });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mv-edit-dialog-title"
    >
      <div ref={dialogRef} className="bg-surface rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <h2 id="mv-edit-dialog-title" className="text-lg font-semibold mb-4">
          {intl.formatMessage({ id: 'WAREHOUSES.EDIT_MOVEMENT' })}
        </h2>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-xs text-text-muted">
              {intl.formatMessage({ id: 'WAREHOUSES.PRODUCT' })}
            </span>
            <div className="font-medium text-text">{productName}</div>
          </div>
          <div>
            <span className="text-xs text-text-muted">
              {intl.formatMessage({ id: 'WAREHOUSES.QUANTITY' })}
            </span>
            <div className="font-semibold text-text">({movement.quantity})</div>
          </div>
          <div>
            <span className="text-xs text-text-muted">
              {intl.formatMessage({ id: 'WAREHOUSES.TYPE' })}
            </span>
            <div className="font-medium text-text">{typeLabel}</div>
          </div>
          <div>
            <span className="text-xs text-text-muted">
              {intl.formatMessage({ id: 'WAREHOUSES.NAME' })}
            </span>
            <div className="font-medium text-text">{warehouseName}</div>
          </div>
          {destinationName && (
            <div>
              <span className="text-xs text-text-muted">
                {intl.formatMessage({ id: 'WAREHOUSES.TO_WAREHOUSE' })}
              </span>
              <div className="font-medium text-text">{destinationName}</div>
            </div>
          )}
          <div>
            <span className="text-xs text-text-muted">
              {intl.formatMessage({ id: 'WAREHOUSES.REASON' })}
            </span>
            <div className="font-medium text-text">{movement.reason ?? '—'}</div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-surface-hover transition-colors"
          >
            {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
          </button>
          <button
            type="button"
            onClick={onClose}
            data-testid="mv-edit-dialog-save"
            className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            {intl.formatMessage({ id: 'WAREHOUSES.SAVE' })}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WarehouseMovementsPage;