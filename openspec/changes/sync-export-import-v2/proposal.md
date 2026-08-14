# Proposal: Sync Export/Import Encryption v2 — Auth- and Store-Independent Key Derivation

## Intent

v1 ZIPs tie decryption to `password + storeId` with zip.js's weak internal KDF (PBKDF2-HMAC-SHA-1 @ 1000 iters) and no format versioning. A DIFFERENT user of the same store on a FRESH device, under any auth mode, must import with ONLY the exporter's password — v1 cannot deliver this reliably.

## Current-State Gap (v1)

- Weak KDF: zip.js inner SHA-1 @ 1000 iterations.
- Store-bound key (`password + storeId`) → fresh-device / different-user flows fail obscurely.
- No format versioning → no envelope upgrade path.

## Scope

### In Scope
- v2 envelope: unencrypted `meta.json` — `{ formatVersion: 2, salt: base64, iterations: 100000, storeId, exportedAt }`; salt = 16 random bytes (WebCrypto `getRandomValues`) per export.
- Strong KDF: WebCrypto PBKDF2-HMAC-SHA-256 → 32-byte key from password ALONE; bytes passed as zip.js per-entry `rawPassword: Uint8Array` (index.d.ts:883/1463) on the 6 data entries; meta.json plaintext. NO storeId/auth/DEK in the key.
- Store claim: v2 import validates `meta.storeId === storeId` inside `serializer.import` (import never writes → guaranteed before any write) → NEW typed `WrongStoreError` (distinct from `WrongPasswordError`).
- Backward-compatible import: meta.json present → v2 path; absent → legacy v1 (`password + storeId`), WrongPasswordError semantics preserved.
- UI + E2E: WrongStoreError → new i18n key `SYNC.ERROR_WRONG_STORE` via existing blocking-error pattern (import-form.tsx); NEW Playwright spec covering two-device export→import round-trip using zero-login `plantRoster` (5-login/min ceiling — NOT `signedInPage`).

### Out of Scope
- No DEK / `enc:v1:` / entity-crypto changes (export stays decrypted at getItem boundary).
- No auth-mode coupling; Angular legacy stays a v1 writer — v1 fallback preserves cross-version reads (parity source: Angular `data-serializer.service.ts:25,57`).
- Roster-domain `WrongPasswordError` (roster-serializer.ts:27) untouched.

## Capabilities

### New Capabilities
- `sync-export-import-v2`: v2 envelope (meta.json + WebCrypto KDF rawPassword), WrongStoreError, backward-compatible import.

### Modified Capabilities
- `sync`: "Store-Scoped Backup Decryption" + "Angular-Compatible Backup Format" requirements change (v2 derivation, meta claim) → delta spec.

## Approach

Per exploration (#822): v2 envelope (meta.json + WebCrypto-derived per-entry rawPassword); store claim validated in `serializer.import` before any write; v1 fallback keyed on meta.json presence; export untouched (repos already decrypt at getItem boundary). Honest phrasing: zip.js still runs its inner SHA-1 @ 1000-iter KDF on the rawPassword — the outer WebCrypto KDF dominates; say "buried, not replaced".

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/sync/lib/data-serializer-service.ts` | Modified | meta.json emit/read, v2 KDF + rawPassword, WrongStoreError, v1 fallback |
| `app/sync/routes/export.tsx`, `import.tsx` | Modified | salt gen, v2 wiring, error surfacing |
| sync error types + i18n | Modified | `WrongStoreError` + `SYNC.ERROR_WRONG_STORE` |
| `e2e/sync-export-import-v2.spec.ts` (NEW) | New | two-device round-trip (plantRoster) |
| `data-serializer-service.test.ts` | Modified | ~12 `readRawEntries(PASSWORD+STORE_ID)` sites, T2 6-entry shape, T3 derivation, T4 wrong-store |
| `import-no-write.test.ts`, `import-form.test.tsx` | Modified | WrongStoreError cases |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| New spec mints 6th login → 429, breaks login.spec REQ-9 | High if wrong | plantRoster only; verify zero logins in tasks |
| Download capture has no suite precedent (a.click objectURL) | Med | `page.waitForEvent('download')`; reuse setInputFiles pattern (offline-access-panel.spec.ts) |
| >400-line budget forecast | Med | chained-PR decision at tasks→apply |
| Inner KDF phrasing overclaim | Med | "buried, not replaced" in docs/commits |
| React v2 export not importable by Angular (v1 reader) | Med | v1 fallback keeps Angular→React; document React→Angular v2 limitation |

## Rollback Plan

Revert serializer/routes to v1 (`password + storeId`). v1 fallback remains, so old archives and Angular interop keep working. No data migration. Delete the new E2E spec.

## Dependencies

- zip.js 2.8.26 per-entry `rawPassword` (verified typings).
- WebCrypto PBKDF2 already used in prod (offline-crypto.ts); jsdom exposes Node webcrypto — no test mock.
- `dek-independent-of-auth-mode` in flight — complementary (at-rest), no hard dependency.

## Success Criteria

- [ ] Two-device export→import E2E green (fresh device, different user/auth mode, password only).
- [ ] WrongStoreError surfaces distinct i18n message; v1 WrongPasswordError semantics unchanged.
- [ ] v1 archives still import (backward-compat test).
- [ ] Existing E2E tests untouched; login ceiling not exceeded.
