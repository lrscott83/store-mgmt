# Owners GetAll Endpoint Fixes — Frontend Impact

**Date**: 2026-08-02
**Backend change**: `owners-getall-endpoint-fixes`

## Summary

**No breaking changes.** Seven defensive fixes applied to `GET /api/v1/Owners/all/{includeInactive}`. Frontend does NOT need to update anything.

## Contract (Unchanged)

### GET /api/v1/Owners/all/{includeInactive}

| Aspect | Value |
|--------|-------|
| Route | `/api/v1/Owners/all/{includeInactive}` (route parameter — **kept as-is**) |
| Method | GET |
| Authorization | `OwnersAdmin` (SuperAdmin + ReSeller) |
| Response (200) | `ResponseResult<List<OwnerDto>>` |
| Response (400) | Bad Request (new: documented, was implicit) |
| Response (401) | Unauthorized (new: documented, was implicit) |
| Response (403) | Forbidden — **changed from 400 "UserNotFound" to proper 403** |
| Response (500) | Internal Server Error (new: documented, was implicit) |

### OwnerDto shape (unchanged)

```json
{
  "succeeded": true,
  "data": [
    {
      "id": "guid",
      "fullName": "string",
      "cellphone": "string",
      "isActive": true,
      "reSellerId": "guid",
      "reSellerName": "string",
      "approved": true
    }
  ]
}
```

### Key behavioral change

- **403 Forbidden** (was 400 "UserNotFound"): If the frontend was checking for a specific error message on 400 from this endpoint, update to expect 403. The `[HasPermission]` filter already returns 403 at the controller level, so most clients already handle this. The handler-level gate now also returns 403 instead of the misleading 400 "UserNotFound".

## What the Backend Fixed (transparent to frontend)

| # | Fix | Frontend Impact |
|---|-----|----------------|
| 1 | Auth gate: 400 "UserNotFound" → 403 | 403 is already handled by `[HasPermission]` filter — no change |
| 2 | `.Take(1000)` safety cap on DB query | Transparent — response still returns all owners (up to 1000) |
| 3 | `[ProducesResponseType]` 400/401/403/500 | Swagger docs only — no code change needed |
| 4 | XML doc: "Get all users" → "Get all owners" | Swagger docs only — no code change needed |
| 5 | Guid.Empty guard → 400 | Edge case: malformed JWT identity now returns 400 instead of empty result |
| 6 | CancellationToken propagation | Transparent — request cancellation works properly now |
| 7 | Null guard on repository result | Transparent — prevents server error if DB returns null |

## Deferred Contract Debt (not changed)

| Debt | Reason |
|------|--------|
| `all/{includeInactive}` as route param instead of query string | Kept for consistency with Users and Stores endpoints (same pattern across the project) |
| No pagination (`Page`/`PageSize`) | Kept to avoid contract break; `.Take(1000)` safety cap added as internal safeguard |

## Action Required

**None.** No frontend changes needed. If the frontend currently handles 400 "UserNotFound" from this endpoint specifically, it should also handle 403 (which it likely already does via the `[HasPermission]` interceptor).
