# Proposal: View Text Parity (React → Angular Spanish)

## Intent

The React app (`frontend-react/apps/web-store-pos/`) is ~95% aligned to the Angular Spanish source of truth (`frontend/src/app/_modules/i18n/vocabs/es.ts`), but a small, grep-confirmed set of user-facing strings still render in English. Bring those to 100% text parity, all Spanish. ONLY the string VALUE changes — no colors, fonts, layout, structure, or behavior.

## Scope

### In Scope (the ONLY gaps — exploration proved the rest is clean)

1. `app/auth/routes/register.tsx` — entire page hardcoded English → wire the ALREADY-EXISTING catalog keys (`AUTH.FULL_NAME/EMAIL/CELL_PHONE/PASSWORD/PASSWORD_CONFIRM/REGISTER_TITLE/REGISTERING/HAVE_ACCOUNT`, etc.) per Angular `presentation/auth/register/register.component.html`.
2. `app/shared/components/unsaved-changes-dialog.tsx` — English → Spanish matching Angular `_shared/guards/can-deactivate.guard.ts` (`GENERAL.CONFIRM_TITLE`/`WIZARD_DIRTY_MESSAGE`/`YES`/`CANCEL`/`NO`). Used by 4 owner/reseller views.
3. `app/shared/lib/hooks/use-unsaved-changes-prompt.ts` — native `window.confirm()` English → Spanish, same wording as #2.
4. `app/root.tsx` ErrorBoundary — English → Spanish via analog keys `GENERAL.ERROR`/`GENERAL.RESPONSE.ERROR404_MESSAGE`/`ERROR500_MESSAGE`.
5. `app/shared/components/navbar.tsx` + `sidebar.tsx` — 4 hardcoded English `aria-label`s → Spanish.

### Resolved Forks (baked in — do NOT re-open)

- **Login label**: force LITERAL Angular parity — `login.tsx` field label becomes "Usuario" (`GENERAL.LOGIN`) even though the input is `type=email`. TEXT ONLY: input type/behavior unchanged.
- **Aria-labels**: translate the 4 English aria-labels to Spanish (Angular has none; everything is Spanish).

### Out of Scope

- Terms-acceptance toggle missing from `register.tsx` (STRUCTURE/UI, not text).
- Any styling / color / font / layout / behavior change.
- Re-auditing already-clean areas: menu, sales, inventory, expenses, reports, statistics, sync, admin, management, profile.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None — no spec-level requirement changes. Pure text/localization parity.

## Approach

- Prefer WIRING existing Spanish catalog keys (`app/shared/lib/i18n/es.ts`) via `useIntl()` / `intl.formatMessage`.
- Add new catalog keys ONLY where none exist: ErrorBoundary copy and the 4 aria-labels.
- Copy exact Angular Spanish strings VERBATIM from `vocabs/es.ts` (byte-identical) for every reused key.
- Strict TDD: red → green per file. Wrap `useIntl` components in `IntlProvider` (app and tests).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/auth/routes/register.tsx` | Modified | Wire AUTH.* keys |
| `app/auth/routes/login.tsx` | Modified | Label → "Usuario" |
| `app/shared/components/unsaved-changes-dialog.tsx` | Modified | Spanish text |
| `app/shared/lib/hooks/use-unsaved-changes-prompt.ts` | Modified | Spanish confirm() |
| `app/root.tsx` | Modified | ErrorBoundary Spanish |
| `app/shared/components/navbar.tsx`, `sidebar.tsx` | Modified | 4 aria-labels |
| `app/shared/lib/i18n/es.ts` | Modified | New keys (ErrorBoundary, aria) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Non-verbatim Spanish string | Med | Copy exact bytes from `vocabs/es.ts`; diff-check |
| `useIntl` crash (no IntlProvider) | Med | Wrap in IntlProvider in app + tests |
| Accidental structure/behavior change | Low | Text-value-only edits; review diff |

## Rollback Plan

Commits-only on `feat/frontend-parity-audit`; revert the offending work-unit commit(s). No migrations, no schema, no infra.

## Dependencies

- Angular Spanish source: `frontend/src/app/_modules/i18n/vocabs/es.ts` (verbatim reference).

## Success Criteria

- [ ] All 5 gaps + login label + 4 aria-labels render Spanish matching Angular verbatim.
- [ ] Reused keys byte-match `vocabs/es.ts`; new keys added only for ErrorBoundary/aria.
- [ ] No color/font/layout/structure/behavior change.
- [ ] `pnpm test` green; `pnpm -C apps/web-store-pos exec tsc --noEmit` clean.
