# Delta for entity-migration

## MODIFIED Requirements

### Requirement: Migration runs only when a DEK is present in memory and never blocks login
(Previously: "Migration runs only when provisioned and never blocks login" —
guarded on `isEncryptionProvisioned()`, which is roster-only and stays false
forever on a device whose DEK was locally minted; that device's pre-existing
plaintext data would never migrate under the old guard.)

`runEntityMigration()` MUST derive its guard from the SAME source as its
store scope (below): the in-memory DEK's own store id. It MUST return
immediately, touching none of the six entity keys, when that store id is
absent (no DEK set this session). It MUST be invoked after a successful DEK
acquisition on any of the three points defined in
`dek-lifecycle-and-unlock-gate` (both login paths and the startup device-key
recovery), wrapped so any failure inside it is swallowed and never
propagates to the caller — the worst outcome is "still plaintext," never
"cannot log in."

#### Scenario: No DEK in memory — no-op
- GIVEN no DEK is set in memory, regardless of roster state
- WHEN `runEntityMigration()` is called
- THEN none of the six entity keys is read or written

#### Scenario: A failure inside migration does not fail login
- GIVEN a device where migration will throw partway through
- WHEN login completes and triggers migration
- THEN the login call still resolves successfully

### Requirement: Migration is scoped to the in-memory DEK's own store, not the active store
(Previously: "Migration is scoped to the roster's store, not the active
store" — scoped via `getRawRoster().storeId`, which is absent on a device
with no roster: exactly the devices this change newly migrates.)

The pass MUST use the in-memory DEK's own store id (`getDekStoreId()`, set
whenever the DEK was acquired, whichever of the three sources produced it —
this is the SAME value the guard above tests for absence) to scope which
entity keys it touches — NOT the current user's `selectedStoreId`, and NOT a
roster-only lookup (`getRawRoster().storeId`) that would be absent on a
locally-minted-DEK device.

#### Scenario: Active store differs from the DEK's store — foreign store untouched
- GIVEN the in-memory DEK belongs to store A
- AND the current user's `selectedStoreId` is store B
- WHEN migration runs
- THEN only store A's entity keys are read or written; store B's are untouched
