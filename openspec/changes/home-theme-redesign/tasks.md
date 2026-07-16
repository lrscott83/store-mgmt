# Tasks: Home / Landing Theme Redesign

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750-900 (tsx rewrite ~470→~350 restyled lines touched; css 717→~35; new test file ~250-300) |
| 400-line budget risk | High |
| Chained PRs recommended | No (delivery is fixed to commits-only on `feat/frontend-parity-audit`, no PRs at all) |
| Suggested split | Single branch, 7 sequential work-unit commits (test+impl per section) |
| Delivery strategy | commits-only (proposal Delivery Constraint — overrides ask-on-risk/auto-chain/single-pr/exception-ok) |
| Chain strategy | N/A — no PRs are opened for this change |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Commit | Notes |
|------|------|--------|-------|
| 1 | Test scaffold + fixtures (mocks, `clientLoader` guard test) | WU1 | RED only, no impl changes yet |
| 2 | Nav restyle + hamburger/dropdown state | WU2 | RED (nav tests) → GREEN |
| 3 | Hero restyle (gradient, glow, stats card) | WU3 | RED (hero tests) → GREEN |
| 4 | Features grid + scroll-reveal refactor | WU4 | RED (features/reveal tests) → GREEN |
| 5 | How-it-works + CTA restyle | WU5 | RED (steps/CTA tests) → GREEN |
| 6 | Footer + `landing-deep.css` reduction/cleanup | WU6 | RED (footer/no-css-hex test) → GREEN |
| 7 | Full-suite regression pass + token guardrail sweep | WU7 | Final verification commit only |

All units land on `feat/frontend-parity-audit` via `git commit` — no branches, no PRs, no `size:exception`.

## Phase 1: Test Scaffold (Foundation)

- [x] 1.1 Create `app/home/routes/__tests__/landing-deep.test.tsx`; add global `IntersectionObserver` stub (class capturing `observe`/`disconnect`/callback) per design §8.
- [x] 1.2 Add `matchMedia`/`serviceWorker`/`beforeinstallprompt` mock helpers mirroring `install-app-button.test.tsx` (`setStandalone`, `setServiceWorkerSupported`).
- [x] 1.3 RED: write test "exports default function; `clientLoader` is `undefined`" — asserts HARD CONSTRAINT (spec: No Auth Behavior Change).
- [x] 1.4 RED: write test "routes.ts index entry unchanged" — import `app/routes.ts`, assert index route still points to `landing-deep.tsx` with no loader wrapper.
- [x] 1.5 Confirm 1.3/1.4 pass immediately (no prod code change needed) — commit WU1 (`test(home): scaffold landing-deep tests + clientLoader/routes guard`).

## Phase 2: Nav Section

- [x] 2.1 RED: add render test asserting desktop nav links ("Características", "Cómo funciona", "Comenzar") visible at baseline render.
- [x] 2.2 RED: add hamburger toggle test — dropdown items (e.g. "Iniciar sesión") hidden initially, appear after clicking toggler, hide again on second click.
- [x] 2.3 RED: add `showLoginButton` test — with PWA-installable mocks set (`canInstall=true`), "Entrar" link absent.
- [x] 2.4 GREEN: rebuild `<nav>` in `landing-deep.tsx` per design §7 — `fixed inset-x-0 top-0 z-50 py-5`, scrolled → `bg-surface/85 backdrop-blur border-b border-border`; brand `text-accent font-bold text-2xl`; desktop links `hidden lg:flex` + `text-text-muted hover:text-accent`; primary CTA via `ctaPrimary` constant.
- [x] 2.5 GREEN: replace hamburger `<button><span/><span/><span/></button>` with `Button variant="outline"` (or plain `<button>`) toggling `menuOpen`, inline hamburger SVG closed / `CloseIcon` (`ui/icons.tsx`) open, `lg:hidden`.
- [x] 2.6 GREEN: rebuild dropdown as conditional render (`{menuOpen && (...)}`) with `absolute right-0 top-full min-w-[200px] bg-surface border border-border border-t-2 border-t-accent rounded-md shadow-card`; items `text-text hover:text-accent hover:bg-accent/5`; keep `closeMenu` 10ms timeout.
- [x] 2.7 Define the `ctaPrimary` (and outline-mirroring) local utility constants at module scope, mirroring `Button` `VARIANT_CLASSES.primary` (design §3): `rounded-md px-4 py-2 shadow-card bg-primary text-white hover:bg-primary-hover`.
- [x] 2.8 Verify Phase 2 tests pass; commit WU2 (`feat(home): restyle landing nav on shared tokens, react-state dropdown`).

## Phase 3: Hero Section

- [x] 3.1 RED: add hero render test — heading `getByRole('heading', { name: /Vende más/i })`, brand text `VendeDTo`, "Ver características" anchor `href="#caracteristicas"`.
- [x] 3.2 RED: add token-guardrail test — hero container `toHaveClass('bg-gradient-to-br', 'from-primary')`; primary hero CTA `toHaveClass('bg-primary')`.
- [x] 3.3 GREEN: rebuild `#hero` section: `bg-gradient-to-br from-primary via-primary to-accent`, `text-white` copy, `grid grid-cols-1 items-center gap-8 lg:grid-cols-2` replacing `.row .col-lg-6/.col-lg-5.offset-lg-1`.
- [x] 3.4 GREEN: replace `.hero-bg-glow` with `bg-accent/30 blur-3xl rounded-full` blob using `landing-animate-glow` keyframe class (retained CSS, design §5); replace `.hero-bg-grid` with `.landing-hero-grid` (`color-mix` token-derived).
- [x] 3.5 GREEN: rebuild hero actions (`flex flex-col gap-4 sm:flex-row`); "Comenzar" anchor uses `ctaPrimary`; "Ver características" uses outline-mirroring constant.
- [x] 3.6 GREEN: rebuild stats card as glass panel `bg-white/10 backdrop-blur border border-white/20 rounded-lg` (not `Card`, per design §3).
- [x] 3.7 GREEN: retint hero eyebrow/title/sub/accent span off hex → `text-white/70`, `text-accent`, etc. per Token Map (design §2).
- [x] 3.8 Verify Phase 3 tests pass; commit WU3 (`feat(home): restyle hero on token gradient, glass stats card`).

## Phase 4: Features Grid + Scroll-Reveal

- [x] 4.1 RED: add test — all 9 `FEATURES` titles render, each inside a `Card` (`data-slot="card"`).
- [x] 4.2 RED: add test — features grid wrapper carries responsive grid classes (`grid-cols-1`, `sm:grid-cols-2`, `lg:grid-cols-3`).
- [x] 4.3 RED: add scroll-reveal test — feature wrapper starts `opacity-0`; after firing stubbed `IntersectionObserver` callback with `isIntersecting: true` for an entry, wrapper becomes `opacity-100`.
- [x] 4.4 GREEN: refactor reveal `useEffect` from `entry.target.classList.add('visible')` to `setState` updating a `Set<number>` of revealed indices (design §6); ref stays on the outer wrapper `div`.
- [x] 4.5 GREEN: rebuild `#caracteristicas` grid: `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` replacing `.row.g-4 .col-md-6.col-lg-4`; each tile = wrapper `div` (`ref` + conditional `opacity-0 translate-y-5`→`opacity-100 translate-y-0 transition-all duration-500`) containing shared `Card` with icon/title/desc.
- [x] 4.6 GREEN: retint 9 SVG icons `stroke="#f5b026"` → `stroke="currentColor"` wrapped in `text-accent`.
- [x] 4.7 Verify Phase 4 tests pass; commit WU4 (`feat(home): restyle features grid on Card + react-state scroll-reveal`).

## Phase 5: How-It-Works + CTA

- [x] 5.1 RED: add test — all 3 `STEPS` titles render inside `Card` components, in a `md:grid-cols-3` layout.
- [x] 5.2 RED: add test — CTA section renders "Crear cuenta gratis" as a `Link` to `/register` with `ctaPrimary`-derived classes (`toHaveClass('bg-primary')`).
- [x] 5.3 GREEN: rebuild `#como-funciona`: `grid grid-cols-1 gap-6 md:grid-cols-3` replacing `.row.g-5 .col-md-4`; step number `text-accent text-2xl font-bold` replacing inline `style` hex.
- [x] 5.4 GREEN: rebuild `#registro` CTA: `Card`/`bg-surface rounded-lg shadow-card` panel replacing `.cta-inner`; retint eyebrow/glow off inline hex; "Crear cuenta gratis" `Link` uses `ctaPrimary`.
- [x] 5.5 Verify Phase 5 tests pass; commit WU5 (`feat(home): restyle how-it-works steps + CTA on shared Card/tokens`).

## Phase 6: Footer + CSS Cleanup

- [x] 6.1 RED: add test — footer text renders (`&copy; 2026 VendeDTo...`).
- [x] 6.2 RED: add regression test — no rendered element has an inline `style` with a raw hex color, and no `<link>`/`import` reference to a bespoke stylesheet duplicates token values (spec: Route renders without a bespoke stylesheet).
- [x] 6.3 GREEN: rebuild `<footer>` on `bg-surface`/`text-text-muted`/`border-t border-border` tokens replacing `.footer`/`.footer-text`.
- [x] 6.4 GREEN: reduce `app/home/routes/landing-deep.css` to ~30-40 lines: `@keyframes landingGlowPulse`, `@keyframes landingFadeInUp`, `.landing-hero-grid` (`color-mix(in srgb, var(--color-accent) 4%, transparent)`), `.landing-animate-glow`/`.landing-animate-in` utility classes only; delete every other rule (`.container/.row/.col-*`, `.d-*`, `.btn-*`, `.feature-card`, `.hero-card`, `.nav-*`, `.section-*`, `.cta-*`, `.footer*`, font vars, all hex).
- [x] 6.5 Grep `landing-deep.tsx` + reduced `landing-deep.css` for `#0a0a0a`/`#f5b026`/`#f5f0eb`/`#f7c84d`/`#e07b00`/`rgba(` hex-derived literals; confirm zero matches outside the two retained keyframes' token-derived `color-mix`.
- [x] 6.6 Verify Phase 6 tests pass; commit WU6 (`refactor(home): reduce landing-deep.css to token-derived keyframes, retint footer`).

## Phase 7: Full Regression + Token Guardrail Sweep

- [x] 7.1 Run the full `landing-deep.test.tsx` suite plus full project test suite; confirm no regressions elsewhere (route is isolated, but `app/routes.ts` importers must stay green).
- [x] 7.2 Manually cross-check every spec scenario (spec.md, all 7 requirements) against the final component + test file; confirm each scenario has a corresponding assertion.
- [x] 7.3 Confirm `clientLoader === undefined` still holds and `app/routes.ts` lines 4-20 are byte-identical to pre-change (`git diff app/routes.ts` empty).
- [x] 7.4 Commit WU7 (`test(home): full regression pass for landing-deep restyle`) — verification-only commit, no further prod changes expected unless a gap surfaces.

## Rules Applied

- Every GREEN task is preceded by its own RED task in the same or prior phase (strict TDD).
- No task touches `app/routes.ts`; Phase 1 includes an explicit assertion task guarding this.
- No task modifies `ui/button.tsx` or `ui/card.tsx` (consumed as-is per proposal/design MARK-1).
- Delivery is commits-only on `feat/frontend-parity-audit`; no PR/branch tasks exist in this checklist.
