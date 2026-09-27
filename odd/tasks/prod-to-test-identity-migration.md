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
| `Module`, `Feature`, `Role`, `StorePlan`, `StorePlanModule`, `StorePaymentStatus`, `SystemConfiguration` | Catalog. Not copied: `Database.Migrate()` rebuilds it identically on the test DB. Copying it from prod would make the two databases drift and would make "what is catalog vs what is data" unknowable. |
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
`Database.Migrate()`, so they are not inserted here.

**NAME CORRECTION (2026-09-27).** Earlier drafts of this document named
`Database.MigrateAsync()`. No such call exists in this codebase. The real path is
`MigrationExtensions.ApplyMigrations()`, which calls the **synchronous** `Database.Migrate()`,
and `Program.cs` invokes it as `app.ApplyMigrations()`. That call sits inside
`if (app.Environment.IsDevelopment())`, so **an API started with any other
`ASPNETCORE_ENVIRONMENT` migrates nothing on startup.** For a VPS or a container this is a real
operational gap, not a wording issue, and the README now says so.

Loading must run inside ONE transaction, so a failure leaves the target database exactly as
it was rather than half-populated.

## What verification added, and what it corrected

An independent verification pass ran after the first implementation landed
(`ae793c19`). It confirmed eight items as correct — the load order, the 34 `Restrict` foreign
keys, the `ON CONFLICT DO NOTHING` choice, the column lists, the `User.Id` AAD constraint, the
exclusion of `RefreshTokens`, the secrets pre-flight, and the read-only extract — and found nine
defects. Four of them are premises this document got wrong, and they are recorded here because
the wrong premise is what produced the wrong code.

### 1. `TenantId` is NOT a foreign key

The earlier drafts treated tenant scoping as database-enforced. It is not. No `HasForeignKey`
in `ApplicationDbContextModelSnapshot.cs` names `Domain.Entities.Tenants.Tenant` as a principal
table — `TenantId` is a plain non-nullable `Guid` column on all 12 migrated tables. Tenant
scoping is applied in the **query layer** instead:
`HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId)` on each of the
12 entities, with `HttpContextService` reading `TenantId` from a JWT claim.

Consequence: a row carrying a second tenant's id loads without complaint and then becomes
**unreachable** — it is in the table and no ordinary request returns it. No FK, no orphan check,
and no row count can see it. Fixed by a per-tenant inventory in `01-extract.sql` (Section A2) and
a `RAISE EXCEPTION` guard over all 12 staging tables in `02-load.sql`, plus Query 8 in
`03-verify.sql`.

### 2. A skipped row is NOT caught by a foreign key

The earlier README claimed a skipped parent row is safe because its children would then have no
parent and the FK would roll the transaction back. That is true only for a row that **has** a
dependent among the nine loaded tables. A production `User` with no `Owner`, no `ReSeller`, no
`StoreUser` and no `UserRole` — a registered, never-approved account — has no dependents, so
nothing fires, the transaction commits, `psql` exits `0`, and the account simply does not exist
in test. Two tables are worse, because what disappears is a link: `ReSellerOwner.OwnerId` and
`StoreUser.UserId` each carry their own unique index on top of the composite primary key.

Fixed by a named not-landed report (login, store name, Gestor, role — not a bare count) and a
`present_rows <> staged_rows` assertion that refuses to `COMMIT`, overridable only with the
documented `-v allow_resume=1`.

### 3. An empty staging table is indistinguishable from a clean load of zero rows

The count comparison would report `0 = 0` and pass. Fixed with a second guard requiring all nine
mandatory staging tables to be non-empty. The three optional tables are deliberately excluded: a
store with no products really does produce an empty `11-product.csv`.

### 4. A flag tested by presence is not a boolean

`\if :{?load_product}` asks whether the variable is **set**, not what it holds, so
`-v load_product=0`, `=false` and `=off` all turned the block ON. Fixed by resolving each flag to
a real boolean in SQL (`SELECT ... \gset` over a value test) and letting `\if` read only that.

### 5. A `sed` fallback that reported a false pass

`00-preflight-secrets.sh` fell back to matching the leaf key name in the raw JSON when neither
`jq` nor `python3` worked. A leaf-name match discards the path the key sits under, so it can
capture a **different** secret that shares the leaf name, or stop at the first quote of a value
containing an escaped quote — either way printing `MATCH` for two different secrets. Fixed by
deleting the fallback and making a working JSON reader mandatory: the probe prints
`UNVERIFIABLE (no JSON reader available)` and exits `2`, distinct from `1`, so "could not check"
never looks like "found a problem".

### 6. CSV header drift was undetectable

`COPY ... HEADER true` reads and discards the header line without comparing it to the target
column list. Fixed with a **conditional** `HEADER MATCH` (PostgreSQL 17+, detected at runtime via
`current_setting('server_version_num')`), falling back to `HEADER true` with a printed warning, so
the server requirement is not raised silently.

### 7. The CSVs were world-readable

`01-extract.sql` cannot fix this itself: it runs inside a `READ ONLY` transaction, where a `SET`
is rejected, and the files are written by `psql` — a different process that inherits the calling
shell's `umask`. Fixed by documenting `umask 077` plus `rm -f prod-to-test/data/*.csv` as explicit
required lines in the script header and in README section 5, rather than as a SQL statement that
would have been rejected.

### 8. The blanket `DELETE FROM "User"` rollback destroyed seeded rows

The rollback in the earlier README deleted every row of every table. That destroys the seeded
superadmin (`38b96d85-…`), the seeded "Admin Owner" `Owner` (whose `Id` **is** the Default Tenant
id `b58bf718-…`), and the seeded "Default Store" (`0ed24a91-…`). `HasData` rows are written by a
**migration**: once that migration is recorded as applied, restarting the application will not
restore a deleted seed. Fixed by scoping the rollback to the migrated ids, re-read from the same
CSVs into temp tables — which is also why section 12 must not shred the CSVs until the rollback
window closes.

### 9. The verification script could not see a missing link

`03-verify.sql`'s orphan check asks whether a link's parents exist; it can never report a link
that does not exist. Added Query 9 (Gestors with zero owner links) and Query 8 (tenant
integrity, which no FK can check).

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
  The target schema is created by `Database.Migrate()` as a separate, prior step — and that call
  is gated on `IsDevelopment()`, so it is not automatic on a VPS.
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
11. The load refuses to `COMMIT` when any staged row did not land, and names every such row.
    `-v allow_resume=1` is the only way past it, and only for a genuine re-run.
12. The load refuses to `COMMIT` when a staged row carries a `TenantId` other than the Default
    Tenant, naming the offending table, row count and tenant ids.
13. The load refuses to `COMMIT` when any of the nine mandatory staging tables is empty.
14. Optional-block flags are evaluated by value, so `0`, `false`, `off`, `no` and empty all mean
    off.
15. `00-preflight-secrets.sh` exits `2` rather than guessing when no working JSON reader exists,
    and never falls back to a leaf-key text match.
16. Every `\copy` uses `HEADER MATCH` where the server supports it (PostgreSQL 17+) and says so
    out loud where it does not.
17. The documented rollback deletes only the migrated ids, and the README names the seeded rows a
    blanket `DELETE` would destroy.
