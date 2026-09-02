import { test, expect } from './support/test';
import { LoginPage } from './support/login-page';
import { buildRosterBundle, KAT_PASSWORD, ROSTER_STORAGE_KEY } from './support/roster-fixture';
import { serializeRoster } from '../apps/web-store-pos/app/shared/lib/offline/roster-serializer';

/**
 * roster-any-filename (frontend E2E): importing an activation file must NOT
 * depend on its name. The storeId the archive password needs travels inside
 * the zip, in the plaintext `meta.json` envelope `serializeRoster` writes
 * (`roster-serializer.ts`), so a file renamed by the user — or shared under
 * any name — activates the device exactly like an untouched export.
 *
 * The full UI round-trip: the login screen's modal, the real `<input
 * type="file">`, `importRosterFile`, and the roster landing in localStorage.
 * `offline-access-panel.spec.ts` already covers the un-renamed happy path
 * plus offline login and disable; this spec's single purpose is the RENAME
 * case that used to fail with `UnknownFileError` ("No pudimos reconocer el
 * archivo..."), and must now succeed.
 *
 * Same hermetic profile as `offline-access-panel.spec.ts`: no backend, no DB
 * rows — the roster is synthetic (`buildRosterBundle`) and everything it
 * seeds lives in the ephemeral context's localStorage.
 */

const ENABLE_BUTTON = 'Activar acceso sin conexión'; // es.ts (OFFLINE_ACCESS.ENABLE_BUTTON)
const DISABLE_BUTTON = 'Desactivar acceso sin conexión'; // es.ts (OFFLINE_ACCESS.DISABLE_BUTTON)
const MODAL_SUBMIT = 'Activar'; // es.ts (OFFLINE_ACCESS.SUBMIT)

/** Distinct from the roster user's login password on purpose, same criterion
 * as `offline-access-panel.spec.ts:68`: the dialog asks for the FILE's
 * password (`${master}${storeId}`), not the user's. */
const ACTIVATION_MASTER_PASSWORD = 'ActivacionE2E123';

/** Names that the OLD filename contract would have rejected: no
 * `roster-<GUID>` shape at all. Each must import now. */
const RENAMED_FILE_NAMES = [
  'activacion.smcabundle',
  'mi tienda.zip',
];

function uniqueLogin(prefix: string): string {
  return `e2e-any-filename-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function enableButton(page: import('@playwright/test').Page) {
  // `exact: true` is load-bearing: "Desactivar..." contains "activar..." —
  // same verified trap as `offline-access-panel.spec.ts:150-155`.
  return page.getByRole('button', { name: ENABLE_BUTTON, exact: true });
}

test.describe('roster-any-filename — activación con archivo renombrado', () => {
  test('un archivo renombrado activa el dispositivo igual que un export intacto', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('rename');
    const bundle = await buildRosterBundle({ users: [{ login, wrap: 'kat' }] });

    // The activation file is produced by the SAME serializer the real
    // export panel uses — envelope included — then RENAMED before import.
    const bytes = await serializeRoster(
      bundle as unknown as Parameters<typeof serializeRoster>[0],
      ACTIVATION_MASTER_PASSWORD,
      bundle.storeId,
    );
    const renamedName = RENAMED_FILE_NAMES[0];

    await loginPage.goto();
    await expect(enableButton(page)).toBeVisible();

    await enableButton(page).click();
    await expect(page.getByRole('heading', { name: ENABLE_BUTTON, exact: true })).toBeVisible();

    await page.locator('#offline-access-file').setInputFiles({
      name: renamedName,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(bytes),
    });
    await page.locator('#offline-access-password').fill(ACTIVATION_MASTER_PASSWORD);
    await page.getByRole('button', { name: MODAL_SUBMIT, exact: true }).click();

    // The dialog closing is the one signal that `importRosterFile` did not
    // throw — the old contract failed here with "No pudimos reconocer el
    // archivo. Usalo tal como te lo pasaron, sin cambiarle el nombre."
    await expect(page.getByRole('heading', { name: ENABLE_BUTTON, exact: true })).toHaveCount(0, {
      timeout: 20_000,
    });

    // The stored roster is THE renamed file's, not something else.
    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ROSTER_STORAGE_KEY,
    );
    expect(stored).not.toBeNull();
    expect((JSON.parse(stored!) as { bundleId: string }).bundleId).toBe(bundle.bundleId);

    // The panel flipped: the device is provisioned under the renamed file.
    await expect(
      page.getByRole('button', { name: DISABLE_BUTTON, exact: true }),
    ).toBeVisible();
    await expect(enableButton(page)).toHaveCount(0);
  });

  test('a file with no .smcabundle extension and a casual name imports too', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('noext');
    const bundle = await buildRosterBundle({ users: [{ login, wrap: 'kat' }] });

    const bytes = await serializeRoster(
      bundle as unknown as Parameters<typeof serializeRoster>[0],
      ACTIVATION_MASTER_PASSWORD,
      bundle.storeId,
    );

    await loginPage.goto();
    await expect(enableButton(page)).toBeVisible();
    await enableButton(page).click();

    await page.locator('#offline-access-file').setInputFiles({
      name: RENAMED_FILE_NAMES[1], // 'mi tienda.zip' — wrong extension, casual name
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(bytes),
    });
    await page.locator('#offline-access-password').fill(ACTIVATION_MASTER_PASSWORD);
    await page.getByRole('button', { name: MODAL_SUBMIT, exact: true }).click();

    await expect(page.getByRole('heading', { name: ENABLE_BUTTON, exact: true })).toHaveCount(0, {
      timeout: 20_000,
    });

    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ROSTER_STORAGE_KEY,
    );
    expect((JSON.parse(stored!) as { bundleId: string }).bundleId).toBe(bundle.bundleId);
    await expect(
      page.getByRole('button', { name: DISABLE_BUTTON, exact: true }),
    ).toBeVisible();
  });
});
