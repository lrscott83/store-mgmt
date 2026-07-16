# Delta for Inventory Service

## Out of Scope (descoped — genuine fork, not mechanical)

### getActiveInventoryEntriesStorage Visibility Restoration Is BLOCKED By A Live Conflict
Angular's `getActiveInventoryEntriesStorage` (`inventory-offline.service.ts:226`) is `private`.
`parity-audit-remediation`'s Slice 4 proposed restoring `private` on React's
`InventoryOfflineService.getActiveInventoryEntriesStorage`. A fresh grep (required by the proposal
before applying this item) finds THREE live production callers OUTSIDE the class:
`inventory/routes/today-entries.tsx`, `inventory/routes/entries.tsx`, and (per the existing
`service-base` spec's "Non-Sync Call-Sites Re-Point To The Faithful Method" requirement)
`report-aggregation-service.ts`. That SAME already-ratified `service-base` requirement MANDATES
these exact call-sites call this exact method PUBLICLY (it is documented there as "the
Angular-faithful view-producing method"), because Angular's own `hasAvailableProductToSale`/
`updateInventoryEntry` decomposition (Fase 4, closed) already made this the public read surface
React exposes in place of a generic `getAll()`.

Restoring `private` here would (a) break 3 live call-sites and fail `tsc`, and (b) directly
contradict the ratified `service-base` requirement naming this exact method as the intended public
call target. This is NOT a mechanical fix — it is a genuine fork between two ratified decisions.
**This item is DESCOPED from `parity-audit-remediation`** pending an explicit reconciliation
decision (keep public per `service-base`, OR introduce a new public wrapper and make the raw method
private — a real design choice, not an apply-time judgment call). No requirement in this delta
changes `getActiveInventoryEntriesStorage`'s current `public` visibility.

#### Scenario: Visibility is unchanged by this change
- GIVEN `InventoryOfflineService.getActiveInventoryEntriesStorage`
- WHEN this change (`parity-audit-remediation`) ships
- THEN its visibility remains `public`, and `today-entries.tsx`/`entries.tsx`/
  `report-aggregation-service.ts` continue calling it directly, unmodified

#### Scenario: Reconciliation is a follow-up decision, not silently applied
- GIVEN this conflict is identified during `sdd-spec`
- WHEN `sdd-tasks`/`sdd-apply` run for this change
- THEN no task attempts to make `getActiveInventoryEntriesStorage` private — that requires a
  separate, explicit user decision reconciling it against `service-base`'s existing requirement
