import type { Browser, Page } from '@playwright/test';
import { LoginPage } from './login-page';
import { RegisterPage } from './register-page';
import { newTestIdentity, type TestIdentity } from './identity';
import { readSelectedStoreId } from './session';

/**
 * [FC-D1] SuperAdmin persona — E2E Playwright support
 * docs/testing/frontend-coverage/FC-D1.md
 *
 * Creates a SuperAdmin persona by:
 * 1. Registering a new user via the normal UI flow (creates Owner + Store)
 * 2. Promoting the user to SuperAdmin via a direct DB call (pg)
 * 3. Logging in to capture the session with isSuperAdmin=true
 *
 * The seeded SuperAdmin user ("admin") has an Argon2id password hash with
 * an unknown pepper, so we can't login as it. Instead, we register a new
 * user and promote it — same pattern as the backend E2E test helpers
 * (AuthTestHelpers.SeedActiveUserAsync).
 */

export interface SuperAdminSnapshot {
  localStorage: Array<{ name: string; value: string }>;
  identity: TestIdentity;
  selectedStoreId: string;
  homePath: string;
}

/**
 * Promotes a user to SuperAdmin by adding a SuperAdmin UserRole via direct
 * PostgreSQL connection. The E2E test database runs on localhost:5432.
 */
async function promoteToSuperAdmin(userId: string): Promise<void> {
  // Dynamic import to avoid adding pg to the main bundle
  const { Client } = await import('pg');
  const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    database: 'smca_test',
    user: 'postgres',
    password: 'postgres',
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    // Check if user already has SuperAdmin role (RoleType.SuperAdmin = 1)
    const check = await client.query(
      'SELECT 1 FROM "UserRole" WHERE "UserId" = $1 AND "RoleId" = 1',
      [userId]
    );
    if (check.rows.length === 0) {
      // Get the tenantId from the user
      const userResult = await client.query(
        'SELECT "TenantId" FROM "User" WHERE "Id" = $1',
        [userId]
      );
      const tenantId = userResult.rows[0]?.TenantId;
      if (!tenantId) {
        throw new Error(`User ${userId} has no TenantId`);
      }
      // Add SuperAdmin role (RoleType.SuperAdmin = 1)
      // UserRole has composite PK (UserId, RoleId) — no separate Id column
      await client.query(
        'INSERT INTO "UserRole" ("UserId", "RoleId", "TenantId", "IsActive", "CreatedDate", "CreatedBy") VALUES ($1, 1, $2, true, NOW(), $1)',
        [userId, tenantId]
      );
    }
  } finally {
    await client.end();
  }
}

/**
 * Reads the userId from localStorage.currentUser
 */
async function readUserId(page: Page): Promise<string> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) throw new Error('No currentUser in localStorage');
  const parsed = JSON.parse(raw) as { id?: string };
  if (!parsed.id) throw new Error('currentUser has no id');
  return parsed.id;
}

/**
 * Mints a SuperAdmin persona. Steps:
 * 1. Register a new user (costs 1 registration + 1 login)
 * 2. Promote to SuperAdmin via DB (costs 0 — just a SQL insert)
 * 3. Login again to get a JWT with SuperAdmin claims (costs 1 login)
 *
 * Total login cost: 2 (register + re-login with SuperAdmin claims).
 * The JWT contains the super_admin claim set by ClaimsTransformerService,
 * which reads the UserRole we just inserted.
 */
export async function mintSuperAdmin(browser: Browser): Promise<SuperAdminSnapshot> {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Step 1: Register
  const identity = newTestIdentity();
  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fillValidForm(identity);
  await registerPage.acceptTerms.check();
  await registerPage.submit();
  await page.waitForURL(/\/login$/);

  // Step 2: Login as the new user (to get userId from localStorage)
  const loginPage = new LoginPage(page);
  await loginPage.fill(identity);
  await loginPage.submit();
  await page.waitForURL(/\/sales\/products$/);

  // Step 3: Read userId and promote to SuperAdmin
  const userId = await readUserId(page);
  await promoteToSuperAdmin(userId);

  // Step 4: Re-login to get a fresh JWT with SuperAdmin claims
  // (ClaimsTransformerService reads UserRole from DB on each request)
  // Clear session first — otherwise guestOnlyLoader redirects away from /login
  await page.evaluate(() => localStorage.clear());
  await page.goto('/login');
  const loginPage2 = new LoginPage(page);
  await loginPage2.fill(identity);
  await loginPage2.submit();

  // SuperAdmin sees admin dashboard or sales depending on features
  await page.waitForURL(/\/admin\/|\/sales\/|\/stats\//, { timeout: 10_000 });

  const selectedStoreId = await readSelectedStoreId(page);
  const homePath = new URL(page.url()).pathname;

  // Capture snapshot
  const state = await context.storageState();
  const origin = new URL(page.url()).origin;
  const originState = state.origins.find((o) => o.origin === origin);
  if (!originState) {
    throw new Error('No localStorage captured for SuperAdmin login');
  }

  const localStorage = originState.localStorage.filter(
    (entry) =>
      entry.name !== 'lizoft.device-dek' &&
      !(entry.name.startsWith('lizoft.store-') && entry.value.startsWith('enc:v1:'))
  );

  await context.close();
  return { localStorage, identity, selectedStoreId, homePath };
}

/**
 * Restores a SuperAdmin snapshot onto a page — same pattern as
 * restoreSignedInSession() in session.ts.
 */
export async function applySuperAdminSnapshot(page: Page, snapshot: SuperAdminSnapshot): Promise<void> {
  await page.goto('/login');
  await page.evaluate((entries) => {
    for (const { name, value } of entries) {
      window.localStorage.setItem(name, value);
    }
  }, snapshot.localStorage);
  await page.goto(snapshot.homePath);
}
