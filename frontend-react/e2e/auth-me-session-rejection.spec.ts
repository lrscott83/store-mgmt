import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { mintSuperAdmin } from './support/superadmin-session';
import type { SuperAdminSnapshot } from './support/superadmin-session';
import { mutateAuthModel } from './support/auth-storage';
import { LoginPage } from './support/login-page';

/**
 * S7 — auth/me session-rejection scenarios
 *
 * 6 scenarios:
 *   1. User inactive     → online: logout  | offline: retain
 *   2. Store inactive    → online: logout  | offline: retain
 *   3. Owner inactive    → online: logout  | offline: retain
 *   4. Token blacklisted → online: logout  | offline: retain
 *   5. Token expired     → logout (client-side check, no network needed)
 *   6. Reactivate + re-login → session restored
 *
 * Each test invalidates the localStorage cache so getUserByToken() must call
 * getMe() (see auth-me-deleted-user.spec.ts for the full explanation).
 *
 * Backend behavior (GetMeQueryHandler + ClaimsTransformerService):
 *   - User inactive  → 404 + AccountInactive → SessionRejectedError → logout ✅
 *   - Store inactive → 404 + StoreErrors.Inactive → SessionRejectedError → logout ✅ (gap closed — GetMeQuery.cs:81)
 *   - Owner inactive → 404 + OwnerErrors.Inactive → SessionRejectedError → logout ✅ (gap closed — GetMeQuery.cs:89)
 *   - Token blacklisted → auth middleware → 401 → isSessionRejection → logout ✅
 *   - Token expired → auth-store.ts checks expiresIn client-side → logout ✅
 *   - Reactivate + re-login → new token issued → session restored ✅
 */

const DB_CONFIG = {
  host: '127.0.0.1',
  port: 5432,
  database: 'smca_test',
  user: 'postgres',
  password: 'postgres',
  connectionTimeoutMillis: 5000,
};

async function withDb(fn: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client(DB_CONFIG);
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}

/** Set user IsActive = false */
async function deactivateUser(login: string): Promise<void> {
  await withDb(async (c) => {
    await c.query('UPDATE "User" SET "IsActive" = false WHERE "Login" = $1', [login]);
  });
}

/** Set store IsActive = false for the user's store */
async function deactivateStore(login: string): Promise<void> {
  await withDb(async (c) => {
    await c.query(
      `UPDATE "Store" SET "IsActive" = false
       FROM "Owner" o, "User" u
       WHERE "Store"."OwnerId" = o."Id" AND o."UserId" = u."Id"
         AND u."Login" = $1`,
      [login],
    );
  });
}

/** Set owner IsActive = false */
async function deactivateOwner(login: string): Promise<void> {
  await withDb(async (c) => {
    await c.query(
      `UPDATE "Owner" SET "IsActive" = false
       FROM "User" u WHERE "Owner"."UserId" = u."Id" AND u."Login" = $1`,
      [login],
    );
  });
}

/** Blacklist the user's current token by deactivating (triggers BlacklistCurrentTokenAsync on next /me) */
async function blacklistTokenViaDeactivation(login: string): Promise<void> {
  // Same as deactivateUser — the GetMeQueryHandler calls BlacklistCurrentTokenAsync
  // when it sees IsActive=false, then returns 404.
  await deactivateUser(login);
}

/**
 * Apply a snapshot but force getUserByToken() to call getMe() on next load.
 * Desyncs ONLY AUTH_MODEL.authToken (same pattern as login.spec.ts T2/T3, D3)
 * so the cached profile keeps its SuperAdmin claims and the guards let the
 * best-effort user through — the getMe() verdict alone decides the session.
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

// ─── Serial: all tests share one minted SuperAdmin ──────────────────────

test.describe.serial('auth/me — session-rejection scenarios', () => {
  test.describe.configure({ timeout: 180_000 });

  test('setup: mint SuperAdmin and capture session', async ({ browser }) => {
    superAdmin = await mintSuperAdmin(browser);
    expect(superAdmin.identity).toBeDefined();
    expect(superAdmin.homePath).toMatch(/\/(admin|sales)/);
  });

  // ─── Scenario 1: User inactive ────────────────────────────────────────
  // Runs AFTER scenarios 2/3 by design: deactivating the user blacklists
  // the shared snapshot's token (BlacklistCurrentTokenAsync), and no later
  // scenario can un-burn it — the gap-documenting scenarios need the token
  // clean, so they go first.

  // ─── Scenario 2: Store inactive ───────────────────────────────────────

  test('2a — online + store inactive: logout', async ({ page }) => {
    // GetMeQueryHandler DOES check Store.IsActive (GetMeQuery.cs:81) — an
    // inactive store answers 404, which isSessionRejection treats as a
    // session verdict → logout. The old "backend gap" comment and the
    // inverted assertion documented a gap that has since been closed.
    await deactivateStore(superAdmin.identity.login);

    await applySnapshotAndForceMeRefresh(page, superAdmin);
    await page.goto(superAdmin.homePath);

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await page.close();
  });

  test('2b — offline + store inactive: retain session', async ({ page }) => {
    await applySnapshotAndForceMeRefresh(page, superAdmin);
    await page.route('**/v1/auth/me', (route) => route.abort('connectionrefused'));
    await page.goto(superAdmin.homePath);
    await page.waitForTimeout(3000);

    expect(new URL(page.url()).pathname).not.toBe('/login');
    await page.unroute('**/v1/auth/me');
    await page.close();
  });

  // ─── Scenario 3: Owner inactive ───────────────────────────────────────

  test('3a — online + owner inactive: logout', async ({ page }) => {
    // GetMeQueryHandler DOES check Owner.IsActive (GetMeQuery.cs:89) — same
    // closed gap as store-inactive: 404 → session rejection → logout.
    await deactivateOwner(superAdmin.identity.login);

    await applySnapshotAndForceMeRefresh(page, superAdmin);
    await page.goto(superAdmin.homePath);

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await page.close();
  });

  test('3b — offline + owner inactive: retain session', async ({ page }) => {
    await applySnapshotAndForceMeRefresh(page, superAdmin);
    await page.route('**/v1/auth/me', (route) => route.abort('connectionrefused'));
    await page.goto(superAdmin.homePath);
    await page.waitForTimeout(3000);

    expect(new URL(page.url()).pathname).not.toBe('/login');
    await page.unroute('**/v1/auth/me');
    await page.close();
  });

  // ─── Scenario 4: Token blacklisted (via user deactivation) ────────────

  test('4a — online + token blacklisted: logout', async ({ page }) => {
    // Deactivating the user triggers BlacklistCurrentTokenAsync in GetMeQueryHandler.
    // The next request with the blacklisted token gets 401 from auth middleware.
    await blacklistTokenViaDeactivation(superAdmin.identity.login);

    await applySnapshotAndForceMeRefresh(page, superAdmin);
    await page.goto(superAdmin.homePath);

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await page.close();
  });

  test('4b — offline + token blacklisted: retain session', async ({ page }) => {
    await applySnapshotAndForceMeRefresh(page, superAdmin);
    await page.route('**/v1/auth/me', (route) => route.abort('connectionrefused'));
    await page.goto(superAdmin.homePath);
    await page.waitForTimeout(3000);

    expect(new URL(page.url()).pathname).not.toBe('/login');
    await page.unroute('**/v1/auth/me');
    await page.close();
  });

  // ─── Scenario 1: User inactive (moved after 2/3 — blacklists the token) ──

  test('1a — online + user inactive: logout', async ({ page }) => {
    await deactivateUser(superAdmin.identity.login);

    await applySnapshotAndForceMeRefresh(page, superAdmin);
    await page.goto(superAdmin.homePath);

    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await page.close();
  });

  test('1b — offline + user inactive: retain session', async ({ page }) => {
    await applySnapshotAndForceMeRefresh(page, superAdmin);
    await page.route('**/v1/auth/me', (route) => route.abort('connectionrefused'));
    await page.goto(superAdmin.homePath);
    await page.waitForTimeout(3000);

    expect(new URL(page.url()).pathname).not.toBe('/login');
    await page.unroute('**/v1/auth/me');
    await page.close();
  });

  // ─── Scenario 5: Token expired (client-side check) ────────────────────

  test('5 — expired token: logout without network call', async ({ page }) => {
    // auth-store.ts checks `auth.expiresIn <= Date.now()` BEFORE calling getMe().
    // This is a pure client-side check — no backend call needed.
    // We set expiresIn to a past timestamp to simulate an expired token.
    await page.goto('/login');
    await page.evaluate((entries) => {
      for (const { name, value } of entries) {
        window.localStorage.setItem(name, value);
      }
    }, superAdmin.localStorage);

    // Overwrite AUTH_MODEL with an expired expiresIn (1 hour ago).
    // mutateAuthModel scans for the version-suffixed key — the literal
    // 'AUTH_MODEL' key this test used before does not exist (storage-keys.ts
    // prefixes it), so the old mutation wrote an orphan the app never read.
    await mutateAuthModel(page, { expiresIn: Date.now() - 3_600_000 });

    // Navigate — getUserByToken() sees expired token → logout() → /login
    await page.goto(superAdmin.homePath);

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await page.close();
  });

  // ─── Scenario 6: Reactivate user + re-login ──────────────────────────

  test('6 — reactivate user then re-login: session restored', async ({
    page,
    browser,
  }) => {
    // Step 1: Deactivate the user → forces logout on next load
    await deactivateUser(superAdmin.identity.login);

    await applySnapshotAndForceMeRefresh(page, superAdmin);
    await page.goto(superAdmin.homePath);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    // Step 2: Reactivate EVERYTHING scenarios 1-3 deactivated — IsValidUserAsync
    // rejects the login when the user, its store, OR its owner is inactive
    // (AuthenticationService.cs:68-77, mapped to the same 403 + ACCOUNT_INACTIVE
    // banner by LoginCommand.cs:142-143), so reactivating the user alone would
    // still bounce the re-login off the deactivated store/owner.
    await withDb(async (c) => {
      await c.query('UPDATE "User" SET "IsActive" = true WHERE "Login" = $1', [
        superAdmin.identity.login,
      ]);
      await c.query(
        `UPDATE "Store" SET "IsActive" = true
         FROM "Owner" o, "User" u
         WHERE "Store"."OwnerId" = o."Id" AND o."UserId" = u."Id"
           AND u."Login" = $1`,
        [superAdmin.identity.login],
      );
      await c.query(
        `UPDATE "Owner" SET "IsActive" = true
         FROM "User" u WHERE "Owner"."UserId" = u."Id" AND u."Login" = $1`,
        [superAdmin.identity.login],
      );
    });

    // Step 3: Re-login with the same credentials. LoginPage's fill() anchors
    // on the submit button and re-fills until both values stick (guards
    // against the async guestOnlyLoader racing the fill) — the raw
    // getByLabel(/login/i) selector this test was born with never matched
    // the Spanish UI labels ("Usuario"/"Contraseña").
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.fill(superAdmin.identity);
    await loginPage.submit();

    // Should land on the home page (admin or sales)
    await expect(page).toHaveURL(/\/admin\/|\/sales\//, { timeout: 15_000 });
    await page.close();
  });
});
