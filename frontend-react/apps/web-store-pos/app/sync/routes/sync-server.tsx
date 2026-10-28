import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { ConfirmDialog } from '~/shared/components/ui/confirm-dialog';
import { InfoBox } from '~/shared/components/ui/info-box';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import { withStoreDek } from '~/shared/lib/storage/data-key-store';
import {
  getStoresWithLocalDek,
  unwrapStoreDekForStore,
} from '~/shared/lib/storage/read-store-entities';
import { importBackupFile, resolveBackupStoreIds } from '~/sync/lib/services/multi-store-backup-service';
import { createStoreSyncServices } from '~/sync/lib/services/store-sync-services-factory';
import {
  deleteStoreSyncFile,
  downloadStoreSyncFile,
  listStoreSyncFiles,
  uploadStoreBackups,
} from '~/sync/lib/services/store-sync-file-http-service';
import type {
  StoreSyncFileDto,
  StoreSyncFileUploadResult,
} from '~/sync/lib/services/store-sync-file-http-service';
import type { SyncResult } from '~/sync/lib/services/data-synchronizer-service';
import { SyncServerDownloadDialog } from '~/sync/components/sync-server-download-dialog';
import { SyncServerFileList } from '~/sync/components/sync-server-file-list';
import { SyncServerUploadForm } from '~/sync/components/sync-server-upload-form';

/**
 * The repository is usable by whoever can SEND or RECEIVE a backup: uploading
 * needs Send, downloading+importing needs Receive. `isUserAuthorized` matches
 * ANY of the given feature ids, so the array expresses "Send OR Receive" (S9).
 */
export const clientLoader = featureLoader([EFeatures.Send, EFeatures.Receive]);

/** Newest first. The server orders too; this keeps the table correct regardless. */
export function sortStoreSyncFilesNewestFirst(files: StoreSyncFileDto[]): StoreSyncFileDto[] {
  const time = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  return [...files].sort((left, right) => time(right.createdAt) - time(left.createdAt));
}

export function SyncServerPage() {
  const intl = useIntl();
  const user = useAuthStore((state) => state.user);
  const selectedStoreId = useAuthStore((state) => state.user?.selectedStoreId ?? '');

  const [files, setFiles] = useState<StoreSyncFileDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [importTarget, setImportTarget] = useState<StoreSyncFileDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoreSyncFileDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const envelope = await listStoreSyncFiles();
      if (envelope.succeeded) {
        setFiles(sortStoreSyncFilesNewestFirst(envelope.data ?? []));
      } else {
        setFiles([]);
        setLoadError(intl.formatMessage({ id: 'SYNC_SERVER.LOAD_ERROR' }));
      }
    } catch (err) {
      setFiles([]);
      setLoadError(intl.formatMessage({ id: httpErrorKey(err, 'SYNC_SERVER.LOAD_ERROR') }));
    } finally {
      setLoading(false);
    }
  }, [intl]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const storeName = useCallback(
    (storeId: string) => user?.storeList?.find((store) => store.id === storeId)?.name ?? storeId,
    [user],
  );

  /**
   * One in-memory archive per store this session backs up: the selected store
   * plus, for an Owner with MultiStores, every active store whose key this
   * device holds. Each archive is uploaded under its own store id (S1, S2).
   */
  async function handleUpload(password: string): Promise<StoreSyncFileUploadResult[]> {
    setMessage(null);
    const storeIds = resolveBackupStoreIds(user, selectedStoreId, getStoresWithLocalDek());
    const results = await uploadStoreBackups(storeIds, password, {
      createServices: createStoreSyncServices,
      unwrapDek: unwrapStoreDekForStore,
    });
    await loadFiles();
    return results;
  }

  /**
   * Downloads the archived bytes and imports them in the same gesture. The
   * import ALWAYS targets the file's own store — never the POS's selected one —
   * so a v2 archive is validated against the store it claims (S7).
   */
  async function handleDownloadAndImport(
    file: StoreSyncFileDto,
    password: string,
  ): Promise<SyncResult> {
    const payload = await downloadStoreSyncFile(file.id);
    const run = (): Promise<SyncResult> =>
      importBackupFile({
        payload,
        password,
        user,
        selectedStoreId: file.storeId,
        createServices: createStoreSyncServices,
        unwrapDek: unwrapStoreDekForStore,
        storesWithLocalDek: getStoresWithLocalDek(),
      });

    const storeDek = await unwrapStoreDekForStore(file.storeId);
    const result = storeDek ? await withStoreDek(file.storeId, storeDek, run) : await run();

    await loadFiles();
    if (result.succeeded) {
      setMessage({ kind: 'success', text: intl.formatMessage({ id: 'SYNC_SERVER.IMPORT_SUCCESS' }) });
    }
    return result;
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setMessage(null);
    try {
      const envelope = await deleteStoreSyncFile(deleteTarget.id);
      if (envelope.succeeded) {
        setMessage({
          kind: 'success',
          text: intl.formatMessage({ id: 'SYNC_SERVER.DELETED' }),
        });
        await loadFiles();
      } else {
        setMessage({ kind: 'error', text: intl.formatMessage({ id: 'SYNC_SERVER.DELETE_ERROR' }) });
      }
    } catch (err) {
      setMessage({
        kind: 'error',
        text: intl.formatMessage({ id: httpErrorKey(err, 'SYNC_SERVER.DELETE_ERROR') }),
      });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <SyncServerUploadForm onUpload={handleUpload} storeName={storeName} />

      {message && (
        <div role={message.kind === 'error' ? 'alert' : 'status'}>
          <InfoBox variant={message.kind === 'success' ? 'primary' : 'danger'}>{message.text}</InfoBox>
        </div>
      )}

      <SyncServerFileList
        files={files}
        loading={loading}
        error={loadError}
        onRefresh={() => void loadFiles()}
        onDownload={setImportTarget}
        onDelete={setDeleteTarget}
      />

      <SyncServerDownloadDialog
        file={importTarget}
        onClose={() => setImportTarget(null)}
        onImport={handleDownloadAndImport}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
        title={intl.formatMessage({ id: 'SYNC_SERVER.DELETE_TITLE' })}
        description={intl.formatMessage({ id: 'SYNC_SERVER.DELETE_MESSAGE' })}
        confirmLabel={
          deleting
            ? intl.formatMessage({ id: 'GENERAL.LOADING' })
            : intl.formatMessage({ id: 'SYNC_SERVER.DELETE' })
        }
      />
    </div>
  );
}

export default SyncServerPage;
