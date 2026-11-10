/**
 * Synchronous deep-clone used in place of `structuredClone`.
 *
 * `structuredClone` is only available from Chrome 98, and the project browser
 * floor is Chrome 89 (see `odd/tasks/browser-compatibility.md`, spec S4), so
 * production code cannot rely on it. `deepClone` is the supported stand-in: it
 * handles primitives, arrays, plain objects, `Date`, `RegExp`, `Map`, `Set` and
 * `ArrayBuffer` / typed-array views, preserves cycles through a `WeakMap`, and
 * throws `TypeError` for the values `structuredClone` refuses (functions and
 * symbols used as values).
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

/** Copies the bytes of an `ArrayBufferLike` into a fresh `ArrayBuffer`. */
function cloneBuffer(buffer: ArrayBufferLike): ArrayBuffer {
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(new Uint8Array(buffer));
  return copy;
}

function cloneValue<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (value === null) return value;

  const type = typeof value;
  if (type === 'function') {
    throw new TypeError('deepClone: cannot clone a function');
  }
  if (type === 'symbol') {
    throw new TypeError('deepClone: cannot clone a symbol');
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

  const clone = Object.create(Object.getPrototypeOf(source)) as AnyRecord;
  seen.set(source, clone);
  for (const key of Object.keys(source)) {
    clone[key] = cloneValue((source as AnyRecord)[key], seen);
  }
  // Symbol keys are not clonable values, so they are carried over by reference.
  for (const key of Object.getOwnPropertySymbols(source)) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) Object.defineProperty(clone, key, descriptor);
  }
  return clone as T;
}

/** Faithful, synchronous stand-in for `structuredClone` on the Chrome 89 floor. */
export function deepClone<T>(value: T): T {
  return cloneValue(value, new WeakMap<object, unknown>());
}
