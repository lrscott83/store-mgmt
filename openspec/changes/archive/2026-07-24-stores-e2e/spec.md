# Spec: Stores E2E Tests

## Requirements

### R1: GET /api/v1/stores/by-current-user
- **R1.1**: SuperAdmin gets all seeded stores excluding DataUtils.DefaultStore.Id
- **R1.2**: SuperAdmin sees inactive stores (includeInactive=true hard-coded)
- **R1.3**: SuperAdmin sees stores across tenants (IgnoreQueryFilters)
- **R1.4**: No token → 401

### R2: GET /api/v1/stores/{id}
- **R2.1**: Existing store returns 200 with StoreDto matching seeded values
- **R2.2**: Unknown store → HTTP 400, errors[0].code == "Id"
- **R2.3**: Empty Guid → HTTP 400, errors[0].code == "Id"
- **R2.4**: No token → 401

### R3: POST /api/v1/stores
- **R3.1**: Valid payload → 200, persisted in DB with StoreModule rows
- **R3.2**: Empty Name → 400, code "Name"
- **R3.3**: Empty OwnerId → 400, code "OwnerId"
- **R3.4**: Unknown OwnerId → 400, code "OwnerId"
- **R3.5**: Empty ModuleIds → 400, code "ModuleIds"
- **R3.6**: Unavailable ModuleId → 400, code "ModuleIds"
- **R3.7**: Duplicate store name → currently 200 (KNOWN BUG)
- **R3.8**: No token → 401

### R4: PUT /api/v1/stores/{id}
- **R4.1**: SuperAdmin with valid data → 200, data=true, Name changed
- **R4.2**: SuperAdmin without PaymentStartDate → 400 (KNOWN QUIRK)
- **R4.3**: Route {id} wins over body Id
- **R4.4**: Name colliding with another store → 400, empty errors[]
- **R4.5**: Unknown id → 400, code "Id"
- **R4.6**: Empty id → 400, code "Id"
- **R4.7**: Empty Name → 400, code "Name"
- **R4.8**: Empty ModuleIds → 400, code "ModuleIds"
- **R4.9**: Unavailable ModuleId → 400, code "ModuleIds"
- **R4.10**: No token → 401

### R5: POST /api/v1/stores/approve
- **R5.1**: Approve unapproved store → 200, data=true, Approved=true in DB
- **R5.2**: Approve already-approved → 200, data=false
- **R5.3**: Unknown id → 400, code "Id"
- **R5.4**: Empty id → 400, code "Id"
- **R5.5**: No token → 401
- **R5.6**: OwnerAdmin → 403 (method-level SuperAdmin-only)

### R6: POST /api/v1/stores/disapprove
- **R6.1**: Disapprove approved store → 200, data=true, Approved=false in DB
- **R6.2**: Disapprove already-disapproved → 200, data=false
- **R6.3**: Unknown id → 400, code "Id"
- **R6.4**: Empty id → 400, code "Id"
- **R6.5**: No token → 401

### R7: Authorization matrix
- **R7.1**: OwnerAdmin can reach controller (class-level pass)
- **R7.2**: OwnerAdmin cannot approve → 403
- **R7.3**: OwnerAdmin cannot disapprove → 403
- **R7.4**: OwnerAdmin update drops Description/Approved/IsActive/PaymentStartDate
- **R7.5**: StoreUser → 403
- **R7.6**: ReSeller → 403

## Non-goals
- SetMyStore, list, DELETE, activate (out of scope)
- No Docker, CI, performance
- No new test project or packages
