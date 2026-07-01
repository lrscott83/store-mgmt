# Design: Help Tutorial Page (Angular → React Migration)

## Technical Approach

Implements Approach A from the proposal: a single static React Router route file
`app/help/routes/tutorial.tsx` rendered inside the existing authenticated
`app-layout` block. No data layer, no services, no `featureLoader`. Auth is
satisfied transitively by `app-layout`'s `authLoader`. The accordion uses native
`<details>/<summary>` styled with Tailwind. Only `TUTORIAL.TITLE` is i18n
(`useIntl`); step prose is hardcoded Spanish to match the Angular source. Images
are referenced by absolute public path (`/images/help/<name>`).

The pattern mirrors the existing simple routes (`profile/routes/change-password.tsx`):
a named page export plus `export default`. Verified against the live sidebar
filter (`sidebar.tsx:20`): an item with `featureIds: []` returns `true` → always
visible; groups are hidden only when they have zero visible items
(`sidebar.tsx:23`), and `moduleId` does NOT gate group visibility. The existing
`MENU.PROFILE` group (no `moduleId`) is the proof case for a feature-less group.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Accordion impl | Native `<details>/<summary>` + Tailwind | Component/UI library | No Angular Material mapping in React stack; zero new deps; built-in a11y + toggle state |
| Auth gating | Inherit parent `authLoader` only; no `featureLoader` | Per-route `featureLoader([...])` | Angular route had no guard; adding one would over-restrict and break parity |
| Image serving | `public/images/help/` via absolute paths (`/images/help/x.png`) | Vite `import` / asset bundling | Static assets, no transform needed; matches absolute-path convention; simplest copy-over |
| Step content i18n | Hardcoded Spanish prose; only `TUTORIAL.TITLE` translated | Full i18n of all steps | Source parity with Angular (which hardcoded it). Accepted parity, not debt to fix now. |

## Data Flow

No data flow. Pure presentational route — no loader data, no store reads beyond
what `app-layout` already provides, no HTTP.

    Browser ──GET /help/tutorial──→ app-layout (authLoader) ──→ tutorial.tsx (static render)
                                                                     │
                                                      /images/help/*.png (public assets)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/help/routes/tutorial.tsx` | Create | Static page: title via `useIntl`, native `<details>` accordion, 6 `<img>` by absolute path. Named export + `export default`. |
| `app/help/routes/__tests__/tutorial.test.tsx` | Create | Render test: asserts title, accordion summary, and all 6 image `src` paths. |
| `app/routes.ts` | Modify | Add `route('help/tutorial', 'help/routes/tutorial.tsx')` inside the `app-layout` block. |
| `app/shared/lib/config/menu-config.ts` | Modify | Append a `MENU.HELP` group (no `moduleId`) with one item `{ label: 'MENU.TUTORIAL', path: '/help/tutorial', featureIds: [] }`. |
| `app/shared/lib/i18n/es.ts` | Modify | Add `MENU.HELP`, `MENU.TUTORIAL`, `TUTORIAL.TITLE`. |
| `public/images/help/` | Create | Copy 6 PNG/WEBP screenshots from the Angular source. |

Base path for all `app/`, `public/`, `openspec/` references:
`frontend-react/apps/web-store-pos/`.

## Interfaces / Contracts

No new interfaces. Reuses the existing `MenuItem` / `MenuGroup` shapes from
`menu-config.ts`. The new group conforms to the `MenuGroup` interface with
`groupLabel: 'MENU.HELP'` and no `moduleId` (same shape as `MENU.PROFILE`).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | tutorial.tsx renders title, accordion summary, 6 image `src` = `/images/help/*` | RTL render test (strict TDD: write first) |
| Integration | Sidebar shows Help → Tutorial for any authed user | Covered by existing sidebar test pattern; optional assertion |
| E2E | None | Out of scope; static page |

## Migration / Rollout

No migration. Purely additive. Rollback = revert the single PR (route entry, menu
group, 3 i18n keys, 2 new files, 6 copied images). No data or schema changes.

## Open Questions

- None. All decisions settled by exploration/proposal and confirmed against the
  live codebase (`routes.ts`, `menu-config.ts`, `sidebar.tsx`, `es.ts`).
