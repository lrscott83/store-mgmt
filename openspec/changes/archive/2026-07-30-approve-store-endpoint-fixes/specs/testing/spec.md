# Delta for testing: StoreApproveTests + StoreDisapproveTests

**Domain**: `testing` — `StoreApproveTests.cs`, `StoreDisapproveTests.cs`  
**Change**: `approve-store-endpoint-fixes`  
**Precedent**: No testing spec in prior changes — first occurrence.

---

## MODIFIED Requirements

### SM-TE1 — Fix Misleading Test Name (Approve)

The test `Approve_already_approved_returns_succeeded_data_false` asserts `b.Data.Should().BeTrue()` but its name says `_false`. The name MUST be changed to `Approve_already_approved_returns_succeeded_data_true`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Test name matches assertion | Existing test with `_false` suffix | Test is renamed | Name ends in `_true`, assertion stays `BeTrue()` |

### SM-TE2 — Fix Misleading Test Name (Disapprove)

The test `Disapprove_already_disapproved_returns_succeeded_data_false` asserts `b.Data.Should().BeTrue()` but its name says `_false`. The name MUST be changed to `Disapprove_already_disapproved_returns_succeeded_data_true`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Test name matches assertion | Existing test with `_false` suffix | Test is renamed | Name ends in `_true`, assertion stays `BeTrue()` |

### SM-TE3 — Unknown Store Returns 404 Not Found (Approve)

The test `Approve_unknown_store_returns_400_code_Id` currently expects `HttpStatusCode.BadRequest` and error code `"Id"`. After the validator removes `StoreExists` and the handler returns 404, this test MUST be updated to expect `HttpStatusCode.NotFound`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Unknown store returns 404 | Random non-existent store ID | POST /api/v1/stores/approve | StatusCode is 404 NotFound. Error message indicates store not found (no longer error code "Id"). |

### SM-TE4 — Unknown Store Returns 404 Not Found (Disapprove)

Same change as SM-TE3 for `Disapprove_unknown_store_returns_400_code_Id`.

### SM-TE5 — Empty ID Still Returns 400

The tests `Approve_empty_id_returns_400_code_Id` and `Disapprove_empty_id_returns_400_code_Id` test `Guid.Empty` which fails structural validation (`NotNull().NotEmpty()`). Behavior is UNCHANGED — the validator still rejects `Guid.Empty` with 400 validation error.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Empty ID still 400 | POST with `Id=Guid.Empty` | Validation runs | StatusCode is 400 BadRequest (unchanged) |

---

## Verification Criteria

- [ ] `Approve_already_approved_returns_succeeded_data_false` → renamed to `..._true`
- [ ] `Disapprove_already_disapproved_returns_succeeded_data_false` → renamed to `..._true`
- [ ] `Approve_unknown_store_returns_400_code_Id` expects 404 instead of 400
- [ ] `Disapprove_unknown_store_returns_400_code_Id` expects 404 instead of 400
- [ ] `Approve_empty_id_returns_400_code_Id` still expects 400 (unchanged)
- [ ] `Disapprove_empty_id_returns_400_code_Id` still expects 400 (unchanged)
- [ ] All 14 tests (8 Approve + 6 Disapprove) pass after changes
