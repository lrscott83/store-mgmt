import { useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Button } from '~/shared/components/ui/button';
import { getStoresWithLocalDek, unwrapStoreDekForStore } from '~/shared/lib/storage/read-store-entities';
import { importBackupFile } from '~/sync/lib/services/multi-store-backup-service';
import { createStoreSyncServices } from '~/sync/lib/services/store-sync-services-factory';
import { ImportForm } from '~/sync/components/import-form';
import { HotspotReceiveModal } from '~/sync/components/hotspot-receive-modal';
import type { SyncResult } from '~/sync/lib/services/data-synchronizer-service';

export const clientLoader = featureLoader([EFeatures.Receive]);

export function ImportPage() {
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const user = useAuthStore((s) => s.user);
  const intl = useIntl();
  // Payload received over the hotspot: shown pre-selected in the form so the
  // user only types the bundle password. `key` remounts the form when a NEW
  // file arrives, which resets both the selection and the visible file name.
  const [receivedFile, setReceivedFile] = useState<File | null>(null);
  const [receiving, setReceiving] = useState(false);

  /**
   * Reads the file bytes and imports them:
   *
   * - v3 (multi-store): every store in the file that this user may write, each
   *   under its own DEK — an Owner gets all of theirs, a StoreUser only theirs.
   * - v2 and legacy v1 (one store): the unchanged single-store path, so backups
   *   exported before this change still import into their one store.
   *
   * Throws WrongPasswordError / CorruptFileError / WrongStoreError upstream so
   * ImportForm can display the correct error message. No merge runs if the
   * archive cannot be read.
   */
  async function handleImport(file: File, password: string): Promise<SyncResult> {
    const arrayBuffer = await file.arrayBuffer();
    const payload = new Uint8Array(arrayBuffer);

    return importBackupFile({
      payload,
      password,
      user,
      selectedStoreId: storeId,
      createServices: createStoreSyncServices,
      unwrapDek: unwrapStoreDekForStore,
      storesWithLocalDek: getStoresWithLocalDek(),
    });
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => setReceiving(true)}
          data-testid="hotspot-open-receive"
        >
          {intl.formatMessage({ id: 'HOTSPOT.RECEIVE_TITLE' })}
        </Button>
      </div>
      <ImportForm
        key={receivedFile ? `${receivedFile.name}:${receivedFile.size}` : 'manual'}
        onImport={handleImport}
        initialFile={receivedFile}
      />
      {receiving && (
        <HotspotReceiveModal
          onReceived={(file) => {
            setReceivedFile(file);
            setReceiving(false);
          }}
          onClose={() => setReceiving(false)}
        />
      )}
    </div>
  );
}

export default ImportPage;
