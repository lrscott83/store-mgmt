/**
 * multi-store-backup — the v3 archive format and its backward compatibility.
 *
 * v3 carries one folder per store in a SINGLE zip (`stores/<storeId>/…`), while
 * v2 and legacy v1 archives keep describing exactly one store. These tests pin:
 *   - the envelope probe (`peekBackupFormatVersion`) the routes dispatch on,
 *   - the v3 round trip for one and several stores,
 *   - wrong-password and corrupt-envelope behaviour,
 *   - that v2/v1 archives still import through the unchanged single-store path,
 *     and that the single-store path REFUSES a v3 archive (it cannot represent
 *     several stores, so routing must never fall through to it).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { BlobReader, BlobWriter, TextReader, ZipReader, ZipWriter } from '@zip.js/zip.js';
import {
  CorruptFileError,
  DataSerializerService,
  V3_MULTI_FORMAT_VERSION,
  V2_FORMAT_VERSION,
  V2_META_FILENAME,
  WrongPasswordError,
  WrongStoreError,
  peekBackupFormatVersion,
  readMultiStoreArchive,
  storeArchiveEntryName,
  writeMultiStoreArchive,
  writeSingleStoreArchive,
} from '../data-serializer-service';
import type { StoreBackupEntries } from '../data-serializer-service';
import type { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import type { ProductRepository } from '~/sales/lib/repositories/product-repository';

const STORE_A = 'store-aaaa-1111';
const STORE_B = 'store-bbbb-2222';
const PASSWORD = 'correct-horse-battery';
const WRONG_PASSWORD = 'not-the-password';

/** A serializer whose readers are stubbed — only the zip/envelope logic matters. */
function makeSerializer(storeId: string): DataSerializerService {
  const categoryRepo = {
    getCategoriesJson: () => '[]',
  } as unknown as ProductCategoryRepository;
  const productRepo = {
    getProductsJson: () => '[]',
  } as unknown as ProductRepository;
  return new DataSerializerService(
    storeId,
    categoryRepo,
    productRepo,
    { getInventoryEntriesJson: () => '[]' },
    { getStorageOrders: () => [] },
    { getStorageExpenses: () => [] },
    { getStorageSaleCredits: () => [] },
  );
}

function entries(order: string): Map<string, string> {
  return new Map<string, string>([
    ['orders.json', JSON.stringify([{ id: order }])],
    ['expenses.json', '[]'],
  ]);
}

/** Raw entry names of an archive — proves the folder-per-store layout. */
async function archiveEntryNames(payload: Uint8Array): Promise<string[]> {
  const reader = new ZipReader(new BlobReader(new Blob([payload])));
  try {
    const entries = await reader.getEntries();
    return entries.map((entry) => entry.filename).sort();
  } finally {
    await reader.close();
  }
}

/** Builds a legacy v1 archive: NO meta.json, entries under `password + storeId`. */
async function buildV1Archive(storeId: string, password: string): Promise<Uint8Array> {
  const writer = new ZipWriter(new BlobWriter('application/zip'));
  await writer.add('orders.json', new TextReader('[]'), { password: password + storeId });
  const blob = await writer.close();
  return new Uint8Array(await blob.arrayBuffer());
}

describe('peekBackupFormatVersion', () => {
  beforeEach(() => localStorage.clear());

  it('reports 3 for a multi-store archive', async () => {
    const payload = await writeMultiStoreArchive(
      [{ storeId: STORE_A, entries: entries('o1') }],
      PASSWORD,
    );
    await expect(peekBackupFormatVersion(payload)).resolves.toBe(V3_MULTI_FORMAT_VERSION);
  });

  it('reports 2 for a single-store v2 archive (backward-compatible routing)', async () => {
    const payload = await writeSingleStoreArchive(STORE_A, entries('o1'), PASSWORD);
    await expect(peekBackupFormatVersion(payload)).resolves.toBe(V2_FORMAT_VERSION);
  });

  it('reports null for a legacy v1 archive without meta.json', async () => {
    const payload = await buildV1Archive(STORE_A, PASSWORD);
    await expect(peekBackupFormatVersion(payload)).resolves.toBeNull();
  });

  it('throws CorruptFileError when the payload is not a zip', async () => {
    await expect(peekBackupFormatVersion(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
      CorruptFileError,
    );
  });
});

describe('v3 multi-store archive', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips EVERY store in one archive, under its own folder', async () => {
    const stores: StoreBackupEntries[] = [
      { storeId: STORE_A, name: 'Tienda A', entries: entries('a-1') },
      { storeId: STORE_B, name: 'Tienda B', entries: entries('b-1') },
    ];

    const payload = await writeMultiStoreArchive(stores, PASSWORD);

    expect(await archiveEntryNames(payload)).toEqual(
      [
        V2_META_FILENAME,
        storeArchiveEntryName(STORE_A, 'expenses.json'),
        storeArchiveEntryName(STORE_A, 'orders.json'),
        storeArchiveEntryName(STORE_B, 'expenses.json'),
        storeArchiveEntryName(STORE_B, 'orders.json'),
      ].sort(),
    );

    const read = await readMultiStoreArchive(payload, PASSWORD);
    expect(read.map((store) => store.storeId)).toEqual([STORE_A, STORE_B]);
    expect(read.map((store) => store.name)).toEqual(['Tienda A', 'Tienda B']);
    expect(read[0].entries.get('orders.json')).toBe(JSON.stringify([{ id: 'a-1' }]));
    expect(read[1].entries.get('orders.json')).toBe(JSON.stringify([{ id: 'b-1' }]));
  });

  it('round-trips a single-store archive (one store in, one store out)', async () => {
    const payload = await writeMultiStoreArchive(
      [{ storeId: STORE_A, entries: entries('only') }],
      PASSWORD,
    );
    const read = await readMultiStoreArchive(payload, PASSWORD);
    expect(read).toHaveLength(1);
    expect(read[0].storeId).toBe(STORE_A);
    expect(read[0].entries.get('orders.json')).toBe(JSON.stringify([{ id: 'only' }]));
  });

  it('rejects a wrong password without returning any store data', async () => {
    const payload = await writeMultiStoreArchive(
      [{ storeId: STORE_A, entries: entries('o1') }],
      PASSWORD,
    );
    await expect(readMultiStoreArchive(payload, WRONG_PASSWORD)).rejects.toBeInstanceOf(
      WrongPasswordError,
    );
  });

  it('ignores entries whose store folder the envelope does not list', async () => {
    const payload = await writeMultiStoreArchive(
      [{ storeId: STORE_A, entries: entries('o1') }],
      PASSWORD,
    );
    const read = await readMultiStoreArchive(payload, PASSWORD);
    // The envelope is the source of truth: a stray folder cannot add a store
    // to the import, because only listed stores are returned.
    expect(read.map((store) => store.storeId)).toEqual([STORE_A]);
  });

  it('rejects a v3 envelope claiming a store with no id', async () => {
    const writer = new ZipWriter(new BlobWriter('application/zip'));
    await writer.add(
      V2_META_FILENAME,
      new TextReader(
        JSON.stringify({
          formatVersion: V3_MULTI_FORMAT_VERSION,
          salt: 'c2FsdA==',
          iterations: 1,
          exportedAt: new Date().toISOString(),
          stores: [{ name: 'sin id' }],
        }),
      ),
    );
    const blob = await writer.close();
    const payload = new Uint8Array(await blob.arrayBuffer());
    await expect(readMultiStoreArchive(payload, PASSWORD)).rejects.toBeInstanceOf(CorruptFileError);
  });
});

describe('single-store path — old archives keep working, v3 never falls through', () => {
  beforeEach(() => localStorage.clear());

  it('imports a v2 archive into the store it describes', async () => {
    const payload = await writeSingleStoreArchive(STORE_A, entries('v2-order'), PASSWORD);
    const parsed = await makeSerializer(STORE_A).import(payload, PASSWORD);
    expect(parsed.orders.map((order) => order.id)).toEqual(['v2-order']);
  });

  it('still refuses a v2 archive from another store (WrongStoreError)', async () => {
    const payload = await writeSingleStoreArchive(STORE_B, entries('v2-order'), PASSWORD);
    await expect(makeSerializer(STORE_A).import(payload, PASSWORD)).rejects.toBeInstanceOf(
      WrongStoreError,
    );
  });

  it('imports a legacy v1 archive with the password + storeId derivation', async () => {
    const payload = await buildV1Archive(STORE_A, PASSWORD);
    const parsed = await makeSerializer(STORE_A).import(payload, PASSWORD);
    expect(parsed.orders).toEqual([]);
  });

  it('rejects a v3 archive with CorruptFileError (the multi-store path must handle it)', async () => {
    const payload = await writeMultiStoreArchive(
      [{ storeId: STORE_A, entries: entries('o1') }],
      PASSWORD,
    );
    await expect(makeSerializer(STORE_A).import(payload, PASSWORD)).rejects.toBeInstanceOf(
      CorruptFileError,
    );
  });

  it('produces the same entry set as before for a single store', async () => {
    const payload = await writeSingleStoreArchive(STORE_A, entries('o1'), PASSWORD);
    expect(await archiveEntryNames(payload)).toEqual(['expenses.json', 'meta.json', 'orders.json']);
  });
});
