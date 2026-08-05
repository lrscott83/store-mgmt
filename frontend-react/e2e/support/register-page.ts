import type { Locator, Page } from '@playwright/test';
import type { TestIdentity } from './identity';

type FillableField =
  | 'fullName'
  | 'login'
  | 'email'
  | 'cellPhone'
  | 'storeName'
  | 'password'
  | 'passwordConfirmation';

/**
 * Page object for `/register` (design.md §1, §8).
 *
 * Selector policy, in order of preference (design.md §8): `#id` for every
 * field that has one (all seven do, register.tsx:171-312), role + accessible
 * name for the two controls that don't (the password toggles and the submit
 * button).
 */
export class RegisterPage {
  readonly fullName: Locator;
  readonly login: Locator;
  readonly email: Locator;
  readonly cellPhone: Locator;
  readonly storeName: Locator;
  readonly password: Locator;
  readonly passwordConfirmation: Locator;
  readonly acceptTerms: Locator;
  /**
   * Both password fields share ONE `showPassword` boolean
   * (register.tsx:52-55), so both toggle buttons carry the same aria-label
   * at any given moment. `.first()` targets the password field's toggle —
   * enough, because REQ-3 asserts that clicking ONE toggle flips BOTH
   * fields' `type` attribute simultaneously (design.md §8, A3).
   */
  readonly togglePasswordVisibility: Locator;
  /**
   * Matched by its idle label only ('Registrar', es.ts:113). While a
   * submission is in flight the accessible name switches to 'Registrando...'
   * (AUTH.REGISTERING, es.ts:79); no test in this suite needs to locate the
   * button during that transient state. Named `submitButton` (not `submit`)
   * because `submit()` below is the click action — a class cannot have a
   * property and a method share one name.
   */
  readonly submitButton: Locator;

  constructor(private readonly page: Page) {
    this.fullName = page.locator('#fullName');
    this.login = page.locator('#login');
    this.email = page.locator('#email');
    this.cellPhone = page.locator('#cellPhone');
    this.storeName = page.locator('#storeName');
    this.password = page.locator('#password');
    this.passwordConfirmation = page.locator('#passwordConfirmation');
    this.acceptTerms = page.locator('#acceptTerms');
    this.togglePasswordVisibility = page
      .getByRole('button', { name: 'Mostrar contraseña' })
      .first();
    this.submitButton = page.getByRole('button', { name: 'Registrar', exact: true });
  }

  async goto(): Promise<void> {
    await this.page.goto('/register');
  }

  /**
   * Fills the seven text/tel fields with valid values from `identity`,
   * `email` defaulting to `''` (H2 — the field the server never requires).
   * Overrides let a scenario deliberately break exactly one field (REQ-2,
   * REQ-4, REQ-5) while everything else stays valid.
   *
   * Does NOT touch `acceptTerms` or click `submit` — REQ-1 needs to observe
   * the unchecked -> checked transition itself, so every other test toggles
   * `acceptTerms` explicitly before calling `submit()`.
   */
  async fillValidForm(
    identity: TestIdentity,
    overrides: Partial<Record<FillableField, string>> = {}
  ): Promise<void> {
    const values: Record<FillableField, string> = {
      fullName: identity.fullName,
      login: identity.login,
      email: '',
      cellPhone: identity.cellPhone,
      storeName: identity.storeName,
      password: identity.password,
      passwordConfirmation: identity.password,
      ...overrides,
    };

    await this.fullName.fill(values.fullName);
    await this.login.fill(values.login);
    await this.email.fill(values.email);
    await this.cellPhone.fill(values.cellPhone);
    await this.storeName.fill(values.storeName);
    await this.password.fill(values.password);
    await this.passwordConfirmation.fill(values.passwordConfirmation);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
