import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { InventoryEntry, InventoryEntryView } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { EntryList } from '../components/entry-list';
import { EditInventoryEntryModal } from '../components/edit-inventory-entry-modal';
import type { EditInventoryEntryInput } from '../components/edit-inventory-entry-modal';

export const loader = featureLoader([EFeatures.EntriesHistory]);

function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

export function EntriesPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [range, setRange] = useState(defaultDateRange());
  const [productFilter, setProductFilter] = useState('');
  const [entries, setEntries] = useState<InventoryEntryView[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<InventoryEntry | undefined>();
  const [modalError, setModalError] = useState('');

  function loadEntries() {
    const svc = new InventoryOfflineService(storeId);
    const productSvc = new ProductOfflineService(storeId);
    const products = productSvc.getAll();
    const productMap = new Map(products.map((p) => [p.id, p.name]));
    const all = svc.getAll();
    const from = new Date(range.from);
    const to = new Date(range.to);
    to.setHours(23, 59, 59, 999);
    const filtered = all.filter((e) => e.date >= from && e.date <= to);
    setEntries(
      filtered.map((e) => ({
        ...e,
        productName: productMap.get(e.productId) ?? e.productName,
      })),
    );
  }

  useEffect(() => {
    loadEntries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, range.from, range.to]);

  const displayedEntries = productFilter.trim()
    ? entries.filter((e) =>
        e.productName.toLowerCase().includes(productFilter.toLowerCase()),
      )
    : entries;

  function handleEdit(entry: InventoryEntryView) {
    setEditingEntry({
      id: entry.id,
      productId: entry.productId,
      categoryId: '',
      quantity: entry.quantity,
      available: entry.quantity,
      costPrice: entry.costPrice,
      date: entry.date,
      order: 0,
      isActive: entry.isActive,
      createdDate: new Date(),
      createdByName: '',
      updatedDate: new Date(),
      updatedByName: '',
    });
    setIsModalOpen(true);
    setModalError('');
  }

  function handleDeactivate(entry: InventoryEntryView) {
    const svc = new InventoryOfflineService(storeId);
    try {
      svc.deactivate(entry.id, entry.productId);
      loadEntries();
    } catch (err) {
      console.error(err);
    }
  }

  function handleSave(data: EditInventoryEntryInput, entryId?: string) {
    const svc = new InventoryOfflineService(storeId);
    try {
      if (entryId) {
        svc.update(entryId, data.productId, data.quantity, data.costPrice);
      } else {
        svc.create(data.productId, data.quantity, data.costPrice, data.categoryId, new Date(data.date));
      }
      loadEntries();
      setIsModalOpen(false);
      setEditingEntry(undefined);
      setModalError('');
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : intl.formatMessage({ id: 'GENERAL.ERROR' }),
      );
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'INVENTORY.ENTRIES.TITLE' })}
        </h1>
        <button
          onClick={() => {
            setEditingEntry(undefined);
            setModalError('');
            setIsModalOpen(true);
          }}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {intl.formatMessage({ id: 'INVENTORY.TODAY_ENTRIES.NEW_ENTRY' })}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              {intl.formatMessage({ id: 'ORDERS.DATE_FROM' })}
            </label>
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="rounded border px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              {intl.formatMessage({ id: 'ORDERS.DATE_TO' })}
            </label>
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="rounded border px-2 py-1 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">
            {intl.formatMessage({ id: 'INVENTORY.ENTRY.PRODUCT' })}
          </label>
          <input
            type="text"
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            placeholder={intl.formatMessage({ id: 'GENERAL.SEARCH' })}
            className="rounded border px-2 py-1 text-sm"
          />
        </div>
      </div>

      <EntryList
        entries={displayedEntries}
        onEdit={handleEdit}
        onDeactivate={handleDeactivate}
      />

      <EditInventoryEntryModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEntry(undefined);
        }}
        onSave={handleSave}
        storeId={storeId}
        entry={editingEntry}
        error={modalError}
      />
    </div>
  );
}

export default EntriesPage;
