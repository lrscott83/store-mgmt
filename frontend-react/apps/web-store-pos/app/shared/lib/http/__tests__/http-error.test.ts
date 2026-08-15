import { describe, it, expect } from 'vitest';
import { isNetworkError, httpErrorKey } from '../http-error';

describe('isNetworkError', () => {
  it('true only for errors tagged isNetworkError by the api-client interceptor', () => {
    expect(isNetworkError({ isNetworkError: true })).toBe(true);
    expect(isNetworkError({ isNetworkError: true, response: { status: 500 } })).toBe(true);
  });

  it('false for plain errors, HTTP rejections and non-error values', () => {
    expect(isNetworkError(new Error('Network error'))).toBe(false);
    expect(isNetworkError({ response: { status: 500 } })).toBe(false);
    expect(isNetworkError({ response: { status: 0 } })).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError('oops')).toBe(false);
  });
});

describe('httpErrorKey', () => {
  it('returns GENERAL.OFFLINE for a network error, the fallback key otherwise', () => {
    expect(httpErrorKey({ isNetworkError: true }, 'STORES.ERROR')).toBe('GENERAL.OFFLINE');
    expect(httpErrorKey(new Error('boom'), 'STORES.ERROR')).toBe('STORES.ERROR');
    expect(httpErrorKey({ response: { status: 500 } }, 'STORES.ERROR')).toBe('STORES.ERROR');
    expect(httpErrorKey(undefined, 'STORES.ERROR')).toBe('STORES.ERROR');
  });
});
