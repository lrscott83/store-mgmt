# Archive Report — home-theme-redesign

**Status**: COMPLETE (ARCHIVED)
**Branch**: `feat/frontend-parity-audit`
**Verify verdict**: PASS WITH WARNINGS — 0 CRITICAL / 1 WARNING (spec-text vs. approved design-decision sync, resolved by this archive) / 2 SUGGESTION (non-blocking) (engram #1193)

Rebuilt the public landing route (`app/home/routes/landing-deep.tsx` + `landing-deep.css`,
`web-store-pos` app, the `/` index route) onto the app's shared design system (`@theme`
tokens, `Button`, `Card`, Tailwind grid/flex) — the last remaining view that shipped a
bespoke 717-line standalone stylesheet (Bootstrap-like grid, hardcoded dark/amber hex,
Segoe UI). Implemented via 7 independently-revertible work-unit commits on
`feat/frontend-parity-audit` (Strict TDD, RED before GREEN each phase), plus one follow-up
reconciliation commit after user visual review. `/` stays public/unauthenticated;
`app/routes.ts` untouched; shared `Button`/`Card` components untouched (consumed as-is).

## Commits Delivered

| WU | Commit | Scope | Status |
|-----|--------|-------|--------|
| WU1 | ad9e992 | Test scaffold: `IntersectionObserver`/PWA mocks, `clientLoader`/routes.ts guard tests | Complete |
| WU2 | 088ccbb | Nav restyle on tokens + React-state hamburger/dropdown | Complete |
| WU3 | 93557b4 | Hero restyle (gradient hero, glass stats card) — **superseded by post-verify commit below** | Complete |
| WU4 | d1c12c1 | Features grid + scroll-reveal refactor (classList → React state) | Complete |
| WU5 | 5fd6a8e | How-it-works + CTA restyle on shared `Card`/tokens | Complete |
| WU6 | dcb8193 | Footer restyle + `landing-deep.css` reduction to token-derived remnant | Complete |
| WU7 | 4284d3f | Full regression pass + token-guardrail sweep (verification-only) | Complete |
| — | ca71980 | Post-verify reconciliation: hero brand gradient REMOVED after user visual review | Complete |

All commits: conventional messages, no "Co-Authored-By"/AI attribution, per repo
convention. 43/43 tasks marked `[x]`, 7/7 planned work units, plus the follow-up
reconciliation commit.

## Verification Evidence (engram #1193, fresh independent gate execution)

- `pnpm --filter @store-mgmt/web-store-pos test -- --run` → 117/117 files, 1676/1676 tests
  PASS (baseline 117/1651; net +25 landing tests, 0 regressions).
- `pnpm --filter @store-mgmt/web-store-pos exec tsc --noEmit` → clean, zero errors.
- Grep sweep `rg '#[0-9a-fA-F]{3,8}|rgba\('` across `landing-deep.tsx`, `landing-deep.css`,
  and the test file → zero matches.
- Grep sweep for Bootstrap leftovers (`col-lg-`, `.row`, `.container`, `d-lg-none`,
  `btn-primary-amber`, `btn-ghost`) → zero matches.
- `git diff` across the WU commit range for `ui/button.tsx`/`ui/card.tsx` → empty (shared
  components genuinely untouched).
- `app/routes.ts` index entry byte-identical pre/post-change (no WU commit touches it).

## Post-Verify Reconciliation (commit ca71980) — spec updated to match

Verification (engram #1193) ran against the state where the hero used a
`bg-gradient-to-br from-primary via-primary to-accent` brand gradient (design.md §1/§2,
MARK-2, approved at design time). After verification, the user reviewed the rendered
result visually and asked for the gradient to be REMOVED. Commit `ca71980` changed the
hero to render on the app's STANDARD light background (`bg-background`/`text-text`, the
same surface every other route uses) with a plain `bg-surface` stats card (`border
border-border shadow-card`) instead of the glass panel over the gradient. Amber accent
highlights (`text-accent`/`bg-accent` on the eyebrow, emphasis span, CTA, stats numbers)
and the Inter font / shared components were kept.

This diverges from design.md's ratified ADR ("Brand tokens + high-impact hero" —
purple→amber gradient), but is a legitimate post-review user decision, not a
regression. **This archive reconciles the canonical spec to the FINAL implemented
state** (not the mid-verification gradient state):

- `openspec/specs/home-landing/spec.md` — "Hero uses token-derived brand gradient"
  scenario replaced with **"Hero renders on the app's standard surface"**, asserting
  `bg-background`/`text-text` (no gradient) and a plain `bg-surface` stats card.
- `openspec/specs/home-landing/spec.md` — "Route renders without a bespoke stylesheet"
  scenario replaced with **"Retained stylesheet is a minimal token-derived remnant"**,
  reflecting design.md §5's REDUCE-not-DELETE decision (MARK-4, approved): the CSS file
  still exists (~20 lines, one entrance-animation keyframe + wiring class only — the
  final file dropped even the `landingGlowPulse`/`.landing-hero-grid` glow/grid
  decoration that design.md §5 had originally retained, since the gradient hero glow it
  supported no longer exists), zero hardcoded hex, zero duplicated component/grid rules.

Both changes were literal-text-vs-implementation mismatches already flagged in principle
by the verify report's WARNING (CSS reduce-not-delete) and — for the gradient removal —
introduced by a post-verify, user-approved commit. No re-verification gate was re-run
for `ca71980` per this archive task's explicit instruction; the file contents were read
directly and confirmed to match the reconciled spec text above.

## Spec Merge

**Home Landing** — new capability spec `openspec/specs/home-landing/spec.md` (7
requirements; delta spec `openspec/changes/home-theme-redesign/specs/home-landing/spec.md`
was a full spec, no prior capability existed):

- **Token-Based Visual Styling** — no hardcoded hex/Segoe UI; `landing-deep.css` reduced
  (not deleted) to a token-derived remnant; hero renders on the standard app surface, no
  gradient (reworded per Post-Verify Reconciliation above).
- **Shared Component Reuse for Interactive Elements** — `Card` for feature/step tiles,
  `Button`-mirrored token classes for route/anchor CTAs, real `Button` for the hamburger.
- **Responsive Layout via Tailwind Breakpoints** — Bootstrap grid replaced with
  `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` etc.
- **Responsive Navigation Menu** — React-state-driven mobile dropdown, desktop inline
  links.
- **Preserved Section Structure and Behavior** — all 5 sections, scroll/PWA/reveal
  behavior intact (reveal refactored classList → React state, approved deviation).
- **No Auth Behavior Change on the Public Route** — `/` stays public, `routes.ts`
  untouched.
- **Regression Test Coverage** — `landing-deep.test.tsx`, 17 tests.

The original delta spec (with its literal pre-reconciliation `ADDED Requirements` text)
remains preserved, unmodified, at
`openspec/changes/home-theme-redesign/specs/home-landing/spec.md` for historical
traceability; the canonical spec at `openspec/specs/home-landing/spec.md` holds the
reconciled, final-state form.

## Artifact Traceability (engram)

| Artifact | ID | Status |
|----------|-----|--------|
| proposal | #1186 | CLOSED |
| spec (delta) | #1187 | CLOSED |
| design | #1188 | CLOSED |
| tasks | #1189 | CLOSED |
| verify-report | #1193 | CLOSED |
| archive-report | *being written* | *active* |

## Next Steps

All 7 planned work units + 1 post-verify reconciliation commit complete. Spec merged into
canonical `openspec/specs/home-landing/spec.md`, reconciled to the final implemented state
(standard-surface hero, no gradient; reduced-not-deleted CSS). No blocking risks. Change
folder kept in place at `openspec/changes/home-theme-redesign/` per this repo's existing
archive convention (no `openspec/changes/archive/` move). Ready for the next planned
change on `feat/frontend-parity-audit`.
