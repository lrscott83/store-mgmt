# prod-to-test-identity-migration

- Status: in_progress
- Date: 2026-09-27
- Route: delegated direct (one writer)
- TDD: not applicable in the usual sense. These are operational SQL scripts and a procedure
  that the maintainer runs BY HAND on the VPS. There is no application code to unit-test. The
  equivalent of verification is: every script is syntax-checked, every FK order is proved
  against the real model, and the verify script's expected results are stated up front.

## Objective

Move the identity and permission graph from the production database to the test database so
that a migrated user can **authenticate in test and see exactly the permissions they had in
production**.

This is a migration, not a transformation. The data lands byte-identical. Nothing is
re-hashed, re-encoded, anonymized, substituted or "updated". The maintainer stated this
explicitly: "todos los mismos datos, nada distinto ni actualizado".

## What moves, and what does not

### Migrate — the identity and permission graph (the whole point)

| Table | Why it is required |
| --- | --- |
| `User` | The account. Carries the Argon2id `Password` hash. |
| `Owner` | 1:1 with `User`. |
| `ReSeller` | 1:1 with `User`. The Gestor row. |
| `Store` | The store, with its `StorePlanId`. |
| `StoreUser` | Employee membership. |
| `UserRole` | Which role the user holds. |
| `ReSellerOwner` | The Gestor→Owner link. **Without this a migrated Gestor sees an empty owner list.** |
| `StoreModule` | Which modules the store bought, WITH the price snapshot it was charged. |
| `StoreRoleFeature` | Which features each role has inside the store. **This is where the actual permissions live.** |

The last three are not optional. `StoreModule` and `StoreRoleFeature` are what
`IStoreRoleFeatureGenerator` produced per store at creation time. They are not derivable from
the catalog on restore — a rebuilt DB would grant a different set, because
`StoreRoleFeatureGenerator` silently drops any feature id with no `StoreRoleFeatures` enum
entry. Copying the produced rows is the only way to get the real grants back. Omitting them
yields a user who logs in successfully and sees nothing, which is precisely the failure this
migration exists to avoid.

### Optional — business data the maintainer may want, behind an explicit flag

Deliberately excluded by default because it is large and not required for login:

| Table | Note |
| --- | --- |
| `ProductCategory` | Categories. Requires `Product`. |
| `Product` | The store's catalogue. |
| `ChannelExchangeRate` | Per-store exchange rates. Needed if the multi-currency work is exercised. |

Each is a separate, individually switchable block in the load script so the maintainer can
include or skip them without editing SQL by hand.

### Explicitly NOT migrated

| Table | Why |
| --- | --- |
| `Order`, `OrderItem`, `OrderPayment` | Sales. The maintainer states sales are offline and no longer in use. |
| `StorePayment` | Distributor billing. Same family. |
| `InventoryEntry`, `InventoryEntryCost` | Stock movements. |
| `RefreshTokens` | **Never.** `RefreshTokens.Token` stores the RAW refresh token in plaintext with a 35-day expiry. Copying it hands over live production sessions. It is session state with zero migration value. |
| `OutboxMessage` | Unscoped queue; stale rows would fire. |
| `StoreUsage` | Usage/quota metering. Carries plaintext client IP addresses. Include only if a migrated store must not be blocked by a prod-level usage limit — and note it copies real IPs. |
| `Module`, `Feature`, `Role`, `StorePlan`, `StorePlanModule`, `StorePaymentStatus`, `SystemConfiguration` | Catalog. Not copied: `Database.MigrateAsync()` rebuilds it identically on the test DB. Copying it from prod would make the two databases drift and would make "what is catalog vs what is data" unknowable. |
| `Tenant` | Seeded row. Test already has Default Tenant. |
| The seeded superadmin `User` + its `UserRole` | **Must survive untouched.** The load script must not delete, truncate, or overwrite it. The maintainer said the migrated rows are NEW rows added on top of what test already has. |

## The one non-negotiable consequence

`User.Password` is an Argon2id hash **peppered** with `Authentication:Pepper`, and
`User.OfflinePasswordPreHash` is AES-256-GCM keyed from `StoreEncryption:MasterSecret` with
the `userId` as AAD.

Because this is a same-data migration, the passwords must keep working. That requires:

1. **`Authentication:Pepper` identical on prod and test.** If it differs, every migrated user
   is rejected with `Auth.InvalidCredentials` while the data itself is perfect.
2. **`StoreEncryption:MasterSecret` identical on prod and test.** If it differs, login still
   returns 200 but the wrapped DEK comes back empty, so the POS silently falls back to the
   unlock gate.
3. **`User.Id` values must not be renumbered.** The AAD is the raw `userId` string. A copy
   that reassigns primary keys breaks offline prehash exactly the same way a wrong master
   secret does. A plain `pg_dump`/`pg_restore` preserves them; the procedure must say so and
   must not include any "fix up the ids" step.

The procedure must therefore include a **pre-flight check** that reads the effective value of
both settings on both servers and compares them, and refuses to continue on a mismatch,
printing what to do. Not a warning — a refusal.

## Ordering — this is not optional

**All 34 foreign keys in this model are `DeleteBehavior.Restrict`. There is not one cascade.**

**CORRECTION (2026-09-27).** An earlier draft of this document stated the order below
"leaves first", which is the correct order for a DELETE and the **wrong** order for an INSERT.
Measured against the model, that draft inserted a child before its parent in 11 of 12 steps; a
child row referencing a not-yet-inserted parent violates the FK immediately. The first draft was
wrong, not the implementation. The load order is **parents first**:

```
User
  → Owner                    (Owner.UserId      → User)
  → ReSeller                 (ReSeller.UserId   → User)
  → ReSellerOwner            (→ ReSeller, Owner)
  → Store                    (Store.OwnerId     → Owner; StorePlanId → StorePlan catalog)
  → StoreModule              (StoreId           → Store)
  → StoreRoleFeature         (StoreId           → Store; RoleId/FeatureId → catalog)
  → StoreUser                (→ User, Store)
  → UserRole                 (UserId            → User; RoleId → catalog)
  → ProductCategory  (opt)   (StoreId           → Store)
  → Product         (opt)    (CategoryId/BusinessId → ProductCategory, Store)
  → ChannelExchangeRate (opt) (StoreId          → Store)
```

`StorePlan`, `Role` and `Feature` are catalog and already exist on the test database after
`Database.MigrateAsync()`, so they are not inserted here.

Loading must run inside ONE transaction, so a failure leaves the target database exactly as
it was rather than half-populated.

## Deliverables

1. `backend/scripts/prod-to-test/README.md` — the procedure, in the maintainer's language,
   covering: pre-flight secret check, extraction, load, verification, and the rollback.
2. `01-extract.sql` — read-only. Run on PROD. Emits the identity+permission graph as
   `COPY ... TO STDOUT` in the derived order.
3. `02-load.sql` — run on TEST. Wraps everything in `BEGIN`/`COMMIT`, loads in the derived
   order, `ON CONFLICT DO NOTHING` so a re-run is safe, and never touches the seeded
   superadmin or Default Tenant.
4. `03-verify.sql` — counts per table before/after, an orphan check, and a permission sanity
   check comparing `StoreRoleFeature` row counts.
5. The pre-flight secret check, as a runnable script.

Follow the house conventions from `backend/scripts/README.md`: numbered files, `BEGIN`/`COMMIT`,
idempotent, `ON CONFLICT DO NOTHING`, and a trailing verification `SELECT`.

## Hard constraints

- **Do NOT connect to any database. Do NOT run `psql`, `pg_dump`, `dotnet ef`, or any docker
  command.** These scripts are delivered for the maintainer to run by hand on the VPS. The
  database is not reachable from here and attempting it is out of scope.
- **Do NOT create, alter or drop any database object.** No migrations, no schema changes.
  The target schema is created by `Database.MigrateAsync()` as a separate, prior step.
- The Angular `frontend/` is frozen — never read it.
- Do not touch `frontend-react/` — no application code changes in this task.
- No AI attribution in any commit; the `commit-msg` hook now blocks it.
- Conventional Commits, no AI attribution. On PowerShell use `git commit -F <tempfile>`.

## Acceptance criteria

1. `01-extract.sql` is strictly read-only — no `INSERT`/`UPDATE`/`DELETE`/`CREATE`/`ALTER`.
2. `02-load.sql` runs inside a single transaction and is idempotent on re-run.
3. The load order matches the derived order above and is documented inline in the script.
4. The load never deletes, truncates or overwrites the seeded superadmin or Default Tenant.
5. `RefreshTokens` appears in no script at all.
6. The pre-flight check compares BOTH secrets across both servers and blocks on mismatch.
7. The README states that `User.Id` must not be renumbered, and why (AAD on the envelope).
8. Optional business-data tables are behind individually switchable flags, off by default.
9. Every table named in the load order exists in the real model with the columns assumed.
10. Nothing in this change touches Angular, `frontend-react/`, the API, or the E2E suite.
