import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { mintSuperAdmin } from './support/superadmin-session';
import type { SuperAdminSnapshot } from './support/superadmin-session';
import { mutateAuthModel } from './support/auth-storage';

/**
 * S6 — auth/me session validation after user deletion
 *
 * Two scenarios:
 *   A) Online + user deleted → getMe() returns 404/succeeded:false → logout
 *   B) Offline + user deleted → getMe() network error → retain session
 *
 * Both tests share one minted SuperAdmin. The user is deleted from the DB
 * between setup and the test assertion, so the cold-boot `getUserByToken()`
 * call (auth-store.ts:120) has to call `getMe()` and gets a real verdict.
 *
 * The "trick": after minting, we clear `currentUser` from localStorage while
 * keeping `AUTH_MODEL`. This forces `getUserByToken()` past the cache-hit
 * path (auth-store.ts:137-147) into the `getMe()` branch (auth-store.ts:175).
 * On a normal page load with both keys present, `getMe()` is never called
 * because the cached profile already matches the token.
 */

const DB_CONFIG = {
  host: '127.0.0.1',
  port: 5432,
  database: 'smca_test',
  user: 'postgres',
  password: 'postgres',
  connectionTimeoutMillis: 5000,
};

/** Delete a user by their login string, cleaning up FK children first. */
async function deleteUserByLogin(login: string): Promise<void> {
  const client = new Client(DB_CONFIG);
  await client.connect();
  try {
    await client.query('BEGIN');
    // Same FK-safe order as global-teardown.ts
    const statements = [
      `DELETE FROM "StoreUsage" USING "Store" s, "Owner" o, "User" u
         WHERE "StoreUsage"."StoreId" = s."Id" AND s."OwnerId" = o."Id"
           AND o."UserId" = u."Id" AND u."Login" = $1`,
      `DELETE FROM "StorePayment" USING "Store" s, "Owner" o, "User" u
         WHERE "StorePayment"."StoreId" = s."Id" AND s."OwnerId" = o."Id"
           AND o."UserId" = u."Id" AND u."Login" = $1`,
      `DELETE FROM "StoreModule" USING "Store" s, "Owner" o, "User" u
         WHERE "StoreModule"."StoreId" = s."Id" AND s."OwnerId" = o."Id"
           AND o."UserId" = u."Id" AND u."Login" = $1`,
      `DELETE FROM "StoreRoleFeature" USING "Store" s, "Owner" o, "User" u
         WHERE "StoreRoleFeature"."StoreId" = s."Id" AND s."OwnerId" = o."Id"
           AND o."UserId" = u."Id" AND u."Login" = $1`,
      `DELETE FROM "StoreUser" USING "Store" s, "Owner" o, "User" u
         WHERE "StoreUser"."StoreId" = s."Id" AND s."OwnerId" = o."Id"
           AND o."UserId" = u."Id" AND u."Login" = $1`,
      `DELETE FROM "Store" USING "Owner" o, "User" u
         WHERE "Store"."OwnerId" = o."Id" AND o."UserId" = u."Id"
           AND u."Login" = $1`,
      `DELETE FROM "UserRole" USING "User" u
         WHERE "UserRole"."UserId" = u."Id" AND u."Login" = $1`,
      `DELETE FROM "Owner" USING "User" u
         WHERE "Owner"."UserId" = u."Id" AND u."Login" = $1`,
      `DELETE FROM "User" WHERE "Login" = $1`,
    ];
    for (const sql of statements) {
      await client.query(sql, [login]);
    }
    await client.query('COMMIT');
  } catch (cause) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw cause;
  } finally {
    await client.end();
  }
}

/**
 * Apply a snapshot but force getUserByToken() to call getMe() on the next
 * page load. Normally the cached currentUser matches the AUTH_MODEL token
 * and getMe() is skipped (auth-store.ts:147). Desyncing ONLY
 * AUTH_MODEL.authToken (same pattern as login.spec.ts T2/T3, D3) breaks the
 * cache-hit check without touching the cached profile, so the best-effort
 * user still carries its SuperAdmin claims and the route guards let it
 * through — the getMe() verdict is then the ONLY thing that decides the
 * session's fate. Deleting currentUser instead would strip the claims and
 * the guard would deny before getMe() ever answered.
 */
async function applySnapshotAndForceMeRefresh(
  page: import('@playwright/test').Page,
  snapshot: SuperAdminSnapshot,
): Promise<void> {
  await page.goto('/login');
  await page.evaluate((entries) => {
    for (const { name, value } of entries) {
      window.localStorage.setItem(name, value);
    }
  }, snapshot.localStorage);
  await mutateAuthModel(page, { authToken: 'e2e-mismatched-auth-model-token' });
}

let superAdmin: SuperAdminSnapshot;

test.describe.serial('auth/me — deleted user scenarios', () => {
  test.describe.configure({ timeout: 180_000 });

  test('setup: mint SuperAdmin and capture session', async ({ browser }) => {
    superAdmin = await mintSuperAdmin(browser);
    expect(superAdmin.identity).toBeDefined();
    expect(superAdmin.homePath).toMatch(/\/(admin|sales)/);
  });

  test('A — online + user deleted: getMe() rejects → logout', async ({
    page,
    browser,
  }) => {
    // Delete the user from the DB
    await deleteUserByLogin(superAdmin.identity.login);

    // Apply snapshot with invalidated cache so getMe() fires
    await applySnapshotAndForceMeRefresh(page, superAdmin);

    // Navigate to home — triggers initialize() → getUserByToken() → getMe()
    // getMe() gets 404 or succeeded:false → SessionRejectedError → logout()
    await page.goto(superAdmin.homePath);

    // Should be redirected to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    await page.close();
  });

  test('B — offline + user deleted: network error → retain session', async ({
    page,
    browser,
  }) => {
    // Apply snapshot with invalidated cache so getMe() fires
    await applySnapshotAndForceMeRefresh(page, superAdmin);

    // Intercept /v1/auth/me to simulate a network failure (no internet)
    await page.route('**/v1/auth/me', (route) =>
      route.abort('connectionrefused')
    );

    // Navigate to home — triggers initialize() → getUserByToken() → getMe()
    // getMe() gets a network error → NOT isSessionRejection → retains user
    await page.goto(superAdmin.homePath);
    // Give the app time to process the error
    await page.waitForTimeout(3000);

    // Should NOT be on /login — session is retained (offline resilient)
    expect(new URL(page.url()).pathname).not.toBe('/login');

    // Clean up: remove the route handler
    await page.unroute('**/v1/auth/me');

    await page.close();
  });
});
