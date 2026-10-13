# e2e-birth-plan-superior

## Objetivo

Actualizar el **corpus E2E** para que refleje el nacimiento de tienda vigente: **una tienda nueva nace
en el plan `Superior`** (y recibe sus módulos), no en `Pago`. La decisión es del owner (2026-10-13):
> "Cuando se crea debe ser en el plan Superior y no el de Pago"

La **app está correcta**: `RegisterService` → `CreateStoreService` nace en `Superior`
(commit `store-birth-superior`, 2026-10-11, que reemplazó a `store-birth-pago-only`). Lo que quedó viejo
es el corpus E2E, que asume el plan Pago en ~20 archivos.

- Rama: `dev`.
- Runner: `pnpm test:e2e` (Playwright) contra backend `http-e2e` (`:5019`, BD `smca_test`).
- Regla: cada spec es un E2E **existente** → autorización 1 a 1 del owner (dada para este cambio).

## Specs

S1. Una tienda nueva (registro o creación) nace en **Superior** y **trae el módulo 15 (MultiMonedas)**
    y no el 16 (VIP). Toda precondición E2E que dependa del set de módulos debe construirse
    explícitamente (activar/desactivar), no asumirse por el plan.

S2. Las precondiciones **negativas** ("sin el módulo X la UI/el menú no aparece") se construyen
    **desactivando** el módulo, no asumiendo que el plan no lo trae.

S3. Un spec que muta el estado server-side de una tienda (activar/desactivar módulos) debe usar una
    **identidad privada** (registro real), nunca la persona compartida (`e2e/README.md`).

S4. No se debilita ninguna aserción de gate: el par "sin el módulo → ausente / con el módulo → presente"
    se mantiene.

## Alcance (medido 2026-10-13)

Specs: `channel-rates-catalogue`, `multimonedas`, `multipayments`, `multipayments-currency-block`,
`multipayments-cart-v2`, `payment-methods-config`, `payment-methods-plan-gate`, `owner-store-create`,
`owner-stores`, `store-create-security`, `store-switch-back-logout`, `store-switcher-refresh`,
`wholesale-plan-gate`, `mayorista-sale`, `plan-change-permission-refresh`, `store-plan-lock-regression`.
Fixtures/support: `multipayments-fixture`, `store-multimonedas-fixture`, `store-wholesale-fixture`,
`web-catalog-fixture`, `expense-form-modal` (comentarios).

## Tareas

- [ ] **T1** — `multipayments-fixture.ts`: helper `disableStoreModule` (borra la fila `StoreModule`) +
  actualizar el comentario obsoleto (el nacimiento es Superior).
- [ ] **T2** — `channel-rates-catalogue.spec.ts` (**primer fallo**, ficha 08): negativa por desactivar
  el 15; segunda mitad con identidad privada.
- [ ] **T3..Tn** — el resto del corpus, spec por spec.
- [ ] **Tfinal** — corrida E2E completa y cierre de fichas 05–08.

## Log

L1 (verbatim, 2026-10-13):
> "ok, dale. Cuando se crea debe ser en el plan Superior y no el de Pago"

- Causa raíz confirmada: `CreateStoreService.cs:45,53` (Superior) y `RegisterService.cs:58-66` (delega).
- Ficha 08 abierta en `docs/testing/known-issues/2026-10-06-e2e-verification/`.
