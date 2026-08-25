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
 * ceiling of 5/minute:
 * - 1 LIVE-OBSERVED `owner-admin` login, performed by `login.spec.ts`'s own
 *   "S1" test (A1/A2 need to WATCH that specific submission — restoring a
 *   snapshot skips the login FORM entirely, so it cannot stand in for that
 *   observation), then fed into this cache via `PersonaCache.primeOwnerAdmin()`.
 * - 1 LIVE-OBSERVED `store-user` login, performed by `login.spec.ts`'s D3
 *   test the same way, fed in via `PersonaCache.primeStoreUser()`.
 * - 2 more spent by `login.spec.ts` directly: A3's bad-password attempt,
 *   and D1's real re-login after `logout()`.
 *
 * `owner-admin-with-products` and `store-user-with-products` cost ZERO extra
 * logins — they are derived by restoring/merging captured snapshots, never
 * by logging in again.
 *
 * ## Each persona mints independently (fix for a real budget-breaking bug)
 * `createPersonaCache()` memoizes FOUR separate promises, one per
 * `PersonaKind`, each built from the others via plain function calls
 * (`getOwnerAdmin`/`getStoreUser`/...). Resolving `owner-admin` NEVER
 * triggers any work related to `store-user`, and vice versa — this is load
 * bearing for the budget above: `login.spec.ts`'s REQ-11 test restores
 * `owner-admin` (already primed by S1) BEFORE it has primed `store-user`,
 * and that restore must not pay for an invisible fallback `store-user`
 * mint+login+product-seed just because the other slot isn't primed yet. An
 * earlier version of this file minted the whole 4-persona chain eagerly on
 * the first `resolve()` call for ANY persona, which broke exactly that.
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
  /**
   * Lets a test that already performed its OWN real, live-observed
   * `owner-admin` register+login (needed to watch the overlay/network for
   * A1/A2 — restoring a snapshot skips the form entirely, so it cannot
   * stand in for that observation) feed that exact session into the cache.
   * The rest of the chain (StoreUser creation, seeding) then continues from
   * it instead of paying for a second, invisible login — this is what keeps
   * the whole default run at exactly 4 real logins (design.md §2): the ONE
   * `owner-admin` login is shared between the live-observed test and every
   * persona derived from it, never paid for twice.
   */
  primeOwnerAdmin(page: Page, identity: TestIdentity): Promise<void>;
  /**
   * Same idea as `primeOwnerAdmin()`, for the StoreUser's own live-observed
   * login (REQ-11's "sin productos" half needs to watch a real submission
   * land on `/sales/products`, the same way D2 does for the owner). The
   * `store-user-with-products` merge (step 7) waits for this before it runs.
   */
  primeStoreUser(page: Page, identity: TestIdentity): Promise<void>;
}

/**
 * Reads `selectedStoreId` off the app's own `currentUser` record — the same
 * seam the app itself writes to (`auth-store.ts` `StorageService.setCurrentUser`).
 */
export async function readSelectedStoreId(page: Page): Promise<string> {
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
  // `lizoft.device-dek` (device-dek-table.ts:16) is deliberately NOT captured.
  //
  // It is the localStorage HALF of the device wrap: the other half is a
  // non-extractable `CryptoKey` in IndexedDB (device-key-store.ts), which
  // `context.storageState()` does not carry and which no fixture can ever
  // replay — non-extractable means the bytes are unreachable from JS, by
  // design, permanently.
  //
  // Capturing it produced a restored session that is provisioned on paper and
  // unrecoverable in fact: `getDek()` null + `hasDeviceDekWrap()` true makes
  // `needsUnlock` return true (unlock-gate.ts:21), so every snapshot-restored
  // page landed on the unlock prompt instead of its route. That is the app
  // behaving CORRECTLY — it is scenario F4, a device whose key is gone — but
  // it is a lie about this snapshot, which is simply a different browser
  // context that was never provisioned at all. Dropping the key makes the
  // restored session honest about that, and costs no coverage: the
  // device-wrap paths are covered end to end by T10/F4 in
  // login-offline.spec.ts, which run in their own real context.
  //
  // The SAME honesty rule applies to the six encrypted business entities
  // (`lizoft.store-*` with an `enc:v1:` value, entity-crypto.ts). The mint
  // writes them ciphertext because the DEK is in memory during the real
  // login; a snapshot-restored context has no DEK (module-level `let`,
  // data-key-store.ts), so the first page that reads the entity
  // (`/sales/products`, the owner-admin homePath) throws
  // `MissingDataKeyError`, the app-wide decryption-failure policy logs the
  // user out with the `ENCRYPTION.KEY_UNAVAILABLE` dialog, and every
  // downstream assertion dies waiting on the login page. Plaintext entity
  // values (the `*-with-products` personas seed AFTER restore, when no DEK
  // is present, so their bytes are honest plaintext) stay captured — the
  // filter is by ciphertext marker, not by key prefix.
  const localStorage = originState.localStorage.filter(
    (entry) =>
      entry.name !== 'lizoft.device-dek' &&
      !(entry.name.startsWith('lizoft.store-') && entry.value.startsWith('enc:v1:'))
  );
  return { localStorage, identity, selectedStoreId, homePath };
}

/** Replays a captured snapshot's localStorage onto `page` — the shared core
 * of both `restoreSignedInSession()` (used by the `signedInPage` fixture)
 * and the chain's own primed-branch continuation below. */
async function applySnapshot(page: Page, snapshot: CapturedSnapshot): Promise<void> {
  await page.goto('/login');
  await page.evaluate((entries) => {
    for (const { name, value } of entries) {
      window.localStorage.setItem(name, value);
    }
  }, snapshot.localStorage);
  await page.goto(snapshot.homePath);
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
export async function createStoreUserViaUi(ownerPage: Page, identity: TestIdentity): Promise<void> {
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
 * Mints (or reuses a primed) `owner-admin` snapshot. Called at most once per
 * worker — the caller (`createPersonaCache`) memoizes the returned promise.
 *
 * If `primed` is set (a test already logged in live and called
 * `PersonaCache.primeOwnerAdmin()`), this resolves it with ZERO extra
 * network cost — it does not touch the browser at all. That is the fix for
 * the bug verify caught (CRITICAL-1): resolving `owner-admin` must never pay
 * for a second, invisible login just because some OTHER persona
 * (`store-user`) has not been primed yet — each persona's cost is now
 * independent of every other persona's priming state.
 */
async function mintOwnerAdmin(
  browser: Browser,
  primed: CapturedSnapshot | null
): Promise<CapturedSnapshot> {
  if (primed) {
    return primed;
  }

  // Fallback: real registration + real login (its own login cost) — keeps
  // this engine self-sufficient for a future consumer that never primes it.
  const context = await browser.newContext();
  const page = await context.newPage();

  const ownerIdentity = newTestIdentity();
  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fillValidForm(ownerIdentity);
  await registerPage.acceptTerms.check();
  await registerPage.submit();
  await page.waitForURL(/\/login$/);

  const loginPage = new LoginPage(page);
  await loginPage.fill(ownerIdentity);
  await loginPage.submit();
  await page.waitForURL(/\/sales\/products$/);

  const ownerStoreId = await readSelectedStoreId(page);
  const snapshot = await captureSnapshot(context, page, ownerIdentity, ownerStoreId, '/sales/products');
  await context.close();
  return snapshot;
}

/**
 * Mints (or reuses a primed) `store-user` snapshot. Depends on `owner-admin`
 * ONLY when it actually needs to create the StoreUser via the UI (unprimed
 * fallback) or to check the R5 storeId invariant below — `getOwnerAdmin` is
 * itself memoized by the caller, so this dependency never costs a second
 * `owner-admin` login.
 */
async function mintStoreUser(
  browser: Browser,
  primed: CapturedSnapshot | null,
  getOwnerAdmin: () => Promise<CapturedSnapshot>
): Promise<CapturedSnapshot> {
  const ownerSnapshot = await getOwnerAdmin();

  // R5 (design.md §11): both personas MUST share a storeId by construction —
  // the StoreUser is created from INSIDE the owner's own store
  // (user-create.tsx:20,43). Asserted for BOTH the primed and unprimed path,
  // before step 7's merge (`mintStoreUserWithProducts`) trusts it.
  const assertSharedStoreId = (storeUserStoreId: string): void => {
    if (storeUserStoreId !== ownerSnapshot.selectedStoreId) {
      throw new Error(
        `[persona:store-user-with-products] storeId mismatch: owner=${ownerSnapshot.selectedStoreId}, ` +
          `store-user=${storeUserStoreId}. design.md R5 assumed these always match because the ` +
          "StoreUser is created inside the owner's own store (user-create.tsx:20,43)."
      );
    }
  };

  if (primed) {
    assertSharedStoreId(primed.selectedStoreId);
    return primed;
  }

  // Fallback: create the StoreUser from a fresh context restoring the
  // owner's own (already-minted) session — zero logins, POST /v1/storeusers
  // has no rate limit (design.md §2) — then log in as that StoreUser for
  // real, in ITS OWN context.
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await applySnapshot(ownerPage, ownerSnapshot);

  const storeUserIdentity = newTestIdentity();
  await createStoreUserViaUi(ownerPage, storeUserIdentity);
  await ownerContext.close();

  const storeUserContext = await browser.newContext();
  const storeUserPage = await storeUserContext.newPage();
  const storeUserLoginPage = new LoginPage(storeUserPage);
  await storeUserLoginPage.goto();
  await storeUserLoginPage.fill(storeUserIdentity);
  await storeUserLoginPage.submit();
  await storeUserPage.waitForURL(/\/sales\/products$/);
  const storeUserStoreId = await readSelectedStoreId(storeUserPage);
  assertSharedStoreId(storeUserStoreId);

  const snapshot = await captureSnapshot(
    storeUserContext,
    storeUserPage,
    storeUserIdentity,
    storeUserStoreId,
    '/sales/products'
  );
  await storeUserContext.close();
  return snapshot;
}

/**
 * Derives `owner-admin-with-products` from the (memoized) `owner-admin`
 * snapshot: seeds one category + one sellable product via the real UI
 * (store-seed.ts) — zero network requests (GlobalConfig.USE_ONLINE_SERVICE =
 * false) — on a fresh ephemeral context, then re-derives the resulting home
 * path the SAME way A7/D6 do at runtime (visit /login, let
 * guestOnlyLoader's resolveUserHomePath decide) instead of hardcoding it —
 * self-verifying, and it fails loudly if seeding silently didn't take. Costs
 * ZERO extra logins.
 */
async function mintOwnerAdminWithProducts(
  browser: Browser,
  getOwnerAdmin: () => Promise<CapturedSnapshot>
): Promise<CapturedSnapshot> {
  const ownerSnapshot = await getOwnerAdmin();

  const context = await browser.newContext();
  const page = await context.newPage();
  await applySnapshot(page, ownerSnapshot);

  await seedCategoryAndProduct(page, `E2E Product ${ownerSnapshot.identity.login}`);
  await page.goto('/login');
  await page.waitForURL(/\/sales\/new$/);
  const homePath = new URL(page.url()).pathname;

  const snapshot = await captureSnapshot(
    context,
    page,
    ownerSnapshot.identity,
    ownerSnapshot.selectedStoreId,
    homePath
  );
  await context.close();
  return snapshot;
}

/**
 * `store-user-with-products` = the store-user's OWN session identity + the
 * entity keys (categories/products) `owner-admin-with-products`'s seeding
 * wrote, merged because both personas share a storeId (asserted by
 * `mintStoreUser`'s R5 check). Both sides of this merge were produced by the
 * app itself — never a hand-built key (design.md §3 "El paso 7 merece
 * defensa explícita"). Costs ZERO extra logins — both dependencies are
 * memoized promises.
 */
async function mintStoreUserWithProducts(
  getStoreUser: () => Promise<CapturedSnapshot>,
  getOwnerAdminWithProducts: () => Promise<CapturedSnapshot>
): Promise<CapturedSnapshot> {
  const [storeUserSnapshot, ownerWithProductsSnapshot] = await Promise.all([
    getStoreUser(),
    getOwnerAdminWithProducts(),
  ]);

  const entityEntries = ownerWithProductsSnapshot.localStorage.filter(
    (entry) =>
      entry.name.startsWith('lizoft.store-') && entry.name.endsWith(`-${storeUserSnapshot.selectedStoreId}`)
  );
  return {
    ...storeUserSnapshot,
    localStorage: [...storeUserSnapshot.localStorage, ...entityEntries],
    homePath: ownerWithProductsSnapshot.homePath,
  };
}

/**
 * Worker-scoped cache (design.md §3 "Costo amortizado"). Fixes CRITICAL-1
 * from the verify report: each of the four personas is memoized and minted
 * INDEPENDENTLY, lazily, on its own first `resolve()`/derived-dependency
 * call — never as a single eager "mint everything" step. Resolving
 * `owner-admin` no longer has any side effect on `store-user` (or vice
 * versa): a test may prime/resolve `owner-admin` and leave `store-user`
 * completely untouched until it is primed or resolved on its own. A spec
 * that never destructures `signedInPage` triggers zero registrations and
 * zero logins (REQ-5, opt-in).
 */
export function createPersonaCache(browser: Browser): PersonaCache {
  let primedOwnerAdmin: CapturedSnapshot | null = null;
  let primedStoreUser: CapturedSnapshot | null = null;

  let ownerAdminPromise: Promise<CapturedSnapshot> | null = null;
  let storeUserPromise: Promise<CapturedSnapshot> | null = null;
  let ownerAdminWithProductsPromise: Promise<CapturedSnapshot> | null = null;
  let storeUserWithProductsPromise: Promise<CapturedSnapshot> | null = null;

  function getOwnerAdmin(): Promise<CapturedSnapshot> {
    ownerAdminPromise ??= mintOwnerAdmin(browser, primedOwnerAdmin);
    return ownerAdminPromise;
  }

  function getStoreUser(): Promise<CapturedSnapshot> {
    storeUserPromise ??= mintStoreUser(browser, primedStoreUser, getOwnerAdmin);
    return storeUserPromise;
  }

  function getOwnerAdminWithProducts(): Promise<CapturedSnapshot> {
    ownerAdminWithProductsPromise ??= mintOwnerAdminWithProducts(browser, getOwnerAdmin);
    return ownerAdminWithProductsPromise;
  }

  function getStoreUserWithProducts(): Promise<CapturedSnapshot> {
    storeUserWithProductsPromise ??= mintStoreUserWithProducts(getStoreUser, getOwnerAdminWithProducts);
    return storeUserWithProductsPromise;
  }

  async function prime(
    slot: 'owner-admin' | 'store-user',
    page: Page,
    identity: TestIdentity
  ): Promise<void> {
    const alreadyResolving = slot === 'owner-admin' ? ownerAdminPromise : storeUserPromise;
    if (alreadyResolving) {
      // Idempotent: the persona was already resolved by another test in the
      // same worker (e.g. restoreSignedInSession). Capture this test's own
      // live-observed snapshot as the primed value so derived personas
      // (owner-admin-with-products, store-user-with-products) build from it.
      const selectedStoreId = await readSelectedStoreId(page);
      const homePath = new URL(page.url()).pathname;
      const snapshot = await captureSnapshot(page.context(), page, identity, selectedStoreId, homePath);
      if (slot === 'owner-admin') {
        primedOwnerAdmin = snapshot;
      } else {
        primedStoreUser = snapshot;
      }
      return;
    }
    const selectedStoreId = await readSelectedStoreId(page);
    const homePath = new URL(page.url()).pathname;
    const snapshot = await captureSnapshot(page.context(), page, identity, selectedStoreId, homePath);
    if (slot === 'owner-admin') {
      primedOwnerAdmin = snapshot;
    } else {
      primedStoreUser = snapshot;
    }
  }

  return {
    primeOwnerAdmin: (page, identity) => prime('owner-admin', page, identity),
    primeStoreUser: (page, identity) => prime('store-user', page, identity),

    resolve(kind: PersonaKind): Promise<CapturedSnapshot> {
      switch (kind) {
        case 'owner-admin':
          return getOwnerAdmin();
        case 'store-user':
          return getStoreUser();
        case 'owner-admin-with-products':
          return getOwnerAdminWithProducts();
        case 'store-user-with-products':
          return getStoreUserWithProducts();
      }
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
 *
 * Callable more than once per test with different personas — a test needing
 * multiple sessions in sequence (e.g. D3, which restores `owner-admin` to
 * create a StoreUser and later restores `store-user-with-products`) may call
 * this directly, not just through the `signedInPage` fixture (which resolves
 * exactly once, from the `persona` option).
 */
export async function restoreSignedInSession(
  page: Page,
  cache: PersonaCache,
  persona: PersonaKind
): Promise<SignedInSession> {
  const snapshot = await cache.resolve(persona);
  await applySnapshot(page, snapshot);

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
