# Proposal: Parity Audit Remediation (Maximal Parity)

## Intent

The 2026-07-15 Angular→React parity audit (`docs/migration/reporte-paridad-angular-react.md`) found ~30 divergences between `frontend/` (Angular source of truth) and `frontend-react/`. The user chose **maximal parity**: mirror Angular everywhere, keeping only React's ratified bug-fixes as documented divergences. This change remediates every real gap in dependency order — mechanical fixes first, high-blast-radius reverts and the architectural `BaseService<T>` reproduction last.

## Scope

### In Scope
- Normalize `productos-online` double-slash (consistency with `categorías`).
- Model field parity: `InventoryEntryCost.inventoryId→id` (order.ts), `EDataFileName` naming, `activate/deactivate` param restore.
- Offline JSON-export gaps: `getSaleCreditsJson`, `getExpensesJson`, `updateOrders`.
- Restore `private` on `getActiveSaleCreditsPriceBetweenDates`, `getActiveOrdersPriceBetweenDates`, `getActiveInventoryEntriesStorage`, `registerActivity` (fresh call-site grep at apply).
- Revert `createExpense(5)`/`updateExpense(6)` to positional args; adapt `today-expenses.tsx` + call-sites.
- Revert `CartItem` to flat `{productId,name,quantity,price}`; adapt 19 consuming files.
- Reproduce Angular `BaseService<T>` (base.service.ts); `ProductService`/`UsageService` extend it; align `BaseModel`/`AuditableBaseModel` (base.ts). **Reverses prior ratified `product-service-parity` decision** (product-service.ts:20-24) — user-confirmed.
- Feature-adds: `splash-screen.service` (boot fade-out), `download-manager` progress UI, global `error-handler` (window.onerror/unhandledrejection).

### Out of Scope (explore-confirmed non-gaps)
- `getAvailableQuantity`/`update()`/`getCategoryRepository()` — ratified Fase-4 decompositions with live call-sites.
- `IModelState`/`IBaseState`/`ICreateAction`/etc. — Angular-lifecycle contracts; correct absence in React.
- Ratified bug-fixes (getOrdersInDay/getExpensesInDay date-honoring, startDate recalc, top param, categorías normalization) — **documented as accepted divergences, NOT reverted**.
- `ReSeller.login?`, `AuthModel.expiresIn`, authorization `storeId` param — existing ADRs.
- `storage` `setCurrentUser` `password:''` cleanup — ratified as security improvement, **kept**.

## Slice Plan (dependency-ordered, each = one work-unit commit)

| # | Slice | Files (rough) | Risk | Delta specs | Gating / Design |
|---|-------|---------------|------|-------------|-----------------|
| 1 | Online double-slash normalize | `product-online-service.ts` | Low | `product-service` (minor) | none |
| 2 | Model field parity | `order.ts`, `data-serializer-service.ts`, repos (activate/deactivate) | Low | `order-service`, `csv-import` | none; ‖ Slice 1 |
| 3 | Offline JSON-export gaps | `sale-credit-offline-service.ts`, `expense-offline-service.ts`, `order-offline-service.ts` | Low-Med | `order-service` (+expense/salecredit) | none |
| 4 | Visibility restoration | sale-credit / order / inventory offline svcs, usage-tracker | Low-Med | none (impl-only) | **after Slice 3** (same files); needs fresh grep |
| 5 | Expense signature revert | `expense-offline-service.ts`, `today-expenses.tsx` | Med-High | expense capability | none |
| 6 | CartItem flat revert | `cart-store.ts` + 19 consumers, tests | High | new `cart-store` capability | none; schedule late |
| 7 | **BaseService\<T\> reproduction** | `base.service.ts` (new), `product-service.ts`, `usage-service.ts`, `base.ts` | High | `service-base`, `product-service`, `usage-tracker` | **REQUIRES sdd-design before tasks**; gates BaseModel/AuditableBaseModel shape |
| 8 | Feature-adds | `splash-screen.service`, `download-manager` + UI, `error-handler` | Low-Med | 3 new capabilities | independent; can slot anytime after mechanical |

**Ordering rationale**: 1-4 are low-risk mechanical parity (safe, fast, TDD). 5-6 are literal-shape reverts with call-site blast radius (5 medium, 6 high — scheduled last among reverts). 7 is architectural, reverses a prior ratified decision, and MUST pass `sdd-design` before `sdd-tasks`. 8 is additive feature work with no blast radius (independent).

## Capabilities

### New Capabilities
- `cart-store`: flat CartItem shape + CartState contract (Slice 6).
- `expense-service`: positional createExpense/updateExpense contract (Slice 5).
- `splash-screen`: boot splash fade-out (Slice 8).
- `download-manager`: install/download progress tracking + UI (Slice 8).
- `error-handler`: global window.onerror/unhandledrejection coverage (Slice 8).

### Modified Capabilities
- `product-service`: online URL normalization + `extends BaseService<Product>` restored.
- `usage-tracker`: `extends BaseService`; `registerActivity` visibility.
- `order-service`: model field parity + `updateOrders`/`getExpensesJson`-adjacent exports.
- `service-base`: introduce Angular `BaseService<T>` base (reverses prior drop).
- `csv-import`: `EDataFileName` naming alignment.

## Approach
Execute slices as independent work-unit commits on `feat/frontend-parity-audit` (commits-only — no PRs, no size:exception). Strict TDD (RED→GREEN→REFACTOR) on every slice. Slice 7 branches into a design cycle before its tasks; all others go straight to spec→tasks→apply. Slices 1-2 may run in parallel; 4 lands after 3.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| BaseService reversal re-breaks product-service-parity assumptions | Med | Dedicated design phase; TDD guards existing contracts |
| CartItem revert misses one of 19 consumers | Med | Type-driven refactor; compiler + full suite catch gaps |
| Visibility restore breaks a cross-module import | Low-Med | Fresh grep per method at apply; downgrade to fork if consumed |
| Expense positional args regress form call-sites | Med | TDD on today-expenses.tsx before signature change |

## Rollback Plan
Each slice is one commit — `git revert <sha>` rolls back a slice independently. No cross-slice coupling except Slice 4→3 (revert 4 before 3) and Slice 7's base.ts shape (revert 7 as a unit).

## Dependencies
- Slice 7 requires `sdd-design` completion before tasks.
- Slice 4 requires Slice 3 landed first.

## Success Criteria
- [ ] Every in-scope divergence mirrors Angular (or is documented as accepted).
- [ ] Full test suite green after each slice.
- [ ] Ratified bug-fixes preserved and documented, not reverted.
- [ ] `BaseService<T>` reproduced with `ProductService`/`UsageService` extending it.
- [ ] Three feature-adds functional (splash fade-out, download progress UI, global error capture).
