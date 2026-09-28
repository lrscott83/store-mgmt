import type { Browser, Page } from '@playwright/test';
import { LoginPage } from './login-page';
import { RegisterPage } from './register-page';
import { newTestIdentity, type TestIdentity } from './identity';
import { readSelectedStoreId } from './session';
import { E2E_API_URL } from './backend-url';
import { mintSuperAdmin } from './superadmin-session';

/**
 * NEW support file (módulo Catálogo Web, 18 — plan 2026-09-27). Mints a PRIVATE
 * owner whose store ends up on the Superior plan — the only plan carrying
 * module 18 (`StorePlanModuleEntityTypeConfiguration`) — entirely through the
 * app's own API:
 *
 *   1. Register + login the owner (own e2e-* identity; the global teardown
 *      cleans it — no shared persona is touched).
 *   2. Mint a SuperAdmin through the documented harness helper
 *      (`superadmin-session.ts`) and POST /v1/stores/{id}/change-plan
 *      `{ storePlanId: 3 (Superior) }`. Non-SuperAdmin callers may only target
 *      Gratis/Pago (`ChangeStorePlanCommandHandler`), so this is the only
 *      legitimate path that puts module 18 into a store.
 *   3. Pin the backend state through the API (GET /v1/stores/{id} → module 18
 *      active).
 *   4. Owner re-login → `/me` is fetched fresh; the session carries module 18,
 *      feature 122 and the Sales module (2).
 *
 * El catálogo se publica desde el catálogo LOCAL del POS (decisión D11, plan §10.1): el POS es
 * offline-first y el servidor NO conoce sus productos, así que "Sincronizar Catálogo" envía el
 * snapshot del dispositivo. Por eso este fixture NO siembra productos por API: el spec los crea
 * por la UI real de Catálogo Productos (offline, en el dispositivo) y después sincroniza, que es
 * el camino de una tienda de verdad.
 */

const SUPERIOR_PLAN_ID = 3; // StorePlanType.Superior (StorePlanModuleEntityTypeConfiguration: solo Superior)
export const WEB_CATALOG_MODULE_ID = 18; // ModuleType.WebCatalog (EModules.WebCatalog, domain enums)
export const WEB_CATALOG_FEATURE_ID = 122; // FeatureType.WebCatalog (EFeatures.WebCatalog, domain enums)
const SALES_MODULE_ID = 2; // ModuleType.Sales — el catálogo lee productos de Ventas

interface ApiEnvelope<T> {
  data: T | null;
  succeeded: boolean;
  message: string | null;
  /** Detalle de validación (FluentValidation): `message` llega null y el motivo vive aquí. */
  errors?: Array<{ code?: string; description?: string }> | null;
}

export interface WebCatalogOwnerMint {
  identity: TestIdentity;
  storeId: string;
}

/**
 * Mints the WebCatalog owner. On success the given `page` is left signed in as
 * that owner with a FRESH session whose `storeModuleIds` includes module 18 and
 * whose `featureIds` include feature 122 — preconditions loudly asserted up
 * front, so a regression in the mint fails with a diagnosable error instead of
 * a downstream assertion.
 */
export async function mintWebCatalogOwner(page: Page, browser: Browser): Promise<WebCatalogOwnerMint> {
  // 1. Register the owner (creates Owner + store on the Pago birth plan).
  const identity = newTestIdentity();
  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fillValidForm(identity);
  await registerPage.acceptTerms.check();
  await registerPage.submit();
  // 2. The registration already opened the owner session (auto-login,
  //    2026-09-28); the store id comes from it.
  await page.waitForURL(/\/sales\/products$/);
  const storeId = await readSelectedStoreId(page);

  // 3. Mint the SuperAdmin persona (its own context and identity, cleaned with
  //    all other e2e-* rows by teardown).
  const superAdmin = await mintSuperAdmin(browser);
  const bearer = superAdmin.localStorage.find((entry) => entry.name === 'token')?.value;
  if (!bearer) {
    throw new Error(
      'web-catalog-fixture: SuperAdmin snapshot has no `token` entry — the change-plan POST ' +
        'cannot be authorized. mintSuperAdmin() returned a session without a bearer token.',
    );
  }

  // 4. Plan upgrade through the app's own endpoint (owner callers are blocked
  //    from Superior/VIP; SuperAdmin is the legitimate path).
  await postExpectingSuccess(page, `/v1/stores/${storeId}/change-plan`, bearer, {
    storePlanId: SUPERIOR_PLAN_ID,
  }, 'change-plan a Superior');

  // 5. Pin the backend state through the API (SuperAdmin GET — no permission gate).
  const store = await getExpectingSuccess<{ modules: Array<{ id: number }> }>(
    page,
    `/v1/stores/${storeId}`,
    bearer,
    'leer la tienda tras el cambio de plan',
  );
  const moduleIds = (store.modules ?? []).map((module) => module.id);
  if (!moduleIds.includes(WEB_CATALOG_MODULE_ID)) {
    throw new Error(
      `web-catalog-fixture: GET /v1/stores/${storeId} after the plan change did not show module ` +
        `${WEB_CATALOG_MODULE_ID} (Catálogo Web) active — observed [${moduleIds.join(',')}]. The ` +
        'Superior precondition was not actually written to the store.',
    );
  }

  // 6. Fresh owner login → /me re-fetched, session carries the new module set.
  await page.evaluate(() => localStorage.clear());
  await page.goto('/login');
  const ownerRelogin = new LoginPage(page);
  await ownerRelogin.fill(identity);
  await ownerRelogin.submit();
  await page.waitForURL(/\/sales\/products$/);

  // 7. Session precondition: module 18 + feature 122 (+ Sales, which owns the products).
  await assertWebCatalogInSession(page);
  return { identity, storeId };
}

/** Bearer-authenticated GET against the E2E backend; throws on a non-`succeeded` envelope. */
export async function getExpectingSuccess<T>(
  page: Page,
  path: string,
  bearer: string,
  label: string,
): Promise<T> {
  const response = await page.request.get(`${E2E_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  return unwrap<T>(response, label, path);
}

/** Bearer-authenticated POST against the E2E backend; throws on a non-`succeeded` envelope. */
export async function postExpectingSuccess<T = boolean>(
  page: Page,
  path: string,
  bearer: string,
  data: unknown,
  label: string,
): Promise<T> {
  const response = await page.request.post(`${E2E_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${bearer}` },
    data,
  });
  return unwrap<T>(response, label, path);
}

async function unwrap<T>(
  response: { ok(): boolean; status(): number; json(): Promise<unknown> },
  label: string,
  path = '',
): Promise<T> {

  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    body = null;
  }
  if (!response.ok() || !body?.succeeded) {
    // El motivo real de un 400 viene en `errors[]` (FluentValidation deja `message` en null).
    const details = (body?.errors ?? [])
      .map((error) => error.description ?? error.code ?? '')
      .filter(Boolean)
      .join(' | ');
    throw new Error(
      `web-catalog-fixture: ${label} failed (status ${response.status()}${
        body?.message ? `, message "${body.message}"` : ''
      }${details ? `, errors "${details}"` : ''}${
        path ? ` at ${path}` : ''
      } — the WebCatalog precondition was not created.`,
    );
  }
  return body.data as T;
}

/**
 * Noisy precondition: `currentUser.storeModuleIds` must include module 18 and
 * `featureIds` feature 122 right after the owner re-login — without them the
 * route loader (`ownerModuleLoader`) logs the owner out of /sales/web-catalog
 * and every downstream assertion would fail for the wrong, undiagnosable reason.
 */
async function assertWebCatalogInSession(page: Page): Promise<void> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) {
    throw new Error(
      'web-catalog-fixture: assertWebCatalogInSession — localStorage.currentUser is empty after ' +
        'the owner re-login. Expected a fresh owner session before this guard runs.',
    );
  }

  let user: { storeModuleIds?: number[]; featureIds?: number[] };
  try {
    user = JSON.parse(raw) as typeof user;
  } catch (cause) {
    throw new Error(
      'web-catalog-fixture: assertWebCatalogInSession — localStorage.currentUser is not valid ' +
        `JSON: ${cause instanceof Error ? cause.message : String(cause)}.`,
    );
  }

  const moduleIds = user.storeModuleIds ?? [];
  if (!moduleIds.includes(WEB_CATALOG_MODULE_ID)) {
    throw new Error(
      `web-catalog-fixture: currentUser.storeModuleIds does not include ${WEB_CATALOG_MODULE_ID} ` +
        `(Catálogo Web) after the Superior plan change — observed [${moduleIds.join(',')}]. The ` +
        'owner session was not refreshed with the new module set.',
    );
  }
  if (!moduleIds.includes(SALES_MODULE_ID)) {
    throw new Error(
      `web-catalog-fixture: currentUser.storeModuleIds does not include ${SALES_MODULE_ID} ` +
        `(Ventas), so the catalog has no products to publish — observed [${moduleIds.join(',')}].`,
    );
  }

  const featureIds = user.featureIds ?? [];
  if (!featureIds.includes(WEB_CATALOG_FEATURE_ID)) {
    throw new Error(
      `web-catalog-fixture: currentUser.featureIds does not include ${WEB_CATALOG_FEATURE_ID} ` +
        `(FeatureType.WebCatalog) after the Superior plan change — observed ` +
        `[${featureIds.join(',')}]. The StoreRoleFeatures were not generated for module 18.`,
    );
  }
}
