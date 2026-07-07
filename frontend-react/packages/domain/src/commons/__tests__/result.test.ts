import { describe, expect, it } from 'vitest';
import { DataResult, Result } from '../result';
import type { BaseError, BaseResponseModel } from '../../models/base';

const errs: BaseError[] = [{ code: 'X.Y', description: 'oops' }];

describe('Result — sync category-D envelope (distinct from BaseResponseModel)', () => {
  it('Result.Success() -> { succeeded: true, errors: [] }', () => {
    const r = Result.Success();
    expect(r).toEqual({ succeeded: true, errors: [] });
  });

  it('Result.Failure(errors) -> { succeeded: false, errors }', () => {
    const r = Result.Failure(errs);
    expect(r).toEqual({ succeeded: false, errors: errs });
  });

  it('does not satisfy BaseResponseModel shape (no message/actionCode/data fields)', () => {
    const r = Result.Success();
    expect('message' in r).toBe(false);
    expect('actionCode' in r).toBe(false);
    expect('data' in r).toBe(false);
  });
});

describe('DataResult<T> — sync category-D envelope with payload', () => {
  it('constructs with data/succeeded/errors on success', () => {
    const dr = new DataResult({ id: '1' }, true, []);
    expect(dr).toEqual({ data: { id: '1' }, succeeded: true, errors: [] });
  });

  it('constructs with undefined data/succeeded:false/errors on failure', () => {
    const dr = new DataResult(undefined, false, errs);
    expect(dr).toEqual({ data: undefined, succeeded: false, errors: errs });
  });

  it('does not satisfy BaseResponseModel shape (no message/actionCode fields)', () => {
    const dr = new DataResult({ id: '1' }, true, []);
    expect('message' in dr).toBe(false);
    expect('actionCode' in dr).toBe(false);
  });

  it('is structurally distinct from a BaseResponseModel with the same data', () => {
    const dr = new DataResult({ id: '1' }, true, []);
    const brm: BaseResponseModel<{ id: string }> = {
      data: { id: '1' },
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    };
    expect(Object.keys(dr).sort()).not.toEqual(Object.keys(brm).sort());
  });
});
