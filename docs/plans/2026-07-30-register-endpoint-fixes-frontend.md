# Register Endpoint Fixes — Frontend Impact

**Date**: 2026-07-30
**Backend change**: `register-endpoint-fixes`

## Contract Changes

### POST /api/v1/auth/register

| Before | After |
|--------|-------|
| HTTP 200 OK | HTTP 201 Created |
| `ResponseResult<bool>` | `ResponseResult<AuthDto>` |
| Body: `{ succeeded: true, data: true }` | Body: `{ succeeded: true, data: { login, authToken, expiresIn } }` |

### New AuthDto shape
```json
{
  "succeeded": true,
  "data": {
    "login": "string",
    "authToken": "string",
    "expiresIn": "2026-08-29T00:00:00Z"
  }
}
```

### Rate limiting
- 10 requests per 10 minutes per IP
- HTTP 429 Too Many Requests on exceeded limit

## Required Frontend Changes

1. Update response type for register endpoint from `boolean` to `AuthDto`
2. Handle 201 Created status code (was 200 OK)
3. Extract `authToken` from register response (no longer need separate login call after registration)
4. Handle 429 rate-limit errors gracefully (show "Too many attempts, try later")

## No Changes Needed
- Request body format is unchanged
