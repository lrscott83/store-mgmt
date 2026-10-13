# store-payment-exchange-rate

Objective: when the SuperAdmin/ReSeller registers an owner→platform payment, capture an
optional USD→CUP exchange rate and an optional "total pagado", persist both on the
`StorePayment`, and show them wherever the payment's charged amount is shown. The reseller
commission uses the "total pagado" as its base when it has a value.

Branch: `qa`. Test runner: backend `dotnet test`, frontend `pnpm -C frontend-react test`.

## Specs

S1 — The register-payment flow opens a popup BEFORE the payment is registered, as a
confirmation of the payment. It shows the **monto cobrado** (read-only) and two optional
fields: **tasa de cambio** and **total pagado**. User's words:

> "cuando se haga el pago mostrar un popup para poner la tasa de cambio y el total pagado,
> ninguno es requerido y se guardan esos dos valores"
> "1. ANtes del registro y como si fuera una conformacion del pago."

S2 — The rate is CUP per 1 USD; entering it computes `total pagado = monto cobrado × tasa`,
and the user may edit that total before registering. Whatever value is present at register
time is the stored total pagado. User's words:

> "Cuando se pone la tasa se debe calcular pero se puede modificar por el usuario."
> "La tasa es cuantos CUP vale 1 USD, asi que tienes que multiplicar el valor por la tasa de
> cambio."
> "El usuario puedo poner lo que desee ahi y si tiene valor ese es el total pagado."

S3 — Both values are persisted on the `StorePayment`. The stored **`Price` (monto cobrado) does
not change** and keeps being computed the same way. User's words:

> "El price no cambia y se sigue calculando del mismo modo que se calcula."

S4 — The reseller commission base is the **total pagado when it has a value**, otherwise the
monto cobrado; the formula itself is unchanged. A commission based on the total pagado is in
CUP; otherwise in USD. User's words:

> "SI el usuario pone valor al total pagado en el popup, entonces la comision es usando ese
> valor y no el monto cobrado."
> "Las comisiones si se pone el total son en CUP y si no se ponen son en USD"

S5 — The commissions view shows the per-month total in TWO columns: USD and CUP. User's words:

> "El total por comisiones y que sean dos columnas."
> "SI tienes que mostrar algun total muestra el total en CUP y el total en USD."

S6 — The two values are shown in the popup, and in any view that shows the `StorePayment`'s
monto cobrado (none exists today). They are NOT editable after registration (out of scope).
User's words:

> "Esos dos valores se muestran en el popup pero si hay una vista donde muestras el monto
> cobrado del StorePayment entonces tambien debes mostrarla en esa vista."
> "Esos valores del popup la tasa y el total pagado no se editan al menos por el momento esta
> fuera de este scope."

## Out of scope

- POS exchange rates (`ChannelExchangeRate` / MultiMonedas) — a different, unrelated capability.
- Any new payments-history screen (none exists; S6 only covers a view that shows the monto cobrado).
- Editing the rate/total after the payment is registered.

## Tasks

- [x] T1 — Backend: `StorePayment` gains nullable `ExchangeRate` and `AmountPaid`; `Create`
      gains the two params; column types set; EF migration (source) + generated script.
      Migration `20261013155058_AddStorePaymentExchangeRateAmountPaid`, script
      `scripts/34-20261013-Store-Payment-Exchange-Rate-Amount-Paid.sql`.
- [x] T2 — Backend write: `RegisterStorePaymentCommand` carries the two optional values, keeps
      `Price` unchanged, and computes the reseller commission over `AmountPaid ?? amount`.
      Endpoint accepts an optional body (no body still works).
- [x] T3 — Backend read: `ReSellerCommissionDto` + `GetReSellerCommissionsQuery` split the
      monthly total into USD and CUP (`AmountPaid` set ⇒ CUP).
- [x] T4 — Frontend: confirmation popup in `/management/stores/collections` with monto cobrado,
      rate and total pagado (auto-computed, editable); service sends the optional payload.
- [x] T5 — Frontend: two commission totals (USD, CUP) in `/management/stores/commissions`.
- [x] T6 — Tests + RDD: backend unit/E2E for the new fields and the commission base; frontend
      vitest for the popup and the two totals; RDD assessment.

## Log

L1 (verbatim user request, 2026-10-13):

> "En la administración como SuperAdmin debo poder poner la tasa de cambio del USD para CUP
> para generar el pago para mi de los owners según la tienda. Esto no tiene nada que ver con
> las tasas del cambio del POS, esto es todo diferente."

L2 (verbatim clarifications, 2026-10-13):

> "cuando se haga el pago mostrar un popup para poner la tasa de cambio y el total pagado,
> ninguno es requerido y se guardan esos dos valores"
> "1. ANtes del registro y como si fuera una conformacion del pago. 2. Cuando se pone la tasa
> se debe calcular pero se puede modificar por el usuario. 3 Donde mismo se muestra el valor
> pagado se deben mostrar esos dos valores tambien. La tasa es cuantos CUP vale 1 USD, asi que
> tienes que multiplicar el valor por la tasa de cambio."
> "SI el usuario pone valor al total pagado en el popup, entonces la comision es usando ese
> valor y no el monto cobrado."
> "El total pagado se calcula en el popup, pero el usuario puede poner despues lo que quiera
> antes de registrar el pago. Cuando el usuario registra el pago ese es el valor que tienes que
> poner como total pagado. EL usuario puedo poner lo que desee ahi y si tiene valor ese es el
> total pagado."
> "Las comisiones si se pone el total son en CUP y si no se ponen son en USD, no se cual es el
> problema con eso? SI tienes que mostrar algun toal muestra el total en CUP y el total en USD."
> "1. El total por comisiones y que sean dos columnas. 2. claro en eso no hay cambio y no te
> vallas del scope y los cambios que te estoy pidiendo."
> "El price no cambia y se sigue calculando del mismo modo que se calcula."
> "Esos valores del popup la tasa y el total pagado no se editan al menos por el momento esta
> fuera de este scope."
> "si hay una vista donde muestras el monto cobrado del StorePayment entonces tambien debes
> mostrarla en esa vista."

L3 (explored state, 2026-10-13): payments are registered manually via
`POST /v1/stores/{storeId}/payments` (`RegisterStorePaymentCommand`); the row is a
`StorePayment` with status Paid, `Price` = `ModulePriceCalculator.CalculateTotal(store.StoreModules)`,
`PaymentBeforeDate` = current due + 1 month, and the reseller commission snapshot
(`ReSellerAmount` computed over `amount`). The collections page
(`management/stores/routes/collections.tsx`) lists due stores and registers the payment; the
commissions page (`management/stores/routes/reseller-commissions.tsx`) shows one monthly total.
No screen shows a registered payment's charged amount today.

L4 (implementation, 2026-10-13): T1–T6 done inline.

- Commits: `ff6e92af` (backend: entity + config + migration `20261013155058` + script
  `scripts/34-...` + command + controller + DTO/query + unit tests + E2E),
  `3380e593` (frontend: domain types + service + `payment-confirm-modal.tsx` + collections +
  commissions two columns + i18n + vitest), `949f0ce2` (this doc).
- Verified: backend build OK; unit `RegisterStorePaymentCommandHandlerTests` 9/9 and
  `GetReSellerCommissionsQueryHandlerTests` 5/5; E2E `StorePaymentExchangeRateTests` 3/3 and the
  related `RegisterStorePayment`/`StoreCreationTrial` set 22/22 (no-body still works); frontend
  `turbo typecheck` 5/5, `turbo lint` 4/4, vitest collections/commissions/service 62/62.
- Independent verification (fresh verify agent): PASS, 0 blockers. Reproduced every number and
  probed the popup, the money rule, the migration columns and the currency split. Advisories:
  a malformed body is now 400 (baseline accepted anything — unavoidable with a typed optional
  body); negative values are accepted by the endpoint (the UI gates `min="0"`; validation was
  not requested); `PaymentCount` still counts both currencies together.

L5 (RDD outcome, 2026-10-13): the native assessment over the batch was `risk: medium`,
`review_due: false`, reason `under_budget`. Because the change ships a DB migration, it was
escalated to `risk: high` (item 1), which set `review_due: true`. The review START then
returned a TERMINAL stop: `lens_context_budget_exceeded` — the candidate's complete reviewer
evidence (23 files / 4449 lines, dominated by the generated EF `ApplicationDbContextModelSnapshot`
and migration Designer) exceeds the native reviewer context budget, and no review authority was
created. The native continuation is to reduce the candidate scope (review smaller slices) or to
disable reviews; the batch assessment is also available to stand as the recorded outcome.
