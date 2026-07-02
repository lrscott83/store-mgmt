import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { InventoryEntry, InventoryEntryView } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { InventoryDailyEntries } from '../components/inventory-daily-entries';
import { EditInventoryEntryModal } from '../components/edit-inventory-entry-modal';
import type { EditInventoryEntryInput } from '../components/edit-inventory-entry-modal';

export const clientLoader = featureLoader([EFeatures.Entries]);

export function TodayEntriesPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [entries, setEntries] = useState<InventoryEntryView[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<InventoryEntry | undefined>();
  const [modalError, setModalError] = useState('');

  function loadEntries() {
    const svc = new InventoryOfflineService(storeId);
    const productSvc = new ProductOfflineService(storeId);
    const products = productSvc.getAll();
    const productMap = new Map(products.map((p) => [p.id, p.name]));
    const raw = svc.getByDate(new Date());
    setEntries(
      raw.map((e) => ({ ...e, productName: productMap.get(e.productId) ?? e.productName })),
    );
  }

  useEffect(() => {
    loadEntries();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  function handleEdit(entry: InventoryEntryView) {
    // We need the full InventoryEntry for the modal (has order, available etc.)
    // Re-fetch from service by id
    const svc = new InventoryOfflineService(storeId);
    const all = svc.getAll();
    const found = all.find((e) => e.id === entry.id);
    if (found) {
      // InventoryEntryView has different shape; reconstruct minimal InventoryEntry
      setEditingEntry({
        id: entry.id,
        productId: entry.productId,
        categoryId: '',
        quantity: entry.quantity,
        available: entry.quantity, // conservative — user cannot know sold amount from view
        costPrice: entry.costPrice,
        date: entry.date,
        order: 0,
        isActive: entry.isActive,
        createdDate: new Date(),
        createdByName: '',
        updatedDate: new Date(),
        updatedByName: '',
      });
    }
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
        err instanceof Error
          ? err.message
          : intl.formatMessage({ id: 'GENERAL.ERROR' }),
      );
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {intl.formatMessage({ id: 'INVENTORY.TODAY_ENTRIES.TITLE' })}
        </h1>
        <button
          onClick={() => {
            setEditingEntry(undefined);
            setModalError('');
            setIsModalOpen(true);
          }}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {/* Angular parity: today-entries.component.html:9 uses GENERAL.ENTRY ('Entrada'),
              not a bespoke "Nueva entrada" label. */}
          {intl.formatMessage({ id: 'GENERAL.ENTRY' })}
        </button>
      </div>

      <InventoryDailyEntries
        entries={entries}
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

export default TodayEntriesPage;
