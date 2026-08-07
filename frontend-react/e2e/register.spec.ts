import { test, expect } from './support/test';
import { RegisterPage } from './support/register-page';
import { newTestIdentity } from './support/identity';

// Literal Spanish copy asserted below, cited from
// apps/web-store-pos/app/shared/lib/i18n/es.ts (design.md §8). Hardcoded
// rather than imported: the browser is the black box under test, the app's
// own source is not.
const STORE_NAME_REQUIRED_TEXT = 'Nombre de la tienda es requerido'; // es.ts:350 + :795
const PASSWORD_POLICY_TEXT =
  'La contraseña debe tener al menos 8 caracteres, un número y una letra en mayúscula'; // es.ts:354-355
const PASSWORD_MISMATCH_TEXT = 'Las contraseñas no son iguales'; // es.ts:356
const OFFLINE_BANNER_TEXT = 'Estás offline. Se requiere conexión para registrarte.'; // es.ts:116
// The client's generic fallback (register.tsx:135). REQ-6 must prove the
// banner is NOT this — that would mean `description` arrived `undefined`.
const GENERIC_VALIDATION_ERROR_TEXT = 'Error de validación. Por favor, revise sus datos.'; // es.ts:125

test.describe('register — client-side validation (REQ-1..REQ-5, REQ-7)', () => {
  test('REQ-1: submit stays disabled until terms are accepted', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillValidForm(newTestIdentity());

    // A genuine failure here is the submit button already enabled with the
    // checkbox unticked. A misconfigured dev server would instead fail
    // earlier, at `goto()` or `fillValidForm()`, for an unrelated reason —
    // this assertion cannot confuse the two.
    await expect(registerPage.submitButton).toBeDisabled();

    await registerPage.acceptTerms.check();
    await expect(registerPage.submitButton).toBeEnabled();
  });

  test('REQ-2: an empty storeName blocks the submit client-side', async ({
    page,
    registerNetwork,
  }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillValidForm(newTestIdentity(), { storeName: '' });
    await registerPage.acceptTerms.check();
    await registerPage.submit();

    // Wait for the UI effect BEFORE asserting zero requests (design.md §3):
    // register.tsx's validation branch returns before ever calling
    // authHttpService.register, so once this text is visible the decision
    // not to call the API has already been made. No race to wait out.
    await expect(page.getByText(STORE_NAME_REQUIRED_TEXT)).toBeVisible();
    registerNetwork.expectNoAttempt();
  });

  test('REQ-3: a single toggle reveals both password fields at once', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillValidForm(newTestIdentity());

    await expect(registerPage.password).toHaveAttribute('type', 'password');
    await expect(registerPage.passwordConfirmation).toHaveAttribute('type', 'password');

    await registerPage.togglePasswordVisibility.click();

    // A genuine failure: only one of the two fields flips, or the second
    // needed its own click. Both assertions must hold from a SINGLE click.
    await expect(registerPage.password).toHaveAttribute('type', 'text');
    await expect(registerPage.passwordConfirmation).toHaveAttribute('type', 'text');
  });

  test('REQ-4: a password outside the policy blocks the submit client-side', async ({
    page,
    registerNetwork,
  }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillValidForm(newTestIdentity(), {
      password: 'weak',
      passwordConfirmation: 'weak',
    });
    await registerPage.acceptTerms.check();
    await registerPage.submit();

    await expect(page.getByText(PASSWORD_POLICY_TEXT)).toBeVisible();
    registerNetwork.expectNoAttempt();
  });

  test('REQ-5: a mismatched confirmation shows the expected message', async ({
    page,
    registerNetwork,
  }) => {
    const identity = newTestIdentity();
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillValidForm(identity, {
      passwordConfirmation: `${identity.password}x`,
    });
    await registerPage.acceptTerms.check();
    await registerPage.submit();

    await expect(page.getByText(PASSWORD_MISMATCH_TEXT)).toBeVisible();
    registerNetwork.expectNoAttempt();
  });

  test('REQ-7: offline blocks the submit and shows the offline banner', async ({
    page,
    registerNetwork,
  }) => {
    const registerPage = new RegisterPage(page);
    // Order matters (design.md §4): go online first so the SPA bundle
    // actually loads, THEN fill the form, THEN flip offline, THEN submit.
    // Going offline before `goto()` would fail the page load itself, for the
    // wrong reason.
    await registerPage.goto();
    await registerPage.fillValidForm(newTestIdentity());
    await registerPage.acceptTerms.check();
    await page.context().setOffline(true);
    await registerPage.submit();

    await expect(page.getByText(OFFLINE_BANNER_TEXT)).toBeVisible();
    registerNetwork.expectNoAttempt();
  });
});

test.describe.serial('register — one real registration + one duplicate 400 (REQ-6, REQ-8)', () => {
  // Both tests deliberately share ONE identity (design.md §5, §7): the
  // second test's 400 only means something if the first test's registration
  // actually happened. `describe.serial` enforces that order AND skips the
  // rest of the block if the first test fails — the correct behavior, since
  // a duplicate-login 400 proves nothing without proof a prior registration
  // created that login.
  const identity = newTestIdentity();

  test('REQ-8: a successful registration lands on /login, unauthenticated', async ({
    page,
    registerNetwork,
  }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    // email left empty on purpose — this is the ONE real registration this
    // whole file performs (design.md §5): the server accepts an empty email
    // (RegisterCommandValidator.cs:36-39 skips the rule entirely when it is
    // empty), and the follow-up REQ-6 test needs that same emptiness.
    await registerPage.fillValidForm(identity);
    await registerPage.acceptTerms.check();
    await registerPage.submit();

    const response = await registerNetwork.waitForResponse();
    // A genuine failure: any status other than 201. A quota hit (429) or a
    // misdirected request throw their own diagnostic from inside
    // `waitForResponse()` before this line is even reached.
    expect(response.status).toBe(201);

    await expect(page).toHaveURL(/\/login$/);
    // REQ-8's second half — no authenticated session was created by a
    // registration alone. `/login`'s own `guestOnlyLoader` (auth/routes/
    // loaders.ts:42-59) redirects an ALREADY-authenticated visitor away to
    // their home path; landing here and seeing the login form is proof, not
    // an assumption, that no session exists.
    await expect(page.locator('input#login')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
  });

  test('REQ-6: an empty email reaches the API; the literal 400 text is shown', async ({
    page,
    registerNetwork,
  }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    // Same login as the previous test -> guaranteed duplicate -> deterministic
    // 400 (design.md H2: an empty email alone never produces a 400
    // server-side; `MustAsync(IsUniqueName)` on the duplicate login does).
    await registerPage.fillValidForm(identity);
    await registerPage.acceptTerms.check();
    await registerPage.submit();

    const response = await registerNetwork.waitForResponse();
    expect(response.status).toBe(400);

    const [attempt] = registerNetwork.attempts();
    // Proves the email genuinely traveled empty over the wire, not just
    // that client validation allowed it (auth-http-service.ts:29-36
    // includes `email` in the body unconditionally).
    expect(attempt?.postData?.email).toBe('');

    const body = JSON.parse(response.bodyText) as { errors: Array<{ description: string }> };
    const banner = page.getByText(body.errors[0].description, { exact: true });

    // Two assertions, both required (design.md §5): the first fixes
    // PROVENANCE (the painted text is byte-for-byte what the server sent);
    // the second rules out the false positive of `description` arriving
    // `undefined` and register.tsx falling back to
    // REGISTRATION.VALIDATION_ERROR (the generic client string).
    await expect(banner).toBeVisible();
    await expect(banner).not.toHaveText(GENERIC_VALIDATION_ERROR_TEXT);
  });
});
