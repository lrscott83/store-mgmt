import { useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Button } from '~/shared/components/ui/button';
import { getStoresWithLocalDek, unwrapStoreDekForStore } from '~/shared/lib/storage/read-store-entities';
import { MultiStoreBackupService, resolveBackupStoreIds } from '~/sync/lib/services/multi-store-backup-service';
import { createStoreSyncServices } from '~/sync/lib/services/store-sync-services-factory';
import { ExportForm } from '~/sync/components/export-form';
import { HotspotShareModal } from '~/sync/components/hotspot-share-modal';
import type { TransferSource } from '~/sync/lib/hotspot/transfer-protocol';

export const clientLoader = featureLoader([EFeatures.Send]);

export function ExportPage() {
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const user = useAuthStore((s) => s.user);
  const intl = useIntl();
  const [sharing, setSharing] = useState(false);

  /**
   * multi-store-backup: an Owner exports every store this device holds a key
   * for, in ONE v3 archive. A single-store user (StoreUser, or an Owner without
   * the MultiStores module) exports exactly the selected store, as before.
   */
  async function buildExportPayload(password: string): Promise<Uint8Array> {
    const storeIds = resolveBackupStoreIds(user, storeId, getStoresWithLocalDek());
    const backup = new MultiStoreBackupService({
      createServices: createStoreSyncServices,
      unwrapDek: unwrapStoreDekForStore,
    });
    return backup.exportStores(storeIds, password);
  }

  function buildExportFileName(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(2);
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());
    return `datos${yy}${mm}${dd}-${hh}${min}.zip`;
  }

  async function handleExport(password: string): Promise<Uint8Array> {
    const payload = await buildExportPayload(password);

    // Delivery: plain download anchor. A `navigator.share`-first delivery
    // breaks the export on desktop, where `navigator.share` exists as a
    // function but file-sharing is unsupported and the call throws.
    const blob = new Blob([payload], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildExportFileName();
    a.click();
    URL.revokeObjectURL(url);

    return payload;
  }

  async function prepareShare(password: string): Promise<TransferSource> {
    return {
      name: buildExportFileName(),
      kind: 'data',
      bytes: await buildExportPayload(password),
    };
  }

  /**
   * Debug export: downloads a plain (unencrypted) JSON with all store data.
   * Only visible to user 'lrscott'.
   */
  async function handleExportPlain() {
    const data = await createStoreSyncServices(storeId).serializer.exportPlainData();

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
    <div className="space-y-4 p-4">
      <ExportForm onExport={handleExport} />
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => setSharing(true)}
          data-testid="hotspot-open-share"
        >
          {intl.formatMessage({ id: 'HOTSPOT.SHARE_TITLE' })}
        </Button>
      </div>
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
      {sharing && <HotspotShareModal prepare={prepareShare} onClose={() => setSharing(false)} />}
    </div>
  );
}

export default ExportPage;
