# Verify Report: warehouses-ui-redesign

## Verdict

**PASS** — all requirements implemented, all suites green.

## Envelope

- Change: `warehouses-ui-redesign`
- Date: 2026-09-06
- Mode: inline orchestrator (delegation unavailable — user directive), openspec store, no-PRs strategy, 800-line budget
- Scope: frontend-only (page redesign, menu icon removal, agent-doc rule)

## Requirements → Evidence

| Req | Requirement | Evidence |
|-----|-------------|----------|
| WUI-1 | Header counters (product count + total cost + keeps units) | `warehouses.tsx` header renders `Productos: {levels.length} · Costo total: {formatCurrency(totalCost)} · Cantidad: {totalOnHand}`; unit test WUI-1-a/b assert `Productos: 2`, `$16 840`, `Cantidad: 34` / zeroed variant — 10/10 vitest green |
| WUI-2 | Gear menu (Editar + Desactivar, no flat buttons) | `ActionMenu testId="warehouse-actions-toggle-{id}"` with `intent="edit"` + `intent="deactivate" separatorBefore`; unit test WUI-2-a asserts menuitems and `getAllByText('Editar')` length 1; E2E test 5 (deactivation) green through the gear path |
| WUI-3 | Popup create/edit (replaces inline rows) | NEW `warehouse-form-modal.tsx` (`role="dialog"`, `aria-modal`, backdrop/Escape close, `warehouse-name-input` testid preserved, Save disabled on empty/whitespace); modal suite 5/5; page tests: create-via-modal + WUI-3-c edit-prefilled green |
| WUI-4 | Menu icon removal + structural enforcement | `menu-config.ts`: `icon: '🏬'` dropped, `icon?: string` removed from `MenuItem`, convention comment updated; `sidebar.tsx` icon branch removed; `pnpm typecheck` green proves no other consumer; sidebar suite 39/39 green (badge intact) |
| WUI-5 | AGENTS.md no-icon rule | `frontend-react/AGENTS.md` Styling section: "Sidebar/menu items are plain text labels only. NEVER add icons…" |

## Test Evidence

| Suite | Command | Result |
|-------|---------|--------|
| Typecheck (5 workspaces) | `pnpm typecheck` (frontend-react root) | 5/5 green |
| Lint | `pnpm lint` (`--max-warnings=0`) | 4/4 green |
| App vitest (full) | `pnpm vitest run` (web-store-pos) | **3133 passed / 230 files** (includes 5 NEW modal tests + 4 NEW page tests; 2 adapted) |
| E2E warehouses | `pnpm exec playwright test e2e/warehouses.spec.ts` | **10/10 passed** (55.1s, serial, real backend :5019 + PostgreSQL smca_test) |
| E2E smoke (env sanity) | `pnpm exec playwright test e2e/expense-crud.spec.ts --grep "S4-A1"` | 3/3 passed (isolated env failure from stale Vite cache, not the change) |

## Authorized E2E Touches (user-approved, this session)

1. **Test "desactivar almacén con stock…" (~L399/407)**: `getByText('Desactivar').click()` → open gear (`getByRole('button', { name: 'Acciones de …' })`) then `menuitem` "Desactivar". Original assertions (Swal text, card stays, `(Inactivo)` tag) unchanged and green.
2. **Test 9 "el ítem de menú…"**: premise inverted (user-approved after diagnosis). Old premise ("persona restaurada NO tiene el feature 36") became structurally false with the module-13 backend change merged to dev the same day — every new store now gets features 36/37 for OwnerAdmin at registration. New premise: the menu item appears for every new OwnerAdmin store and navigates. Role gating remains covered by test 10/11 (StoreUser cannot see the item, route logs them out) — green. Verified pre-existing by stash-isolation: the old test failed identically on clean code.

## Deviations / Notes

- **Vite stale-deps incident (environment, not the change)**: first E2E run failed with `No result returned from dataStrategy` + console `SyntaxError: '@store-mgmt/domain' does not provide an export named 'WarehouseErrors'` — a stale `node_modules/.vite` prebundle masked the domain package's current exports. Reproduced identically on stashed (clean) code → pre-existing environment issue. Fixed by deleting `apps/web-store-pos/node_modules/.vite`; after re-prebundle the suite runs green. Worth knowing: any dev server running before that cache was rebuilt served the broken module.
- One flaky first-run (`Execution context was destroyed` during `mintOwnerAdmin`) on the cold dev server — passed on retry; consistent with the documented cold-start contention (playwright.config.ts:93-99).
- `enableWarehouseFeatures` seam retained: 7 other tests still use it defensively; its docs updated to reflect module 13.

## Final State

- Changed lines: ~330 (within 300-420 forecast, under 800 budget) — 8 files modified, 3 created (modal + modal test + openspec artifacts folder).
- All work delivered as work-unit commits on `dev` (no PRs, per session strategy).
- No backend production code touched. No E2E test touched beyond the two authorized adaptations above.
