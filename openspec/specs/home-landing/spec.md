# Home Landing — Public Route Presentation Specification

## Purpose

Presentation contract for the public `/` index route (`app/home/routes/landing-deep.tsx`,
`web-store-pos` app). The route is the app's marketing/landing page — publicly reachable,
unauthenticated — and MUST use the shared React design system (`@theme` tokens, `Button`,
`Card`) like every other route, instead of a bespoke standalone stylesheet.

## Requirements

### Requirement: Token-Based Visual Styling

The landing route's markup and its retained stylesheet rules MUST use the shared `@theme`
design tokens (`bg-primary`, `bg-background`, `bg-surface`, `text-primary`, `text-accent`,
`border-border`, `rounded-*`, `shadow-card`, the Inter font stack) declared in
`frontend-react/packages/web-common/styles.css`. The route MUST NOT declare hardcoded hex
colors (e.g. `#0a0a0a`, `#f5b026`), `Segoe UI`-first font stacks, or stylesheet rules that
duplicate token values or Bootstrap-grid/component classes.

`landing-deep.css` is REDUCED (not deleted) to a small token-derived remnant — currently
~20 lines containing only the `landingFadeInUp` entrance-animation keyframe and its
`.landing-animate-in` wiring class used for the hero's staggered fade-in. It carries zero
hardcoded hex values and zero duplicated component/grid rules; everything else that the
original 717-line stylesheet declared (Bootstrap grid, `.feature-card`, `.hero-card`,
`.nav-*`, dark-theme colors, font vars) was ported to Tailwind utilities/tokens and removed.

#### Scenario: Retained stylesheet is a minimal token-derived remnant

- GIVEN the `/` route is requested
- WHEN `LandingDeep` renders
- THEN the only stylesheet import is the reduced `landing-deep.css` (entrance-animation
  keyframe + wiring class only)
- AND no inline `style` attribute or class in the rendered output sets a raw hex color
  value
- AND the retained CSS contains no Bootstrap-grid, `.feature-card`, `.hero-card`, `.nav-*`,
  or other component/grid-duplicating rules

#### Scenario: Hero renders on the app's standard surface

- GIVEN the hero section (`#hero`) renders
- WHEN its background and text styling is inspected
- THEN the hero uses the app's standard light background (`bg-background`) and text token
  (`text-text`) — the SAME surface every other route in the app uses — NOT a full-bleed
  purple→amber gradient and NOT the old bespoke dark background
- AND accent tokens (`text-accent`, `bg-accent`) are used for eye-catching highlights (the
  eyebrow label, the "todo." emphasis span, the primary CTA button, the stats numbers)
  rather than as a background gradient
- AND the hero stats panel renders as a normal `bg-surface` card (`border border-border
  shadow-card`), visually consistent with the Card-based tiles elsewhere on the page — not
  a glass/gradient-overlay panel

### Requirement: Shared Component Reuse for Interactive Elements

CTAs (the `#registro` "Comenzar" / "Crear cuenta gratis" links, `#login` link) and
repeating tiles (the 9 `FEATURES` cards, 3 `STEPS` cards) MUST render using the shared
`Button` (`app/shared/components/ui/button.tsx`) and `Card` (`app/shared/components/ui/card.tsx`)
components instead of the bespoke `.btn-primary-amber`, `.btn-ghost`, and `.feature-card`
classes. Route/anchor CTAs (`Link`/`<a>`, which cannot nest a `<button>`) apply the same
token utilities `Button`'s primary/outline variants use, inline, via local constants
(`ctaPrimary`/`ctaOutline`) rather than forking the shared component.

#### Scenario: Feature tiles use the shared Card

- GIVEN the features section (`#caracteristicas`) renders
- WHEN a `FEATURES` entry is displayed
- THEN it is rendered inside a `Card` component (`data-slot="card"`)

#### Scenario: Primary CTA uses the shared Button (or Button-variant classes)

- GIVEN the hero or CTA section renders
- WHEN the "Comenzar" / "Crear cuenta gratis" action is displayed
- THEN it renders via a `Link`/`<a>` styled with the `Button` primary-variant classes
  (`ctaPrimary`), not the removed `.btn-primary-amber` class
- AND the one real `<button>` element on the route (the mobile nav hamburger toggle) uses
  the `Button` component directly

### Requirement: Responsive Layout via Tailwind Breakpoints

The route MUST replace the Bootstrap-style `.container/.row/.col-lg-*` grid and
`d-flex`/`d-lg-none` utility classes with native Tailwind grid/flex utilities and
`sm:`/`md:`/`lg:` breakpoint prefixes, mirroring the
`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` pattern used in
`app/admin/stores/components/store-card-list.tsx`.

#### Scenario: Features grid collapses to one column on mobile

- GIVEN the viewport is narrower than the `sm` breakpoint
- WHEN the features section renders
- THEN feature cards stack in a single column (`grid-cols-1`)

#### Scenario: Features grid expands on desktop

- GIVEN the viewport is at or above the `lg` breakpoint
- WHEN the features section renders
- THEN feature cards lay out across 3 columns, matching the `sm:grid-cols-2 lg:grid-cols-3`
  pattern

### Requirement: Responsive Navigation Menu

The `.landing-nav` navbar MUST remain a working, self-contained nav for the home route (not
a duplicate of the app's authenticated sidebar/header): it MUST show inline links on
desktop widths and MUST collapse into a toggleable mobile dropdown below the `lg`
breakpoint, using React state (`menuOpen`)-driven conditional rendering/Tailwind visibility
utilities instead of the original bespoke `.d-lg-none`/`.nav-dropdown.show` classes.

#### Scenario: Desktop nav shows inline links

- GIVEN the viewport is at or above the `lg` breakpoint
- WHEN the navbar renders
- THEN "Características", "Cómo funciona", "Entrar" (when `showLoginButton` is true), and
  "Comenzar" are visible as inline elements
- AND the mobile toggler button is not visible

#### Scenario: Mobile nav toggles the dropdown

- GIVEN the viewport is below the `lg` breakpoint
- WHEN the user clicks the nav toggler button
- THEN the dropdown menu becomes visible with "Inicio", "Características", "Cómo
  funciona", "Iniciar sesión", and "Comenzar" links
- AND clicking a dropdown link closes the menu (`closeMenu` behavior preserved)

### Requirement: Preserved Section Structure and Behavior

The route MUST preserve its section structure — nav, hero (`#hero`), features
(`#caracteristicas`), how-it-works (`#como-funciona`), CTA (`#registro`), footer — and its
non-visual behavior: scroll-driven navbar background (`isScrolled`), PWA installability
detection (`canInstall` / `showLoginButton`), and `IntersectionObserver`-based feature-card
reveal on scroll (implemented via React state — `Set<number>` of revealed indices — rather
than direct DOM `classList` mutation, since the reveal-transition CSS rules were removed
with the bespoke stylesheet and `Card` does not forward a ref). Restyling MUST NOT alter
copy content, anchor IDs, or this behavior.

#### Scenario: PWA-installable state hides the login link

- GIVEN `canInstall` is `true` (installable PWA context)
- WHEN the navbar renders
- THEN the "Entrar" link is not rendered (`showLoginButton` is `false`)

#### Scenario: Anchor navigation still resolves

- GIVEN the page has rendered
- WHEN a user clicks "Ver características" in the hero
- THEN it navigates to the `#caracteristicas` section (anchor href unchanged)

### Requirement: No Auth Behavior Change on the Public Route

The `/` index route MUST remain public and unauthenticated. The redesign MUST NOT add a
`clientLoader`, auth guard, or redirect to `home/routes/landing-deep.tsx` or its entry in
`app/routes.ts`. This mirrors the documented Angular-parity decision in `app/routes.ts`
(lines 4-19): an authenticated user hitting `/` also sees the public landing page in
Angular, with no root-level redirect.

#### Scenario: Route stays reachable without auth

- GIVEN an unauthenticated user
- WHEN they navigate to `/`
- THEN `LandingDeep` renders directly with no redirect to `/login`

#### Scenario: routes.ts index entry is unchanged

- GIVEN `app/routes.ts`
- WHEN the index route entry is inspected
- THEN it remains `index('home/routes/landing-deep.tsx')` with no `clientLoader`/loader
  wrapper added

### Requirement: Regression Test Coverage

The route MUST have test coverage (`app/home/routes/__tests__/landing-deep.test.tsx`),
following the existing route-test convention (Vitest + Testing Library + `MemoryRouter`),
covering at minimum: initial render of all five sections, the mobile nav toggle
interaction, and the `showLoginButton` conditional (installable vs. not).

#### Scenario: Render test covers all sections

- GIVEN the test suite runs
- WHEN `LandingDeep` is rendered inside `MemoryRouter`
- THEN assertions confirm the hero, features, how-it-works, CTA, and footer sections are
  present in the DOM

#### Scenario: Interaction test covers mobile menu toggle

- GIVEN `LandingDeep` is rendered
- WHEN the nav toggler button is clicked
- THEN the dropdown menu's visibility state changes as asserted by the test
