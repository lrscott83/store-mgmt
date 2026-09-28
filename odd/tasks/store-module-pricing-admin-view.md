# SuperAdmin store-module pricing view

## Objective

Add ONE additive capability: from the SuperAdmin store card's gear menu, open a
modal for a single store where SuperAdmin can, for every module that is active
and available to stores, tick/untick it and edit its **price**, **discount** and
**percent discount**. The total recomputes live in the browser as values change.
On save: unticked modules are deactivated, ticked modules are activated or
inserted, and all three price fields are written for that store.

## Problem

Two separate gaps, and they are not the same gap:

1. **There is no write path for per-store module pricing.** The only existing
   write is `PUT /v1/stores/{id}` (`UpdateStoreCommand.UpdateStoreModules`),
   which replaces the whole module set at once AND — on reactivate — overwrites
   prices from the `Module` catalog (`UpdateStoreCommand.cs:200-205`). So a
   store's own prices cannot be authored, and any custom price would be clobbered
   the next time the set is rewritten. No DTO anywhere carries discount or
   percent-discount for a store module.
2. **There is no live recompute.** Every total in the system is computed
   server-side once (`CurrentPriceServiceUtils`, `PlanPricingUtils`,
   `StoreProfile`, `BillingService`). Nothing recomputes while the user types.

The read side needs nothing new: `ModuleDto` already serializes `Price`,
`DiscountPrice`, `PercentDiscountPrice`, `CurrentPrice`, `PriceIncluded` and
`AvailableToStore`; the TypeScript type `packages/domain/src/models/store.ts:3-11`
simply drops two of them. The catalog list is `GET /v1/modules/ToStore`, already
wired at `admin/stores/routes/store-list.tsx:50`, and already filtered to
`IsActive && AvailableToStore`.

## Why

A store's module cost is a per-store commercial fact, but today the only place
that fact can be expressed is the global `Module` catalog, shared by every store.
The maintainer wants SuperAdmin to price a specific store's modules from the
store card.

## Scope

In scope:

- A new SuperAdmin-only write endpoint for a store's module set: tick/untick plus
  the three price fields, in one save.
- The modal, opened from the store card's gear menu, rendered as a table.
- Live total in the browser, using the same algorithm the backend uses.
- New backend E2E file and new frontend E2E file covering the behavior.

Explicitly NOT in scope, and not to be touched:

- Any change to `UpdateStoreCommand`, `ChangeStorePlanCommand` or
  `ToggleStorePlanCommand`. Their guards stay exactly as they are.
- The plan→module matrix, `StorePlanModule`, or any plan logic.
- The global `Module` catalog pricing.
- Deleting rows. Deactivation only; a `StoreModule` row is never removed.
- Any existing E2E test, in either suite. New files only.

## Decisions already made by the maintainer

- Editable fields are exactly three: price, discount, percent discount.
- The module list is every module that is active AND available to stores — not
  just the modules the store already has.
- On save: unticked → deactivated; ticked → activated or inserted; all prices
  written for that store.
- The view lives inside the existing store card, next to the plan-change action.
- Rendered as a **table**.
- Grouped by the plans the module belongs to. **Visual grouping only** — it
  carries no behavior and must not gate, filter or reorder the save payload.
- The total is computed in the **frontend**, using the same algorithm the
  backend uses, so it can update while the user types.

## The formula — single source of truth on each side

`backend/src/Domain/Common/Utils/CurrentPriceServiceUtils.cs:11-17`, verbatim:

```csharp
public static float GetCurrentPrice(float price, float percentDiscountPrice, float discountPrice)
{
    float currentPrice = price - price * percentDiscountPrice / 100 - discountPrice;
    if (currentPrice < 0)
        currentPrice = 0;
    return currentPrice;
}
```

Percent first, then the flat discount, no rounding anywhere, clamped at zero.
The total is the sum of `currentPrice` over the **ticked** modules only.

The React side must implement this same arithmetic, in
`packages/domain` (shared business logic, not app code, per the monorepo's
package-dependency rule). The risk of a second implementation is drift, so a
frontend E2E test must pin the browser-computed total to the server-reported
total for the same saved values.

## Grouping — copy the existing partition, do not invent one

`management/stores/components/plan-panels.tsx:72-79` `deltaModules()` already
partitions modules across plans so **each module renders exactly once**: Gratis
keeps its full list, and every higher plan renders only the modules its
`Order`-chain predecessor does not already carry. A module belonging to all
loaded plans therefore appears under Gratis; a plan-exclusive module appears
under that plan.

The new modal must use that same partition over the full available-module
catalog, so a module appears once, under the lowest plan that includes it.

**Correction (2026-09-28, T3).** `GET /v1/plans` returns only Gratis, Pago and
Superior — VIP is excluded server-side — so a VIP-only module belongs to no plan
in the catalog and the delta rule alone would drop it. The groups must therefore
be **total** over the universe: a trailing "other plans" bucket catches whatever
no plan claims. Without it the union is a strict subset of the catalog, and since
the save payload is the flat list of visible modules, an omitted row would be
read by the backend as "leave this module untouched" — a silent skip the operator
cannot see. Implemented in `packages/domain/src/commons/plan-module-groups.ts`
(`groupModulesByPlanDelta`), which guarantees union == input, once each.

## Constraints

- **Never read or touch `frontend/` (Angular).** It is legacy and frozen.
- **Never modify, delete, rename, skip or weaken an existing E2E test** in
  `backend/src/SMCA.WebApi.E2ETests/` or `frontend-react/e2e/`, nor any existing
  `frontend-react/e2e/support/*` helper. New files and new helpers only. The
  maintainer's permission is required per item and none has been given.
- Backend production changes: permitted for the new endpoint only, as scoped above.
- Artifact language: English for code, comments, identifiers and i18n keys.
  User-facing copy follows the existing i18n locale files.
- No AI attribution in commits. On PowerShell use `git commit -F <tempfile>`.

## Tasks

- [x] T1 — Backend: request/response DTO, validator, handler and the
      SuperAdmin-only endpoint for a store's module set. Deactivate unticked,
      activate-or-insert ticked, write the three price fields. One transaction.
- [x] T2 — Frontend: the shared formula in `packages/domain`, the two missing
      fields on the `Module` type, and the http-service call.
- [x] T3 — Frontend: the modal component — a table, grouped by plan using the
      `deltaModules` partition, tick/untick per row, the three inputs disabled
      while unticked, and a live total.
- [x] T4 — Frontend: the gear-menu entry on the store card that opens it, plus
      the i18n keys in every locale file.
- [x] T4b — Backend read: `GET /v1/stores/{storeId}/module-pricing`. Forced by the
      `ModuleProfile.cs:20-31` gap — a store's nested `modules[]` serializes
      DiscountPrice/PercentDiscountPrice as 0, so the editor had no trustworthy
      source for a store's own discounts and for a module the store does not yet
      hold. Same route, same SuperAdmin guard, additive only.
- [ ] T5 — Backend E2E: new file covering activate, deactivate, insert, exact
      price persistence, the formula including the clamp at zero, the total over
      ticked modules only, 403 for a non-SuperAdmin, soft-deactivation not
      deletion, and the pre-existing guards still firing unchanged.
- [ ] T6 — Frontend E2E: new file covering opening from the gear, the grouped
      table, inputs disabled while unticked, the live total, the browser total
      matching the server total, values surviving a reload, and the control being
      SuperAdmin-only.

## Acceptance criteria

- A SuperAdmin can open any store, change any available module's three price
  fields, tick and untick modules, and save; a reload shows the saved state.
- Untick deactivates; it never deletes. Ticking a module the store never had
  creates it.
- The total shown while editing equals the server's total for the saved values,
  including the clamp at zero.
- `PUT /v1/stores/{id}`, `ChangeStorePlan` and `ToggleStorePlan` behave exactly
  as before, and no pre-existing test changes.
- `dotnet test backend/src/SMCA.sln` and the frontend `turbo run typecheck lint test`
  pass with no new failure.
- The frontend E2E suite passes at 4 workers, per the root README.

## Checks

Backend build and all three test projects, then frontend typecheck, lint, unit
tests, then both E2E suites in the order the root README specifies. Backend E2E
and the Playwright suite must never run in parallel — `WebAppFixture.ResetDataAsync`
would delete the live rows Playwright is using.

## Route declaration

T1–T6 all touch more than one non-trivial file and need reading that precedes
the write, so each is delegated to a bounded writer rather than done inline.
T5 and T6 depend on T1–T4 and run as their own workers with the suites.
