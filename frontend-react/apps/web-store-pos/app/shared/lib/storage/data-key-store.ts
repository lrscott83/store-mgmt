// Zero-import leaf module (design §2 module map). Lives under `storage/`,
// NOT `offline/` — design correction 4: `auth-store.logout()` is
// synchronous and must call `clearDek()` via a STATIC import, but
// `auth-store.ts` contracts D6 (zero static `offline/` imports, since the
// module is evaluated on every page load). `storage/` makes the static
// import legal by construction, and this module is a genuine zero-import
// leaf so D6's rationale ("would drag crypto + localStorage offline
// modules") does not apply to it.
//
// Design §1 / §11: the DEK is a module-level `let`, NEVER persisted to
// `localStorage`, `sessionStorage`, or any cookie. This is the entire
// threat model — a storage dump that yields both key and ciphertext is
// obfuscation, not encryption. Consequence: the DEK does not survive a tab
// reload, close, or crash; that is the reason the unlock gate exists.
let dek: Uint8Array | null = null;
let dekStoreId: string | null = null;

export function setDek(bytes: Uint8Array, storeId: string): void {
  dek = bytes;
  dekStoreId = storeId;
}

export function getDek(): Uint8Array | null {
  return dek;
}

export function getDekStoreId(): string | null {
  return dekStoreId;
}

export function clearDek(): void {
  dek = null;
  dekStoreId = null;
}

/**
 * multi-store-backup — runs `run` with the ACTIVE (storeId, DEK) pair scoped to
 * `storeId`, restoring the previous pair afterwards (also on throw).
 *
 * Why this exists and why it is NOT `encryptEntityWithDek`: the backup must WRITE
 * in stores other than the selected one, and every store-scoped repository /
 * offline service already knows how to write correctly — with whatever key the
 * active pair holds. Swapping the PAIR atomically means a store's data is never
 * encrypted while another store's identity is active (the silent cross-store
 * corruption the DEK code exists to prevent), and no write path gains the
 * ability to encrypt with a bare key.
 *
 * NOT reentrant: the backup runs one store at a time and awaits each store's
 * work to completion, so no two calls overlap.
 */
export async function withStoreDek<T>(
  storeId: string,
  storeDek: Uint8Array,
  run: () => Promise<T> | T,
): Promise<T> {
  const previousDek = dek;
  const previousStoreId = dekStoreId;
  setDek(storeDek, storeId);
  try {
    return await run();
  } finally {
    if (previousDek !== null && previousStoreId !== null) {
      setDek(previousDek, previousStoreId);
    } else {
      clearDek();
    }
  }
}
