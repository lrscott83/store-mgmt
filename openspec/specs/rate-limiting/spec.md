# Rate Limiting Specification

**Capability**: Register endpoint rate limiting  
**Origin**: SDD change `2026-07-30-register-endpoint-fixes`  
**Status**: Active  
**Last Updated**: 2026-07-30

---

## Purpose

Define the rate limiting policy for the `POST /api/v1/auth/register` endpoint to prevent abuse while allowing legitimate registration flows.

---

## Specification

### R1: RegisterPolicy — 10 req / 10 min per IP

**Requirement**: `Program.cs` MUST configure a `RegisterPolicy` rate limiter: 10 requests, 10-minute sliding window, per IP.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Within limit | 10 requests from same IP within 10 min | Each arrives | All 2xx |
| 3b | Exceeds limit | 10 requests already from same IP | 11th request arrives | `429 TooManyRequests` |

## Verification Criteria

- [ ] Rate limiter returns `429` after 10 requests from same IP in 10 minutes
- [ ] Rate limiter allows up to 10 requests per 10-minute sliding window

## Related Specifications

- **auth-http** — Register HTTP contract (response envelope, status codes)
- **store-service** — Store creation flow (downstream of register)
