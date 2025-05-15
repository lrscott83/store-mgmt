import { BaseError } from "src/app/_services/_models/base.model";

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

export class DataResult<T> {
    data: T = undefined;
    succeeded: boolean;
    errors: BaseError[] = [];

    constructor(data: T, succeeded: boolean, errors: BaseError[]) {
        this.data = data;
        this.succeeded = succeeded;
        this.errors = errors;
    }

    Success(data: T): DataResult<T> {
        return new DataResult(data, true, []);
    }

    Failure(errors: BaseError[]): DataResult<T> {
        return new DataResult(undefined, false, errors);
    }
}