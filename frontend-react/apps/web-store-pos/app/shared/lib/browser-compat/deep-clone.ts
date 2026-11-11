/**
 * Synchronous deep-clone used in place of `structuredClone`.
 *
 * `structuredClone` is only available from Chrome 98, and the project browser
 * floor is Chrome 89 (see `odd/tasks/browser-compatibility.md`, spec S4), so
 * production code cannot rely on it. `deepClone` is the supported stand-in.
 *
 * Supported shapes, cloned by value with cycles preserved through a `WeakMap`:
 * primitives (passed through), arrays (holes preserved), plain objects, `Error`
 * (subclasses included), `Date`, `RegExp`, `Map`, `Set`, and `ArrayBuffer` /
 * `ArrayBuffer` views. Boxed `Number` / `String` / `Boolean` wrappers are cloned
 * as the same wrapper around the same primitive, expandos included.
 *
 * Plain objects and foreign `Error`s are classified with `Object.prototype.toString`,
 * never with prototype identity or `instanceof`, so a value built in another
 * realm (iframe, worker, `vm` context) is cloned too: a foreign plain object is
 * still a record, and a foreign `Error` still takes the `Error` path. A
 * same-realm `Error` is caught earlier by `instanceof`, ahead of the custom-tag
 * gate, so an `Error` is never rejected for carrying a tag. That tag is
 * trusted ONLY for a value that carries no custom `Symbol.toStringTag` anywhere
 * on its prototype chain, because the symbol is writable by any record: a record
 * spoofing `'Error'` would otherwise be routed into the `Error` path and one
 * spoofing `'Promise'` would be rejected. A value that does carry one is
 * classified by prototype shape instead — a plain record (a prototype chain that
 * ends at `null`, in any realm) is cloned as a record, everything else goes to
 * the rejection helper. The other built-ins (`Date`, `RegExp`, `Map`, `Set`,
 * `ArrayBuffer`, views, `Array`) keep same-realm `instanceof` checks — a foreign
 * one is rejected, exactly as before. One shape is left unserved: an `Error` from
 * another realm that also carries a custom tag is rejected, because neither
 * `instanceof` nor the tag can be trusted for it.
 *
 * Every other value is REJECTED, never flattened into a hollow copy: functions,
 * symbols used as values, `Blob`, `File`, DOM nodes, `Promise`, `WeakMap` /
 * `WeakSet`, `URL`, and arbitrary class instances throw through
 * `throwDataCloneError` — a `DOMException` named `DataCloneError`, the very type
 * `structuredClone` throws, falling back to a `TypeError` only where
 * `DOMException` does not exist.
 *
 * Two deliberate differences from `structuredClone`, both intentional:
 * - NARROWER for binary and host objects: `structuredClone` really does clone
 *   `Blob` and `File`, and really does throw `DataCloneError` for DOM nodes;
 *   this helper rejects all of them. Nothing in the app clones binary or host
 *   objects, and copying their internal state without understanding it is the
 *   silent-loss failure this helper exists to prevent.
 * - STRICTER for class instances: this is not a narrower surface but a louder
 *   failure. `structuredClone` ACCEPTS a data-only class instance and returns a
 *   plain object, dropping the prototype and every non-enumerable field. Doing
 *   that here would lose instance state silently, so a class instance is
 *   rejected on purpose — including a data-only one, whose only sin is carrying
 *   a prototype this clone cannot reproduce.
 *
 * Error-type contract: rejection is a `DOMException` named `DataCloneError`, not
 * a `TypeError` (R3-001). Audited blast radius, re-confirmed through the
 * codegraph call graph: `deepClone` has exactly four callers, all inside
 * `WarehouseOfflineService.snapshotPurchaseEdit`
 * (`warehouse-offline-service.ts:1241,1245,1248,1249`), and none of them
 * discriminates on `TypeError` or `DOMException` — that snapshot is built before
 * the `try` that maps failures to a `DataResult`, so the rejection propagates
 * unchanged. No in-repo consumer needed migrating.
 */

type AnyRecord = Record<PropertyKey, unknown>;

/** Tags from `Object.prototype.toString`, spelled identically in every realm. */
const OBJECT_TAG = '[object Object]';
const ERROR_TAG = '[object Error]';
const BOXED_PRIMITIVE_TAGS: ReadonlySet<string> = new Set<string>([
  '[object Number]',
  '[object String]',
  '[object Boolean]',
]);

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

/**
 * Best-effort class name for the rejection message (`Widget`, `URL`, ...).
 *
 * The wording is part of the observable contract, not a debug aid: a caller (and
 * a test) reads "an object of unknown type" for a value whose constructor has no
 * name, so neither branch of this message is free to drift.
 */
function describeUnsupported(source: object): string {
  const name = (source as { constructor?: { name?: string } }).constructor?.name;
  return name ? `a ${name} instance` : 'an object of unknown type';
}

/**
 * True when `prototype` is a plain-object prototype in ANY realm.
 *
 * Identity against this realm's `Object.prototype` cannot answer that: another
 * realm's `Object.prototype` is, structurally, an object whose own prototype is
 * `null` — exactly like the prototype handed to `Object.create(null)`. So the
 * test is "the prototype has nothing above it", which holds for `null`, for this
 * realm's `Object.prototype`, and for a foreign one, while a class prototype
 * always has at least one more link (`Object.prototype` or a foreign
 * equivalent).
 */
function isPlainObjectPrototype(prototype: object | null): boolean {
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

/**
 * Clones a plain record, keeping its prototype (which may be another realm's
 * `Object.prototype`, or `null`) and copying its own properties by value.
 */
function clonePlainRecord<T>(
  source: object,
  prototype: object | null,
  seen: WeakMap<object, unknown>,
): T {
  const clone = Object.create(prototype) as AnyRecord;
  seen.set(source, clone);
  copyOwnProperties(source, clone, seen);
  return clone as T;
}

/**
 * Own property keys a fresh `Object(primitive)` wrapper already carries and
 * cannot accept again: a `String` wrapper exposes its characters as own,
 * non-writable, non-configurable index properties, so re-defining them throws.
 * They are already implied by the boxed primitive, so they are skipped; every
 * other own key on the source is an expando and is copied.
 */
function unassignableOwnKeys(target: object): ReadonlySet<PropertyKey> {
  const keys = new Set<PropertyKey>();
  for (const key of Reflect.ownKeys(target)) {
    if (Object.getOwnPropertyDescriptor(target, key)?.configurable === false) keys.add(key);
  }
  return keys;
}

/**
 * Clones a boxed primitive (`new Number`, `new String`, `new Boolean`).
 *
 * Its value lives in an internal slot, not in an own property, so copying own
 * properties would rebuild the shell and lose the value. `Object(primitive)`
 * re-boxes `valueOf()` into the same wrapper type; the resulting tag is checked
 * so a `Symbol.toStringTag` impostor whose `valueOf()` is not primitive is
 * rejected instead of being returned as a shared reference.
 *
 * Own expandos are copied with the same rules as a record — otherwise a wrapper
 * returned with its value but without the properties hanging off it would be the
 * hollow copy this module never returns. The clone is registered in `seen` before
 * those properties are walked, so a wrapper pointing at itself terminates.
 */
function cloneBoxedPrimitive(
  source: object,
  tag: string,
  seen: WeakMap<object, unknown>,
): object {
  const primitive = (source as { valueOf(): unknown }).valueOf();
  const clone = Object(primitive) as object;
  if (clone === source || Object.prototype.toString.call(clone) !== tag) {
    throwDataCloneError(`deepClone: cannot clone ${describeUnsupported(source)}`);
  }
  seen.set(source, clone);
  copyOwnProperties(source, clone as AnyRecord, seen, unassignableOwnKeys(clone));
  return clone;
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

  // Deliberately ahead of the custom-tag gate below: an `Error` is classified by
  // same-realm identity first, so a tagged `Error` still clones through this path
  // instead of being rejected for carrying a tag (R3-001).
  if (source instanceof Error) return cloneError(source, seen) as unknown as T;

  // Realm-independent classification. `instanceof` and prototype identity both
  // answer "is this ours?", which is the wrong question for a value that came
  // from another realm (iframe, worker, `vm` context) — those used to be
  // rejected even though `structuredClone` clones them.
  //
  // The intrinsic tag is trusted only when nothing on the prototype chain
  // overrides `Symbol.toStringTag`. That symbol is written by any object, so a
  // plain record carrying `'Error'` would be routed into the `Error` path and one
  // carrying `'Promise'` would be rejected, while the baseline cloned both as
  // plain records. A value that does carry a tag is therefore classified by
  // prototype shape: a plain record stays a record, anything else is rejected.
  if (Symbol.toStringTag in source) {
    const prototype = Object.getPrototypeOf(source);
    if (isPlainObjectPrototype(prototype)) return clonePlainRecord<T>(source, prototype, seen);
    throwDataCloneError(`deepClone: cannot clone ${describeUnsupported(source)}`);
  }

  const tag = Object.prototype.toString.call(source);

  if (tag === ERROR_TAG) return cloneError(source as Error, seen) as unknown as T;

  if (BOXED_PRIMITIVE_TAGS.has(tag)) {
    return cloneBoxedPrimitive(source, tag, seen) as unknown as T;
  }

  if (tag === OBJECT_TAG) {
    const prototype = Object.getPrototypeOf(source);
    if (isPlainObjectPrototype(prototype)) return clonePlainRecord<T>(source, prototype, seen);
  }

  throwDataCloneError(`deepClone: cannot clone ${describeUnsupported(source)}`);
}

/** Faithful, synchronous stand-in for `structuredClone` on the Chrome 89 floor. */
export function deepClone<T>(value: T): T {
  return cloneValue(value, new WeakMap<object, unknown>());
}
