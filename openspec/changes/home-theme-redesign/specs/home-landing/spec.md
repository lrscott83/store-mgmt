# Delta for Home Landing

Domain: `app/home/routes/landing-deep.tsx` (public `/` index route). No existing
spec for this domain — this is a FULL spec for the route's presentation
contract, grounded in `frontend-react/packages/web-common/styles.css` (`@theme`
tokens), `app/shared/components/ui/button.tsx`, `app/shared/components/ui/card.tsx`,
and `app/routes.ts`.

## ADDED Requirements

### Requirement: Token-Based Visual Styling

The landing route's markup and any retained stylesheet rules MUST use the
shared `@theme` design tokens (`bg-primary`, `bg-background`, `bg-surface`,
`text-primary`, `text-accent`, `border-border`, `rounded-*`, `shadow-card`, the
Inter font stack) declared in `frontend-react/packages/web-common/styles.css`.
The route MUST NOT declare hardcoded hex colors (e.g. `#0a0a0a`, `#f5b026`),
`Segoe UI`-first font stacks, or standalone `landing-deep.css` rules that
duplicate token values. `landing-deep.css` MUST be deleted once all 29 hex
occurrences it currently contains are ported.

#### Scenario: Route renders without a bespoke stylesheet

- GIVEN the `/` route is requested
- WHEN `LandingDeep` renders
- THEN no `<link>`/`import` for `landing-deep.css` exists in the component tree
- AND no inline `style` attribute or class in the rendered output sets a raw
  hex color value

#### Scenario: Hero uses token-derived brand gradient

- GIVEN the hero section (`#hero`) renders
- WHEN its background/accent styling is inspected
- THEN the gradient/glow is composed from `--color-primary` and
  `--color-accent` (or their Tailwind utility equivalents `bg-primary`,
  `text-accent`) rather than fixed dark/amber hex values

### Requirement: Shared Component Reuse for Interactive Elements

CTAs (the `#registro` "Comenzar" / "Crear cuenta gratis" links, `#login` link)
and repeating tiles (the 9 `FEATURES` cards, 3 `STEPS` cards, hero stats card)
MUST render using the shared `Button` (`app/shared/components/ui/button.tsx`)
and `Card` (`app/shared/components/ui/card.tsx`) components instead of the
bespoke `.btn-primary-amber`, `.btn-ghost`, and `.feature-card` classes.

#### Scenario: Feature tiles use the shared Card

- GIVEN the features section (`#caracteristicas`) renders
- WHEN a `FEATURES` entry is displayed
- THEN it is rendered inside a `Card` component (`data-slot="card"`)

#### Scenario: Primary CTA uses the shared Button

- GIVEN the hero or CTA section renders
- WHEN the "Comenzar" / "Crear cuenta gratis" action is displayed
- THEN it renders via the `Button` component (or a `Link` styled with the
  `Button` variant classes) with `variant="primary"` (or `"fab"` for the
  prominent CTA), not the removed `.btn-primary-amber` class

### Requirement: Responsive Layout via Tailwind Breakpoints

The route MUST replace the Bootstrap-style `.container/.row/.col-lg-*` grid
and `d-flex`/`d-lg-none` utility classes with native Tailwind grid/flex
utilities and `sm:`/`md:`/`lg:` breakpoint prefixes, mirroring the
`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` pattern used in
`app/admin/stores/components/store-card-list.tsx`.

#### Scenario: Features grid collapses to one column on mobile

- GIVEN the viewport is narrower than the `sm` breakpoint
- WHEN the features section renders
- THEN feature cards stack in a single column (`grid-cols-1`)

#### Scenario: Features grid expands on desktop

- GIVEN the viewport is at or above the `lg` breakpoint
- WHEN the features section renders
- THEN feature cards lay out across 3 columns, matching the
  `sm:grid-cols-2 lg:grid-cols-3` pattern

### Requirement: Responsive Navigation Menu

The `.landing-nav` navbar MUST remain a working, self-contained nav for the
home route (not a duplicate of the app's authenticated sidebar/header): it
MUST show inline links on desktop widths and MUST collapse into a toggleable
mobile dropdown below the `lg` breakpoint, using React state
(`menuOpen`)-driven conditional rendering/Tailwind visibility utilities
instead of the current bespoke `.d-lg-none`/`.nav-dropdown.show` classes.

#### Scenario: Desktop nav shows inline links

- GIVEN the viewport is at or above the `lg` breakpoint
- WHEN the navbar renders
- THEN "Características", "Cómo funciona", "Entrar" (when `showLoginButton`
  is true), and "Comenzar" are visible as inline elements
- AND the mobile toggler button is not visible

#### Scenario: Mobile nav toggles the dropdown

- GIVEN the viewport is below the `lg` breakpoint
- WHEN the user clicks the nav toggler button
- THEN the dropdown menu becomes visible with "Inicio", "Características",
  "Cómo funciona", "Iniciar sesión", and "Comenzar" links
- AND clicking a dropdown link closes the menu (`closeMenu` behavior
  preserved)

### Requirement: Preserved Section Structure and Behavior

The route MUST preserve its existing section structure — nav, hero (`#hero`),
features (`#caracteristicas`), how-it-works (`#como-funciona`), CTA
(`#registro`), footer — and existing non-visual behavior: scroll-driven navbar
background (`isScrolled`), PWA installability detection (`canInstall` /
`showLoginButton`), and `IntersectionObserver`-based feature-card reveal on
scroll. Restyling MUST NOT alter copy content, anchor IDs, or this behavior.

#### Scenario: PWA-installable state hides the login link

- GIVEN `canInstall` is `true` (installable PWA context)
- WHEN the navbar renders
- THEN the "Entrar" link is not rendered (`showLoginButton` is `false`)

#### Scenario: Anchor navigation still resolves

- GIVEN the page has rendered
- WHEN a user clicks "Ver características" in the hero
- THEN it navigates to the `#caracteristicas` section (anchor href
  unchanged)

### Requirement: No Auth Behavior Change on the Public Route

The `/` index route MUST remain public and unauthenticated. The redesign
MUST NOT add a `clientLoader`, auth guard, or redirect to
`home/routes/landing-deep.tsx` or its entry in `app/routes.ts`. This mirrors
the documented Angular-parity decision in `app/routes.ts` (lines 4-19): an
authenticated user hitting `/` also sees the public landing page in Angular,
with no root-level redirect.

#### Scenario: Route stays reachable without auth

- GIVEN an unauthenticated user
- WHEN they navigate to `/`
- THEN `LandingDeep` renders directly with no redirect to `/login`

#### Scenario: routes.ts index entry is unchanged

- GIVEN `app/routes.ts`
- WHEN the index route entry is inspected
- THEN it remains `index('home/routes/landing-deep.tsx')` with no
  `clientLoader`/loader wrapper added

### Requirement: Regression Test Coverage

The route currently has zero test coverage
(`app/home/routes/__tests__/landing-deep.test.tsx` does not exist). The
redesign MUST add tests, following the existing route-test convention (e.g.
`app/auth/routes/__tests__/login.test.tsx`: Vitest + Testing Library +
`MemoryRouter` + `IntlProvider`), covering at minimum: initial render of all
five sections, the mobile nav toggle interaction, and the `showLoginButton`
conditional (installable vs. not).

#### Scenario: Render test covers all sections

- GIVEN the test suite runs
- WHEN `LandingDeep` is rendered inside `MemoryRouter`
- THEN assertions confirm the hero, features, how-it-works, CTA, and footer
  sections are present in the DOM

#### Scenario: Interaction test covers mobile menu toggle

- GIVEN `LandingDeep` is rendered
- WHEN the nav toggler button is clicked
- THEN the dropdown menu's visibility state changes as asserted by the test
