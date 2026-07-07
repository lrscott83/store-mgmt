import type { BaseError } from '../models/base';

/**
 * Port of Angular's `Result` (domain/commons/result.ts) — sync category-D envelope.
 * Kept structurally DISTINCT from `BaseResponseModel<T>` (no message/actionCode/data
 * fields) so the two envelope families are never accidentally unified (design ADR-3).
 */
export class Result {
  succeeded: boolean;
  errors: BaseError[] = [];

  constructor(succeeded: boolean, errors: BaseError[]) {
    this.succeeded = succeeded;
    this.errors = errors;
  }

  static Success(): Result {
    return new Result(true, []);
  }

  static Failure(errors: BaseError[]): Result {
    return new Result(false, errors);
  }
}

/**
 * Port of Angular's `DataResult<T>` (domain/commons/result.ts) — sync category-D
 * envelope carrying a payload. Distinct from `BaseResponseModel<T>` (no
 * message/actionCode fields).
 */
export class DataResult<T> {
  data: T | undefined = undefined;
  succeeded: boolean;
  errors: BaseError[] = [];

  constructor(data: T | undefined, succeeded: boolean, errors: BaseError[]) {
    this.data = data;
    this.succeeded = succeeded;
    this.errors = errors;
  }

  // Verbatim port of Angular's (instance, not static) helpers — Angular's own callers
  // never use these, always constructing `new DataResult(...)` directly instead; kept
  // for 1:1 source parity per design ADR-3.
  Success(data: T): DataResult<T> {
    return new DataResult(data, true, []);
  }

  Failure(errors: BaseError[]): DataResult<T> {
    return new DataResult<T>(undefined as unknown as T, false, errors);
  }
}
