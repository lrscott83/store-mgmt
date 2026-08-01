import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { InventoryEntry, InventoryEntryView } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { isOwnerAdmin as checkIsOwnerAdmin } from '~/shared/lib/auth/authorization-service';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon } from '~/shared/components/ui/icons';
import { confirmDialog, showBlockingError } from '~/shared/lib/blocking-alert';
import { EntryList } from '../components/entry-list';
import { EditInventoryEntryModal } from '../components/edit-inventory-entry-modal';
import type { EditInventoryEntryInput } from '../components/edit-inventory-entry-modal';

export const clientLoader = featureLoader([EFeatures.Entries]);

export function TodayEntriesPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const user = useAuthStore((s) => s.user);
  // Angular parity: today-entries.component.html:24 renders <app-entry-list
  // [readOnly]="false">, which gates cost price + edit/delete behind isOwnerAdmin().
  const isOwnerAdmin = user ? checkIsOwnerAdmin(user) : false;
  const [entries, setEntries] = useState<InventoryEntryView[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<InventoryEntry | undefined>();
  const [modalError, setModalError] = useState('');

  function loadEntries() {
    const productRepository = new ProductRepository(storeId, new ProductCategoryRepository(storeId));
    const svc = new InventoryOfflineService(storeId, productRepository);
    const products = [...productRepository.getStorageProductsMap().values()];
    const productMap = new Map(products.map((p) => [p.id, p.name]));
    // WU3 (category B): getInventoryEntriesInDay now returns BaseResponseModel<InventoryEntryView[]>
    // (was a bare array) — unwrap `.data`. Fase 4: renamed from getByDate (the date arg is
    // ignored — always returns today, Angular parity).
    const response = svc.getInventoryEntriesInDay(new Date());
    // InventoryOfflineService.getInventoryEntriesInDay is a sync local-storage read that
    // never actually fails; this guard exists for the type only.
    if (!response.succeeded) return;
    setEntries(
      response.data.map((e: InventoryEntryView) => ({ ...e, productName: productMap.get(e.productId) ?? e.productName })),
    );
  }

  useEffect(() => {
    loadEntries();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadEntries reads only storeId
  }, [storeId]);

  function handleEdit(entry: InventoryEntryView) {
    // We need the full InventoryEntry for the modal (has order, available etc.)
    // Re-fetch from service by id
    const svc = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    const all = svc.getActiveInventoryEntriesStorage();
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

  // WU2 (service-return-shape-parity Slice 1): deactivate() now returns Result (never
  // throws) — check `.succeeded` instead of try/catch. Fase 4: renamed to
  // deleteInventoryEntry(productId, entryId) — Angular-exact param order.
  // Angular parity (entry-list.component.ts:57-94, onDeleteInventoryEntry): (1) isNotSoldEntry
  // is checked FIRST — on failure, a blocking error Swal (GENERAL.ERROR + the guard's own
  // description) and no confirm dialog; (2) otherwise a confirmDialog Swal
  // (GENERAL.DELETE_CONFIRM_TITLE/MESSAGE_A with {name: INVENTORY_ENTRY.TEXT}); (3) on
  // confirm, deleteInventoryEntry — on failure, a second blocking error Swal.
  async function handleDeactivate(entry: InventoryEntryView) {
    const svc = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );

    const soldEntryResult = svc.isNotSoldEntry(entry.productId, entry.id);
    if (!soldEntryResult.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        soldEntryResult.errors[0]?.description ?? '',
      );
      return;
    }

    const confirmed = await confirmDialog({
      title: intl.formatMessage({ id: 'GENERAL.DELETE_CONFIRM_TITLE' }),
      message: intl.formatMessage(
        { id: 'GENERAL.DELETE_CONFIRM_MESSAGE_A' },
        { name: intl.formatMessage({ id: 'INVENTORY_ENTRY.TEXT' }) },
      ),
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;

    const result = svc.deleteInventoryEntry(entry.productId, entry.id);
    if (!result.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        result.errors[0]?.description ?? '',
      );
      return;
    }
    loadEntries();
  }

  // WU2 (service-return-shape-parity Slice 1): create()/update() now return
  // DataResult<InventoryEntryView> (never throw) — check `.succeeded` instead of try/catch.
  // Fase 4 (GATE-A): createInventoryEntry(productId, quantity, costPrice) derives categoryId/date
  // internally — the create-form's date field is now vestigial for create (Angular parity: a
  // new entry always stamps "now", no user-supplied backdating).
  function handleSave(data: EditInventoryEntryInput, entryId?: string) {
    const svc = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    const result = entryId
      ? svc.update(entryId, data.productId, data.quantity, data.costPrice)
      : svc.createInventoryEntry(data.productId, data.quantity, data.costPrice);

    // create() returns null (Angular parity) when the product does not exist; treat as a
    // generic failure since there is no DataResult envelope in that branch.
    if (!result || !result.succeeded) {
      setModalError(
        result?.errors[0]?.description ?? intl.formatMessage({ id: 'GENERAL.ERROR' }),
      );
      return;
    }

    loadEntries();
    setIsModalOpen(false);
    setEditingEntry(undefined);
    setModalError('');
  }

  return (
    <Card
      padding="tight"
      title={
        <div className="flex items-center justify-between">
          <span>{intl.formatMessage({ id: 'INVENTORY.TODAY_ENTRIES.TITLE' })}</span>
          {/* Angular parity: today-entries.component.html:7-10 `mat-fab extended` with an
              `add` icon + GENERAL.ENTRY label ('Entrada'), not the previous hardcoded
              bg-blue-600 rectangle / bespoke "Nueva entrada" copy. */}
          <Button
            variant="fab"
            onClick={() => {
              setEditingEntry(undefined);
              setModalError('');
              setIsModalOpen(true);
            }}
          >
            <PlusIcon />
            {intl.formatMessage({ id: 'GENERAL.ENTRY' })}
          </Button>
        </div>
      }
    >
      {/* Angular parity (today-entries.component.html:18-20): the parent owns the empty state
          with the entry-specific message, rather than falling through to EntryList's generic
          product-oriented empty text. */}
      {entries.length === 0 ? (
        <InfoBox variant="primary" className="text-center">
          {intl.formatMessage({ id: 'INVENTORY_ENTRY.NO_ENTRY_FOUND_IN_DAY' })}
        </InfoBox>
      ) : (
        <EntryList
          entries={entries}
          onEdit={handleEdit}
          onDeactivate={handleDeactivate}
          readOnly={false}
          isOwnerAdmin={isOwnerAdmin}
        />
      )}

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
    </Card>
  );
}

export default TodayEntriesPage;
