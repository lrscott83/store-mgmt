import { describe, it, expect, beforeEach } from 'vitest';
import { Currency } from '@store-mgmt/domain';
import {
  readCartCurrencyPreference,
  writeCartCurrencyPreference,
} from '../cart-currency-preference';

const USER_A = 'user-a';
const USER_B = 'user-b';
const KEY_A = `lizoft.cart-currency-${USER_A}`;
const KEY_B = `lizoft.cart-currency-${USER_B}`;

describe('cart currency preference — per-user persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to CUP when nothing is persisted for the user', () => {
    expect(readCartCurrencyPreference(USER_A)).toBe(Currency.CUP);
  });

  it('persists and re-reads the chosen currency under the raw per-user key', () => {
    writeCartCurrencyPreference(USER_A, Currency.USD);

    expect(localStorage.getItem(KEY_A)).toBe('1');
    expect(readCartCurrencyPreference(USER_A)).toBe(Currency.USD);
  });

  it('falls back to CUP for an invalid stored value', () => {
    localStorage.setItem(KEY_A, 'not-a-currency');
    expect(readCartCurrencyPreference(USER_A)).toBe(Currency.CUP);

    localStorage.setItem(KEY_A, '999');
    expect(readCartCurrencyPreference(USER_A)).toBe(Currency.CUP);
  });

  it('keeps two users isolated under separate keys', () => {
    writeCartCurrencyPreference(USER_A, Currency.USD);
    writeCartCurrencyPreference(USER_B, Currency.EUR);

    expect(readCartCurrencyPreference(USER_A)).toBe(Currency.USD);
    expect(readCartCurrencyPreference(USER_B)).toBe(Currency.EUR);
    expect(localStorage.getItem(KEY_A)).toBe('1');
    expect(localStorage.getItem(KEY_B)).toBe('2');
  });

  it('survives a new session (re-read is state-free)', () => {
    writeCartCurrencyPreference(USER_A, Currency.MXN);
    // A fresh read — no in-memory cache — stands in for the next app session.
    expect(readCartCurrencyPreference(USER_A)).toBe(Currency.MXN);
    expect(readCartCurrencyPreference(USER_A)).toBe(Currency.MXN);
  });

  it('defaults to CUP and never writes for a missing user', () => {
    expect(readCartCurrencyPreference(null)).toBe(Currency.CUP);
    expect(readCartCurrencyPreference(undefined)).toBe(Currency.CUP);
    expect(readCartCurrencyPreference('')).toBe(Currency.CUP);

    writeCartCurrencyPreference(null, Currency.USD);
    writeCartCurrencyPreference(undefined, Currency.USD);
    expect(localStorage.length).toBe(0);
  });
});
