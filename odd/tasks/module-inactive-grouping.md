# module-inactive-grouping

Objective: make the two SuperAdmin module editors list every module available to stores
grouped under the plan it belongs to, even when the module is currently inactive, while the
cost counts only ACTIVE modules and updates live on activate/deactivate.

Branch: `qa`. Test runner: backend `dotnet test`, frontend `pnpm -C frontend-react test`.

## Specs

S1 — `/admin/modules` (global catalog) lists EVERY `AvailableToStore` module, active or not,
and groups each under the plan it belongs to. Deactivating a module must NOT move it to the
"Otros planes" bucket. User's words:

> "en los modulos del superadmin deben salir todos los modulos que esten disponibles para el
> store, si no esta activo no importa, debe salir igual"
> "ambas vistas deben mostrar todos los modulos disponibles para las tiendas y en el grupo
> segun el plan que le corresponde"

S2 — The per-store module popup (`/admin/stores` → gear → módulos y precios) lists every
globally-active `AvailableToStore` module, grouped by its plan, whether or not the store has
it active. A globally-INACTIVE module must NOT appear. User's words:

> "Si el modulo no está activo de forma general (segun la vista admin/modules) claro que no
> debe salir en la vista de los modulos de la tienda, pero si esta activo en la vista general
> pero desactivado para la tienda si tiene que salir."

(This is already the current behavior of the read; it is pinned, not changed.)

S3 — On both screens the cost counts ONLY active modules and is recomputed live when a module
is activated/deactivated. Backend and frontend. User's words:

> "el precio solo tenga en cuenta los modulos activos y eso lo debes arreglar tanto en el
> backend como en el frontend para cuando se active o desactive un modulo"

S4 — Activate/deactivate works on both screens without surprises.

S5 — Non-regression: `GET /v1/plans` without the new flag keeps returning active-only modules,
so the plan-change panels (owner and SuperAdmin) are untouched.

## Tasks

- [ ] T1 — Backend: optional SuperAdmin-only `includeInactiveModules` on `GET /v1/plans`; when set, `plan.modules` keeps inactive modules (each with `isActive=false`); default unchanged. Route: inline.
- [ ] T2 — Frontend: `/admin/modules` requests plans with the flag so grouping keeps inactive modules under their plan; the per-store popup is unchanged. Route: inline.
- [ ] T3 — Tests backend: unit cases for the flag (keeps inactive / non-SuperAdmin refused); new E2E file for the flag + "price counts only active". Route: inline.
- [ ] T4 — Tests frontend: vitest for the page's grouping/total with an inactive module and for `totalModulePricing` over mixed lists; Playwright mirror update (`module-catalog-pricing.spec.ts` + `store-module-pricing-fixture.ts`) plus a deactivate case. Route: inline.

## Log

L1 (verbatim user request, 2026-10-13):

> "en los modulos del superadmin deben salir todos los modulos que esten disponibles para el
> store, si no esta activo no importa, debe salir igual. Ademas en el calculo del precio deben
> contar solo los activos, incluso en el frontend se debe actualizar el costo cuando se active
> y desactive un modulo. Ademas desactivar un modulo no lo quita del plan que esta. Revisa
> todo el impacto de estas cosas que estan funcionando mal para que funcionen como te pedi."

L2 (verbatim clarification, 2026-10-13):

> "te estoy hablando con el SuperAdmin las vistas de los modulos (admin/modules) y el popup de
> configuracion de los modulos de una tienda deben mostrar todos los modulos disponibles para
> las tiendas y en el grupo segun el plan que le corresponde. Ahora si no estan activos no
> salen. La idea es pode activar y desactivar los modulos en esas dos vistas sin problemas.
> Ademas que el precio solo tenga en cuenta los modulos activos y eso lo debes arreglar tanto
> en el backend como en el frontend para cuando se active o desactive un modulo. Si el modulo
> no está activo de forma general (segun la vista admin/modules) claro que no debe salir en la
> vista de los modulos de la tienda, pero si esta activo en la vista general pero desactivado
> para la tienda si tiene que salir. El Scope es solo esas dos vistas y el calculo del costo a
> pagar segun la lista de modulos."

L3 (root cause, 2026-10-13): `GET /v1/plans` strips `Module.IsActive == false` from
`plan.modules` (`GetPlansQuery.cs:55-56`). Both editors group with
`groupModulesByPlanDelta` over that response, so an inactive module is claimed by no plan and
falls into the `NO_PLAN_GROUP` bucket; reactivating it in the draft does not return it to its
plan's total. The per-store read already matches S2 (`GetStoreModulePricingQuery` iterates
`GetAvailableModulesToStore()`, and `GetStoreModulesByIdAsync` returns inactive rows).

L4 (decision, 2026-10-13): Approach = additive flag on `GET /v1/plans`, default off, so
plan-change panels and every existing test stay green. User approved and authorized the E2E
edits: update `module-catalog-pricing.spec.ts` (+ optional param on
`readPlanCatalog` in `store-module-pricing-fixture.ts`) so the mirror tracks the new grouping,
and add coverage; prefer backend E2E for the cases.
