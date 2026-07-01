# Exploration: help-tutorial

**Change:** help-tutorial
**Phase:** Explore
**Date:** 2026-06-02
**Mode:** Hybrid (engram + openspec file)

---

## Goal

Migrate the Angular `help/tutorial` page to React 19 — the last functional gap in
the Angular→React migration (`frontend-react/`).

## Current State

The Angular `TutorialComponent` is the simplest page in the codebase — PURELY STATIC:

- Zero state, zero services, zero HTTP calls.
- One `mat-accordion` (collapsed by default) with 4 hardcoded Spanish steps for "how to make a sale".
- 6 images from `assets/images/help/*.png`.
- Exactly ONE i18n key: `TUTORIAL.TITLE` (card heading only; all step prose is hardcoded Spanish).
- Route registered at `help/tutorial` inside the client layout shell with
  `data: { expectedFeatures: [] }` and NO `canActivate` guard — any authenticated user can access it.

Confirmed trivial. No hidden complexity.

## Affected Areas

**New files:**
- `apps/web-store-pos/app/help/routes/tutorial.tsx` — page component (static JSX, one `useIntl` call).
- `apps/web-store-pos/app/help/routes/__tests__/tutorial.test.tsx` — smoke test (render + assert heading).
- `apps/web-store-pos/public/images/help/` — 6 image assets copied from Angular `frontend/src/assets/images/help/`.

**Modified files:**
- `apps/web-store-pos/app/routes.ts` — add `route('help/tutorial', 'help/routes/tutorial.tsx')` inside the app-layout block.
- `apps/web-store-pos/app/shared/lib/i18n/es.ts` — add `TUTORIAL.TITLE`, `MENU.HELP`, `MENU.TUTORIAL`.
- `apps/web-store-pos/app/shared/lib/config/menu-config.ts` — add a Help group with one Tutorial item (`featureIds: []`).

## Approaches

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| A. Single inline static route file | Fewest files; matches simplest existing slices; no indirection | Markup isolation marginally harder to test (minor) | Low |
| B. Route container + presentational component | Consistent with profile/reports | Over-engineering for static text+images | Low-Med |
| C. MDX/markdown-driven content | Future-proof if it grows | Adds tooling not in stack; disproportionate | High |

## Recommendation

**Approach A** — single `tutorial.tsx` route file with:
- `useIntl` for `TUTORIAL.TITLE` only.
- Native `<details>/<summary>` accordion (no library dep; Tailwind-styled).
- Images referenced as `/images/help/*.png` (public/ absolute paths).
- NO `featureLoader` export — auth inherited from the parent `app-layout` loader (`authLoader`). Adding a `featureLoader([])` would be redundant and incorrect.
- Menu entry in a new `MENU.HELP` group with `featureIds: []` (always visible to authenticated users, matching Angular).

## Risks

1. **Image asset copy** — 6 files from `frontend/src/assets/images/help/` must be placed in `public/images/help/`. Easy to forget (not a code change).
2. **Auth gate parity** — do NOT add `featureLoader`; the Angular route has no guard, parent `authLoader` is correct.
3. **New menu group** — adds a Help section at the bottom of the sidebar; needs a visual smoke test.
4. **Content localization gap** — step prose stays hardcoded Spanish (acceptable; matches Angular).

## Ready for Proposal

Yes. Truly trivial — static page, no service layer, no state. Estimated diff ~120–150 lines across 3–4 code files + 1 asset copy. Single PR, no chaining.
