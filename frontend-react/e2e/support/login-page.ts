import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import type { TestIdentity } from './identity';

/**
 * Page object for `/login` (design.md §5). Same selector policy as
 * `register-page.ts`: `#id` first, role + accessible name for the two
 * controls that don't have one, Spanish accessible names lifted from
 * `es.ts` — never a Tailwind class, never a new `data-testid` on
 * production code.
 */
export class LoginPage {
  readonly login: Locator;
  readonly password: Locator;
  readonly togglePasswordVisibility: Locator;
  readonly submitButton: Locator;
  /**
   * Verified trap #1 (login.tsx:185-186 + root.tsx:102): TWO elements carry
   * `role="status"` while a login is in flight — LoginPage's own overlay and
   * root.tsx's global request-counter overlay. `.first()` is not
   * decorative — without it Playwright throws a strict-mode violation the
   * moment both are mounted simultaneously (design.md H4).
   */
  readonly loadingOverlay: Locator;

  constructor(private readonly page: Page) {
    this.login = page.locator('#login');
    this.password = page.locator('#password');
    this.togglePasswordVisibility = page.getByRole('button', { name: 'Mostrar contraseña' });
    this.submitButton = page.getByRole('button', { name: 'Iniciar sesión' });
    this.loadingOverlay = page.getByRole('status').first();
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async fill(identity: Pick<TestIdentity, 'login' | 'password'>): Promise<void> {
    // The mint and registerAndLoginOnline reach /login via a CLIENT-side
    // navigation (register.tsx:120 `navigate('/login')`), and
    // `waitForURL(/login)` resolves at pushState — BEFORE the route commits.
    // The register form SHARES the `#login`/`#password` ids
    // (register.tsx:188,257) and stays in the DOM until the /login route's
    // async loader (`guestOnlyLoader`) resolves, so a naive fill can type
    // into the REGISTER form and lose the value when it unmounts (observed
    // flake: "El usuario es requerido" with the password filled — the commit
    // landed between the two fills).
    //
    // Anchor on the login page's OWN submit button first — it only exists
    // once the route swap committed and the register form is gone — then
    // fill and verify BOTH values stuck, re-filling until no late commit or
    // re-render can wipe them. On the happy path the poll passes on its
    // first iteration, so this adds no delay when the page is already ready.
    await expect(this.submitButton).toBeVisible();
    await expect
      .poll(
        async () => {
          await this.login.fill(identity.login);
          await this.password.fill(identity.password);
          return (
            (await this.login.inputValue()) === identity.login &&
            (await this.password.inputValue()) === identity.password
          );
        },
        {
          timeout: 10_000,
          message:
            `no pudo escribir login/password en el formulario de /login (la navegación ` +
            'client-side desde /register pudo haber desmontado el formulario con los valores)',
        }
      )
      .toBe(true);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
