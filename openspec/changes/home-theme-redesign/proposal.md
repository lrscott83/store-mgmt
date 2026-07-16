# Proposal: Home / Landing Theme Redesign

## Intent

The public landing page (`app/home/routes/landing-deep.tsx` + `landing-deep.css`, the `/` index route) is the ONLY view in the app that does not use the shared React design system. It ships a 717-line standalone CSS file implementing a parallel Bootstrap-like grid and a bespoke dark/amber theme (bg `#0a0a0a`, accent `#f5b026`, Segoe UI) that never touches the globally-loaded Tailwind v4 `@theme` tokens or any shared UI component. This is design-system debt: the landing's visual language (color, radius, shadow, spacing, font) diverges from every other route. We restyle the home to match the app's own design system while keeping it responsive and visually striking.

## Scope

### In Scope
- Rebuild `landing-deep.tsx` markup on Tailwind utilities + `@theme` tokens (`bg-background`, `bg-surface`, `text-primary`, `bg-primary`, `text-accent`, Inter font).
- Replace the bespoke `.container/.row/.col-lg-*` Bootstrap grid and per-element inline styles with native Tailwind grid/flex + `sm:`/`md:`/`lg:` breakpoints (mirror the card-grid pattern used across admin/management lists).
- Adopt the "Brand tokens + high-impact hero" direction: purple primary + amber accent gradients/glow built from token colors so the hero stays eye-catching ("llamativo"). NOT a flat rebuild, NOT the current dark bespoke look.
- Reuse shared components (`ui/button.tsx` Button, `ui/card.tsx` Card) where sensible for CTAs and feature/stat/step cards.
- Review the home's own nav (`.landing-nav` hamburger/dropdown): confirm it works, is responsive, and aligns with the app's interaction style instead of a divergent duplicate.
- Add regression test coverage for the route (currently none) — strict TDD applies.
- Delete/retire `landing-deep.css` once its rules are ported to utilities/tokens.

### Out of Scope
- NO auth changes: `/` stays public and unauthenticated. NO clientLoader, NO guard, NO redirect (documented Angular-parity decision in `routes.ts`).
- NO routing changes beyond this route's styling — route table, other routes untouched.
- NO backend / API / data-layer changes.
- NO Angular parity work — reference is the app's OWN React design system, not Angular.
- NO copy/content rewrite or restructure: preserve hero / features / how-it-works / CTA / footer STRUCTURE and existing PWA-install + scroll-reveal behavior.
- NO shared design-token or shared-component changes (consume them as-is).

## Capabilities

### New Capabilities
- None (visual/implementation refactor; no spec-level behavior change).

### Modified Capabilities
- None.

## Approach

Rebuild `landing-deep.tsx` section by section (nav → hero → features → how-it-works → CTA → footer) onto Tailwind + `@theme` tokens, replacing bespoke CSS classes with utilities:
- Map hardcoded hex (`#0a0a0a`, `#f5b026`) → tokens (`bg-background`/`bg-surface`, `text-accent`/`bg-primary`). Keep the hero bold via token-derived gradient/glow accents (purple→amber) rather than hardcoded darks.
- Swap `.row/.col-*` → `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` (features) and equivalent flex for hero/steps.
- Use `Button` for CTAs, `Card` for feature/stat/step tiles; keep inline SVG icons (retint via `currentColor`/token).
- Keep the existing `useState`/`useEffect` logic (scroll state, PWA installability, IntersectionObserver reveal) intact; only restyle markup.
- Align `.landing-nav` with app patterns (Tailwind conditional render for the mobile dropdown), preserving anchor navigation and the login/register links.
- Retire `landing-deep.css`. Strict TDD: add render/interaction tests before/with the rewrite.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/home/routes/landing-deep.tsx` | Modified | Markup restyled to Tailwind + tokens; shared components reused |
| `app/home/routes/landing-deep.css` | Removed | Ported to utilities/tokens, then deleted |
| `app/home/routes/*` (new test) | New | Regression coverage (none exists today) |
| `app/routes.ts` | Unchanged | Index route stays public; NO guard/redirect added |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Visual regression / loss of "eye-catch" | Med | Token-based hero gradient/glow; incremental section-by-section commits; visual review each work unit |
| Accidental auth guard / redirect on `/` | Low | Explicit out-of-scope; do not touch `routes.ts` index entry |
| Removing `landing-deep.css` breaks styles | Med | Delete only after all rules ported; test route renders |
| No existing test net | High | Add tests first (strict TDD) before the rewrite |
| Responsive breakpoints drift from app | Low | Reuse existing card-grid / `MOBILE_BREAKPOINT` conventions |

## Rollback Plan

Work-unit commits on `feat/frontend-parity-audit`. Each commit is a self-contained section restyle; revert the offending commit(s) with `git revert`. Because scope is one route + its CSS, rollback is isolated — no shared tokens/components or routing were changed.

## Dependencies

- Existing globally-loaded tokens (`@store-mgmt/web-common/styles.css`) and shared UI (`ui/button.tsx`, `ui/card.tsx`) — consumed as-is.

## Delivery Constraint

Commits-only on the existing `feat/frontend-parity-audit` branch. NO new branch, NO PR, NO chained PRs, NO `size:exception`. Work-unit commits. Strict TDD active for implementation.

## Success Criteria

- [ ] `landing-deep.tsx` renders using only Tailwind utilities + `@theme` tokens and shared components; `landing-deep.css` deleted.
- [ ] Hero remains visually striking via token-derived brand gradients/glow (not the old dark bespoke theme, not flat).
- [ ] Layout responsive across `sm`/`md`/`lg` using app breakpoint conventions; nav hamburger/dropdown works.
- [ ] `/` stays public/unauthenticated — no clientLoader/guard/redirect added.
- [ ] Hero/features/how-it-works/CTA/footer structure and PWA-install + scroll-reveal behavior preserved.
- [ ] Route has passing regression tests.
