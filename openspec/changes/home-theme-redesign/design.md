# Design: Home / Landing Theme Redesign

> Scope reference: `openspec/changes/home-theme-redesign/proposal.md`.
> This is the HOW (architecture-level). No spec, no tasks here.

## 1. Architecture Decision (ADR-style)

### Decision: "Brand tokens + high-impact hero" — light page, bold gradient hero

**Context.** The app's shared design system (`@store-mgmt/web-common/styles.css`) is a
**LIGHT** theme: `--color-background: rgb(245 245 245)`, `--color-surface: white`,
`--color-text: rgb(20 20 20)`, brand `--color-primary: rgb(103 58 183)` (deep purple,
Angular Material deeppurple-amber) and `--color-accent: rgb(250 173 20)` (amber). The
current landing is the opposite: a full-page **DARK** bespoke theme (`#0a0a0a` bg,
`#f5b026` amber, Segoe UI) with its own Bootstrap-like grid. There is **no dark-surface
token** in the design system.

**Decision.**
- The page adopts the app's LIGHT surface language: `bg-background`, `Card`/`bg-surface`
  tiles, `text-text` / `text-text-muted` copy, Inter font (inherited from `html`).
- The **hero** stays "llamativo" via a **token-derived brand gradient**:
  `bg-gradient-to-br from-primary via-primary to-accent` with `text-white` copy and an
  animated **accent glow blob** (`bg-accent/30 blur-3xl`). This is bold and colorful
  using ONLY tokens (purple→amber), not the old dark bespoke look and not a flat rebuild.
- Amber accents throughout come from `--color-accent` (`text-accent` / `bg-accent` /
  `border-accent`), which subsumes the old `#f5b026`.

**Rationale.** The design system has no dark token; forcing a dark page would mean
inventing hardcoded darks again — the exact debt we are removing. A gradient hero
delivers the "eye-catch" requirement entirely from existing tokens, and the rest of the
page finally matches every other route.

**Rejected alternatives.**
- *Keep the page dark, just alias `#0a0a0a`→a new dark token.* Rejected: adds a
  shared-token (out of scope), and no other route is dark — it would keep the landing
  divergent.
- *Flat, no-gradient rebuild.* Rejected: proposal explicitly requires the hero stay
  visually striking.
- *Reuse the authenticated `shared/components/navbar.tsx`.* Rejected: that navbar is the
  in-app shell chrome (different purpose/links). The public landing nav is legitimately
  its own component; we align its *interaction style and tokens*, not its identity.

## 2. Token Map (hardcoded value → token / utility)

| Current (landing-deep.css / inline) | Meaning | Target token / Tailwind utility |
|---|---|---|
| `background-color: #0a0a0a` (page) | page bg | `bg-background` |
| hero full-page dark bg | hero bg | `bg-gradient-to-br from-primary via-primary to-accent` |
| `color: #f5f0eb` on dark | body text | on hero: `text-white`; on light sections: `text-text` |
| `#f5b026` (all amber: brand, eyebrows, icons, borders) | accent | `text-accent` / `bg-accent` / `border-accent` (`--color-accent` = rgb 250 173 20) |
| `#f7c84d` (amber hover) | accent hover | `hover:bg-accent/90` (no `accent-hover` token; alpha step) |
| `#e07b00` (2nd amber in `feature-card::after` gradient) | underline gradient | drop 2-tone → single `bg-accent` bar, or `from-accent to-primary` |
| `rgba(245,240,235,0.6/0.5/0.45/0.4)` muted copy | muted text | on light: `text-text-muted`; on hero gradient: `text-white/70` (…`/60`,`/40`) |
| `rgba(245,176,66,0.04–0.25)` borders/tints | accent tints | `border-accent/10`, `bg-accent/5`, `border-accent/20` |
| `rgba(18,18,18,0.7)` hero-card dark glass | stats card | on gradient: `bg-white/10 backdrop-blur border border-white/20` |
| `rgba(14,14,14,0.6–0.8)` feature/cta dark panels | tiles | shared `Card` (`rounded-lg bg-surface shadow-card`) |
| `box-shadow: 0 4px 20px rgba(245,176,66,.25)` | CTA glow | `shadow-card` (tiles) / `shadow-lg` (hero CTA); optional `ring-1 ring-accent/30` |
| Segoe UI / `--font-display` / `--font-body` | font | remove declarations → inherit `Inter` from `html` |
| `border-radius: 2px` | radius | `rounded-sm` (`--radius-sm: 2px`) |
| `border-radius: 3px` / `4px` | radius | `rounded-md` (`--radius-md: 4px`) |
| Segoe UI sizes `clamp(3.5rem,8vw,7rem)` (hero h1) | display size | keep responsive scale via `text-5xl sm:text-6xl lg:text-7xl` (no token for clamp; utility scale) |
| SVG `stroke="#f5b026"` (9 feature icons) | icon color | `stroke="currentColor"` + wrapper `text-accent` |
| inline `style={{ color:'#f5b026' }}` (nav "Comenzar", step numbers) | accent | `text-accent font-semibold` |
| `rgba(10,10,10,0.85)` scrolled nav bg | nav scrolled | `bg-surface/85 backdrop-blur border-b border-border` |

**Glow / grid (token-derived, NOT hardcoded):** built with `color-mix(in srgb,
var(--color-accent) N%, transparent)` in the minimal CSS (see §5), so alpha derives from
the token rather than a literal hex. The pulsing glow blob is a Tailwind element
(`bg-accent/30 blur-3xl rounded-full`) driven by one retained keyframe.

## 3. Component Reuse Plan

| Landing markup today | Replacement |
|---|---|
| `.feature-card` × 9 (icon + h3 + p) | shared **`Card`** (no `title` prop → plain body): `<Card><div class="…icon">…</div><h3>…</h3><p>…</p></Card>` |
| `.feature-card` × 3 (how-it-works steps) | same `Card`; step number as `text-accent text-2xl font-bold` |
| `.hero-card` stats | glass panel `bg-white/10 backdrop-blur border border-white/20 rounded-lg` (NOT `Card` — Card forces opaque white surface, wrong over the gradient) |
| `.cta-inner` panel | `Card` (`bg-surface`) centered, or a `bg-surface rounded-lg shadow-card` block |

### Button reuse — genuine fork, resolved

`ui/button.tsx` `Button`/`FloatingButton` render a `<button>` element. The landing CTAs
are **navigations**: in-page anchors (`href="#registro"`, `href="#caracteristicas"`) and
route `Link`s (`to="/login"`, `to="/register"`). A `<button>` cannot be an anchor, and
nesting `<button>` inside `<a>`/`<Link>` is invalid HTML. `Button` is consume-as-is
(shared-component changes are out of scope).

**Decision:**
- Use **`Button`** only for real button actions: the **nav hamburger toggle**, and the
  "Ver características" scroll action can be a `Button variant="outline"` with an
  `onClick` smooth-scroll (or left as an anchor — see below).
- For route/anchor CTAs (`Link`/`<a>`), apply the **same token utilities `Button` uses**
  inline so the visual + tokens stay identical without forking the component. Define one
  local constant to avoid drift:
  ```ts
  // mirrors Button primary variant (ui/button.tsx VARIANT_CLASSES.primary)
  const ctaPrimary =
    'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 shadow-card ' +
    'bg-primary text-white text-sm font-medium transition-colors hover:bg-primary-hover';
  ```
  The hero "Comenzar" anchor uses `ctaPrimary`; the ghost "Ver características" uses an
  outline-mirroring constant. This keeps the token contract single-sourced conceptually
  while respecting the "no shared-component change" boundary.

> See MARK-1 for the alternative (extend `Button` with `asChild`) which WOULD touch the
> shared component.

## 4. Responsive Strategy

Replace the hand-rolled Bootstrap grid (`.container/.row/.col-lg-*/.offset-lg-1/.g-*`)
with native Tailwind, aligned to the app's card-grid convention
(`admin/stores/components/store-card-list.tsx`: `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`).

| Section | Old classes | New utilities |
|---|---|---|
| page container | `.container` (max 1140px, px 1rem) | `mx-auto w-full max-w-6xl px-4` |
| hero row | `.row .col-lg-6 / .col-lg-5 .offset-lg-1` | `grid grid-cols-1 items-center gap-8 lg:grid-cols-2` (copy left, stats right) |
| features grid | `.row .g-4 .col-md-6 .col-lg-4` | `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` |
| how-it-works | `.row .g-5 .col-md-4` | `grid grid-cols-1 gap-6 md:grid-cols-3` |
| section header split | `.col-lg-6 / .col-lg-5 .offset-lg-1` | `grid grid-cols-1 gap-6 lg:grid-cols-2` |
| hero actions | `.hero-actions` flex + `@media(max-width:768)` column | `flex flex-col gap-4 sm:flex-row` |

**Breakpoint note.** Old CSS used 992px for `lg`; Tailwind `lg` = 1024px. This ~32px
drift is accepted (proposal Risks: "Responsive breakpoints drift" = Low, mitigated by
reusing app conventions). We standardize on Tailwind `sm`/`md`/`lg` — same tokens every
other route uses.

## 5. CSS File Fate — REDUCE (not delete)

`landing-deep.css` (717 lines) is reduced to **~30–40 lines** containing ONLY what Tailwind
utilities/tokens cannot express, all token-derived. Everything else is ported to
utilities and removed.

**Retained (minimal CSS):**
1. `@keyframes landingGlowPulse` — opacity+scale pulse for the hero/CTA glow blob
   (Tailwind `animate-pulse` is opacity-only; scale pulse needs a keyframe).
2. `@keyframes landingFadeInUp` — entrance for hero eyebrow/title/sub/actions (staggered).
3. `.landing-hero-grid` — the decorative grid + radial mask
   (`background-image` two linear-gradients + `mask-image` radial), using
   `color-mix(in srgb, var(--color-accent) 4%, transparent)` so the tint derives from the
   token, not a hex.
4. Two utility classes wiring the keyframes: `.landing-animate-glow`,
   `.landing-animate-in` (+ optional delay variants).

**Deleted:** all `.container/.row/.col-*`, `.d-*`, `.btn-*`, `.feature-card`, `.hero-card`,
`.nav-*`, `.section-*`, `.cta-*`, `.footer*`, font vars, every hardcoded hex.

> Rationale: proposal §Approach explicitly allows keeping "keyframe animations for
> glow/grid." `color-mix` keeps even the decorative bits token-sourced.

## 6. Scroll-Reveal — logic tweak required

The current reveal uses `IntersectionObserver` → `entry.target.classList.add('visible')`,
which depends on the deleted `.feature-card`/`.visible` CSS transition rules. Also `Card`
does **not** forward a `ref`, so the observer can't attach to a `Card` directly.

**Decision:** refactor reveal from DOM class mutation → **React state**. Keep an observer
that flips a `Set<number>` of revealed indices; each feature tile's **outer wrapper `div`**
(which holds the `ref`) applies conditional Tailwind:
`opacity-0 translate-y-5` → `opacity-100 translate-y-0`, with `transition-all duration-500`.
The `Card` (or icon+title+desc body) lives inside that wrapper.

This is a small, justified deviation from "keep useEffect intact" (proposal): the classList
approach is unusable once the CSS is gone, and it makes the behavior testable. **No behavior
change** — cards still reveal on scroll into view (threshold 0.1, `rootMargin` preserved).

## 7. Nav / Menu

Landing keeps its OWN public nav (not the authenticated `navbar.tsx`), rebuilt on tokens:

- **Bar:** `fixed inset-x-0 top-0 z-50 py-5`; scrolled state (existing `isScrolled`) →
  `bg-surface/85 backdrop-blur border-b border-border` (was `rgba(10,10,10,.85)`).
- **Brand "VendeDTo":** `text-accent font-bold text-2xl`.
- **Desktop links:** `hidden lg:flex …`; link `text-text-muted hover:text-accent uppercase text-sm`.
- **Primary "Comenzar":** `ctaPrimary` constant (§3).
- **Hamburger:** replace the 3-span CSS-animated bars with a `Button variant="outline"`
  (or a plain `<button>`) that toggles `menuOpen`, showing an inline hamburger SVG when
  closed and the shared **`CloseIcon`** (`ui/icons.tsx`) when open (no `MenuIcon` exists —
  inline the 3-line SVG for the closed state). `lg:hidden`.
- **Dropdown:** conditionally rendered when `menuOpen` (no CSS opacity/visibility dance):
  `absolute right-0 top-full min-w-[200px] bg-surface border border-border border-t-2
  border-t-accent rounded-md shadow-card`; items `text-text hover:text-accent
  hover:bg-accent/5`. Keep existing `closeMenu` (10ms timeout) and `onClick` handlers.

`showLoginButton = !canInstall` logic and the login/register `Link`s are preserved
verbatim; only classes change.

## 8. Test Approach (strict TDD)

Route has **no tests today**. `IntersectionObserver` is **not in jsdom** and is used only
by this route — tests MUST stub it (a global mock capturing the callback so reveal can be
triggered, and so mount doesn't crash). The landing uses **hardcoded Spanish literals**
(not `react-intl`), so no `IntlProvider` is needed, but `<Link>` requires a router →
wrap in `<MemoryRouter>` (react-router). Mirror the PWA/`matchMedia`/`serviceWorker`
mocking from `install-app-button.test.tsx`.

New file: `app/home/routes/__tests__/landing-deep.test.tsx`.

Test cases (write first, red → green):
1. **Exports** — default export is a function; **`clientLoader` is `undefined`** (guards
   the "no guard/redirect on `/`" constraint — §9 / HARD CONSTRAINT).
2. **Hero renders** — heading (`getByRole('heading', { name: /Vende más/i })`) and brand
   text `VendeDTo` present.
3. **Content completeness** — all 9 `FEATURES` titles and all 3 `STEPS` titles render.
4. **Auth links** — with `canInstall=false` (default mocks): `Link` to `/login` present
   ("Entrar"); register CTA `Link` to `/register` present.
5. **PWA gate** — when installable (matchMedia standalone `false` + `serviceWorker`
   present, or dispatched `beforeinstallprompt`): `showLoginButton` false → the "Entrar"
   desktop login link is NOT rendered.
6. **Hamburger toggle** — dropdown items hidden initially; click toggler → dropdown items
   (e.g. "Iniciar sesión") appear; click again → hidden. Assert via `queryByText`/role.
7. **Scroll-reveal** — feature wrappers start with `opacity-0` (hidden); after firing the
   stubbed observer callback with `isIntersecting: true`, they become `opacity-100`.
8. **Token guardrails** (regression against re-hardcoding) — assert load-bearing token
   classes: hero container `toHaveClass('bg-gradient-to-br','from-primary')`; primary CTA
   `toHaveClass('bg-primary')`; an accent element `toHaveClass('text-accent')`. Kept
   minimal and load-bearing so a revert to hex/dark fails the suite.

> Class-name assertions are normally brittle, but for a token-migration this IS the
> contract: they are the mechanical guard that the page uses tokens, not hardcoded hex.

## 9. HARD CONSTRAINT — `/` stays public, no routing/loader change

- `landing-deep.tsx` must **NOT** export a `clientLoader`, and must add **no** guard,
  redirect, or auth check. Test case 1 asserts `clientLoader === undefined`.
- `app/routes.ts` **index entry is untouched** — the extensive Angular-parity comment
  (routes.ts:4–20 explaining the unguarded `''` route and the dead nested redirect) stays
  as-is. No routing change happens in this work.
- This is purely a presentational restyle of one route + its CSS.

## MARK — needs user confirmation

1. **Button `asChild` (shared-component change).** The clean way to reuse `Button` for
   `Link`/anchor CTAs would be to add an `asChild`/polymorphic `as` prop to
   `ui/button.tsx`. That edits a **shared component** (proposal says consume as-is / no
   shared changes). Default in this design: DO NOT change `Button`; use the `ctaPrimary`
   utility constant mirroring `Button`'s primary variant. Confirm this is acceptable, or
   approve extending `Button` (would widen scope to a shared file + its tests).
2. **Hero stays gradient/light vs. dark.** Design chooses a LIGHT page + purple→amber
   gradient hero (no dark token exists). If you specifically want to preserve the current
   near-black hero mood, that requires introducing a dark-surface token (shared change,
   currently out of scope). Confirm the gradient direction is what you want.
3. **Reveal logic tweak.** Design changes scroll-reveal from `classList.add('visible')`
   to React state (required to fully delete the CSS and to attach a ref, since `Card`
   doesn't forward refs). Behavior is unchanged. Confirm this micro-deviation from "keep
   useEffect intact" is OK.
4. **Retain a minimal `landing-deep.css`** (~30–40 lines: 2 keyframes + token-derived grid
   via `color-mix`) rather than deleting it 100%. Alternative is dropping the grid + using
   `animate-pulse` for the glow and no entrance stagger (fully CSS-free, slightly less
   "llamativo"). Confirm REDUCE vs. full DELETE.
