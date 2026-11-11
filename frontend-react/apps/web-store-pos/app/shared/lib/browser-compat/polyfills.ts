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
 * Rule: a missing polyfill degrades that one API, it never takes the app down.
 * Each installer runs inside its own `try/catch`, so a hardened browser (frozen
 * or locked intrinsics) or a fingerprinting-protection extension that refuses
 * `Object.defineProperty` costs exactly the API it blocked: module evaluation
 * still completes, `entry.client` still mounts, and every other polyfill is
 * still installed. The failure is reported in the returned result instead of
 * being thrown; the module-scope call below keeps that result, warns once and
 * exposes it through `readStartupPolyfillReport` so the degradation is visible
 * on a device in the field.
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

/** One polyfilled API, named exactly as in `POLYFILLED_APIS`. */
interface PolyfillInstaller {
  readonly api: string;
  readonly isPresent: () => boolean;
  readonly install: () => void;
}

const POLYFILL_INSTALLERS: readonly PolyfillInstaller[] = [
  {
    api: 'Array.prototype.at',
    isPresent: () => typeof arrayPrototype.at === 'function',
    install: installArrayAt,
  },
  {
    api: 'String.prototype.at',
    isPresent: () => typeof stringPrototype.at === 'function',
    install: installStringAt,
  },
  {
    api: 'Array.prototype.findLast',
    isPresent: () => typeof arrayPrototype.findLast === 'function',
    install: installFindLast,
  },
  {
    api: 'Array.prototype.findLastIndex',
    isPresent: () => typeof arrayPrototype.findLastIndex === 'function',
    install: installFindLastIndex,
  },
  {
    api: 'Array.prototype.toSorted',
    isPresent: () => typeof arrayPrototype.toSorted === 'function',
    install: installToSorted,
  },
  {
    api: 'Array.prototype.toReversed',
    isPresent: () => typeof arrayPrototype.toReversed === 'function',
    install: installToReversed,
  },
  {
    api: 'Array.prototype.toSpliced',
    isPresent: () => typeof arrayPrototype.toSpliced === 'function',
    install: installToSpliced,
  },
  {
    api: 'Object.hasOwn',
    isPresent: () => typeof objectConstructor.hasOwn === 'function',
    install: installObjectHasOwn,
  },
];

export interface PolyfillFailure {
  /** API name, same spelling as `POLYFILLED_APIS`. */
  readonly api: string;
  /** Human-readable cause of the rejected installation. */
  readonly reason: string;
}

export interface PolyfillInstallResult {
  /** APIs this call actually installed. */
  readonly installed: string[];
  /** APIs that already existed and were therefore left untouched. */
  readonly alreadyPresent: string[];
  /** APIs whose installer threw; each one stays missing. */
  readonly failed: PolyfillFailure[];
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

/**
 * Installs every polyfilled API that is still missing. Safe to call repeatedly.
 *
 * Never throws: each installer is isolated, so one rejected API cannot abort
 * the remaining installers or module evaluation.
 */
export function installBrowserPolyfills(): PolyfillInstallResult {
  const result: PolyfillInstallResult = { installed: [], alreadyPresent: [], failed: [] };

  for (const { api, isPresent, install } of POLYFILL_INSTALLERS) {
    try {
      if (isPresent()) {
        result.alreadyPresent.push(api);
        continue;
      }
      install();
      result.installed.push(api);
    } catch (error) {
      result.failed.push({ api, reason: describeFailure(error) });
    }
  }

  return result;
}

export interface StartupPolyfillReport {
  /** What the module-scope installation produced, or `null` when it threw. */
  readonly result: PolyfillInstallResult | null;
  /** The thrown value rendered as text, or `null` when the run completed. */
  readonly error: string | null;
}

const STARTUP_WARNING_PREFIX = '[browser-compat]';

let startupReport: StartupPolyfillReport = { result: null, error: null };

/**
 * Leaves a trace in the console when the startup run degraded.
 *
 * Deliberately `console.warn` and no import: importing the diagnostic log here
 * would drag `global-config` into the very first module the bundle evaluates,
 * breaking "polyfills run first". `root.tsx` flushes the same report into the
 * exportable `/diagnostics` log once it is mounted.
 */
function warnAboutStartupDegradation(report: StartupPolyfillReport): void {
  try {
    if (report.error !== null) {
      console.warn(
        `${STARTUP_WARNING_PREFIX} polyfills failed at startup: ${report.error}`,
      );
      return;
    }
    const failed = report.result?.failed ?? [];
    if (failed.length === 0) return;
    const details = failed.map(({ api, reason }) => `${api}: ${reason}`).join('; ');
    console.warn(`${STARTUP_WARNING_PREFIX} polyfills degraded at startup: ${details}`);
  } catch {
    // A hardened browser can make even `console.warn` throw; losing a warning
    // line never justifies taking module evaluation down.
  }
}

try {
  startupReport = { result: installBrowserPolyfills(), error: null };
} catch (error) {
  // Defensive only: `installBrowserPolyfills` isolates every installer, so
  // nothing reaches here. Module evaluation must never fail on a polyfill.
  startupReport = { result: null, error: describeFailure(error) };
}

warnAboutStartupDegradation(startupReport);

/**
 * Read-only snapshot of the module-scope installation, for consumers that load
 * later (e.g. `app/root.tsx`, which persists it in the diagnostic log).
 */
export function readStartupPolyfillReport(): StartupPolyfillReport {
  const { result, error } = startupReport;
  return {
    error,
    result: result
      ? {
          installed: [...result.installed],
          alreadyPresent: [...result.alreadyPresent],
          failed: result.failed.map((failure) => ({ ...failure })),
        }
      : null,
  };
}
