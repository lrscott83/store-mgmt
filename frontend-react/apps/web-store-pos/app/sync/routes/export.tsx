import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { ProductCategoryOfflineService } from '~/sales/lib/services/product-category-offline-service';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { InventoryRepository } from '~/inventory/lib/repositories/inventory-repository';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import { DataSerializerService } from '~/sync/lib/services/data-serializer-service';
import { ExportForm } from '~/sync/components/export-form';

export const loader = featureLoader([EFeatures.Send]);

export function ExportPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  async function handleExport(password: string): Promise<Uint8Array> {
    const categorySvc = new ProductCategoryOfflineService(storeId);
    const productSvc = new ProductOfflineService(storeId);
    const inventoryRepo = new InventoryRepository(storeId);
    const orderSvc = new OrderOfflineService(storeId);
    const expenseSvc = new ExpenseOfflineService(storeId);
    const creditSvc = new SaleCreditOfflineService(storeId);

    const serializer = new DataSerializerService(
      storeId,
      categorySvc,
      productSvc,
      inventoryRepo,
      orderSvc,
      expenseSvc,
      creditSvc,
    );

    const payload = await serializer.export(password);

    // Delivery: navigator.share when available, plain download fallback
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(2);
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());
    const filename = `datos${yy}${mm}${dd}-${hh}${min}.zip`;

    const blob = new Blob([payload], { type: 'application/zip' });

    if (typeof navigator.share === 'function') {
      const file = new File([blob], filename, { type: 'application/zip' });
      await navigator.share({ files: [file], title: filename });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    return payload;
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'SYNC.EXPORT_TITLE' })}
      </h1>
      <ExportForm onExport={handleExport} />
    </div>
  );
}

export default ExportPage;
