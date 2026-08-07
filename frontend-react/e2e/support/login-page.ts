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
    await this.login.fill(identity.login);
    await this.password.fill(identity.password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
