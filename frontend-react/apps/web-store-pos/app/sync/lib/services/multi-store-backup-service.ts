import { EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import { isModuleAvailable, isOwnerAdmin } from '~/shared/lib/auth/authorization-service';
import { getDek, withStoreDek } from '~/shared/lib/storage/data-key-store';
import {
  peekBackupFormatVersion,
  readMultiStoreArchive,
  V3_MULTI_FORMAT_VERSION,
  writeMultiStoreArchive,
  WrongStoreError,
} from './data-serializer-service';
import type { StoreBackupEntries } from './data-serializer-service';
import type { StoreSyncServices } from './store-sync-services-factory';
import type { EntityMergeResult, SyncEntityError, SyncResult } from './data-synchronizer-service';

/**
 * multi-store-backup — export/import spanning EVERY store of an Owner instead
 * of only the selected one.
 *
 * - Export: reads each store with ITS OWN DEK (unwrapped from the device wrap
 *   table) and packs everything into one v3 archive.
 * - Import: writes each store listed in the archive that this user may write,
 *   with the same store-scoped write path a single-store import uses.
 * - Old (v1/v2) archives never reach this service: `peekBackupFormatVersion`
 *   routes them to the unchanged single-store path, so a one-store backup still
 *   imports into exactly one store.
 */

export class MissingStoreKeyError extends Error {
  readonly name = 'MissingStoreKeyError';
  constructor(message = 'No store data key is available on this device') {
    super(message);
    Object.setPrototypeOf(this, MissingStoreKeyError.prototype);
  }
}

/** Reported per store when the device holds no key to write that store with. */
export const MissingStoreKeySyncError = {
  code: 'Synchronizer.MultiStoreBackupMissingKey',
  message:
    'No se pudo importar una tienda del archivo porque este dispositivo no tiene su clave de datos.',
} as const;

export interface MultiStoreBackupDeps {
  /** Builds a store's read + write services. Must run under that store's DEK. */
  createServices(storeId: string): StoreSyncServices;
  /** This device's DEK for `storeId`, or null when it holds none. */
  unwrapDek(storeId: string): Promise<Uint8Array | null>;
}

/**
 * The stores a backup covers for this session, most-specific first: the
 * selected store always, plus — for an OwnerAdmin with the MultiStores module —
 * every ACTIVE store whose key this device holds (a store with no local key has
 * no readable local data, and an old backup of it cannot be written either).
 *
 * A StoreUser is not an OwnerAdmin, so the result is their one store: their
 * import can never write another store, by construction.
 */
export function resolveBackupStoreIds(
  user: UserModel | null,
  selectedStoreId: string,
  storesWithLocalDek: Set<string>,
): string[] {
  const storeIds: string[] = selectedStoreId ? [selectedStoreId] : [];
  if (!user || !selectedStoreId) return storeIds;
  if (!isOwnerAdmin(user) || !isModuleAvailable(user, EModules.MultiStores)) return storeIds;

  for (const store of user.storeList ?? []) {
    if (!store || typeof store.id !== 'string' || store.id === '') continue;
    if (store.isActive === false) continue;
    if (!storesWithLocalDek.has(store.id)) continue;
    if (!storeIds.includes(store.id)) storeIds.push(store.id);
  }
  return storeIds;
}

/** Everything the import route needs to import one file. */
export interface BackupImportRequest {
  payload: Uint8Array;
  password: string;
  user: UserModel | null;
  selectedStoreId: string;
  createServices(storeId: string): StoreSyncServices;
  unwrapDek(storeId: string): Promise<Uint8Array | null>;
  storesWithLocalDek: Set<string>;
}

/**
 * The ONE import entry point, dispatched on the archive's own envelope:
 *
 * - v3 (multi-store) → every store in the file this user may write, each under
 *   its own DEK. An Owner gets all of their stores; a StoreUser gets only their
 *   own, because `resolveBackupStoreIds` never yields another store for them.
 * - v2 / legacy v1 (one store) → the UNCHANGED single-store path (store
 *   validation, decryption, merge), which is what keeps already-exported
 *   backups importable into exactly the one store they describe.
 *
 * Nothing is written when the archive cannot be read: the single-store path
 * imports/decrypts before merging, and the multi-store path reads the whole
 * archive before its first write.
 */
export async function importBackupFile(request: BackupImportRequest): Promise<SyncResult> {
  const formatVersion = await peekBackupFormatVersion(request.payload);

  if (formatVersion === V3_MULTI_FORMAT_VERSION) {
    const storeIds = resolveBackupStoreIds(
      request.user,
      request.selectedStoreId,
      request.storesWithLocalDek,
    );
    const backup = new MultiStoreBackupService({
      createServices: request.createServices,
      unwrapDek: request.unwrapDek,
    });
    return backup.importArchive(request.payload, request.password, storeIds);
  }

  const services = request.createServices(request.selectedStoreId);
  const parsedData = await services.serializer.import(request.payload, request.password);
  return services.synchronizer.sync(parsedData);
}

export class MultiStoreBackupService {
  constructor(private readonly deps: MultiStoreBackupDeps) {}

  /**
   * Builds one v3 archive with every store in `storeIds` whose data this device
   * can read. Stores it cannot read (no key here, while another store's key is
   * active in memory) are skipped rather than exported wrong: their ciphertext
   * would not decrypt under the active key anyway.
   */
  async exportStores(storeIds: string[], password: string): Promise<Uint8Array> {
    const stores: StoreBackupEntries[] = [];
    for (const storeId of storeIds) {
      const entries = await this.collectStoreEntries(storeId);
      if (entries) stores.push({ storeId, entries });
    }
    if (stores.length === 0) throw new MissingStoreKeyError();
    return writeMultiStoreArchive(stores, password);
  }

  /**
   * Imports every store in the archive that is in `allowedStoreIds`, each under
   * its own DEK. Throws WrongStoreError BEFORE any write when none of the
   * archive's stores belong to this user (an archive from another owner), the
   * same fail-fast contract the single-store import has.
   */
  async importArchive(
    payload: Uint8Array,
    password: string,
    allowedStoreIds: Iterable<string>,
  ): Promise<SyncResult> {
    const allowed = new Set(allowedStoreIds);
    const archive = await readMultiStoreArchive(payload, password);
    const importable = archive.filter((store) => allowed.has(store.storeId));
    if (importable.length === 0) throw new WrongStoreError();

    const merges: EntityMergeResult[] = [];
    const errors: SyncEntityError[] = [];

    for (const store of importable) {
      const storeDek = await this.deps.unwrapDek(store.storeId);
      if (storeDek === null && getDek() !== null) {
        // A key is active but it is not this store's: writing now would encrypt
        // the store's data under another store's key. Skip and report.
        errors.push({
          entity: 'backup',
          code: MissingStoreKeySyncError.code,
          message: MissingStoreKeySyncError.message,
        });
        continue;
      }

      const run = async (): Promise<SyncResult> => {
        const services = this.deps.createServices(store.storeId);
        const data = services.serializer.parseContents(store.entries);
        return services.synchronizer.sync(data);
      };
      const result = storeDek ? await withStoreDek(store.storeId, storeDek, run) : await run();

      merges.push(...result.merges);
      errors.push(...result.errors);
    }

    return { succeeded: errors.length === 0, errors, merges };
  }

  /**
   * Reads one store's entries, under that store's key. Returns null when the
   * store cannot be read on this device (no local key while another store's key
   * is the active one).
   */
  private async collectStoreEntries(storeId: string): Promise<Map<string, string> | null> {
    const storeDek = await this.deps.unwrapDek(storeId);
    if (storeDek) {
      return withStoreDek(storeId, storeDek, () =>
        this.deps.createServices(storeId).serializer.collectEntries(),
      );
    }
    // No per-store key: the data can only be plaintext (never provisioned on
    // this device), which reads fine with no key active. With another store's
    // key active, this store's ciphertext would fail to decrypt.
    if (getDek() !== null) return null;
    return this.deps.createServices(storeId).serializer.collectEntries();
  }
}
