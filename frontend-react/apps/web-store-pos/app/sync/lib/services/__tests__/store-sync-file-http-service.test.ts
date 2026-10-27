/**
 * store-sync-file-http-service — the backend repository of encrypted POS backups.
 *
 * Pins:
 *   - the wire DTO is mapped (defaults included),
 *   - the upload sends `file` + `storeId` as multipart,
 *   - every uploaded store carries its OWN v2 single-store archive,
 *   - a store without a local key is SKIPPED while another key is active,
 *   - one store's failure never aborts the rest of the batch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js';
import type { FileEntry } from '@zip.js/zip.js';
import { clearDek, getDek, setDek } from '~/shared/lib/storage/data-key-store';

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { apiClient } from '~/shared/lib/http/api-client';
import { V2_FORMAT_VERSION, V2_META_FILENAME } from '../data-serializer-service';
import {
  buildStoreSyncFileName,
  deleteStoreSyncFile,
  downloadStoreSyncFile,
  listStoreSyncFiles,
  uploadStoreBackups,
  uploadStoreSyncFile,
} from '../store-sync-file-http-service';
import type {
  StoreSyncFileDto,
  StoreSyncFileUploadDeps,
  StoreSyncFileUploadRequest,
} from '../store-sync-file-http-service';
import type { StoreSyncServices } from '../store-sync-services-factory';

const STORE_A = 'store-a';
const STORE_B = 'store-b';

const dekA = crypto.getRandomValues(new Uint8Array(32));

const FILE_DTO: StoreSyncFileDto = {
  id: 'f1',
  storeId: STORE_A,
  storeName: 'Tienda Centro',
  fileName: 'datos261027-1234.zip',
  sizeBytes: 2048,
  uploadedByUserId: 'u1',
  uploadedByFullName: 'Ana Pérez',
  createdAt: '2026-10-27T12:00:00Z',
  downloadCount: 3,
  downloadedByMe: true,
  downloadedByMeAt: '2026-10-27T13:00:00Z',
};

function success<T>(data: T) {
  return { succeeded: true as const, data, message: null, actionCode: null, errors: [] };
}

/** Reads the plaintext v2 envelope out of an archive the service built. */
async function readArchiveMeta(content: Uint8Array) {
  const reader = new ZipReader(new BlobReader(new Blob([content])));
  try {
    const entries = await reader.getEntries();
    const metaEntry = entries.find(
      (entry) => !entry.directory && entry.filename === V2_META_FILENAME,
    ) as FileEntry | undefined;
    if (!metaEntry) throw new Error('meta.json missing from the uploaded archive');
    return JSON.parse(await metaEntry.getData(new TextWriter())) as {
      formatVersion: number;
      storeId: string;
    };
  } finally {
    await reader.close();
  }
}

function makeUploadDeps(options: {
  deks: Record<string, Uint8Array | null>;
  uploadFile: (request: StoreSyncFileUploadRequest) => Promise<unknown>;
}): StoreSyncFileUploadDeps & { collected: string[] } {
  const collected: string[] = [];
  const createServices = ((storeId: string) => ({
    serializer: {
      collectEntries: async () => {
        collected.push(storeId);
        return new Map([['orders.json', JSON.stringify([{ id: `${storeId}-order` }])]]);
      },
    },
    synchronizer: {},
  })) as unknown as (storeId: string) => StoreSyncServices;

  return {
    collected,
    createServices,
    unwrapDek: async (storeId: string) => options.deks[storeId] ?? null,
    uploadFile: options.uploadFile as StoreSyncFileUploadDeps['uploadFile'],
  };
}

describe('storeSyncFileHttpService — wire mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the repository and maps the DTO, filling absent flags with safe defaults', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: success([
        {
          ...FILE_DTO,
          downloadCount: undefined,
          downloadedByMe: undefined,
          downloadedByMeAt: undefined,
        },
      ]),
    } as never);

    const result = await listStoreSyncFiles();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/sync/files');
    if (!result.succeeded) throw new Error('expected a succeeded envelope');
    expect(result.data).toEqual([
      { ...FILE_DTO, downloadCount: 0, downloadedByMe: false, downloadedByMeAt: null },
    ]);
  });

  it('uploads the ZIP as multipart `file` together with its `storeId`', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: success(FILE_DTO) } as never);
    const content = new Uint8Array([1, 2, 3]);

    const result = await uploadStoreSyncFile({
      storeId: STORE_A,
      fileName: 'datos261027-1234.zip',
      content,
    });

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = vi.mocked(apiClient.post).mock.calls[0];
    expect(url).toBe('/v1/sync/files');
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });

    const form = body as FormData;
    expect(form.get('storeId')).toBe(STORE_A);
    const uploaded = form.get('file') as File;
    expect(uploaded.name).toBe('datos261027-1234.zip');
    expect(uploaded.type).toBe('application/zip');
    expect(uploaded.size).toBe(content.length);

    if (!result.succeeded) throw new Error('expected a succeeded envelope');
    expect(result.data).toEqual(FILE_DTO);
  });

  it('downloads the raw archive bytes', async () => {
    const bytes = new Uint8Array([9, 8, 7]).buffer;
    vi.mocked(apiClient.get).mockResolvedValue({ data: bytes } as never);

    const payload = await downloadStoreSyncFile('f1');

    expect(apiClient.get).toHaveBeenCalledWith('/v1/sync/files/f1/content', {
      responseType: 'arraybuffer',
    });
    expect(Array.from(payload)).toEqual([9, 8, 7]);
  });

  it('deletes a repository entry by id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: success(true) } as never);

    const result = await deleteStoreSyncFile('f1');

    expect(apiClient.delete).toHaveBeenCalledWith('/v1/sync/files/f1');
    expect(result.succeeded).toBe(true);
  });

  it('names the uploaded file with the POS export pattern', () => {
    expect(buildStoreSyncFileName(new Date(2026, 9, 27, 12, 34))).toBe('datos261027-1234.zip');
  });
});

describe('uploadStoreBackups — one v2 archive per store', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    vi.clearAllMocks();
  });

  it('builds the v2 single-store archive for the store it is uploaded under', async () => {
    setDek(dekA, STORE_A);
    const uploads: StoreSyncFileUploadRequest[] = [];
    const deps = makeUploadDeps({
      deks: { [STORE_A]: dekA },
      uploadFile: async (request) => {
        uploads.push(request);
        return success({ ...FILE_DTO, storeId: request.storeId });
      },
    });

    const results = await uploadStoreBackups([STORE_A], 'backup-password', deps, new Date(2026, 9, 27, 12, 34));

    expect(results).toEqual([
      {
        storeId: STORE_A,
        fileName: 'datos261027-1234.zip',
        status: 'uploaded',
        file: expect.objectContaining({ storeId: STORE_A }),
      },
    ]);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].fileName).toBe('datos261027-1234.zip');
    expect(await readArchiveMeta(uploads[0].content)).toEqual(
      expect.objectContaining({ formatVersion: V2_FORMAT_VERSION, storeId: STORE_A }),
    );
    // The active (storeId, DEK) pair is restored after the batch.
    expect(getDek()).toBe(dekA);
  });

  it('skips a store with no local key while another key is active', async () => {
    setDek(dekA, STORE_A);
    const uploads: StoreSyncFileUploadRequest[] = [];
    const deps = makeUploadDeps({
      deks: { [STORE_A]: dekA, [STORE_B]: null },
      uploadFile: async (request) => {
        uploads.push(request);
        return success(FILE_DTO);
      },
    });

    const results = await uploadStoreBackups([STORE_A, STORE_B], 'backup-password', deps);

    expect(results.map((result) => [result.storeId, result.status])).toEqual([
      [STORE_A, 'uploaded'],
      [STORE_B, 'skipped'],
    ]);
    expect(deps.collected).toEqual([STORE_A]);
    expect(uploads.map((upload) => upload.storeId)).toEqual([STORE_A]);
  });

  it('reports a store that fails without aborting the rest of the batch', async () => {
    setDek(dekA, STORE_A);
    const deps = makeUploadDeps({
      deks: { [STORE_A]: dekA, [STORE_B]: dekA },
      uploadFile: async (request) => {
        if (request.storeId === STORE_A) throw new Error('server rejected the file');
        return success({ ...FILE_DTO, storeId: request.storeId });
      },
    });

    const results = await uploadStoreBackups([STORE_A, STORE_B], 'backup-password', deps);

    expect(results).toEqual([
      {
        storeId: STORE_A,
        fileName: expect.any(String),
        status: 'failed',
        error: 'server rejected the file',
      },
      {
        storeId: STORE_B,
        fileName: expect.any(String),
        status: 'uploaded',
        file: expect.objectContaining({ storeId: STORE_B }),
      },
    ]);
  });
});
