# Proposal: route-guard-parity

## Intent

React's route-access layer diverges from Angular's LIVE guards in two confirmed
ways (see `sdd/route-guard-parity/explore`). Migration policy is parity, and the
user has locked both fixes as literal 1:1 replications of Angular:

1. **Owner-admin route bypass** — Angular's plain `AuthGuard`
   (`_shared/guards/auth-guard.ts:44`) grants `isSuperAdmin || isOwnerAdmin`
   UNCONDITIONAL access (no featureId check) on ~20 routes. React's `featureLoader`
   requires owner-admins to hold the featureId, locking out accounts Angular admits.
2. **`help/tutorial` must be public** — Angular's route has no `canActivate`. React
   nests it inside the `authLoader`-gated `app-layout` (`routes.ts:105`), so it
   requires login. The React route/page DOES exist (`help/routes/tutorial.tsx`), so
   this is a real relocation, not a future placeholder.

## Scope

### In Scope
- Add Angular's `isSuperAdmin || isOwnerAdmin` bypass to the plain `featureLoader`
  path ONLY (`loaders.ts`), before the `isUserAuthorized` membership check.
- Make `help/tutorial` publicly reachable (no auth), by moving it out of the
  `authLoader`-gated layout.

### Out of Scope (non-goals)
- storeId-param sourcing (ADR-2) — ratified deferred, untouched.
- offline/no-cache `authLoader` asymmetry — ratified deferred, untouched.
- Stale-closure `selectedStoreId` bug in profile loaders — real React bug, not
  parity; handled separately.
- Dead Angular `_services/auth/auth.guard.ts` — never imported; ignored.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `route-guard-authorization`: the plain route guard (`featureLoader`) gains an
  owner-admin/super-admin bypass; `help/tutorial` becomes a public route.

## Approach

**CENTRAL DESIGN RISK — the bypass must live ONLY in `featureLoader`, NOT in
`isUserAuthorized`.** The shared `isUserAuthorized`
(`shared/lib/auth/authorization-service.ts`) is ALSO called by `sidebar.tsx:21`.
Angular deliberately uses TWO algorithms: `AuthGuard` bypasses owner-admin for
routes; the sidebar's `AuthorizationService.isUserAuthorize` does NOT. Adding the
bypass to the shared function would break the just-closed `sidebar-menu-parity`
(owner-admins would see every menu item). The bypass belongs in `featureLoader`
(or a small route-guard helper it calls). `adminFeatureLoader`,
`resellerFeatureLoader`, and `superAdminLoader` mirror Angular's other guards and
MUST stay unchanged.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend-react/apps/web-store-pos/app/auth/routes/loaders.ts` | Modified | Add owner/super-admin bypass to plain `featureLoader` only |
| `frontend-react/apps/web-store-pos/app/routes.ts` | Modified | Move `help/tutorial` out of `authLoader` layout to a public branch |
| `.../shared/lib/auth/authorization-service.ts` | Unchanged (guard) | MUST NOT change — shared with sidebar |
| `.../shared/components/sidebar.tsx` | Unchanged (regression target) | Behavior must be identical after change |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Bypass leaks into `isUserAuthorized`, breaking sidebar parity | Med | Keep fix in `featureLoader`; regression test asserting sidebar unchanged |
| Owner-admin now reaches all ~20 feature routes (security-adjacent loosening) | High (intended) | User-locked; document; super/reseller/store-user paths unchanged |
| `adminFeatureLoader`/etc. accidentally altered | Low | Explicit "untouched" assertion + tests |
| `help/tutorial` relocation breaks nested-layout expectations | Low | Verify page renders standalone; route test for public access |

## Rollback Plan

Both edits are isolated and small. Revert the `loaders.ts` bypass conditional and
restore `help/tutorial` under the `app-layout` layout in `routes.ts`. No data or
schema changes; pure client routing logic.

## Dependencies

- None. Builds on closed `sidebar-menu-parity` (must remain green).

## Success Criteria

- [ ] Owner-admin AND super-admin reach all plain-`featureLoader` routes without a
      featureId match, matching Angular `AuthGuard`.
- [ ] Reseller and store-user behavior on plain routes UNCHANGED (still require
      featureId/role membership).
- [ ] `help/tutorial` reachable without authentication.
- [ ] REGRESSION: `isUserAuthorized` unchanged; sidebar visibility for owner-admin
      identical to pre-change (no new menu items).
- [ ] REGRESSION: `adminFeatureLoader`, `resellerFeatureLoader`,
      `superAdminLoader` untouched and still deny owner-admin without featureId.
- [ ] `pnpm test`, `tsc --noEmit`, and build all pass.
