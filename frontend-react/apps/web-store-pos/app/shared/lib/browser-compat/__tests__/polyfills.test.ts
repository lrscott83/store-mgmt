import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { POLYFILLED_APIS } from '@store-mgmt/eslint-config/browser-compat';
import type { PolyfillInstallResult } from '../polyfills';

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
}

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

function readApi(api: string): unknown {
  const entry = requireTarget(api);
  return asRecord(entry.target)[entry.name];
}

/** Deletes an API from its owner and proves it is really gone. */
function dropApi(api: string): void {
  const entry = requireTarget(api);
  delete asRecord(entry.target)[entry.name];
  expect(readApi(api)).toBeUndefined();
}

/**
 * Captured while the originals are still in place: this module's top-level
 * code runs before `beforeAll` dynamically imports the polyfills module.
 */
const ORIGINAL_DESCRIPTORS = new Map<string, PropertyDescriptor | undefined>();
for (const [api, entry] of Object.entries(API_TARGETS)) {
  ORIGINAL_DESCRIPTORS.set(api, Object.getOwnPropertyDescriptor(entry.target, entry.name));
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
    if (original) Object.defineProperty(entry.target, entry.name, original);
    else delete asRecord(entry.target)[entry.name];
  }
}

/** Proves a test really put the intrinsics it touched back the way it found them. */
function expectOriginalDescriptors(apis: readonly string[]): void {
  for (const api of apis) {
    const entry = requireTarget(api);
    expect(
      Object.getOwnPropertyDescriptor(entry.target, entry.name),
      `${api} is back to its original descriptor`,
    ).toEqual(ORIGINAL_DESCRIPTORS.get(api));
  }
}

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
  restoreApis(ALL_APIS);
});

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

  it('covers exactly the APIs declared in POLYFILLED_APIS', () => {
    const touched = ALL_APIS;
    try {
      expect(POLYFILLED_APIS.length).toBeGreaterThan(0);

      const declaredNames = POLYFILLED_APIS.map((entry) => entry.api).sort();
      expect(Object.keys(API_TARGETS).sort()).toEqual(declaredNames);

      for (const entry of POLYFILLED_APIS) dropApi(entry.api);
      installBrowserPolyfills();
      for (const entry of POLYFILLED_APIS) {
        expect(typeof readApi(entry.api), `${entry.api} is declared as polyfilled`).toBe('function');
      }
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });

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

      expect(result.failed).toEqual([
        { api: failingApi, reason: 'Cannot redefine property: toSorted' },
      ]);
      expect([...result.installed].sort()).toEqual(
        touched.filter((api) => api !== failingApi).sort(),
      );
      expect(result.alreadyPresent).toEqual([]);

      // App-visible outcome: only the failed API is missing, the rest work.
      expect(readApi(failingApi)).toBeUndefined();
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

  it('reports an API that already exists as already present, not as installed', () => {
    const touched = ALL_APIS;
    try {
      for (const api of touched) dropApi(api);

      const first = installBrowserPolyfills();
      expect([...first.installed].sort()).toEqual([...touched].sort());

      const second = installBrowserPolyfills();
      expect(second.installed).toEqual([]);
      expect(second.failed).toEqual([]);
      expect([...second.alreadyPresent].sort()).toEqual([...touched].sort());
    } finally {
      restoreApis(touched);
    }
    expectOriginalDescriptors(touched);
  });
});
