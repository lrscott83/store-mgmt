import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { readBearerToken } from './support/auth-storage';
import { E2E_API_URL } from './support/backend-url';
import { RegisterPage } from './support/register-page';
import { newTestIdentity } from './support/identity';
import { readSelectedStoreId } from './support/session';
import {
  MODISTORES_MODULE_ID,
  disableStoreModule,
} from './support/multipayments-fixture';

/**
 * [S2-03] Seguridad — un OwnerAdmin en `/management/stores/create` no puede
 * crear una tienda (`docs/testing/e2e-stage-1/S2-03.md` — revisado 2026-09-25,
 * autorización del usuario: cambio de spec Y de app).
 *
 * Comportamiento NUEVO de la app: un owner SIN el módulo MultiStores (14) que
 * entra a la URL de creación es redirigido a `/management/my-stores` por el
 * loader `ownerStoresGate` (loaders.ts) — SIN cerrar la sesión. Desde ahí no
 * puede crear nada (la creación vive en el modal que exige el módulo), así que
 * lo único que hay que probar es el aterrizaje en esa vista con la sesión
 * viva y cero requests de creación.
 *
 * ── El caso del gate se CONSTRUYE, no se hereda (2026-10-13) ──────────────
 * El Test 1 usaba la persona compartida `owner-admin` porque el registro la
 * entregaba SIN MultiStores (nacimiento en plan Pago), así que esa persona era
 * exactamente el caso del gate. El plan de nacimiento es ahora **Superior**
 * (decisión del propietario 2026-10-13, commit `store-birth-superior`), que SÍ
 * trae el módulo 14: el owner pasa de largo por la URL de creación y el gate no
 * se ejercita jamás. Por eso el Test 1 acuña ahora una identidad PRIVADA y quita
 * el módulo con `disableStoreModule`, reconstruyendo el caso exacto. Es una
 * mutación server-side, y la persona compartida es worker-scoped — jamás debe
 * recibirla (e2e/README.md §"Specs que mutan estado server-side").
 *
 * ESTRUCTURA (corregida 2026-09-25 con sonda de personas): cada test vive en
 * SU PROPIO `test.describe` con el `test.use` DENTRO del describe. Los
 * `test.use` a nivel de fichero se ACUMULAN (el último gana para TODOS los
 * tests del fichero): con el layout anterior, el Test 1 corría como
 * `store-user` y nunca probó el camino del owner — el spec "pasaba" por la
 * rama de deslogueo sin ejercitar jamás el flujo del owner.
 *
 * This spec verifies that:
 * 1. The OwnerAdmin without MultiStores lands on /management/my-stores with
 *    the session alive, and NO create/edit request is ever emitted.
 * 2. A StoreUser is logged out entirely (adminLoader denies access).
 *
 * Login budget: 1 real register (Test 1) + 1 login for `store-user` (minted once
 * per worker), well within LoginPolicy's ceiling of 15/1min
 * (RateLimitPolicies.cs:15-24).
 */

/**
 * Rewrites `currentUser` from a REAL GET /v1/auth/me and reloads — the app
 * caches a valid profile and does not re-call /me on cold boot, so a removed
 * module stays invisible to the client gate until the cache is refreshed.
 */
async function refreshSessionFromMe(page: Page): Promise<void> {
  const token = await readBearerToken(page);
  const response = await page.request.get(`${E2E_API_URL}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok()) {
    throw new Error(`refreshSessionFromMe: GET /v1/auth/me failed (${response.status()})`);
  }
  const body = (await response.json()) as { data?: unknown };
  if (!body.data) {
    throw new Error('refreshSessionFromMe: /v1/auth/me returned no data payload');
  }
  await page.evaluate((profile) => {
    window.localStorage.setItem('currentUser', JSON.stringify(profile));
    window.localStorage.setItem(
      'current-store-id',
      (profile as { selectedStoreId?: string }).selectedStoreId ?? '',
    );
  }, body.data);
  await page.reload();
}

/** Module ids the CLIENT session carries — exactly what `ownerStoresGate` reads. */
async function sessionModuleIds(page: Page): Promise<number[]> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) throw new Error('store-create-security: localStorage.currentUser is empty.');
  const parsed = JSON.parse(raw) as { storeModuleIds?: number[] };
  return parsed.storeModuleIds ?? [];
}

// Presupuesto ORIGINAL de 120_000. El 2026-10-06 se había subido a 240_000 para
// absorber el 2× medido bajo contención (setup de 32.3 s en solitario vs 63.6 s con
// 8 workers: 12 s de POST /api/v1/auth/register + 26.7 s del `waitForURL` tras
// registrar + frío de Vite), y el usuario pidió bajarlo de nuevo para DIAGNOSTICAR
// en vez de tapar el problema. Ahora lo que acota las esperas colgadas es
// `actionTimeout: 30_000` (playwright.config.ts): una espera sin límite falla
// NOMBRANDO el paso, que era lo que faltó para cerrar la ficha 02. Medición:
// docs/testing/known-issues/2026-10-06-e2e-verification/02-store-create-security-setup-timeout.md
test.describe.configure({ timeout: 120_000 });

// ── Test 1: OwnerAdmin sin MultiStores ───────────────────────────────

test.describe('OwnerAdmin sin MultiStores', () => {
  test('OwnerAdmin sin MultiStores en /management/stores/create aterriza en my-stores sin poder crear', async ({
    page,
  }) => {
    // Identidad PRIVADA: el gate se prueba sobre una tienda SIN el módulo 14, y
    // quitarlo es una mutación server-side que la persona compartida no puede
    // recibir. Superior (el plan de nacimiento vigente) sí lo trae.
    const identity = newTestIdentity();
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillValidForm(identity);
    await registerPage.acceptTerms.check();
    await registerPage.submit();
    await page.waitForURL(/\/sales\/products$/);
    const selectedStoreId = await readSelectedStoreId(page);

    // CONSTRUIR la precondición del gate: quitar el módulo y refrescar la sesión
    // por la API real, para que `ownerStoresGate` lea de verdad el set sin 14.
    await disableStoreModule(page, selectedStoreId, MODISTORES_MODULE_ID);
    await refreshSessionFromMe(page);
    expect(await sessionModuleIds(page)).not.toContain(MODISTORES_MODULE_ID);

    // Navegar a la URL de creación — el mecanismo de seguridad bajo prueba.
    // ownerStoresGate (loaders.ts): admin ok, owner sin MultiStores → redirect a
    // my-stores SIN logout.
    await page.goto('/management/stores/create');

    // Aserción 1: aterriza en la vista de mis tiendas — donde no puede crear
    // nada (la creación vive en el modal que exige el módulo MultiStores).
    await expect(page).toHaveURL(/\/management\/my-stores$/);

    // Captura DESDE AQUÍ (la página ya aterrizó): si algún intento de
    // creación/edición saliera desde my-stores, quedaría registrado.
    const capturedRequests: Array<{ method: string; url: string }> = [];
    await page.route('**/v1/stores**', (route) => {
      capturedRequests.push({ method: route.request().method(), url: route.request().url() });
      route.continue();
    });

    // Aserción 2: la sesión SIGUE viva — ni denyAccess ni el gate la cerraron.
    // La vista my-stores pinta la card de la tienda del owner con su plan.
    await expect(page.getByTestId(`owner-store-body-${selectedStoreId}`)).toBeVisible();

    // Aserción 3: cero requests de creación/edición tras aterrizar.
    const mutationRequests = capturedRequests.filter(
      (r) => r.method === 'POST' || r.method === 'PUT',
    );
    expect(mutationRequests).toHaveLength(0);

    // Aserción 4 (el corazón de S2-03): el formulario de creación NUNCA se
    // montó — ni el input de nombre ni el título "Crear una tienda".
    await expect(page.locator('#store-name')).toHaveCount(0);
    await expect(page.getByText('Crear una tienda')).toHaveCount(0);
  });
});

// ── Test 2: StoreUser ─────────────────────────────────────────────────

test.describe('StoreUser', () => {
  test.use({ persona: 'store-user' });

  test('StoreUser en /management/stores/create es deslogueado y redirigido a /login', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;

    // ownerStoresGate (loaders.ts) → adminLoader: un StoreUser no es
    // SuperAdmin ni OwnerAdmin → denyAccess() → logout() + redirect a /login.
    // H-8: "Un fallo de autorización desloguea, no muestra 'no autorizado'".
    await page.goto('/management/stores/create');

    // Aserciones: la URL es /login y el formulario de login es visible.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });
});
