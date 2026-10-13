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

### Progreso

- 2026-10-13 — **T1 + T2 hechos** (`8f203dfe`): helper `disableStoreModule` + `channel-rates-catalogue`
  rediseñado. Verificación aislada: **2 passed**.
- 2026-10-13 — **Corpus adaptado** (`22b73679`, delegado a un worker y verificado por el orquestador):
  15 specs + 4 fixtures. Verificación por spec en aislamiento (`--retries=0`) y agrupada → **37 passed /
  1 flaky** (`multipayments-currency-block`; pasa aislado, no reproduce). Ninguna aserción de gate se
  debilitó; se completaron dos pares de gate que estaban a medias.
- 2026-10-13 — **Fichas 05, 06, 07 y 08 RESUELTAS** (ver `docs/testing/known-issues/...`).
- **Hallazgos del worker** (no del plan de nacimiento): PCF2 tenía **otra** causa —`PlanPanels` es un
  acordeón de estado único y el clic sobre el panel ya activo lo colapsaba—; `MMF4` estaba **oculto**
  tras `test.describe.serial` (nadie lo había ejecutado).

### ⚠️ Hallazgo de APP (NO corregido — fuera de alcance)

`sale.tsx:229-234` y `:256-263` levantan la guarda de **"una sola moneda por venta"** con el módulo **15**
(`hasMultiMonedasModuleAvailable`), mientras `currency-guard.ts:14-17` la documenta con el módulo **16**
(MultiPayments). Consecuencia del nacimiento en Superior: el popup de bloqueo por mezcla de monedas queda
**inalcanzable para toda tienda nueva**. **Necesita decisión del owner**: corregir el call site a
`hasMultiPaymentsModuleAvailable`, o aceptar el 15 como el disparador real y retirar la regla. El mismo
cableado existe en `inventory/routes/egress.tsx:89-92` y `sales/routes/wholesale.tsx:227-230`.
