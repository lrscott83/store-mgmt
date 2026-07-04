# Design: Admin → Stores Parity Followup (Stage 5)

## Technical Approach

Close the 3 residual `admin/stores` L5/L6 gaps by mirroring the already-shipped
`owner-card-list.tsx` conventions — no new abstractions. Two component edits plus one
label repoint:

1. **`store-card-list.tsx`** — add a `getStoreCardClass(store)` helper (copy of owner
   `getCardClass`) and pass it to `Card className`; replace the two unconditional
   Approve/Disapprove Buttons with a single XOR conditional keyed on `store.approved`.
2. **`store-list.tsx`** — repoint the header FAB label from `STORES.CREATE` to `GENERAL.ADD`.

No route, service, HTTP, or domain-model changes. Store model already exposes
`approved: boolean` and `isActive: boolean` (verified in fixtures and proposal).

## Architecture Decisions

### ADR-1: STORES.CREATE mechanism → repoint consumer to GENERAL.ADD

| Option | Tradeoff | Decision |
|--------|----------|----------|
| In-place change `STORES.CREATE` value → 'Adicionar' | Keeps namespace hygiene but duplicates the literal already at `GENERAL.ADD` | Rejected |
| Repoint FAB consumer → `GENERAL.ADD` ('Adicionar') | Matches Angular's actual key usage; cross-namespace but consistent with just-archived owners/resellers parity | **Chosen** |

**Choice**: In `store-list.tsx:78`, change `{ id: 'STORES.CREATE' }` → `{ id: 'GENERAL.ADD' }`.
Do NOT alter `STORES.CREATE`'s value in `es.ts` (still 'Crear tienda').
**Rationale**: Angular's store-list FAB literally renders `GENERAL.ADD`, exactly the precedent
set by `RESELLERS.ADD` reconciliation in `admin-owners-resellers-parity` (es.ts:591-595, the
list FAB uses generic `GENERAL.ADD`, not a namespaced create string). Standardizing shared
generic labels on `GENERAL.*` is the established Stage-5 convention.
**Orphan note (for tasks/sweep)**: After repoint, `STORES.CREATE` ('Crear tienda') may become
orphaned. Match the `RESELLERS.ADD` reconciliation precedent — either remove the dead key OR
leave it with a documenting comment. Defer to tasks phase; do NOT delete blindly here.

### ADR-2: state-class precedence → inactive first, then unapproved

| Condition | Class |
|-----------|-------|
| `!isActive` (inactive) — checked FIRST | `bg-danger/10 border border-danger` |
| `!approved` (unapproved but active) — checked SECOND | `bg-success/10 border border-success` |
| normal (active + approved) | `''` |

**Choice**: `getStoreCardClass` returns the inactive class first, exactly as
`owner-card-list.tsx:21-25` orders its checks.
**Rationale**: Bit-for-bit precedence parity with the owners precedent avoids a divergent
priority when a store is simultaneously inactive AND unapproved. Uses Tailwind
`bg-danger`/`bg-success` tokens (not ported Angular raw CSS class names), consistent with
the existing owner card.

### ADR-3: Approve XOR Disapprove conditional render

**Choice**: Replace the two always-on Buttons with:
`store.approved ? <Disapprove/> : <Approve/>`. Edit button stays unconditional.
**Rationale**: Matches Angular `store-list.component.html:27-39` (toggle by `store.approved`).
`approved` is confirmed present on the Store domain model. Handler props
(`onApprove`/`onDisapprove`) are unchanged — only render logic branches.

## Data Flow

    store-list.tsx (loadStores → stores[])
        │  passes stores + handlers
        ▼
    store-card-list.tsx
        ├─ getStoreCardClass(store) ──→ Card className (visual lifecycle state)
        └─ store.approved ? Disapprove Button : Approve Button ──→ onDisapprove/onApprove(id)

The header FAB (`GENERAL.ADD`) → `navigate('/management/stores/create')` (unchanged wiring).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/admin/stores/components/store-card-list.tsx` | Modify | Add `getStoreCardClass`; pass to `Card className`; XOR Approve/Disapprove by `store.approved` |
| `app/admin/stores/routes/store-list.tsx` | Modify | FAB label `STORES.CREATE` → `GENERAL.ADD` (line 78) |
| `app/admin/stores/components/__tests__/store-card-list.test.tsx` | Modify | Update button-render assertions to XOR; add state-class tests |
| `app/admin/stores/routes/__tests__/store-list.test.tsx` | Modify | Fix approve-flow fixtures to `approved: false`; assert new create label |
| `app/shared/lib/i18n/es.ts` | Possibly Modify | Only if tasks/sweep opts to remove/annotate orphaned `STORES.CREATE` |

## Interfaces / Contracts

No prop or type changes. `StoreCardListProps` (stores, onEdit, onApprove, onDisapprove) is
unchanged — the XOR is internal render logic.

## Testing Strategy (Strict TDD)

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — store-card-list | Approved store renders ONLY Disapprove; unapproved renders ONLY Approve | Fixtures with `approved:true`/`false`; `queryByRole` negative + positive |
| Unit — store-card-list | State class: inactive→`bg-danger`, unapproved-active→`bg-success`, normal→none; inactive wins when both | Assert `[data-slot="card"]` className |
| Unit — store-list | Create FAB reads 'Adicionar' (`GENERAL.ADD`) | `getByRole('button', { name: 'Adicionar' })` |

**Existing tests that MUST change**:
- `store-card-list.test.tsx` — the "renders/uses buttons" suites currently assume BOTH
  Approve AND Disapprove always render (default fixture `approved:true`). The onApprove test
  (lines 91-106) will FAIL because an approved store no longer shows Approve → override
  fixture to `approved:false`. Add explicit XOR + state-class cases.
- `store-list.test.tsx` — approve-flow tests (lines 145+) use default `approved:true` and click
  `STORES.APPROVE`; the listStores fixture must return `approved:false` so Approve renders.
  Disapprove-flow tests keep the `approved:true` default. Add create-label assertion.

## Migration / Rollout

No migration. Conventional commits on `feat/frontend-parity-audit`, no PR/push. ~40-80 lines
incl. tests — well under the 400-line budget; no chained PRs, no `size:exception`.

## Open Questions

- [ ] Orphaned `STORES.CREATE` disposition (remove vs annotate) — deferred to tasks/sweep per ADR-1.
