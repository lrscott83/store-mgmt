import { describe, it, expect } from 'vitest';
import { apiErrorMessageId } from '../api-error-message';

// ADR-1/ADR-2/ADR-3/ADR-4 (design.md): byCode discriminates on `code.toLowerCase()`,
// scans the WHOLE `errors` array (never just errors[0]), precedence is
// byCode -> byStatus -> fallback, and fallback is mandatory — never blank, never
// another field's copy.

describe('apiErrorMessageId', () => {
  it('1. maps a rejection whose errors[] contains a byCode-known code', () => {
    const error = { response: { status: 400, data: { errors: [{ code: 'Cellphone' }] } } };
    const id = apiErrorMessageId(error, { byCode: { cellphone: 'OWNER.PHONE_REQUIRED' }, fallback: 'OWNER.ERROR' });
    expect(id).toBe('OWNER.PHONE_REQUIRED');
  });

  it('2. is case-insensitive: CellPhone (update casing) maps to the same key as Cellphone', () => {
    const error = { response: { status: 400, data: { errors: [{ code: 'CellPhone' }] } } };
    const id = apiErrorMessageId(error, { byCode: { cellphone: 'OWNER.PHONE_REQUIRED' }, fallback: 'OWNER.ERROR' });
    expect(id).toBe('OWNER.PHONE_REQUIRED');
  });

  it('3. scans the whole array: finds the phone code even when FullName occupies errors[0]', () => {
    const error = {
      response: { status: 400, data: { errors: [{ code: 'FullName' }, { code: 'CellPhone' }] } },
    };
    const id = apiErrorMessageId(error, { byCode: { cellphone: 'OWNER.PHONE_REQUIRED' }, fallback: 'OWNER.ERROR' });
    expect(id).toBe('OWNER.PHONE_REQUIRED');
  });

  it('4. a 400 with no body falls to fallback', () => {
    const error = { response: { status: 400 } };
    const id = apiErrorMessageId(error, { byCode: { cellphone: 'OWNER.PHONE_REQUIRED' }, fallback: 'OWNER.ERROR' });
    expect(id).toBe('OWNER.ERROR');
  });

  it('5. a 400 whose errors[] has no known code falls to fallback, never the phone copy', () => {
    const error = { response: { status: 400, data: { errors: [{ code: 'FullName' }] } } };
    const id = apiErrorMessageId(error, { byCode: { cellphone: 'OWNER.PHONE_REQUIRED' }, fallback: 'OWNER.ERROR' });
    expect(id).toBe('OWNER.ERROR');
  });

  it('6. a status present in byStatus maps to its key', () => {
    const error = { response: { status: 409 } };
    const id = apiErrorMessageId(error, { byStatus: { 409: 'OWNER.DUPLICATE_LOGIN' }, fallback: 'OWNER.ERROR' });
    expect(id).toBe('OWNER.DUPLICATE_LOGIN');
  });

  it('7. byCode wins over byStatus when both could answer', () => {
    const error = { response: { status: 400, data: { errors: [{ code: 'Cellphone' }] } } };
    const id = apiErrorMessageId(error, {
      byCode: { cellphone: 'OWNER.PHONE_REQUIRED' },
      byStatus: { 400: 'OWNER.SOME_400' },
      fallback: 'OWNER.ERROR',
    });
    expect(id).toBe('OWNER.PHONE_REQUIRED');
  });

  it('8. maps a resolved envelope (succeeded: false) via its top-level errors[]', () => {
    const envelope = { succeeded: false, errors: [{ code: 'CellPhone' }] };
    const id = apiErrorMessageId(envelope, { byCode: { cellphone: 'OWNER.PHONE_REQUIRED' }, fallback: 'OWNER.ERROR' });
    expect(id).toBe('OWNER.PHONE_REQUIRED');
  });

  it('9. network failures / undefined / null all fall to fallback', () => {
    expect(apiErrorMessageId({ isNetworkError: true }, { fallback: 'OWNER.ERROR' })).toBe('OWNER.ERROR');
    expect(apiErrorMessageId(undefined, { fallback: 'OWNER.ERROR' })).toBe('OWNER.ERROR');
    expect(apiErrorMessageId(null, { fallback: 'OWNER.ERROR' })).toBe('OWNER.ERROR');
  });

  it('10. a malformed errors shape (not an array, or code not a string) never throws and falls to fallback', () => {
    const notArray = { response: { status: 400, data: { errors: 'oops' } } };
    expect(apiErrorMessageId(notArray, { byCode: { cellphone: 'OWNER.PHONE_REQUIRED' }, fallback: 'OWNER.ERROR' })).toBe(
      'OWNER.ERROR'
    );

    const codeNotString = { response: { status: 400, data: { errors: [{ code: 123 }] } } };
    expect(
      apiErrorMessageId(codeNotString, { byCode: { cellphone: 'OWNER.PHONE_REQUIRED' }, fallback: 'OWNER.ERROR' })
    ).toBe('OWNER.ERROR');
  });
});
