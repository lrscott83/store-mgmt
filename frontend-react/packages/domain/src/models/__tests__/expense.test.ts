import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPENSE_FUND_SOURCE,
  ExpenseFundSource,
} from '../../enums';
import { expenseFundSourceOf } from '../expense';

describe('ExpenseFundSource', () => {
  it('freezes the wire values: Caja = 0, Externo = 1', () => {
    expect(ExpenseFundSource.Caja).toBe(0);
    expect(ExpenseFundSource.Externo).toBe(1);
  });

  it('defaults to Externo so a missing field never discounts the cash drawer', () => {
    expect(DEFAULT_EXPENSE_FUND_SOURCE).toBe(ExpenseFundSource.Externo);
  });
});

describe('expenseFundSourceOf', () => {
  it('returns the explicit source when present', () => {
    expect(expenseFundSourceOf({ fundSource: ExpenseFundSource.Caja })).toBe(
      ExpenseFundSource.Caja,
    );
    expect(expenseFundSourceOf({ fundSource: ExpenseFundSource.Externo })).toBe(
      ExpenseFundSource.Externo,
    );
  });

  it('resolves a historical expense with no field to Externo', () => {
    expect(expenseFundSourceOf({})).toBe(ExpenseFundSource.Externo);
  });

  it('does not confuse Externo (1) with an absent field', () => {
    const legacy = expenseFundSourceOf({});
    const explicitExternal = expenseFundSourceOf({ fundSource: ExpenseFundSource.Externo });
    const fromRegister = expenseFundSourceOf({ fundSource: ExpenseFundSource.Caja });
    expect(legacy).toBe(explicitExternal);
    expect(fromRegister).not.toBe(legacy);
  });
});
