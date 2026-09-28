-- =====================================================
-- prod-to-test / 02-load.sql
--
-- Purpose : load the identity + permission graph produced by 01-extract.sql
--           into the TARGET database (test).
-- Runs on : the TARGET database (test).
-- Safety  : it ADDS rows. It never removes a row, never truncates a table,
--           and never overwrites an existing row, so the seeded superadmin
--           User, its UserRole row and the Default Tenant are untouched.
-- Tooling : psql >= 10, and a server >= 9.5. The floor is the meta-command
--           family this script is built on: \if/\else/\endif arrived in 10,
--           \gset in 9.6, to_regclass in 9.4. The server floor is ON CONFLICT,
--           which arrived in 9.5. Beyond those two floors this script asks
--           NOTHING of the server version, on purpose: the column check below
--           is plain SQL over pg_attribute and behaves identically on every
--           release, so there is no version to detect and none to report.
--
-- HOW TO RUN (from the backend/scripts directory, data/ already populated):
--
--   # identity + permission graph only (the default)
--   psql "$TARGET_DSN" -f prod-to-test/02-load.sql
--
--   # add one optional block
--   psql "$TARGET_DSN" -v load_product_category=1 -f prod-to-test/02-load.sql
--   psql "$TARGET_DSN" -v load_product=1             -f prod-to-test/02-load.sql
--   psql "$TARGET_DSN" -v load_channel_exchange_rate=1 -f prod-to-test/02-load.sql
--
--   # only when re-running over a load that is already partially there
--   psql "$TARGET_DSN" -v allow_resume=1 -f prod-to-test/02-load.sql
--
-- The optional blocks are OFF by default and are switched on BY VALUE: any
-- value other than 0, false, off, no or empty turns the block on, so
-- -v load_product=0 is off, not on. "load_product" needs
-- "load_product_category" (Product carries a required FK to
-- ProductCategory); asking for one without the other stops the load.
--
-- "allow_resume" is not a convenience switch. By default this script REFUSES
-- to commit if any staged row did not land, because a row that is silently
-- dropped is the one failure this whole procedure cannot detect afterwards.
-- See "WHY A SKIPPED ROW IS NOT SAFE" below before setting it.
--
-- The CSV paths are relative to the current working directory, so psql must
-- be run from backend/scripts.
--
-- ---------------------------------------------------------------------
-- WHY THIS ORDER
-- ---------------------------------------------------------------------
-- This model declares 34 foreign keys and every single one of them is
-- DeleteBehavior.Restrict. There is not one cascade anywhere in the
-- snapshot. Postgres enforces a foreign key on the way IN, so a table must
-- be loaded only after every table it points at already holds the parent
-- row. That forces a topological order, which is the one below.
--
-- The dependency chain, read from
-- backend/src/Infrastructure/Migrations/ApplicationDbContextModelSnapshot.cs:
--
--   1  User             no FK to anything in this set
--   2  Owner            -> User                      (required, unique on UserId)
--   3  ReSeller         -> User                      (required, unique on UserId)
--   4  ReSellerOwner    -> ReSeller, Owner           (both required)
--   5  Store            -> Owner, StorePlan          (StorePlan is catalog, not in this set)
--   6  StoreModule      -> Store, Module             (Module is catalog)
--   7  StoreRoleFeature -> Store, Role, Feature      (Role and Feature are catalog)
--   8  StoreUser        -> Store, User
--   9  UserRole         -> User, Role                (Role is catalog)
--  10  ProductCategory  -> Store                     [optional]
--  11  Product          -> ProductCategory           [optional]
--  12  ChannelExchangeRate -> Store                  [optional]
--
-- Catalog tables (Role, Feature, Module, StorePlan) are NOT in this script.
-- Database.Migrate() builds them identically on the target, with the same
-- seeded identifiers. The guard at the top of this script refuses to run if
-- they are not there.
--
-- NOTE ON THE ORIGINAL DRAFT ORDER
-- The feature document listed the steps leaves-first (UserRole, then User,
-- etc.) and put Product ahead of ProductCategory. Both are impossible
-- against these foreign keys: a child row cannot be loaded before its
-- parent exists. The order above is the derived one, and it is the only one
-- that loads cleanly. See prod-to-test/README.md, section "Correccion del
-- orden de carga".
--
-- ---------------------------------------------------------------------
-- WHY ON CONFLICT DO NOTHING HAS NO CONFLICT TARGET
-- ---------------------------------------------------------------------
-- Every insert below uses the bare form, with no ON CONFLICT (...) target.
-- That is deliberate and it is not laziness. Besides the primary key, the
-- model carries these extra unique indexes:
--
--   User.Login            unique  (global)
--   Owner.UserId          unique
--   ReSeller.UserId       unique
--   ReSellerOwner.OwnerId unique  (the PK is ReSellerId + OwnerId)
--   StoreUser.UserId      unique  (the PK is UserId + StoreId)
--
-- Naming only the primary key as the conflict target would let a collision
-- on one of those single-column indexes abort the load. The bare form skips
-- any conflicting row instead, so a re-run is a no-op and an already
-- present row is never overwritten.
--
-- WHY A SKIPPED ROW IS NOT SAFE
--
-- An earlier version of this comment claimed that a skipped User is caught
-- for free, because the Owner row that depends on it would have no parent
-- and the foreign key would roll the transaction back. That is true only
-- when the skipped user has at least one dependent row among the nine
-- tables loaded here. A production user with no Owner, no ReSeller, no
-- StoreUser and no UserRole - a registered but never approved account -
-- has no dependents, so nothing fails, the transaction commits, psql exits
-- 0, and the account simply does not exist in test. The same applies to a
-- registered-but-never-used login: the seeded superadmin's Login is
-- literally "admin", so any other production account holding that login
-- is dropped this way, quietly.
--
-- Two composite-key tables have the same exposure, and it is worse there,
-- because the row that disappears is a link:
--
--   ReSellerOwner.OwnerId is UNIQUE (the key is ReSellerId + OwnerId), so a
--   migrated Gestor loses that owner if test already links the owner to a
--   different Gestor. The Gestor then logs in and sees an empty owner list.
--
--   StoreUser.UserId is UNIQUE (the key is UserId + StoreId), so a second,
--   legitimate store membership for the same employee is droppable.
--
-- So the bare ON CONFLICT stays - it is the only form that is safe against
-- all five secondary indexes - and the skipping itself is made visible and
-- fatal instead of being waved through:
--
--   * the report near the bottom lists every row that did not land, by name
--     (login, store name, Gestor, role), not as a bare count, and names the
--     index that could have caused the skip;
--   * a guard refuses to COMMIT when any staged row is missing, so the run
--     fails while the transaction can still be rolled back;
--   * -v allow_resume=1 is the deliberate, documented way to accept the
--     difference on a genuine re-run, where a difference IS expected.
--
-- Three more guards sit at the bottom, for failures that have no row to
-- report at all:
--
--   * every staged row must carry the Default Tenant id. TenantId is not a
--     foreign key, so a row from a second tenant loads cleanly and then
--     becomes invisible to every query filter;
--   * none of the nine mandatory staging tables may be empty, because an
--     empty one is indistinguishable from a successful load of zero rows;
--   * the optional blocks are gated on the VALUE of their flag, not on its
--     presence, so -v load_product=0 turns the block off.
--
-- The dropped-row report covers all TWELVE tables, not only the nine
-- mandatory ones. "An empty optional table is legitimate" and "a row that
-- was supposed to land did not" are two different questions, and only the
-- first one has an exception.
--
-- And one thing is WRITTEN, not checked. Just before the COMMIT, the keys
-- this run actually INSERTED are recorded per table in
-- prod-to-test/data/NN-<table>-inserted.csv. That record - not the extract
-- CSVs - is what the rollback reads, and the reason is in the last section
-- of this file.
-- =====================================================

\set ON_ERROR_STOP on
\pset pager off

SET TIME ZONE 'UTC';

-- ---------------------------------------------------------------------
-- Flags: resolved by VALUE, then handed to \if as a real boolean.
-- ---------------------------------------------------------------------
-- An earlier version guarded each optional block with "\if :{?load_product}".
-- That tests whether the variable is SET, not what it holds, so
-- -v load_product=0, -v load_product=false and -v load_product=off all
-- turned the block ON. A flag that lies about being a boolean is worse than
-- no flag, so the decision is taken in SQL here and \if only reads a real
-- boolean.
--
-- psql interpolates the argument of \if and then evaluates it like an
-- on/off option (true/false/1/0/on/off/yes/no, and unambiguous prefixes),
-- so testing a variable's value works. An unset variable has no value to
-- evaluate, so every flag is defaulted to 0 first - the \if/\else/\endif
-- pair below only sets the default when the operator did NOT pass the flag.
\if :{?load_product_category}
\else
  \set load_product_category 0
\endif
\if :{?load_product}
\else
  \set load_product 0
\endif
\if :{?load_channel_exchange_rate}
\else
  \set load_channel_exchange_rate 0
\endif
\if :{?allow_resume}
\else
  \set allow_resume 0
\endif

-- The documented "SELECT ... \gset" pattern: the query returns exactly one
-- row and each column becomes a psql variable. The values are cast to text
-- so they are the literal strings "true"/"false", both of which \if accepts
-- unambiguously. NULLIF makes an empty value behave like an absent one, and
-- lower() makes "False" and "FALSE" behave like "false".
--
-- The flags are read in TWO steps on purpose. Step one only COPIES the four
-- operator inputs into flag_* and resolves nothing, so nothing here can
-- overwrite what -v set. Step two derives the booleans from those copies.
-- A single \gset that both read and derive cannot tell a value it was
-- handed from a value it wrote, so the derived names used to be silently
-- driven by the query even when the operator passed them on the -v line.
-- That is why the derived names below are act_* and why nothing in this
-- script reads do_*.
--
-- A -v do_product=... (or do_product_category, do_channel_exchange_rate,
-- do_allow_resume) from an older copy of this script is now meaningless and
-- is called out, because a flag that is accepted on the command line and
-- then does the opposite is worse than no flag at all.
\if :{?do_product}
  \echo 'NOTICE: -v do_product=... is IGNORED. These are not the inputs.'
  \echo '        The inputs are load_product, load_product_category,'
  \echo '        load_channel_exchange_rate and allow_resume; see the header.'
\endif
\if :{?do_product_category}
  \echo 'NOTICE: -v do_product_category=... is IGNORED. Use -v load_product_category=...'
\endif
\if :{?do_channel_exchange_rate}
  \echo 'NOTICE: -v do_channel_exchange_rate=... is IGNORED. Use -v load_channel_exchange_rate=...'
\endif
\if :{?do_allow_resume}
  \echo 'NOTICE: -v do_allow_resume=... is IGNORED. Use -v allow_resume=...'
\endif

SELECT
    :'load_product_category'      AS flag_product_category,
    :'load_product'               AS flag_product,
    :'load_channel_exchange_rate' AS flag_channel_exchange_rate,
    :'allow_resume'               AS flag_allow_resume
\gset

SELECT
    COALESCE(NULLIF(lower(:'flag_product_category'), ''), '0')
        NOT IN ('0', 'false', 'off', 'no')                      AS act_product_category,
    COALESCE(NULLIF(lower(:'flag_product'), ''), '0')
        NOT IN ('0', 'false', 'off', 'no')                      AS act_product,
    COALESCE(NULLIF(lower(:'flag_channel_exchange_rate'), ''), '0')
        NOT IN ('0', 'false', 'off', 'no')                      AS act_channel_exchange_rate,
    COALESCE(NULLIF(lower(:'flag_allow_resume'), ''), '0')
        NOT IN ('0', 'false', 'off', 'no')                      AS act_allow_resume
\gset

-- --- Guard: the target schema and catalog must already be migrated -----
-- This is the migration step from README section 3, and the maintainer does
-- it before this script. In this codebase it is
-- dbContext.Database.Migrate() in MigrationExtensions.ApplyMigrations(),
-- called from Program.cs as app.ApplyMigrations() - and that call sits
-- inside "if (app.Environment.IsDevelopment())", so an API started with any
-- other ASPNETCORE_ENVIRONMENT does not migrate anything on startup. Note
-- also that a HasData seed row is written by a MIGRATION: once the migration
-- is recorded as applied, starting the application again will not bring a
-- deleted seed row back.
DO $guard$
DECLARE
    _missing text;
BEGIN
    -- to_regclass, not a plain SELECT: the body of a DO block is parsed when
    -- it executes, so reading a missing table directly would raise
    -- 'relation "Role" does not exist' and say nothing about the fix.
    SELECT string_agg(m, ', ' ORDER BY m) INTO _missing
      FROM unnest(ARRAY['Tenant', 'User', 'UserRole', 'Role', 'Feature',
                        'Module', 'StorePlan']) AS m
     WHERE to_regclass(format('%I', m)) IS NULL;

    IF _missing IS NOT NULL THEN
        RAISE EXCEPTION
            'The test database was never migrated: these tables do not exist: %. There is nothing to load into. Apply the migrations first (README section 3). The API calls Database.Migrate() through app.ApplyMigrations() on startup, but only when ASPNETCORE_ENVIRONMENT is Development.',
            _missing;
    END IF;

    IF (SELECT COUNT(*) FROM "Role") = 0
       OR (SELECT COUNT(*) FROM "Feature") = 0
       OR (SELECT COUNT(*) FROM "Module") = 0
       OR (SELECT COUNT(*) FROM "StorePlan") = 0 THEN
        RAISE EXCEPTION
            'Catalog tables Role/Feature/Module/StorePlan are empty on the target. Apply the migrations against the test database (README section 3) before running 02-load.sql.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM "User" WHERE "Id" = '38b96d85-bf75-41ca-bfd7-796e7fe0ebc8') THEN
        RAISE EXCEPTION
            'The seeded superadmin User is missing on the target. Apply the migrations against the test database (README section 3) before running 02-load.sql.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM "Tenant" WHERE "Id" = 'b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8') THEN
        RAISE EXCEPTION
            'The Default Tenant is missing on the target. Apply the migrations against the test database (README section 3) before running 02-load.sql.';
    END IF;
END
$guard$;

-- ---------------------------------------------------------------------
-- Guard: the column lists in this script still describe the tables
-- ---------------------------------------------------------------------
-- The drift this catches is not hypothetical. The origin/test merge that
-- brought in the WebCatalog fields added eight columns to three of the
-- twelve tables - two to Store, one to ProductCategory, five to Product -
-- and the column lists in 01-extract.sql and in this file were out of date
-- the moment it landed.
--
-- WHAT IS COMPARED
-- This script already knows, for each of the twelve tables, the exact set
-- of column names it is going to ask for. Before a single \copy runs, that
-- list is compared against what the table on the target actually has,
-- read from pg_attribute: attnum > 0 leaves out the system columns, NOT
-- attisdropped leaves out the ones a rename left behind, and relname is
-- the table. A column that was renamed or dropped therefore shows up as a
-- hole here instead of silently shifting every position after it.
--
-- WHY IT REPLACES COPY ... HEADER MATCH
-- HEADER MATCH needed PostgreSQL 15, so on anything older this script fell
-- back to HEADER true, which reads the header line and discards it
-- unchecked - a different level of checking depending on the server, which
-- is the one thing a procedure that moves real credentials cannot afford.
-- This check has no version gate at all: it is a DO block over
-- pg_attribute, and it behaves identically on every release.
--
-- It is also a larger guarantee, and this is the part worth being precise
-- about. HEADER MATCH asked "do the column names in the CSV header line
-- match the columns of the table?". This asks "do the column names written
-- into THIS script still match the columns of the table?" - and that is
-- where the eight columns of the merge actually entered, because both
-- files carried the stale list and the CSV was written from it. It also
-- fails before a row is read, not part-way through a COPY with the
-- transaction already open.
--
-- WHY THE COMPARISON IS ON NAMES AND NOT ON THE PHYSICAL ORDER
-- Both sides are put in name order and then compared position by position.
-- A comparison against attnum was rejected on purpose:
--
--   * the lists here follow the EF model order - key columns first, then
--     the rest alphabetically - and that is NOT attnum order. "User" was
--     created as Id, Login, Password, FullName, CellPhone, Email,
--     SelectedStoreId, TenantId, IsActive, CreatedDate, CreatedBy,
--     UpdatedDate, UpdatedBy, and OfflinePasswordPreHash was appended by a
--     later migration, so a strict ordinal comparison would reject all
--     twelve tables on a perfectly healthy database;
--   * attnum order is not a portable contract in this repository. There
--     are numbered hand-written DDL scripts under backend/scripts/ that are
--     applied alongside the EF migrations. If the same set of ADD COLUMNs
--     ran in a different order on production than on test, the physical
--     order differs while the schema is identical, and a check that fires
--     on that would stop a correct migration.
--
-- A column moved on disk is harmless here regardless: every \copy below
-- names its columns, so nothing in this load depends on their order.
--
-- WHAT IT DOES NOT SEE
-- The order of the list itself is compared against nothing, and that order
-- is what maps CSV field N to column N. Both copies of the list - the one
-- below and the one in each \copy - are hand-written, and this check can
-- see neither the CSV header nor the \copy line. A \copy that names a
-- column the table does not have, or the wrong number of them, is caught
-- by \copy itself. A \copy that reorders the columns without reordering
-- 01-extract.sql to match is not caught here: the data lands in the wrong
-- columns and the count checks in 03-verify.sql cannot see it. Keep the
-- two files' lists in the same order.
DO $columns$
DECLARE
    r       record;
    _rel    regclass;
    _script text[];
    _actual text[];
    _only   text[];
    _max    integer;
    _i      integer;
    _report text := '';
BEGIN
    -- The lists are written here in the same order the \copy below uses
    -- them, so this block is readable next to the statement it protects.
    FOR r IN
        SELECT * FROM (VALUES
            ('User',                ARRAY['Id', 'CellPhone', 'CreatedBy', 'CreatedDate', 'Email', 'FullName', 'IsActive', 'Login', 'OfflinePasswordPreHash', 'Password', 'SelectedStoreId', 'TenantId', 'UpdatedBy', 'UpdatedDate']),
            ('Owner',               ARRAY['Id', 'CreatedBy', 'CreatedDate', 'Description', 'Guest', 'IsActive', 'TenantId', 'UpdatedBy', 'UpdatedDate', 'UserId']),
            ('ReSeller',            ARRAY['Id', 'Approved', 'CreatedBy', 'CreatedDate', 'Description', 'DiscountPrice', 'IsActive', 'PercentDiscountPrice', 'TenantId', 'UpdatedBy', 'UpdatedDate', 'UserId']),
            ('ReSellerOwner',       ARRAY['ReSellerId', 'OwnerId', 'CreatedBy', 'CreatedDate', 'DiscountPrice', 'IsActive', 'PercentDiscountPrice', 'TenantId', 'UpdatedBy', 'UpdatedDate']),
            ('Store',               ARRAY['Id', 'Address', 'Approved', 'CatalogSlug', 'CatalogSyncedAt', 'CreatedBy', 'CreatedDate', 'Description', 'IsActive', 'Name', 'NextDueDateOverride', 'OwnerId', 'PaymentStartDate', 'StorePlanId', 'TenantId', 'UpdatedBy', 'UpdatedDate']),
            ('StoreModule',         ARRAY['StoreId', 'ModuleId', 'CreatedBy', 'CreatedDate', 'IsActive', 'ModuleDiscountPrice', 'ModulePercentDiscountPrice', 'ModulePrice', 'ModulePriceIncluded', 'Price', 'TenantId', 'UpdatedBy', 'UpdatedDate']),
            ('StoreRoleFeature',    ARRAY['StoreId', 'RoleId', 'FeatureId', 'CreatedBy', 'CreatedDate', 'IsActive', 'TenantId', 'UpdatedBy', 'UpdatedDate']),
            ('StoreUser',           ARRAY['UserId', 'StoreId', 'CreatedBy', 'CreatedDate', 'IsActive', 'TenantId', 'UpdatedBy', 'UpdatedDate']),
            ('UserRole',            ARRAY['UserId', 'RoleId', 'CreatedBy', 'CreatedDate', 'IsActive', 'TenantId', 'UpdatedBy', 'UpdatedDate']),
            ('ProductCategory',     ARRAY['Id', 'CreatedBy', 'CreatedDate', 'IsActive', 'Name', 'Order', 'Slug', 'StoreId', 'TenantId', 'UpdatedBy', 'UpdatedDate']),
            ('Product',             ARRAY['Id', 'AvailableToSale', 'BusinessId', 'CategoryId', 'CreatedBy', 'CreatedDate', 'Currency', 'Description', 'DiscountFromInventory', 'DiscountPrice', 'Image', 'IsActive', 'IsNew', 'Name', 'Order', 'PercentDiscountPrice', 'Price', 'TenantId', 'UpdatedBy', 'UpdatedDate']),
            ('ChannelExchangeRate', ARRAY['Id', 'CreatedBy', 'CreatedDate', 'Currency', 'EffectiveFrom', 'IsActive', 'Method', 'StoreId', 'TenantId', 'UpdatedBy', 'UpdatedDate', 'Value'])
        ) AS v(tbl, cols)
    LOOP
        -- to_regclass, not a plain lookup: the body of a DO block is parsed
        -- when it executes, so naming a missing table directly would raise
        -- 'relation does not exist' and say nothing about the fix.
        _rel := to_regclass(format('%I', r.tbl));

        IF _rel IS NULL THEN
            _report := _report
                     || format(E'\n  %-22s the table does not exist on the target', r.tbl);
            CONTINUE;
        END IF;

        -- attisdropped matters as much as the names do: a column a rename
        -- left behind keeps its attnum and is excluded here, so the rename
        -- is reported as a missing column instead of shifting every
        -- position after it.
        SELECT coalesce(array_agg(a.attname ORDER BY a.attname), '{}')
          INTO _actual
          FROM pg_attribute a
         WHERE a.attrelid = _rel
           AND a.attnum > 0
           AND NOT a.attisdropped;

        _script := array(SELECT x.c FROM unnest(r.cols) AS x(c) ORDER BY x.c);

        CONTINUE WHEN _actual IS NOT DISTINCT FROM _script;

        _report := _report
                 || format(E'\n  %-22s this script lists %s column(s); the table has %s',
                           r.tbl,
                           coalesce(array_length(_script, 1), 0),
                           coalesce(array_length(_actual, 1), 0));

        _only := ARRAY(SELECT unnest(_actual) EXCEPT SELECT unnest(_script));
        IF coalesce(array_length(_only, 1), 0) > 0 THEN
            _report := _report
                     || format(E'\n%25s in the table, not in this script: %s',
                               '', array_to_string(_only, ', '));
        END IF;

        _only := ARRAY(SELECT unnest(_script) EXCEPT SELECT unnest(_actual));
        IF coalesce(array_length(_only, 1), 0) > 0 THEN
            _report := _report
                     || format(E'\n%25s in this script, not in the table: %s',
                               '', array_to_string(_only, ', '));
        END IF;

        -- The first position at which the two ordered lists stop agreeing,
        -- so the message points at a line of the list instead of only
        -- listing symmetric differences. An index past the end of one of
        -- the two arrays reads as NULL, which is what makes a column added
        -- or removed at the end land here too.
        --
        -- That position is a position in the DATABASE's name order, which
        -- depends on the collation of the server and is not necessarily
        -- the order the list above is written in. The two lines above it
        -- are not affected by the collation and always name the columns,
        -- so read those first.
        _max := greatest(coalesce(array_length(_script, 1), 0),
                         coalesce(array_length(_actual, 1), 0));
        _i := 1;
        WHILE _i <= _max LOOP
            EXIT WHEN _actual[_i] IS DISTINCT FROM _script[_i];
            _i := _i + 1;
        END LOOP;

        IF _i <= _max THEN
            _report := _report
                     || format(E'\n%25s first divergent position %s: this script has %s, the table has %s',
                               '', _i,
                               coalesce(_script[_i], '<no column at this position>'),
                               coalesce(_actual[_i], '<no column at this position>'));
        END IF;
    END LOOP;

    -- Every table is reported, not just the first one to fail: the drift
    -- this catches comes from a model change, and a model change touches
    -- more than one table. The other guards in this file stop at the first
    -- problem because each of them describes one condition; this one
    -- describes a list, and the whole list is the diagnosis.
    IF _report <> '' THEN
        RAISE EXCEPTION
            'The column lists in 02-load.sql do not match the tables on the target, so the load was stopped before reading a single row:%\nThe usual cause is a column added to the model that this file was not updated for. Apply the migrations to the test database first (README section 3) so both sides describe the same schema, then add the column to the \copy, the INSERT and this check - or remove it from all three if it does not belong in this set.', _report;
    END IF;
END
$columns$;

-- --- Guard: an optional block that cannot stand on its own -------------
\if :act_product
  \if :act_product_category
  \else
    \echo 'STOP: -v load_product=1 requires -v load_product_category=1 (Product has a required FK to ProductCategory).'
    \quit 1
  \endif
\endif

BEGIN;

-- ---------------------------------------------------------------------
-- The pre-existing set: what the TARGET already held, per table
-- ---------------------------------------------------------------------
-- ON CONFLICT DO NOTHING makes the load additive but it makes the result
-- ambiguous. Once a table has been written, a staged key being present in
-- the target no longer says whether this run put it there or found it
-- there first. Everything downstream needs that distinction, and the only
-- place it exists is BEFORE the insert, so each table's pre-existing keys
-- are captured here, immediately before that table is written.
--
-- pre_<table> is exactly: the staged keys that the target already held.
-- Nothing else. It is not a snapshot of the table - only the keys the load
-- is about to consider.
--
-- Why it has to exist: 01-extract.sql copies EVERY row of these twelve
-- tables, with no filter of any kind, so the staged data includes the rows
-- the migrations seeded in production - which test also has, built by the
-- same migrations with the same fixed identifiers. The seeded superadmin
-- User 38b96d85-bf75-41ca-bfd7-796e7fe0ebc8 is one of them, and so is its
-- UserRole row. On a real run those two inserts are skipped, nothing looks
-- wrong, and a rollback driven from the extract CSVs would delete them. The
-- migration that wrote them is already recorded as applied, so it will not
-- write them again.
--
-- These tables are what the rollback reads. The extract CSVs are not.
--
-- Each pre_<table> is created right after its stg_<table> is filled and
-- right before that table's INSERT, so the two can never drift apart.
-- =====================================================
-- 1 / User
-- =====================================================
CREATE TEMP TABLE stg_user (LIKE "User" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_user ("Id", "CellPhone", "CreatedBy", "CreatedDate", "Email", "FullName", "IsActive", "Login", "OfflinePasswordPreHash", "Password", "SelectedStoreId", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/01-user.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE pre_user (LIKE stg_user) ON COMMIT DROP;
INSERT INTO pre_user SELECT s.* FROM stg_user s
 WHERE EXISTS (SELECT 1 FROM "User" x WHERE x."Id" = s."Id");
INSERT INTO "User" ("Id", "CellPhone", "CreatedBy", "CreatedDate", "Email", "FullName", "IsActive", "Login", "OfflinePasswordPreHash", "Password", "SelectedStoreId", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "Id", "CellPhone", "CreatedBy", "CreatedDate", "Email", "FullName", "IsActive", "Login", "OfflinePasswordPreHash", "Password", "SelectedStoreId", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_user ON CONFLICT DO NOTHING;

-- =====================================================
-- 2 / Owner   (-> User)
-- =====================================================
CREATE TEMP TABLE stg_owner (LIKE "Owner" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_owner ("Id", "CreatedBy", "CreatedDate", "Description", "Guest", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate", "UserId") FROM 'prod-to-test/data/02-owner.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE pre_owner (LIKE stg_owner) ON COMMIT DROP;
INSERT INTO pre_owner SELECT s.* FROM stg_owner s
 WHERE EXISTS (SELECT 1 FROM "Owner" x WHERE x."Id" = s."Id");
INSERT INTO "Owner" ("Id", "CreatedBy", "CreatedDate", "Description", "Guest", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate", "UserId")
SELECT "Id", "CreatedBy", "CreatedDate", "Description", "Guest", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate", "UserId"
FROM stg_owner ON CONFLICT DO NOTHING;

-- =====================================================
-- 3 / ReSeller   (-> User)
-- =====================================================
CREATE TEMP TABLE stg_reseller (LIKE "ReSeller" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_reseller ("Id", "Approved", "CreatedBy", "CreatedDate", "Description", "DiscountPrice", "IsActive", "PercentDiscountPrice", "TenantId", "UpdatedBy", "UpdatedDate", "UserId") FROM 'prod-to-test/data/03-reseller.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE pre_reseller (LIKE stg_reseller) ON COMMIT DROP;
INSERT INTO pre_reseller SELECT s.* FROM stg_reseller s
 WHERE EXISTS (SELECT 1 FROM "ReSeller" x WHERE x."Id" = s."Id");
INSERT INTO "ReSeller" ("Id", "Approved", "CreatedBy", "CreatedDate", "Description", "DiscountPrice", "IsActive", "PercentDiscountPrice", "TenantId", "UpdatedBy", "UpdatedDate", "UserId")
SELECT "Id", "Approved", "CreatedBy", "CreatedDate", "Description", "DiscountPrice", "IsActive", "PercentDiscountPrice", "TenantId", "UpdatedBy", "UpdatedDate", "UserId"
FROM stg_reseller ON CONFLICT DO NOTHING;

-- =====================================================
-- 4 / ReSellerOwner   (-> ReSeller, Owner)
-- Without this table a migrated Gestor sees an empty owner list.
-- =====================================================
CREATE TEMP TABLE stg_reseller_owner (LIKE "ReSellerOwner" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_reseller_owner ("ReSellerId", "OwnerId", "CreatedBy", "CreatedDate", "DiscountPrice", "IsActive", "PercentDiscountPrice", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/04-reseller-owner.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE pre_reseller_owner (LIKE stg_reseller_owner) ON COMMIT DROP;
INSERT INTO pre_reseller_owner SELECT s.* FROM stg_reseller_owner s
 WHERE EXISTS (SELECT 1 FROM "ReSellerOwner" x
                WHERE x."ReSellerId" = s."ReSellerId" AND x."OwnerId" = s."OwnerId");
INSERT INTO "ReSellerOwner" ("ReSellerId", "OwnerId", "CreatedBy", "CreatedDate", "DiscountPrice", "IsActive", "PercentDiscountPrice", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "ReSellerId", "OwnerId", "CreatedBy", "CreatedDate", "DiscountPrice", "IsActive", "PercentDiscountPrice", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_reseller_owner ON CONFLICT DO NOTHING;

-- =====================================================
-- 5 / Store   (-> Owner, StorePlan[catalog])
-- StorePlanId must exist in the target catalog (1 Gratis, 2 Pago,
-- 3 Superior, 4 VIP). The guard above proves the catalog is populated.
-- =====================================================
CREATE TEMP TABLE stg_store (LIKE "Store" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_store ("Id", "Address", "Approved", "CatalogSlug", "CatalogSyncedAt", "CreatedBy", "CreatedDate", "Description", "IsActive", "Name", "NextDueDateOverride", "OwnerId", "PaymentStartDate", "StorePlanId", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/05-store.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE pre_store (LIKE stg_store) ON COMMIT DROP;
INSERT INTO pre_store SELECT s.* FROM stg_store s
 WHERE EXISTS (SELECT 1 FROM "Store" x WHERE x."Id" = s."Id");
INSERT INTO "Store" ("Id", "Address", "Approved", "CatalogSlug", "CatalogSyncedAt", "CreatedBy", "CreatedDate", "Description", "IsActive", "Name", "NextDueDateOverride", "OwnerId", "PaymentStartDate", "StorePlanId", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "Id", "Address", "Approved", "CatalogSlug", "CatalogSyncedAt", "CreatedBy", "CreatedDate", "Description", "IsActive", "Name", "NextDueDateOverride", "OwnerId", "PaymentStartDate", "StorePlanId", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_store ON CONFLICT DO NOTHING;

-- =====================================================
-- 6 / StoreModule   (-> Store, Module[catalog])
-- Carries the price snapshot the store was actually charged, which no
-- reconstruction from the catalog can reproduce.
-- =====================================================
CREATE TEMP TABLE stg_store_module (LIKE "StoreModule" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_store_module ("StoreId", "ModuleId", "CreatedBy", "CreatedDate", "IsActive", "ModuleDiscountPrice", "ModulePercentDiscountPrice", "ModulePrice", "ModulePriceIncluded", "Price", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/06-store-module.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE pre_store_module (LIKE stg_store_module) ON COMMIT DROP;
INSERT INTO pre_store_module SELECT s.* FROM stg_store_module s
 WHERE EXISTS (SELECT 1 FROM "StoreModule" x
                WHERE x."StoreId" = s."StoreId" AND x."ModuleId" = s."ModuleId");
INSERT INTO "StoreModule" ("StoreId", "ModuleId", "CreatedBy", "CreatedDate", "IsActive", "ModuleDiscountPrice", "ModulePercentDiscountPrice", "ModulePrice", "ModulePriceIncluded", "Price", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "StoreId", "ModuleId", "CreatedBy", "CreatedDate", "IsActive", "ModuleDiscountPrice", "ModulePercentDiscountPrice", "ModulePrice", "ModulePriceIncluded", "Price", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_store_module ON CONFLICT DO NOTHING;

-- =====================================================
-- 7 / StoreRoleFeature   (-> Store, Role[catalog], Feature[catalog])
-- THIS IS WHERE THE PERMISSIONS LIVE. It is not derivable from the catalog:
-- StoreRoleFeatureGenerator drops any feature id with no StoreRoleFeatures
-- enum entry, so a rebuilt database would grant a different set. Copying
-- the produced rows is the only way to get the real grants back.
-- =====================================================
CREATE TEMP TABLE stg_store_role_feature (LIKE "StoreRoleFeature" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_store_role_feature ("StoreId", "RoleId", "FeatureId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/07-store-role-feature.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE pre_store_role_feature (LIKE stg_store_role_feature) ON COMMIT DROP;
INSERT INTO pre_store_role_feature SELECT s.* FROM stg_store_role_feature s
 WHERE EXISTS (SELECT 1 FROM "StoreRoleFeature" x
                WHERE x."StoreId" = s."StoreId"
                  AND x."RoleId" = s."RoleId"
                  AND x."FeatureId" = s."FeatureId");
INSERT INTO "StoreRoleFeature" ("StoreId", "RoleId", "FeatureId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "StoreId", "RoleId", "FeatureId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_store_role_feature ON CONFLICT DO NOTHING;

-- =====================================================
-- 8 / StoreUser   (-> Store, User)
-- Employee membership. One row per user at most: UserId carries its own
-- unique index, which is why the insert above uses the bare ON CONFLICT.
-- =====================================================
CREATE TEMP TABLE stg_store_user (LIKE "StoreUser" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_store_user ("UserId", "StoreId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/08-store-user.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE pre_store_user (LIKE stg_store_user) ON COMMIT DROP;
INSERT INTO pre_store_user SELECT s.* FROM stg_store_user s
 WHERE EXISTS (SELECT 1 FROM "StoreUser" x
                WHERE x."UserId" = s."UserId" AND x."StoreId" = s."StoreId");
INSERT INTO "StoreUser" ("UserId", "StoreId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "UserId", "StoreId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_store_user ON CONFLICT DO NOTHING;

-- =====================================================
-- 9 / UserRole   (-> User, Role[catalog])
-- =====================================================
CREATE TEMP TABLE stg_user_role (LIKE "UserRole" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_user_role ("UserId", "RoleId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/09-user-role.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE pre_user_role (LIKE stg_user_role) ON COMMIT DROP;
INSERT INTO pre_user_role SELECT s.* FROM stg_user_role s
 WHERE EXISTS (SELECT 1 FROM "UserRole" x
                WHERE x."UserId" = s."UserId" AND x."RoleId" = s."RoleId");
INSERT INTO "UserRole" ("UserId", "RoleId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "UserId", "RoleId", "CreatedBy", "CreatedDate", "IsActive", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_user_role ON CONFLICT DO NOTHING;

-- =====================================================
-- 10 / ProductCategory   (-> Store)          [optional, off by default]
-- =====================================================
\if :act_product_category
CREATE TEMP TABLE stg_product_category (LIKE "ProductCategory" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_product_category ("Id", "CreatedBy", "CreatedDate", "IsActive", "Name", "Order", "Slug", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/10-product-category.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE pre_product_category (LIKE stg_product_category) ON COMMIT DROP;
INSERT INTO pre_product_category SELECT s.* FROM stg_product_category s
 WHERE EXISTS (SELECT 1 FROM "ProductCategory" x WHERE x."Id" = s."Id");
INSERT INTO "ProductCategory" ("Id", "CreatedBy", "CreatedDate", "IsActive", "Name", "Order", "Slug", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "Id", "CreatedBy", "CreatedDate", "IsActive", "Name", "Order", "Slug", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_product_category ON CONFLICT DO NOTHING;
\endif

-- =====================================================
-- 11 / Product   (-> ProductCategory)       [optional, off by default]
-- Requires step 10. The guard above refuses to run without it.
-- =====================================================
\if :act_product
CREATE TEMP TABLE stg_product (LIKE "Product" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_product ("Id", "AvailableToSale", "BusinessId", "CategoryId", "CreatedBy", "CreatedDate", "Currency", "Description", "DiscountFromInventory", "DiscountPrice", "Image", "IsActive", "IsNew", "Name", "Order", "PercentDiscountPrice", "Price", "TenantId", "UpdatedBy", "UpdatedDate") FROM 'prod-to-test/data/11-product.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE pre_product (LIKE stg_product) ON COMMIT DROP;
INSERT INTO pre_product SELECT s.* FROM stg_product s
 WHERE EXISTS (SELECT 1 FROM "Product" x WHERE x."Id" = s."Id");
INSERT INTO "Product" ("Id", "AvailableToSale", "BusinessId", "CategoryId", "CreatedBy", "CreatedDate", "Currency", "Description", "DiscountFromInventory", "DiscountPrice", "Image", "IsActive", "IsNew", "Name", "Order", "PercentDiscountPrice", "Price", "TenantId", "UpdatedBy", "UpdatedDate")
SELECT "Id", "AvailableToSale", "BusinessId", "CategoryId", "CreatedBy", "CreatedDate", "Currency", "Description", "DiscountFromInventory", "DiscountPrice", "Image", "IsActive", "IsNew", "Name", "Order", "PercentDiscountPrice", "Price", "TenantId", "UpdatedBy", "UpdatedDate"
FROM stg_product ON CONFLICT DO NOTHING;
\endif

-- =====================================================
-- 12 / ChannelExchangeRate   (-> Store)     [optional, off by default]
-- =====================================================
\if :act_channel_exchange_rate
CREATE TEMP TABLE stg_channel_exchange_rate (LIKE "ChannelExchangeRate" INCLUDING DEFAULTS) ON COMMIT DROP;
\copy stg_channel_exchange_rate ("Id", "CreatedBy", "CreatedDate", "Currency", "EffectiveFrom", "IsActive", "Method", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate", "Value") FROM 'prod-to-test/data/12-channel-exchange-rate.csv' WITH (FORMAT csv, HEADER true)
CREATE TEMP TABLE pre_channel_exchange_rate (LIKE stg_channel_exchange_rate) ON COMMIT DROP;
INSERT INTO pre_channel_exchange_rate SELECT s.* FROM stg_channel_exchange_rate s
 WHERE EXISTS (SELECT 1 FROM "ChannelExchangeRate" x WHERE x."Id" = s."Id");
INSERT INTO "ChannelExchangeRate" ("Id", "CreatedBy", "CreatedDate", "Currency", "EffectiveFrom", "IsActive", "Method", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate", "Value")
SELECT "Id", "CreatedBy", "CreatedDate", "Currency", "EffectiveFrom", "IsActive", "Method", "StoreId", "TenantId", "UpdatedBy", "UpdatedDate", "Value"
FROM stg_channel_exchange_rate ON CONFLICT DO NOTHING;
\endif

-- =====================================================
-- In-transaction verification.
-- It runs BEFORE the COMMIT because every staging table is declared
-- ON COMMIT DROP and would be gone afterwards.
--
-- Four things are established here, in this order:
--   1. every staged row belongs to the Default Tenant;
--   2. no mandatory staging table came back empty;
--   3. which staged rows did not land, named the way an operator can look
--      them up;
--   4. whether that difference is allowed to COMMIT.
-- =====================================================

-- ---------------------------------------------------------------------
-- Guard 1 / the staged data belongs to the Default Tenant
-- ---------------------------------------------------------------------
-- TenantId is NOT a foreign key in this model. No HasForeignKey in the
-- snapshot names Tenant as a principal table, so nothing in Postgres rejects
-- a row carrying a second tenant's id. EF hides those rows with
-- HasQueryFilter(x => _context.IsSuperAdmin || x.TenantId == _context.TenantId)
-- instead, and HttpContextService reads TenantId from a JWT claim. A row
-- from another tenant therefore loads without complaint and then becomes
-- unreachable: it is in the table and no ordinary request will ever return
-- it. 01-extract.sql Section A2 prints the per-tenant distribution for
-- exactly this reason - if that inventory shows more than one tenant, stop,
-- do not load.
--
-- All twelve staging tables are checked, optional ones included. A block
-- that was not requested never created its staging table, so the loop skips
-- those with to_regclass rather than reading a table that does not exist.
DO $guard_tenant$
DECLARE
    _t      text;
    _bad    bigint;
    _ids    text;
    _report text := '';
BEGIN
    FOREACH _t IN ARRAY ARRAY[
        'stg_user', 'stg_owner', 'stg_reseller', 'stg_reseller_owner',
        'stg_store', 'stg_store_module', 'stg_store_role_feature',
        'stg_store_user', 'stg_user_role',
        'stg_product_category', 'stg_product', 'stg_channel_exchange_rate'
    ] LOOP
        CONTINUE WHEN to_regclass('pg_temp.' || _t) IS NULL;

        -- IS DISTINCT FROM, not <>. A NULL TenantId is not the default tenant
        -- either, and a plain comparison would let every NULL through.
        EXECUTE format(
            'SELECT count(*), string_agg(DISTINCT "TenantId"::text, '', '' ORDER BY "TenantId"::text)
               FROM %I
              WHERE "TenantId" IS DISTINCT FROM %L',
            _t, 'b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8')
          INTO _bad, _ids;

        CONTINUE WHEN _bad = 0;
        _report := _report || format(E'\n  %-25s %s row(s)   TenantId: %s', _t, _bad, _ids);
    END LOOP;

    IF _report <> '' THEN
        RAISE EXCEPTION
            'Staged rows do not belong to the Default Tenant (b58bf718-c4ed-4ee9-a958-bb5a5db4f7e8):% Nothing in Postgres rejects this, because TenantId is not a foreign key - these rows would commit and then stay invisible to every request whose query filter matches on TenantId. Refusing to COMMIT. Discard prod-to-test/data/, re-run 01-extract.sql and stop if its Section A2 inventory is not single-tenant, then run this script again.',
            _report;
    END IF;
END
$guard_tenant$;

-- ---------------------------------------------------------------------
-- Guard 2 / no mandatory staging table came back empty
-- ---------------------------------------------------------------------
-- An empty staging table is indistinguishable from a successful load of zero
-- rows, and the count comparison below would report 0 = 0 and call it clean.
-- The nine mandatory tables cannot legitimately be empty - moving them is
-- the entire point of the procedure. The three optional tables are excluded
-- on purpose: a store with no products really does produce an empty
-- 11-product.csv, and refusing that case would be wrong.
DO $guard_empty$
DECLARE
    _t   text;
    _n   bigint;
    _bad text;
BEGIN
    FOREACH _t IN ARRAY ARRAY[
        'stg_user', 'stg_owner', 'stg_reseller', 'stg_reseller_owner',
        'stg_store', 'stg_store_module', 'stg_store_role_feature',
        'stg_store_user', 'stg_user_role'
    ] LOOP
        EXECUTE format('SELECT count(*) FROM %I', _t) INTO _n;
        CONTINUE WHEN _n > 0;
        _bad := coalesce(_bad || ', ', '') || _t;
    END LOOP;

    IF _bad IS NOT NULL THEN
        RAISE EXCEPTION
            'These mandatory staging tables are empty: %. A load that moves nothing is not a successful load, and zero staged rows would pass the count comparison below unnoticed. The usual cause is a truncated or header-only CSV in prod-to-test/data/, or a psql \copy that read a different file than intended. Re-run 01-extract.sql and read its COPY row counts before trying again.',
            _bad;
    END IF;
END
$guard_empty$;

-- ---------------------------------------------------------------------
-- Volume / staged rows against rows actually present, per table
-- ---------------------------------------------------------------------
-- This is the compact view: it answers "how much moved" and makes a missing
-- row visible as a number. The named list below answers "which row", which
-- is the question an operator can actually act on. A difference here is
-- expected on a re-run and is fatal on a first run; the verdict section
-- below is where that distinction is enforced.
\echo '--- volume: staged rows vs rows present in the target ---'
SELECT 'User' AS table_name,
       (SELECT COUNT(*) FROM stg_user)                                              AS staged_rows,
       (SELECT COUNT(*) FROM "User" u WHERE u."Id" IN (SELECT "Id" FROM stg_user))  AS present_rows
UNION ALL SELECT 'Owner',
       (SELECT COUNT(*) FROM stg_owner),
       (SELECT COUNT(*) FROM "Owner" o WHERE o."Id" IN (SELECT "Id" FROM stg_owner))
UNION ALL SELECT 'ReSeller',
       (SELECT COUNT(*) FROM stg_reseller),
       (SELECT COUNT(*) FROM "ReSeller" r WHERE r."Id" IN (SELECT "Id" FROM stg_reseller))
UNION ALL SELECT 'ReSellerOwner',
       (SELECT COUNT(*) FROM stg_reseller_owner),
       (SELECT COUNT(*) FROM "ReSellerOwner" ro WHERE (ro."ReSellerId", ro."OwnerId") IN (SELECT "ReSellerId", "OwnerId" FROM stg_reseller_owner))
UNION ALL SELECT 'Store',
       (SELECT COUNT(*) FROM stg_store),
       (SELECT COUNT(*) FROM "Store" s WHERE s."Id" IN (SELECT "Id" FROM stg_store))
UNION ALL SELECT 'StoreModule',
       (SELECT COUNT(*) FROM stg_store_module),
       (SELECT COUNT(*) FROM "StoreModule" sm WHERE (sm."StoreId", sm."ModuleId") IN (SELECT "StoreId", "ModuleId" FROM stg_store_module))
UNION ALL SELECT 'StoreRoleFeature',
       (SELECT COUNT(*) FROM stg_store_role_feature),
       (SELECT COUNT(*) FROM "StoreRoleFeature" srf WHERE (srf."StoreId", srf."RoleId", srf."FeatureId") IN (SELECT "StoreId", "RoleId", "FeatureId" FROM stg_store_role_feature))
UNION ALL SELECT 'StoreUser',
       (SELECT COUNT(*) FROM stg_store_user),
       (SELECT COUNT(*) FROM "StoreUser" su WHERE (su."UserId", su."StoreId") IN (SELECT "UserId", "StoreId" FROM stg_store_user))
UNION ALL SELECT 'UserRole',
       (SELECT COUNT(*) FROM stg_user_role),
       (SELECT COUNT(*) FROM "UserRole" ur WHERE (ur."UserId", ur."RoleId") IN (SELECT "UserId", "RoleId" FROM stg_user_role))
ORDER BY 1;

-- ---------------------------------------------------------------------
-- Named report / every staged row that did NOT land
-- ---------------------------------------------------------------------
-- ON CONFLICT DO NOTHING skips a row without a word and psql still exits 0,
-- so this is the only place a skipped row is ever visible. The rows are
-- named the way an operator can look them up - a login, a store name, a
-- Gestor - because a bare uuid in a log is not recognisable. The last
-- column names the index that could have caused the skip, because "the row
-- is already there" and "the row was lost to a unique index on a different
-- table" need opposite fixes.
--
-- A foreign key does not catch any of this. It only fires when a CHILD row
-- loses its parent, so a parent row that is skipped takes its own children
-- down with it and the transaction dies - but a User with no Owner, no
-- ReSeller, no StoreUser and no UserRole has no dependents at all, so
-- nothing fires, the transaction commits, and the account is simply absent
-- from test.
--
-- This report covers ALL TWELVE tables, the three optional ones included.
-- Leaving them out would have been easy to argue for - a store with no
-- products legitimately produces an empty 11-product.csv - but that is a
-- different question from this one. "Zero rows was expected" is answered by
-- the empty-staging-table guard above, which keeps its nine mandatory tables.
-- "A row that was staged did not land" has no excuse in any table: a
-- truncated CSV, a primary key collision or a unique index elsewhere all
-- drop a product or a category exactly as silently as they drop a user, and
-- the verdict block would still have printed OK. The three optional arms are
-- appended as separate INSERTs because their staging tables do not exist
-- unless their block ran, and a query that names a missing table is a parse
-- error, not an empty result.
--
-- An empty result here is the good case.
CREATE TEMP TABLE load_not_landed ON COMMIT DROP AS
SELECT 'User' AS table_name,
       'Login=' || coalesce(u."Login", '<null>') AS row_identity,
       'FullName=' || coalesce(u."FullName", '<null>')
           || '  Email=' || coalesce(u."Email", '<null>')
           || '  IsActive=' || u."IsActive"::text AS detail,
       'User."Id" (a re-run over an existing row) or the unique index User."Login" (a different account already holds this login, so the migrated user is dropped)' AS why_it_did_not_land
  FROM stg_user u
 WHERE NOT EXISTS (SELECT 1 FROM "User" x WHERE x."Id" = u."Id")
UNION ALL
SELECT 'Owner',
       'UserId=' || o."UserId"::text,
       'Login=' || coalesce(ousr."Login", '<no User row for this UserId>')
           || '  Description=' || coalesce(o."Description", '<null>'),
       'Owner."Id" (a re-run over an existing row) or the unique index Owner."UserId" (another Owner row already points at this User, so the Owner is dropped and the Gestor that needs it sees nothing)'
  FROM stg_owner o
  LEFT JOIN "User" ousr ON ousr."Id" = o."UserId"
 WHERE NOT EXISTS (SELECT 1 FROM "Owner" x WHERE x."Id" = o."Id")
UNION ALL
SELECT 'ReSeller',
       'UserId=' || r."UserId"::text,
       'Login=' || coalesce(rusr."Login", '<no User row for this UserId>')
           || '  Approved=' || r."Approved"::text
           || '  Description=' || coalesce(r."Description", '<null>'),
       'ReSeller."Id" (a re-run over an existing row) or the unique index ReSeller."UserId" (another ReSeller row already points at this User, so this Gestor is dropped)'
  FROM stg_reseller r
  LEFT JOIN "User" rusr ON rusr."Id" = r."UserId"
 WHERE NOT EXISTS (SELECT 1 FROM "ReSeller" x WHERE x."Id" = r."Id")
UNION ALL
SELECT 'ReSellerOwner',
       'GestorId=' || ro."ReSellerId"::text || '  OwnerId=' || ro."OwnerId"::text,
       'GestorLogin=' || coalesce(rors."Login", '<the Gestor itself is missing - look for it in the ReSeller row above>')
           || '  OwnerLogin=' || coalesce(rou."Login", '<no User row for this OwnerId>'),
       'the primary key (ReSellerId, OwnerId) on a re-run, or the unique index ReSellerOwner."OwnerId" (this Owner is already linked to a DIFFERENT Gestor, so the migrated Gestor lands with an empty owner list - a link disappears, not just a row)'
  FROM stg_reseller_owner ro
  LEFT JOIN "ReSeller" rors ON rors."Id" = ro."ReSellerId"
  LEFT JOIN "User"    rou  ON rou."Id"  = ro."OwnerId"
 WHERE NOT EXISTS (SELECT 1 FROM "ReSellerOwner" x
                    WHERE x."ReSellerId" = ro."ReSellerId" AND x."OwnerId" = ro."OwnerId")
UNION ALL
SELECT 'Store',
       'Name=' || coalesce(s."Name", '<null>') || '  Id=' || s."Id"::text,
       'OwnerId=' || s."OwnerId"::text
           || '  StorePlanId=' || s."StorePlanId"::text
           || '  IsActive=' || s."IsActive"::text,
       'Store."Id" only. This table carries no unique index besides its primary key, so any difference here is a re-run over an existing row.'
  FROM stg_store s
 WHERE NOT EXISTS (SELECT 1 FROM "Store" x WHERE x."Id" = s."Id")
UNION ALL
SELECT 'StoreModule',
       'Store=' || coalesce(smst."Name", '<Store ' || sm."StoreId"::text || ' is not in the target>')
           || '  Module=' || coalesce(smm."Name", '<Module ' || sm."ModuleId"::text || ' is missing from the catalog>'),
       'StoreId=' || sm."StoreId"::text
           || '  ModuleId=' || sm."ModuleId"::text
           || '  Price=' || sm."Price"::text,
       'the primary key (StoreId, ModuleId) only. This table carries no unique index besides it, so any difference here is a re-run over an existing row.'
  FROM stg_store_module sm
  LEFT JOIN "Store"  smst ON smst."Id" = sm."StoreId"
  LEFT JOIN "Module" smm  ON smm."Id"  = sm."ModuleId"
 WHERE NOT EXISTS (SELECT 1 FROM "StoreModule" x
                    WHERE x."StoreId" = sm."StoreId" AND x."ModuleId" = sm."ModuleId")
UNION ALL
SELECT 'StoreRoleFeature',
       'Store='    || coalesce(srfst."Name", '<Store '   || srf."StoreId"   || ' is not in the target>')
           || '  Role='    || coalesce(srfro."Name", '<Role '   || srf."RoleId"   || ' is missing from the catalog>')
           || '  Feature=' || coalesce(srffe."Name", '<Feature ' || srf."FeatureId" || ' is missing from the catalog>'),
       'StoreId=' || srf."StoreId"::text
           || '  RoleId=' || srf."RoleId"::text
           || '  FeatureId=' || srf."FeatureId"::text,
       'the primary key (StoreId, RoleId, FeatureId) only. This table carries no unique index besides it, so any difference here is a re-run over an existing row.'
  FROM stg_store_role_feature srf
  LEFT JOIN "Store"   srfst ON srfst."Id" = srf."StoreId"
  LEFT JOIN "Role"    srfro ON srfro."Id" = srf."RoleId"
  LEFT JOIN "Feature" srffe ON srffe."Id" = srf."FeatureId"
 WHERE NOT EXISTS (SELECT 1 FROM "StoreRoleFeature" x
                    WHERE x."StoreId" = srf."StoreId"
                      AND x."RoleId" = srf."RoleId"
                      AND x."FeatureId" = srf."FeatureId")
UNION ALL
SELECT 'StoreUser',
       'Login=' || coalesce(suu."Login", '<no User row for this UserId>')
           || '  Store=' || coalesce(sus."Name", '<Store ' || su."StoreId"::text || ' is not in the target>'),
       'UserId=' || su."UserId"::text
           || '  StoreId=' || su."StoreId"::text
           || '  IsActive=' || su."IsActive"::text,
       'the primary key (UserId, StoreId) on a re-run, or the unique index StoreUser."UserId" (this employee is already a member of ANOTHER store, so the second, legitimate membership is dropped)'
  FROM stg_store_user su
  LEFT JOIN "User"  suu ON suu."Id" = su."UserId"
  LEFT JOIN "Store" sus ON sus."Id" = su."StoreId"
 WHERE NOT EXISTS (SELECT 1 FROM "StoreUser" x
                    WHERE x."UserId" = su."UserId" AND x."StoreId" = su."StoreId")
UNION ALL
SELECT 'UserRole',
       'Login=' || coalesce(uru."Login", '<no User row for this UserId>')
           || '  Role=' || coalesce(urn."Name", '<Role ' || ur."RoleId"::text || ' is missing from the catalog>'),
       'UserId=' || ur."UserId"::text
           || '  RoleId=' || ur."RoleId"::text,
       'the primary key (UserId, RoleId) only. This table carries no unique index besides it, so any difference here is a re-run over an existing row.'
  FROM stg_user_role ur
  LEFT JOIN "User" uru ON uru."Id" = ur."UserId"
  LEFT JOIN "Role" urn ON urn."Id" = ur."RoleId"
 WHERE NOT EXISTS (SELECT 1 FROM "UserRole" x
                    WHERE x."UserId" = ur."UserId" AND x."RoleId" = ur."RoleId");

-- The three optional tables. Same shape as their arms above, same key
-- columns, same contract: a row staged here and absent from the target is a
-- dropped row, and the verdict block treats it as one.
\if :act_product_category
INSERT INTO load_not_landed
SELECT 'ProductCategory',
       'Id=' || pc."Id"::text,
       'Store=' || coalesce(pcs."Name", '<Store ' || pc."StoreId"::text || ' is not in the target>')
           || '  Name=' || coalesce(pc."Name", '<null>')
           || '  IsActive=' || pc."IsActive"::text,
       'ProductCategory."Id" only. This table carries no unique index besides its primary key, so any difference here is a re-run over an existing row, or a CSV that was truncated or malformed.'
  FROM stg_product_category pc
  LEFT JOIN "Store" pcs ON pcs."Id" = pc."StoreId"
 WHERE NOT EXISTS (SELECT 1 FROM "ProductCategory" x WHERE x."Id" = pc."Id");
\endif

\if :act_product
INSERT INTO load_not_landed
SELECT 'Product',
       'Id=' || p."Id"::text,
       'CategoryId=' || p."CategoryId"::text
           || '  Name=' || coalesce(p."Name", '<null>')
           || '  Price=' || p."Price"::text
           || '  IsActive=' || p."IsActive"::text,
       'Product."Id" only. This table carries no unique index besides its primary key, so any difference here is a re-run over an existing row, or a CSV that was truncated or malformed.'
  FROM stg_product p
 WHERE NOT EXISTS (SELECT 1 FROM "Product" x WHERE x."Id" = p."Id");
\endif

\if :act_channel_exchange_rate
INSERT INTO load_not_landed
SELECT 'ChannelExchangeRate',
       'Id=' || cer."Id"::text,
       'Store=' || coalesce(cers."Name", '<Store ' || cer."StoreId"::text || ' is not in the target>')
           || '  Currency=' || coalesce(cer."Currency", '<null>')
           || '  Value=' || cer."Value"::text,
       'ChannelExchangeRate."Id" only. This table carries no unique index besides its primary key, so any difference here is a re-run over an existing row, or a CSV that was truncated or malformed.'
  FROM stg_channel_exchange_rate cer
  LEFT JOIN "Store" cers ON cers."Id" = cer."StoreId"
 WHERE NOT EXISTS (SELECT 1 FROM "ChannelExchangeRate" x WHERE x."Id" = cer."Id");
\endif

\echo '--- staged rows that did not land (no rows listed means every staged row is present) ---'
SELECT * FROM load_not_landed ORDER BY table_name, row_identity;

-- ---------------------------------------------------------------------
-- Verdict / refuse to COMMIT while a staged row is missing
-- ---------------------------------------------------------------------
-- The gate the header promises. A difference between the two counts is only
-- harmless on a re-run, where the row is already present and the skip was
-- correct. On a first run the same difference is silent data loss, and once
-- the COMMIT is done nothing in this procedure can detect it again.
--
-- -v allow_resume=1 is the deliberate way to accept the difference, and it
-- is the correct answer on a genuine re-run. It is the wrong answer the
-- first time through, which is why it is opt-in and announces itself.
--
-- \gset hands over whatever SELECT printed, so the boolean is cast to text
-- and arrives as the literal string "true" or "false". The psql docs say the
-- \if argument is interpolated and then "evaluated like the value of an
-- on/off option variable", of which true/false/1/0/on/off/yes/no (and
-- unambiguous prefixes) are valid - so a boolean cast to text is always a
-- legal argument, whereas an expression that does not evaluate either way
-- "will generate a warning and be treated as false".
SELECT EXISTS (SELECT 1 FROM load_not_landed)::text AS any_row_did_not_land
\gset

\if :any_row_did_not_land
  \if :act_allow_resume
    \echo 'NOTICE: -v allow_resume=1 is set, so the rows listed above will NOT stop the COMMIT.'
    \echo '         Confirm you read that list, and that every entry is a row the target already had.'
  \else
    DO $assert$
    BEGIN
        RAISE EXCEPTION
            '% staged row(s) did not land; the report above names every one of them. Refusing to COMMIT while the transaction can still be rolled back. If this is a genuine re-run and every entry is a row the target already holds with the right values, re-run this script with -v allow_resume=1. Do NOT do that on a first run: there a difference is data loss, and after the COMMIT nothing in this procedure can detect it again.',
            (SELECT count(*) FROM load_not_landed);
    END
    $assert$;
  \endif
\else
  \echo 'OK: every staged row of all twelve tables is present in the target.'
\endif

-- =====================================================================
-- The record the rollback reads: the keys THIS RUN actually inserted
-- =====================================================================
-- WHY THIS BLOCK EXISTS, and why the extract CSVs cannot do this job
--
-- 01-extract.sql copies EVERY row of all twelve tables. It has no WHERE, no
-- seed exclusion and no tenant filter, on purpose, because the inventory it
-- prints has to show what production really holds. So the staged data is not
-- "the rows to migrate"; it is "every row production has". Some of those
-- rows test ALREADY HAD before this load ran, and the ones that always do
-- are the ones the migrations seeded in BOTH databases with the same fixed
-- identifiers - the superadmin User 38b96d85-bf75-41ca-bfd7-796e7fe0ebc8
-- and its UserRole row. Any of them, named or not.
--
-- A rollback driven from those CSVs therefore deletes rows this migration
-- never created, and the seeded superadmin does not come back: the migration
-- that wrote it is already recorded as applied. So the CSVs are not the
-- record of what this run did, and the README says so in as many words.
--
-- WHAT IS WRITTEN
--
--   inserted(t) = staged keys that are in the target now, minus pre_<t>
--
-- pre_<t> is the set the target already held, captured above immediately
-- before the insert, so the subtraction is exact and needs no list of known
-- seed identifiers. A staged key that was already there is excluded; a
-- staged key that is there now and was not is one this run wrote. The two
-- cases are indistinguishable from the target table alone, which is the
-- whole point: this is captured where the distinction still exists.
--
-- The record is the KEY COLUMNS ONLY - the same ones the rollback's DELETE
-- predicates use. No payload, no password hash, no encrypted envelope, and
-- the header names the columns. The file name repeats the extract's table
-- number, so "which table" is never in doubt.
--
-- WHEN IT IS WRITTEN
--
-- Here, after every guard, immediately before the COMMIT. A run that stops
-- at a guard never reaches this block, and a run that never reaches the
-- COMMIT wrote nothing - so a record on disk means "this run committed".
-- \copy writes on the client, from the same transaction, so the file and the
-- committed rows agree. If the COMMIT itself were ever to fail, the record
-- would name rows that are not there; a rollback then deletes nothing, which
-- is harmless. The reverse cannot happen: a row this run inserted is always
-- in the record.
--
-- The three optional tables get a header-only file when their block was off,
-- so the record is always twelve files and the rollback needs no flags.
\echo '--- writing the inserted-key record (prod-to-test/data/NN-<table>-inserted.csv) ---'

\copy (SELECT s."Id" FROM stg_user s WHERE EXISTS (SELECT 1 FROM "User" x WHERE x."Id" = s."Id") AND NOT EXISTS (SELECT 1 FROM pre_user p WHERE p."Id" = s."Id") ORDER BY s."Id") TO 'prod-to-test/data/01-user-inserted.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT s."Id" FROM stg_owner s WHERE EXISTS (SELECT 1 FROM "Owner" x WHERE x."Id" = s."Id") AND NOT EXISTS (SELECT 1 FROM pre_owner p WHERE p."Id" = s."Id") ORDER BY s."Id") TO 'prod-to-test/data/02-owner-inserted.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT s."Id" FROM stg_reseller s WHERE EXISTS (SELECT 1 FROM "ReSeller" x WHERE x."Id" = s."Id") AND NOT EXISTS (SELECT 1 FROM pre_reseller p WHERE p."Id" = s."Id") ORDER BY s."Id") TO 'prod-to-test/data/03-reseller-inserted.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT s."ReSellerId", s."OwnerId" FROM stg_reseller_owner s WHERE EXISTS (SELECT 1 FROM "ReSellerOwner" x WHERE x."ReSellerId" = s."ReSellerId" AND x."OwnerId" = s."OwnerId") AND NOT EXISTS (SELECT 1 FROM pre_reseller_owner p WHERE p."ReSellerId" = s."ReSellerId" AND p."OwnerId" = s."OwnerId") ORDER BY s."ReSellerId", s."OwnerId") TO 'prod-to-test/data/04-reseller-owner-inserted.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT s."Id" FROM stg_store s WHERE EXISTS (SELECT 1 FROM "Store" x WHERE x."Id" = s."Id") AND NOT EXISTS (SELECT 1 FROM pre_store p WHERE p."Id" = s."Id") ORDER BY s."Id") TO 'prod-to-test/data/05-store-inserted.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT s."StoreId", s."ModuleId" FROM stg_store_module s WHERE EXISTS (SELECT 1 FROM "StoreModule" x WHERE x."StoreId" = s."StoreId" AND x."ModuleId" = s."ModuleId") AND NOT EXISTS (SELECT 1 FROM pre_store_module p WHERE p."StoreId" = s."StoreId" AND p."ModuleId" = s."ModuleId") ORDER BY s."StoreId", s."ModuleId") TO 'prod-to-test/data/06-store-module-inserted.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT s."StoreId", s."RoleId", s."FeatureId" FROM stg_store_role_feature s WHERE EXISTS (SELECT 1 FROM "StoreRoleFeature" x WHERE x."StoreId" = s."StoreId" AND x."RoleId" = s."RoleId" AND x."FeatureId" = s."FeatureId") AND NOT EXISTS (SELECT 1 FROM pre_store_role_feature p WHERE p."StoreId" = s."StoreId" AND p."RoleId" = s."RoleId" AND p."FeatureId" = s."FeatureId") ORDER BY s."StoreId", s."RoleId", s."FeatureId") TO 'prod-to-test/data/07-store-role-feature-inserted.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT s."UserId", s."StoreId" FROM stg_store_user s WHERE EXISTS (SELECT 1 FROM "StoreUser" x WHERE x."UserId" = s."UserId" AND x."StoreId" = s."StoreId") AND NOT EXISTS (SELECT 1 FROM pre_store_user p WHERE p."UserId" = s."UserId" AND p."StoreId" = s."StoreId") ORDER BY s."UserId", s."StoreId") TO 'prod-to-test/data/08-store-user-inserted.csv' WITH (FORMAT csv, HEADER true)
\copy (SELECT s."UserId", s."RoleId" FROM stg_user_role s WHERE EXISTS (SELECT 1 FROM "UserRole" x WHERE x."UserId" = s."UserId" AND x."RoleId" = s."RoleId") AND NOT EXISTS (SELECT 1 FROM pre_user_role p WHERE p."UserId" = s."UserId" AND p."RoleId" = s."RoleId") ORDER BY s."UserId", s."RoleId") TO 'prod-to-test/data/09-user-role-inserted.csv' WITH (FORMAT csv, HEADER true)

-- Optional tables. The WHERE false form writes the header and zero rows, so
-- an optional block that was off leaves a well-formed empty record and the
-- rollback's DELETE finds nothing instead of failing on a missing file.
\if :act_product_category
\copy (SELECT s."Id" FROM stg_product_category s WHERE EXISTS (SELECT 1 FROM "ProductCategory" x WHERE x."Id" = s."Id") AND NOT EXISTS (SELECT 1 FROM pre_product_category p WHERE p."Id" = s."Id") ORDER BY s."Id") TO 'prod-to-test/data/10-product-category-inserted.csv' WITH (FORMAT csv, HEADER true)
\else
\copy (SELECT NULL::uuid AS "Id" WHERE false) TO 'prod-to-test/data/10-product-category-inserted.csv' WITH (FORMAT csv, HEADER true)
\endif

\if :act_product
\copy (SELECT s."Id" FROM stg_product s WHERE EXISTS (SELECT 1 FROM "Product" x WHERE x."Id" = s."Id") AND NOT EXISTS (SELECT 1 FROM pre_product p WHERE p."Id" = s."Id") ORDER BY s."Id") TO 'prod-to-test/data/11-product-inserted.csv' WITH (FORMAT csv, HEADER true)
\else
\copy (SELECT NULL::uuid AS "Id" WHERE false) TO 'prod-to-test/data/11-product-inserted.csv' WITH (FORMAT csv, HEADER true)
\endif

\if :act_channel_exchange_rate
\copy (SELECT s."Id" FROM stg_channel_exchange_rate s WHERE EXISTS (SELECT 1 FROM "ChannelExchangeRate" x WHERE x."Id" = s."Id") AND NOT EXISTS (SELECT 1 FROM pre_channel_exchange_rate p WHERE p."Id" = s."Id") ORDER BY s."Id") TO 'prod-to-test/data/12-channel-exchange-rate-inserted.csv' WITH (FORMAT csv, HEADER true)
\else
\copy (SELECT NULL::uuid AS "Id" WHERE false) TO 'prod-to-test/data/12-channel-exchange-rate-inserted.csv' WITH (FORMAT csv, HEADER true)
\endif

-- What the record holds, per table. staged minus pre is what the target
-- already had and this run correctly left alone; landed minus that is what
-- this run wrote. A re-run over a completed load shows every file at 0,
-- which is the honest answer: nothing new was inserted.
--
-- NINE rows here, twelve files on disk, and the difference is not an
-- oversight. This summary names stg_product_category, stg_product and
-- stg_channel_exchange_rate unconditionally, and those staging tables do
-- not exist unless their block ran - the same reason the three load_not_
-- landed arms above have to be \if-guarded. Naming a missing table is a
-- parse error, so this SELECT cannot cover all twelve without becoming
-- three guarded statements and losing its one-screen shape. Nothing is
-- lost for those three: each of their \copy TO lines above printed its own
-- COPY n row count, and each wrote a (possibly header-only) file. Read the
-- record as TWELVE files, not as nine.
\echo '--- the inserted-key record: what the rollback will delete ---'
SELECT * FROM (
    SELECT 1 AS ord, 'User' AS table_name,
           (SELECT count(*) FROM pre_user)                                             AS already_in_target,
           (SELECT count(*) FROM stg_user s
             WHERE EXISTS (SELECT 1 FROM "User" x WHERE x."Id" = s."Id")
               AND NOT EXISTS (SELECT 1 FROM pre_user p WHERE p."Id" = s."Id"))       AS inserted_by_this_run
    UNION ALL SELECT 2, 'Owner',
           (SELECT count(*) FROM pre_owner),
           (SELECT count(*) FROM stg_owner s
             WHERE EXISTS (SELECT 1 FROM "Owner" x WHERE x."Id" = s."Id")
               AND NOT EXISTS (SELECT 1 FROM pre_owner p WHERE p."Id" = s."Id"))
    UNION ALL SELECT 3, 'ReSeller',
           (SELECT count(*) FROM pre_reseller),
           (SELECT count(*) FROM stg_reseller s
             WHERE EXISTS (SELECT 1 FROM "ReSeller" x WHERE x."Id" = s."Id")
               AND NOT EXISTS (SELECT 1 FROM pre_reseller p WHERE p."Id" = s."Id"))
    UNION ALL SELECT 4, 'ReSellerOwner',
           (SELECT count(*) FROM pre_reseller_owner),
           (SELECT count(*) FROM stg_reseller_owner s
             WHERE EXISTS (SELECT 1 FROM "ReSellerOwner" x WHERE x."ReSellerId" = s."ReSellerId" AND x."OwnerId" = s."OwnerId")
               AND NOT EXISTS (SELECT 1 FROM pre_reseller_owner p WHERE p."ReSellerId" = s."ReSellerId" AND p."OwnerId" = s."OwnerId"))
    UNION ALL SELECT 5, 'Store',
           (SELECT count(*) FROM pre_store),
           (SELECT count(*) FROM stg_store s
             WHERE EXISTS (SELECT 1 FROM "Store" x WHERE x."Id" = s."Id")
               AND NOT EXISTS (SELECT 1 FROM pre_store p WHERE p."Id" = s."Id"))
    UNION ALL SELECT 6, 'StoreModule',
           (SELECT count(*) FROM pre_store_module),
           (SELECT count(*) FROM stg_store_module s
             WHERE EXISTS (SELECT 1 FROM "StoreModule" x WHERE x."StoreId" = s."StoreId" AND x."ModuleId" = s."ModuleId")
               AND NOT EXISTS (SELECT 1 FROM pre_store_module p WHERE p."StoreId" = s."StoreId" AND p."ModuleId" = s."ModuleId"))
    UNION ALL SELECT 7, 'StoreRoleFeature',
           (SELECT count(*) FROM pre_store_role_feature),
           (SELECT count(*) FROM stg_store_role_feature s
             WHERE EXISTS (SELECT 1 FROM "StoreRoleFeature" x WHERE x."StoreId" = s."StoreId" AND x."RoleId" = s."RoleId" AND x."FeatureId" = s."FeatureId")
               AND NOT EXISTS (SELECT 1 FROM pre_store_role_feature p WHERE p."StoreId" = s."StoreId" AND p."RoleId" = s."RoleId" AND p."FeatureId" = s."FeatureId"))
    UNION ALL SELECT 8, 'StoreUser',
           (SELECT count(*) FROM pre_store_user),
           (SELECT count(*) FROM stg_store_user s
             WHERE EXISTS (SELECT 1 FROM "StoreUser" x WHERE x."UserId" = s."UserId" AND x."StoreId" = s."StoreId")
               AND NOT EXISTS (SELECT 1 FROM pre_store_user p WHERE p."UserId" = s."UserId" AND p."StoreId" = s."StoreId"))
    UNION ALL SELECT 9, 'UserRole',
           (SELECT count(*) FROM pre_user_role),
           (SELECT count(*) FROM stg_user_role s
             WHERE EXISTS (SELECT 1 FROM "UserRole" x WHERE x."UserId" = s."UserId" AND x."RoleId" = s."RoleId")
               AND NOT EXISTS (SELECT 1 FROM pre_user_role p WHERE p."UserId" = s."UserId" AND p."RoleId" = s."RoleId"))
) AS record ORDER BY ord;

-- One COMMIT for the whole load. If any statement above failed, psql has
-- already stopped (ON_ERROR_STOP) and the transaction is rolled back, so
-- the target is left exactly as it was.
COMMIT;
