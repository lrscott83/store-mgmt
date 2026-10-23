/**
 * multi-store-backup — the IMPORT dispatch (`importBackupFile`), which is the
 * contract the import route relies on.
 *
 * The archive's own envelope decides the path:
 *   - v2 / legacy v1 → the UNCHANGED single-store path (wrong store still
 *     rejected before any write),
 *   - v3 → every store in the file the user may write, each under its own DEK,
 *     and ONLY those (a StoreUser can never write a second store).
 *
 * The synchronizer is replaced with a spy so the assertions are about WHICH
 * stores were reached with WHICH data and key, not about merge internals (those
 * have their own suites).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import { clearDek, getDekStoreId } from '~/shared/lib/storage/data-key-store';
import {
  WrongPasswordError,
  WrongStoreError,
  writeMultiStoreArchive,
  writeSingleStoreArchive,
} from '../data-serializer-service';
import { importBackupFile } from '../multi-store-backup-service';
import { createStoreSyncServices } from '../store-sync-services-factory';
import type { StoreSyncServices } from '../store-sync-services-factory';
import type { SyncResult } from '../data-synchronizer-service';
import type { ParsedData } from '../data-serializer-service';

const STORE_A = 'store-a';
const STORE_B = 'store-b';
const STORE_C = 'store-c';
const PASSWORD = 'backup-password';

const dekA = crypto.getRandomValues(new Uint8Array(32));
const dekB = crypto.getRandomValues(new Uint8Array(32));

interface SyncedStore {
  storeId: string;
  orderIds: string[];
  dekStoreId: string | null;
}

const EMPTY_SYNC: SyncResult = { succeeded: true, errors: [], merges: [] };

function ordersJson(orderId: string): string {
  return JSON.stringify([{ id: orderId }]);
}

function entries(orderId: string): Map<string, string> {
  return new Map([['orders.json', ordersJson(orderId)]]);
}

/**
 * Real parser/serializer wiring (so envelope + store validation are genuine),
 * spy synchronizer (so nothing is written and each store's run is observable).
 */
function makeServices(calls: SyncedStore[]): (storeId: string) => StoreSyncServices {
  return (storeId) => {
    const real = createStoreSyncServices(storeId);
    return {
      serializer: real.serializer,
      synchronizer: {
        sync: vi.fn(async (data: ParsedData) => {
          calls.push({
            storeId,
            orderIds: (data.orders ?? []).map((order) => order.id),
            dekStoreId: getDekStoreId(),
          });
          return EMPTY_SYNC;
        }),
      } as unknown as StoreSyncServices['synchronizer'],
    };
  };
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

const ownerWithMultiStores = makeUser({
  isOwnerAdmin: true,
  storeModuleIds: [EModules.MultiStores],
  storeList: [
    { id: STORE_A, name: 'A', isActive: true },
    { id: STORE_B, name: 'B', isActive: true },
    { id: STORE_C, name: 'C', isActive: false },
  ],
});

const storeUser = makeUser({
  isOwnerAdmin: false,
  storeModuleIds: [EModules.MultiStores],
  storeList: [
    { id: STORE_A, name: 'A', isActive: true },
    { id: STORE_B, name: 'B', isActive: true },
  ],
});

beforeEach(() => {
  localStorage.clear();
  clearDek();
});

// ─── Legacy archives: ONE store, path unchanged ───────────────────────────

describe('importBackupFile — v2 archive (one store)', () => {
  it('imports into the store the archive describes', async () => {
    const payload = await writeSingleStoreArchive(STORE_A, entries('v2-order'), PASSWORD);
    const calls: SyncedStore[] = [];

    const result = await importBackupFile({
      payload,
      password: PASSWORD,
      user: ownerWithMultiStores,
      selectedStoreId: STORE_A,
      createServices: makeServices(calls),
      unwrapDek: vi.fn(async () => null),
      storesWithLocalDek: new Set([STORE_A, STORE_B]),
    });

    expect(result.succeeded).toBe(true);
    expect(calls).toEqual([{ storeId: STORE_A, orderIds: ['v2-order'], dekStoreId: null }]);
  });

  it('rejects an archive from another store BEFORE any write', async () => {
    const payload = await writeSingleStoreArchive(STORE_B, entries('other-store'), PASSWORD);
    const calls: SyncedStore[] = [];

    await expect(
      importBackupFile({
        payload,
        password: PASSWORD,
        user: ownerWithMultiStores,
        selectedStoreId: STORE_A,
        createServices: makeServices(calls),
        unwrapDek: vi.fn(async () => null),
        storesWithLocalDek: new Set([STORE_A, STORE_B]),
      }),
    ).rejects.toBeInstanceOf(WrongStoreError);

    expect(calls).toEqual([]);
  });

  it('rejects a wrong password BEFORE any write', async () => {
    const payload = await writeSingleStoreArchive(STORE_A, entries('v2-order'), PASSWORD);
    const calls: SyncedStore[] = [];

    await expect(
      importBackupFile({
        payload,
        password: 'wrong',
        user: ownerWithMultiStores,
        selectedStoreId: STORE_A,
        createServices: makeServices(calls),
        unwrapDek: vi.fn(async () => null),
        storesWithLocalDek: new Set([STORE_A]),
      }),
    ).rejects.toBeInstanceOf(WrongPasswordError);

    expect(calls).toEqual([]);
  });
});

describe('importBackupFile — legacy v1 archive (no meta.json)', () => {
  it('still imports through the single-store path', async () => {
    const { BlobWriter, TextReader, ZipWriter } = await import('@zip.js/zip.js');
    const writer = new ZipWriter(new BlobWriter('application/zip'));
    await writer.add('orders.json', new TextReader(ordersJson('v1-order')), {
      password: PASSWORD + STORE_A,
    });
    const blob = await writer.close();
    const payload = new Uint8Array(await blob.arrayBuffer());
    const calls: SyncedStore[] = [];

    const result = await importBackupFile({
      payload,
      password: PASSWORD,
      user: storeUser,
      selectedStoreId: STORE_A,
      createServices: makeServices(calls),
      unwrapDek: vi.fn(async () => null),
      storesWithLocalDek: new Set([STORE_A]),
    });

    expect(result.succeeded).toBe(true);
    expect(calls).toEqual([{ storeId: STORE_A, orderIds: ['v1-order'], dekStoreId: null }]);
  });
});

// ─── v3 archives: every authorized store ──────────────────────────────────

describe('importBackupFile — v3 archive (several stores)', () => {
  async function multiStoreArchive(): Promise<Uint8Array> {
    return writeMultiStoreArchive(
      [
        { storeId: STORE_A, entries: entries('a-order') },
        { storeId: STORE_B, entries: entries('b-order') },
      ],
      PASSWORD,
    );
  }

  it('imports EVERY store of an Owner, each under its own key', async () => {
    const calls: SyncedStore[] = [];

    const result = await importBackupFile({
      payload: await multiStoreArchive(),
      password: PASSWORD,
      user: ownerWithMultiStores,
      selectedStoreId: STORE_A,
      createServices: makeServices(calls),
      unwrapDek: vi.fn(async (storeId: string) =>
        storeId === STORE_A ? dekA : storeId === STORE_B ? dekB : null,
      ),
      storesWithLocalDek: new Set([STORE_A, STORE_B]),
    });

    expect(result.succeeded).toBe(true);
    expect(calls).toEqual([
      { storeId: STORE_A, orderIds: ['a-order'], dekStoreId: STORE_A },
      { storeId: STORE_B, orderIds: ['b-order'], dekStoreId: STORE_B },
    ]);
    // The active pair is back to "no key" after the run.
    expect(getDekStoreId()).toBeNull();
  });

  it('imports both stores on a plaintext device with no key at all', async () => {
    const calls: SyncedStore[] = [];

    const result = await importBackupFile({
      payload: await multiStoreArchive(),
      password: PASSWORD,
      user: ownerWithMultiStores,
      selectedStoreId: STORE_A,
      createServices: makeServices(calls),
      unwrapDek: vi.fn(async () => null),
      storesWithLocalDek: new Set([STORE_A, STORE_B]),
    });

    expect(result.succeeded).toBe(true);
    expect(calls.map((call) => call.storeId)).toEqual([STORE_A, STORE_B]);
    expect(calls.map((call) => call.dekStoreId)).toEqual([null, null]);
  });

  it('never imports a store the Owner does not hold locally', async () => {
    const calls: SyncedStore[] = [];

    const result = await importBackupFile({
      payload: await multiStoreArchive(),
      password: PASSWORD,
      user: ownerWithMultiStores,
      selectedStoreId: STORE_A,
      createServices: makeServices(calls),
      unwrapDek: vi.fn(async (storeId: string) => (storeId === STORE_A ? dekA : dekB)),
      // This device only ever logged into STORE_A.
      storesWithLocalDek: new Set([STORE_A]),
    });

    expect(result.succeeded).toBe(true);
    expect(calls.map((call) => call.storeId)).toEqual([STORE_A]);
  });

  it('imports an Owner store that is NOT the selected one', async () => {
    const calls: SyncedStore[] = [];

    const result = await importBackupFile({
      payload: await writeMultiStoreArchive(
        [{ storeId: STORE_B, entries: entries('b-order') }],
        PASSWORD,
      ),
      password: PASSWORD,
      user: ownerWithMultiStores,
      selectedStoreId: STORE_A,
      createServices: makeServices(calls),
      unwrapDek: vi.fn(async (storeId: string) => (storeId === STORE_B ? dekB : null)),
      storesWithLocalDek: new Set([STORE_A, STORE_B]),
    });

    expect(result.succeeded).toBe(true);
    expect(calls).toEqual([
      { storeId: STORE_B, orderIds: ['b-order'], dekStoreId: STORE_B },
    ]);
  });

  it('imports ONLY their own store for a StoreUser', async () => {
    const calls: SyncedStore[] = [];

    const result = await importBackupFile({
      payload: await multiStoreArchive(),
      password: PASSWORD,
      user: storeUser,
      selectedStoreId: STORE_A,
      createServices: makeServices(calls),
      unwrapDek: vi.fn(async (storeId: string) => (storeId === STORE_A ? dekA : dekB)),
      storesWithLocalDek: new Set([STORE_A, STORE_B]),
    });

    expect(result.succeeded).toBe(true);
    expect(calls).toEqual([
      { storeId: STORE_A, orderIds: ['a-order'], dekStoreId: STORE_A },
    ]);
  });

  it('rejects an archive that belongs entirely to another owner, with no writes', async () => {
    const otherOwner = makeUser({
      isOwnerAdmin: true,
      storeModuleIds: [EModules.MultiStores],
      storeList: [{ id: STORE_C, name: 'C', isActive: true }],
    });
    const calls: SyncedStore[] = [];

    await expect(
      importBackupFile({
        payload: await multiStoreArchive(),
        password: PASSWORD,
        user: otherOwner,
        selectedStoreId: STORE_C,
        createServices: makeServices(calls),
        unwrapDek: vi.fn(async (storeId: string) => (storeId === STORE_C ? dekA : null)),
        storesWithLocalDek: new Set([STORE_C]),
      }),
    ).rejects.toBeInstanceOf(WrongStoreError);

    expect(calls).toEqual([]);
  });

  it('rejects a wrong password with no writes', async () => {
    const calls: SyncedStore[] = [];

    await expect(
      importBackupFile({
        payload: await multiStoreArchive(),
        password: 'wrong',
        user: ownerWithMultiStores,
        selectedStoreId: STORE_A,
        createServices: makeServices(calls),
        unwrapDek: vi.fn(async (storeId: string) => (storeId === STORE_A ? dekA : dekB)),
        storesWithLocalDek: new Set([STORE_A, STORE_B]),
      }),
    ).rejects.toBeInstanceOf(WrongPasswordError);

    expect(calls).toEqual([]);
  });
});
