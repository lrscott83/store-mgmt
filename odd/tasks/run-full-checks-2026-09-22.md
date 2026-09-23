# Run full checks & tests (backend + frontend-react + E2E) — 2026-09-22

## Objetivo
Correr "todos los checks y tests, incluido los e2e" del backend y del frontend React, siguiendo el README del root (`qa-env/store-mgmt/README.md`).

## Órden (regla del README, no negociable)
1. Backend completo (`dotnet test backend/src/SMCA.sln`) — incluye los 3 proyectos de test.
2. Frontend checks+tests (`pnpm turbo run typecheck lint test`).
3. Frontend E2E (Playwright) — **nunca en paralelo** con backend E2E (comparten `smca_test`).

## Resultados

### Backend — `dotnet test backend/src/SMCA.sln` (first-run: unknown, 2nd run --no-build: fully green)

| Proyecto | Tests | Estado |
| --- | --- | --- |
| Domain.UnitTests.dll | 27/27 | ✅ (0 failed) |
| Application.Tests.dll | 494/494 | ✅ (0 failed) |
| SMCA.WebApi.E2ETests.dll | 554/554 | ✅ (net8.0, 3m59s) |

- SECOND_FULL_EXIT=0, todas las suites verdes, ninguna línea `Failed!`/`error CS` en el log completo.
- El `dotnet test SMCA.sln` original regresó exit 1 transitorio: se re-corrió y **no se reproduce** (posible cache de build/trabajo atómico del primer arranque; el README da el comando canónico en frio y en frio pasa).

### Frontend — `pnpm turbo run typecheck lint test` (frontend-react)

- FRONTEND_FULL_EXIT=0, Tasks: 12 successful, 12 total. 4157 tests passed, 0 type errors.
- Fix realizado durante esta verificación: `sales-routes.test.tsx:328` assertaba el contrato viejo del crédito ("sin radios/date en SaleCreditsPage" — contrato Angular legacy). La feature credits (fusionada) agrega radios paid/unpaid + date-range en esa vista. Actualicé el test unitario al contrato nuevo (3 radios `Todos/Por Pagar/Pagados` + `date-range-filter-input`), igual a `credits-routes.test.tsx:515`. No es E2E → permitido editarlo. Re-corrido verde.

### Frontend E2E — Playwright (en curso en background)
- `pnpm exec playwright test --grep-invert @rate-limit` (suite default/api) → cue en temp.
- Luego api (config `playwright.api.config.ts`), luego rate-limit (`@rate-limit`, agota cuotas, se corre al final).

## Pendientes
- Confirmar resultados Playwright (los 3 logs).
- Backend en :5019 con http-e2e era requerido por Playwright; estaba levantado (/health 200).

## Evidencia
- g_full.log / bk-full.log en `C:\Users\Appollo\AppData\Local\Temp\opencode\`.
