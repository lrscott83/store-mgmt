import { describe, it, expect } from 'vitest';
import { ownerErrorMessageId } from '../owner-error-message';

// ─── D2: one local helper, an explicit map per call site ──────────────────────

describe('ownerErrorMessageId', () => {
  it('returns the mapped key for a status present in the map', () => {
    const error = { response: { status: 409 } };
    const id = ownerErrorMessageId(error, { 409: 'OWNER.DUPLICATE_LOGIN' });
    expect(id).toBe('OWNER.DUPLICATE_LOGIN');
  });

  it('returns OWNER.ERROR for a status not present in the map', () => {
    const error = { response: { status: 400 } };
    const id = ownerErrorMessageId(error, { 409: 'OWNER.DUPLICATE_LOGIN' });
    expect(id).toBe('OWNER.ERROR');
  });

  it('returns OWNER.ERROR when the error has no response (network failure)', () => {
    const error = { message: 'Network Error' };
    const id = ownerErrorMessageId(error, { 409: 'OWNER.DUPLICATE_LOGIN' });
    expect(id).toBe('OWNER.ERROR');
  });

  it('returns OWNER.ERROR when error is undefined', () => {
    const id = ownerErrorMessageId(undefined, { 409: 'OWNER.DUPLICATE_LOGIN' });
    expect(id).toBe('OWNER.ERROR');
  });

  it('returns OWNER.ERROR when error is null', () => {
    const id = ownerErrorMessageId(null, { 409: 'OWNER.DUPLICATE_LOGIN' });
    expect(id).toBe('OWNER.ERROR');
  });
});
