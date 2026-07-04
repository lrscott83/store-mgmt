# Design: Admin Features Parity (Stage 5 Admin)

Change: `admin-features-parity` | Artifact store: hybrid | Size: ~60-100 lines (commits-only).
Presentational + i18n parity refactor of a single page. No new capabilities, no service/route/contract changes.

## Architecture Approach

Compose the existing shared presentational primitives (`Card`, `Button variant="fab"`, icon set) that owners/resellers/stores card lists already use, instead of inventing page-local chrome. Business logic (handler, `isLoading` guard, inline feedback state) stays verbatim — this is a pure view-layer swap. No new layer, no new infra, no new dependency direction: the page already imports from `~/shared/components/ui/*`.

Confirmed shared APIs (source of truth for implementation):

- `Card` (`~/shared/components/ui/card`): `{ title?, footer?, children, className? }`. Renders `data-slot="card"` wrapper; when `title` is set, renders a header slot with the title inside an `<h3>`. This replaces the current bare `<h1>` — the title text is preserved, only its element/placement changes.
- `Button` (`~/shared/components/ui/button`): `variant="fab"` → pill-shaped, filled primary, elevated shadow (`rounded-full px-6 py-3 shadow-lg`). Spreads all native button attributes (`onClick`, `disabled`, `type` defaults to `button`). Inline-flex with `gap-2`, so an icon child + text child align horizontally — same composition resellers uses (`<Button variant="fab"><PlusIcon />{label}</Button>`).
- Icons (`~/shared/components/ui/icons`): all render `aria-hidden="true"`, so an icon child never pollutes the button's accessible name. The visible text label remains the accessible name.

## Component Structure

```tsx
<Card title={formatMessage({ id: 'FEATURES.TITLE' })}>
  <div className="space-y-4">
    <div className="flex justify-end">
      <Button variant="fab" onClick={handleActivate} disabled={isLoading}>
        <SettingsIcon />
        {formatMessage({ id: 'FEATURES.ACTIVATE_FEATURES' })}
      </Button>
    </div>
    {successMessage && <p className="text-sm text-success">{successMessage}</p>}
    {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
  </div>
</Card>
```

- Title: `FEATURES.TITLE` via `Card title` prop (was a raw `<h1>`).
- Action: `Button variant="fab"` mirroring the resellers FAB pattern (icon child + visible text label). Keep `onClick={handleActivate}` and `disabled={isLoading}` — the double-submit guard is unchanged.
- Feedback: keep both inline `<p>` nodes exactly as today; only add tone classes (`text-success` / `text-danger`) to match the surrounding card-list `<p>` conventions. No toast.
- The label stays a **visible text child** (not icon-only + `aria-label`). This is the resellers precedent and keeps the button's accessible name equal to `FEATURES.ACTIVATE_FEATURES`, so existing `getByRole('button', { name })` queries stay green.

## Icon Choice

**Recommended: `SettingsIcon` (Material `settings` gear).**

Angular renders a `mat-fab` with an **edit** icon for "activate features" — semantically odd (activation is not editing). The React icon set has no power / toggle / check / bolt icon, so an exact "activate" glyph does not exist without adding new SVG infra (out of scope). Among the existing icons, the gear best conveys "system functionality / features" and reads sensibly as an admin action on platform capabilities.

Rejected alternatives:
- `EditIcon` — matches Angular literally but carries the same odd semantics; we correct the intent (like we correct the copy typo), we do not replicate the defect.
- `PlusIcon` — implies "create / add a new entity" (its meaning in resellers/stores). Activating features adds nothing to a list, so it would mislead.

If reviewers prefer strict Angular-glyph parity over semantics, `EditIcon` is the fallback — the decision is isolated to one import + one JSX element and trivially swappable.

## ADRs

### ADR-1: Card shell + FAB for L5, keep inline `<p>` feedback (no toast infra)
- **Decision**: Wrap the page in the shared `Card` shell and switch the activate action to `Button variant="fab"` with an icon. KEEP the existing inline `<p>` success/error rendering and the `isLoading` double-submit guard.
- **Rationale**: The React app has NO toast/notification infrastructure (only a stale comment in `cart-shell` references Angular's toastr). Building toast would be new shared infra and scope creep (>100 lines, touches beyond this page). Precedent: admin/dashboard already accepted React infra differences from Angular. Card + FAB deliver the visible L5 parity (Metronic card + prominent action) without importing infra.
- **Rejected**: Replicating Angular's toastr notifications — new shared system, out of scope, no consumer beyond this page.

### ADR-2: L6 copy aligns to Angular literals, but the `unb` typo is corrected
- **Decision**: In-place value changes at `es.ts:607-608`:
  - `FEATURES.FEATURES_ACTIVATED` → `"Las funcionalidades se activaron satisfactoriamente"`
  - `FEATURES.UNEXPECTED_ERROR` → `"Ocurrió un error inesperado activando las funcionalidades"` (Angular literal is `"Ocurrió unb error..."`; we FIX `unb` → `un`).
- **Rationale**: Align copy to the Angular source of truth, but a typo is a **defect**, not a stylistic quirk. This intentionally differs from the owners/resellers strict-literal policy, which preserved quirks — a misspelling is not a quirk worth preserving.
- **Rejected**: Copying `unb` verbatim — propagating a known spelling defect for the sake of byte parity.

### ADR-3: Do NOT replicate Angular's `GENERAL.RESPONSE.ERROR` missing-key bug
- **Decision**: React must not reproduce Angular's defect (`features.component.ts:25,36`) where a non-existent i18n key is rendered as a raw key string in the toast title.
- **Rationale**: It is a runtime bug that shows an untranslated key to the user. Parity replicates intended behavior and quirks, never defects. React's `FEATURES.UNEXPECTED_ERROR` path already handles the error case correctly.
- **Rejected**: Bug-for-bug fidelity.

## Files To Touch

| File | Change |
|------|--------|
| `frontend-react/apps/web-store-pos/app/admin/features/routes/features.tsx` | Replace flat `<div>`/`<h1>`/plain `<button>` with `Card` + `Button variant="fab"` + `SettingsIcon`; import `Card`, `Button`, `SettingsIcon` from `~/shared/components/ui/*`. Keep handler, `isLoading` guard, inline `<p>` feedback (add tone classes). |
| `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` (607-608) | Two in-place value fixes per ADR-2. |
| `frontend-react/apps/web-store-pos/app/admin/features/routes/__tests__/features.test.tsx` | Add shell/FAB structural assertions (see Test Impact). Copy assertions need no literal edits — they read `esMessages[...]` dynamically. |

## Test Impact

`features.test.tsx` reads message values dynamically via `esMessages[key]`, so the ADR-2 copy fixes propagate automatically — the success/error/throw/double-submit assertions require **no literal edits**.

- **Title test** (`getByText(FEATURES.TITLE)`): still green. The text moves from `<h1>` to the `Card` header `<h3>` but `getByText` matches by text content, not element.
- **Activate-button tests** (`getByRole('button', { name: FEATURES.ACTIVATE_FEATURES })`): still green. The FAB keeps the visible text label; `SettingsIcon` is `aria-hidden`, so the accessible name is unchanged.
- **Success / error(succeeded=false) / error(throws) / double-submit guard**: unchanged logic + dynamic message lookup → all green after the copy change.
- **New assertions to add (low-brittleness, by role/structure not DOM internals)**:
  1. Card shell present — assert `container.querySelector('[data-slot="card"]')` is in the document.
  2. FAB carries an icon — assert the activate button contains an `svg` (e.g. `getByRole('button', { name }).querySelector('svg')` is truthy). Do NOT assert on specific SVG path data.

## Risks / Assumptions

- Icon semantics are a judgment call: `SettingsIcon` recommended; `EditIcon` is the strict-Angular fallback. One-line swap if reviewers disagree. (Low)
- Assumes no other runtime consumer of the two `FEATURES.*` keys beyond this page — confirmed the page is the sole consumer via the handler. (Low)
- Structural test assertions kept accessibility-based to avoid brittleness on FAB/icon markup. (Low)

## Success Criteria

- Page renders inside `Card` (`data-slot="card"`) with a `Button variant="fab"` + icon activate action.
- Inline `<p>` feedback + `isLoading` guard preserved.
- Both `FEATURES.*` values match the locked strings (typo corrected).
- No toast infra, no dead service methods, no replicated Angular bugs.
- `pnpm test` + `tsc --noEmit` pass; diff under 400 lines.

Based on proposal id 625 and locked decisions id 623.
