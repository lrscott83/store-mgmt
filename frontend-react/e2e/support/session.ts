import type { Browser, BrowserContext, Page } from '@playwright/test';
import { LoginPage } from './login-page';
import { RegisterPage } from './register-page';
import { newTestIdentity, type TestIdentity } from './identity';
import { seedCategoryAndProduct } from './store-seed';

/**
 * The persona-minting engine behind `signedInPage` (design.md §3). Ten
 * scenarios across `login.spec.ts` hang off this contract without having to
 * reopen this file.
 *
 * ## Budget (design.md §2)
 * The default suite spends exactly 4 real `POST /v1/auth/login` against a
 * ceiling of 5/minute: 1 to mint `owner-admin`, 1 to mint `store-user`, plus
 * 2 more spent by `login.spec.ts` itself (A3's bad-password attempt and D1's
 * real re-login after `logout()`). `owner-admin-with-products` and
 * `store-user-with-products` cost ZERO extra logins — they are derived by
 * restoring a captured snapshot, never by logging in again.
 *
 * ## Never imports a roster
 * No step below calls `importRoster` — `isRosterProvisioned()` stays false
 * for every minted persona, so `login.tsx:106` always takes the ONLINE
 * branch and `needsUnlock` is always false (`loaders.ts:54`). A roster would
 * silently turn this change into [S1-03] (offline login), which is out of
 * scope (propuesta, riesgo R4).
 */
export type PersonaKind =
  | 'owner-admin'
  | 'owner-admin-with-products'
  | 'store-user'
  | 'store-user-with-products';

export interface SignedInSession {
  /** ⚠️ Always the SAME object as the test's own `page` fixture — see the
   * invariant note on `restoreSignedInSession()` below. */
  page: Page;
  identity: TestIdentity;
  /** Read from `localStorage.currentUser` after a real login — never guessed. */
  selectedStoreId: string;
  homePath: string;
}

/** One persona's captured localStorage, ready to be replayed onto a fresh page. */
interface CapturedSnapshot {
  localStorage: Array<{ name: string; value: string }>;
  identity: TestIdentity;
  selectedStoreId: string;
  homePath: string;
}

export interface PersonaCache {
  resolve(kind: PersonaKind): Promise<CapturedSnapshot>;
}

/**
 * Reads `selectedStoreId` off the app's own `currentUser` record — the same
 * seam the app itself writes to (`auth-store.ts` `StorageService.setCurrentUser`).
 */
async function readSelectedStoreId(page: Page): Promise<string> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) {
    throw new Error(
      'Expected localStorage.currentUser to be populated after a real login, found none. ' +
        'The login this snapshot depends on may have failed silently.'
    );
  }
  const parsed = JSON.parse(raw) as { selectedStoreId?: string };
  if (!parsed.selectedStoreId) {
    throw new Error('localStorage.currentUser has no selectedStoreId — cannot mint this persona.');
  }
  return parsed.selectedStoreId;
}

async function captureSnapshot(
  context: BrowserContext,
  page: Page,
  identity: TestIdentity,
  selectedStoreId: string,
  homePath: string
): Promise<CapturedSnapshot> {
  const state = await context.storageState();
  const origin = new URL(page.url()).origin;
  const originState = state.origins.find((o) => o.origin === origin);
  if (!originState) {
    throw new Error(
      `No localStorage captured for origin ${origin} while minting a persona — the real login ` +
        'this snapshot depends on may have failed silently.'
    );
  }
  return { localStorage: originState.localStorage, identity, selectedStoreId, homePath };
}

/**
 * Creates the StoreUser via the real UI (`/management/users/create`,
 * `POST /v1/storeusers`, no rate limit — design.md §2) from the OwnerAdmin's
 * already-authenticated `ownerPage`. Costs zero logins.
 *
 * Gate R2 / task 1.4 (STOP AND ASK, design.md §3 "Cuando la persona no se
 * puede acuñar"): `user-create.tsx:11` uses `adminFeatureLoader([EFeatures.Users])`,
 * which chains `adminLoader` and THEN `featureGate` — the latter has NO
 * OwnerAdmin bypass (`loaders.ts:107-112` vs the plain `featureLoader`'s
 * bypass at `:89-91`). If the auto-registered OwnerAdmin lacks the `Users`
 * feature, `featureGate` calls `denyAccess()`, which LOGS OUT and redirects
 * to `/login` (H-8) instead of showing an error. This function does NOT try
 * to route around that — it fails loudly, by design, so the caller (the
 * user, watching the suite run) sees the exact stop-and-ask message instead
 * of a confusing downstream failure three steps later.
 */
async function mintStoreUserViaUi(ownerPage: Page, identity: TestIdentity): Promise<void> {
  await ownerPage.goto('/management/users/create');

  if (/\/login$/.test(new URL(ownerPage.url()).pathname)) {
    throw new Error(
      '[persona:store-user] El OwnerAdmin auto-registrado NO tiene la feature Users: ' +
        'adminFeatureLoader deslogueó y rebotó a /login (loaders.ts:107-112 + H-8). Esto es el ' +
        'riesgo R3 de la propuesta materializándose. PARAR y preguntarle al usuario si crear el ' +
        'StoreUser por API directa o diferir D3. No lo resuelvas por tu cuenta.'
    );
  }

  await ownerPage.locator('#fullName').fill(identity.fullName);
  await ownerPage.locator('#login').fill(identity.login);
  await ownerPage.locator('#password').fill(identity.password);
  await ownerPage.locator('#confirmPassword').fill(identity.password);
  await ownerPage.locator('#cellPhone').fill(identity.cellPhone);
  // UserCreateForm's submit label is USERS.SAVE ('Adicionar', es.ts:698) — a
  // different string than login/register's own submit buttons on purpose;
  // matched literally, same policy as LoginPage/RegisterPage.
  await ownerPage.getByRole('button', { name: 'Adicionar' }).click();
  await ownerPage.waitForURL(/\/management\/users$/);
}

/**
 * The chain of design.md §3 "La cadena de acuñación, en orden", run at most
 * ONCE per worker (memoized by `createPersonaCache` below). Total real
 * logins: 2 (`owner-admin`, `store-user`). Everything else is either zero
 * network (the UI-driven StoreUser creation, the UI seed) or a snapshot
 * merge (`store-user-with-products`).
 */
async function mintPersonaChain(browser: Browser): Promise<Map<PersonaKind, CapturedSnapshot>> {
  const personas = new Map<PersonaKind, CapturedSnapshot>();

  // 1-3. owner-admin: real registration + real login, in its own context.
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const ownerIdentity = newTestIdentity();

  const registerPage = new RegisterPage(ownerPage);
  await registerPage.goto();
  await registerPage.fillValidForm(ownerIdentity);
  await registerPage.acceptTerms.check();
  await registerPage.submit();
  await ownerPage.waitForURL(/\/login$/);

  const ownerLoginPage = new LoginPage(ownerPage);
  await ownerLoginPage.fill(ownerIdentity);
  await ownerLoginPage.submit();
  await ownerPage.waitForURL(/\/sales\/products$/);

  const ownerStoreId = await readSelectedStoreId(ownerPage);
  personas.set(
    'owner-admin',
    await captureSnapshot(ownerContext, ownerPage, ownerIdentity, ownerStoreId, '/sales/products')
  );

  // 4. Create the StoreUser from the owner's own session — zero logins,
  // POST /v1/storeusers has no rate limit (design.md §2).
  const storeUserIdentity = newTestIdentity();
  await mintStoreUserViaUi(ownerPage, storeUserIdentity);

  // 5. StoreUser logs in for real, in ITS OWN context (a genuinely separate
  // session — design.md §3 step 5).
  const storeUserContext = await browser.newContext();
  const storeUserPage = await storeUserContext.newPage();
  const storeUserLoginPage = new LoginPage(storeUserPage);
  await storeUserLoginPage.goto();
  await storeUserLoginPage.fill(storeUserIdentity);
  await storeUserLoginPage.submit();
  await storeUserPage.waitForURL(/\/sales\/products$/);
  const storeUserStoreId = await readSelectedStoreId(storeUserPage);
  const storeUserSnapshot = await captureSnapshot(
    storeUserContext,
    storeUserPage,
    storeUserIdentity,
    storeUserStoreId,
    '/sales/products'
  );
  personas.set('store-user', storeUserSnapshot);
  await storeUserContext.close();

  // R5 (design.md §11): both personas MUST share a storeId by construction —
  // the StoreUser is created from INSIDE the owner's own store
  // (user-create.tsx:20,43). Asserted here, before the merge in step 7 below
  // trusts it.
  if (storeUserStoreId !== ownerStoreId) {
    throw new Error(
      `[persona:store-user-with-products] storeId mismatch: owner=${ownerStoreId}, ` +
        `store-user=${storeUserStoreId}. design.md R5 assumed these always match because the ` +
        "StoreUser is created inside the owner's own store (user-create.tsx:20,43)."
    );
  }

  // 6. Back on the owner's session: seed one category + one sellable
  // product via the real UI (store-seed.ts) — zero network requests
  // (GlobalConfig.USE_ONLINE_SERVICE = false). Then re-derive the resulting
  // home path the SAME way A7/D6 do at runtime (visit /login, let
  // guestOnlyLoader's resolveUserHomePath decide) instead of hardcoding it —
  // self-verifying, and it fails loudly if seeding silently didn't take.
  await ownerPage.goto('/sales/products');
  await seedCategoryAndProduct(ownerPage, `E2E Product ${ownerIdentity.login}`);
  await ownerPage.goto('/login');
  await ownerPage.waitForURL(/\/sales\/new$/);
  const ownerWithProductsHomePath = new URL(ownerPage.url()).pathname;

  const ownerWithProductsSnapshot = await captureSnapshot(
    ownerContext,
    ownerPage,
    ownerIdentity,
    ownerStoreId,
    ownerWithProductsHomePath
  );
  personas.set('owner-admin-with-products', ownerWithProductsSnapshot);
  await ownerContext.close();

  // 7. store-user-with-products = the store-user's OWN session identity +
  // the entity keys (categories/products) the owner's seeding just wrote,
  // merged because both personas share `ownerStoreId` (asserted above).
  // Both sides of this merge were produced by the app itself — never a
  // hand-built key (design.md §3 "El paso 7 merece defensa explícita").
  const entityEntries = ownerWithProductsSnapshot.localStorage.filter(
    (entry) => entry.name.startsWith('lizoft.store-') && entry.name.endsWith(`-${ownerStoreId}`)
  );
  personas.set('store-user-with-products', {
    ...storeUserSnapshot,
    localStorage: [...storeUserSnapshot.localStorage, ...entityEntries],
    homePath: ownerWithProductsHomePath,
  });

  return personas;
}

/**
 * Worker-scoped cache (design.md §3 "Costo amortizado"): the chain above
 * runs at most once per worker, lazily, on the FIRST `resolve()` call — a
 * spec that never destructures `signedInPage` triggers zero registrations
 * and zero logins (REQ-5, opt-in).
 */
export function createPersonaCache(browser: Browser): PersonaCache {
  let mintingPromise: Promise<Map<PersonaKind, CapturedSnapshot>> | null = null;

  function ensureMinted(): Promise<Map<PersonaKind, CapturedSnapshot>> {
    mintingPromise ??= mintPersonaChain(browser);
    return mintingPromise;
  }

  return {
    async resolve(kind: PersonaKind): Promise<CapturedSnapshot> {
      const personas = await ensureMinted();
      const snapshot = personas.get(kind);
      if (!snapshot) {
        throw new Error(`Persona "${kind}" was never minted by the chain — internal session.ts bug.`);
      }
      return snapshot;
    },
  };
}

/**
 * Restores a cached snapshot onto the TEST'S OWN `page` — never a new page
 * or context (design.md §3 "Composición"): `page.goto('/login')` (public,
 * anonymous, cheap) → `page.evaluate()` writes the snapshot's localStorage
 * entries → `page.goto(homePath)` reloads and `auth-store.ts`'s cold-boot
 * `initialize()` hydrates synchronously from what was just written. Costs
 * ZERO network requests (design.md §2 "La palanca que sí funciona").
 *
 * Rejected alternatives, and why (design.md §3): overwriting the `page`
 * fixture itself would authenticate every test in `register.spec.ts`, which
 * shares this same `test`; returning a `page` from a brand-new context would
 * desync `registerNetwork`/`loginNetwork` from the page the test actually
 * looks at; `context.addInitScript` re-runs on every navigation and would
 * re-write `AUTH_MODEL` right after D1's `logout()`.
 *
 * Invariant published in design.md §3: `signedInPage.page === page`. Held by
 * construction (this function never creates a page), and asserted
 * defensively below as a canary against a future refactor breaking it.
 */
export async function restoreSignedInSession(
  page: Page,
  cache: PersonaCache,
  persona: PersonaKind
): Promise<SignedInSession> {
  const snapshot = await cache.resolve(persona);

  await page.goto('/login');
  await page.evaluate((entries) => {
    for (const { name, value } of entries) {
      window.localStorage.setItem(name, value);
    }
  }, snapshot.localStorage);
  await page.goto(snapshot.homePath);

  const session: SignedInSession = {
    page,
    identity: snapshot.identity,
    selectedStoreId: snapshot.selectedStoreId,
    homePath: snapshot.homePath,
  };

  if (session.page !== page) {
    throw new Error("signedInPage.page must be === the test's own `page` fixture — internal bug.");
  }

  return session;
}
