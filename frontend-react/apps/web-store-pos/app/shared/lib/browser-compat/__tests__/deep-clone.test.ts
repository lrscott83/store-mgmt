import { describe, it, expect, afterEach, vi } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { deepClone } from '../deep-clone';

afterEach(() => {
  // Every global stubbed below is restored here, so a stub cannot leak into
  // another test in this file or the next one.
  vi.unstubAllGlobals();
});

/**
 * Asserts the value the clone refuses is rejected the way `structuredClone`
 * rejects it: a real `DOMException` named `DataCloneError`, not `TypeError` and
 * not something that merely carries that `name` (R3-002).
 *
 * The action runs ONCE: re-invoking it to observe a second time asserted nothing
 * the first capture had not already pinned, and hid a double execution.
 */
function expectDataCloneError(action: () => unknown): Error {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeDefined();
  expect(caught).toBeInstanceOf(DOMException);
  expect((caught as Error).name).toBe('DataCloneError');
  expect(caught).not.toBeInstanceOf(TypeError);
  return caught as Error;
}

describe('deepClone', () => {
  it('returns primitives unchanged', () => {
    expect(deepClone(undefined)).toBeUndefined();
    expect(deepClone(null)).toBeNull();
    expect(deepClone(42)).toBe(42);
    expect(deepClone(0)).toBe(0);
    expect(deepClone('text')).toBe('text');
    expect(deepClone('')).toBe('');
    expect(deepClone(true)).toBe(true);
    expect(deepClone(false)).toBe(false);
    expect(deepClone(10n)).toBe(10n);
  });

  it('clones a plain object by value with a distinct reference', () => {
    const original = { id: 'a-1', quantity: 3, nested: { cost: 7.5 } };
    const clone = deepClone(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.nested).not.toBe(original.nested);

    clone.nested.cost = 99;
    clone.quantity = 1000;
    expect(original.nested.cost).toBe(7.5);
    expect(original.quantity).toBe(3);
  });

  it('clones a nested array of objects with distinct references at every level', () => {
    const original = [{ lots: [{ costPrice: 1 }, { costPrice: 2 }] }, { lots: [] }];
    const clone = deepClone(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone[0]).not.toBe(original[0]);
    expect(clone[0].lots).not.toBe(original[0].lots);
    expect(clone[0].lots[0]).not.toBe(original[0].lots[0]);

    clone[0].lots[0].costPrice = 500;
    clone.push({ lots: [] });
    expect(original[0].lots[0].costPrice).toBe(1);
    expect(original).toHaveLength(2);
  });

  it('preserves holes when cloning a sparse array', () => {
    // A real hole, not a present `undefined`: index 1 has never been written.
    const first = { id: 'first' };
    const third = { id: 'third' };
    const sparse: unknown[] = new Array(3);
    sparse[0] = first;
    sparse[2] = third;
    expect(sparse).toHaveLength(3);
    expect(1 in sparse, 'the source really carries a hole').toBe(false);

    const clone = deepClone(sparse);

    // Same length, and the hole is still absent rather than materialized.
    expect(clone).toHaveLength(3);
    expect(1 in clone, 'the hole survives as a hole').toBe(false);
    // The present elements are cloned by value, not shared by reference.
    expect(clone[0]).toEqual({ id: 'first' });
    expect(clone[0]).not.toBe(first);
    expect(clone[2]).toEqual({ id: 'third' });
    expect(clone[2]).not.toBe(third);
    expect(clone).not.toBe(sparse);

    // The original is unmodified: still sparse, same length, same values.
    expect(sparse).toHaveLength(3);
    expect(1 in sparse).toBe(false);
    expect(sparse[0]).toBe(first);
    expect(sparse[2]).toBe(third);
  });

  it('clones a Date by value with a distinct reference', () => {
    const original = new Date('2026-11-10T08:30:00.000Z');
    const clone = deepClone(original);

    expect(clone).toBeInstanceOf(Date);
    expect(clone).not.toBe(original);
    expect(clone.getTime()).toBe(original.getTime());

    clone.setUTCFullYear(1990);
    expect(original.getUTCFullYear()).toBe(2026);
  });

  it('clones a Map by value with a distinct reference', () => {
    const original = new Map<string, unknown>([
      ['a', { quantity: 1 }],
      ['b', [1, 2]],
    ]);
    const clone = deepClone(original);

    expect(clone).toBeInstanceOf(Map);
    expect(clone).not.toBe(original);
    expect(clone.size).toBe(2);
    expect(clone.get('b')).toEqual([1, 2]);
    expect(clone.get('b')).not.toBe(original.get('b'));

    const clonedEntry = clone.get('a') as { quantity: number };
    clonedEntry.quantity = 9;
    expect((original.get('a') as { quantity: number }).quantity).toBe(1);
  });

  it('clones a Set by value with a distinct reference', () => {
    const member = { id: 1 };
    const original = new Set<unknown>(['x', member]);
    const clone = deepClone(original);

    expect(clone).toBeInstanceOf(Set);
    expect(clone).not.toBe(original);
    expect(clone.size).toBe(2);
    expect(clone.has('x')).toBe(true);
    expect(clone.has(member)).toBe(false);

    const clonedMember = [...clone].find((value) => typeof value === 'object') as { id: number };
    expect(clonedMember).not.toBe(member);
    clonedMember.id = 2;
    expect(member.id).toBe(1);
  });

  it('clones a RegExp by value with a distinct reference', () => {
    const original = /ab+c/gi;
    const clone = deepClone(original);

    expect(clone).toBeInstanceOf(RegExp);
    expect(clone).not.toBe(original);
    expect(clone.source).toBe(original.source);
    expect(clone.flags).toBe(original.flags);
    expect(clone.test('ABBc')).toBe(true);
  });

  it('clones ArrayBuffer and typed-array views into independent buffers', () => {
    const buffer = new ArrayBuffer(8);
    new Uint8Array(buffer).set([1, 2, 3, 4, 5, 6, 7, 8]);
    const bufferClone = deepClone(buffer);

    expect(bufferClone).toMatchObject({ byteLength: 8 });
    expect(bufferClone).not.toBe(buffer);
    new Uint8Array(bufferClone)[0] = 99;
    expect(new Uint8Array(buffer)[0]).toBe(1);

    const view = new Uint16Array(buffer, 2, 2);
    const viewClone = deepClone(view);
    expect(viewClone).toBeInstanceOf(Uint16Array);
    expect(viewClone).not.toBe(view);
    expect(Array.from(viewClone)).toEqual(Array.from(view));
    expect(viewClone.buffer).not.toBe(view.buffer);
    viewClone[0] = 4242;
    expect(view[0]).not.toBe(4242);

    const dataView = new DataView(buffer, 0, 4);
    const dataViewClone = deepClone(dataView);
    expect(dataViewClone).toBeInstanceOf(DataView);
    expect(dataViewClone).not.toBe(dataView);
    expect(dataViewClone.byteLength).toBe(dataView.byteLength);
    expect(dataViewClone.buffer).not.toBe(dataView.buffer);
  });

  it('preserves cyclic references', () => {
    const original: Record<string, unknown> = { name: 'cycle' };
    original.self = original;

    const clone = deepClone(original);

    expect(clone).not.toBe(original);
    expect(clone.self).toBe(clone);
    expect(clone.name).toBe('cycle');
  });

  it('throws a DataCloneError when a function appears as a value', () => {
    expectDataCloneError(() => deepClone({ run: () => 1 }));
    expectDataCloneError(() => deepClone([() => 1]));
  });

  it('throws a DataCloneError when a symbol appears as a value', () => {
    expectDataCloneError(() => deepClone({ token: Symbol('token') }));
  });

  it('copies an own "__proto__" data property without re-parenting the clone', () => {
    const source: Record<string, unknown> = {};
    Object.defineProperty(source, '__proto__', {
      value: { polluted: true },
      writable: true,
      enumerable: true,
      configurable: true,
    });

    const clone = deepClone(source) as Record<string, unknown>;

    expect(Object.getPrototypeOf(clone)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(clone, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(clone, '__proto__')?.value).toEqual({ polluted: true });
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('clones the value behind a symbol-keyed own property instead of sharing it', () => {
    const key = Symbol('meta');
    const source: Record<PropertyKey, unknown> = { payload: 1 };
    source[key] = { tags: ['a'] };

    const clone = deepClone(source) as Record<PropertyKey, unknown>;

    expect(clone[key]).toEqual({ tags: ['a'] });
    expect(clone[key]).not.toBe(source[key]);
  });

  it('clones an Error subclass with its class, message, stack and a cloned cause', () => {
    class DomainError extends Error {
      constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'DomainError';
      }
    }

    const cause = { code: 'E_X' };
    const source = new DomainError('boom', { cause });

    const clone = deepClone(source);

    expect(clone).toBeInstanceOf(DomainError);
    expect(clone.name).toBe('DomainError');
    expect(clone.message).toBe('boom');
    expect(clone.stack).toBeDefined();
    expect(clone.stack).toBe(source.stack);
    expect(clone.cause).toEqual({ code: 'E_X' });
    expect(clone.cause).not.toBe(cause);
  });

  it('throws a DataCloneError for a data-only class instance instead of flattening it', () => {
    // Data-only on purpose: the fields are plain data, so flattening it would
    // "work" and silently drop the prototype — the exact loss this rejection
    // exists to prevent. A method-bearing instance would fail for a different,
    // less interesting reason.
    class Money {
      readonly amount = 1000;
      readonly currency = 'USD';
    }

    expectDataCloneError(() => deepClone(new Money()));
  });

  it('clones boxed Number, String and Boolean wrappers with their valueOf() preserved', () => {
    // `Object(primitive)` boxes exactly like `new Number` / `new String` /
    // `new Boolean`, minus the `no-new-wrappers` smell.
    const boxedNumber = Object(41.5);
    const boxedString = Object('boxed text');
    const boxedBoolean = Object(false);

    // R3-002: a wrapper is a normal object, so expandos are allowed on it. They
    // must survive the clone; dropping them would make the clone a hollow copy.
    const meta = Symbol('meta');
    const numberExtras = boxedNumber as unknown as Record<PropertyKey, unknown>;
    numberExtras.label = 'expando';
    numberExtras[meta] = { tags: ['a'] };

    const numberClone = deepClone(boxedNumber);
    const stringClone = deepClone(boxedString);
    const booleanClone = deepClone(boxedBoolean);

    expect(Object.prototype.toString.call(numberClone)).toBe('[object Number]');
    expect(Object.prototype.toString.call(stringClone)).toBe('[object String]');
    expect(Object.prototype.toString.call(booleanClone)).toBe('[object Boolean]');

    expect(numberClone).toBeInstanceOf(Number);
    expect(stringClone).toBeInstanceOf(String);
    expect(booleanClone).toBeInstanceOf(Boolean);

    expect(numberClone).not.toBe(boxedNumber);
    expect(stringClone).not.toBe(boxedString);
    expect(booleanClone).not.toBe(boxedBoolean);

    expect(numberClone.valueOf()).toBe(41.5);
    expect(stringClone.valueOf()).toBe('boxed text');
    expect(booleanClone.valueOf()).toBe(false);

    const clonedExtras = numberClone as unknown as Record<PropertyKey, unknown>;
    expect(clonedExtras.label).toBe('expando');
    expect(clonedExtras[meta]).toEqual({ tags: ['a'] });
    expect(clonedExtras[meta]).not.toBe(numberExtras[meta]);
  });

  it('terminates when a wrapper expando points back at the wrapper and re-points it at the clone', () => {
    // R3-002: the expando recursion is new, so its termination path needs proof.
    // A wrapper whose own property points back at itself would recurse forever
    // if the clone were not registered before its properties were walked.
    const source = Object(7);
    const sourceExtras = source as unknown as Record<PropertyKey, unknown>;
    sourceExtras.self = source;

    const clone = deepClone(source);
    const clonedExtras = clone as unknown as Record<PropertyKey, unknown> & { valueOf(): number };

    expect(clone).not.toBe(source);
    // The cloned expando points at the CLONE, not at the source wrapper.
    expect(clonedExtras.self).toBe(clone);
    expect(clonedExtras.self).not.toBe(source);
    expect(clonedExtras.valueOf()).toBe(7);
  });

  it('throws a DataCloneError when a wrapper expando holds a function', () => {
    // R3-002: a wrapper is cloned with its expandos, so an unclonable expando
    // must fail loudly instead of being dropped from the clone.
    const source = Object(1);
    (source as unknown as Record<PropertyKey, unknown>).run = () => 1;

    expectDataCloneError(() => deepClone(source));
  });

  it('clones a plain record built in another realm as a record', () => {
    // R3-003: a real second realm, not a same-realm structural stand-in. Only a
    // foreign prototype can prove the classification is realm-independent.
    const context = createContext({});
    const foreignRecord = runInContext(
      '({ id: "record-1", nested: { cost: 7 } })',
      context,
    ) as { id: string; nested: { cost: number } };

    // Preconditions: the record really is foreign and really is a plain record.
    expect(Object.getPrototypeOf(foreignRecord)).not.toBe(Object.prototype);
    expect(Object.prototype.toString.call(foreignRecord)).toBe('[object Object]');
    expect(foreignRecord).not.toBeInstanceOf(Object);

    const clone = deepClone(foreignRecord);

    expect(clone).not.toBe(foreignRecord);
    expect(Object.prototype.toString.call(clone)).toBe('[object Object]');
    expect(clone.id).toBe('record-1');
    expect(Object.keys(clone)).toEqual(['id', 'nested']);
    expect(clone.nested).toEqual({ cost: 7 });
    expect(clone.nested).not.toBe(foreignRecord.nested);
  });

  it('clones a plain record carrying a custom "Error" tag as a plain record', () => {
    // R3-001: `Symbol.toStringTag` is writable by any record, so the intrinsic
    // tag is an impostor target. Trusting it routed this record into the `Error`
    // path, which copies `message` by reference as an Error intrinsic; the record
    // path clones every own value, so reference identity tells the two apart.
    const message = { detail: 'not an error' };
    const source = {
      id: 'tagged',
      message,
      nested: { cost: 3 },
      [Symbol.toStringTag]: 'Error',
    };

    const clone = deepClone(source);

    expect(clone).not.toBe(source);
    expect(clone).not.toBeInstanceOf(Error);
    expect(Object.prototype.hasOwnProperty.call(clone, 'stack')).toBe(false);
    expect(clone.id).toBe('tagged');
    expect(clone.message).toEqual({ detail: 'not an error' });
    expect(clone.message).not.toBe(message);
    expect(clone.nested).toEqual({ cost: 3 });
    expect(clone.nested).not.toBe(source.nested);
    expect((clone as Record<PropertyKey, unknown>)[Symbol.toStringTag]).toBe('Error');
  });

  it('clones a plain record carrying a custom "Promise" tag instead of rejecting it', () => {
    // R3-001: the tag used to fall through to the catch-all rejection, although
    // the value is an ordinary record (the baseline cloned it as one).
    const source = { id: 'promise-lookalike', [Symbol.toStringTag]: 'Promise' };

    const clone = deepClone(source);

    expect(clone).not.toBe(source);
    expect(clone).not.toBeInstanceOf(Promise);
    expect(clone.id).toBe('promise-lookalike');
  });

  it('clones an Error carrying an own "Error" tag through the Error path', () => {
    // R3-001: the custom-tag gate must not be able to intercept an `Error` — the
    // same-realm `instanceof Error` classification runs first, so a value that is
    // BOTH an `Error` and tagged still takes the Error path instead of being
    // rejected for "carrying a custom tag".
    const source = new Error('tagged failure');
    Object.defineProperty(source, Symbol.toStringTag, {
      value: 'Error',
      writable: true,
      enumerable: false,
      configurable: true,
    });

    // Precondition: the value really is tagged, so the gate would see it.
    expect(Symbol.toStringTag in source).toBe(true);

    const clone = deepClone(source);

    expect(clone).not.toBe(source);
    expect(clone).toBeInstanceOf(Error);
    expect(clone.constructor).toBe(Error);
    expect(clone.message).toBe('tagged failure');
    expect(clone.stack).toBe(source.stack);
    expect(clone.stack).toBeDefined();
  });

  it('clones an Error subclass whose prototype defines a "Symbol.toStringTag" getter', () => {
    // R3-001: the tag reaches the object through the prototype chain, not as an
    // own property, which is the shape `Symbol.toStringTag in source` sees first.
    class TaggedError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'TaggedError';
      }

      get [Symbol.toStringTag](): string {
        return 'TaggedError';
      }
    }

    const source = new TaggedError('tagged subclass failure');

    // Precondition: the tag is inherited and the value really is an `Error`.
    expect(Object.prototype.hasOwnProperty.call(source, Symbol.toStringTag)).toBe(false);
    expect(Symbol.toStringTag in source).toBe(true);
    expect(source).toBeInstanceOf(Error);

    const clone = deepClone(source);

    expect(clone).not.toBe(source);
    expect(clone).toBeInstanceOf(TaggedError);
    expect(clone).toBeInstanceOf(Error);
    expect(clone.name).toBe('TaggedError');
    expect(clone.message).toBe('tagged subclass failure');
    expect(clone.stack).toBe(source.stack);
  });

  it('rejects an unsupported object with a stable unknown-type message', () => {
    // R3-005: the wording is part of the observable contract, so it is pinned.
    // An unnamed class instance behind the value leaves no constructor name to
    // report, which is the only way to reach the "unknown type" branch while the
    // prototype is still not a plain-record prototype.
    class UnnamedBase {}
    Object.defineProperty(UnnamedBase, 'name', { value: '' });
    const source = Object.create(new UnnamedBase());

    const caught = expectDataCloneError(() => deepClone(source));

    expect(caught.name).toBe('DataCloneError');
    expect(caught.message).toContain('deepClone: cannot clone');
    expect(caught.message).toContain('an object of unknown type');
  });

  it('clones an Error that came from another realm through the Error path', () => {
    const context = createContext({});
    const foreignError = runInContext(
      'new TypeError("boom from another realm", { cause: { code: "E_FOREIGN" } })',
      context,
    ) as Error & { cause?: { code: string } };

    // Precondition: this error really is from another realm, so the `instanceof
    // Error` fast path cannot see it and only its `[object Error]` tag can.
    expect(foreignError).not.toBeInstanceOf(Error);
    expect(Object.prototype.toString.call(foreignError)).toBe('[object Error]');

    const clone = deepClone(foreignError);

    expect(clone).not.toBe(foreignError);
    expect(clone.name).toBe('TypeError');
    expect(clone.message).toBe('boom from another realm');
    expect(clone.stack).toBe(foreignError.stack);
    expect(clone.cause).toEqual({ code: 'E_FOREIGN' });
    expect(clone.cause).not.toBe(foreignError.cause);
  });

  it('falls back to a TypeError when DOMException does not exist', () => {
    // R3-004: the fallback branch is documented, so it gets a test — through the
    // runner's global stub, not by assigning to `globalThis` by hand, and
    // asserting a stable property of the failure instead of the internal string.
    vi.stubGlobal('DOMException', undefined);

    let caught: unknown;
    try {
      deepClone({ run: () => 1 });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as Error).name).toBe('TypeError');
    expect((caught as Error).message).toContain('deepClone: cannot clone');
    expect((caught as Error).message).toContain('function');
  });

  it('throws a DataCloneError for unsupported built-ins (URL, WeakMap, Promise)', () => {
    expectDataCloneError(() => deepClone(new URL('https://example.com')));
    expectDataCloneError(() => deepClone(new WeakMap()));
    expectDataCloneError(() => deepClone(Promise.resolve(1)));
  });

  it('returns undefined for undefined input', () => {
    expect(deepClone<undefined>(undefined)).toBeUndefined();
  });
});

/**
 * Scale-correctness guard (R4-DEEPCLONE-NO-PERF-MEASUREMENT, reworked by R3-D,
 * cost coverage restored by R3-PERF-GUARD-REMOVED).
 *
 * `deepClone` replaced `structuredClone` in `WarehouseOfflineService.snapshotPurchaseEdit`,
 * where it runs synchronously over whole-store collections on every purchase-cost
 * edit — so it has to stay CORRECT at whole-store scale, not merely fast.
 *
 * The previous version of this guard used wall-clock time as its verdict. That is
 * not a unit-test assertion: the number depends on the machine's load, so it is
 * either flaky or so loose that it proves nothing. What is deterministic and still
 * catches a real regression is the observable result on a payload shaped like the
 * actual snapshot: cardinality, value equality, and no shared references at any
 * nesting level.
 *
 * Cost is covered separately and on demand, in the benchmark next to this file —
 * `deep-clone.bench.ts`, which clones the same payload shape at 250, 1 000 and
 * 4 000 stock levels so linear-vs-quadratic scaling is observable by comparing
 * time per level. Run it with:
 * `pnpm --filter @store-mgmt/web-store-pos exec vitest bench app/shared/lib/browser-compat/__tests__/deep-clone.bench.ts`
 */
const STOCK_LEVEL_COUNT = 250;
const LOTS_PER_LEVEL = 3;
const MOVEMENT_COUNT = 1_000;
const ENTRY_COUNT = 250;
const ORDER_COUNT = 100;

interface SnapshotStockLevel {
  id: string;
  warehouseId: string;
  productId: string;
  onHand: number;
  costPrice: number;
  lots: Array<{ costPrice: number; quantity: number; currency: number }>;
  createdDate: Date;
}

interface SnapshotMovement {
  id: string;
  warehouseId: string;
  productId: string;
  type: 'purchase_in';
  quantity: number;
  costPrice: number;
  reason: null;
  createdDate: Date;
  createdByName: string;
}

interface SnapshotEntry {
  id: string;
  productId: string;
  quantity: number;
  available: number;
  costPrice: number;
  currency: number;
  isActive: boolean;
  createdDate: Date;
}

interface SnapshotOrder {
  id: string;
  total: number;
  isActive: boolean;
  date: Date;
  orderItems: Array<{
    productId: string;
    quantity: number;
    price: number;
    productCosts: Array<{ inventoryId: string; costPrice: number; quantity: number }>;
  }>;
}

/** The four collections `snapshotPurchaseEdit` copies, at whole-store scale. */
interface SnapshotPayload {
  levels: SnapshotStockLevel[];
  movements: SnapshotMovement[];
  entries: SnapshotEntry[];
  orders: SnapshotOrder[];
}

function buildSnapshotPayload(): SnapshotPayload {
  const levels: SnapshotStockLevel[] = new Array(STOCK_LEVEL_COUNT);
  for (let index = 0; index < STOCK_LEVEL_COUNT; index += 1) {
    levels[index] = {
      id: `sl-${index}`,
      warehouseId: `wh-${index % 20}`,
      productId: `prod-${index}`,
      onHand: 10 + index,
      costPrice: 5.5,
      lots: Array.from({ length: LOTS_PER_LEVEL }, (_unused, lot) => ({
        costPrice: 5 + lot,
        quantity: 3,
        currency: 0,
      })),
      createdDate: new Date('2026-01-01T00:00:00.000Z'),
    };
  }

  const movements: SnapshotMovement[] = new Array(MOVEMENT_COUNT);
  for (let index = 0; index < MOVEMENT_COUNT; index += 1) {
    movements[index] = {
      id: `mv-${index}`,
      warehouseId: `wh-${index % 20}`,
      productId: `prod-${index % STOCK_LEVEL_COUNT}`,
      type: 'purchase_in',
      quantity: 1,
      costPrice: 5,
      reason: null,
      createdDate: new Date('2026-01-01T00:00:00.000Z'),
      createdByName: 'snapshot',
    };
  }

  const entries: SnapshotEntry[] = new Array(ENTRY_COUNT);
  for (let index = 0; index < ENTRY_COUNT; index += 1) {
    entries[index] = {
      id: `en-${index}`,
      productId: `prod-${index}`,
      quantity: 3,
      available: 2,
      costPrice: 5,
      currency: 0,
      isActive: true,
      createdDate: new Date('2026-01-01T00:00:00.000Z'),
    };
  }

  const orders: SnapshotOrder[] = new Array(ORDER_COUNT);
  for (let index = 0; index < ORDER_COUNT; index += 1) {
    orders[index] = {
      id: `o-${index}`,
      total: 1400,
      isActive: index % 2 === 0,
      date: new Date('2026-01-01T00:00:00.000Z'),
      orderItems: [
        {
          productId: `prod-${index}`,
          quantity: 2,
          price: 700,
          productCosts: [{ inventoryId: `en-${index}`, costPrice: 5, quantity: 2 }],
        },
      ],
    };
  }

  return { levels, movements, entries, orders };
}

describe('deepClone — snapshot-scale correctness', () => {
  it('clones a payload shaped like the purchase-edit snapshot without sharing references', () => {
    const payload = buildSnapshotPayload();
    const clone = deepClone(payload);

    // Cardinality: nothing is dropped or duplicated at scale.
    expect(clone.levels).toHaveLength(STOCK_LEVEL_COUNT);
    expect(clone.movements).toHaveLength(MOVEMENT_COUNT);
    expect(clone.entries).toHaveLength(ENTRY_COUNT);
    expect(clone.orders).toHaveLength(ORDER_COUNT);

    // Value equality across the whole payload (Dates included)...
    expect(clone).toEqual(payload);

    // ...and on a sampled element at every nesting level.
    expect(clone.levels[123]).toEqual(payload.levels[123]);
    expect(clone.levels[123].lots[1].costPrice).toBe(payload.levels[123].lots[1].costPrice);
    expect(clone.movements[MOVEMENT_COUNT - 1]).toEqual(payload.movements[MOVEMENT_COUNT - 1]);
    expect(clone.entries[ENTRY_COUNT - 1]).toEqual(payload.entries[ENTRY_COUNT - 1]);
    expect(clone.orders[ORDER_COUNT - 1].orderItems[0].productCosts[0]).toEqual(
      payload.orders[ORDER_COUNT - 1].orderItems[0].productCosts[0],
    );

    // No shared references, at the collection level and down through nesting.
    expect(clone).not.toBe(payload);
    expect(clone.levels).not.toBe(payload.levels);
    expect(clone.movements).not.toBe(payload.movements);
    expect(clone.entries).not.toBe(payload.entries);
    expect(clone.orders).not.toBe(payload.orders);
    expect(clone.levels[123]).not.toBe(payload.levels[123]);
    expect(clone.levels[123].lots).not.toBe(payload.levels[123].lots);
    expect(clone.levels[123].lots[1]).not.toBe(payload.levels[123].lots[1]);
    expect(clone.levels[123].createdDate).not.toBe(payload.levels[123].createdDate);
    expect(clone.entries[ENTRY_COUNT - 1]).not.toBe(payload.entries[ENTRY_COUNT - 1]);
    expect(clone.orders[ORDER_COUNT - 1]).not.toBe(payload.orders[ORDER_COUNT - 1]);
    expect(clone.orders[ORDER_COUNT - 1].orderItems[0]).not.toBe(
      payload.orders[ORDER_COUNT - 1].orderItems[0],
    );
    expect(clone.orders[ORDER_COUNT - 1].orderItems[0].productCosts[0]).not.toBe(
      payload.orders[ORDER_COUNT - 1].orderItems[0].productCosts[0],
    );

    // Mutating the clone at any depth leaves the original untouched.
    clone.levels[123].lots[1].costPrice = 999;
    clone.movements[7].quantity = 999;
    clone.entries[7].costPrice = 999;
    clone.orders[7].orderItems[0].productCosts[0].costPrice = 999;
    expect(payload.levels[123].lots[1].costPrice).toBe(6);
    expect(payload.movements[7].quantity).toBe(1);
    expect(payload.entries[7].costPrice).toBe(5);
    expect(payload.orders[7].orderItems[0].productCosts[0].costPrice).toBe(5);
  });
});

/**
 * Deterministic complexity guard (R3-BENCH-NOT-A-GATED-GUARD, review-c3e2b4c5d1ae9f8a).
 *
 * Read counts are the deterministic proxy for complexity: every leaf property in
 * the payload below is a counted accessor, so the number of property reads
 * `deepClone` performs is observable without a clock. Wall-clock measurement
 * lives in `deep-clone.bench.ts`, which the default `vitest run` never executes,
 * so it cannot gate a regression; this guard can.
 *
 * A quadratic clone (one that re-visits every element for every element) would
 * read roughly `n²` properties: it fails both the per-element bound and the
 * `4n`-versus-`n` linearity ratio asserted below.
 */
const SMALL_PAYLOAD_ELEMENTS = 50;
const LARGE_PAYLOAD_MULTIPLIER = 4;
/** Generous ceiling on reads per traversed element (the implementation needs 2). */
const READS_PER_ELEMENT_BOUND = 4;
/** Generous ceiling on the `4n`-vs-`n` read ratio to absorb fixed overhead. */
const LINEARITY_MULTIPLIER = 5;

interface CountedLeaf {
  readonly costPrice: number;
  readonly quantity: number;
}

/**
 * Builds `elementCount` leaf objects whose enumerable properties are counted
 * accessors: every read `deepClone` performs via `Object.keys` + index access is
 * tallied, with no instrumentation inside the helper itself.
 */
function buildCountedPayload(elementCount: number): {
  payload: CountedLeaf[];
  reads: () => number;
} {
  let readCount = 0;
  const payload: CountedLeaf[] = new Array(elementCount);
  for (let index = 0; index < elementCount; index += 1) {
    const element = {} as CountedLeaf;
    Object.defineProperty(element, 'costPrice', {
      enumerable: true,
      configurable: true,
      get() {
        readCount += 1;
        return 5;
      },
    });
    Object.defineProperty(element, 'quantity', {
      enumerable: true,
      configurable: true,
      get() {
        readCount += 1;
        return index;
      },
    });
    payload[index] = element;
  }
  return { payload, reads: () => readCount };
}

describe('deepClone — deterministic complexity guard', () => {
  it('reads a bounded number of properties per element and scales linearly', () => {
    const small = buildCountedPayload(SMALL_PAYLOAD_ELEMENTS);
    const smallClone = deepClone(small.payload);
    // Captured before the correctness assertions below, which read the payload
    // again through `toEqual`.
    const smallReads = small.reads();

    // (a) Constant bound per traversed element: no repeated traversal.
    expect(smallReads).toBeLessThanOrEqual(READS_PER_ELEMENT_BOUND * SMALL_PAYLOAD_ELEMENTS);

    // Correctness on the same payload: values equal, references not shared.
    expect(smallClone).toHaveLength(SMALL_PAYLOAD_ELEMENTS);
    expect(smallClone).toEqual(small.payload);
    expect(smallClone).not.toBe(small.payload);
    expect(smallClone[0]).not.toBe(small.payload[0]);
    expect(smallClone[SMALL_PAYLOAD_ELEMENTS - 1].quantity).toBe(SMALL_PAYLOAD_ELEMENTS - 1);

    // (b) Linear scaling: quadrupling the element count must not multiply the
    // read count by more than the generous multiplier. A quadratic traversal
    // would land near 16x here, far above the ceiling.
    const large = buildCountedPayload(SMALL_PAYLOAD_ELEMENTS * LARGE_PAYLOAD_MULTIPLIER);
    const largeClone = deepClone(large.payload);
    const largeReads = large.reads();

    expect(largeClone).toEqual(large.payload);
    expect(largeReads).toBeLessThanOrEqual(LINEARITY_MULTIPLIER * smallReads);
  });
});
