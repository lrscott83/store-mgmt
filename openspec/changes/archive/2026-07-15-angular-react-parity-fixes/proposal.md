# Proposal — angular-react-parity-fixes

> Source of truth: Angular `frontend/src` + React `frontend-react` + the two migration docs (report = work list, playbook = 12-rule verdict). NOT openspec/, NOT memory.

## Intent

Close the 5 confirmed Angular→React parity gaps against **live** call-sites, WITHOUT rebuilding Angular dead-code (rule 12) and WITHOUT reopening already-approved fixes (rule 8). Success = the 5 work units pass playbook rules 3/4/9/10/12; the 8 dead-code items stay unported (documented); invented rule-12 surface removed; 🟡 fixes preserved.

## Scope — IN (3 code work units + 1 no-op)

> WU1 and WU2 were REMOVED after code-only re-verification (see Scope — OUT). Only source code was used.

- **WU3 api-client interceptor** — in `shared/lib/http/api-client.ts`: (a) 401 → `useAuthStore.getState().logout()` (stop contradicting Decision 1 in `auth-store.ts:184-195`: stale token/currentUser + skip redirect if already on `/login`); (b) 500 → error-dialog via existing React idiom (`blocking-alert.ts`), no new lib; (c) network-error tagging matching Angular `error-interceptor.service.ts`. Acceptance: rules 9, 10, 12. Highest-value (internal contract fix).
- **WU4 CSV parsing** — in `sales/lib/csv-product-parser.ts`: robust quoted-comma parsing + `category` required + numeric coercion, mirroring Angular `csv-product.service.ts` (`Papa.parse` config). Mirror behavior, not the service layer. Acceptance: rules 3, 9, 10, 12.
- **WU5 BaseService reactive-list-state** — **RESOLVED: NO CODE CHANGE.** Grepped all live consumers of `.items$`/`.fetch(`/`.isLoading$`/`.patchState(`: 5 form components using `fetch()`+`items$` only to populate a dropdown. React already satisfies this via the established idiom (rule 5): `useEffect`→`listX()`+`useState` (`owner-create.tsx:49`, `edit-store.tsx:51`). A Zustand/base-class port would be a rule-12 invention + rule-2 improvement. Verification item only.

## Scope — OUT (Angular dead-code — no live call-site → rules 10/12)

**Code-verified dead (originally proposed as WU1/WU2):**
- **owner-details / `getOwnerDetailsById`** — `owner-details.component.ts:29` calls it, but `OwnerDetailsComponent` is imported (`owners.component.ts:32`) and NEVER rendered: `grep app-owner-details` across all `.html` = 0 hits, no route loads it. Component never instantiated → `ngOnInit`/`getOwnerDetailsById` never execute. Dead.
- **reseller `deleteReSeller`** — `resellers.component.ts:47` `deleteReSeller(reSeller: ReSeller) { }` is an EMPTY body; never calls `ReSellerService.deleteReSeller`. The HTML button binds to a no-op. Dead.

**Other dead-code items (report-derived, call-site verified):**
MessageService/Message · AddressModel · SocialNetworksModel · DataService.loadProducts/loadCategories · ConnectionService.wasOffline/statusChange$ + ConnectionInterceptor · auth registration/forgotPassword/signInGoogle/getSocialToken + createUser/server-logout · i18n setLanguage · StoreModuleStateService. Recreating any = rule-12 invention.

## Carry-forward (rule 8, KEEP, no change)

FIFO decrement fix · cross-product copy-paste fix · `getTopProducts` `top` param · `getOrdersInDay`/`getExpensesInDay` honoring `date` · category-repo `isActive` param removal · URL double-slash normalization · cart `addItem` inline-validation moved to call-sites.

## Rule-12 removal decisions (verified via React call-site grep)

| Candidate | Decision | Reason |
|---|---|---|
| `ProductRepository.getCategoryRepository()` | KEEP | live consumer `inventory-offline-service.ts:202`; mechanical DI bridge (rule 5) |
| `InventoryOfflineService.getAvailableQuantity` | KEEP | live consumer (line 408) + `product-availability.ts` |
| `InventoryOfflineService.hasAvailableStock` | REMOVE (confirm) | test-only call-sites, no Angular origin (rule 12) — spec confirms no cart-submission consumer |
| `InventoryOfflineService.update` | KEEP + audit rename | live `today-entries.tsx:109`; verify vs Angular `updateInventoryEntry` (rule 3) |
| `OrderOfflineService.getByDateRange` | REMOVE (confirm) | test-only; comment admits no Angular correlate (rule 12) |
| `store-http-service.deactivateStore` | REMOVE (confirm) | test-only; no Angular method, no UI consumer |
| `ReSeller.login?` field | REMOVE | absent from Angular model; no consumer (rule 12) |

## Risks

- WU3 401 fix touches auth logout contract → regression test on the redirect-loop guard is mandatory.
- 3 REMOVE-candidates rest on test-only call-sites → spec must confirm no live consumer before deletion.
- WU5 no-op reopens only if a live cross-component consumer beyond the 5 dropdown forms appears.
