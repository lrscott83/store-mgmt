import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { POLYFILLED_APIS, BANNED_APIS } from '@store-mgmt/eslint-config/browser-compat';
import type { PolyfillInstallResult } from '../polyfills';

/**
 * Contract tests for the browser-floor policy that drives the lint guard.
 *
 * The policy is the single source of truth for both the generated
 * `no-restricted-syntax` rule and the startup polyfills. If a name here is not
 * really installable, the lint guard would bless an API the device never gets.
 */

interface ApiTarget {
  target: object;
  name: string;
  /**
   * Where the native implementation may also live further up the chain.
   * `crypto.randomUUID` is a prototype method on the `crypto` instance in
   * jsdom, so removing the own property is not enough to make it absent.
   */
  inheritedFrom?: object;
}

const CRYPTO_API = 'crypto.randomUUID';

const cryptoGlobal = globalThis.crypto as Crypto | undefined;
const hasWebCrypto = typeof cryptoGlobal === 'object' && cryptoGlobal !== null;

/** Each policy API name mapped to the object/property that owns it. */
const API_TARGETS: Record<string, ApiTarget> = {
  'Array.prototype.at': { target: Array.prototype, name: 'at' },
  'String.prototype.at': { target: String.prototype, name: 'at' },
  'Array.prototype.findLast': { target: Array.prototype, name: 'findLast' },
  'Array.prototype.findLastIndex': { target: Array.prototype, name: 'findLastIndex' },
  'Array.prototype.toSorted': { target: Array.prototype, name: 'toSorted' },
  'Array.prototype.toReversed': { target: Array.prototype, name: 'toReversed' },
  'Array.prototype.toSpliced': { target: Array.prototype, name: 'toSpliced' },
  'Object.hasOwn': { target: Object, name: 'hasOwn' },
  [CRYPTO_API]: {
    target: (hasWebCrypto ? cryptoGlobal : {}) as object,
    name: 'randomUUID',
    inheritedFrom: hasWebCrypto ? (Object.getPrototypeOf(cryptoGlobal) as object) : undefined,
  },
};

function asRecord(target: object): Record<string, unknown> {
  return target as Record<string, unknown>;
}

function requireTarget(api: string): ApiTarget {
  const entry = API_TARGETS[api];
  if (!entry) throw new Error(`Untracked API in test table: ${api}`);
  return entry;
}

/**
 * Reads only the owner's own property: a lower prototype implementation must
 * not mask the fact that an installer did not define anything.
 */
function readApi(api: string): unknown {
  const entry = requireTarget(api);
  return Object.getOwnPropertyDescriptor(entry.target, entry.name)?.value;
}

/** Deletes an API from its owner(s) and proves it is really gone. */
function dropApi(api: string): void {
  const entry = requireTarget(api);
  delete asRecord(entry.target)[entry.name];
  if (entry.inheritedFrom) delete asRecord(entry.inheritedFrom)[entry.name];
  expect(readApi(api)).toBeUndefined();
}

interface CapturedDescriptors {
  own: PropertyDescriptor | undefined;
  inherited: PropertyDescriptor | undefined;
}

/**
 * Captured while the originals are still in place: this module's top-level
 * code runs before `beforeAll` dynamically imports the polyfills module, and
 * before any test drops an intrinsic.
 */
const ORIGINAL_DESCRIPTORS = new Map<string, CapturedDescriptors>();
for (const [api, entry] of Object.entries(API_TARGETS)) {
  ORIGINAL_DESCRIPTORS.set(api, {
    own: Object.getOwnPropertyDescriptor(entry.target, entry.name),
    inherited: entry.inheritedFrom
      ? Object.getOwnPropertyDescriptor(entry.inheritedFrom, entry.name)
      : undefined,
  });
}

/**
 * Puts back the descriptors a test touched. Called from a `finally` inside
 * every test so a throwing assertion cannot leak a replaced or deleted
 * intrinsic into a later suite that happens to share this realm.
 */
function restoreApis(apis: readonly string[]): void {
  for (const api of apis) {
    const entry = requireTarget(api);
    const original = ORIGINAL_DESCRIPTORS.get(api);
    delete asRecord(entry.target)[entry.name];
    if (original?.own) Object.defineProperty(entry.target, entry.name, original.own);
    if (entry.inheritedFrom) {
      delete asRecord(entry.inheritedFrom)[entry.name];
      if (original?.inherited) {
        Object.defineProperty(entry.inheritedFrom, entry.name, original.inherited);
      }
    }
  }
}

/** Proves a test really put the intrinsics it touched back the way it found them. */
function expectOriginalDescriptors(apis: readonly string[]): void {
  for (const api of apis) {
    const entry = requireTarget(api);
    const original = ORIGINAL_DESCRIPTORS.get(api);
    expect(
      Object.getOwnPropertyDescriptor(entry.target, entry.name),
      `${api} is back to its original own descriptor`,
    ).toEqual(original?.own);
    if (entry.inheritedFrom) {
      expect(
        Object.getOwnPropertyDescriptor(entry.inheritedFrom, entry.name),
        `${api} is back to its original inherited descriptor`,
      ).toEqual(original?.inherited);
    }
  }
}

const ALL_POLYFILLED = POLYFILLED_APIS.map((entry) => entry.api);
const TOUCHED = [...new Set([...ALL_POLYFILLED, CRYPTO_API])];

let installBrowserPolyfills: () => PolyfillInstallResult = () => {
  throw new Error('polyfills module was not loaded before use');
};

beforeAll(async () => {
  const module = await import('../polyfills');
  installBrowserPolyfills = module.installBrowserPolyfills;
});

/**
 * Safety net only. Each test restores in its own `finally`; this runs after
 * the test body and keeps a stray failure from reaching the next suite.
 */
afterEach(() => {
  restoreApis(TOUCHED);
});

describe('browser compatibility policy', () => {
  it('declares both a non-empty polyfilled and a non-empty banned list', () => {
    expect(POLYFILLED_APIS.length).toBeGreaterThan(0);
    expect(BANNED_APIS.length).toBeGreaterThan(0);
  });

  it('keeps the polyfilled and banned lists disjoint by API name', () => {
    const polyfilled = new Set(POLYFILLED_APIS.map((entry) => entry.api));
    const banned = new Set(BANNED_APIS.map((entry) => entry.api));

    const overlap = [...polyfilled].filter((api) => banned.has(api));
    expect(overlap, 'an API cannot be both polyfilled and banned').toEqual([]);
  });

  it('gives every banned entry a non-empty alternative and selector', () => {
    for (const entry of BANNED_APIS) {
      expect(entry.alternative.trim(), `${entry.api} alternative is non-empty`).not.toBe('');
      expect(entry.selector.trim(), `${entry.api} selector is non-empty`).not.toBe('');
    }
  });

  it('resolves every polyfilled API to a tracked owner in this test', () => {
    for (const entry of POLYFILLED_APIS) {
      expect(API_TARGETS[entry.api], `${entry.api} has a tracked owner`).toBeDefined();
    }
  });

  /**
   * Every name in the policy must name an API this project really makes
   * available. Drop it from its owner, run the real installer, and prove the
   * capability is back. A host without Web Crypto cannot install the crypto
   * polyfill, so that one entry is skipped there rather than faked.
   */
  it('makes every polyfilled API callable again after it is removed', () => {
    for (const entry of POLYFILLED_APIS) {
      const api = entry.api;
      if (api === CRYPTO_API && !hasWebCrypto) continue;

      const touched = [api];
      try {
        dropApi(api);

        const result = installBrowserPolyfills();

        expect(
          [...result.installed, ...result.alreadyPresent],
          `${api} is reported available by the installer`,
        ).toContain(api);
        expect(typeof readApi(api), `${api} is callable after installation`).toBe('function');
      } finally {
        restoreApis(touched);
      }
      expectOriginalDescriptors(touched);
    }
  });
});
