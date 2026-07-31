import type { BaseError, BaseResponseModel } from '../models/base';

/**
 * Port of Angular's `BaseService.Success`/`Failure`
 * (frontend/src/app/_services/base.service.ts:219-238) — sync `BaseResponseModel<T>`
 * factories. Shared by category-B (sync) and category-C (`Promise.resolve`-wrapped)
 * conversions (design ADR-2).
 */
export function success<T>(data: T): BaseResponseModel<T> {
  return {
    data,
    succeeded: true,
    message: '',
    actionCode: 200,
    errors: [],
  };
}

export function failure<T>(errors: BaseError[]): BaseResponseModel<T> {
  return {
    data: null,
    succeeded: false,
    message: '',
    actionCode: 400,
    errors,
  };
}
