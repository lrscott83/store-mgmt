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

  it('returns OWNER.ERROR when the error has no response (untagged network failure)', () => {
    const error = { message: 'Network Error' };
    const id = ownerErrorMessageId(error, { 409: 'OWNER.DUPLICATE_LOGIN' });
    expect(id).toBe('OWNER.ERROR');
  });

  it('returns GENERAL.OFFLINE when the error is tagged isNetworkError (offline/timeout)', () => {
    const error = { isNetworkError: true, message: 'Network Error' };
    const id = ownerErrorMessageId(error, { 409: 'OWNER.DUPLICATE_LOGIN' });
    expect(id).toBe('GENERAL.OFFLINE');
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

// ─── D-1/D-4: envelope actionCode probe (succeeded:false, top-level only) ─────

describe('ownerErrorMessageId — envelope actionCode probe', () => {
  it('maps a succeeded:false envelope actionCode present in the map', () => {
    const envelope = { succeeded: false, actionCode: 404, data: null, errors: [] };
    const id = ownerErrorMessageId(envelope, { 404: 'OWNER.NOT_FOUND', 403: 'OWNER.FORBIDDEN' });
    expect(id).toBe('OWNER.NOT_FOUND');
  });

  it('returns OWNER.ERROR when the envelope actionCode is null', () => {
    const envelope = { succeeded: false, actionCode: null, data: null, errors: [] };
    const id = ownerErrorMessageId(envelope, { 404: 'OWNER.NOT_FOUND', 403: 'OWNER.FORBIDDEN' });
    expect(id).toBe('OWNER.ERROR');
  });

  it('returns OWNER.ERROR for an unmapped envelope actionCode', () => {
    const envelope = { succeeded: false, actionCode: 400, data: null, errors: [] };
    const id = ownerErrorMessageId(envelope, { 404: 'OWNER.NOT_FOUND', 403: 'OWNER.FORBIDDEN' });
    expect(id).toBe('OWNER.ERROR');
  });

  it('returns OWNER.ERROR when succeeded is true, even if actionCode matches a key (the succeeded===false gate)', () => {
    const envelope = { succeeded: true, actionCode: 404, data: null, errors: [] };
    const id = ownerErrorMessageId(envelope, { 404: 'OWNER.NOT_FOUND', 403: 'OWNER.FORBIDDEN' });
    expect(id).toBe('OWNER.ERROR');
  });

  it('D-1 precedence: response.status wins over a top-level actionCode when both are present', () => {
    const hybrid = {
      response: { status: 403 },
      succeeded: false,
      actionCode: 404,
      data: null,
      errors: [],
    };
    const id = ownerErrorMessageId(hybrid, { 404: 'OWNER.NOT_FOUND', 403: 'OWNER.FORBIDDEN' });
    expect(id).toBe('OWNER.FORBIDDEN');
  });
});
