import { describe, it, expect } from 'vitest';
import { deepClone } from '../deep-clone';

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

  it('throws TypeError when a function appears as a value', () => {
    expect(() => deepClone({ run: () => 1 })).toThrow(TypeError);
    expect(() => deepClone([() => 1])).toThrow(TypeError);
  });

  it('throws TypeError when a symbol appears as a value', () => {
    expect(() => deepClone({ token: Symbol('token') })).toThrow(TypeError);
  });

  it('returns undefined for undefined input', () => {
    expect(deepClone<undefined>(undefined)).toBeUndefined();
  });
});
