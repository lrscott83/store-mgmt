import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { POLYFILLED_APIS } from '@store-mgmt/eslint-config/browser-compat';
import type { PolyfillInstallResult, StartupPolyfillReport } from '../polyfills';

/**
 * `lib` is ES2022, so `findLast`, `findLastIndex`, `toSorted`, `toReversed`
 * and `toSpliced` are missing from the compiler's array types. `ModernArray`
 * is the minimal shape the tests need; it disappears at runtime.
 */
interface ModernArray<T> extends Array<T> {
  findLast(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: unknown): T | undefined;
  findLastIndex(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: unknown): number;
  toSorted(compareFn?: (a: T, b: T) => number): T[];
  toReversed(): T[];
  toSpliced(start: number, deleteCount?: number, ...items: T[]): T[];
}

function modernArray<T>(values: T[]): ModernArray<T> {
  return values as ModernArray<T>;
}

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

/**
 * The `crypto` object the polyfill installs onto. Captured before any test
 * mutates it; `globalThis.crypto` is the same object in this environment.
 *
 * A host without Web Crypto has no `crypto` at all, so this module must not
 * dereference it at load: the whole suite would otherwise fail at import
 * instead of degrading (R3-2). The crypto tests skip in that host, and the
 * table falls back to a stand-in owner that keeps its full key set.
 */
const cryptoGlobal = globalThis.crypto as Crypto;
const hasWebCrypto = typeof cryptoGlobal === 'object' && cryptoGlobal !== null;
const missingCryptoStandIn: object = {};
const cryptoInstallTarget: object = hasWebCrypto ? cryptoGlobal : missingCryptoStandIn;
const cryptoPrototype: object | undefined = hasWebCrypto
  ? (Object.getPrototypeOf(cryptoGlobal) as object)
  : undefined;

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
  'crypto.randomUUID': {
    target: cryptoInstallTarget,
    name: 'randomUUID',
    inheritedFrom: cryptoPrototype,
  },
};

const ALL_APIS = Object.keys(API_TARGETS);

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
 * code runs before `beforeAll` dynamically imports the polyfills module.
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

/** Original `defineProperty`, captured before any spy is installed. */
const originalDefineProperty = Object.defineProperty as unknown as (
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor,
) => object;

/**
 * Makes exactly one installer throw `thrown`: every other `defineProperty`
 * call goes through to the real one. Callers must `mockRestore()` before
 * restoring descriptors, or the restore itself would be blocked.
 */
function failInstallationOf(target: object, name: string, thrown: unknown) {
  const implementation = ((
    actualTarget: object,
    actualKey: PropertyKey,
    descriptor: PropertyDescriptor,
  ) => {
    if (actualTarget === target && actualKey === name) throw thrown;
    return originalDefineProperty(actualTarget, actualKey, descriptor);
  }) as unknown as typeof Object.defineProperty;

  return vi.spyOn(Object, 'defineProperty').mockImplementation(implementation);
}

let installBrowserPolyfills: () => PolyfillInstallResult = () => {
  throw new Error('polyfills module was not loaded before use');
};

let readStartupPolyfillReport: () => StartupPolyfillReport = () => {
  throw new Error('polyfills module was not loaded before use');
};

beforeAll(async () => {
  const module = await import('../polyfills');
  installBrowserPolyfills = module.installBrowserPolyfills;
  readStartupPolyfillReport = module.readStartupPolyfillReport;
});

/**
 * Safety net only. Each test restores in its own `finally`; this runs after
 * the test body and keeps a stray failure from reaching the next suite.
 */
afterEach(() => {
  restoreApis(ALL_APIS);
});

/**
 * Only the tests whose subject *is* the crypto polyfill need a Web Crypto host:
 * they call into `crypto`, or they pin outcomes that depend on
 * `crypto.randomUUID` being installable. A host without Web Crypto skips those
 * cleanly instead of failing the whole file at import (R3-2).
 *
 * Every contract test that can state its invariant without a crypto host runs
 * unconditionally (`it`), so the all-API contract is proved in the same host
 * this work targets, not only in a jsdom run.
 */
const itWithCrypto = it.skipIf(!hasWebCrypto);

/** Descriptor `globalThis.crypto` had before any test shadowed it. */
const CRYPTO_GLOBAL_DESCRIPTOR = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

interface ShadowedProperty {
  /** How many times the shadowed property was read while it was in place. */
  reads: number;
}

/**
 * Replaces `globalThis.crypto` with a recording getter returning `value`, so a
 * test can prove the shadow was live while the installers ran. Put back by
 * `restoreCryptoGlobal`, never by plain assignment.
 */
function shadowCryptoGlobal(value: unknown): ShadowedProperty {
  const shadow: ShadowedProperty = { reads: 0 };
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    get() {
      shadow.reads += 1;
      return value;
    },
  });
  return shadow;
}

function restoreCryptoGlobal(): void {
  delete (globalThis as unknown as Record<string, unknown>).crypto;
  if (CRYPTO_GLOBAL_DESCRIPTOR) {
    Object.defineProperty(globalThis, 'crypto', CRYPTO_GLOBAL_DESCRIPTOR);
  }
}

/** Shadows one crypto method with a recording getter returning `undefined`. */
function shadowCryptoMethod(target: object, name: string): ShadowedProperty {
  const shadow: ShadowedProperty = { reads: 0 };
  Object.defineProperty(target, name, {
    configurable: true,
    get() {
      shadow.reads += 1;
      return undefined;
    },
  });
  return shadow;
}

function restoreCryptoMethod(
  target: object,
  name: string,
  original: PropertyDescriptor | undefined,
): void {
  delete (target as Record<string, unknown>)[name];
  if (original) Object.defineProperty(target, name, original);
}

describe('installBrowserPolyfills', () => {
  it('installs Array.prototype.at with negative-index support', () => {
    const touched = ['Array.prototype.at'];
    try {
      dropApi('Array.prototype.at');
      installBrowserPolyfills();

      expect([1, 2, 3].at(-1)).toBe(3);
      expect([1, 2, 3].at(-3)).toBe(1);
      expect([1, 2, 3].at(0)).toBe(1);
      expect([1, 2, 3].at(3)).toBeUndefined();
      expect([1, 2, 3].at(-4)).toBeUndefined();
      expect([].at(-1)).toBeUndefined();
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  it('installs String.prototype.at with negative-index support', () => {
    const touched = ['String.prototype.at'];
    try {
      dropApi('String.prototype.at');
      installBrowserPolyfills();

      expect('abc'.at(-1)).toBe('c');
      expect('abc'.at(0)).toBe('a');
      expect('abc'.at(3)).toBeUndefined();
      expect('abc'.at(-4)).toBeUndefined();
      // Standard `at` returns one UTF-16 code unit, not a whole code point.
      expect('\u{1F600}'.at(0)).toBe('\ud83d');
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  it('installs Array.prototype.findLast searching from the end', () => {
    const touched = ['Array.prototype.findLast'];
    try {
      dropApi('Array.prototype.findLast');
      installBrowserPolyfills();

      const seenIndexes: number[] = [];
      const found = modernArray([1, 2, 3, 4]).findLast((value, index, array) => {
        expect(array).toHaveLength(4);
        seenIndexes.push(index);
        return value % 2 === 1;
      });

      expect(found).toBe(3);
      expect(seenIndexes).toEqual([3, 2]);
      expect(modernArray([2, 4]).findLast((value) => value % 2 === 1)).toBeUndefined();
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  it('installs Array.prototype.findLastIndex searching from the end', () => {
    const touched = ['Array.prototype.findLastIndex'];
    try {
      dropApi('Array.prototype.findLastIndex');
      installBrowserPolyfills();

      const seenIndexes: number[] = [];
      const found = modernArray([1, 2, 3, 4]).findLastIndex((value, index) => {
        seenIndexes.push(index);
        return value % 2 === 1;
      });

      expect(found).toBe(2);
      expect(seenIndexes).toEqual([3, 2]);
      expect(modernArray([2, 4]).findLastIndex((value) => value % 2 === 1)).toBe(-1);
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  it('installs Array.prototype.toSorted without mutating the receiver', () => {
    const touched = ['Array.prototype.toSorted'];
    try {
      dropApi('Array.prototype.toSorted');
      installBrowserPolyfills();

      const source = [3, 1, 2];
      const sorted = modernArray(source).toSorted((a, b) => a - b);
      expect(sorted).toEqual([1, 2, 3]);
      expect(sorted).not.toBe(source);
      expect(source).toEqual([3, 1, 2]);

      // Default ordering is the standard string comparison.
      expect(modernArray([10, 9]).toSorted()).toEqual([10, 9]);
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  it('installs Array.prototype.toReversed without mutating the receiver', () => {
    const touched = ['Array.prototype.toReversed'];
    try {
      dropApi('Array.prototype.toReversed');
      installBrowserPolyfills();

      const source = [1, 2, 3];
      const reversed = modernArray(source).toReversed();
      expect(reversed).toEqual([3, 2, 1]);
      expect(reversed).not.toBe(source);
      expect(source).toEqual([1, 2, 3]);
      expect(modernArray([]).toReversed()).toEqual([]);
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  it('installs Array.prototype.toSpliced without mutating the receiver', () => {
    const touched = ['Array.prototype.toSpliced'];
    try {
      dropApi('Array.prototype.toSpliced');
      installBrowserPolyfills();

      const source = ['a', 'b', 'c', 'd'];
      const spliced = modernArray(source).toSpliced(1, 2, 'x');
      expect(spliced).toEqual(['a', 'x', 'd']);
      expect(spliced).not.toBe(source);
      expect(source).toEqual(['a', 'b', 'c', 'd']);

      // Omitting deleteCount removes from `start` to the end, like splice.
      expect(modernArray(source).toSpliced(-2)).toEqual(['a', 'b']);
      // start beyond the end appends.
      expect(modernArray(source).toSpliced(10, 0, 'z')).toEqual(['a', 'b', 'c', 'd', 'z']);
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  it('installs Object.hasOwn equivalent to Object.prototype.hasOwnProperty.call', () => {
    const touched = ['Object.hasOwn'];
    try {
      dropApi('Object.hasOwn');
      installBrowserPolyfills();

      expect(Object.hasOwn({ a: 1 }, 'a')).toBe(true);
      expect(Object.hasOwn({ a: 1 }, 'b')).toBe(false);
      expect(Object.hasOwn(Object.create({ inherited: true }), 'inherited')).toBe(false);
      expect(Object.hasOwn([], 'length')).toBe(true);
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  itWithCrypto('installs crypto.randomUUID producing a lowercase v4 UUID', () => {
    const touched = ['crypto.randomUUID'];
    try {
      dropApi('crypto.randomUUID');
      expect(typeof cryptoGlobal.randomUUID).toBe('undefined');

      installBrowserPolyfills();

      const randomUUID = cryptoGlobal.randomUUID as () => string;
      expect(typeof randomUUID).toBe('function');

      const value = randomUUID();
      expect(value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      // Version nibble (13th hex digit, index 14 with hyphens) is exactly 4.
      expect(value.charAt(14)).toBe('4');
      // Variant nibble (index 19) is 8, 9, a or b.
      expect(['8', '9', 'a', 'b']).toContain(value.charAt(19));

      // Same string format as the native implementation: no prefix, braces,
      // uppercase or trailing noise.
      expect(value).toHaveLength(36);
      expect(value).not.toContain('urn:uuid:');
      expect(value).not.toContain('{');
      expect(value).toBe(value.toLowerCase());
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  itWithCrypto('generates distinct crypto.randomUUID values on successive calls', () => {
    const touched = ['crypto.randomUUID'];
    try {
      dropApi('crypto.randomUUID');
      installBrowserPolyfills();

      const randomUUID = cryptoGlobal.randomUUID as () => string;
      expect(randomUUID()).not.toBe(randomUUID());
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  itWithCrypto('does not overwrite an existing crypto.randomUUID implementation', () => {
    const touched = ['crypto.randomUUID'];
    try {
      dropApi('crypto.randomUUID');
      const sentinel = (): string => '00000000-0000-4000-8000-000000000000';
      Object.defineProperty(cryptoGlobal, 'randomUUID', {
        value: sentinel,
        writable: true,
        configurable: true,
        enumerable: false,
      });

      const result = installBrowserPolyfills();

      expect(cryptoGlobal.randomUUID).toBe(sentinel);
      expect(result.alreadyPresent).toContain('crypto.randomUUID');
      expect(result.installed).not.toContain('crypto.randomUUID');
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  itWithCrypto('reports crypto.randomUUID as failed when the host has no crypto object', () => {
    const touched = ALL_APIS;
    try {
      for (const api of touched) dropApi(api);
      const shadow = shadowCryptoGlobal(undefined);
      let result: PolyfillInstallResult;
      try {
        result = installBrowserPolyfills();
      } finally {
        restoreCryptoGlobal();
      }

      // The shadow was live *during* the call: the installer read it at least
      // once, and the reason is the no-crypto branch's own TypeError text.
      expect(shadow.reads).toBeGreaterThan(0);

      const failure = result.failed.find((entry) => entry.api === 'crypto.randomUUID');
      expect(failure).toBeDefined();
      expect(failure?.reason).toBe('crypto.randomUUID: crypto is not available');
      expect(failure?.reason.length).toBeGreaterThan(0);

      // A missing host crypto costs exactly that API; everything else installs.
      expect([...result.installed].sort()).toEqual(
        touched.filter((api) => api !== 'crypto.randomUUID').sort(),
      );
      expect(result.alreadyPresent).toEqual([]);
      expect(readApi('crypto.randomUUID')).toBeUndefined();
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  itWithCrypto('reports crypto.randomUUID as failed when crypto.getRandomValues is missing', () => {
    const touched = ALL_APIS;
    try {
      for (const api of touched) dropApi(api);
      const originalGetRandomValues = Object.getOwnPropertyDescriptor(
        cryptoGlobal,
        'getRandomValues',
      );
      const shadow = shadowCryptoMethod(cryptoGlobal, 'getRandomValues');
      let result: PolyfillInstallResult;
      try {
        result = installBrowserPolyfills();
      } finally {
        restoreCryptoMethod(cryptoGlobal, 'getRandomValues', originalGetRandomValues);
      }

      // The shadow was live *during* the call: the installer read the method
      // and took the missing-source branch.
      expect(shadow.reads).toBeGreaterThan(0);
      expect(Object.getOwnPropertyDescriptor(cryptoGlobal, 'getRandomValues')).toEqual(
        originalGetRandomValues,
      );
      expect(typeof cryptoGlobal.getRandomValues).toBe('function');

      const failure = result.failed.find((entry) => entry.api === 'crypto.randomUUID');
      expect(failure).toBeDefined();
      expect(failure?.reason).toBe('crypto.randomUUID: crypto.getRandomValues is not available');
      expect(failure?.reason.length).toBeGreaterThan(0);

      expect([...result.installed].sort()).toEqual(
        touched.filter((api) => api !== 'crypto.randomUUID').sort(),
      );
      expect(result.alreadyPresent).toEqual([]);
      expect(readApi('crypto.randomUUID')).toBeUndefined();
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  itWithCrypto('leaves a native inherited crypto.randomUUID untouched', () => {
    const touched = ['crypto.randomUUID'];
    try {
      const originalOwn = Object.getOwnPropertyDescriptor(cryptoGlobal, 'randomUUID');
      const originalImplementation = cryptoGlobal.randomUUID;
      expect(typeof originalImplementation).toBe('function');

      const result = installBrowserPolyfills();

      expect(result.alreadyPresent).toContain('crypto.randomUUID');
      expect(result.installed).not.toContain('crypto.randomUUID');
      expect(result.failed.map((entry) => entry.api)).not.toContain('crypto.randomUUID');
      // Same function identity before and after the call: the installers
      // replaced nothing, whichever object owns the native implementation.
      expect(cryptoGlobal.randomUUID).toBe(originalImplementation);
      // The crypto instance's own descriptor is byte-for-byte what it was: the
      // installers added no own property and changed none that existed, so a
      // host that exposes `randomUUID` directly on the instance is equally
      // covered as one that inherits it from the prototype.
      expect(Object.getOwnPropertyDescriptor(cryptoGlobal, 'randomUUID')).toEqual(originalOwn);
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  it('does not overwrite an implementation that already exists', () => {
    const touched = ['Array.prototype.at'];
    try {
      const sentinel = () => 'sentinel';
      Object.defineProperty(Array.prototype, 'at', {
        value: sentinel,
        writable: true,
        configurable: true,
        enumerable: false,
      });

      installBrowserPolyfills();

      expect(readApi('Array.prototype.at')).toBe(sentinel);
      expect(modernArray([1, 2, 3]).at(0)).toBe('sentinel');
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  it('installs non-enumerable prototype methods', () => {
    const touched = ['Array.prototype.toReversed'];
    try {
      dropApi('Array.prototype.toReversed');
      installBrowserPolyfills();

      const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'toReversed');
      expect(descriptor?.enumerable).toBe(false);
      expect(descriptor?.writable).toBe(true);
      expect(descriptor?.configurable).toBe(true);

      expect(Object.keys(Array.prototype)).not.toContain('toReversed');

      const seenKeys: string[] = [];
      for (const key in [] as unknown[]) seenKeys.push(key);
      expect(seenKeys).not.toContain('toReversed');
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  /**
   * Runs in every host: the assertions below are the invariants of the policy,
   * which do not depend on `crypto.randomUUID` being installable here.
   */
  it('covers exactly the APIs declared in POLYFILLED_APIS', () => {
    const touched = ALL_APIS;
    try {
      expect(POLYFILLED_APIS.length).toBeGreaterThan(0);

      const declaredNames = POLYFILLED_APIS.map((entry) => entry.api).sort();
      expect(Object.keys(API_TARGETS).sort()).toEqual(declaredNames);

      for (const entry of POLYFILLED_APIS) dropApi(entry.api);
      const result = installBrowserPolyfills();

      const installed = [...result.installed];
      const alreadyPresent = [...result.alreadyPresent];
      const failedApis = result.failed.map((failure) => failure.api);
      const accountedFor = [...installed, ...alreadyPresent, ...failedApis];

      // Each declared name lands in exactly one bucket: no name outside the
      // policy, no name lost, no name counted twice.
      expect(new Set(accountedFor).size, 'each API is reported once').toBe(accountedFor.length);
      expect([...accountedFor].sort()).toEqual(declaredNames);

      // Whatever the run claims is now available really is; a failed API stays
      // exactly as missing as it was before the run.
      for (const api of [...installed, ...alreadyPresent]) {
        expect(typeof readApi(api), `${api} is callable after the run`).toBe('function');
      }
      for (const api of failedApis) {
        expect(readApi(api), `${api} stays missing when its installer failed`).toBeUndefined();
      }
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  /**
   * Runs in every host: the subject is isolation between installers, not how
   * many APIs this particular host can install.
   */
  it('keeps installing every other API when a single installer throws', () => {
    const touched = ALL_APIS;
    const failingApi = 'Array.prototype.toSorted';
    const failing = requireTarget(failingApi);
    const originalDefineProperty = Object.defineProperty as unknown as (
      target: object,
      key: PropertyKey,
      descriptor: PropertyDescriptor,
    ) => object;

    const definePropertySpy = vi.spyOn(Object, 'defineProperty').mockImplementation(((
      target: object,
      key: PropertyKey,
      descriptor: PropertyDescriptor,
    ) => {
      if (target === failing.target && key === failing.name) {
        throw new TypeError('Cannot redefine property: toSorted');
      }
      return originalDefineProperty(target, key, descriptor);
    }) as unknown as typeof Object.defineProperty);

    try {
      for (const api of touched) dropApi(api);

      // Must not throw: one broken installer cannot abort module evaluation.
      const result = installBrowserPolyfills();

      const failedApis = result.failed.map((failure) => failure.api);
      // The broken installer is the only failure this test causes; the crypto
      // API is the one other API that can legitimately fail, and only on a host
      // without Web Crypto.
      expect(failedApis.filter((api) => api !== 'crypto.randomUUID')).toEqual([failingApi]);
      expect(result.failed.find((failure) => failure.api === failingApi)?.reason).toBe(
        'Cannot redefine property: toSorted',
      );
      expect(result.alreadyPresent).toEqual([]);

      // Nothing that survived the failure was skipped: every API that is not
      // reported failed was installed by this same run.
      const healthyApis = touched.filter((api) => !failedApis.includes(api));
      expect([...result.installed, ...result.alreadyPresent].sort()).toEqual(
        [...healthyApis].sort(),
      );

      // App-visible outcome: only the failed API is missing, the rest work.
      expect(readApi(failingApi)).toBeUndefined();
      for (const api of healthyApis) {
        expect(typeof readApi(api), `${api} is callable despite the foreign failure`).toBe(
          'function',
        );
      }
      expect([1, 2, 3].at(-1)).toBe(3);
      expect('abc'.at(0)).toBe('a');
      expect(modernArray([1, 2, 3]).findLast((value) => value === 1)).toBe(1);
      expect(modernArray([1, 2, 3]).findLastIndex((value) => value === 1)).toBe(0);
      expect(modernArray([2, 1]).toReversed()).toEqual([1, 2]);
      expect(modernArray([1, 2]).toSpliced(0, 1)).toEqual([2]);
      expect(Object.hasOwn({ a: 1 }, 'a')).toBe(true);
    } finally {
      definePropertySpy.mockRestore();
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  /**
   * Runs in every host: idempotence is an accounting property, not a crypto
   * capability, so the counts are derived from what the first pass reported.
   */
  it('reports an API that already exists as already present, not as installed', () => {
    const touched = ALL_APIS;
    try {
      for (const api of touched) dropApi(api);

      const first = installBrowserPolyfills();
      const firstFailedApis = first.failed.map((failure) => failure.api);
      const firstHealthyApis = touched.filter((api) => !firstFailedApis.includes(api));

      // With every intrinsic dropped, nothing is pre-existing, and every API
      // the first pass did not fail on was installed by that pass.
      expect(first.alreadyPresent).toEqual([]);
      expect([...first.installed].sort()).toEqual([...firstHealthyApis].sort());

      const second = installBrowserPolyfills();
      // A second pass installs nothing and invents no new failure.
      expect(second.installed).toEqual([]);
      expect(second.failed).toEqual(first.failed);
      // Everything the first pass made available is now merely already present.
      expect([...second.alreadyPresent].sort()).toEqual([...firstHealthyApis].sort());
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  /**
   * Runs in every host: the three buckets and their disjointness hold whether
   * or not the host can install `crypto.randomUUID`.
   */
  it('reports installed, already present and failed APIs in a single pass', () => {
    const touched = ALL_APIS;
    const alreadyApi = 'Array.prototype.at';
    const failingApi = 'Array.prototype.toSorted';
    const failing = requireTarget(failingApi);
    const definePropertySpy = failInstallationOf(
      failing.target,
      failing.name,
      new TypeError('mixed-state failure'),
    );

    try {
      for (const api of touched) dropApi(api);

      // A working implementation that is already there: reported as present
      // and never replaced.
      const sentinel = () => 'sentinel';
      Object.defineProperty(Array.prototype, 'at', {
        value: sentinel,
        writable: true,
        configurable: true,
        enumerable: false,
      });

      const result = installBrowserPolyfills();

      const installed = [...result.installed];
      const alreadyPresent = [...result.alreadyPresent];
      const failedApis = result.failed.map((failure) => failure.api);

      // The pre-existing API is reported exactly there, nowhere else, and its
      // implementation survives untouched.
      expect(alreadyPresent).toEqual([alreadyApi]);
      expect(installed).not.toContain(alreadyApi);
      expect(failedApis).not.toContain(alreadyApi);
      expect(readApi(alreadyApi)).toBe(sentinel);

      // The throwing installer is reported failed with its own reason, and it
      // appears in neither of the other two buckets.
      expect(result.failed.find((failure) => failure.api === failingApi)).toEqual({
        api: failingApi,
        reason: 'mixed-state failure',
      });
      expect(installed).not.toContain(failingApi);
      expect(alreadyPresent).not.toContain(failingApi);
      expect(readApi(failingApi)).toBeUndefined();

      // The three buckets are disjoint and every declared API is in exactly one.
      const accountedFor = [...installed, ...alreadyPresent, ...failedApis];
      expect(new Set(accountedFor).size, 'each API is reported once').toBe(accountedFor.length);
      expect([...accountedFor].sort()).toEqual(POLYFILLED_APIS.map((entry) => entry.api).sort());

      // Everything reported installed really is callable.
      for (const api of installed) {
        expect(typeof readApi(api), `${api} is callable after being reported installed`).toBe(
          'function',
        );
      }
    } finally {
      definePropertySpy.mockRestore();
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  it('reports the thrown value itself when an installer throws a non-Error', () => {
    const touched = ['Array.prototype.toReversed'];
    const failing = requireTarget('Array.prototype.toReversed');
    const thrownValue: unknown = 'boom';
    const definePropertySpy = failInstallationOf(failing.target, failing.name, thrownValue);

    try {
      dropApi('Array.prototype.toReversed');

      const result = installBrowserPolyfills();

      expect(result.failed).toEqual([{ api: 'Array.prototype.toReversed', reason: 'boom' }]);
      expect(readApi('Array.prototype.toReversed')).toBeUndefined();
    } finally {
      definePropertySpy.mockRestore();
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  it('falls back to the error name when the thrown Error has an empty message', () => {
    const touched = ['Object.hasOwn'];
    const failing = requireTarget('Object.hasOwn');
    const definePropertySpy = failInstallationOf(failing.target, failing.name, new Error(''));

    try {
      dropApi('Object.hasOwn');

      const result = installBrowserPolyfills();

      expect(result.failed).toEqual([{ api: 'Object.hasOwn', reason: 'Error' }]);
      expect(readApi('Object.hasOwn')).toBeUndefined();
    } finally {
      definePropertySpy.mockRestore();
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

  /**
   * Runs in every host: the startup report contract is that every declared API
   * is accounted for exactly once, and that no API other than the one needing a
   * host object (`crypto.randomUUID`) can be blamed in the report.
   */
  it('exposes the module-scope startup report to later consumers', () => {
    const report = readStartupPolyfillReport();

    expect(report.error).toBeNull();
    const result = report.result;
    if (!result) throw new Error('startup report missing its installation result');

    const accountedFor = [
      ...result.installed,
      ...result.alreadyPresent,
      ...result.failed.map((failure) => failure.api),
    ].sort();
    expect(accountedFor).toEqual(POLYFILLED_APIS.map((entry) => entry.api).sort());
    expect(result.failed.map((failure) => failure.api)).toEqual(
      hasWebCrypto ? [] : ['crypto.randomUUID'],
    );
  });
});
