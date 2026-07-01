# Tasks: Help Tutorial Page

**Change:** help-tutorial
**Phase:** Tasks
**Status:** Done
**Date:** 2026-06-02
**Mode:** Hybrid (engram + openspec file)

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~130 (2 new files + 4 small modifications + 6 image copies) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | N/A |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full help-tutorial feature (images + component + route + menu + i18n + tests) | PR 1 (single) | ~130 lines; well under 400-line budget; additive only; no schema/migration risk |

---

## Phase 1: Foundation — Assets & i18n Keys (prerequisites for RED tests)

- [ ] 1.1 **[HELP-IMAGES]** Copy 6 screenshot files into `public/images/help/` (menu.png + 5 step screenshots). Filenames must match exact `src` values referenced in tutorial.tsx. _Satisfies: S-HELP-IMAGES-1_
- [ ] 1.2 **[HELP-I18N]** Add `TUTORIAL.TITLE`, `MENU.HELP`, and `MENU.TUTORIAL` keys with Spanish values to `app/shared/lib/i18n/es.ts`. Do NOT touch `en.ts`. _Satisfies: S-HELP-I18N-1_

## Phase 2: RED — Write Failing Tests First (strict TDD)

- [ ] 2.1 **[HELP-TEST]** Create `app/help/routes/__tests__/tutorial.test.tsx`. Write failing test: render `<TutorialPage>` inside `IntlProvider`; assert heading contains `TUTORIAL.TITLE` resolved value. _Satisfies: S-HELP-TEST-1, S-HELP-CONTENT-1_
- [ ] 2.2 **[HELP-TEST]** In same file, write failing test: assert exactly 4 `<details>` elements are present in the rendered output. _Satisfies: S-HELP-TEST-1, S-HELP-CONTENT-2_
- [ ] 2.3 **[HELP-TEST]** In same file, write failing test: assert exactly 6 `<img>` elements each with `src` starting with `/images/help/`. _Satisfies: S-HELP-TEST-1, S-HELP-CONTENT-3_
- [ ] 2.4 **[HELP-TEST / HELP-ACCESS]** In same file, write failing test: call `authLoader` without session; assert redirect response to `/login`. _Satisfies: S-HELP-TEST-2, S-HELP-ACCESS-2_

## Phase 3: GREEN — Implementation (make tests pass)

- [ ] 3.1 **[HELP-CONTENT]** Create `app/help/routes/tutorial.tsx`: named export `TutorialPage` + `export default`. Render `<h1>` from `useIntl` key `TUTORIAL.TITLE`. Render one `<details>` per step (4 total) with `<summary>` + hardcoded Spanish prose. Render 6 `<img src="/images/help/...">` with no Vite import. No third-party accordion component. _Satisfies: S-HELP-CONTENT-1, S-HELP-CONTENT-2, S-HELP-CONTENT-3, S-HELP-CONTENT-4, HELP-NGOAL-3_
- [ ] 3.2 **[HELP-ROUTE]** Modify `app/routes.ts`: add `route('help/tutorial', 'help/routes/tutorial.tsx')` inside the `app-layout` block. No `featureLoader` or `superAdminLoader`. _Satisfies: S-HELP-ROUTE-1, S-HELP-ROUTE-2, S-HELP-ACCESS-1, HELP-NGOAL-2_
- [ ] 3.3 **[HELP-MENU]** Modify `app/shared/lib/config/menu-config.ts`: append a new menu group with `groupLabel: 'MENU.HELP'`, no `moduleId`, and one item `{ label: 'MENU.TUTORIAL', path: '/help/tutorial', featureIds: [] }`. _Satisfies: S-HELP-MENU-1, S-HELP-MENU-2_

## Phase 4: Verification

- [ ] 4.1 **[HELP-TEST]** Run test suite — all 4 tests in `tutorial.test.tsx` must be GREEN. Zero regressions in adjacent tests.
- [ ] 4.2 **[HELP-ROUTE / HELP-ACCESS / HELP-CONTENT]** Manual smoke: dev-serve, navigate to `/help/tutorial` as authenticated user; confirm title, 4 accordion steps, and 6 images load from `/images/help/`.
- [ ] 4.3 **[HELP-MENU]** Manual smoke: sidebar shows "Help" group with "Tutorial" link for every role (OwnerAdmin, Reseller, SuperAdmin) and no feature-flag mock needed.
