/**
 * multi-store-backup — the orchestration layer.
 *
 * These tests pin the behaviour the request describes:
 *   - an Owner's export carries EVERY store of theirs that this device can read,
 *   - the import writes EVERY store in the archive the user may write,
 *   - an archive with one store imports one store (old backups unchanged),
 *   - a StoreUser only ever imports their own store,
 *   - each store is read/written with ITS OWN key, never the selected store's,
 *   - the active (storeId, DEK) pair is restored after every store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import { clearDek, getDek, getDekStoreId, setDek } from '~/shared/lib/storage/data-key-store';
import {
  MissingStoreKeyError,
  MissingStoreKeySyncError,
  MultiStoreBackupService,
  resolveBackupStoreIds,
} from '../multi-store-backup-service';
import type { MultiStoreBackupDeps } from '../multi-store-backup-service';
import {
  V3_MULTI_FORMAT_VERSION,
  WrongPasswordError,
  WrongStoreError,
  peekBackupFormatVersion,
  readMultiStoreArchive,
  writeMultiStoreArchive,
} from '../data-serializer-service';
import type { DataSerializerService } from '../data-serializer-service';
import type { DataSynchronizerService, SyncResult } from '../data-synchronizer-service';
import type { StoreSyncServices } from '../store-sync-services-factory';

const STORE_A = 'store-a';
const STORE_B = 'store-b';
const STORE_C = 'store-c';
const PASSWORD = 'backup-password';

const dekA = crypto.getRandomValues(new Uint8Array(32));
const dekB = crypto.getRandomValues(new Uint8Array(32));

const EMPTY_SYNC: SyncResult = { succeeded: true, errors: [], merges: [] };

function entriesFor(storeId: string): Map<string, string> {
  return new Map([['orders.json', JSON.stringify([{ id: `${storeId}-order` }])]]);
}

/** Records the (storeId, DEK) pair active when each store was touched. */
interface Recorder {
  collected: Array<{ storeId: string; dekStoreId: string | null }>;
  synced: Array<{ storeId: string; dekStoreId: string | null }>;
}

function makeDeps(options: {
  deks: Record<string, Uint8Array | null>;
  syncResult?: (storeId: string) => SyncResult;
}): { deps: MultiStoreBackupDeps; recorder: Recorder } {
  const recorder: Recorder = { collected: [], synced: [] };
  const services = new Map<string, StoreSyncServices>();

  const deps: MultiStoreBackupDeps = {
    unwrapDek: vi.fn(async (storeId: string) => options.deks[storeId] ?? null),
    createServices: vi.fn((storeId: string) => {
      const existing = services.get(storeId);
      if (existing) return existing;
      const serializer = {
        collectEntries: vi.fn(async () => {
          recorder.collected.push({ storeId, dekStoreId: getDekStoreId() });
          return entriesFor(storeId);
        }),
        parseContents: vi.fn(() => ({})),
        import: vi.fn(),
        export: vi.fn(),
        exportPlainData: vi.fn(),
      } as unknown as DataSerializerService;
      const synchronizer = {
        sync: vi.fn(async () => {
          recorder.synced.push({ storeId, dekStoreId: getDekStoreId() });
          return options.syncResult ? options.syncResult(storeId) : EMPTY_SYNC;
        }),
      } as unknown as DataSynchronizerService;
      const created = { serializer, synchronizer };
      services.set(storeId, created);
      return created;
    }),
  };

  return { deps, recorder };
}

function makeUser(overrides: Partial<UserModel>): UserModel {
  return {
    id: 'u1',
    isOwnerAdmin: false,
    isSuperAdmin: false,
    isReSeller: false,
    selectedStoreId: STORE_A,
    storeModuleIds: [],
    storeList: [],
    ...overrides,
  } as unknown as UserModel;
}

describe('resolveBackupStoreIds', () => {
  const localDek = new Set([STORE_A, STORE_B]);

  it('gives an OwnerAdmin with MultiStores every active store with a local key', () => {
    const user = makeUser({
      isOwnerAdmin: true,
      storeModuleIds: [EModules.MultiStores],
      storeList: [
        { id: STORE_A, name: 'A', isActive: true },
        { id: STORE_B, name: 'B', isActive: true },
        { id: STORE_C, name: 'C', isActive: true },
      ],
    });
    // STORE_C is active but this device holds no key for it.
    expect(resolveBackupStoreIds(user, STORE_A, localDek)).toEqual([STORE_A, STORE_B]);
  });

  it('excludes inactive stores', () => {
    const user = makeUser({
      isOwnerAdmin: true,
      storeModuleIds: [EModules.MultiStores],
      storeList: [
        { id: STORE_A, name: 'A', isActive: true },
        { id: STORE_B, name: 'B', isActive: false },
      ],
    });
    expect(resolveBackupStoreIds(user, STORE_A, localDek)).toEqual([STORE_A]);
  });

  it('keeps a single store for an Owner WITHOUT the MultiStores module', () => {
    const user = makeUser({
      isOwnerAdmin: true,
      storeModuleIds: [],
      storeList: [
        { id: STORE_A, name: 'A', isActive: true },
        { id: STORE_B, name: 'B', isActive: true },
      ],
    });
    expect(resolveBackupStoreIds(user, STORE_A, localDek)).toEqual([STORE_A]);
  });

  it('keeps a single store for a StoreUser (never another store)', () => {
    const user = makeUser({
      isOwnerAdmin: false,
      storeModuleIds: [EModules.MultiStores],
      storeList: [
        { id: STORE_A, name: 'A', isActive: true },
        { id: STORE_B, name: 'B', isActive: true },
      ],
    });
    expect(resolveBackupStoreIds(user, STORE_A, localDek)).toEqual([STORE_A]);
  });

  it('always includes the selected store, even without a local key entry', () => {
    const user = makeUser({ isOwnerAdmin: true, storeModuleIds: [EModules.MultiStores] });
    expect(resolveBackupStoreIds(user, STORE_C, new Set())).toEqual([STORE_C]);
  });

  it('returns nothing without a selected store', () => {
    expect(resolveBackupStoreIds(makeUser({}), '', localDek)).toEqual([]);
  });
});

describe('MultiStoreBackupService.exportStores', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
  });

  afterEach(() => clearDek());

  it('exports every store, each read under its own key', async () => {
    setDek(dekA, STORE_A);
    const { deps, recorder } = makeDeps({ deks: { [STORE_A]: dekA, [STORE_B]: dekB } });
    const backup = new MultiStoreBackupService(deps);

    const payload = await backup.exportStores([STORE_A, STORE_B], PASSWORD);

    expect(recorder.collected).toEqual([
      { storeId: STORE_A, dekStoreId: STORE_A },
      { storeId: STORE_B, dekStoreId: STORE_B },
    ]);
    // The active pair is restored after the run.
    expect(getDekStoreId()).toBe(STORE_A);
    expect(getDek()).toBe(dekA);

    await expect(peekBackupFormatVersion(payload)).resolves.toBe(V3_MULTI_FORMAT_VERSION);
    const read = await readMultiStoreArchive(payload, PASSWORD);
    expect(read.map((store) => store.storeId)).toEqual([STORE_A, STORE_B]);
    expect(read[0].entries.get('orders.json')).toBe(JSON.stringify([{ id: `${STORE_A}-order` }]));
    expect(read[1].entries.get('orders.json')).toBe(JSON.stringify([{ id: `${STORE_B}-order` }]));
  });

  it('exports ONE store when only one store id is given (single-store owner)', async () => {
    setDek(dekA, STORE_A);
    const { deps } = makeDeps({ deks: { [STORE_A]: dekA } });
    const backup = new MultiStoreBackupService(deps);

    const payload = await backup.exportStores([STORE_A], PASSWORD);

    const read = await readMultiStoreArchive(payload, PASSWORD);
    expect(read.map((store) => store.storeId)).toEqual([STORE_A]);
  });

  it('skips a store whose key is missing while another key is active', async () => {
    setDek(dekA, STORE_A);
    const { deps, recorder } = makeDeps({ deks: { [STORE_A]: dekA, [STORE_B]: null } });
    const backup = new MultiStoreBackupService(deps);

    const payload = await backup.exportStores([STORE_A, STORE_B], PASSWORD);

    expect(recorder.collected.map((entry) => entry.storeId)).toEqual([STORE_A]);
    const read = await readMultiStoreArchive(payload, PASSWORD);
    expect(read.map((store) => store.storeId)).toEqual([STORE_A]);
  });

  it('exports a plaintext (never provisioned) device with no key at all', async () => {
    const { deps, recorder } = makeDeps({ deks: { [STORE_A]: null } });
    const backup = new MultiStoreBackupService(deps);

    const payload = await backup.exportStores([STORE_A], PASSWORD);

    expect(recorder.collected).toEqual([{ storeId: STORE_A, dekStoreId: null }]);
    const read = await readMultiStoreArchive(payload, PASSWORD);
    expect(read.map((store) => store.storeId)).toEqual([STORE_A]);
  });

  it('throws MissingStoreKeyError when NO store can be read', async () => {
    setDek(dekA, STORE_A);
    const { deps } = makeDeps({ deks: { [STORE_B]: null } });
    const backup = new MultiStoreBackupService(deps);

    await expect(backup.exportStores([STORE_B], PASSWORD)).rejects.toBeInstanceOf(
      MissingStoreKeyError,
    );
  });
});

describe('MultiStoreBackupService.importArchive', () => {
  let payloadAB: Uint8Array;

  beforeEach(async () => {
    localStorage.clear();
    clearDek();
    payloadAB = await writeMultiStoreArchive(
      [
        { storeId: STORE_A, entries: entriesFor(STORE_A) },
        { storeId: STORE_B, entries: entriesFor(STORE_B) },
      ],
      PASSWORD,
    );
  });

  afterEach(() => clearDek());

  it('imports EVERY authorized store, each under its own key', async () => {
    setDek(dekA, STORE_A);
    const { deps, recorder } = makeDeps({ deks: { [STORE_A]: dekA, [STORE_B]: dekB } });
    const backup = new MultiStoreBackupService(deps);

    const result = await backup.importArchive(payloadAB, PASSWORD, [STORE_A, STORE_B]);

    expect(result.succeeded).toBe(true);
    expect(recorder.synced).toEqual([
      { storeId: STORE_A, dekStoreId: STORE_A },
      { storeId: STORE_B, dekStoreId: STORE_B },
    ]);
    expect(getDekStoreId()).toBe(STORE_A);
    expect(getDek()).toBe(dekA);
  });

  it('imports ONLY the authorized store of a multi-store archive (StoreUser)', async () => {
    setDek(dekA, STORE_A);
    const { deps, recorder } = makeDeps({ deks: { [STORE_A]: dekA, [STORE_B]: dekB } });
    const backup = new MultiStoreBackupService(deps);

    const result = await backup.importArchive(payloadAB, PASSWORD, [STORE_A]);

    expect(result.succeeded).toBe(true);
    expect(recorder.synced).toEqual([{ storeId: STORE_A, dekStoreId: STORE_A }]);
  });

  it('imports a SINGLE-store archive into that one store', async () => {
    const single = await writeMultiStoreArchive(
      [{ storeId: STORE_A, entries: entriesFor(STORE_A) }],
      PASSWORD,
    );
    setDek(dekA, STORE_A);
    const { deps, recorder } = makeDeps({ deks: { [STORE_A]: dekA } });
    const backup = new MultiStoreBackupService(deps);

    const result = await backup.importArchive(single, PASSWORD, [STORE_A]);

    expect(result.succeeded).toBe(true);
    expect(recorder.synced.map((entry) => entry.storeId)).toEqual([STORE_A]);
  });

  it('refuses an archive whose stores all belong to someone else, with no writes', async () => {
    setDek(dekA, STORE_A);
    const { deps, recorder } = makeDeps({ deks: { [STORE_A]: dekA, [STORE_B]: dekB } });
    const backup = new MultiStoreBackupService(deps);

    await expect(backup.importArchive(payloadAB, PASSWORD, [STORE_C])).rejects.toBeInstanceOf(
      WrongStoreError,
    );
    expect(recorder.synced).toEqual([]);
  });

  it('rejects a wrong password with no writes', async () => {
    setDek(dekA, STORE_A);
    const { deps, recorder } = makeDeps({ deks: { [STORE_A]: dekA, [STORE_B]: dekB } });
    const backup = new MultiStoreBackupService(deps);

    await expect(
      backup.importArchive(payloadAB, 'wrong-password', [STORE_A, STORE_B]),
    ).rejects.toBeInstanceOf(WrongPasswordError);
    expect(recorder.synced).toEqual([]);
  });

  it('reports a store it cannot key on this device, and still imports the others', async () => {
    setDek(dekA, STORE_A);
    const { deps, recorder } = makeDeps({ deks: { [STORE_A]: dekA, [STORE_B]: null } });
    const backup = new MultiStoreBackupService(deps);

    const result = await backup.importArchive(payloadAB, PASSWORD, [STORE_A, STORE_B]);

    expect(result.succeeded).toBe(false);
    expect(result.errors).toEqual([
      {
        entity: 'backup',
        code: MissingStoreKeySyncError.code,
        message: MissingStoreKeySyncError.message,
      },
    ]);
    expect(recorder.synced.map((entry) => entry.storeId)).toEqual([STORE_A]);
  });

  it('aggregates merges and errors across stores', async () => {
    setDek(dekA, STORE_A);
    const { deps } = makeDeps({
      deks: { [STORE_A]: dekA, [STORE_B]: dekB },
      syncResult: (storeId) =>
        storeId === STORE_A
          ? {
              succeeded: true,
              errors: [],
              merges: [{ entity: 'orders', inserted: 2, updated: 0 }],
            }
          : {
              succeeded: false,
              errors: [
                { entity: 'orders', code: 'Synchronizer.OrdersUnexpectedError', message: 'boom' },
              ],
              merges: [{ entity: 'orders', inserted: 1, updated: 0 }],
            },
    });
    const backup = new MultiStoreBackupService(deps);

    const result = await backup.importArchive(payloadAB, PASSWORD, [STORE_A, STORE_B]);

    expect(result.succeeded).toBe(false);
    expect(result.merges).toEqual([
      { entity: 'orders', inserted: 2, updated: 0 },
      { entity: 'orders', inserted: 1, updated: 0 },
    ]);
    expect(result.errors).toHaveLength(1);
  });
});
