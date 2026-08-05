# password-hashing Specification

## Purpose

Defines how the backend derives and verifies password hashes: the Argon2id algorithm,
the self-describing PHC storage format, pepper sourcing (plaintext in `appsettings.json`,
matching every other secret already committed in this backend — no user-secrets, no
startup validation), verify behavior on malformed input, and the standalone console tool
for generating a hash outside the running API. This is a new capability — no prior spec
exists for backend password hashing.

> **Superseded requirements** (2026-08-05, decision `sdd/argon2id-password-hashing/decisions`,
> observation #1909): the original pepper-in-user-secrets + fail-fast-startup design was
> reverted. See the "Pepper stored alongside existing backend secrets" and "Explicit,
> distinctly-named cost parameters" requirements below for the current, authoritative shape.

## Requirements

### Requirement: Argon2id hash generation
The system MUST hash passwords with Argon2id, producing a self-describing PHC-format
string (`$argon2id$v=...$m=...,t=...,p=...$salt$hash`). Each call MUST generate a new
random salt so hashing the same password twice yields two different stored strings.

#### Scenario: Two hashes of the same password differ
- GIVEN the same plaintext password
- WHEN it is hashed twice
- THEN both results are valid Argon2id PHC strings
- AND the two strings are not equal

### Requirement: Verify round-trip
`VerifyPassword` MUST return `true` when checked against the hash `HashPassword` produced
for the same plaintext, and `false` for any other plaintext.

#### Scenario: Correct password verifies
- GIVEN a password hashed with `HashPassword`
- WHEN `VerifyPassword` is called with the same plaintext and the stored hash
- THEN it returns `true`

#### Scenario: Wrong password fails
- GIVEN a password hashed with `HashPassword`
- WHEN `VerifyPassword` is called with a different plaintext and the stored hash
- THEN it returns `false`

### Requirement: Malformed stored hash never throws
`VerifyPassword` MUST return `false`, never throw, when the stored value is not a valid
Argon2id PHC string (empty, truncated, or a foreign format).

#### Scenario: Non-PHC stored value
- GIVEN a stored value that is not a valid Argon2id PHC string
- WHEN `VerifyPassword` is called with any plaintext against it
- THEN it returns `false`
- AND no exception is thrown

### Requirement: Pepper participates in the hash
The pepper MUST be supplied as Argon2's secret parameter. A hash produced under one
pepper MUST NOT verify successfully under a different pepper.

#### Scenario: Hash does not verify under a different pepper
- GIVEN a password hashed while the service is configured with pepper A
- WHEN the same stored hash is verified by a service instance configured with pepper B
- THEN `VerifyPassword` returns `false`

### Requirement: Pepper stored alongside existing backend secrets
The pepper MUST live in `appsettings.json` in plaintext, exactly where it is today
(`Authentication:Pepper`), consistent with every other secret already committed there
(`ConnectionStrings`, `Jwt:SecretKey`, `Authentication:JwtSecretKey`,
`StoreEncryption:MasterSecret`). The system MUST NOT require user-secrets, and MUST NOT
fail startup when the pepper is empty or missing. This requirement supersedes the
original "Startup fails fast on missing pepper" requirement.

#### Scenario: Empty pepper does not block startup
- GIVEN `Authentication:Pepper` resolves to an empty or missing value
- WHEN the application starts
- THEN startup succeeds
- AND the empty value is passed through as Argon2's `Secret`, same as any other
  configured value

### Requirement: Explicit, distinctly-named cost parameters
Hashing cost parameters (memory, time cost, parallelism, salt length, output length)
MUST be distinct, explicitly named configuration fields — no single field carries more
than one meaning (this supersedes the overloaded `Iterations` field). This capability
does NOT include a dedicated validation type (no `IValidateOptions`) or startup
validation of these fields; a malformed value surfaces through the Argon2 library's own
behavior at hash time.

#### Scenario: Distinct fields exist
- GIVEN the bound `AuthenticationSettings`
- WHEN memory, time cost, parallelism, salt length, and output length are read
- THEN each comes from its own configuration field
- AND none is derived by overloading another field's meaning

### Requirement: No legacy verification paths
The system MUST recognize only Argon2id PHC-format stored hashes. It MUST NOT retain a
bcrypt verification branch, a legacy SHA256+pepper branch, a raw-SHA256 branch, or an
upgrade-on-login path that rewrites a legacy hash.

#### Scenario: Only Argon2id format is understood
- GIVEN the running hashing service
- WHEN any stored hash is checked
- THEN the outcome depends only on whether it is a valid Argon2id PHC string matching the
  plaintext under the configured pepper and parameters
- AND no bcrypt, SHA256, or hash-upgrade code path executes

### Requirement: E2E seed and application pepper/parameter parity
The E2E test seed helper MUST produce Argon2id hashes using the same pepper and cost
parameters the application under test resolves, so a seeded user can authenticate through
the real login endpoint.

#### Scenario: Seeded user logs in through the real endpoint
- GIVEN a user seeded by the E2E test helper with a real Argon2id hash
- WHEN that user logs in through `POST /api/v1/auth/login` with the plaintext password
- THEN the request succeeds and returns 200

### Requirement: Console tool produces an application-compatible hash
The standalone console tool MUST hash a password using the same hashing service and the
same bound settings as the running API, so the printed hash is accepted by the
application for that password.

#### Scenario: Tool-generated hash is accepted by the API
- GIVEN a hash printed by the console tool for a given password
- WHEN that hash is stored for a user and the user logs in with the same password
- THEN the login succeeds

## Non-Goals

- Progressive re-hashing/migration of previously stored hashes (no production data exists).
- Any change to `backend/src/WebApi` or `backend/src/WebApiTest` (outside `SMCA.sln`).
- Regenerating the seeded `admin` account's hash at
  `UserEntityTypeConfiguration.cs:40-44` or any accompanying EF migration. Out of scope
  by explicit decision (#1909); the user runs the console tool and performs the database
  `UPDATE` himself. Consequence: the seeded `admin` account cannot log in until that step
  is done.
- Moving `appsettings.json`, `appsettings.Development.json`, or `appsettings.Tests.json`
  out of git, or making any of them self-sufficient. Only `appsettings.Production.json`
  (new, gitignored) carries production-only configuration.
