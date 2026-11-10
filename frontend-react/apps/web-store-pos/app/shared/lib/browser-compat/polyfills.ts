/**
 * API polyfills for the project browser floor (Chrome 89).
 *
 * `build.target` lowers JavaScript syntax only; it never adds missing APIs.
 * A device running the observed production browser (Chrome/89.0.4389.116,
 * Android 9) still lacks every API below, and a dependency that calls one
 * crashes the whole page with `TypeError: ... is not a function`. Importing
 * this module installs the shims before any application or library module
 * evaluates, which is why `app/entry.client.tsx` imports it first.
 *
 * Installation is idempotent: an API that already exists is never replaced.
 * Every definition is declared non-enumerable so `for...in` and
 * `Object.keys` behave exactly as before.
 */

type AnyRecord = Record<string, unknown>;

const arrayPrototype = Array.prototype as unknown as AnyRecord;
const stringPrototype = String.prototype as unknown as AnyRecord;
const objectConstructor = Object as unknown as AnyRecord;

/** Installs `value` as a non-enumerable, writable, configurable property. */
function defineHidden(target: AnyRecord, name: string, value: unknown): void {
  Object.defineProperty(target, name, {
    value,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/** `ToIntegerOrInfinity` for the index argument of `at`. */
function toRelativeIndex(index: number): number {
  const integer = Math.trunc(index);
  return Number.isNaN(integer) ? 0 : integer;
}

function installArrayAt(): void {
  if (typeof arrayPrototype.at === 'function') return;
  defineHidden(arrayPrototype, 'at', function at(this: unknown[], index: number): unknown {
    const length = this.length;
    const relativeIndex = toRelativeIndex(index);
    const k = relativeIndex >= 0 ? relativeIndex : length + relativeIndex;
    if (k < 0 || k >= length) return undefined;
    return this[k];
  });
}

function installStringAt(): void {
  if (typeof stringPrototype.at === 'function') return;
  defineHidden(stringPrototype, 'at', function at(this: string, index: number): string | undefined {
    const length = this.length;
    const relativeIndex = toRelativeIndex(index);
    const k = relativeIndex >= 0 ? relativeIndex : length + relativeIndex;
    if (k < 0 || k >= length) return undefined;
    // Standard `at` returns one UTF-16 code unit, not a whole code point.
    return this.charAt(k);
  });
}

function installFindLast(): void {
  if (typeof arrayPrototype.findLast === 'function') return;
  defineHidden(
    arrayPrototype,
    'findLast',
    function findLast(
      this: unknown[],
      predicate: (value: unknown, index: number, array: unknown[]) => unknown,
      thisArg?: unknown,
    ): unknown {
      if (typeof predicate !== 'function') {
        throw new TypeError('Array.prototype.findLast: predicate is not a function');
      }
      for (let i = this.length - 1; i >= 0; i -= 1) {
        if (i in this && predicate.call(thisArg, this[i], i, this)) return this[i];
      }
      return undefined;
    },
  );
}

function installFindLastIndex(): void {
  if (typeof arrayPrototype.findLastIndex === 'function') return;
  defineHidden(
    arrayPrototype,
    'findLastIndex',
    function findLastIndex(
      this: unknown[],
      predicate: (value: unknown, index: number, array: unknown[]) => unknown,
      thisArg?: unknown,
    ): number {
      if (typeof predicate !== 'function') {
        throw new TypeError('Array.prototype.findLastIndex: predicate is not a function');
      }
      for (let i = this.length - 1; i >= 0; i -= 1) {
        if (i in this && predicate.call(thisArg, this[i], i, this)) return i;
      }
      return -1;
    },
  );
}

function installToSorted(): void {
  if (typeof arrayPrototype.toSorted === 'function') return;
  defineHidden(
    arrayPrototype,
    'toSorted',
    function toSorted(
      this: unknown[],
      compareFn?: (a: unknown, b: unknown) => number,
    ): unknown[] {
      if (compareFn !== undefined && typeof compareFn !== 'function') {
        throw new TypeError('Array.prototype.toSorted: comparator is not a function');
      }
      const copy = Array.from(this as ArrayLike<unknown>);
      if (compareFn) copy.sort(compareFn);
      else copy.sort();
      return copy;
    },
  );
}

function installToReversed(): void {
  if (typeof arrayPrototype.toReversed === 'function') return;
  defineHidden(arrayPrototype, 'toReversed', function toReversed(this: unknown[]): unknown[] {
    return Array.from(this as ArrayLike<unknown>).reverse();
  });
}

function installToSpliced(): void {
  if (typeof arrayPrototype.toSpliced === 'function') return;
  defineHidden(
    arrayPrototype,
    'toSpliced',
    function toSpliced(
      this: unknown[],
      start: number,
      deleteCount?: number,
      ...items: unknown[]
    ): unknown[] {
      const length = this.length;
      const relativeStart = toRelativeIndex(start);
      const actualStart = relativeStart < 0
        ? Math.max(length + relativeStart, 0)
        : Math.min(relativeStart, length);
      const actualDeleteCount = deleteCount === undefined
        ? length - actualStart
        : Math.min(Math.max(toRelativeIndex(deleteCount), 0), length - actualStart);

      const result: unknown[] = [];
      for (let i = 0; i < actualStart; i += 1) result.push(this[i]);
      for (const item of items) result.push(item);
      for (let i = actualStart + actualDeleteCount; i < length; i += 1) result.push(this[i]);
      return result;
    },
  );
}

function installObjectHasOwn(): void {
  if (typeof objectConstructor.hasOwn === 'function') return;
  defineHidden(
    objectConstructor,
    'hasOwn',
    function hasOwn(target: unknown, propertyKey: PropertyKey): boolean {
      return Object.prototype.hasOwnProperty.call(target, propertyKey);
    },
  );
}

/** Installs every polyfilled API that is still missing. Safe to call repeatedly. */
export function installBrowserPolyfills(): void {
  installArrayAt();
  installStringAt();
  installFindLast();
  installFindLastIndex();
  installToSorted();
  installToReversed();
  installToSpliced();
  installObjectHasOwn();
}

installBrowserPolyfills();
