# Delta for admin-owners-resellers

**Change**: `owners-contract-frontend`
**Type**: Frontend specification delta (React `apps/web-store-pos`)

## ADDED Requirements

### Requirement: FE-OC1 — Owner Service Response Types Match The Backend Contract

`ownerHttpService.createOwner` and `ownerHttpService.updateOwner` MUST declare
`Promise<BaseResponseModel<Owner>>`. The backend returns `ResponseResult<OwnerDto>` from both
(`OwnersController` create → 201, update → 200), and the domain `Owner`
(`packages/domain/src/models/store.ts:63-75`) already matches that DTO field for field.

No new model, alias, or mapper is introduced — the existing `Owner` is the type.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Create returns the entity | Backend responds 201 with an `OwnerDto` body | `createOwner(payload)` resolves | `res.succeeded === true` and `res.data` is the `Owner`, with `data.id` non-empty |
| 2 | Update returns the entity | Backend responds 200 with an `OwnerDto` body | `updateOwner(id, payload)` resolves | `res.succeeded === true` and `res.data` is the `Owner` |
| 3 | Types compile | The generics are `BaseResponseModel<Owner>` | `pnpm typecheck` runs | Exit 0 — no call site reads `data` as `string` or `boolean` |

### Requirement: FE-OC2 — Create Surfaces Its Business Failures Distinctly

The create page MUST classify a rejected create by HTTP status and render a distinct message for
each business failure, because `apiClient` rejects every non-2xx and today all of them collapse into
`OWNER.ERROR`.

| Status | Message key |
|---|---|
| 409 (`Owner.DuplicateLogin`) | `OWNER.DUPLICATE_LOGIN` |
| 403 | `OWNER.FORBIDDEN` |
| any other rejection | `OWNER.ERROR` |

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Duplicate login | `createOwner` rejects with `response.status === 409` | The admin submits a valid form | `OWNER.DUPLICATE_LOGIN` text is shown in the `role="alert"` region; no navigation occurs |
| 2 | Forbidden | `createOwner` rejects with `response.status === 403` | The admin submits | `OWNER.FORBIDDEN` is shown; no navigation |
| 3 | Unclassified rejection | `createOwner` rejects with `response.status === 400` | The admin submits | `OWNER.ERROR` is shown |
| 4 | Network failure | `createOwner` rejects with no `response` (`isNetworkError`) | The admin submits | `OWNER.ERROR` is shown — a transport failure is never reported as a business failure |
| 5 | Success unchanged | `createOwner` resolves `succeeded: true` | The admin submits | Navigation to `/management/stores/create`, exactly as today |

### Requirement: FE-OC3 — Update Surfaces Its Business Failures Distinctly

The edit page MUST classify a rejected update by HTTP status.

| Status | Message key |
|---|---|
| 404 (owner no longer exists) | `OWNER.NOT_FOUND` |
| 403 | `OWNER.FORBIDDEN` |
| any other rejection | `OWNER.ERROR` |

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Owner deleted meanwhile | `updateOwner` rejects with `response.status === 404` | The admin saves | `OWNER.NOT_FOUND` is shown; the form stays mounted and dirty |
| 2 | Forbidden | `updateOwner` rejects with `response.status === 403` | The admin saves | `OWNER.FORBIDDEN` is shown |
| 3 | Unclassified rejection | `updateOwner` rejects with `response.status === 400` | The admin saves | `OWNER.ERROR` is shown |
| 4 | Network failure | `updateOwner` rejects with no `response` | The admin saves | `OWNER.ERROR` is shown |

### Requirement: FE-OC4 — The Update Snapshot Comes From The Persisted Entity

After a successful update the edit page MUST rebuild its dirty-check snapshot from `res.data` (the
entity the server persisted) rather than from local form state, so the dirty indicator reflects what
was saved rather than what was typed.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Snapshot from response | `updateOwner` resolves with an `Owner` whose `fullName` differs from the typed value (server normalisation) | The admin saves | The snapshot holds the server's `fullName`, and the form is not dirty against it |
| 2 | Stays on page | `updateOwner` resolves successfully | The admin saves | No navigation — the page remains, per the existing ADR-5 behaviour |

### Requirement: FE-OC5 — New Message Keys Exist In Spanish

`OWNER.DUPLICATE_LOGIN`, `OWNER.FORBIDDEN` and `OWNER.NOT_FOUND` MUST exist in
`app/shared/lib/i18n/es.ts` alongside the other `OWNER.*` keys.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Keys resolve | The three keys are added | A page formats each id | Spanish copy renders, with no react-intl missing-message warning |

## Unchanged By This Change

### Requirement: FE-OC6 — The Interceptor's 401 And 500 Paths Are Untouched

Status classification MUST be confined to 403/404/409 inside the two page components. The
`apiClient` interceptor's behaviour MUST NOT change: a 401 still does NOT log the user out
(offline-first, `api-client.ts:82-84`) and a 500 still raises the blocking dialog exactly once
(`api-client.ts:86-93`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | 500 not double-reported | `createOwner`/`updateOwner` reject with `response.status === 500` | The admin submits | The page shows `OWNER.ERROR` and raises no second dialog of its own |
| 2 | 401 does not end the session | A request rejects with `response.status === 401` | The rejection propagates | The auth store is untouched — no logout, no redirect |
