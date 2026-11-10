/**
 * Synchronous deep-clone used in place of `structuredClone`.
 *
 * `structuredClone` is only available from Chrome 98, and the project browser
 * floor is Chrome 89 (see `odd/tasks/browser-compatibility.md`, spec S4), so
 * production code cannot rely on it. `deepClone` is the supported stand-in.
 *
 * Supported shapes, cloned by value with cycles preserved through a `WeakMap`:
 * primitives (passed through), arrays (holes preserved), plain objects (own
 * prototype `Object.prototype` or `null`), `Error` (including subclasses),
 * `Date`, `RegExp`, `Map`, `Set`, and `ArrayBuffer` / `ArrayBuffer` views.
 *
 * Every other value is REJECTED, never flattened into a hollow copy: functions,
 * symbols used as values, and any object whose prototype is not `Object.prototype`
 * or `null` (`Blob`, `File`, `URL`, `Promise`, `WeakMap`, DOM nodes, arbitrary
 * class instances) throw through `throwDataCloneError`, a `DOMException` named
 * `DataCloneError` — the same failure `structuredClone` reports — falling back to
 * a `TypeError` only where `DOMException` does not exist.
 *
 * One deliberate, documented deviation from `structuredClone`: a class instance
 * is NOT flattened into a plain object. `structuredClone` would drop the prototype
 * and silently lose the instance state; here the mismatch is loud instead.
 */

type AnyRecord = Record<PropertyKey, unknown>;

/** A typed-array view, narrowed to the members the clone needs. */
interface TypedArrayView extends ArrayBufferView {
  readonly length: number;
  readonly constructor: new (
    buffer: ArrayBuffer,
    byteOffset: number,
    length: number,
  ) => ArrayBufferView;
}

/**
 * Rejects a value the clone cannot reproduce faithfully. The shape mirrors what
 * `structuredClone` throws, so a caller can tell "not clonable" apart from a bug.
 */
function throwDataCloneError(message: string): never {
  if (typeof DOMException === 'function') {
    throw new DOMException(message, 'DataCloneError');
  }
  throw new TypeError(message);
}

/** Copies the bytes of an `ArrayBufferLike` into a fresh `ArrayBuffer`. */
function cloneBuffer(buffer: ArrayBufferLike): ArrayBuffer {
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(new Uint8Array(buffer));
  return copy;
}

/**
 * Defines an own enumerable data property.
 *
 * `clone[key] = value` cannot be used for this: an own `"__proto__"` key would
 * hit `Object.prototype.__proto__` and re-parent the clone instead of creating a
 * property.
 */
function defineOwnDataProperty(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Copies own properties onto `clone`.
 *
 * String keys are read through `Object.keys` (own enumerable only); symbol keys
 * keep their original descriptor so accessors still work, but a data descriptor's
 * value is cloned — getters and setters are not clonable values, so they are
 * carried over by reference.
 */
function copyOwnProperties(
  source: object,
  clone: AnyRecord,
  seen: WeakMap<object, unknown>,
  skipKeys?: ReadonlySet<PropertyKey>,
): void {
  for (const key of Object.keys(source)) {
    if (skipKeys?.has(key)) continue;
    defineOwnDataProperty(clone, key, cloneValue((source as AnyRecord)[key], seen));
  }
  for (const key of Object.getOwnPropertySymbols(source)) {
    if (skipKeys?.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor) continue;
    if ('value' in descriptor) {
      Object.defineProperty(clone, key, {
        value: cloneValue(descriptor.value, seen),
        writable: descriptor.writable,
        enumerable: descriptor.enumerable,
        configurable: descriptor.configurable,
      });
    } else {
      Object.defineProperty(clone, key, descriptor);
    }
  }
}

const ERROR_INTRINSIC_KEYS: ReadonlySet<PropertyKey> = new Set<PropertyKey>([
  'name',
  'message',
  'stack',
  'cause',
]);

/**
 * Installs one `Error` intrinsic (`name`, `message`, `stack`) as an own data
 * property when the source exposes it.
 *
 * The value is read THROUGH the property rather than from the descriptor: V8
 * installs `stack` as an own lazy accessor, so a descriptor-only copy silently
 * drops it.
 */
function copyErrorIntrinsic(clone: AnyRecord, source: Error, key: string): void {
  if (!(key in source)) return;
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  const value =
    descriptor && 'value' in descriptor ? descriptor.value : (source as unknown as AnyRecord)[key];
  if (value === undefined) return;
  Object.defineProperty(clone, key, {
    value,
    writable: true,
    enumerable: descriptor?.enumerable ?? false,
    configurable: true,
  });
}

/**
 * Clones an `Error` (subclasses included) preserving its class, the intrinsic
 * `name` / `message` / `stack` data properties, and a cloned `cause`.
 */
function cloneError(source: Error, seen: WeakMap<object, unknown>): Error {
  const clone = Object.create(Object.getPrototypeOf(source)) as Error & AnyRecord;
  seen.set(source, clone);

  for (const key of ['name', 'message', 'stack'] as const) {
    copyErrorIntrinsic(clone as AnyRecord, source, key);
  }

  const cause = Object.getOwnPropertyDescriptor(source, 'cause');
  if (cause && 'value' in cause) {
    Object.defineProperty(clone, 'cause', {
      value: cloneValue(cause.value, seen),
      writable: cause.writable,
      enumerable: cause.enumerable,
      configurable: cause.configurable,
    });
  }

  copyOwnProperties(source, clone as AnyRecord, seen, ERROR_INTRINSIC_KEYS);
  return clone;
}

/** Best-effort class name for the rejection message (`Widget`, `URL`, ...). */
function describeUnsupported(source: object): string {
  const name = (source as { constructor?: { name?: string } }).constructor?.name;
  return name ? `${name} instance` : 'object';
}

function cloneValue<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (value === null) return value;

  const type = typeof value;
  if (type === 'function') {
    throwDataCloneError('deepClone: cannot clone a function');
  }
  if (type === 'symbol') {
    throwDataCloneError('deepClone: cannot clone a symbol');
  }
  // undefined, boolean, number, string, bigint are immutable and pass through.
  if (type !== 'object') return value;

  const source = value as unknown as object;

  const cached = seen.get(source);
  if (cached !== undefined) return cached as T;

  if (source instanceof Date) {
    const clone = new Date(source.getTime());
    seen.set(source, clone);
    return clone as T;
  }

  if (source instanceof RegExp) {
    const clone = new RegExp(source.source, source.flags);
    clone.lastIndex = source.lastIndex;
    seen.set(source, clone);
    return clone as T;
  }

  if (source instanceof Map) {
    const clone = new Map<unknown, unknown>();
    seen.set(source, clone);
    for (const [key, entry] of source) {
      clone.set(cloneValue(key, seen), cloneValue(entry, seen));
    }
    return clone as T;
  }

  if (source instanceof Set) {
    const clone = new Set<unknown>();
    seen.set(source, clone);
    for (const entry of source) clone.add(cloneValue(entry, seen));
    return clone as T;
  }

  if (source instanceof ArrayBuffer) {
    const clone = cloneBuffer(source);
    seen.set(source, clone);
    return clone as T;
  }

  if (ArrayBuffer.isView(source)) {
    const view = source as unknown as TypedArrayView;
    const buffer = cloneBuffer(view.buffer);
    const clone =
      source instanceof DataView
        ? new DataView(buffer, view.byteOffset, view.byteLength)
        : new view.constructor(buffer, view.byteOffset, view.length);
    seen.set(source, clone);
    return clone as T;
  }

  if (Array.isArray(source)) {
    const clone: unknown[] = new Array(source.length);
    seen.set(source, clone);
    for (let index = 0; index < source.length; index += 1) {
      // `in` keeps sparse holes as holes instead of turning them into undefined.
      if (index in source) clone[index] = cloneValue(source[index], seen);
    }
    return clone as T;
  }

  if (source instanceof Error) return cloneError(source, seen) as unknown as T;

  const prototype = Object.getPrototypeOf(source);
  if (prototype !== Object.prototype && prototype !== null) {
    throwDataCloneError(`deepClone: cannot clone a ${describeUnsupported(source)}`);
  }

  const clone = Object.create(prototype) as AnyRecord;
  seen.set(source, clone);
  copyOwnProperties(source, clone, seen);
  return clone as T;
}

/** Faithful, synchronous stand-in for `structuredClone` on the Chrome 89 floor. */
export function deepClone<T>(value: T): T {
  return cloneValue(value, new WeakMap<object, unknown>());
}
