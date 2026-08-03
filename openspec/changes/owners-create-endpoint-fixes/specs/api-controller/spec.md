# Delta for api-controller

**Domain**: `api-controller` — `OwnersController.CreateOwnerAsync`
**Change**: `owners-create-endpoint-fixes`

## ADDED Requirements

### Requirement: OC-CT1 — Swagger Documents 201, 400, 401, 403, 409, 500

`CreateOwnerAsync` MUST declare `[ProducesResponseType(typeof(ResponseResult<OwnerDto>), StatusCodes.Status201Created)]` plus `[ProducesResponseType]` for 400, 401, 403, 409, and 500.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | 201 documented | Swagger/OpenAPI document generated | `CreateOwnerAsync` endpoint inspected | 201 with `ResponseResult<OwnerDto>` listed |
| 1b–1f | 400/401/403/409/500 documented | Swagger/OpenAPI document generated | `CreateOwnerAsync` endpoint inspected | All five error statuses listed |

### Requirement: OC-CT2 — XML Documentation

`CreateOwnerAsync` MUST carry an XML `<summary>` reading "Create a new owner", a `<param>` doc for each parameter, and a `<returns>` doc describing the created-owner envelope.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Summary | Controller source inspected | `CreateOwnerAsync` declaration | `<summary>` reads "Create a new owner" |
| 2b | Param/returns | Controller source inspected | XML doc of `CreateOwnerAsync` | `<param>` per parameter and `<returns>` present |

### Requirement: OC-CT3 — Location Header on 201 Created

On success, `CreateOwnerAsync` MUST return HTTP 201 with a `Location` header pointing to the created resource (`GET /api/v1/Owners/{id}`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Location present | Valid `POST` succeeds | Response returned | 201; `Location` header resolves to `GET /api/v1/Owners/{id}` |

## Verification Criteria

- [ ] `CreateOwnerAsync` declares 201 (typed `ResponseResult<OwnerDto>`) + 400, 401, 403, 409, 500
- [ ] XML `<summary>` reads "Create a new owner"; `<param>`/`<returns>` docs present
- [ ] 201 response includes `Location` header
