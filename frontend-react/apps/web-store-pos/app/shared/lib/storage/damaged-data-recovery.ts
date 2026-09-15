// Manual recovery of damaged data — the way out of the popup the app-wide
// decryption policy shows when an entity cannot be read
// (`ENCRYPTION.DATA_DAMAGED`, plan:
// docs/plans/2026-09-15-damaged-data-recovery-export-wipe-plan.md).
//
// WHAT IT REPLACES: today that popup is a dead end. One unreadable entity
// signs the user out, and the damaged bytes go on blocking every later read,
// so they can neither get in nor start over. This module turns the dead end
// into two deliberate steps, in this order:
//   1. hand over ONE plain JSON file with everything still readable;
//   2. wipe this store's data on this device — and only after the user
//      explicitly confirms they saved the file.
//
// WHY IT DOES NOT REUSE THE NORMAL EXPORT: `DataSerializerService.export()`
// reads every entity through the decrypting read path (so it fails on exactly
// the entity that got us here) and demands the user's export password, which
// is not in memory at this point. A plain JSON file is the only artifact this
// code can always produce, and it needs no password to be read back.
//
// WHY IT MUST RUN BEFORE `logout()`: the damage is detected while the DEK is
// still in memory, and `logout()` calls `clearDek()`. Capturing after the
// logout would leave only raw ciphertext and lose every readable entity. The
// caller (`decryption-failure-policy.ts`) captures the bundle synchronously,
// before it ends the session; this module never reads the DEK itself.
//
// SCOPE (hard restriction, same as `clearStoreData`): exactly
// `BUSINESS_ENTITY_NAMES` under `StorageKeys.entityKey(entity, storeId)`.
// NEVER `token`, `AUTH_MODEL`, `currentUser`, `language`, the offline roster,
// the device wrap table (`DEVICE_DEK_KEY`) or the DEK itself.
import { confirmDialog, showAcknowledgeError, showBlockingInfo, showBlockingSuccess } from '../blocking-alert';
import { GlobalConfig } from '../config/global-config';
import messages from '../i18n/es';
import { useCartStore } from '../stores/cart-store';
import { decryptEntity, isEncrypted } from './entity-crypto';
import { BUSINESS_ENTITY_NAMES, StorageKeys } from './storage-keys';
import { clearStoreData } from './store-data-reset';

type BusinessEntityName = (typeof BUSINESS_ENTITY_NAMES)[number];

/** Bumped when the shape of the file changes, so a file found later can say
 * which generation of this module wrote it. */
export const RECOVERY_FORMAT_VERSION = 1;

/** An entity the store never wrote. Absent is not damage. */
export interface RecoveryEntityAbsent {
  readonly entity: BusinessEntityName;
  readonly storageKey: string;
  readonly present: false;
  readonly encrypted: false;
  readonly readable: false;
  readonly bytes: 0;
}

/** An entity that came back whole: the parsed JSON the app would have read. */
export interface RecoveryEntityReadable {
  readonly entity: BusinessEntityName;
  readonly storageKey: string;
  readonly present: true;
  readonly encrypted: boolean;
  readonly readable: true;
  readonly bytes: number;
  readonly data: unknown;
}

/**
 * An entity that could not be read. `raw` is the stored string VERBATIM — for
 * an encrypted entity that is the whole `enc:v1:` envelope, kept because the
 * bytes are the only copy left of that data.
 */
export interface RecoveryEntityUnreadable {
  readonly entity: BusinessEntityName;
  readonly storageKey: string;
  readonly present: true;
  readonly encrypted: boolean;
  readonly readable: false;
  readonly bytes: number;
  readonly errorName: string;
  readonly raw: string;
}

export type RecoveryEntityReport =
  | RecoveryEntityAbsent
  | RecoveryEntityReadable
  | RecoveryEntityUnreadable;

export interface RecoveryBundleMeta {
  /** Lets whoever opens the file know it is not a normal export. */
  readonly kind: 'damaged-recovery';
  readonly formatVersion: number;
  readonly storeId: string;
  readonly exportedAt: string;
  readonly appVersion: string;
}

export interface RecoveryBundle {
  readonly meta: RecoveryBundleMeta;
  readonly entities: readonly RecoveryEntityReport[];
}

/**
 * Did the user save the file and go through with the wipe?
 *   - `kept`: they cancelled the second confirmation; storage is byte-identical.
 *   - `wiped`: `clearStoreData` ran. `failedEntities` names the keys it could
 *     not confirm removing (empty when every key went).
 */
export type RecoveryOutcome =
  | { readonly status: 'kept' }
  | { readonly status: 'wiped'; readonly failedEntities: readonly string[] };

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * One entity's report. Called per entity, and every failure is caught HERE so
 * that one unreadable entity can never cost the user the remaining nine (the
 * same per-key isolation `clearStoreData` and `entity-migration` follow).
 */
function readEntityReport(entity: BusinessEntityName, storeId: string): RecoveryEntityReport {
  const storageKey = StorageKeys.entityKey(entity, storeId);
  const raw = localStorage.getItem(storageKey);

  if (raw === null) {
    return { entity, storageKey, present: false, encrypted: false, readable: false, bytes: 0 };
  }

  const bytes = byteLength(raw);
  try {
    // `raw` is non-null here, and `decryptEntity` returns null only for a null
    // input, so this is a string.
    const plaintext = decryptEntity(raw) as string;
    const data: unknown = JSON.parse(plaintext);
    return {
      entity,
      storageKey,
      present: true,
      encrypted: isEncrypted(raw),
      readable: true,
      bytes,
      data,
    };
  } catch (err) {
    // The bytes that did not authenticate (or did not parse) go into the file
    // as-is, with the error's `name` and the payload's size: the report has to
    // be honest about what was NOT recovered, not just about what was.
    return {
      entity,
      storageKey,
      present: true,
      encrypted: isEncrypted(raw),
      readable: false,
      bytes,
      errorName: (err as { name?: string } | null)?.name ?? 'Error',
      raw,
    };
  }
}

/**
 * Reads every business entity of `storeId` straight from `localStorage` — the
 * decrypting read path is what fails in the situation this exists for, so it
 * cannot be used to build the recovery file.
 *
 * MUST be called before `logout()`: the readable entries are decrypted with
 * the DEK that `logout()` clears.
 */
export function collectRecoveryBundle(storeId: string): RecoveryBundle {
  return {
    meta: {
      kind: 'damaged-recovery',
      formatVersion: RECOVERY_FORMAT_VERSION,
      storeId,
      exportedAt: new Date().toISOString(),
      appVersion: GlobalConfig.APP_VERSION,
    },
    entities: BUSINESS_ENTITY_NAMES.map((entity) => readEntityReport(entity, storeId)),
  };
}

/** The file's contents: one indented JSON document, readable by a human and by
 * `JSON.parse` with no password. */
export function serializeRecoveryBundle(bundle: RecoveryBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/** `recuperacion-datos-YYMMDD-HHMM.json`, local time — the same stamp layout
 * `export.tsx` uses for `datos-plano-*.json`. */
export function recoveryExportFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(2);
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `recuperacion-datos-${yy}${mm}${dd}-${hh}${min}.json`;
}

/**
 * Delivers the bundle with the same plain download anchor as `export.tsx`
 * (Blob → object URL → `<a download>` → click → revoke), never
 * `navigator.share`: file-sharing is unsupported on desktop, where the call
 * throws and the recovery file would never reach the user.
 *
 * The filename is stamped from the bundle's own `exportedAt`, so the file and
 * its contents cannot disagree about when it was written.
 */
export function downloadRecoveryBundle(bundle: RecoveryBundle): void {
  const blob = new Blob([serializeRecoveryBundle(bundle)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = recoveryExportFilename(new Date(bundle.meta.exportedAt));
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The second half of the flow the damaged-data dialog opens: save the file,
 * ask once more, and only then wipe this store's data on this device.
 *
 * The confirmation is not a formality. Nothing here can know whether the
 * download actually reached the disk, so the only honest way to proceed is to
 * say what is about to happen and let the user decide. A cancel leaves storage
 * untouched — the same promise "No se borró nada." makes on the popup itself.
 */
export async function offerRecoveryAfterDamage(bundle: RecoveryBundle): Promise<RecoveryOutcome> {
  downloadRecoveryBundle(bundle);

  const confirmed = await confirmDialog({
    title: messages['ENCRYPTION.RECOVERY_CONFIRM_TITLE'],
    message: messages['ENCRYPTION.RECOVERY_CONFIRM_MESSAGE'],
    confirmButtonText: messages['ENCRYPTION.RECOVERY_CONFIRM_BUTTON'],
    cancelButtonText: messages['ENCRYPTION.RECOVERY_CANCEL_BUTTON'],
  });

  if (!confirmed) {
    await showBlockingInfo(messages['GENERAL.INFORMATION'], messages['ENCRYPTION.RECOVERY_KEPT']);
    return { status: 'kept' };
  }

  // Reused, not reimplemented: it is idempotent, isolated per key, scoped to
  // this store's business entities, and reports what it could not remove.
  const failedEntities = clearStoreData(bundle.meta.storeId);

  // The cart is zustand-persisted state with an in-memory copy (see the note
  // in `store-data-reset.ts`): removing keys behind its back would leave a
  // basket pointing at products this wipe just deleted, so it is cleared
  // through its own action.
  useCartStore.getState().clear();

  if (failedEntities.length === 0) {
    await showBlockingSuccess(messages['ENCRYPTION.RECOVERY_WIPED']);
    return { status: 'wiped', failedEntities: [] };
  }

  // A partial wipe is reported by name: claiming success for a failure the
  // code already knows about would hide data the user believes is gone.
  showAcknowledgeError({
    title: messages['GENERAL.ERROR'],
    message: `${messages['ENCRYPTION.RECOVERY_WIPED_PARTIAL']}${failedEntities.join(', ')}`,
    confirmButtonText: messages['GENERAL.CLOSE'],
  });
  return { status: 'wiped', failedEntities };
}
