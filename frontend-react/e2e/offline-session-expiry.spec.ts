import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { LoginPage } from './support/login-page';
import { plantRoster, KAT_PASSWORD } from './support/roster-fixture';
import { readAuthModel } from './support/auth-storage';

/**
 * offline-session-expiry rule: la sesión que NACE de un login offline debe
 * expirar con el MISMO valor que trae el roster (`bundle.expiresAt`),
 * independientemente del plan de la tienda — el backend decide ese valor en
 * el export (pagado: fecha de vencimiento + 5 días; gratis: TTL configurado)
 * y el frontend solo debe consumirlo. Antes, `setUser` estampaba
 * `now + 35 días` fijos y la sesión sobrevivía al roster/JWT, dejando una
 * ventana de 401s en todo lo online.
 *
 * Cero backend y cero HTTP (mismo patrón que `login-offline.spec.ts`): el
 * roster se planta sintético con `plantRoster`, el login toma SIEMPRE la rama
 * offline, y lo que se observa es el `AUTH_MODEL.expiresIn` que la app escribe
 * (auth-storage.ts lo lee). Dos tests:
 *
 *   - E2E 1: paga la regla hacia adelante — `expiresIn == bundle.expiresAt`
 *     (no +35d). Un bundle estilo pagado (+5 días) prueba que el valor NO es
 *     el default legacy.
 *   - E2E 2: paga la regla en el límite — cuando pasa `expiresAt`, el próximo
 *     arranque en frío desloguea a /login. Bajo el bug (+35d) la sesión
 *     seguía viva y este test fallaba.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TOLERANCE_MS = 60_000;

/** Login offline único por corrida — no se registra nada real (roster
 * sintético), solo necesita evitar colisiones dentro de la corrida. */
function uniqueLogin(prefix: string): string {
  return `e2e-expiry-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function offlineLogin(page: Page, login: string): Promise<void> {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.fill({ login, password: KAT_PASSWORD });
  await loginPage.submit();
  await page.waitForURL(/\/sales\/products$/);
}

test.describe('sesión offline: expira con el expiresAt del roster (offline-session-expiry rule)', () => {
  test.describe.configure({ timeout: 90_000 });

  test('E2E 1: AUTH_MODEL.expiresIn = expiresAt del roster (bundle estilo pagado, +5 días — no +35)', async ({
    page,
  }) => {
    const login = uniqueLogin('e1');
    await page.goto('/login');
    const bundle = await plantRoster(page, {
      users: [{ login, wrap: 'kat' }],
      expiresInMs: 5 * MS_PER_DAY,
    });

    await offlineLogin(page, login);

    const auth = await readAuthModel(page);
    expect(auth?.authToken).toBe('offline-session');
    expect(auth?.expiresIn).toBeTruthy();

    // La regla: el valor estampado es el expiresAt ABSOLUTO del bundle.
    expect(Math.abs(auth!.expiresIn! - bundle.expiresAt)).toBeLessThanOrEqual(TOLERANCE_MS);
    // Contra el bug (+35d desde el login): con +5d el valor NUNCA podría ser
    // mayor que now + 10 días si viniera del default legacy.
    expect(auth!.expiresIn!).toBeLessThan(Date.now() + 10 * MS_PER_DAY);
  });

  test('E2E 2: al vencer el bundle, el próximo arranque en frío desloguea a /login', async ({
    page,
  }) => {
    const login = uniqueLogin('e2');
    await page.goto('/login');
    // Bundle corto (15 s): suficiente para loguear y esperar su vencimiento.
    const bundle = await plantRoster(page, {
      users: [{ login, wrap: 'kat' }],
      expiresInMs: 15_000,
    });

    await offlineLogin(page, login);
    const auth = await readAuthModel(page);
    // Precondición: la sesión se estampó con el expiresAt del bundle.
    expect(Math.abs(auth!.expiresIn! - bundle.expiresAt)).toBeLessThanOrEqual(TOLERANCE_MS);

    // Esperar a que el expiresAt quede en el pasado…
    await expect
      .poll(() => Date.now() > bundle.expiresAt, { timeout: 30_000, intervals: [500] })
      .toBe(true);

    // …y un arranque en frío decide: expiresIn vencido → logout → /login.
    // (Bajo el bug de +35d la sesión seguía viva y este reload NO deslogueaba.)
    await page.reload();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
