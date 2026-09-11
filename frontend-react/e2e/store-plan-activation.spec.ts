import { test, expect } from './support/test';
import { assertStoresFeature, degradeStoreToFreePlan } from './support/store-fixture';
import { installPlanChangeObserver } from './support/plan-change-observer';

/**
 * [S2-01 → owner-plan-change] DG-7, repurposada (authorized update, T7.2):
 * El OwnerAdmin cambia el plan de su tienda en cualquier dirección, a través
 * de POST /v1/stores/{id}/change-plan (design.md AD7: el lock readOnly está
 * muerto; la autoridad es el ownership guard del backend).
 *
 * `test()` #1 walks the full diagram end to end: restore → seed free plan →
 * DOM assertions → click activation → POST observed (no moduleIds PUT, no
 * store payload) → re-read reflection without reload. It stays ONE test —
 * splitting would spend a login the ceiling does not have (see the
 * login-budget comment below).
 *
 * `test()` #2 (WU-6) covers the load-failure branch in isolation — it does
 * not share state with `test()` #1.
 *
 * Literal Spanish copy asserted below is cited from
 * `apps/web-store-pos/app/shared/lib/i18n/es.ts` — the browser is the black
 * box under test, the app's own source is not (same policy as
 * `login.spec.ts:14-17`, `login-offline.spec.ts:29-32`).
 */
const ACTIVATE_TEXT = 'Activar Plan'; // es.ts STORES.PLAN.ACTIVATE_PLAN (owner-plan-change)
const ACTIVE_BADGE_TEXT = 'Activo'; // es.ts STORES.PLAN.ACTIVE_BADGE
// GENERAL.OFFLINE (es.ts) — the plan view classifies a network cut as an
// OFFLINE failure via httpErrorKey (api-client tags requests with no server
// response), so the load-failure alert carries the connection message, not
// the generic STORES.ERROR.
const STORES_OFFLINE_TEXT = 'Sin conexión. Se requiere conexión a internet.'; // es.ts GENERAL.OFFLINE
// AD8 cumulative copy — the Pago panel of a FREE store names its catalog
// predecessor (Gratis) in the includes line (es.ts INCLUDES_PREVIOUS_PLAN).
const PAID_INCLUDES_PREVIOUS_TEXT = 'Incluye todo lo del plan Gratis y además:';

test.use({ persona: 'owner-admin' });

// SERIAL, and this is a budget constraint, not a style choice. The persona
// cache is scoped PER WORKER (session.ts:187), so two tests spread across two
// workers mint `owner-admin` TWICE — two real registrations and, fatally, two
// real logins against `LoginPolicy`'s ceiling of 5 per minute per IP
// (RateLimitPolicies.cs:15-24, H-12). One worker means ONE mint for the file.
//
// Learned the hard way on 2026-08-08: without this, the full suite pushed
// login.spec.ts's REQ-9 re-login past the ceiling and it was answered with a
// 429 — a PRE-EXISTING test turned red by this file's parallelism, with a
// banner reading `AUTH.TOO_MANY_ATTEMPTS`. login.spec.ts:88-96 already
// documented the rule ("ONE worker ... serializing this block is what
// guarantees the persona chain mints exactly [once]"); this file simply had
// not followed it.
//
// The suite's documented budget is 4 real logins against that ceiling of 5.
// This file spends THE remaining one. Anything added here that mints another
// persona breaks a different file's test, not this one — which is the failure
// mode that makes it worth spelling out.
//
// The 120s timeout mirrors login.spec.ts:97-105 for the same reason it does:
// the first test pays a mint, three seeding round-trips and a full activation
// cycle before its last assertion. Do NOT split it to fit 30s — splitting is
// exactly what would spend a login the ceiling does not have.
test.describe.configure({ mode: 'serial', timeout: 120_000 });

test('OwnerAdmin cambia el plan de su tienda vía POST change-plan', async ({
  signedInPage,
  loginNetwork,
}) => {
  const { page, selectedStoreId } = signedInPage;

  // REQ-13/D9 — asserted BEFORE anything else: turns a silent logout
  // (H-7/H-8, adminFeatureLoader without the Stores feature) into a
  // readable failure instead of every downstream assertion failing for
  // the wrong reason.
  await assertStoresFeature(page);

  // D1/REQ-12 — real precondition: the free-plan half is reached by
  // seeding the store back to the free plan (design.md D1, H-15: the API
  // rejects non-SuperAdmin module-set changes on paid stores, so direct-DB
  // seeding is the only seed available). The auto-registered store starts
  // on the paid plan, so without this the free→paid direction is unreachable.
  //
  // G2 — DECLARED GAP, not assumed: no /me runs between this degrade and
  // the activation below, so whether `Stores=73` survives the downgrade is
  // never observed here — neither broken nor confirmed. Same gap the
  // previous version declared.
  await degradeStoreToFreePlan(page, selectedStoreId);

  await page.goto('/management/stores');

  // The plan view renders collapsible panel headers (`plan-panels.tsx`):
  // each plan is a `<button aria-expanded>`; the banner shows the next
  // billing date ONLY while on a paid plan (hidden now).
  const paidHeader = page.getByRole('button', { name: /Pago/ });
  const freeHeader = page.getByRole('button', { name: /Gratis/ });

  // Aserción 1 (REQ-1): with the store on the free plan, the paid panel is
  // COLLAPSED by default — the activation button is not yet in the DOM.
  // Expanding the paid panel renders "Activar Plan".
  await expect(paidHeader).toHaveAttribute('aria-expanded', 'false');
  await paidHeader.click();
  await expect(paidHeader).toHaveAttribute('aria-expanded', 'true');
  const activateButton = page.getByRole('button', { name: ACTIVATE_TEXT });
  await expect(activateButton).toBeVisible();

  // Aserción 2 (REQ-2, owner-plan-change form): the two-step contract stays
  // dead — the first "Activar Plan" click IS the activation (the POST goes
  // out immediately, pinned below). Pinning the removed copy guards against
  // reintroducing it.
  await expect(page.getByText('Se activará al guardar')).toHaveCount(0);

  // AD8 (owner-plan-change): the paid panel of a FREE store carries the
  // cumulative copy naming the target's catalog predecessor — "Incluye todo
  // lo del plan Gratis y además:". This is the dialog copy contract.
  await expect(page.getByText(PAID_INCLUDES_PREVIOUS_TEXT)).toBeVisible();

  // Aserción 3 (REQ-3): the ACTIVE badge still marks the FREE header — the
  // REAL active plan (derived from the backend planType, plan-panels.tsx),
  // not the plan whose panel was just expanded without activating.
  await expect(freeHeader.getByText(ACTIVE_BADGE_TEXT)).toBeVisible();
  await expect(paidHeader.getByText(ACTIVE_BADGE_TEXT)).toHaveCount(0);

  // Aserción 8 (REQ-8): paymentStartDate never renders on the plan view for
  // an OwnerAdmin — the plan page is NOT the store-data form; it renders the
  // PlanPanels only (store-plan.tsx), so the payment-start date input of the
  // data form never exists here.
  await expect(page.locator('#store-payment-start')).toHaveCount(0);

  // Aserción 9 (REQ-9): isActive never renders on the plan view either —
  // same reason as 8: the data form's isActive control is not part of this
  // page.
  await expect(page.locator('#store-is-active')).toHaveCount(0);

  // Aserción 10 (REQ-10, H-16): the owner selector is part of the DATA form
  // (`#store-owner`, gated by `isAdminUser` in the form). The plan view does
  // not mount that form, so the selector cannot exist here.
  await expect(page.locator('#store-owner')).toHaveCount(0);

  // WU-5 — activation round-trip. Installed AFTER the DOM assertions above so
  // the POST it watches for is unambiguously the activation click below, not
  // some earlier request (same pattern as any-request-observer.ts in
  // login-offline.spec.ts).
  const observer = installPlanChangeObserver(page, selectedStoreId);
  observer.markDocumentBaseline();

  await activateButton.click();

  const capture = await observer.waitForChangePlanResponse();

  // Aserción 4 (REQ-4, owner-plan-change form): the activation is ONE POST
  // to /v1/stores/{id}/change-plan whose body carries ONLY the plan id —
  // the backend owns module rewriting. No moduleIds array, no store payload,
  // no anchor: the body cannot express them (ChangeStorePlanCommand is a
  // single int).
  expect(capture.status).toBe(200);
  expect(capture.rawBody).not.toContain('moduleIds');
  expect(capture.rawBody).not.toContain('paymentStartDate');
  expect(capture.storePlanId).not.toBeNull();

  // ANCHOR for the negative assertions below. The observable anchor is the
  // re-read reflection: after the POST, the page re-reads the store plan and
  // the PlanPanels effect re-expands to the newly active plan — the ACTIVE
  // badge moves to the paid header. That move only happens when the whole
  // handler ran to completion (changeStorePlan → getUserByToken →
  // getStorePlan → setPlan).
  await expect(paidHeader).toHaveAttribute('aria-expanded', 'true');
  await expect(paidHeader.getByText(ACTIVE_BADGE_TEXT)).toBeVisible();

  // Aserción 5 (REQ-5), en su forma VERDADERA — corregida el 2026-08-08 tras
  // el primer fallo real contra backend. La US afirmaba que tras activar la
  // app "refresca la sesión vía getUserByToken()", y de ahí se dedujo un
  // `GET /v1/auth/me`. Ese /me NO EXISTE: getUserByToken() corta por caché
  // cuando el perfil guardado coincide con el authToken vigente y retorna sin
  // tocar el backend (auth-store.ts). El corto es deliberado — el comentario
  // en auth-store.ts explica que Angular sí disparaba un /me de fondo y que se
  // quitó porque su 401 destruía la sesión de un usuario offline.
  loginNetwork.expectMeRequestCount(0);
  observer.expectExactlyOneChangePlanPost();
  // T7.1 regression: the old moduleIds PUT activation must not return.
  observer.expectNoStorePut();
  // "No reload" half, measured: the reflection above happened without a
  // document navigation — a `location.reload()`/hard navigation would fire one;
  // the handler's state updates (getUserByToken + getStorePlan) never do.
  observer.expectNoDocumentSince('tras activar el plan pago');

  // Aserción 6 (REQ-6, owner-plan-change form): on the paid plan the
  // ACTIVATE button is gone from the paid panel — not because of a readOnly
  // lock (dead, AD7) but because the panel is now the ACTIVE one (isActive
  // hides the action structurally). The plan can still be changed: the other
  // panels keep their activation action.
  await expect(page.getByRole('button', { name: ACTIVATE_TEXT, exact: true })).toHaveCount(0);

  // Aserción 7 (REQ-7, AD7): the FREE panel of the now-PAID store still
  // renders its activation action — the owner can change the plan in ANY
  // direction at any time. The DG-7 one-way lock is dead; this is the
  // assertion that fails if anyone resurrects it.
  await freeHeader.click();
  await expect(freeHeader).toHaveAttribute('aria-expanded', 'true');
  await expect(freeHeader.getByRole('button', { name: ACTIVATE_TEXT, exact: true })).toBeVisible();
  await expect(freeHeader.getByText(ACTIVE_BADGE_TEXT)).toHaveCount(0);
  await expect(paidHeader.getByText(ACTIVE_BADGE_TEXT)).toBeVisible();

  // The activation also wrote the plan id on the Store row (pin through the
  // re-read reflection the badge already showed — the observer's plan read
  // count proves the page re-fetched the plan after the POST).
  expect(observer.planReadCount()).toBeGreaterThanOrEqual(1);
});

/**
 * Aserción 11 (REQ-11) — isolated from `test()` #1: `route.abort()` does
 * not touch the store's data (D5), so no shared state, no ordering
 * dependency between the two tests.
 *
 * Intercepts `GET /v1/Features/available` — one of the three plan-view
 * requests (`store-plan.tsx`: getStorePlan, getPlans, getFeaturesToStore) —
 * and aborts it at the origin. This is NOT a mock: `abort()` fabricates no
 * response body; it reproduces a network condition a real environment
 * produces every day (design.md D5, precedent `login.spec.ts:351`: "the
 * honest simulation of 'the server is not there' is cutting the request at
 * the origin").
 *
 * The network cut is classified by `httpErrorKey` as an OFFLINE failure
 * (api-client tags requests with no server response), so the plan page
 * shows the connection message (GENERAL.OFFLINE) — NOT the generic
 * STORES.ERROR. Either way the panels never mount.
 *
 * Covers the `.catch()` branch at `store-plan.tsx`.
 *
 * G1 — DECLARED GAP, not disguised: this does NOT cover the
 * `succeeded === false` branch that S2-01.md's assertion 11 literally
 * cites. Reaching that branch needs a fabricated 200 response body — a
 * real mock — which design.md D5 rejects. Same gap the previous version
 * declared.
 */
test('fallo de carga por red muestra el mensaje de conexión y no monta los paneles', async ({
  signedInPage,
}) => {
  const { page } = signedInPage;

  await page.route('**/v1/Features/available', (route) => route.abort());
  await page.goto('/management/stores');

  await expect(page.getByRole('alert')).toHaveText(STORES_OFFLINE_TEXT);
  await expect(page.getByRole('button', { name: /Pago/ })).toHaveCount(0);
});
