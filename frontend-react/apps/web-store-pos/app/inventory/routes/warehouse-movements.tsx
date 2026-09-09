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
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { ChevronDownIcon, ArrowInIcon, ArrowOutIcon, SwapHorizontalIcon } from '~/shared/components/ui/icons';
import { formatLocalDate, groupByLocalDay } from '~/shared/lib/date-utils';
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

  /** Icono por tipo de movimiento — mismos iconos que las opciones del gear de
   *  la gestión de almacenes: entrada → ArrowInIcon, salida → ArrowOutIcon,
   *  transferencia → SwapHorizontalIcon. Entrada verde, salida naranja, transferencia azul. */
  const MOVEMENT_TYPE_ICON: Record<WarehouseMovementType, { icon: ReactElement; color: string }> = {
    purchase_in: { icon: <ArrowInIcon />, color: 'text-success' },
    sale_out: { icon: <ArrowOutIcon />, color: 'text-warning' },
    transfer_in: { icon: <SwapHorizontalIcon />, color: 'text-primary' },
    transfer_out: { icon: <SwapHorizontalIcon />, color: 'text-primary' },
  };

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? id;

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
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default WarehouseMovementsPage;
