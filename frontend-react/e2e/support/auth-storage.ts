import type { Page } from '@playwright/test';

/**
 * S1-04 (design.md D6). Mutation helpers for the two localStorage keys the
 * cold-boot flow reads: `AUTH_MODEL` (`auth-store.ts:101`) and `token`
 * (`storage-keys.ts:4`, the ONLY key `api-client.ts:37` reads for the
 * `Authorization` header — a separate key from `AUTH_MODEL.authToken`,
 * confirmed by design D3).
 *
 * Deliberately its own file, not appended to `login.spec.ts`'s own
 * `readAuthModel` (`login.spec.ts:30-43`): inserting here would force a
 * non-append edit to that already-green spec file. Duplicating
 * `AUTH_MODEL_KEY_SUFFIX` is accepted debt, same "rule of three" criterion
 * `login-network-observer.ts` used to document before its own debt was paid
 * off by `network-observer-core.ts` — see the "Debt PAID" note at
 * `login-network-observer.ts:15-19`.
 */

// Verified trap (storage-keys.ts:5): AUTH_MODEL's key is
// `${APP_VERSION}-authf496fc5a9f17`, version-prefixed. Never hardcode the
// full key — scan for the stable suffix instead.
const AUTH_MODEL_KEY_SUFFIX = '-authf496fc5a9f17';
const TOKEN_KEY = 'token';

export interface AuthModel {
  authToken?: string;
  expiresIn?: number;
}

/** Reads and parses the current `AUTH_MODEL` entry, or `null` if absent/unparseable. */
export async function readAuthModel(page: Page): Promise<AuthModel | null> {
  return page.evaluate((suffix) => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.endsWith(suffix)) continue;
      try {
        return JSON.parse(window.localStorage.getItem(key) ?? 'null') as AuthModel | null;
      } catch {
        return null;
      }
    }
    return null;
  }, AUTH_MODEL_KEY_SUFFIX);
}

/** Reads the RAW (unparsed) `AUTH_MODEL` entry, or `null` if the key is absent. */
export async function readRawAuthModel(page: Page): Promise<string | null> {
  return page.evaluate((suffix) => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.endsWith(suffix)) return window.localStorage.getItem(key);
    }
    return null;
  }, AUTH_MODEL_KEY_SUFFIX);
}

/**
 * Merges `overrides` into the EXISTING `AUTH_MODEL` entry (preserving any
 * field not overridden — e.g. mutating only `authToken` leaves `expiresIn`
 * untouched). Throws if no persona was restored first — this helper mutates
 * precondition state, it never mints a session from nothing (spec's R8 note).
 */
export async function mutateAuthModel(page: Page, overrides: Partial<AuthModel>): Promise<void> {
  const mutated = await page.evaluate(
    ({ suffix, overrides }) => {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.endsWith(suffix)) continue;
        const raw = window.localStorage.getItem(key);
        let current: Record<string, unknown> = {};
        try {
          current = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
          current = {};
        }
        window.localStorage.setItem(key, JSON.stringify({ ...current, ...overrides }));
        return true;
      }
      return false;
    },
    { suffix: AUTH_MODEL_KEY_SUFFIX, overrides }
  );
  if (!mutated) {
    throw new Error(
      'No AUTH_MODEL key found in localStorage to mutate — restore a persona (restoreSignedInSession) first.'
    );
  }
}

/**
 * Reads the RAW `token` key — separate from `AUTH_MODEL.authToken` by design
 * (D3, same distinction `mutateBearerToken` below documents): `api-client.ts:37`
 * builds the `Authorization` header from THIS key. Added for `store-fixture.ts`
 * (S2-01, D2): its server-side seeding PUT/GET calls go through `page.request`,
 * not `apiClient`, so the Bearer header has to be assembled by hand from the
 * same already-authenticated session's token.
 */
export async function readBearerToken(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY);
}

/**
 * Mutates ONLY the `token` key — separate from `AUTH_MODEL.authToken` by
 * design (D3): `api-client.ts:37` builds the `Authorization` header from
 * THIS key, not from `AUTH_MODEL`. Mutating them independently is what lets
 * T2/T3/T5/T10 (mismatch + a still-valid bearer) and T4 (mismatch + an
 * invalid bearer) reach the exact backend response each requirement needs.
 */
export async function mutateBearerToken(page: Page, token: string): Promise<void> {
  await page.evaluate(({ key, token }) => window.localStorage.setItem(key, token), {
    key: TOKEN_KEY,
    token,
  });
}

/**
 * Overwrites the `AUTH_MODEL` entry with a RAW string — used to simulate a
 * parseable-but-wrong-shape payload (T11, `{"foo":1}`). Throws if no persona
 * was restored first, same precondition as `mutateAuthModel`.
 */
export async function writeRawAuthModel(page: Page, raw: string): Promise<void> {
  const wrote = await page.evaluate(
    ({ suffix, raw }) => {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.endsWith(suffix)) continue;
        window.localStorage.setItem(key, raw);
        return true;
      }
      return false;
    },
    { suffix: AUTH_MODEL_KEY_SUFFIX, raw }
  );
  if (!wrote) {
    throw new Error(
      'No AUTH_MODEL key found in localStorage to overwrite — restore a persona (restoreSignedInSession) first.'
    );
  }
}
