# public-plan-pricing-landing

Objective: una sección de **Precios** en el landing público (`/` → `app/home/routes/landing-deep.tsx`)
que muestra **una tarjeta por plan** (Gratis, Pago, Superior) dentro de un **acordeón**, con los
**módulos activos y disponibles para tienda** y sus precios reales, alimentada por un **endpoint
público** nuevo que lee la configuración real de la BD.

Branch: `test`. Runner: backend `dotnet test`; frontend `pnpm -C frontend-react test`.

## Specs

S1 — Endpoint **público y anónimo** que devuelve los planes **Gratis, Pago y Superior** (sin VIP),
     ordenados por `Order`, cada uno con su lista **ACUMULADA** de módulos (el plan incluye los del
     anterior) y su total. Palabras del owner: "como mismo se muestra en la app que se dice todo lo
     del plan de Pago y ademas los del superior".

S2 — Solo se listan módulos que están **activos y disponibles para tienda** = el universo canónico
     `ModuleRepository.GetAvailableModulesToStore()` (decisión del owner: "usa ese mismo").

S3 — Cada módulo lleva su **precio efectivo** (precio − %descuento − descuento fijo, piso 0). Si hay
     descuento (`Precio` original > efectivo) se expone también el **original** para mostrarlo
     tachado. Un módulo **incluido** (`PriceIncluded`) se muestra con **precio 0** (decisión del
     owner: "los incluidos los muestras y lo pones con precio 0").

S4 — El **total del plan** = Σ efectivos de sus módulos facturables (regla única
     `ModulePriceCalculator`); se expone también el total original para tacharlo si hay descuento.

S5 — El landing muestra `#precios` como **acordeón**, **una tarjeta por plan**, con **Pago abierto
     por defecto y marcado "Sugerido"** (decisión del owner).

S6 — Leyenda de que el precio es en **USD** ("al cambio del día según la tasa del banco") — **solo
     texto**, sin leer ni computar ninguna tasa (decisión del owner).

S7 — El landing es público y **sin loader** (`openspec/specs/home-landing/spec.md`): el fetch es
     client-side y si el endpoint falla la sección no rompe la página.

## Tasks

- [x] T1 — Backend: `PublicPlanPricingDto` + `GetPublicPlanPricingQuery` (reusa
        `GetActivePlansIncludingModulesForCatalogAsync` + `GetAvailableModulesToStore` +
        `ModulePriceCalculator`).
- [x] T2 — Backend: `PublicPlansController` `[AllowAnonymous]` → `GET /api/v1/public/plans`.
- [x] T3 — Backend: E2E `PublicPlanPricingE2ETests` **4/4** (anónimo · solo 3 planes · módulos
        disponibles · acumulado + regla de precio · incluidos a 0).
- [x] T4 — Frontend: sección `#precios` en el landing (acordeón, Pago abierto + "Sugerido",
        leyenda USD) + servicio `home/lib/public-plan-pricing.ts` + item de nav (desktop y móvil).
- [x] T5 — Frontend: vitest `plan-pricing-section.test.tsx` **5/5**.
- [x] T6 — Checks + tests: backend 165 + 1309; frontend `pnpm turbo run typecheck lint test` 12/12
        (5634 passed · 6 skipped · 0 failed). E2E del endpoint 4/4.

## Verificación (2026-10-15)

- `PublicPlanPricingE2ETests` 4/4; `Domain.UnitTests` 165/165; `Application.Tests` 1309/1309.
- `pnpm turbo run typecheck lint test` → 12/12 tasks, 5634 passed.
- Nota: `landing-deep.test.tsx` (vitest, NO es E2E) recibió un `vi.mock` del servicio de precios
  porque el landing ahora hace un fetch y la suite bloquea HTTP real; el mock usa una función
  plana porque ese archivo llama `vi.restoreAllMocks()` en `afterEach`.

## Log

L1 (request del owner, verbatim, 2026-10-15):

> "quiero que en el landing adiciones una seccion con los Precios y que esten dividios por planes.
> Vamos a hacer un endpoint publico para esto para que se muestren los planes con sus precios reales
> segun lo que hay configurado en la BD. Solo deben salir los modulos que estan activos y los
> precios de cada uno."

L2 (decisiones del owner): planes Gratis/Pago/Superior (sin VIP); módulos ACUMULADOS; precio real +
el original tachado si hay descuento; leyenda de USD (solo texto); una tarjeta por plan en acordeón
con Pago abierto y "sugerido"; universo de módulos = `GetAvailableModulesToStore()`; los incluidos
se muestran con precio 0.
