# Proposal: Help Tutorial Page (Angular → React Migration)

## Intent

Migrate the legacy Angular `help/tutorial` page to React 19. It is a purely
static help page (an accordion of 4 hardcoded Spanish "how to make a sale" steps
with 6 screenshots). Migrating it closes a parity gap so authenticated users keep
access to in-app guidance after the React cutover. Trivial scope, purely additive.

## Scope

### In Scope
- New React route `help/tutorial` rendering the static tutorial content.
- Native `<details>/<summary>` accordion (no UI library dependency).
- 6 help images copied to `public/images/help/`.
- New sidebar menu group (Help → Tutorial), always visible (`featureIds: []`).
- i18n keys: `TUTORIAL.TITLE`, `MENU.HELP`, `MENU.TUTORIAL`.
- Auth via inherited `authLoader` from app-layout (no feature gate).

### Out of Scope
- Full i18n of step prose (carried over as hardcoded Spanish, matching source).
- Any feature/role gating (`featureLoader`) — Angular had none; do not add.
- New tutorial content, additional help pages, or search/filter behavior.
- Backend, services, or HTTP calls (page has none).

## Capabilities

### New Capabilities
- `help`: static in-app help/tutorial page accessible to any authenticated user,
  surfaced via a Help menu group, with no feature gating.

### Modified Capabilities
- None.

## Approach

Approach A from exploration (recommended): single inline static route file
`app/help/routes/tutorial.tsx` (~130 lines). Auth satisfied by the parent
`app-layout` block's `authLoader` — NO `featureLoader`. Accordion uses native
`<details>/<summary>` styled with Tailwind. The one translated string uses
`useIntl`; step prose stays hardcoded Spanish (source parity). Images referenced
by absolute path (`/images/help/menu.png`), no Vite import.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/help/routes/tutorial.tsx` | New | Static tutorial page component |
| `app/help/routes/__tests__/tutorial.test.tsx` | New | Render test |
| `app/routes.ts` | Modified | Add route inside app-layout block |
| `app/shared/lib/config/menu-config.ts` | Modified | Add Help → Tutorial group |
| `app/shared/lib/i18n/es.ts` | Modified | Add 3 i18n keys |
| `public/images/help/` | New | Copy 6 PNG/WEBP images |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Images not copied to React `public/` | Med | Explicit task; verify paths in test |
| New Help menu group affects sidebar layout | Low | Visual smoke test |
| Over-restricting with `featureLoader` | Low | Documented: inherit `authLoader` only |

## Rollback Plan

Purely additive. Revert the single PR: remove the route entry, menu group, i18n
keys, route/test files, and copied images. No data or schema changes.

## Dependencies

- None. Self-contained static page.

## Success Criteria

- [ ] `help/tutorial` renders for any authenticated user (no feature gate).
- [ ] Accordion expands/collapses the "Pasos para realizar una venta" panel.
- [ ] All 6 images load from `/images/help/`.
- [ ] Help → Tutorial appears in the sidebar.
- [ ] Render test passes; lint/build green.
