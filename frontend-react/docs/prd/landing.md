# PRD: Landing & Legal Pages Module

**Product:** Vende De Todo POS  
**Migration:** Angular → React (offline-first PWA)  
**Module:** Landing & Legal Pages  
**Status:** Draft  
**Date:** 2026-05-27

---

## Overview

The Landing & Legal Pages module covers every public-facing page that renders without authentication. These are the lightest pages in the application — they must load fast, work without a session, and never pull in the authenticated app shell.

There are two distinct categories:

1. **Landing page** — the marketing entry point for unauthenticated visitors. It is redesigned from scratch using Tailwind CSS. Its job is to communicate the product's value and direct users to login or register.
2. **Legal pages** — cookie policy, privacy policy, and terms & conditions. These are static content pages migrated as-is from Angular. They exist to satisfy legal requirements; they do not need to be memorable, just accurate and accessible.

---

## User Stories

- As an unauthenticated visitor, I can see the landing page with product features and branding so I can decide whether to create an account.
- As a visitor, I can navigate from the landing page to `/login` and `/register` directly via clear call-to-action buttons.
- As a user, I can read the cookie policy, privacy policy, and terms & conditions without logging in.
- As any user (authenticated or not), I can access legal pages directly by URL without being redirected.
- As a developer, I can render all four pages without loading the authenticated layout shell (sidebar, nav bar, header) so the bundle stays minimal.

---

## Routes

All routes in this module are **public** — no authentication check, no redirect, no layout wrapper.

| Path | Component | Type |
|------|-----------|------|
| `/` | `LandingDeepComponent` | Marketing (redesigned) |
| `/cookies-private` | `CookiesPrivateComponent` | Legal (static, migrated) |
| `/private-police` | `PrivatePoliceComponent` | Legal (static, migrated) |
| `/terms-conditions` | `TermsConditionsComponent` | Legal (static, migrated) |

> **Note on Angular alternates:** The Angular codebase contains `LandingComponent` and `Landing2Component` as unused alternates alongside `LandingDeepComponent`. Only `LandingDeepComponent` is migrated. The unused alternates are discarded.

---

## Components

### `LandingDeepComponent`

The primary entry point for unauthenticated users. This component is **redesigned** — it is not a direct port from Angular.

Responsibilities:
- Display app name, tagline, and key feature highlights.
- Communicate the offline-first / PWA value proposition.
- Provide prominent call-to-action links to `/login` and `/register`.
- Include footer links to the legal pages (`/cookies-private`, `/private-police`, `/terms-conditions`).

Design constraints:
- Built with Tailwind CSS, consistent with the React app's design system.
- Responsive — mobile-first layout.
- No authentication state dependency. The component must render correctly regardless of whether a session exists.
- If a user is already authenticated, optionally show a "Go to app" link rather than login/register. This is a soft enhancement — the page must not break if auth state is unavailable.

### `CookiesPrivateComponent`

Cookie policy page. Static content migrated from Angular without redesign. Displays the platform's cookie usage policy in a readable, accessible format.

### `PrivatePoliceComponent`

Privacy policy page. Static content migrated from Angular without redesign. The route path `/private-police` is preserved from Angular for URL continuity (even though the conventional spelling is "policy").

### `TermsConditionsComponent`

Terms and conditions page. Static content migrated from Angular without redesign. Full legal text, potentially long — must support natural scroll. No pagination or accordion required unless the content itself warrants it.

---

## Design Requirements

### Landing Page (`LandingDeepComponent`)

- **Design system:** Tailwind CSS. Do not use inline styles or separate CSS files for this component.
- **Typography:** Use the app's defined font scale. Headings should be large and impactful.
- **Color palette:** Follow the app's brand colors. The landing page is the first impression — it must feel consistent with the rest of the product.
- **Layout structure:**
  - Hero section: headline, subheadline, primary CTA buttons (Login / Register).
  - Features section: 3–4 key selling points with icons or illustrations.
  - Footer: links to legal pages and optional social/contact info.
- **Responsive breakpoints:** Mobile (`< 768px`), tablet (`768px–1024px`), desktop (`> 1024px`).
- **Accessibility:** Semantic HTML (`<main>`, `<section>`, `<nav>`, `<footer>`). CTAs must be `<a>` tags or `<button>` elements with visible focus styles.

### Legal Pages (`CookiesPrivateComponent`, `PrivatePoliceComponent`, `TermsConditionsComponent`)

- **Layout:** Simple, clean reading layout. Max-width container centered on the page. No sidebar, no tabs.
- **Typography:** Readable body text size (`16px` minimum), appropriate line height for long-form content.
- **No redesign:** Content is migrated as-is from Angular. Only the wrapping markup and styles are updated to use Tailwind utilities.
- **Back link:** Each legal page should include a link back to `/` so users can return to the landing page.

---

## Performance Requirements

These are the lightest pages in the app. The following constraints are non-negotiable:

### Bundle Isolation

- These pages must **not** import the authenticated app shell (sidebar, nav bar, store context, POS modules).
- In the React Router configuration, the `/` and legal routes must live outside the authenticated layout route. They should have their own minimal layout (or no layout at all).
- The landing page chunk must not include chart libraries, inventory modules, or any POS-specific dependency.

### Code Splitting

- Each page is lazy-loaded via `React.lazy` / `Suspense`. No page is bundled into the main entry chunk.
- Legal pages are rarely visited — they should be in their own small split chunk.

### No Heavy Dependencies

- The landing page may use Tailwind CSS (utility classes only — no runtime overhead).
- Do not add animation libraries (Framer Motion, GSAP) to the landing page unless explicitly approved. CSS transitions via Tailwind are sufficient.
- No data fetching on any of these pages. They are fully static at render time.

### Target Metrics

| Metric | Target |
|--------|--------|
| Landing page LCP | < 2.5s on 3G |
| Legal page FCP | < 1.5s on 3G |
| Landing JS chunk size | < 50 KB (gzipped) |
| Legal pages JS chunk | < 20 KB (gzipped) |

---

## No-Auth Behavior

These pages are intentionally outside the authentication boundary.

- **No redirect on unauthenticated access.** The router must not apply any auth guard to these routes.
- **No session check on mount.** Components must not call `useAuth()` or any hook that triggers a session fetch, except optionally in `LandingDeepComponent` for the "already logged in" soft enhancement.
- **Service worker behavior:** The service worker may cache these pages for offline access. This is the only module in the app where PWA caching of page content is desirable for unauthenticated users.
- **No authenticated layout shell.** These routes must be defined outside the authenticated layout route in the React Router tree. The layout shell (sidebar, top bar) must never appear on these pages.

### React Router Structure (illustrative)

```tsx
// Root router — illustrative structure only
<Routes>
  {/* Public routes — no layout shell, no auth guard */}
  <Route path="/" element={<LandingDeepComponent />} />
  <Route path="/cookies-private" element={<CookiesPrivateComponent />} />
  <Route path="/private-police" element={<PrivatePoliceComponent />} />
  <Route path="/terms-conditions" element={<TermsConditionsComponent />} />

  {/* Auth routes */}
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />

  {/* Authenticated app — layout shell + guards applied here */}
  <Route element={<AuthenticatedLayout />}>
    {/* ... POS, inventory, admin routes ... */}
  </Route>
</Routes>
```

---

## Migration Notes from Angular

- Angular's router used a `NoLayoutComponent` shell (or equivalent) to strip the sidebar for public routes. In React Router v6, this is handled by placing public routes outside the `<AuthenticatedLayout>` route element — no special shell component needed.
- `LandingDeepComponent` had two unused siblings (`LandingComponent`, `Landing2Component`) in Angular. These are not migrated.
- The route path `/private-police` is preserved verbatim from Angular. Do not rename it to `/privacy-policy` — existing links and search engine indexing depend on this URL.
- Legal page content should be extracted from the Angular templates and placed in React components with minimal structural change. Only replace Angular-specific directives (`*ngIf`, `[class]` bindings) with their React equivalents.
