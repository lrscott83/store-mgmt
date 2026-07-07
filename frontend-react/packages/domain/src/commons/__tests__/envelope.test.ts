import { describe, expect, it } from 'vitest';
import { success, failure } from '../envelope';

// Port of Angular's BaseService.Success/Failure (frontend/src/app/_services/base.service.ts:
// 219-238) — sync BaseResponseModel<T> factories shared by category B (sync) and category C
// (Promise.resolve-wrapped) conversions.
describe('success/failure — BaseResponseModel<T> factories', () => {
  it('success(data) -> succeeded:true, actionCode 200, empty errors', () => {
    expect(success({ id: '1' })).toEqual({
      data: { id: '1' },
      succeeded: true,
      message: '',
      actionCode: 200,
      errors: [],
    });
  });

  it('failure(errors) -> succeeded:false, actionCode 400, data:null', () => {
    const errs = [{ code: 'X', description: 'oops' }];
    expect(failure(errs)).toEqual({
      data: null,
      succeeded: false,
      message: '',
      actionCode: 400,
      errors: errs,
    });
  });
});
