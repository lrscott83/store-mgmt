import { test, expect } from './support/test';
import { assertStoresFeature, degradeStoreToFreePlan } from './support/store-fixture';
import { installStoreNetworkObserver } from './support/store-network-observer';

/**
 * [S2-01] DG-7 — El OwnerAdmin activa el plan pago una sola vez, en una sola
 * dirección (`docs/testing/e2e-stage-1/S2-01.md`). Covers the 11 UI
 * assertions of that scenario.
 *
 * `test()` #1 walks the FULL diagram end to end (design.md §2): restore →
 * seed free plan → assertions 1,2,3,8,9,10 → save → assertions 4,5 →
 * reload → assertions 6,7. It is built incrementally across three commits
 * (tasks.md §0) — never split into three separate `test()`s, because
 * pinning "already on the paid plan" without going through the save flow
 * itself would need a helper the design deliberately does not offer
 * (`degradeStoreToFreePlan` is one-directional on purpose, design.md D1).
 *
 * `test()` #2 (added later, WU-6) covers assertion 11 in isolation — it
 * does not share state with `test()` #1.
 *
 * Literal Spanish copy asserted below is cited from
 * `apps/web-store-pos/app/shared/lib/i18n/es.ts` — the browser is the black
 * box under test, the app's own source is not (same policy as
 * `login.spec.ts:14-17`, `login-offline.spec.ts:29-32`).
 */
const PAID_ACTIVATE_TEXT = 'Activar este plan'; // es.ts:643
const WILL_ACTIVATE_TEXT = 'Se activará al guardar'; // es.ts:644
const ACTIVE_BADGE_TEXT = 'Activo'; // es.ts:639
const SELECTED_TEXT = 'Plan seleccionado'; // es.ts:642
const STORES_ERROR_TEXT = 'Ocurrió un error. Intente de nuevo.'; // es.ts:632

test.use({ persona: 'owner-admin' });

test('OwnerAdmin activa el plan pago una sola vez', async ({ signedInPage, loginNetwork }) => {
  const { page, selectedStoreId } = signedInPage;

  // REQ-13/D9 — asserted BEFORE anything else: turns a silent logout
  // (H-7/H-8, adminFeatureLoader without the Stores feature) into a
  // readable failure instead of every downstream assertion failing for the
  // wrong reason.
  await assertStoresFeature(page);

  // D1/REQ-12 — real precondition: PUT /v1/stores/{id} with moduleIds
  // limited to the catalog's priceIncluded ids, never hardcoded. H-1 means
  // the auto-registered store starts on the PAID plan, so this seed is what
  // makes the free-plan half of DG-7 reachable at all.
  //
  // G2 — DECLARED GAP, not assumed: no /me runs between this degrade and
  // the save below, so whether `Stores=73` survives the downgrade is never
  // observed here — neither broken nor confirmed. See
  // docs/testing/e2e-stage-1/S2-01.md.
  const { allIds } = await degradeStoreToFreePlan(page, selectedStoreId);

  await page.goto('/management/stores');

  const paidTab = page.getByRole('tab', { name: /Pago/ });
  const freeTab = page.getByRole('tab', { name: /Gratis/ });

  // Aserción 1 (REQ-1): with the store on the free plan, the ACTIVATE
  // button renders on the non-selected (paid) tab.
  await paidTab.click();
  const activateButton = page.getByRole('button', { name: PAID_ACTIVATE_TEXT });
  await expect(activateButton).toBeVisible();

  // Aserción 2 (REQ-2): choosing the paid plan WITHOUT saving shows the
  // "will activate on save" notice. This click also mutates the form's
  // local moduleIds (choosePlan) — voluntary, so the notice becomes
  // observable; it does not interfere with assertion 3 below (design.md §2
  // note, tasks.md WU-4).
  await activateButton.click();
  await expect(page.getByText(WILL_ACTIVATE_TEXT)).toBeVisible();

  // Aserción 3 (REQ-3): the ACTIVE badge still marks the free tab — the
  // REAL active plan (derived from modules), not the tab the OwnerAdmin
  // just selected without saving.
  await expect(freeTab.getByText(ACTIVE_BADGE_TEXT)).toBeVisible();
  await expect(paidTab.getByText(ACTIVE_BADGE_TEXT)).toHaveCount(0);

  // Aserción 8 (REQ-8): paymentStartDate never renders for an OwnerAdmin —
  // gated by `isSuperAdmin && isEditMode` (store-form.tsx:217).
  await expect(page.locator('#store-payment-start')).toHaveCount(0);

  // Aserción 9 (REQ-9): isActive never renders for an OwnerAdmin — gated by
  // `isSuperAdmin` alone (store-form.tsx:234).
  await expect(page.locator('#store-is-active')).toHaveCount(0);

  // Aserción 10 — TRUE form per H-16 (corrects S2-01.md:62, which said
  // "disabled"): the owner selector does not render at all for an
  // OwnerAdmin. `isAdminUser = isSuperAdmin || isOwnerAdmin`
  // (store-form.tsx:69,179) is false here because `isOwnerAdmin` in
  // edit-store.tsx:37 is `isSuperAdmin || hasOwnersAvailableFeature(user)` —
  // NOT the `user.isOwnerAdmin` flag — and `hasOwnersAvailableFeature`
  // requires the `Owners` feature, which no store ever carries (it hangs
  // off `ModuleType.Administration`, seeded `availableToStore: false`,
  // `ModuleEntityTypeConfiguration.cs:39`). See H-16
  // (docs/testing/e2e-stage-1/README.md).
  await expect(page.locator('#store-owner')).toHaveCount(0);

  // WU-5 — save round-trip. Installed AFTER the DOM assertions above so the
  // PUT it watches for is unambiguously the save click below, not some
  // earlier request (same pattern as any-request-observer.ts in
  // login-offline.spec.ts).
  const storeObserver = installStoreNetworkObserver(page, selectedStoreId);
  storeObserver.markDocumentBaseline();

  await page.getByRole('button', { name: 'Guardar' }).click();

  const putCapture = await storeObserver.waitForPutResponse();
  // Aserción 4 (REQ-4): the PUT's moduleIds is the FULL union of free+paid
  // modules, not just the paid ones — getPlanModuleIds(modules, 'paid')
  // returns modules.map(m => m.id) unfiltered (plan-picker.tsx:26-27,49).
  expect([...putCapture.moduleIds].sort((a, b) => a - b)).toEqual(
    [...allIds].sort((a, b) => a - b)
  );

  await loginNetwork.waitForMeRequest();
  await page.waitForURL(/\/management\/stores$/);

  // Aserción 5 (REQ-5): session refreshed via GET /v1/auth/me strictly
  // AFTER the PUT response (not merely "both happened"), exactly once, and
  // with zero full-page reloads — measured via the document-request
  // counter (D6), never assumed from reading edit-store.tsx's source.
  storeObserver.expectPutThenMe();
  storeObserver.expectNoDocumentSince('tras guardar el plan pago');
  loginNetwork.expectMeRequestCount(1);

  // WU-6 — the flow's own explicit "reload the screen" step (S2-01.md's
  // flow, step 4). This is a SEPARATE act from assertion 5 above, which
  // demonstrated the save itself never reloads — the two are not in
  // contradiction; the US just performs its own reload afterward.
  await page.reload();

  // Aserción 6 (REQ-6): once truly on the paid plan, the ACTIVATE button no
  // longer exists in the DOM in EITHER tab — isOnPaidPlan is now true, so
  // `readOnly` hides it unconditionally (plan-picker.tsx:100), regardless
  // of which tab is selected.
  await expect(page.getByRole('button', { name: PAID_ACTIVATE_TEXT })).toHaveCount(0);
  await freeTab.click();
  await expect(page.getByRole('button', { name: PAID_ACTIVATE_TEXT })).toHaveCount(0);
  await paidTab.click();
  await expect(page.getByRole('button', { name: PAID_ACTIVATE_TEXT })).toHaveCount(0);

  // Aserción 7 (REQ-7, design.md D7): the tabs stay clickable — clicking
  // changes `aria-selected` and the visible panel — but no click mutates
  // `moduleIds`. `onChange` hangs only off the (now permanently absent)
  // ACTIVATE button, so there is no event to observe directly; the negative
  // is shown through the panel's content and the badge's position instead.
  await freeTab.click();
  await expect(freeTab).toHaveAttribute('aria-selected', 'true');
  const tabPanel = page.getByRole('tabpanel');
  await expect(tabPanel.getByText(SELECTED_TEXT)).toHaveCount(0);
  await expect(tabPanel.getByRole('button', { name: PAID_ACTIVATE_TEXT })).toHaveCount(0);
  await expect(tabPanel.getByText(WILL_ACTIVATE_TEXT)).toHaveCount(0);
  await expect(paidTab.getByText(ACTIVE_BADGE_TEXT)).toBeVisible();
  await expect(freeTab.getByText(ACTIVE_BADGE_TEXT)).toHaveCount(0);

  // Back to the paid tab: SELECTED reappears there — proof `selected` never
  // moved when the free tab was clicked above.
  await paidTab.click();
  await expect(tabPanel.getByText(SELECTED_TEXT)).toBeVisible();
});

/**
 * Aserción 11 (REQ-11) — isolated from `test()` #1: `route.abort()` does
 * not touch the store's data (D5), so no shared state, no ordering
 * dependency between the two tests.
 *
 * Intercepts `GET /v1/modules/ToStore` — the narrowest of the three
 * `Promise.all` requests (`edit-store.tsx:49-53`) — and aborts it at the
 * origin. This is NOT a mock: `abort()` fabricates no response body; it
 * reproduces a network condition a real environment produces every day
 * (design.md D5, precedent `login.spec.ts:351`: "the honest simulation of
 * 'the server is not there' is cutting the request at the origin").
 *
 * Covers the `.catch()` branch at `edit-store.tsx:80-82`.
 *
 * G1 — DECLARED GAP, not disguised: this does NOT cover the
 * `succeeded === false` branch (`edit-store.tsx:55-58`) that S2-01.md's
 * assertion 11 literally cites. Reaching that branch needs a fabricated
 * 200 response body — a real mock — which design.md D5 rejects. See
 * docs/testing/e2e-stage-1/S2-01.md and README.md.
 */
test('fallo de carga muestra STORES.ERROR y no monta el formulario', async ({ signedInPage }) => {
  const { page } = signedInPage;

  await page.route('**/v1/modules/ToStore', (route) => route.abort());
  await page.goto('/management/stores');

  await expect(page.getByRole('alert')).toHaveText(STORES_ERROR_TEXT);
  await expect(page.locator('#store-name')).toHaveCount(0);
});
