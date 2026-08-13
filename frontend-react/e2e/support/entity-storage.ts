import type { Page } from '@playwright/test';

/** Mirrors `StorageKeys.entityKey` (app/shared/lib/storage/storage-keys.ts:8-9). */
export function entityKey(entity: string, storeId: string): string {
  return `lizoft.store-${entity}-${storeId}`;
}

/**
 * The RAW stored string, ciphertext included — never the decrypted value. The
 * point of these assertions is that the bytes on disk did not change, so the
 * comparison has to happen on the bytes, not on what the app renders from them.
 */
export async function readEntityBytes(
  page: Page,
  entity: string,
  storeId: string,
): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), entityKey(entity, storeId));
}
