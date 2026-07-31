# Response Envelope Specification

## Purpose

Define `BaseResponseModel<T>` — the wire contract every HTTP service response is typed against — as a discriminated union on `succeeded`, matching backend truth (`backend/src/Application/ResponseModels/ResponseResult.cs`, `backend/src/Domain/Common/Results/Result.cs`): `data` is `T` only when `succeeded` is `true` and `null` when `false`; `message`/`actionCode` are nullable on both branches; `errors` is never null.

## Requirements

### Requirement: Discriminated Union Shape

The system MUST declare `BaseResponseModel<T>` as a discriminated union on `succeeded`: a `true` branch with `data: T`, and a `false` branch with `data: null`. Both branches MUST declare `message: string | null`, `actionCode: number | null`, and `errors: BaseError[]` (never nullable — `Result.cs:13` always constructs `[]` or a populated list).

#### Scenario: succeeded:true narrows data to T
- GIVEN a value typed `BaseResponseModel<T>`
- WHEN a caller checks `if (result.succeeded)`
- THEN `result.data` narrows to `T` with no cast or non-null assertion required

#### Scenario: succeeded:false narrows data to null
- GIVEN a value typed `BaseResponseModel<T>`
- WHEN a caller checks the `!result.succeeded` (or else) branch
- THEN `result.data` narrows to `null`

#### Scenario: errors is never null on either branch
- GIVEN a `BaseResponseModel<T>` value on either branch
- WHEN `errors` is inspected
- THEN it is always `BaseError[]` (empty or populated), never `null`/`undefined`

### Requirement: message/actionCode Nullable on Both Branches

`message: string | null` and `actionCode: number | null` MUST hold on BOTH branches — `ResponseResult.Success<TData>(data)` (`ResponseResult.cs:11`) constructs without message/actionCode args, defaulting both to `null` on plain success, not only on failure.

#### Scenario: Success response with null message/actionCode type-checks
- GIVEN backend truth: `Success<TData>` defaults `message`/`actionCode` to `null`
- WHEN `{ succeeded: true, data, message: null, actionCode: null, errors: [] }` is assigned to `BaseResponseModel<T>`
- THEN it type-checks without a cast

### Requirement: Union Must Not Collapse to boolean

Any construction site MUST tag `succeeded` with a literal type (`true as const`/`false as const`) or route through `envelope.ts`'s `success()`/`failure()` factories. A literal whose `succeeded` widens to `boolean` MUST NOT satisfy `BaseResponseModel<T>`.

#### Scenario: Literal-typed factories preserve the union
- GIVEN `success()`/`failure()` return literals with `succeeded` typed as a const `true`/`false`
- WHEN their return values are assigned to a `BaseResponseModel<T>` variable
- THEN the branch is preserved and `data` narrows correctly under a `succeeded` check

#### Scenario: Widened-boolean discriminant fails to satisfy the union
- GIVEN a helper returns `{ succeeded: someBooleanVariable, data, message, actionCode, errors }` where `someBooleanVariable: boolean`
- WHEN that value is assigned to a `BaseResponseModel<T>`-typed variable
- THEN it does NOT type-check

### Requirement: No Unsafe Cast in failure()

`envelope.ts`'s `failure<T>()` MUST NOT contain `data: null as unknown as T` or any equivalent unsafe cast. The failure branch declares `data: null`, so returning `null` MUST type-check without a cast.

#### Scenario: failure() returns null without casting
- GIVEN `envelope.ts`'s `failure<T>(errors)`
- WHEN its implementation is inspected
- THEN it returns `data: null` with no `as unknown as T` (or equivalent cast) anywhere in the file

### Requirement: Supersedes Stale Non-Nullable Claim in frontend-react/openspec Admin Spec

This repo has TWO independent git-tracked `openspec/` trees: the repo-root `openspec/` (this change's tree) and `frontend-react/openspec/` (an older, separate tree from prior UI-parity changes). This requirement does NOT move, merge, or restructure either tree — it exists so `sdd-archive` knows exactly what to correct and where.

`frontend-react/openspec/specs/admin/spec.md` at lines **312, 596, and 1114** each assert, verbatim: "`BaseResponseModel<T>` fields `message`, `actionCode`, and `errors` are NON-nullable; test mocks MUST use `''`, `0`, and `[]` respectively — never `null`." This change SUPERSEDES the `message`/`actionCode` portion of that claim at all three lines — both fields become `string | null`/`number | null` per the Discriminated Union Shape requirement above. The `errors` portion of that claim is UNCHANGED and remains correct: `errors: BaseError[]` stays non-null everywhere.

#### Scenario: Archive corrects the three stale lines
- GIVEN `frontend-react/openspec/specs/admin/spec.md:312`, `:596`, `:1114` each currently read "fields `message`, `actionCode`, and `errors` are NON-nullable"
- WHEN `sdd-archive` reconciles specs for this change
- THEN each of the three lines is corrected to state `message`/`actionCode` are nullable (`string | null`/`number | null`) while `errors` remains non-null
- AND test mocks in that tree MAY use `null` for `message`/`actionCode` (no longer forbidden); `errors` mocks still MUST use `[]` (or a populated array), never `null`

## Resolved Question (sdd-design decision, recorded here for traceability)

`success()`/`failure()` in `envelope.ts` KEEP emitting their current hardcoded `message: ''` / `actionCode: 200|400` — they are local offline-envelope constructors, not wire echoes, and `''`/`200`/`400` already satisfy `string | null`/`number | null`. No requirement in this spec forces either factory to emit `null` for `message`/`actionCode`. Only the `data: null as unknown as T` cast (Requirement above) is removed.
