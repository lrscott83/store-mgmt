# Plan resumen — estado de `docs/plans` y trabajo pendiente

> **Índice único y evolutivo.** Actualizar este documento cada vez que un plan se
> complete, se agregue uno nuevo o cambie de prioridad.
>
> **Última auditoría:** 2026-09-20 · Rama: `qa` · 40 documentos analizados.
> **Método:** verificación plan-por-plan contra el código real con evidencia
> (archivo:línea o commit). Sin asumir: cada clasificación tiene prueba.

## Cómo usar este documento

- **Pendiente** = trabajo real por hacer, ordenado de P0 (mayor) a P3 (menor).
- Al cerrar un ítem: marcar la casilla y anotar el commit / evidencia.
- Al crear un plan nuevo en `docs/plans/`, agregarlo a la sección que corresponda.
- Los planes ya implementados se eliminaron (recuperables con `git log --all -- <ruta>` /
  `git show <commit>:<ruta>`).

---

## 1. Trabajo pendiente (por prioridad)

### P0 — Correctitud de datos e invariantes (alto impacto, desbloqueado)

- [x] **Totales por moneda fuera del dashboard (MultiMonedas §6).** — HECHO (2026-09-20, sin commit)
  Las 5 vistas agrupan por moneda (total primario + chips) con el gate `hasMultiMonedasAvailable`;
  sin el módulo la salida es idéntica. Nuevo componente compartido
  `app/shared/components/multimonedas/currency-total-amount.tsx`; reutiliza `currency-totals`.
  Fuente: `docs/plans/2026-09-17-multimonedas-module-plan.md` §6; tracker `odd/tasks/multicurrency-view-totals.md`.
  Revisión RDD: `review-reliability` **aprobada** (lineage `review-0f25edfbdaddef0b`, authority burned).
  3 hallazgos no bloqueantes pendientes (ver «Follow-ups» abajo).
  Pendiente: **commit** (decisión del usuario).

- [ ] **Invariante de sesión autenticada — ruta `/unlock-data`.**
  Una sesión válida pero bloqueada aún aterriza en `/login?unlock=1`. El diseño
  propone una ruta dedicada y desacoplar `guestOnlyLoader`.
  Fuente: `docs/plans/2026-09-06-auth-session-redirect-invariant-e2e-gaps.md` §6.
  Evidencia: no existe ruta `unlock-data`; `app/auth/routes/loaders.ts:36-39,79-81`
  redirigen/retornan null cuando `needsUnlock && hasUnreadableCiphertext`.
  Relacionado: contrato `docs/contracts/authenticated-session-redirect.md`.

- [ ] **Actualizar spec canónico REQ-5 (contradice el código).**
  Fuente: `docs/plans/2026-09-15-store-plan-change-permission-refresh-plan.md` §6.2.
  Evidencia: `openspec/specs/e2e-store-plan-activation-ui/spec.md:68-80` exige
  "cero llamadas a `GET /v1/auth/me`", mientras el código hace **una** (`soft-refresh-session.ts`).

### P1 — Features pendientes acordadas (desbloqueadas)

- [ ] **Warehouse movements — Fases 3-5.**
  Fuente: `docs/plans/2026-09-16-warehouse-movements-plan.md`.
  Evidencia: sin propagación de costo (`app/inventory/routes/warehouse-movements.tsx:239-278`
  solo revierte y recrea); tests nombrados `E-R7b`, `E-R13`, `E-R15`, `E-R16`, `U-S14`,
  `U-S19`, `U-M8`, `U-C1`, `U-C2`, `I-3f`, `I-4c`, `I-4e`, `I-5` ausentes;
  A9a: `app/sync/lib/services/data-synchronizer-service.ts:1011-1018` cuenta filas
  saltadas por duplicado como insertadas.
  (Fases 1-2 verificadas en verde: `odd/tasks/warehouse-movements-fase2-ui.md`.)

- [ ] **PWA offline shell — restos.**
  Fuente: `docs/plans/2026-07-27-pwa-offline-shell-frontend-plan.md` (cambio activo
  `openspec/changes/pwa-offline-shell`, no archivado).
  Evidencia: Task 6 nginx sin `text/javascript` ni `application/manifest+json`
  (`frontend-react/deploy/nginx.conf:27-35`); Task 8: logs TEMP `[SW]`/`[PWA]` vivos
  (`app/service-worker.ts:39,45,63,154`, `app/shared/lib/pwa/service-worker-registration.ts:28-52`)
  — **requiere sign-off del usuario**; Task 7 walkthrough manual (hoy cubierto por
  `e2e/offline-shell.spec.ts`); desviaciones de diseño sin implementar
  (`offlineFallback`, prune por entrada — aceptadas en el cambio).

- [ ] **E2E gated modules auth roster — filas faltantes.**
  Fuente: `docs/plans/2026-09-08-e2e-plan-gated-modules-auth-roster.md`.
  Faltan: `E1-6` (storeuser inactivo fuera de roles), `E1-7` (superusuario ve la lista
  completa de módulos), `E2-5` (roster pagado incluye warehouse/wholesale/multistores).
  (Regla AGENTS.md: agregar tests NUEVOS; no tocar los existentes.)

### P2 — Bloqueado por decisión de producto o aprobación backend

- [ ] **Sesión de caja POS (apertura/cierre/arqueo).**
  Fuente: `docs/plans/sesion-de-caja-apertura-cierre-pos.md` (diseño; **sin código**).
  5 decisiones abiertas (§3.8) sin resolver. Es la misma necesidad de
  `2026-08-04-frontend-work-queue.md` Group C.

- [ ] **Store payment zero override (pago 0 por tienda).**
  Fuente: `docs/plans/2026-09-05-store-payment-zero-override-plan.md` (**sin código**).
  No confundir con el plan canónico de precio (`2026-09-15-store-plan-canonical-price-plan.md`,
  ya implementado).

- [ ] **Telegram exception alerts.**
  Fuente: `docs/plans/2026-09-05-telegram-exception-alerts.md` (**sin código**).
  Requiere aprobación explícita para tocar código de producción backend.

- [ ] **Rate-limit / quota doc drift.**
  Fuente: `docs/plans/2026-09-17-rate-limit-quota-doc-drift-plan.md` (**sin ejecutar**).
  Evidencia: `frontend-react/e2e/README.md:195,256,262-266`; comentario obsoleto en
  `backend/src/SMCA.WebApi/PolicyCode/RateLimitPolicies.cs:20-24` (requiere aprobación backend).

### P3 — Housekeeping / documentación

- [ ] **Triage de artefactos legacy Superpowers.**
  Fuente: `docs/plans/2026-08-12-legacy-superpowers-artifacts-triage.md`.
  5 archivos siguen en `docs/superpowers/`; ninguna opción (§3 A-D) fue marcada.
  Decisión de ubicación, sin código.

- [ ] **Retirar `docs/plans/2026-08-04-frontend-work-queue.md`.**
  Snapshot obsoleto: sus premisas ("no hay automatización de navegador", "bloqueado
  en backend") ya no aplican; su único pendiente real (Group C) es la sesión de caja (P2).

- [ ] **Smoke checklist offline-auth (manual, 9 pasos).**
  Fuente: `docs/plans/2026-07-28-offline-auth-frontend-smoke-checklist.md`.
  Nunca ejecutado por un humano; mayormente cubierto hoy por
  `e2e/login-offline.spec.ts`, `offline-access-panel.spec.ts`, `roster-recovery.spec.ts`.

- [ ] **Doc obsoleto: `docs/plans/2026-08-04-offline-roster-billing-fields-frontend.md`.**
  Código ya enviado (`FormatVersion = 3`, campos de billing en el roster); el doc quedó
  sin actualizar y describe un contrato v2 viejo. **Candidato a borrar.**

---

## 2. Planes implementados y eliminados en esta auditoría (2026-09-20)

Eliminados (`git rm`), cada uno con evidencia de implementación completa:

| Plan eliminado | Evidencia principal |
| --- | --- |
| `2026-07-25-at-rest-encryption-frontend-plan.md` | Archivo SDD `2026-08-02-at-rest-encryption-frontend` (25/25 reqs); `entity-crypto.ts`, `data-key-store.ts`, `dek-unwrap.ts`, `entity-migration.ts` + 6 seams |
| `2026-09-06-valid-session-navigation-e2e-plan.md` | `e2e/valid-session-navigation.spec.ts` (12 tests); `unlock-gate.ts:114`; `loaders.ts:36-38,79-81` |
| `2026-09-08-store-plans-multistores-backend-plan.md` | `StorePlan`/`StorePlanModule`, migraciones `20260908*`, `WarehousesCatalogTests` |
| `2026-09-15-store-plan-canonical-price-plan.md` | `PlanPricingUtils.cs`, `StoreDto`/`OwnerStoreDto`, `StorePlanCanonicalPriceTests` |
| `2026-09-15-store-price-parity-plan.md` | `StoreRepository` includes, `StoreListPriceParityTests` |
| `2026-09-08-owner-stores-cards-plan.md` | `StoresController` `my-stores` / `{id}/activation`; `MyStoresTests`, `owner-stores.spec.ts` |
| `2026-09-10-seamless-store-switch-plan.md` | `AuthDto.StoreDekWraps`, `switch-store.ts`, `LoginCommandHandlerTests` |
| `2026-09-14-plan-panels-delta-modules.md` | `plan-panels.tsx` (delta de módulos) + i18n `INCLUDES_PREVIOUS_PLAN` |
| `2026-09-04-wholesale-sales-plan.md` | `wholesale.ts`, ruta `/sales/wholesale`, `mayorista-sale.spec.ts` |
| `2026-09-03-sale-barcode-scanner.md` | `scanner-modal.tsx`, `@zxing/browser`, `sale-barcode-scanner.spec.ts` |
| `2026-09-04-elaboration-module.md` | Recetas/elaboraciones; migración `20260918153139`; `elaboration.spec.ts` |
| `2026-09-17-payment-methods-percent-tax-plan.md` | Enum `SalePaymentMethod`, `payment-pricing.ts`, `OrderPaymentMethodPricingTests` |
| `2026-09-10-csp-enforcing-flip-plan.md` | `csp-policy.mjs`, `deploy/nginx.conf`, `csp-enforcing-export.spec.ts` |
| `2026-09-14-client-error-log-pwa-plan.md` | `client-log.ts`, `diagnostics.tsx`, `diagnostics.spec.ts` |
| `2026-09-15-damaged-data-recovery-export-wipe-plan.md` | `damaged-data-recovery.ts`, `blocking-alert.ts`, tests |
| `2026-09-16-dashboard-kpi.md` | `dashboard.tsx`, `dashboard-range-aggregator.ts`, `dashboard-metrics.spec.ts` |
| `2026-09-17-dashboard-ganancia-monedas-mixtas-plan.md` | `profit-calculator.ts` (decisión B1), tests del aggregator |
| `2026-09-17-dashboard-moneda-plan.md` | `currency-totals.ts`, `dashboard-metrics-body.tsx` |

> **Nota de integridad:** varios de estos planes están citados como procedencia en
> comentarios del código (p. ej. `PlanPricingUtils.cs:10`, `dashboard-range-aggregator.ts:1`,
> `switch-store.ts:1`). Esos comentarios apuntan ahora a archivos borrados; el
> contenido sigue recuperable con `git show <commit>:docs/plans/<archivo>`. No se
> tocaron (modificar código de producción requiere aprobación).

---

## 3. Superseded — decisión de borrado pendiente

- `docs/plans/2026-09-03-offline-roster-jwt-online-operations.md` — su "Option A"
  (JWT como token de sesión) no se implementó; el resultado se logró con "Option 2"
  (interceptor de bearer, `api-client.ts:52-88`). **Candidato a borrar.**
- `docs/plans/2026-09-10-store-plan-change-reauth-popup-plan.md` — premisa obsoleta
  (`updateStore` → `changeStorePlan`); el popup de re-auth nunca se implementó.
  **Borrar o re-planear** si aún se quiere la UX.

---

## 4. Trackers vivos (no borrar; actualizar periódicamente)

- `docs/plans/2026-08-02-pending-manual-verification.md` — registro de pasos bloqueados por humano.
- `docs/plans/2026-09-11-preexisting-e2e-failures.md` — bitácora de fallos E2E preexistentes.
- `docs/plans/endpoints-e2e-coverage.md` — inventario de cobertura E2E de endpoints.

## 5. Registros de diseño (histórico, no borrar)

- `docs/plans/2026-07-25-at-rest-encryption-local-data-design.md` — diseño implementado (base del archivo SDD 2026-08-02).
- `docs/plans/2026-07-27-pwa-offline-shell-design.md` — diseño implementado; ligado al cambio activo `pwa-offline-shell`.
- `docs/plans/2026-08-02-getme-failure-as-200-backend.md` — **RESUELTO**; el archivo SDD
  `2026-08-04-getme-failure-as-200-backend` decidió retenerlo como registro histórico.

---

## 6. Cómo se clasificó

| Estado | Significado |
| --- | --- |
| IMPLEMENTED | Todos los entregables del plan están en el código con evidencia → eliminado. |
| PARTIAL | Parte implementada, parte pendiente → queda, con lo pendiente arriba. |
| NOT_IMPLEMENTED | Sin entregables en el código → queda pendiente. |
| DESIGN_ONLY | Doc de diseño sin checklist; se indica si el diseño existe en código. |
| SUPERSEDED | Otro plan/cambio cubre lo mismo → ver §3. |
| LIVING_TRACKER | Doc de seguimiento continuo, no entregable → ver §4. |
