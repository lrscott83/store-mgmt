# Tasks: View Text Parity

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~360-400 (catalog +45, register.tsx+test ~200, dialog+hook+tests ~65, root+test ~30, login+navbar+sidebar+tests ~40) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single branch, 7 work-unit commits (no PRs — project delivery convention) |
| Delivery strategy | commits-only on `feat/frontend-parity-audit` (project override of ask-on-risk) |
| Chain strategy | pending (not applicable — no PR chain) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units
| Unit | Goal | Notes |
|------|------|-------|
| 1 | i18n catalog: add missing keys + verify reused shared keys | Foundation, no UI change |
| 2 | register.tsx full Spanish parity | Largest slice, own commit |
| 3 | login.tsx label | Tiny, independent |
| 4 | unsaved-changes-dialog.tsx + use-unsaved-changes-prompt.ts | Shared by 4 owner/reseller forms (no consumer edits needed) |
| 5 | root.tsx ErrorBoundary | Independent |
| 6 | navbar.tsx + sidebar.tsx aria-labels | Independent |
| 7 | Final verification | Last |

## Phase 1: i18n Catalog Foundation (`app/shared/lib/i18n/es.ts`)

- [x] 1.1 Add new keys: `REGISTRATION.WELCOME`, `.ALREADY_ACCOUNT`, `.SIGNIN_LINK`, `.SIGNUP_BUTTON`, `.OFFLINE_BANNER`, `.SUCCESS_REDIRECT`; `GENERAL.LOGIN`, `GENERAL.CONFIRM_PASSWORD`, `STORE.STORE_NAME`, `GENERAL.VALIDATION.PASSWORD_POLICY`, `GENERAL.VALIDATION.INVALID_PASSWORD`, `GENERAL.CONFIRM_TITLE`, `GENERAL.WIZARD_DIRTY_MESSAGE`, `GENERAL.RESPONSE.ERROR404_MESSAGE` — exact values per spec table.
- [x] 1.2 Shared-key reuse verification (no value mutation — confirm each still matches its existing consumers' Angular source before reusing in new views):

| Key | Existing consumers | Verify |
|---|---|---|
| `GENERAL.FULL_NAME` | owner/reseller forms | 'Nombre Completo' matches Angular USER.FULL_NAME |
| `GENERAL.CELL_PHONE` | owner/reseller forms | 'Teléfono' matches |
| `GENERAL.EMAIL` | owner/reseller forms | 'Correo' matches |
| `GENERAL.PASSWORD` | owner/reseller forms | 'Contraseña' matches |
| `GENERAL.CANCEL` | ~15 modals | 'Cancelar' matches |
| `GENERAL.YES` / `GENERAL.NO` | (unused yet) | 'Si'/'No' match Angular |
| `GENERAL.ERROR` | misc titles | 'Error' matches |
| `GENERAL.RESPONSE.ERROR500_MESSAGE` | sale-product-row | text matches |
| `GENERAL.VALIDATION.REQUIRED` | sale-product-row | `{name} es requerido` template matches |

- [x] 1.3 `pnpm -C apps/web-store-pos exec tsc --noEmit` passes with new keys.
- [x] 1.4 Commit: `feat(i18n): add view-text-parity catalog keys`.

## Phase 2: register.tsx (`app/auth/routes/register.tsx`)

- [x] 2.1 RED: extend `__tests__/register.test.tsx` (wrap in `IntlProvider messages={messages}` + `MemoryRouter`) asserting heading `Creación de cuenta`, already-account text, `Entra` link, submit button `Registrar`.
- [x] 2.2 GREEN: import `useIntl`; wire heading/already-account/link/button to `REGISTRATION.*` keys.
- [x] 2.3 RED: extend test asserting all 7 field labels + validate() error strings (required×6, password-policy, mismatch) render exact spec Spanish.
- [x] 2.4 GREEN: replace labels/errors using `intl.formatMessage` with `USER`/`GENERAL.*`/`STORE.STORE_NAME` keys (interpolate `{name}` for `GENERAL.VALIDATION.REQUIRED`); use `GENERAL.VALIDATION.PASSWORD_POLICY`/`INVALID_PASSWORD`.
- [x] 2.5 RED: extend test asserting loading button text `Registrando...`, offline banner, success-redirect text.
- [x] 2.6 GREEN: wire `AUTH.REGISTERING`, `REGISTRATION.OFFLINE_BANNER`, `REGISTRATION.SUCCESS_REDIRECT`.
- [x] 2.7 `pnpm test register.test` green; commit: `feat(auth): register.tsx Spanish text parity`.

## Phase 3: login.tsx (`app/auth/routes/login.tsx`)

- [x] 3.1 RED: extend `login.test.tsx` asserting identifier label text equals `Usuario`; input `type`/`autoComplete` unchanged.
- [x] 3.2 GREEN: replace `AUTH.EMAIL` label usage with `GENERAL.LOGIN`.
- [x] 3.3 Commit: `feat(auth): login label Usuario parity`.

## Phase 4: Unsaved-changes dialog + prompt

- [x] 4.1 RED: create `unsaved-changes-dialog.test.tsx` (IntlProvider) asserting title `Confirmación`, message, `Si`/`No`/`Cancelar` buttons.
- [x] 4.2 GREEN: `unsaved-changes-dialog.tsx` uses `useIntl` + `GENERAL.CONFIRM_TITLE`/`WIZARD_DIRTY_MESSAGE`/`YES`/`NO`/`CANCEL`.
- [x] 4.3 RED: create `use-unsaved-changes-prompt.test.ts` asserting `window.confirm` called with `WIZARD_DIRTY_MESSAGE` text.
- [x] 4.4 GREEN: `use-unsaved-changes-prompt.ts` imports `messages` and passes the exact string to `confirm()`.
- [x] 4.5 Sanity-check the 4 consumers (owner-create/edit, reseller-create/edit) render unchanged — no source edit needed, just confirm no local override of dialog copy.
- [x] 4.6 Commit: `feat(shared): unsaved-changes Spanish parity`.

## Phase 5: root.tsx ErrorBoundary

- [x] 5.1 RED: extend `app/__tests__/root.test.tsx` asserting 404 heading `404`/details `ERROR404_MESSAGE`, non-404 heading `Error`/details `ERROR500_MESSAGE`.
- [x] 5.2 GREEN: import `messages` in `root.tsx` (non-component module, use raw `messages['KEY']` since ErrorBoundary is outside `I18nProvider` on route-error paths); wire both cases.
- [x] 5.3 Commit: `feat(app): ErrorBoundary Spanish parity`.

## Phase 6: navbar.tsx + sidebar.tsx aria-labels

- [x] 6.1 RED: extend `navbar.test.tsx`/`sidebar.test.tsx` asserting the 4 aria-labels equal the Spanish spec strings.
- [x] 6.2 GREEN: update the 4 literal `aria-label` strings in place (no catalog key needed — spec keeps them as fixed React-only literals).
- [x] 6.3 Commit: `feat(shared): navbar/sidebar aria-label parity`.

## Phase 7: Final Verification

- [x] 7.1 `pnpm test` full suite green.
- [x] 7.2 `pnpm -C apps/web-store-pos exec tsc --noEmit` clean.
- [x] 7.3 `pnpm -C apps/web-store-pos build` succeeds.
- [x] 7.4 Grep the 6 touched files for leftover English literals (labels/errors/aria-labels) — none remain outside dev-only stack trace.
- [x] 7.5 Commit: `test(view-text-parity): final verification pass` (if any fixups needed).
