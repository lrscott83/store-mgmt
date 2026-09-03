import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { LoginPage } from './support/login-page';
import { RegisterPage } from './support/register-page';
import { newTestIdentity, type TestIdentity } from './support/identity';
import { readSelectedStoreId } from './support/session';
import { readBearerToken, mutateAuthModel } from './support/auth-storage';
import { plantRoster } from './support/roster-fixture';
import { matchesPathSuffix } from './support/network-observer-core';

/**
 * offline-jwt-as-session-credential (Opción 2 aprobada): una sesión que NACIÓ
 * del roster (login offline, token = sentinel 'offline-session') NO es una
 * sesión que deba quedarse muda cuando el dispositivo recupera internet. El
 * roster trae un JWT firmado por el backend para ese usuario
 * (`offlineAuthToken`, emitido en el export con el MISMO `JwtProvider` del
 * login); el interceptor de `api-client.ts` lo presenta como Bearer en toda
 * llamada HTTP cuando el token guardado es el sentinel. Este spec prueba esa
 * integración de punta a punta contra el backend real:
 *
 *   - E2E 1: roster con JWT → login offline → cache-miss en cold-boot →
 *     `GET /v1/auth/me` sale con `Authorization: Bearer <JWT del roster>` →
 *     200 → la sesión sigue (nunca /login). Es exactamente el caso del plan
 *     (punto 3): "usuario existe y hay internet → la sesión nacida del roster
 *     se revalida con su JWT".
 *   - E2E 2: roster legacy SIN `offlineAuthToken` → el interceptor degrada al
 *     sentinel (comportamiento de hoy, pin del plan: "roster v1/legacy →
 *     intacto") → el backend responde 401 → como 401 es un veredicto del
 *     servidor (auth-store.ts `isSessionRejection`), la sesión termina en
 *     /login. Documenta por qué el roster MODERNO (v2+) siempre lleva el JWT.
 *
 * POR QUÉ EL ROSTER SE PLANTA Y NO SE EXPORTA POR LA UI: el export real
 * entrega el roster cifrado en un `.smcabundle` (ZIP con master password), y
 * conducir la importación real por la UI es cobertura del spec de
 * aprovisionamiento (offline-shell / roster-export), no de este. Acá lo que
 * se prueba es la CREDENCIAL HTTP de una sesión nacida del roster — y para
 * eso el roster plantado lleva datos 100% reales: el `storeId` real, el
 * login/contraseña reales del usuario registrado, su `id` real (el swap
 * matchea `roster.users[].id` contra `currentUser.id`) y, en E2E 1, un JWT
 * real emitido por el backend para ese mismo usuario (el token de sesión del
 * login online, misma firma y claims que el `offlineAuthToken` del export —
 * ambos salen del mismo `JwtProvider`).
 *
 * POR QUÉ EL ROSTER VA SIN WRAP (mismo razonamiento que
 * `roster-recovery.spec.ts` E2E 3): el login ONLINE previo deja la tabla de
 * wraps de dispositivo (`lizoft.device-dek`), y `resolveDekForLogin` recupera
 * el DEK real de la tienda desde ahí. Un wrap sintético del vector KAT
 * metería una clave que NO es la de la tienda y rompería el descifrado. El
 * roster cumple una sola función: que `login.tsx` tome la rama offline.
 *
 * COSTO Y PRESUPUESTO (leer antes de agregar un test acá): este bloque gasta
 * 2 registros y 2 `POST /v1/auth/login` REALES (uno por test). Corre serial
 * y está taggeado `@rate-limit`, igual que el segundo bloque de
 * `roster-recovery.spec.ts` — se ejecuta con `pnpm test:e2e:rate-limit` o
 * `--grep @rate-limit`, fuera de la corrida default. Un 429 se manifiesta
 * como `LoginRateLimitError` y NO es un defecto de la app.
 */

const LOGIN_PATH_SUFFIX = '/v1/auth/login';
const ME_PATH_SUFFIX = '/v1/auth/me';
const DEVICE_DEK_KEY = 'lizoft.device-dek';
/** `offline-session` — el sentinel que estampa el login offline en el token
 * de sesión (offline-session.ts). Se afirma literal, nunca importado. */
const OFFLINE_SESSION_TOKEN = 'offline-session';

/** Cuenta los `POST .../v1/auth/login` reales. El login del MEDIO (el que
 * sale del roster) tiene que sumar cero — es la prueba de que tomó la rama
 * offline y no le habló al servidor. */
function installLoginPostCounter(page: Page): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && matchesPathSuffix(request.url(), LOGIN_PATH_SUFFIX)) {
      count += 1;
    }
  });
  return () => count;
}

/** Observa los `GET /v1/auth/me`: header `Authorization` enviado y status de
 * la respuesta. Es la única forma de ver el swap desde afuera — el header que
 * la app manda al servidor. */
function installMeObserver(page: Page): {
  count: () => number;
  lastAuthorization: () => string | null;
  lastStatus: () => number | null;
} {
  let meCount = 0;
  let lastAuthorization: string | null = null;
  let lastStatus: number | null = null;
  page.on('request', (request) => {
    if (request.method() === 'GET' && matchesPathSuffix(request.url(), ME_PATH_SUFFIX)) {
      meCount += 1;
      lastAuthorization = request.headers()['authorization'] ?? null;
    }
  });
  page.on('response', (response) => {
    if (matchesPathSuffix(response.url(), ME_PATH_SUFFIX)) {
      lastStatus = response.status();
    }
  });
  return {
    count: () => meCount,
    lastAuthorization: () => lastAuthorization,
    lastStatus: () => lastStatus,
  };
}

/** Registro real + primer login ONLINE real (1 registro + 1 login del
 * presupuesto). Aterriza en `/sales/products`: la tienda recién registrada no
 * tiene productos vendibles, así que `resolveUserHomePath` resuelve ahí
 * (user-home.ts:24-25). */
async function registerAndLoginOnline(page: Page): Promise<TestIdentity> {
  const identity = newTestIdentity();

  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fillValidForm(identity);
  await registerPage.acceptTerms.check();
  await registerPage.submit();
  await page.waitForURL(/\/login$/);

  const loginPage = new LoginPage(page);
  await loginPage.fill(identity);
  await loginPage.submit();
  await page.waitForURL(/\/sales\/products$/);

  return identity;
}

/** Lee el `id` del usuario actual desde `localStorage.currentUser` — el mismo
 * seam que la app escribe (StorageService.setCurrentUser). El swap matchea
 * contra este id, así que el roster plantado tiene que llevar el MISMO. */
async function readCurrentUserId(page: Page): Promise<string> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) {
    throw new Error('Se esperaba localStorage.currentUser tras el login online real, no había.');
  }
  const id = (JSON.parse(raw) as { id?: string }).id;
  if (!id) {
    throw new Error('localStorage.currentUser no tiene id — no se puede construir el roster real.');
  }
  return id;
}

/** Precondición compartida: el login ONLINE dejó una tabla de wraps de
 * dispositivo. Es lo que permite que el login OFFLINE posterior (roster sin
 * wrap) recupere el DEK real de la tienda. */
async function expectDeviceKeyMaterialPresent(page: Page, when: string): Promise<void> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), DEVICE_DEK_KEY);
  expect(
    raw,
    `Precondición (${when}): se esperaba la tabla de wraps en ` +
      `localStorage['${DEVICE_DEK_KEY}']. Sin ella el login offline no puede ` +
      'resolver el DEK y este test fallaría por el motivo equivocado.'
  ).not.toBeNull();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.waitForURL(/\/login$/);
}

test.describe('sesión nacida del roster + internet: las llamadas online usan el JWT del roster @rate-limit', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test('E2E 1: roster con JWT → /me se autentica con el JWT del roster (200) y la sesión sigue', async ({
    page,
  }) => {
    const loginPosts = installLoginPostCounter(page);

    // Tramo online: 1 registro + 1 login real. Deja el device-dek table.
    const identity = await registerAndLoginOnline(page);
    const storeId = await readSelectedStoreId(page);
    const userId = await readCurrentUserId(page);
    const onlineJwt = await readBearerToken(page);
    expect(onlineJwt, 'el login online tiene que dejar un JWT real en el token de sesión').toBeTruthy();
    await expectDeviceKeyMaterialPresent(page, 'tras el login online');

    await signOut(page);

    // Roster con datos REALES: storeId real, id real (el swap matchea contra
    // currentUser.id), verifier derivado de la contraseña REAL, y el JWT real
    // del backend como offlineAuthToken — la pieza bajo prueba.
    await plantRoster(page, {
      storeId,
      users: [
        {
          login: identity.login,
          password: identity.password,
          id: userId,
          offlineAuthToken: onlineJwt!,
        },
      ],
    });

    // Login OFFLINE por la UI con las credenciales reales.
    const loginPage = new LoginPage(page);
    await loginPage.fill(identity);
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);

    // El login del medio salió del roster: cero POST /v1/auth/login (el único
    // contado es el del tramo online) y el token de sesión es el sentinel.
    expect(loginPosts(), 'el login del medio tiene que salir por la rama offline').toBe(1);
    expect(await readBearerToken(page)).toBe(OFFLINE_SESSION_TOKEN);

    // Forzar el cache-miss del cold-boot (auth-me-deleted-user.spec.ts usa el
    // mismo truco): desyncar AUTH_MODEL.authToken hace que getUserByToken()
    // no pueda servir desde caché y dispare /me — el punto 3 del plan.
    await mutateAuthModel(page, { authToken: `e2e-desync-${Date.now()}` });

    const me = installMeObserver(page);
    await page.goto('/sales/products');

    // El swap, observable desde afuera: /me salió con el JWT del roster como
    // Bearer y el backend contestó 200.
    await expect.poll(() => me.count(), { timeout: 15_000 }).toBeGreaterThan(0);
    expect(me.lastAuthorization()).toBe(`Bearer ${onlineJwt}`);
    expect(me.lastStatus()).toBe(200);

    // Veredicto de sesión: 200 → la sesión se revalida, NUNCA /login.
    await page.waitForTimeout(1_500);
    expect(new URL(page.url()).pathname).not.toBe('/login');
    expect(new URL(page.url()).pathname).toBe('/sales/products');
  });

  test('E2E 2: roster legacy sin offlineAuthToken → degrada al sentinel → 401 → logout (veredicto del servidor)', async ({
    page,
  }) => {
    const loginPosts = installLoginPostCounter(page);

    // Mismo tramo online que E2E 1.
    const identity = await registerAndLoginOnline(page);
    const storeId = await readSelectedStoreId(page);
    const userId = await readCurrentUserId(page);
    await expectDeviceKeyMaterialPresent(page, 'tras el login online');

    await signOut(page);

    // Roster legacy: mismo usuario real, PERO sin offlineAuthToken — el caso
    // de un bundle viejo/v1 que el plan declara "degradado al comportamiento
    // de hoy". El swap no tiene JWT que presentar y manda el sentinel.
    await plantRoster(page, {
      storeId,
      users: [{ login: identity.login, password: identity.password, id: userId }],
    });

    const loginPage = new LoginPage(page);
    await loginPage.fill(identity);
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);
    expect(loginPosts(), 'el login del medio tiene que salir por la rama offline').toBe(1);
    expect(await readBearerToken(page)).toBe(OFFLINE_SESSION_TOKEN);

    // Mismo cache-miss forzado que E2E 1.
    await mutateAuthModel(page, { authToken: `e2e-desync-${Date.now()}` });

    const me = installMeObserver(page);
    await page.goto('/sales/products');

    // El sentinel llega al servidor → 401. Y 401 es un VEREDICTO
    // (isSessionRejection en auth-store.ts), no un error de red: el usuario
    // desloguea a /login. Esto pinea el trade-off aceptado del plan: un roster
    // sin JWT no puede autenticar operaciones online.
    await expect.poll(() => me.count(), { timeout: 15_000 }).toBeGreaterThan(0);
    expect(me.lastAuthorization()).toBe(`Bearer ${OFFLINE_SESSION_TOKEN}`);
    expect(me.lastStatus()).toBe(401);
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
