# Online order partial updates (lost update on the 3 PATCH)

Objective: stop the three online-order PATCH endpoints from writing the whole row, so a status change no longer clobbers a concurrent payment change (and vice versa).
Branch: test. Route: delegated (worker). Runner: `dotnet test` (xUnit + PostgreSQL `smca_test`).

## Specs

S1. Fix the lost update described by the owner exactly as quoted:

> "Un pedido tiene varias cosas a la vez: estado, pago y repartidor. Cuando recepción marca "aceptado", el sistema guarda el pedido completo. Cuando caja marca "pagado" al mismo tiempo, vuelve a guardar el pedido completo. El que guarda último pisa el cambio del otro: el pedido puede quedar pagado pero sin aceptar, o aceptado pero sin el pago. Nadie ve un error."

S2. Chosen option, verbatim from `docs/plans/plan-resumen.md` (P0-2, recommendation C):

> "**C. Solo A ahora; B como unidad aparte.**"

> "**A. Actualización parcial por columnas.** Marcar solo las propiedades que la operación tocó (`Entry(entity).Property(x => x.Status).IsModified = true`, etc.). Es el patrón que ya se aplicó y probó en `StoreCatalogSettingsRepository.UpsertAsync` (5.3, `00acfe44`)."

S3. `B` (`rowversion`/`xmin` + `DbUpdateConcurrencyException` -> 409) is explicitly out of scope: "se difiere a una unidad con migración y semántica 409 documentada. A no debe presentarse como "cerrado": en el plan queda B como deuda explícita."

S4. Columns written per operation, derived from `Order.ChangeStatus` and `Order.ChangePaymentStatus` verbatim (Domain/Entities/Orders/Order.cs:194-286):

- `PATCH /online-orders/{id}/status`: always `Status`; plus `CancellationReason` when the new status is `Cancelado`; plus `DriverId` when it is `Transportando`; plus `PaymentStatus` and `PaidAt` when it is `Entregado` (delivering means paid).
- `PATCH /online-orders/{id}/payment`: `PaymentStatus` and `PaidAt`.
- `PATCH /online-orders/{id}/driver`: `DriverId`.

S5. Required proof, verbatim from the plan: "Requiere aprobación backend y test contra PostgreSQL real (el E2E nuevo debe demostrar que un `PATCH payment` concurrente sobrevive a un `PATCH status`)."

S6. Constraints that must not be violated: no migration; no existing E2E test or E2E support file is modified (new E2E file only); the Angular app is never read or touched; the HTTP contract, routes and payloads do not change; `ApplicationDbContext` stays `NoTracking`.

## Tasks

T1. `IOrderRepository` + `OrderRepository`: add the partial-update method (S2). Route: delegated. Status: pending.
T2. The three handlers mark only their columns (S4). Route: delegated. Status: pending.
T3. Update the three affected unit-test classes to the new repository contract. Route: delegated. Status: pending.
T4. New E2E: concurrent `PATCH /payment` + `PATCH /status` both persist (S5). Route: delegated. Status: pending.
T5. Run unit suite + the new E2E, then RDD review over the worktree candidate. Route: inline. Status: pending.

## Log

L1 (owner, verbatim): "segun el resumen de los planes en docs/plans vamos a resolver esto: "2. Dos personas trabajando el mismo pedido ... Recomiendo empezar por la primera: arregla el caso real (dos personas tocando cosas distintas) sin tocar la base de datos. La segunda es la protección fina para cuando dos personas editan exactamente lo mismo, y la dejaría como mejora posterior, documentada, no como pendiente oculto. " cUALQUIER DUDA ME preguntas para que no asumas nada de nada."

L2: owner approved the exact scope (columns per operation, partial updates only, new E2E, no migration, P0-3 untouched) with "dale".

L3 (diagnosis, codegraph): `GenericRepository.cs:29-33` does `Entry(entity).State = EntityState.Modified`; the three handlers call it after a `NoTracking` read, so EF emits an UPDATE of every column with the values read before the other writer's change.

L4 (owner, verbatim): "dale con todos los advisores y luego rdd como corresponde".

## Round 2 specs (review advisories)

S7. No handler may pass persistence column names. The domain reports which fields it changed and Infrastructure maps them to columns, so a new domain mutation cannot be silently dropped by a stale hand-maintained list. `Order.ChangeStatus` and `Order.ChangePaymentStatus` return the changed fields; `UpdatePartialAsync` takes them.

S8. `UpdatePartialAsync` must fail loudly instead of silently losing writes: it refuses an entity already tracked by the context (its pending changes would be discarded by `State = Unchanged`), and it refuses an empty field set (a no-op that reports success).

S9. `CancellationReason` and `DriverId` must be proven against the real EF/PostgreSQL path, not only through a mocked repository.

S10. A concurrent `PATCH /driver` must survive a `PATCH /status` write on the same order (and the reverse), proven deterministically like S1.

T6. Domain: `OrderChangedField` flags + `ChangeStatus`/`ChangePaymentStatus` return the fields they mutate. Route: delegated.
T7. Repository: `UpdatePartialAsync(order, OrderChangedField)` with the S8 guards and the single flag-to-column map. Route: delegated.
T8. Handlers + unit tests updated to the field set. Route: delegated.
T9. New deterministic E2E for S9 and S10. Route: delegated.
