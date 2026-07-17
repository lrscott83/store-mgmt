# Archive Report — view-text-parity

**Status**: COMPLETE (ARCHIVED)
**Branch**: `main` (explicit orchestrator override of tasks.md's `feat/frontend-parity-audit` delivery target for this run)
**Verify verdict**: PASS — 0 CRITICAL / 0 WARNING / 1 SUGGESTION (non-blocking citation typo) (engram `sdd/view-text-parity/verify-report` #1220)

Pure text-value localization parity pass: brought the last ~5% of English-rendered
user-facing strings in `web-store-pos` to Spanish, matching Angular's
`frontend/src/app/_modules/i18n/vocabs/es.ts` byte-for-byte wherever an Angular
correlate exists, and spec-fixed Spanish strings where it does not (register offline
banner/success text, 4 navbar/sidebar aria-labels, 3 register catch-block fallbacks).
No color/font/layout/structure/behavior change — text values only. Delivered via Strict
TDD (RED before GREEN each phase) in 8 work-unit commits directly on `main`.

## Commits Delivered (8, all on `main`)

| # | Commit | Scope |
|---|--------|-------|
| 1 | `97efa43` | `feat(i18n): add view-text-parity catalog keys` — foundation, no UI change |
| 2 | `19e41a6` | `feat(auth): register.tsx Spanish text parity` — largest slice, full `useIntl` wiring (was 0% i18n) |
| 3 | `c25e7db` | `feat(auth): login label Usuario parity` |
| 4 | `c053f33` | `feat(shared): unsaved-changes Spanish parity` — dialog + native `confirm()` hook |
| 5 | `d6256da` | `feat(app): ErrorBoundary Spanish parity` |
| 6 | `94d9aba` | `feat(shared): navbar/sidebar aria-label parity` |
| 7 | `81b26fe` | `test(view-text-parity): final verification pass` (adds openspec change artifacts) |
| 8 | `7830da8` | `chore(view-text-parity): mark all tasks complete` (tasks.md sync) |

All commits: conventional messages, no "Co-Authored-By"/AI attribution, per repo
convention. 31/31 tasks marked `[x]`, all 7 planned work units + final verification
phase complete.

## Verification Evidence (engram `sdd/view-text-parity/verify-report` #1220)

- `pnpm test` (monorepo-wide, turbo): 120 test files, 1728 tests, ALL GREEN.
- `pnpm -C apps/web-store-pos exec tsc --noEmit`: clean, zero errors.
- `pnpm -C apps/web-store-pos build`: succeeds (client + SPA build + service worker precache).
- Byte-for-byte diff against `es.ts` + `register.component.html`/`can-deactivate.guard.ts`
  confirmed for every Angular-sourced string, including the 3 spec-flagged high-risk
  pre-existing mismatches (now fixed): `GENERAL.FULL_NAME` ("Nombre completo" →
  "Nombre Completo"), `GENERAL.CELL_PHONE` ("Teléfono celular" → "Teléfono"),
  `GENERAL.EMAIL` (English "Email" → "Correo"), plus `GENERAL.LOGIN` on the login page
  ("Email" → "Usuario").
- Grep sweep of all 7 touched files (register.tsx, login.tsx, unsaved-changes-dialog.tsx,
  use-unsaved-changes-prompt.ts, root.tsx, navbar.tsx, sidebar.tsx) confirmed no leftover
  English UI-copy literals outside the DEV-only stack trace.
- 1 SUGGESTION (non-blocking): apply-progress cited Angular `es.ts:135-136` for
  `REGISTRATION.UNEXPECTED_ERROR`; actual line range is 138-139. Value itself is correct
  — citation typo only, does not affect shipped text. Corrected in the canonical spec
  below.

## Resolved Forks (baked into the shipped implementation)

1. **Login field label — literal Angular parity chosen over semantic naming.** The
   `login.tsx` identifier input keeps `type="email"`/`autoComplete="email"` (unchanged,
   out of scope), but its visible label now reads `Usuario` (`GENERAL.LOGIN`), matching
   Angular's login template byte-for-byte even though the field technically accepts an
   email address. User explicitly chose literal parity over a semantically "more
   correct" label.
2. **Navbar/sidebar aria-labels — translated to Spanish.** Angular has no equivalent
   strings (these are React-only accessibility attributes with no Angular source). The
   4 labels were spec-fixed as new Spanish strings rather than left in English or
   sourced from a non-existent Angular key.
3. **Terms-acceptance toggle — explicitly out of scope.** `register.tsx` is missing a
   terms-of-service acceptance toggle relative to some reference designs; this is a
   structural/UI gap, not a text-value gap, and was excluded from this change by the
   proposal. No toggle was added or removed.

## Scope Extension (not a deviation)

During Phase 2 (register.tsx), 3 additional catalog keys beyond the original spec's
enumerated Requirements were added to satisfy the apply run's Definition-of-Done grep
check (no leftover English literals in the 6 touched files): `REGISTRATION.UNEXPECTED_ERROR`
(sourced verbatim from Angular `es.ts:138-139`, previously referenced but commented out
in Angular's `register.component.ts`), and `REGISTRATION.EMAIL_TAKEN` /
`REGISTRATION.VALIDATION_ERROR` (new, no Angular correlate, same precedent as the
offline-banner/success-redirect strings). These are pure text-value additions with no
behavior/structure change — added to the canonical spec below.

## Spec Merge

**View Text Parity** — new capability spec `openspec/specs/view-text-parity/spec.md` (6
requirements; delta spec at
`openspec/changes/view-text-parity/specs/view-text-parity/spec.md` was a full spec, no
prior overlapping capability existed in `openspec/specs/`):

- **Register page text parity** — all labels/errors/buttons/banners Spanish,
  byte-identical to Angular source where a correlate exists; canonical spec additionally
  documents the 3 catch-block fallback keys added during apply (scope extension above).
- **Login field label forced literal parity** — `Usuario` label, input type/autoComplete
  unchanged.
- **Unsaved-changes dialog text parity** — title/message/3 buttons match Angular
  SweetAlert copy.
- **Native unsaved-changes confirm() text parity** — same message, single-string
  `window.confirm()` simplification.
- **Root ErrorBoundary Spanish copy** — 404 and non-404/generic paths, DEV-only stack
  trace untouched; canonical spec clarifies the generic component-error fallback is also
  covered (implementation applied the translation project-wide per DoD, spec text
  updated to match).
- **Navbar and sidebar aria-labels in Spanish** — 4 labels, no Angular correlate.

The original delta spec remains preserved, unmodified, at
`openspec/changes/view-text-parity/specs/view-text-parity/spec.md` for historical
traceability; the canonical spec at `openspec/specs/view-text-parity/spec.md` holds the
final, apply-reconciled form (adds the 3 catch-block keys, clarifies ErrorBoundary
generic-fallback coverage, corrects the `UNEXPECTED_ERROR` line-number citation).

## Artifact Traceability (engram)

| Artifact | ID | Status |
|----------|-----|--------|
| proposal | #1216 | CLOSED |
| spec (delta) | #1217 | CLOSED |
| tasks | #1218 | CLOSED |
| apply-progress | #1219 | CLOSED |
| verify-report | #1220 | CLOSED |
| archive-report | *being written* | *active* |

(No `design` artifact was produced for this change — pure text-value localization
parity did not require an architecture/design phase.)

## Next Steps

All 7 planned work units + final verification phase complete (31/31 tasks). Spec merged
into canonical `openspec/specs/view-text-parity/spec.md`. No blocking risks. Change
folder kept in place at `openspec/changes/view-text-parity/` per this repo's established
archive convention (no `openspec/changes/archive/` move — see `home-theme-redesign`,
`eliminate-base-repository`, `eliminate-inventory-repository`, `product-service-parity`,
`repository-parity-fixes`, `stage6-sync-parity` for precedent). Ready for the next
planned change.
