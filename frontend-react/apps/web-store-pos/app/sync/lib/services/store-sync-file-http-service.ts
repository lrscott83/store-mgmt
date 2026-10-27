import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';
import { getDek, withStoreDek } from '~/shared/lib/storage/data-key-store';
import { writeSingleStoreArchive } from './data-serializer-service';
import type { StoreSyncServices } from './store-sync-services-factory';

/**
 * store-sync-file-http-service — the backend-hosted repository of the encrypted
 * backups the POS already exports.
 *
 * One repository entry is ONE store's v2 archive (`writeSingleStoreArchive`),
 * never the v3 multi-store one: the v3 archive encrypts every store with the
 * same password-derived key, so a StoreUser could read the other stores' data
 * with it (spec S1). An Owner with N stores therefore uploads N archives.
 *
 * The bytes never touch the disk: each archive is built in memory, uploaded,
 * and dropped. The backup password is only ever used locally to encrypt and to
 * decrypt on import — it is never part of any request (spec S2, S7, S13).
 */

/** `ResponseResult<StoreSyncFileDto>` — one repository entry. */
export interface StoreSyncFileDto {
  id: string;
  storeId: string;
  storeName: string;
  fileName: string;
  sizeBytes: number;
  uploadedByUserId: string;
  uploadedByFullName: string;
  createdAt: string;
  downloadCount: number;
  downloadedByMe: boolean;
  downloadedByMeAt: string | null;
}

/** Wire shape: the server may omit the per-user / counter fields. */
type StoreSyncFileWire = Partial<Omit<StoreSyncFileDto, 'id'>> & { id: string };

const SYNC_FILES_PATH = '/v1/sync/files';

/**
 * Normalizes the wire DTO: absent counter/flag fields read as `never downloaded`
 * instead of `undefined`, so the screen can render them without extra guards.
 */
export function mapStoreSyncFile(raw: StoreSyncFileWire): StoreSyncFileDto {
  return {
    id: String(raw.id),
    storeId: raw.storeId ?? '',
    storeName: raw.storeName ?? '',
    fileName: raw.fileName ?? '',
    sizeBytes: Number(raw.sizeBytes ?? 0),
    uploadedByUserId: raw.uploadedByUserId ?? '',
    uploadedByFullName: raw.uploadedByFullName ?? '',
    createdAt: raw.createdAt ?? '',
    downloadCount: Number(raw.downloadCount ?? 0),
    downloadedByMe: raw.downloadedByMe === true,
    downloadedByMeAt: raw.downloadedByMeAt ?? null,
  };
}

/** `GET /v1/sync/files` — every entry this user may see, newest first server-side. */
export async function listStoreSyncFiles(): Promise<BaseResponseModel<StoreSyncFileDto[]>> {
  const response = await apiClient.get<BaseResponseModel<StoreSyncFileWire[]>>(SYNC_FILES_PATH);
  const envelope = response.data;
  if (!envelope.succeeded) return envelope;
  return {
    ...envelope,
    data: (envelope.data ?? []).map(mapStoreSyncFile),
  };
}

export interface StoreSyncFileUploadRequest {
  storeId: string;
  fileName: string;
  /** The v2 single-store archive, already encrypted with the backup password. */
  content: Uint8Array;
}

/**
 * `POST /v1/sync/files` — multipart with `file` (the ZIP) and `storeId`.
 *
 * The explicit `Content-Type: multipart/form-data` is required: `api-client`
 * defaults to `application/json` and axios would serialize the FormData as
 * JSON. Declaring multipart leaves the FormData intact so the adapter can drop
 * the header and let the browser set the real boundary (same trap documented in
 * `catalog-http-service.uploadImage`).
 */
export async function uploadStoreSyncFile(
  request: StoreSyncFileUploadRequest,
): Promise<BaseResponseModel<StoreSyncFileDto>> {
  const formData = new FormData();
  formData.append('file', new Blob([request.content], { type: 'application/zip' }), request.fileName);
  formData.append('storeId', request.storeId);

  const response = await apiClient.post<BaseResponseModel<StoreSyncFileWire>>(
    SYNC_FILES_PATH,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  const envelope = response.data;
  if (!envelope.succeeded) return envelope;
  return { ...envelope, data: mapStoreSyncFile(envelope.data) };
}

/** `GET /v1/sync/files/{id}/content` — the raw ZIP bytes. */
export async function downloadStoreSyncFile(id: string): Promise<Uint8Array> {
  const response = await apiClient.get<ArrayBuffer>(
    `${SYNC_FILES_PATH}/${encodeURIComponent(id)}/content`,
    { responseType: 'arraybuffer' },
  );
  return new Uint8Array(response.data);
}

/** `DELETE /v1/sync/files/{id}`. */
export async function deleteStoreSyncFile(id: string): Promise<BaseResponseModel<boolean>> {
  const response = await apiClient.delete<BaseResponseModel<boolean>>(
    `${SYNC_FILES_PATH}/${encodeURIComponent(id)}`,
  );
  return response.data;
}

/**
 * Same file name the local export produces (`export.tsx:36-45`): the repository
 * stores the original name, the store/date/user live as table columns.
 */
export function buildStoreSyncFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(2);
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  return `datos${yy}${mm}${dd}-${hh}${min}.zip`;
}

export type StoreSyncFileUploadStatus = 'uploaded' | 'skipped' | 'failed';

export interface StoreSyncFileUploadResult {
  storeId: string;
  fileName: string;
  status: StoreSyncFileUploadStatus;
  file?: StoreSyncFileDto;
  /** Diagnostic reason for `failed` / `skipped`; never rendered raw in the UI. */
  error?: string;
}

export interface StoreSyncFileUploadDeps {
  /** Builds a store's read services. Must run under that store's DEK. */
  createServices(storeId: string): StoreSyncServices;
  /** This device's DEK for `storeId`, or null when it holds none. */
  unwrapDek(storeId: string): Promise<Uint8Array | null>;
  /** Transport seam (tests inject a recorder). Defaults to `uploadStoreSyncFile`. */
  uploadFile?(request: StoreSyncFileUploadRequest): Promise<BaseResponseModel<StoreSyncFileDto>>;
}

/**
 * Reads one store's entries under that store's own key. Returns null when the
 * store cannot be read on this device — mirrored verbatim from
 * `MultiStoreBackupService.collectStoreEntries` so an upload never encrypts a
 * store's data under another store's active key.
 */
async function collectStoreEntries(
  storeId: string,
  deps: StoreSyncFileUploadDeps,
): Promise<Map<string, string> | null> {
  const storeDek = await deps.unwrapDek(storeId);
  if (storeDek) {
    return withStoreDek(storeId, storeDek, () =>
      deps.createServices(storeId).serializer.collectEntries(),
    );
  }
  // No per-store key: the data can only be plaintext (never provisioned on
  // this device), which reads fine with no key active. With another store's
  // key active, this store's ciphertext would fail to decrypt.
  if (getDek() !== null) return null;
  return deps.createServices(storeId).serializer.collectEntries();
}

/**
 * Builds and uploads ONE v2 archive per store, in memory.
 *
 * A store that cannot be read is reported as `skipped`; a store whose upload
 * fails is reported as `failed` with its reason. Neither aborts the batch, so a
 * partial result is always visible per store (spec S2).
 */
export async function uploadStoreBackups(
  storeIds: readonly string[],
  password: string,
  deps: StoreSyncFileUploadDeps,
  now: Date = new Date(),
): Promise<StoreSyncFileUploadResult[]> {
  const uploadFile = deps.uploadFile ?? uploadStoreSyncFile;
  const fileName = buildStoreSyncFileName(now);
  const results: StoreSyncFileUploadResult[] = [];

  for (const storeId of storeIds) {
    try {
      const entries = await collectStoreEntries(storeId, deps);
      if (entries === null) {
        results.push({
          storeId,
          fileName,
          status: 'skipped',
          error: 'No store data key is available on this device',
        });
        continue;
      }

      const content = await writeSingleStoreArchive(storeId, entries, password);
      const envelope = await uploadFile({ storeId, fileName, content });

      if (envelope.succeeded) {
        results.push({ storeId, fileName, status: 'uploaded', file: envelope.data });
      } else {
        results.push({
          storeId,
          fileName,
          status: 'failed',
          error: envelope.errors[0]?.description ?? 'Upload rejected',
        });
      }
    } catch (err) {
      results.push({
        storeId,
        fileName,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
