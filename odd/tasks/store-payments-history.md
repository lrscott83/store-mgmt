# store-payments-history

Branch `test`. Delivery: two work units (backend, frontend), disjoint edit surfaces, one commit each with its own RDD.
Runners: `dotnet test backend/src/SMCA.sln` (backend), `pnpm --filter @store-mgmt/web-store-pos test` (frontend).

Objective: expose the registered store payments ("cobros realizados") that exist in the database
today with no read path. SuperAdmin sees every store; ReSeller sees only its own.

## Domain facts (verified in code, not assumed)

- `StorePayment.Price` (float) — `backend/src/Domain/Entities/StorePayments/StorePayment.cs:18` —
  the **monto cobrado**, always USD, computed by `ModulePriceCalculator`. It never changes.
- `ExchangeRate` (decimal?) — same file, `:31` — CUP per 1 USD, captured in the register popup. Optional.
- `AmountPaid` (decimal?) — same file, `:33-38` — the **total pagado**, in CUP when the rate was used.
  Optional, not editable after registration.
- `ReSellerAmount` (float) — same file, `:24` — commission computed over `AmountPaid ?? Price`
  (`RegisterStorePaymentCommand.cs:94-100`), so its currency is **CUP when `AmountPaid` has a value,
  USD otherwise**.
- A payment is therefore ONE charge collected in ONE currency at a time. It is never two charges.
  The discriminator is exactly `AmountPaid is null` (USD) vs `not null` (CUP).

## Specs

### S1 — Route, menu and gate
New page at `/management/stores/payments`, registered in `frontend-react/apps/web-store-pos/app/routes.ts`,
gated by `clientLoader = resellerFeatureLoader([EFeatures.StorePayment])` inside the route module.
Menu entry under Administration in `app/shared/lib/config/menu-config.ts` with
`featureIds: [EFeatures.StorePayment]`, `moduleId: EModules.Administration`,
`rolesOnly: (user) => user.isSuperAdmin || user.isReSeller`, label key `MENU.BILLING_HISTORY`.

### S2 — Role scope
`SuperAdmin` sees every store's registered payments. `ReSeller` sees only the stores it owns, through
the same predicate the commissions query already uses:
`Store.Owner.ReSellerOwner.ReSeller.UserId == <caller external id>`.
Any other role throws `ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest)`.
The ReSeller scope is enforced IN THE QUERY, never left to the entity query filter.

### S3 — What counts as a "cobro realizado"
Only `StorePaymentStatusId == (int)StorePaymentStatusType.Paid`.

### S4 — Two tabs, one per currency
The screen has exactly two tabs: **USD** and **CUP**. A payment belongs to exactly one tab:
`USD` when `AmountPaid is null`, `CUP` when it has a value. The tab is the currency filter sent to
the server. There is no row that shows both currencies as money.

### S5 — Filters and pagination
- `currency`: `USD` | `CUP` (default `USD`).
- `from` / `to`: optional `DateOnly`, both inclusive, applied to `PaidDate`.
- `storeId`: optional `Guid`.
- `page` clamped to `>= 1`; page size fixed at 50 for v1.
Changing tab or any filter resets the page to 1.

### S6 — Tab labels carry the count
Each tab label renders the count of matching rows for that currency, under the current
from/to/storeId filters, independent of the selected page:
`USD (12)` / `CUP (88)`. This exists so a registered payment can never look "missing" just because
it lives in the other tab.

### S7 — Row content
Common: `Tienda`, `Propietario`, `Fecha del pago` (`PaidDate`), `Período que cubre` (`PaymentBeforeDate`),
`Monto`, `Comisión`.
- **USD tab**: `Monto` = `Price` (USD). `Comisión` = `ReSellerAmount` (USD).
- **CUP tab**: `Monto` = `AmountPaid` (CUP). `Comisión` = `ReSellerAmount` (CUP).
Only ONE money value per row, rendered with an explicit currency suffix (`12 500 CUP`, `25 USD`),
never the app-wide `$`. Grouping follows `formatCommission` (`reseller-commissions.tsx:24-30`):
non-breaking-space thousands, decimals only when non-zero.

### S8 — The `i` explains a CUP row
CUP rows carry an information control that reveals the rate and what was owed in USD:
`Tasa: 50 CUP/USD · Debía: 25 USD`. USD rows have no `i` (there is nothing to explain).
The control is a real `<button>` with `aria-label`, `aria-expanded` and a keyboard-reachable
focus state, that toggles an expanded detail line under the row. It is NOT hover-only: touch and
keyboard must both reach it. This satisfies S6 of `odd/tasks/store-payment-exchange-rate.md`.

### S9 — Totals are computed by the backend
Each tab shows a footer total for the amount and a footer total for the commission, computed by the
server over the WHOLE filter (all pages), never over the visible 50 rows. The client performs no
billing arithmetic.

### S10 — Money is never summed across currencies
No value in this feature ever adds a USD figure to a CUP figure. A tab is one currency; its
totals are one currency.

### S11 — Order
Newest first: `PaidDate DESC`, then `PaymentBeforeDate DESC`, then `Id` (stable tie-break).

### S12 - States
Empty state and error state use i18n keys under `BILLING.HISTORY.*`, never a hardcoded Spanish
string. No new spinner: the house pattern for these screens is state + empty state only.

Implementation note: the menu label is the single key `MENU.BILLING_HISTORY` (matching
`MENU.BILLING_COLLECTIONS` / `MENU.BILLING_COMMISSIONS` beside it); every screen string lives under
the `BILLING.HISTORY.*` root. Those are the only two roots this feature uses.

### S13 — Backend contract (fixed; both units implement against this)

`GET /v1/stores/payments?currency=USD|CUP&from=&to=&storeId=&page=&pageSize=`

`pageSize` is accepted in the query string for forward compatibility and **ignored**: the server
always pages by 50 (S5) and echoes the value it actually used. `total` is the ROW COUNT for the
selected currency, not a money aggregate; the money aggregates are `totalAmount` and
`totalCommission`. Unknown `currency` values are coerced to `USD`; the endpoint never answers 400
for a currency it does not recognise.

```jsonc
{
  "currency": "USD",
  "items": [
    {
      "storeId": "guid",
      "storeName": "string",
      "ownerName": "string",
      "paidDate": "2026-11-01T00:00:00Z|null",
      "paymentBeforeDate": "2026-12-01T00:00:00Z",
      "amount": 25.00,            // Price in USD tab, AmountPaid in CUP tab
      "commission": 3.00,         // ReSellerAmount, same currency as amount
      "currency": "USD",
      "exchangeRate": null,       // CUP rows only
      "amountOwedUsd": null       // CUP rows only: Price
    }
  ],
  "total": 12,                    // rows for the selected currency
  "page": 1,
  "pageSize": 50,
  "totalAmount": 300.00,          // whole filter, selected currency
  "totalCommission": 36.00,       // whole filter, selected currency
  "usdCount": 12,                 // always both, for the tab labels
  "cupCount": 88
}
```

Controller attribute stack copied from `GET to-collect` (`StoresController.cs:414-430`):
`[HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StorePaymentAdmin)]` plus the
four `ProducesResponseType`s.

### S14 — Tests
- Backend: unit tests for the query handler (role guard, SuperAdmin all, ReSeller scoped, currency
  filter both ways, date and store filters, page clamping, money mapping per tab, totals over the
  whole filter not the page, both counts, empty result). One NEW backend E2E test file is allowed.
- Frontend: unit tests for the page (loader wiring, request params per tab, tab label counts,
  table content per tab, `i` disclosure for CUP and absence for USD, footer totals from the server,
  page reset on tab/filter change, empty and error states).
- Untouchable: `backend/src/SMCA.WebApi.E2ETests/**` existing files and `frontend-react/e2e/**`
  must not be modified, renamed, skipped or weakened. Only new files are added on the E2E side.

### S15 — No regression
`/management/stores/collections` and `/management/stores/commissions` keep their behavior, routes,
menu entries and tests untouched.

## Tasks

| ID | Unit | Route | Specs | Status |
|---|---|---|---|---|
| T1 | Backend: repository method, query, DTOs, controller endpoint, unit tests, new E2E | delegated | S2-S7, S9-S11, S13, S14 | done — `0be56a37` (13 unit + 4 E2E green) |
| T2 | Frontend: route, menu, http service, domain models, page with two tabs, i18n, unit tests | delegated | S1, S4-S10, S12-S14 | done — `0bf85133` (23 tests green) |
| T3 | Seam check: both test suites, both typechecks, contract diff against S13 | inline | all | done — backend 1871 unit green, frontend 466 files green, `pnpm typecheck` 5/5 |
| T4 | Commits: one per unit, each with its own RDD review | inline | all | done — four commits, four approved reviews (`0be56a37`, `0bf85133`, `9a7a0b76`, `af9199fd`) |

The frontend review surfaced a money-truth defect after T2 (`9a7a0b76`): a failed re-request left
the previous tab's rows on screen under the new tab, so a USD figure could be read as CUP. It is
fixed and reviewed; the tab, request-race and disclosure-control findings were fixed in the same
commit.

## Log

### L1 — User request (verbatim)
"si con odd. Recuerda usar los subagentes para el explorer, para el worker y las tareas que debes usar los subagentes. Usa codegraph para las cosas que debes usarlo y no usar grep o otro comando para esos casos. Ademas tienes que hacer RDD cada vez que toque. Cualquier duda me preguntas para que no asumas nada de nada."

Preceded by: "El SuperAdmin donde puede ver los cobros realizados? Esto tambien lo debe ver el RESeller solo para sus tiendas?" — answered: nowhere today.

### L2 — Product decisions (user, verbatim)
- Location: "Página nueva en el menú".
- Scope of v1: "Fechas + tienda, paginado 50".
- Columns: "Todo, comisión incluida".
- Commission currency: "En la moneda de su base (recomendado)".

### L3 — Correction: the user rejected the two-money-columns reading (verbatim)
> "No entiendo, el cobro puede ser en varias monedas? revisa bien en el codigo para que no asumas nada ni de la memoria"

Verified: no. A payment is one charge collected in one currency. `Price` stays USD and never
changes; `AmountPaid` is the CUP total actually paid when a rate was entered. Evidence: entity
comments `StorePayment.cs:18,31,33-38`, `RegisterStorePaymentCommand.cs:17-25,94-100`, and the
owner's own words in `odd/tasks/store-payment-exchange-rate.md:29-40`.

### L4 — Final shape (user, verbatim)
> "quizas dividir en dos tabs una por USD y otro por CUP y entonces s emuestra solo el valor y en caso de que sea CUP se adiciona el icono de i para saber la tasa y lo que se debia pagar en USD."

Accepted with three design details (tab counts, `i` reachable by touch and keyboard, page reset on
tab change), then:
> "dale con esas correcciones."
> "todos los calculos en el backend."

### L5 — Assumptions made and documented (low consequence, reversible)
- Page size fixed at 50 for v1 (the store-filter endpoint already returns a manageable list).
- `paymentBeforeDate` serialized as an ISO instant, matching `PaidDate`, so the client formats one
  date shape only.
- The store filter dropdown is fed by `storeHttpService.listStores()` (`GET /v1/stores/by-current-user`),
  which already returns every store for SuperAdmin and only owned stores for a ReSeller.
- `Total` in the response equals the count of the selected currency; `usdCount`/`cupCount` exist so
  the tab labels need no second request.

### L6 — Scope note
This feature modifies backend production source. The repo's 2026-08-08 rule restricted backend
edits within backend test-coverage work; this is an authorized feature that cannot exist without a
new endpoint, covered by the user's explicit "dale con esas correcciones". Existing E2E tests stay
untouched; only new files are added.

### L7 — Implementation (both units, this session)
Backend: new `GetStorePaymentsHistoryQuery` + handler, `StorePaymentsHistoryDto`, repository
`GetHistoryPageAsync` with database-side COUNT/SUM/Skip/Take, controller action `GET stores/payments`,
13 unit tests, 4 E2E tests (real PostgreSQL). Frontend: `store-payments-history.tsx` with the two
tabs, filters, per-tab footer totals read from the server, accessible `i` disclosure, route, menu,
i18n, http service, domain models, 23 unit tests.

Two corrections made by the parent during the seam check:
1. The money formatter the frontend worker put in `packages/domain/src/models/store.ts` was moved to
   `app/shared/lib/format-currency.ts` as `formatMoneyWithCurrency`. Reason: presentation logic does
   not belong in the domain package, and a domain edit is invisible to the app until `dist` is
   rebuilt, which silently breaks any per-app `typecheck`/`test` run. Types stay in the domain.
2. `GetStorePaymentsHistoryQuery.cs` mapped a hypothetical CUP row with a null `AmountPaid` to
   `Price` — a USD figure under a CUP label. Changed to an explicit unreachable `0m` with the reason
   in the comment, so the screen can never mislabel a currency.

### L8 — Pre-existing flake found by the full suite (not caused by this feature)
The full frontend run reported 1 failure in 466 files:
`app/admin/messages/routes/__tests__/messages.test.tsx > AdminMessagesPage — thread scroll >
brings an owner reply into view by jumping the thread to the bottom` —
`expected +0 to be 480` at `messages.test.tsx:305`.

Evidence gathered: the file passes **5/5** in isolation and its 22 tests passed in every earlier
targeted run of this session. Reading the test (`:270-306`) and the scroll effect
(`messages.tsx:340-347`, dependency array `[messages, selectedConversationId]`, untouched by this
work) shows a race in the TEST, not in the product: it clicks the owner, then pins
`scrollTop = 0` with `defineProperty`, then fires `focus` to make the poll deliver the incoming
message. If any poll lands between the click and the pin, the component has already scrolled and
recorded `lastMessageIdRef = 'm-owner-1'`; the pin then resets the very value being asserted and the
effect never runs again, so `scrollTop` stays 0.

Not fixed here: it is a pre-existing test in a file this feature only adds cases to, so touching it
is outside this feature's scope without the owner's word.

