import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import { ExchangeRateOfflineService } from '~/management/exchange-rates/lib/services/exchange-rate-offline-service';
import { WarehouseOfflineService } from '~/inventory/lib/services/warehouse-offline-service';
import { DataSerializerService } from '~/sync/lib/services/data-serializer-service';
import { ExportForm } from '~/sync/components/export-form';

export const clientLoader = featureLoader([EFeatures.Send]);

export function ExportPage() {
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const user = useAuthStore((s) => s.user);

  async function handleExport(password: string): Promise<Uint8Array> {
    // Categories/products are read via the repositories directly (Angular
    // parity, Flag #2 — raw stored-JSON pass-through), not the offline services.
    // Inventory's read side goes through InventoryOfflineService.getInventoryEntriesJson()
    // (rule 12 — InventoryRepository has no Angular correlate, deleted).
    const categoryRepo = new ProductCategoryRepository(storeId);
    const productRepo = new ProductRepository(storeId, categoryRepo);
    const inventorySvc = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    const orderSvc = new OrderOfflineService(storeId);
    const expenseSvc = new ExpenseOfflineService(storeId);
    const creditSvc = new SaleCreditOfflineService(storeId);
    const exchangeRateSvc = new ExchangeRateOfflineService(storeId);
    const warehouseSvc = new WarehouseOfflineService(storeId, productRepo, inventorySvc);

    const serializer = new DataSerializerService(
      storeId,
      categoryRepo,
      productRepo,
      inventorySvc,
      orderSvc,
      expenseSvc,
      creditSvc,
      exchangeRateSvc,
      warehouseSvc,
    );

    const payload = await serializer.export(password);

    // Delivery: plain download anchor, matching Angular's `serializeEncryptedZip`
    // (data-serializer.service.ts:68-73) 1:1. Angular's export path NEVER uses
    // `navigator.share` — that lives only in the separate `shareData()` action
    // (send-data.component.ts:37), which shares products.json, not the backup zip.
    // A `navigator.share`-first delivery breaks the export on desktop, where
    // `navigator.share` exists as a function but file-sharing is unsupported and
    // the call throws.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(2);
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());
    const filename = `datos${yy}${mm}${dd}-${hh}${min}.zip`;

    const blob = new Blob([payload], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    return payload;
  }

  /**
   * Debug export: downloads a plain (unencrypted) JSON with all store data.
   * Only visible to user 'lrscott'.
   */
  async function handleExportPlain() {
    const categoryRepo = new ProductCategoryRepository(storeId);
    const productRepo = new ProductRepository(storeId, categoryRepo);
    const inventorySvc = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    const orderSvc = new OrderOfflineService(storeId);
    const expenseSvc = new ExpenseOfflineService(storeId);
    const creditSvc = new SaleCreditOfflineService(storeId);
    const exchangeRateSvc = new ExchangeRateOfflineService(storeId);
    const warehouseSvc = new WarehouseOfflineService(storeId, productRepo, inventorySvc);

    const serializer = new DataSerializerService(
      storeId,
      categoryRepo,
      productRepo,
      inventorySvc,
      orderSvc,
      expenseSvc,
      creditSvc,
      exchangeRateSvc,
      warehouseSvc,
    );

    const data = await serializer.exportPlainData();

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(2);
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());
    a.download = `datos-plano-${yy}${mm}${dd}-${hh}${min}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4">
      <ExportForm onExport={handleExport} />
      {user?.login === 'lrscott' && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <button
            onClick={handleExportPlain}
            className="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Exportar datos planos (debug)
          </button>
          <p className="mt-1 text-xs text-gray-500">
            Descarga un JSON sin cifrar con todos los datos de la tienda. Solo visible para lrscott.
          </p>
        </div>
      )}
    </div>
  );
}

export default ExportPage;
