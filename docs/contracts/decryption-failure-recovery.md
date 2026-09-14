# Decryption Failure ("datos dañados") — Recovery Procedure and Root Cause

Status: operational contract and recovery guide.
Scope: `frontend-react/apps/web-store-pos` — entity at-rest encryption (`enc:v1:`).
Last updated: 2026-09-14 (production event on a user device).

## 1. The user-facing message

> "La información guardada en este dispositivo está dañada y no se pudo leer. No se borró nada."

This exact message is `ENCRYPTION.DATA_DAMAGED`. It is shown by
`shared/lib/storage/decryption-failure-policy.ts` (`handleDecryptionFailure`)
when a decryption failure is classified as **`damaged`** — one of the two
kinds the policy distinguishes:

| Kind | Error (`name`) | Meaning | Recoverable? |
| --- | --- | --- | --- |
| `missing-key` | `MissingDataKeyError`, `DekUnwrapError` | The stored bytes are intact; this device just cannot open them (no DEK in memory, or the DEK could not be unwrapped). | Yes — an online login or a roster import brings the key back. Message: `ENCRYPTION.KEY_UNAVAILABLE`. |
| `damaged` | `EntityUnreadableError` | The stored bytes themselves did not authenticate or parse. | Only by clearing the affected storage and re-downloading from the server (see §3). The message deliberately does not promise recovery through the key path. |

"**No se borró nada**" is literal and by design: since `readEntityOrThrow` was
introduced (design D4, `shared/lib/storage/read-entity-or-throw.ts`), an
unreadable entity **throws** and is never written over. Older code used to
catch the failure and write an empty value, turning an intact store into an
empty one.

On a `damaged` failure the policy shows the dialog once (latch), signs the
session out, and lands the user on `/login`. The app **never deletes** the
damaged blob automatically.

## 2. What `damaged` actually proves

`EntityUnreadableError` is thrown by `readEntityOrThrow` when a stored value
starts with `enc:v1:` (so a DEK was in memory and the value is ciphertext) and
either:

1. the AES-GCM authentication tag does not verify, or
2. the decrypted plaintext does not parse.

**The reader cannot distinguish "bytes corrupted" from "bytes valid but
encrypted under a different DEK"** — both fail the same AEAD check. The
difference matters for root cause, and it is exactly why the message must not
promise that the data is still recoverable: from the device's point of view
the bytes are unusable either way.

## 3. Recovery procedure (one-by-one, any device)

Goal: discard the unreadable *local cache* of entities for the affected store
and re-download the authoritative copy from the server. Nothing on the server
is touched; the cached entities are a per-device cache, never the source of
truth.

1. **Decide what to remove.** Entities are cached per store under
   `lizoft.store-<entity>-<storeId>` (10 entity types). To recover one store's
   cache, target that store's keys. To recover everything, use the broad step.
   Session (`token`, `currentUser`, `1.0.0-auth…`), the DEK table
   (`lizoft.device-dek`), and the roster are **kept** — removing them is not
   needed and makes recovery slower (full re-auth / roster re-import).
2. **Open DevTools Console** on the login page (F12 → Console) and run:

   ```js
   // One store (replace the store id):
   Object.keys(localStorage)
     .filter(k => k.startsWith('lizoft.store-') && k.endsWith('<STORE_ID>'))
     .forEach(k => localStorage.removeItem(k));

   // Everything cached per store (all stores, all entities):
   Object.keys(localStorage)
     .filter(k => k.startsWith('lizoft.store-'))
     .forEach(k => localStorage.removeItem(k));
   ```

   (The product list screen has a "Limpiar" button that calls `clearStoreData`
   (`shared/lib/storage/store-data-reset.ts`), but it is only reachable after
   the products page loads — which is exactly the page that may be failing, so
   the console route is the reliable one.)
3. **Reload** the app while **online**. The login re-provisions the DEK
   (login-response wrap, `offline/dek-provisioning.ts`), and each entity read
   whose key is now absent is re-fetched from the API and re-encrypted under
   the current DEK. Offline-only recovery will not work if the failure was a
   DEK identity change: the server is the only place the bytes can come back
   from.
4. **Verify.** The relevant screens load and the dialog does not reappear. If
   the dialog reappears on a *different* key, repeat for that store or apply
   the broad removal and re-login.

If the user prefers a full reset (loses offline caches, session, roster, DEK
table): "Clear site data" in the browser, then full online login. Heavier, not
required.

## 4. Evidence channel before recovery (if possible)

Before clearing anything, collect what the device already recorded:

- **`/diagnostics`** (SuperAdmin/OwnerAdmin only, deployed on the production
  bundle): the decryption failure is written to the client-error ring buffer by
  `handleDecryptionFailure` *before* logout —
  `Decryption failure (damaged): session ended` (level `error`, with stack).
  The buffer persists across logout (pruned after 7 days), so after an online
  re-login the entry is still visible.
- **Browser console at the moment of failure**: the unhandled rejection that
  the policy handles carries the `EntityUnreadableError`, whose `message`
  contains the exact failing storage key:
  `Stored entity at "lizoft.store-<entity>-<storeId>" could not be read`.
  This identifies *which* entity key failed.

## 5. Root cause — production event 2026-09-14 (confirmed)

One key failing after an online login does **not** imply the server changed:
the DEK in memory on login is the current server DEK for the session store
(`GetDek = HKDF(masterSecret, storeId)`), and since the derivation is
deterministic per store, an `enc:v1:` blob written under a *different* DEK
identity than the current one can never authenticate — no matter how healthy
the server is.

**Confirmed mechanism: cross-store DEK binding on a shared device.**

The device is shared by two owners of different stores. `lrscott` (owner of
Lizardo `744b70a3`) authenticated first; `lrscott1` (owner of Mia `716ed492` —
his selected store — and Tienda Test `9ab098c5`) authenticated later, right in
the pre-fix window: `lrscott1`'s user row is dated **2026-09-09**, one day
before the per-store wrap fix `0014b5d3` (2026-09-10) landed in `main`. The
device-dek dump shows `dekSource: login-response`, `formatVersion: 2`, and a
`stores` map covering all three stores, so the device now runs the fixed
bundle — but the cached blobs written for `lrscott1`'s stores come from the
older era (or a cached older bundle) and hit the KNOWN GAP documented in
`frontend-react/apps/web-store-pos/app/shared/lib/offline/dek-provisioning.ts`
(`386-401`, closed by `0014b5d3`): a login on a device that already holds
another store's DEK could bind to the *first* user's key. Entity keys are
labeled with the correct `storeId` but encrypted under the *other* store's DEK;
the correct per-store key can never open them → `EntityUnreadableError` →
`damaged`. This is permanent: reads never rewrite (`readEntityOrThrow`, D4),
and re-keying old blobs is explicitly out of scope (`device-dek-wrap` F7).
Recovery is exactly §3.

Corroborating facts:

- The login-response wrap list is built from the **owner** relation
  (`LoginCommand.TryBuildLoginDekWrapsAsync` +
  `StoreRepository.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync` —
  `Owner.UserId == userId`), which is why Tienda Test (`9ab098c5`, owner-only,
  **no `StoreUser` row**) is wrapped: not an anomaly, it is consistent.
- Server-side `MasterSecret` change is **ruled out**: the four snapshot queries
  against the production database (users, store-user links, stores, owners)
  are internally consistent with the device dump; the same store's data
  re-downloads cleanly in an incognito session; a master-secret rotation would
  invalidate every device's cache for the store at once.
- Locally-minted DEK from the pre-`device-wrapped-dek` era (2026-08-12) is
  **ruled out**: the dump shows `dekSource: login-response` and both users
  postdate that era's start.
- Actual byte corruption cannot be excluded from the bytes alone, but the
  shared-device timeline makes the cross-store binding the operative mechanism.

Final confirmation (cheap, if desired): the failing key from the browser
console at failure time — `EntityUnreadableError.message` shows
`lizoft.store-<entity>-<storeId>` — expected `716ed492` (Mia) or `9ab098c5`
(Tienda Test); either one matches the blamed user `lrscott1`.

The current code base is fixed: `0014b5d3`, `12f1e426`, and `e610608f` are all
ancestors of `origin/main` (verified via `merge-base --is-ancestor`). No
server-side action was needed; §3 was the correct recovery.