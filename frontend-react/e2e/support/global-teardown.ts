import { Client } from 'pg';

/**
 * Deletes every `e2e-*` row this suite leaves behind, once, after the whole
 * run.
 *
 * WHY A SINGLE SWEEP AND NOT PER-SPEC: `playwright.config.ts` sets
 * `fullyParallel: true` with one worker per CPU locally. A spec that wiped
 * "the database" when it finished would delete rows the specs still running
 * are actively using — the exact hazard `e2e/README.md:103` documents for
 * the .NET suite's `ResetDataAsync`. `globalTeardown` runs when no worker is
 * left, so it is the only parallel-safe place for a prefix-wide delete. It
 * also touches zero spec files.
 *
 * The DELETE order below is copied verbatim from `e2e/README.md:121-137`,
 * which mirrors `ResetDataAsync`'s own FK order. Every FK in this schema is
 * `DeleteBehavior.Restrict`, so children MUST go first — reordering these
 * statements does not "work anyway", it throws.
 *
 * Scope: rows reachable from a `User` whose `Login` starts with `e2e-`
 * (`support/identity.ts` mints every test login that way). Migration seeds
 * and hand-made data are never matched.
 */

// Same default the README's documented backend mode uses. Override with
// E2E_DB_URL when the backend was pointed somewhere else.
const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';

/** README.md:121-137 — children first, `User` last. Order is load-bearing. */
const CLEANUP_STATEMENTS: ReadonlyArray<readonly [table: string, sql: string]> = [
  [
    'StoreUsage',
    `DELETE FROM "StoreUsage" USING "Store" s, "Owner" o, "User" u
       WHERE "StoreUsage"."StoreId" = s."Id" AND s."OwnerId" = o."Id"
         AND o."UserId" = u."Id" AND u."Login" LIKE 'e2e-%'`,
  ],
  [
    'StorePayment',
    `DELETE FROM "StorePayment" USING "Store" s, "Owner" o, "User" u
       WHERE "StorePayment"."StoreId" = s."Id" AND s."OwnerId" = o."Id"
         AND o."UserId" = u."Id" AND u."Login" LIKE 'e2e-%'`,
  ],
  [
    'StoreModule',
    `DELETE FROM "StoreModule" USING "Store" s, "Owner" o, "User" u
       WHERE "StoreModule"."StoreId" = s."Id" AND s."OwnerId" = o."Id"
         AND o."UserId" = u."Id" AND u."Login" LIKE 'e2e-%'`,
  ],
  [
    'StoreRoleFeature',
    `DELETE FROM "StoreRoleFeature" USING "Store" s, "Owner" o, "User" u
       WHERE "StoreRoleFeature"."StoreId" = s."Id" AND s."OwnerId" = o."Id"
         AND o."UserId" = u."Id" AND u."Login" LIKE 'e2e-%'`,
  ],
  [
    'StoreUser',
    `DELETE FROM "StoreUser" USING "Store" s, "Owner" o, "User" u
       WHERE "StoreUser"."StoreId" = s."Id" AND s."OwnerId" = o."Id"
         AND o."UserId" = u."Id" AND u."Login" LIKE 'e2e-%'`,
  ],
  [
    'Store',
    `DELETE FROM "Store" USING "Owner" o, "User" u
       WHERE "Store"."OwnerId" = o."Id" AND o."UserId" = u."Id"
         AND u."Login" LIKE 'e2e-%'`,
  ],
  [
    'UserRole',
    `DELETE FROM "UserRole" USING "User" u
       WHERE "UserRole"."UserId" = u."Id" AND u."Login" LIKE 'e2e-%'`,
  ],
  [
    'Owner',
    `DELETE FROM "Owner" USING "User" u
       WHERE "Owner"."UserId" = u."Id" AND u."Login" LIKE 'e2e-%'`,
  ],
  ['User', `DELETE FROM "User" WHERE "Login" LIKE 'e2e-%'`],
];

export default async function globalTeardown(): Promise<void> {
  const connectionString = process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL;
  const database = new URL(connectionString).pathname.replace(/^\//, '');
  const client = new Client({ connectionString });

  try {
    await client.connect();
  } catch (cause) {
    // A connection failure is unambiguous: the cleanup did NOT happen, and
    // silent accumulation is the whole problem this file exists to stop. Fail
    // loudly rather than let the run look clean.
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `[e2e teardown] no pude conectar a "${database}" para limpiar las filas e2e-*: ${reason}. ` +
        'Levantá PostgreSQL, o pasá E2E_DB_URL si el backend apunta a otra base. ' +
        'La corrida dejó filas sin borrar.'
    );
  }

  const deletedByTable: string[] = [];
  let total = 0;

  try {
    await client.query('BEGIN');
    for (const [table, sql] of CLEANUP_STATEMENTS) {
      const { rowCount } = await client.query(sql);
      const deleted = rowCount ?? 0;
      total += deleted;
      if (deleted > 0) deletedByTable.push(`${table}=${deleted}`);
    }
    await client.query('COMMIT');
  } catch (cause) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw cause;
  } finally {
    await client.end();
  }

  if (total === 0) {
    // NOT a hard failure: a run of a spec that registers nobody (api-health,
    // smoke) legitimately deletes zero rows, and teardown cannot tell those
    // apart from a misdirected backend. Loud enough to notice, quiet enough
    // not to fail a green run on a heuristic.
    console.warn(
      `[e2e teardown] 0 filas e2e-* borradas en "${database}". Si esta corrida registró usuarios, ` +
        'el backend está escribiendo en OTRA base — mirá la sección "Modo BD de test (smca_test)" ' +
        'del README y arrancalo con ConnectionStrings__Application.'
    );
    return;
  }

  console.log(`[e2e teardown] ${total} filas e2e-* borradas en "${database}" (${deletedByTable.join(', ')})`);
}
