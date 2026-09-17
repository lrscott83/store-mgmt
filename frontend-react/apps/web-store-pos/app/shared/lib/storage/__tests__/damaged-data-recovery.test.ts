import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Product } from '@store-mgmt/domain';
import { BUSINESS_ENTITY_NAMES, StorageKeys } from '../storage-keys';
import { setDek, clearDek } from '../data-key-store';
import { encryptEntity } from '../entity-crypto';
import { GlobalConfig } from '../../config/global-config';
import { useCartStore } from '../../stores/cart-store';
import messages from '../../i18n/es';
import {
  collectRecoveryBundle,
  serializeRecoveryBundle,
  recoveryExportFilename,
  downloadRecoveryBundle,
  offerRecoveryAfterDamage,
  RECOVERY_FORMAT_VERSION,
  type RecoveryBundle,
  type RecoveryEntityReadable,
  type RecoveryEntityReport,
  type RecoveryEntityUnreadable,
} from '../damaged-data-recovery';

const STORE = 's1';
const OTHER_STORE = 's2';

// A fixed DEK so `encryptEntity`/`decryptEntity` have real key material:
// the damaged case only exists with the DEK in memory (that is the whole
// reason the capture has to happen before `logout()`).
const DEK = new Uint8Array(32).fill(7);

const confirmDialogMock = vi.fn();
const showBlockingSuccessMock = vi.fn();
const showBlockingInfoMock = vi.fn();
const showAcknowledgeErrorMock = vi.fn();
vi.mock('../../blocking-alert', () => ({
  confirmDialog: (...args: unknown[]) => confirmDialogMock(...args),
  showBlockingSuccess: (...args: unknown[]) => showBlockingSuccessMock(...args),
  showBlockingInfo: (...args: unknown[]) => showBlockingInfoMock(...args),
  showAcknowledgeError: (...args: unknown[]) => showAcknowledgeErrorMock(...args),
}));

function entityKey(entity: string, storeId = STORE): string {
  return StorageKeys.entityKey(entity, storeId);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

// jsdom does not guarantee a global `Buffer` (same note as
// `read-entity-or-throw.test.ts`), so base64-encode via `btoa`.
function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

/** A well-formed `enc:v1:` envelope whose GCM tag cannot verify under any key:
 * the real shape of an `EntityUnreadableError` from the decrypt path. */
function corruptCiphertext(): string {
  return `enc:v1:${base64FromBytes(new Uint8Array(60))}`;
}

function reportFor(bundle: RecoveryBundle, entity: string): RecoveryEntityReport {
  const report = bundle.entities.find((entry) => entry.entity === entity);
  if (!report) throw new Error(`no report for ${entity}`);
  return report;
}

function readable(bundle: RecoveryBundle, entity: string): RecoveryEntityReadable {
  const report = reportFor(bundle, entity);
  expect(report.readable).toBe(true);
  return report as RecoveryEntityReadable;
}

function unreadable(bundle: RecoveryBundle, entity: string): RecoveryEntityUnreadable {
  const report = reportFor(bundle, entity);
  expect(report.readable).toBe(false);
  return report as RecoveryEntityUnreadable;
}

/** Every entity of the store holds a small, valid plaintext collection. */
function seedStoreWithPlaintext(storeId = STORE): void {
  for (const entity of BUSINESS_ENTITY_NAMES) {
    localStorage.setItem(entityKey(entity, storeId), JSON.stringify([{ id: entity }]));
  }
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  clearDek();
  useCartStore.getState().clear();
  confirmDialogMock.mockResolvedValue(false);
  showBlockingSuccessMock.mockResolvedValue(undefined);
  showBlockingInfoMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('collectRecoveryBundle — scope', () => {
  it('covers exactly the ten business entities of the given store, and nothing else', () => {
    const bundle = collectRecoveryBundle(STORE);

    expect(bundle.entities.map((entry) => entry.entity)).toEqual([...BUSINESS_ENTITY_NAMES]);
    expect(bundle.entities.map((entry) => entry.storageKey)).toEqual(
      BUSINESS_ENTITY_NAMES.map((entity) => StorageKeys.entityKey(entity, STORE)),
    );
  });

  it('marks an entity the store never wrote as absent — absence is not damage', () => {
    const bundle = collectRecoveryBundle(STORE);

    for (const report of bundle.entities) {
      expect(report).toEqual({
        entity: report.entity,
        storageKey: report.storageKey,
        present: false,
        encrypted: false,
        readable: false,
        bytes: 0,
      });
      expect(report).not.toHaveProperty('data');
      expect(report).not.toHaveProperty('raw');
    }
  });

  it('reads only this store — another store’s entities are not swept in', () => {
    seedStoreWithPlaintext(OTHER_STORE);

    const bundle = collectRecoveryBundle(STORE);

    expect(bundle.entities.every((report) => report.present === false)).toBe(true);
  });
});

describe('collectRecoveryBundle — readable entities', () => {
  it('includes an unencrypted entity parsed, with the stored payload size', () => {
    const raw = JSON.stringify([{ id: 'p1', name: 'Pan' }]);
    localStorage.setItem(entityKey('products'), raw);

    const report = readable(collectRecoveryBundle(STORE), 'products');

    expect(report.present).toBe(true);
    expect(report.encrypted).toBe(false);
    expect(report.data).toEqual([{ id: 'p1', name: 'Pan' }]);
    expect(report.bytes).toBe(byteLength(raw));
  });

  it('decrypts an encrypted entity and includes the parsed value — never the ciphertext', () => {
    setDek(DEK, STORE);
    const raw = encryptEntity(JSON.stringify([{ id: 'c1' }]));
    expect(raw.startsWith('enc:v1:')).toBe(true);
    localStorage.setItem(entityKey('product-categories'), raw);

    const report = readable(collectRecoveryBundle(STORE), 'product-categories');

    expect(report.encrypted).toBe(true);
    expect(report.data).toEqual([{ id: 'c1' }]);
    expect(report.bytes).toBe(byteLength(raw));
    expect(report).not.toHaveProperty('raw');
  });

  it('carries the meta a person opening the file needs: kind, version, store, time, app', () => {
    const bundle = collectRecoveryBundle(STORE);

    expect(bundle.meta.kind).toBe('damaged-recovery');
    expect(bundle.meta.formatVersion).toBe(RECOVERY_FORMAT_VERSION);
    expect(bundle.meta.storeId).toBe(STORE);
    expect(bundle.meta.appVersion).toBe(GlobalConfig.APP_VERSION);
    expect(Number.isNaN(Date.parse(bundle.meta.exportedAt))).toBe(false);
  });
});

describe('collectRecoveryBundle — partial damage stays partial', () => {
  it('one unreadable entity never aborts the others, and keeps its raw bytes', () => {
    setDek(DEK, STORE);
    const corrupted = corruptCiphertext();
    localStorage.setItem(entityKey('orders'), corrupted);
    // A second failure shape, from the parse step: valid storage, broken JSON.
    localStorage.setItem(entityKey('expenses'), 'not json at all');
    localStorage.setItem(entityKey('products'), JSON.stringify([{ id: 'p1' }]));

    const bundle = collectRecoveryBundle(STORE);

    const orders = unreadable(bundle, 'orders');
    expect(orders.present).toBe(true);
    expect(orders.encrypted).toBe(true);
    expect(orders.raw).toBe(corrupted);
    expect(orders.bytes).toBe(byteLength(corrupted));
    expect(orders.errorName.length).toBeGreaterThan(0);

    const expenses = unreadable(bundle, 'expenses');
    expect(expenses.encrypted).toBe(false);
    expect(expenses.raw).toBe('not json at all');
    expect(expenses.errorName).toBe('SyntaxError');

    // The point of the per-entity try/catch: the readable nine still arrive.
    expect(readable(bundle, 'products').data).toEqual([{ id: 'p1' }]);
    expect(bundle.entities.filter((report) => report.present)).toHaveLength(3);
  });

  it('reports a missing key as an unreadable entity rather than throwing out of the capture', () => {
    // No DEK in memory, but the value is ciphertext: `decryptEntity` throws
    // `MissingDataKeyError`. Every other entity still has to be reported.
    const raw = corruptCiphertext();
    localStorage.setItem(entityKey('products'), raw);
    localStorage.setItem(entityKey('warehouses'), JSON.stringify([]));

    const bundle = collectRecoveryBundle(STORE);

    const products = unreadable(bundle, 'products');
    expect(products.errorName).toBe('MissingDataKeyError');
    expect(products.raw).toBe(raw);
    expect(readable(bundle, 'warehouses').data).toEqual([]);
  });
});

describe('collectRecoveryBundle — the security boundary', () => {
  it('never carries session, roster, device or store-scoped non-entity material', () => {
    setDek(DEK, STORE);
    seedStoreWithPlaintext();
    localStorage.setItem(StorageKeys.TOKEN, 'SESSION-TOKEN-SENTINEL');
    localStorage.setItem(StorageKeys.AUTH_MODEL, 'AUTH-MODEL-SENTINEL');
    localStorage.setItem(StorageKeys.CURRENT_USER, 'CURRENT-USER-SENTINEL');
    localStorage.setItem(StorageKeys.LANGUAGE, 'LANG-SENTINEL');
    localStorage.setItem('lizoft.offline-roster', 'ROSTER-SENTINEL');
    localStorage.setItem('lizoft.device-dek', 'DEVICE-DEK-SENTINEL');

    const bundle = collectRecoveryBundle(STORE);
    const serialized = serializeRecoveryBundle(bundle);

    for (const sentinel of [
      'SESSION-TOKEN-SENTINEL',
      'AUTH-MODEL-SENTINEL',
      'CURRENT-USER-SENTINEL',
      'LANG-SENTINEL',
      'ROSTER-SENTINEL',
      'DEVICE-DEK-SENTINEL',
    ]) {
      expect(serialized).not.toContain(sentinel);
    }

    const keys = bundle.entities.map((report) => report.storageKey);
    expect(keys).not.toContain(StorageKeys.TOKEN);
    expect(keys).not.toContain(StorageKeys.AUTH_MODEL);
    expect(keys).not.toContain(StorageKeys.CURRENT_USER);
    expect(keys).not.toContain(StorageKeys.LANGUAGE);
    expect(keys).not.toContain('lizoft.offline-roster');
    expect(keys).not.toContain('lizoft.device-dek');
    expect(keys).toHaveLength(BUSINESS_ENTITY_NAMES.length);
  });

  it('leaves storage exactly as it found it — the file is a read, not a migration', () => {
    setDek(DEK, STORE);
    seedStoreWithPlaintext();
    const before = Object.keys(localStorage)
      .sort()
      .map((key) => [key, localStorage.getItem(key)]);

    collectRecoveryBundle(STORE);

    const after = Object.keys(localStorage)
      .sort()
      .map((key) => [key, localStorage.getItem(key)]);
    expect(after).toEqual(before);
  });
});

describe('serializeRecoveryBundle / recoveryExportFilename', () => {
  it('names the file recuperacion-datos-YYMMDD-HHMM.json', () => {
    expect(recoveryExportFilename(new Date(2026, 8, 15, 14, 5))).toBe(
      'recuperacion-datos-260915-1405.json',
    );
  });

  it('zero-pads every stamp component', () => {
    const filename = recoveryExportFilename(new Date(2026, 0, 2, 3, 4));

    expect(filename).toBe('recuperacion-datos-260102-0304.json');
    expect(filename).toMatch(/^recuperacion-datos-\d{6}-\d{4}\.json$/);
  });

  it('serializes to one indented JSON document holding every entity report', () => {
    setDek(DEK, STORE);
    localStorage.setItem(entityKey('orders'), 'not json at all');
    localStorage.setItem(entityKey('products'), JSON.stringify([{ id: 'p1' }]));

    const json = serializeRecoveryBundle(collectRecoveryBundle(STORE));

    expect(json).toContain('\n  "meta"');
    const parsed = JSON.parse(json) as RecoveryBundle;
    expect(parsed.meta.storeId).toBe(STORE);
    expect(parsed.meta.kind).toBe('damaged-recovery');
    expect(parsed.meta.formatVersion).toBe(RECOVERY_FORMAT_VERSION);
    expect(parsed.meta.appVersion).toBe(GlobalConfig.APP_VERSION);
    expect(parsed.entities).toHaveLength(BUSINESS_ENTITY_NAMES.length);
    // The raw bytes of what could NOT be read reach the file too.
    expect(json).toContain('not json at all');
  });
});

describe('downloadRecoveryBundle — delivery', () => {
  const createObjectURLMock = vi.fn((_blob: Blob | MediaSource) => 'blob:mock-url');
  const revokeObjectURLMock = vi.fn((_url: string) => undefined);
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let clicked: Array<{ href: string; download: string }> = [];

  beforeEach(() => {
    clicked = [];
    URL.createObjectURL = createObjectURLMock;
    URL.revokeObjectURL = revokeObjectURLMock;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ href: this.href, download: this.download });
    });
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('downloads one JSON file through an anchor, then revokes the object URL', async () => {
    const bundle: RecoveryBundle = {
      meta: {
        kind: 'damaged-recovery',
        formatVersion: RECOVERY_FORMAT_VERSION,
        storeId: STORE,
        exportedAt: new Date(2026, 8, 15, 14, 5).toISOString(),
        appVersion: GlobalConfig.APP_VERSION,
      },
      entities: collectRecoveryBundle(STORE).entities,
    };

    downloadRecoveryBundle(bundle);

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    const blob = createObjectURLMock.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toEqual(JSON.parse(serializeRecoveryBundle(bundle)));

    expect(clicked).toEqual([
      {
        href: 'blob:mock-url',
        download: recoveryExportFilename(new Date(bundle.meta.exportedAt)),
      },
    ]);
    expect(clicked[0]?.download).toMatch(/^recuperacion-datos-\d{6}-\d{4}\.json$/);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('offerRecoveryAfterDamage — the wipe needs a second, explicit yes', () => {
  const createObjectURLMock = vi.fn(() => 'blob:mock-url');
  const revokeObjectURLMock = vi.fn();
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = createObjectURLMock;
    URL.revokeObjectURL = revokeObjectURLMock;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    useCartStore.getState().addItem({ id: 'p1', price: 5 } as Product, 2);
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('hands over the file BEFORE asking anything, and never wipes on its own', async () => {
    confirmDialogMock.mockResolvedValue(false);
    seedStoreWithPlaintext();

    const outcome = await offerRecoveryAfterDamage(collectRecoveryBundle(STORE));

    // The file came first: there is no version of this flow where the user is
    // asked to lose the data before a copy exists.
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(confirmDialogMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      createObjectURLMock.mock.invocationCallOrder[0] as number,
    );
    expect(outcome).toEqual({ status: 'kept' });
  });

  it('cancelling deletes nothing and says so', async () => {
    confirmDialogMock.mockResolvedValue(false);
    seedStoreWithPlaintext();

    const outcome = await offerRecoveryAfterDamage(collectRecoveryBundle(STORE));

    for (const entity of BUSINESS_ENTITY_NAMES) {
      expect(localStorage.getItem(entityKey(entity))).not.toBeNull();
    }
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(outcome).toEqual({ status: 'kept' });
    expect(showBlockingInfoMock).toHaveBeenCalledWith(
      messages['GENERAL.INFORMATION'],
      messages['ENCRYPTION.RECOVERY_KEPT'],
    );
    expect(showBlockingSuccessMock).not.toHaveBeenCalled();
    expect(showAcknowledgeErrorMock).not.toHaveBeenCalled();
  });

  it('confirming wipes this store’s entities, clears the cart, and reports success', async () => {
    confirmDialogMock.mockResolvedValue(true);
    seedStoreWithPlaintext();
    seedStoreWithPlaintext(OTHER_STORE);
    localStorage.setItem(StorageKeys.TOKEN, 'tok');
    localStorage.setItem(StorageKeys.AUTH_MODEL, '{"authToken":"tok"}');
    localStorage.setItem(StorageKeys.LANGUAGE, 'es');

    const outcome = await offerRecoveryAfterDamage(collectRecoveryBundle(STORE));

    for (const entity of BUSINESS_ENTITY_NAMES) {
      expect(localStorage.getItem(entityKey(entity, STORE))).toBeNull();
      expect(localStorage.getItem(entityKey(entity, OTHER_STORE))).not.toBeNull();
    }
    // The session and device keys survive the wipe, exactly as clearStoreData
    // promises — the user lands on a readable, signable-in device.
    expect(localStorage.getItem(StorageKeys.TOKEN)).toBe('tok');
    expect(localStorage.getItem(StorageKeys.AUTH_MODEL)).toBe('{"authToken":"tok"}');
    expect(localStorage.getItem(StorageKeys.LANGUAGE)).toBe('es');
    expect(useCartStore.getState().items).toEqual([]);
    expect(outcome).toEqual({ status: 'wiped', failedEntities: [] });
    expect(showBlockingSuccessMock).toHaveBeenCalledWith(messages['ENCRYPTION.RECOVERY_WIPED']);
  });

  it('names the entities it could not remove instead of claiming a clean wipe', async () => {
    confirmDialogMock.mockResolvedValue(true);
    seedStoreWithPlaintext();
    const failingKey = entityKey('inventory-entries');
    const realRemoveItem = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === failingKey) throw new Error('quota');
      realRemoveItem.call(this, key);
    });

    const outcome = await offerRecoveryAfterDamage(collectRecoveryBundle(STORE));

    expect(outcome).toEqual({ status: 'wiped', failedEntities: ['inventory-entries'] });
    expect(localStorage.getItem(failingKey)).not.toBeNull();
    expect(showBlockingSuccessMock).not.toHaveBeenCalled();
    expect(showAcknowledgeErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: messages['GENERAL.ERROR'],
        message: `${messages['ENCRYPTION.RECOVERY_WIPED_PARTIAL']}inventory-entries`,
      }),
    );
  });

  it('is idempotent: a second confirmed pass over an already-empty store still succeeds', async () => {
    confirmDialogMock.mockResolvedValue(true);
    seedStoreWithPlaintext();

    const first = await offerRecoveryAfterDamage(collectRecoveryBundle(STORE));
    const second = await offerRecoveryAfterDamage(collectRecoveryBundle(STORE));

    expect(first).toEqual({ status: 'wiped', failedEntities: [] });
    expect(second).toEqual({ status: 'wiped', failedEntities: [] });
  });
});
