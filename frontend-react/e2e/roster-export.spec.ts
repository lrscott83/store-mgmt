import { test, expect } from './support/test';
import { degradeStoreToFreePlan } from './support/store-fixture';
import { setPaymentStartDateNull } from './support/roster-expiry-seed';

/**
 * [S3-01] Exportar el roster de aprovisionamiento
 * (`docs/testing/e2e-stage-1/S3-01.md`).
 *
 * Playwright E2E assertions (observable from UI):
 * 1. Botón habilitado online (control — offline requires addInitScript
 *    which conflicts with the session fixture; full offline test is in
 *    roster-export-panel.test.tsx vitest).
 * 2. Contraseña vacía muestra error sin petición (assertion 2)
 * 3. Exactamente un GET al endpoint (assertion 3)
 * 4. Descarga roster-{storeId}.smcabundle (assertion 4)
 * 5. Contenido es ZIP (empieza con PK\x03\x04) (assertion 5)
 * 6. Panel se cierra al éxito (assertion 9)
 * 7. Toggle visibilidad contraseña (assertion 11)
 *
 * Assertions covered by vitest (unit tests):
 * - 1: botón disabled offline (roster-export-panel.test.tsx:44)
 * - 6: round-trip con deserializeRoster (roster-serializer.test.ts)
 * - 7: WrongPasswordError (roster-serializer.test.ts)
 * - 8: storeId parte de la contraseña (roster-serializer.test.ts)
 * - 10: Fallo muestra USERS.ERROR (roster-export-panel.test.tsx:61)
 * - 12: Botón disabled sin storeId (roster-export-panel.test.tsx:50)
 */
const EXPORT_TEXT = 'Exportar roster sin conexión'; // es.ts:781
const CONFIRM_TEXT = 'Confirmar'; // es.ts:9
const ERROR_EMPTY_PASSWORD = 'La contraseña no puede estar vacía.'; // es.ts:871
const SHOW_PASSWORD = 'Mostrar contraseña'; // es.ts:877
const HIDE_PASSWORD = 'Ocultar contraseña'; // es.ts:878

test.use({ persona: 'owner-admin' });
test.describe.configure({ mode: 'serial', timeout: 120_000 });

// ── Test 1: Happy path — export with download verification ─────────────

test('exportar roster: descarga ZIP con nombre correcto, panel se cierra', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;

  await page.goto('/management/users');

  // Aserción 3: intercept GET /v1/storeusers/{storeId}/offline-roster.
  const rosterRequests: string[] = [];
  await page.route(`**/v1/storeusers/${selectedStoreId}/offline-roster`, (route) => {
    rosterRequests.push(route.request().url());
    route.continue();
  });

  // Click "Exportar roster sin conexión".
  await page.getByRole('button', { name: EXPORT_TEXT }).click();

  // Dialog visible.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Aserción 7: toggle password visibility.
  const toggleBtn = dialog.getByRole('button', { name: SHOW_PASSWORD });
  await expect(toggleBtn).toBeVisible();
  await toggleBtn.click();
  await expect(dialog.getByRole('button', { name: HIDE_PASSWORD })).toBeVisible();
  // Toggle back — re-query because the accessible name changed.
  await dialog.getByRole('button', { name: HIDE_PASSWORD }).click();
  await expect(dialog.getByRole('button', { name: SHOW_PASSWORD })).toBeVisible();

  // Fill master password and confirm.
  const masterInput = dialog.locator('#roster-export-master');
  await masterInput.fill('TestMaster123');

  // Intercept the download.
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: CONFIRM_TEXT }).click();

  // Aserción 3: exactly one GET was emitted.
  await expect
    .poll(() => rosterRequests.length, { timeout: 10_000 })
    .toBe(1);

  // Aserción 4+5: download file with correct name and ZIP content.
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`roster-${selectedStoreId}.smcabundle`);

  // Save the downloaded file to verify content.
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  // Aserción 5: file starts with ZIP signature PK\x03\x04.
  const fs = await import('fs');
  const bytes = fs.readFileSync(downloadPath!);
  expect(bytes[0]).toBe(0x50); // P
  expect(bytes[1]).toBe(0x4b); // K
  expect(bytes[2]).toBe(0x03);
  expect(bytes[3]).toBe(0x04);

  // Aserción 9: panel closed after success.
  await expect(dialog).not.toBeVisible();
});

// ── Test 2: Empty password shows error ─────────────────────────────────

test('contraseña vacía muestra error y no emite petición', async ({ signedInPage }) => {
  const { page } = signedInPage;

  await page.goto('/management/users');

  // Intercept the roster endpoint.
  let rosterEmitted = false;
  await page.route('**/v1/storeusers/*/offline-roster', (route) => {
    rosterEmitted = true;
    route.continue();
  });

  await page.getByRole('button', { name: EXPORT_TEXT }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Submit with empty password.
  await dialog.getByRole('button', { name: CONFIRM_TEXT }).click();

  // Aserción 2: error message shown, no request emitted.
  await expect(dialog.getByText(ERROR_EMPTY_PASSWORD)).toBeVisible();
  expect(rosterEmitted).toBe(false);

  // Panel stays open.
  await expect(dialog).toBeVisible();
});

// ── Test 3: Button is enabled online (control) ─────────────────────────

test('botón habilitado online', async ({ signedInPage }) => {
  const { page } = signedInPage;

  await page.goto('/management/users');

  // Aserción 1 (control): button is enabled when online.
  const exportBtn = page.getByRole('button', { name: EXPORT_TEXT });
  await expect(exportBtn).toBeEnabled();
});

// ── Roster expiry by billing plan (roster-expiry-by-billing-plan) ──────
// The UI does not surface the bundle's internal ExpiresAt/JWT, so these tests
// intercept the `GET .../offline-roster` response the export flow consumes and
// assert the expiry contract on the backend's real payload:
//   • Paid plan (PaymentStartDate != null + a paid module): expiresAt =
//     paymentDueDate + 5 days. The persona's freshly registered store is Paid
//     by default (registration assigns ALL available modules, paid included),
//     so the paid test needs no seeding.
//   • Free plan (no paid module; here also PaymentStartDate = null): falls back
//     to the configured TTL (default 35 days) — expiresAt = issuedAt + 35 days.
// In both cases every per-user offlineAuthToken JWT must expire at exactly the
// bundle's ExpiresAt (the same `expiresAt` value the handler passes to both the
// JWT and the bundle DTO).
//
// ORDER MATTERS (mode: 'serial', shared persona store): the free test mutates
// the shared store (removes paid modules + nulls PaymentStartDate), so the paid
// test MUST run first, while the store is still Paid.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FREE_TTL_DAYS = 35;

// The roster user DTO mirrors OfflineRosterUserDto.cs (camelCase JSON).
interface RosterUserShape {
  id: string;
  offlineAuthToken: string;
  paymentDueDate?: string | null;
}

interface RosterShape {
  issuedAt: number;
  expiresAt: number;
  users: RosterUserShape[];
}

function decodeJwtExp(token: string): number | null {
  // Decode the JWT payload (middle segment) without a dependency: base64url ->
  // JSON -> exp (unix seconds).
  const encoded = token.split('.')[1];
  if (!encoded) return null;
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const json = Buffer.from(b64 + pad, 'base64').toString('utf8');
  try {
    return (JSON.parse(json) as { exp?: number }).exp ?? null;
  } catch {
    return null;
  }
}

// Fetches the roster by triggering the export dialog exactly once, returning the
// captured response body and the downloaded bundle filename (if any).
async function captureRosterResponse(
  page: import('@playwright/test').Page,
  selectedStoreId: string
): Promise<RosterShape> {
  let captured: RosterShape | null = null;
  await page.route(`**/v1/storeusers/${selectedStoreId}/offline-roster`, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { data?: RosterShape };
    captured = body.data ?? null;
    await route.fulfill({ response });
  });

  await page.getByRole('button', { name: EXPORT_TEXT }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#roster-export-master').fill('TestMaster123');
  await dialog.getByRole('button', { name: CONFIRM_TEXT }).click();

  await expect
    .poll(() => captured !== null, { timeout: 10_000 })
    .toBe(true);
  return captured!;
}

test('roster pagado: expira 5 días después de la próxima fecha de pago y el JWT coincide', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;

  // The persona's store is Paid by default (registration assigns all modules,
  // paid included, and sets PaymentStartDate), so no seeding is needed.
  await page.goto('/management/users');

  const roster = await captureRosterResponse(page, selectedStoreId);

  // Paid branch: expiry = paymentDueDate + 5 days, day-granular (both at UTC
  // midnight). paymentDueDate comes from the same billing.NextDueDate the
  // handler used, so this is a self-consistent oracle, not a re-derivation.
  const paidUser = roster.users.find((u) => u.paymentDueDate);
  expect(paidUser).toBeTruthy();
  const due = new Date(`${paidUser!.paymentDueDate}T00:00:00Z`);
  const expected = Date.UTC(
    due.getUTCFullYear(),
    due.getUTCMonth(),
    due.getUTCDate() + 5
  );
  expect(roster.expiresAt).toBe(expected);

  for (const user of roster.users) {
    expect(user.offlineAuthToken).toBeTruthy();
    const expSec = decodeJwtExp(user.offlineAuthToken);
    expect(expSec).not.toBeNull();
    // Both the bundle ExpiresAt and the JWT `exp` derive from the same
    // backend instant via truncation (to millis and seconds respectively):
    // exp_seconds === floor(expiresAt_millis / 1000).
    expect(expSec).toBe(Math.floor(roster.expiresAt / 1000));
  }
});

test('roster libre: expira a los 35 días por defecto (PaymentStartDate null) y el JWT coincide', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;

  // Free plan: remove the paid modules (degradeStoreToFreePlan) and null the
  // PaymentStartDate so the store is unambiguously Free. This mutates the
  // shared persona store, which is why the free test must run last.
  await page.goto('/management/users');
  await degradeStoreToFreePlan(page, selectedStoreId);
  await setPaymentStartDateNull(page, selectedStoreId);

  const roster = await captureRosterResponse(page, selectedStoreId);

  // Free branch: expiry = issuedAt + configured TTL (default 35 days).
  expect(roster.expiresAt - roster.issuedAt).toBe(FREE_TTL_DAYS * MS_PER_DAY);
  expect(roster.users.length).toBeGreaterThan(0);

  for (const user of roster.users) {
    expect(user.offlineAuthToken).toBeTruthy();
    const expSec = decodeJwtExp(user.offlineAuthToken);
    expect(expSec).not.toBeNull();
    expect(expSec).toBe(Math.floor(roster.expiresAt / 1000));
  }
});
