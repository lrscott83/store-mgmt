import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import type { Page } from '@playwright/test';

// D3 (design.md). The offline roster's on-disk shape, mirrored HERE rather
// than imported from the app (`roster-types.ts`) on purpose: "the browser is
// the black box under test, the app's own source is not" — same policy
// `login.spec.ts:14-17` already states, extended to types. Kept in exact
// sync with `apps/web-store-pos/app/shared/lib/offline/roster-types.ts` by
// hand — a drift here would surface immediately as a shape mismatch inside
// `authenticateOffline()`.
interface OfflineVerifier {
  hash: string;
  salt: string;
  iterations: number;
}

interface OfflineRosterUser {
  id: string;
  login: string;
  fullName: string;
  isActive: boolean;
  roles: unknown[];
  featureIds: number[];
  storeModuleIds: number[];
  isSuperAdmin: boolean;
  isOwnerAdmin: boolean;
  isReSeller: boolean;
  selectedStoreId: string;
  verifier: OfflineVerifier | null;
  wrappedDek?: string;
  wrapSalt?: string;
  wrapIv?: string;
  /**
   * Backend-signed JWT minted at export time (roster-types.ts). Set only
   * when the spec asks for it — absent on legacy bundles, which is exactly
   * the degradation the interceptor's swap must survive.
   */
  offlineAuthToken?: string;
}

export interface OfflineRosterBundle {
  bundleId: string;
  issuedAt: number;
  expiresAt: number;
  formatVersion: number;
  storeId: string;
  users: OfflineRosterUser[];
}

// roster-store.ts:19 (`ROSTER_KEY`) — the device-scoped localStorage key the
// app reads. NOT `StorageKeys.entityKey`, which is store-scoped: the roster
// exists BEFORE any storeId is known.
export const ROSTER_STORAGE_KEY = 'lizoft.offline-roster';

// docs/contracts/offline-roster-dek-kat.json:2 — the ONE password every KAT
// vector below (`wrap: 'kat'`/`'tampered'`) is wrapped under.
export const KAT_PASSWORD = 'Password123';

// offline-crypto.ts's own generation-time defaults (`PBKDF2_SALT_BYTES`,
// `PBKDF2_ITERATIONS`) — reused here so a freshly-generated verifier has the
// same shape a real backend-issued one would, even though this fixture never
// calls the backend.
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_ITERATIONS = 210_000;
const DEFAULT_EXPIRES_IN_MS = 86_400_000; // +1 day

// Fixed, not random: this is what makes the module-level memoization below
// actually hit — most roster users in the spec share `KAT_PASSWORD`, and a
// stable salt means "same password" IS "same cache key" (design.md D3
// "se memoiza por password|salt|iterations"). Not a KAT vector itself (only
// `passwordPreHash` is pinned against the backend, see the tripwire below) —
// this salt exists purely to keep worker cost at one 210k-iteration PBKDF2
// derivation per distinct synthetic password, not one per roster user.
const SYNTHETIC_VERIFIER_SALT = Buffer.from('e2e-fixture-slt', 'utf8').toString('base64');

interface RosterDekKat {
  password: string;
  passwordPreHash: string;
  wrapSalt: string;
  wrapIv: string;
  iterations: number;
  wrappedDek: string;
  expectedDek: string;
  storeId: string;
}

function loadKat(): RosterDekKat {
  // Same precedent as `playwright.config.ts:18-32`: `__dirname` is expected
  // to be available (Playwright transpiles `e2e/support/*.ts` as CommonJS,
  // like the config file — ⚠️ NOT independently re-verified for support
  // modules specifically, only for the config itself). Fallback to
  // `process.cwd()` (= `frontend-react/` when the suite runs via `pnpm
  // test:e2e`) if it is not.
  let base: string;
  try {
    base = __dirname;
  } catch {
    base = resolve(process.cwd(), 'e2e/support');
  }
  const path = resolve(base, '../../../docs/contracts/offline-roster-dek-kat.json');
  return JSON.parse(readFileSync(path, 'utf8')) as RosterDekKat;
}

const KAT = loadKat();

function base64FromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function bytesFromBase64(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/** Node mirror of `offline-crypto.ts`'s `sha256Base64` — same algorithm,
 * same Web Crypto API (`node:crypto`'s `webcrypto`), different runtime. */
async function sha256Base64(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await webcrypto.subtle.digest('SHA-256', data);
  return base64FromBytes(new Uint8Array(digest));
}

/** Node mirror of `offline-crypto.ts`'s `pbkdf2Base64`. */
async function pbkdf2Base64(input: string, saltBase64: string, iterations: number): Promise<string> {
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(input),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: bytesFromBase64(saltBase64), iterations, hash: 'SHA-256' },
    keyMaterial,
    32 * 8
  );
  return base64FromBytes(new Uint8Array(derivedBits));
}

// Tripwire (design.md D3, "el 'test primero' real de este módulo"): pins
// step 1 of the derivation (SHA-256 of the KAT password) against a value
// verified against the real backend
// (`docs/contracts/offline-roster-dek-kat.json`'s `passwordPreHash`,
// `provenance: dotnet-backend`). If this ever fails, the Node Web Crypto
// derivation has drifted from the backend's — fail LOUD, before planting
// anything, rather than silently seeding roster users whose passwords will
// never verify.
let tripwireChecked = false;
async function ensureTripwire(): Promise<void> {
  if (tripwireChecked) return;
  const actual = await sha256Base64(KAT_PASSWORD);
  if (actual !== KAT.passwordPreHash) {
    throw new Error(
      `roster-fixture tripwire failed: sha256Base64('${KAT_PASSWORD}') produced '${actual}', ` +
        `expected '${KAT.passwordPreHash}' (docs/contracts/offline-roster-dek-kat.json, ` +
        'provenance: dotnet-backend). The Node Web Crypto derivation no longer matches the ' +
        'backend KAT — STOP, do not plant a roster with an unverified password derivation.'
    );
  }
  tripwireChecked = true;
}

const verifierCache = new Map<string, Promise<OfflineVerifier>>();

function buildVerifier(password: string): Promise<OfflineVerifier> {
  const cacheKey = `${password}|${SYNTHETIC_VERIFIER_SALT}|${PBKDF2_ITERATIONS}`;
  let cached = verifierCache.get(cacheKey);
  if (!cached) {
    cached = (async () => {
      const preHash = await sha256Base64(password);
      const hash = await pbkdf2Base64(preHash, SYNTHETIC_VERIFIER_SALT, PBKDF2_ITERATIONS);
      return { hash, salt: SYNTHETIC_VERIFIER_SALT, iterations: PBKDF2_ITERATIONS };
    })();
    verifierCache.set(cacheKey, cached);
  }
  return cached;
}

/** Flips every bit of the wrap's first byte — `wrap: 'tampered'`
 * (design.md D3/D6): the verifier still passes (password is untouched), but
 * `unwrapDek()`'s AES-GCM tag check fails afterwards, surfacing
 * `DekUnwrapError` (T7). */
function tamperWrappedDek(wrappedDekBase64: string): string {
  const bytes = Buffer.from(Buffer.from(wrappedDekBase64, 'base64'));
  bytes[0] = bytes[0] ^ 0xff;
  return bytes.toString('base64');
}

export interface RosterUserSpec {
  login: string;
  /** default `KAT_PASSWORD` */
  password?: string;
  /** default `true` */
  isActive?: boolean;
  /** default `'valid'` */
  verifier?: 'valid' | 'malformed' | null;
  /** default `'none'` */
  wrap?: 'none' | 'kat' | 'tampered';
  /** default `true` */
  isOwnerAdmin?: boolean;
  /**
   * default: a synthetic `e2e-roster-user-<login>` id. Override with a REAL
   * user id when the fixture must impersonate a backend-created user — the
   * roster-JWT swap matches `roster.users[].id` against `currentUser.id`.
   */
  id?: string;
  /**
   * default absent (legacy bundle). Set to a backend-signed JWT to exercise
   * the interceptor's sentinel→JWT swap end to end.
   */
  offlineAuthToken?: string;
}

export interface RosterSpec {
  users: RosterUserSpec[];
  /** default `+86_400_000`; negative ⇒ already expired */
  expiresInMs?: number;
  /** default `1`; `'kat'`/`'tampered'` wrap force `2` when unset */
  formatVersion?: 1 | 2;
  /** default the KAT's own `storeId` */
  storeId?: string;
}

async function buildRosterUser(userSpec: RosterUserSpec, storeId: string): Promise<OfflineRosterUser> {
  const password = userSpec.password ?? KAT_PASSWORD;
  const verifierSpec = userSpec.verifier === undefined ? 'valid' : userSpec.verifier;

  let verifier: OfflineVerifier | null;
  if (verifierSpec === null) {
    verifier = null;
  } else if (verifierSpec === 'malformed') {
    // Missing `iterations` on purpose — `offline-auth-service.ts`'s
    // `typeof` guard rejects this exactly like an absent verifier
    // (throws `OfflineVerifierError` → `AUTH.SERVER_ERROR`, T6).
    verifier = { hash: 'malformed-hash', salt: 'malformed-salt' } as unknown as OfflineVerifier;
  } else {
    verifier = await buildVerifier(password);
  }

  const user: OfflineRosterUser = {
    id: userSpec.id ?? `e2e-roster-user-${userSpec.login}`,
    login: userSpec.login,
    fullName: `E2E Roster ${userSpec.login}`,
    isActive: userSpec.isActive ?? true,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: userSpec.isOwnerAdmin ?? true,
    isReSeller: false,
    selectedStoreId: storeId,
    verifier,
  };

  const wrap = userSpec.wrap ?? 'none';
  if (wrap === 'kat') {
    user.wrapSalt = KAT.wrapSalt;
    user.wrapIv = KAT.wrapIv;
    user.wrappedDek = KAT.wrappedDek;
  } else if (wrap === 'tampered') {
    user.wrapSalt = KAT.wrapSalt;
    user.wrapIv = KAT.wrapIv;
    user.wrappedDek = tamperWrappedDek(KAT.wrappedDek);
  }

  if (userSpec.offlineAuthToken) {
    user.offlineAuthToken = userSpec.offlineAuthToken;
  }

  return user;
}

/** Builds a roster bundle in memory — never touches `page`/`localStorage`.
 * `plantRoster()` below is the one that writes it. */
export async function buildRosterBundle(spec: RosterSpec): Promise<OfflineRosterBundle> {
  await ensureTripwire();

  const now = Date.now();
  const expiresInMs = spec.expiresInMs ?? DEFAULT_EXPIRES_IN_MS;
  const storeId = spec.storeId ?? KAT.storeId;
  const hasWrappedUser = spec.users.some((u) => u.wrap === 'kat' || u.wrap === 'tampered');
  const formatVersion = spec.formatVersion ?? (hasWrappedUser ? 2 : 1);

  const users = await Promise.all(spec.users.map((userSpec) => buildRosterUser(userSpec, storeId)));

  return {
    bundleId: `e2e-roster-${now}-${Math.random().toString(36).slice(2, 8)}`,
    issuedAt: now,
    expiresAt: now + expiresInMs,
    formatVersion,
    storeId,
    users,
  };
}

/**
 * Builds a roster bundle and writes it directly to `localStorage` via
 * `page.evaluate()` (REQ-13, `e2e-offline-login-ui`) — never `importRoster()`,
 * never the `provision.tsx` round-trip. `page` must already be on a
 * same-origin document (D4 step 2: `loginPage.goto()` before this call) —
 * `localStorage` is origin-scoped, there is no origin before the first
 * navigation.
 *
 * Rereads the key and asserts `bundleId`/`expiresAt` match what was just
 * written BEFORE returning control (D4 step 4) — a roster silently absent
 * takes the ONLINE branch (`roster-store.ts:170-172`), which would make
 * every downstream assertion in the calling test fail for the wrong reason.
 */
export async function plantRoster(page: Page, spec: RosterSpec): Promise<OfflineRosterBundle> {
  const bundle = await buildRosterBundle(spec);
  const serialized = JSON.stringify(bundle);

  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: ROSTER_STORAGE_KEY, value: serialized }
  );

  const reread = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    ROSTER_STORAGE_KEY
  );
  if (!reread) {
    throw new Error(
      `plantRoster: localStorage['${ROSTER_STORAGE_KEY}'] is empty right after writing it — the ` +
        'roster was not actually planted. A missing roster silently takes the ONLINE branch ' +
        '(roster-store.ts:170-172), which would make every downstream assertion fail for the ' +
        'wrong reason.'
    );
  }

  let parsed: OfflineRosterBundle;
  try {
    parsed = JSON.parse(reread) as OfflineRosterBundle;
  } catch (cause) {
    throw new Error(
      `plantRoster: localStorage['${ROSTER_STORAGE_KEY}'] is not valid JSON after writing it: ` +
        `${cause instanceof Error ? cause.message : String(cause)}.`
    );
  }
  if (parsed.bundleId !== bundle.bundleId || parsed.expiresAt !== bundle.expiresAt) {
    throw new Error(
      `plantRoster: precondition mismatch after reread — wrote bundleId='${bundle.bundleId}' ` +
        `expiresAt=${bundle.expiresAt}, read back bundleId='${parsed.bundleId}' ` +
        `expiresAt=${parsed.expiresAt}.`
    );
  }

  return bundle;
}
