# Feature: MultiPayments — módulo VIP, canales de pago y multi-pago por venta

**Creado**: 2026-09-18 · **Estado**: planificado (ODD) · **Rama actual**: `qa` (origin default = `main`)
**Fuente funcional**: `docs/contracts/pagos-y-canales-de-pago.md` (RF-01…RF-12), adaptada por las decisiones del owner (2026-09-18).
**Referencia de implementación**: MultiMonedas (módulo 15) → migración `20260917143901_Add-MultiMonedas-Module`, `MultiMonedasModuleBackfill.cs`, script `backend/scripts/17-20260917-Add-MultiMonedas-Module.sql`.

## Objetivo

Habilitar en el POS (React) el módulo **MultiPayments** para tiendas VIP: varias formas de pago en una venta con conversión por tasa, canales de pago generalizados (método + moneda sobre las 7 monedas), vuelto al pagar de más, selector de moneda del carrito y registro de tasas por canal (append-only), con el mínimo de cambios posible sobre la arquitectura actual (POS offline-first + espejo backend).

## Problema

Hoy una venta tiene UNA forma de pago y UNA moneda (el carrito bloquea mezclar monedas: `currency-guard`). El contrato define el modelo nuevo (0..N pagos por orden, tasas congeladas, cascada de resolución, un solo redondeo HALF-UP) y **no está implementado**: no existen `OrderPayment`, canales, tasas por canal ni conversión entre monedas.

## Por qué

Pedido del owner (2026-09-18) tras analizar `docs/contracts/pagos-y-canales-de-pago.md`. 8 decisiones confirmadas por el owner antes de planificar. El módulo se suma al plan VIP, siguiendo el patrón ya probado de MultiStores/MultiMonedas (migración EF + script VPS con backfill).

## Alcance

**Dentro**:

- Módulo `MultiPayments` (id 16) + feature 44; `Price=10`, `PercentDiscountPrice=50` (efectivo 5); **solo VIP (4)**; backfill de tiendas VIP activas.
- Canales generalizados: canal = método + moneda sobre las 7 monedas (CUP, USD, EUR, CLA, MLC, CAD, MXN); los 5 canales del doc son un subconjunto.
- Varios pagos por venta: canal, monto en su moneda, tasa congelada, monto convertido a la moneda de la orden; vuelto al pagar de más.
- Registro de tasas por canal append-only (valor moneda-por-USD, vigencia, 6 decimales) + UI dueño/admin + persistencia offline + sync.
- Selector de moneda del carrito (solo con módulo 16) con persistencia por usuario.
- Multi-moneda en carrito habilitado por módulo 16 (el guard actual se mantiene sin módulo).
- Espejo backend de paridad: `OrderPayment` + `ChannelExchangeRate` (sin endpoints nuevos).
- Migración EF + script VPS `18-20260918-Add-MultiPayments-Module.sql`.

**Fuera**:

- Flujo de crédito y endpoints nuevos (RF-12) — el POS sigue offline-first.
- percent/tax con multi-pago (con módulo, el total es la suma de líneas convertidas).
- Conversión automática desde el registro diario USD→CUP existente (no se toca).
- Tocar E2E existentes, Angular legacy, o producción backend fuera de lo listado.

## Reglas vigentes (no negociables)

- E2E backend (`backend/src/SMCA.WebApi.E2ETests/`) y frontend (`frontend-react/e2e/` + `support/`): **prohibido modificar, borrar, renombrar, skipear o debilitar existentes**. Solo tests NUEVOS (archivos nuevos).
- Backend production: requiere notificación + aprobación explícita del owner antes de tocar (aplica a T1/T2 — notificado y **autorizado** 2026-09-18).
- Angular (`frontend/`) frozen; todo en `frontend-react/`.
- Código y comentarios en inglés; UI en español (`app/shared/lib/i18n/es.ts`).
- Commits convencionales, sin atribución AI; cada tarea cierra con commit work-unit + evidencia observada.

## Decisiones ratificadas por el owner (2026-09-18)

1. **Canales generalizados**: canal = método + moneda (las 7 monedas). Sin tasa resoluble, el pago solo se acepta en su propia moneda.
2. El **CUP del doc = CUP de la app**.
3. **Arquitectura**: frontend-first + **espejo backend de paridad** (tablas de pagos y tasas; sin endpoints). Migración EF + script VPS.
4. **Tasas por canal**: registro append-only (canal, valor moneda-por-USD, vigencia, 6 decimales, UI propia). Cascada: tasa del canal → tasa de la misma moneda (otro canal) → pivote USD=1 → error tipado. Congelada por pago.
5. **Vuelto**: se puede pagar de más; el sobrante se muestra como vuelto; no se cierra por debajo del total; sin crédito.
6. **Módulo**: id 16 + feature 44, Price 10 / 50%, solo VIP, backfill de tiendas VIP activas (patrón script 17).
7. **Selector de moneda**: CUP, USD + las monedas del carrito; define la moneda del total; persistido por usuario en el dispositivo.
8. **percent/tax no aplican con multi-pago**; sin módulo 16, el comportamiento actual queda intacto.

## Decisiones finas (propuestas, revisables)

- **D-f1 — Vuelto**: los pagos persistidos son los **aplicados** (Σ = total exacto, invariante RF-04); el sobrante se muestra como vuelto en la moneda del pago que excede.
- **D-f2 — Espejo backend**: cubre `OrderPayment` **y** `ChannelExchangeRate` (paridad §2.3 del doc).
- **D-f3 — UI de tasas**: se decide en T5 cuidando no romper los E2E existentes de `management/exchange-rates` (sección nueva en la vista actual o ruta nueva).
- **D-f4 — TDD**: `disabled` según el registro de testing (el `strict_tdd: true` de `openspec/config.yaml` pertenece a un pipeline retirado). Checks funcionales + tests nuevos en cada tarea. Runners: `pnpm test` / `dotnet test`.
- **D-f5 — Naming**: `ChannelRate` (frontend) / `ChannelExchangeRate` (backend) para no colisionar con el `ExchangeRate` diario existente del frontend.
- **D-f6 — Escala decimal backend**: `ApplicationDbContext.OnModelCreating` fuerza `18,6` a todo decimal; se añade un guard que respeta tipos explícitos (comportamiento equivalente para el resto) y los montos espejo quedan `18,2` mientras las tasas siguen `18,6` (doc §2.3).

## Tasks

- [x] **T1 — Backend: módulo + catálogo + espejo + migración EF.** `ModuleType.MultiPayments=16`, `FeatureType.MultiPayments=44`; HasData de `Module` (Price 10 / Percent 50), `Feature` (→ módulo 16) y `StorePlanModule` (solo VIP); entidades `OrderPayment` y `ChannelExchangeRate` + configuraciones EF; migración. **AC**: `dotnet build` verde; migración aplicable en `smca_test`; sin cambios en tests existentes, salvo la **excepción autorizada 1:1 (2026-09-18)**: `StorePlanCatalogTests.cs` (matriz Superior 2..15 / VIP 2..16). **Cerrada 2026-09-18**: build 0 errores; E2E 1/1; migración `20260918131144_Add-MultiPayments-Module-And-Payment-Mirror` aplicada a `smca_test`; sin drift de modelo.
- [x] **T2 — Script VPS 18.** `backend/scripts/18-20260918-Add-MultiPayments-Module.sql` espejo de la migración: catalog INSERTs, `StorePlanModule` (VIP), backfill `StoreModule` + `StoreRoleFeature` (roles 2/3) para tiendas VIP activas, setval, registro en `__EFMigrationsHistory`, SELECTs de verificación, ROLLBACK comentado. **AC**: paridad 1:1 con la migración; idempotente (`ON CONFLICT DO NOTHING`). **Cerrada 2026-09-18**: DDL 1:1 (solo guards de idempotencia); backfill idéntico a los constantes; smoke test psql 2 corridas contra `smca_test` → exit 0 (no-op); `backend/scripts/README.md` actualizado (fila 18).
- [ ] **T3 — Frontend domain: canales + tasas + conversión.** Modelo de canal (método+moneda), resolución en cascada, conversión vía pivote USD con **un solo redondeo HALF-UP**, modelo `OrderPayment`, helpers de vuelto. Tests unitarios nuevos. **AC**: casos §4.1 del doc cubiertos.
- [ ] **T4 — Registro de tasas (offline).** Servicio append-only por canal (storage cifrado por tienda), integración en sync (`data-serializer`) y provisión. Tests. **AC**: alta + lectura de la tasa vigente por momento; filas nunca editadas ni borradas.
- [ ] **T5 — UI de tasas por canal.** Pantalla (gating dueño/admin, mismo criterio que la vista de tasas actual) para registrar tasa por canal con vigencia + historial. Tests. **AC**: registrar + ver historial; gating correcto; E2E existentes de la vista de tasas intactos.
- [ ] **T6 — Selector de moneda del carrito.** Solo con módulo 16; CUP, USD + monedas del carrito; define la moneda del total; persistencia por usuario (sobrevive recargas). Tests. **AC**: selección persistida y reutilizada en la próxima venta.
- [ ] **T7 — UI multi-pago en carrito.** Lista de pagos (agregar/quitar), cada uno canal+moneda+monto; conversión a la moneda de la orden; restante por cubrir; vuelto al exceder; bloqueo de cierre por debajo del total. Tests. **AC**: escenarios del owner (USD 120 = 100 USD + 14.000 CUP @700; CUP 120 = 100 CUP + 20 CUP).
- [ ] **T8 — Multi-moneda en carrito (módulo 16).** Levantar `currency-guard` cuando el módulo está activo; líneas y total convertidos a la moneda elegida. Tests. **AC**: con módulo, carrito mixto permitido; sin módulo, guard intacto.
- [ ] **T9 — Orden: persistencia.** `createOrder`/`reviveOrder` con `payments[]`; compatibilidad con campos legacy (`salePaymentMethod`, `percent`, `tax`); backfill de órdenes viejas. Tests. **AC**: round-trip y compatibilidad sin regresión.
- [ ] **T10 — E2E frontend (spec NUEVO).** `frontend-react/e2e/multipayments.spec.ts`: selector de moneda, multi-pago, vuelto, tasas. **AC**: verde contra app+backend reales; ningún spec existente tocado.
- [ ] **T11 — E2E backend (archivo NUEVO).** Persistencia espejo de `OrderPayment`/`ChannelExchangeRate` + defaults. Add-only. **AC**: verde en `smca_test`.
- [ ] **T12 — Cierre.** Verificación completa (vitest/typecheck/lint + dotnet build/tests + E2E nuevos), actualizar este doc con evidencia, commits work-unit.

## Verificación por tarea

- Frontend: `npx vitest run <paths>`, `pnpm turbo run typecheck`, `pnpm turbo run lint`.
- Backend: `dotnet build backend/src/SMCA.sln`; tests nuevos por filtro; E2E nuevos con PostgreSQL `smca_test`.
- Cada tarea cierra con evidencia observada anotada en este doc + commit work-unit.

## Delivery

- Forecast (authored, sin generados): **~3.5k–4.5k líneas** → supera el presupuesto de revisión (~400) ⇒ estrategia `ask-on-risk` (default): la cadena (`stacked-to-main` vs `feature-branch-chain`) se define antes del primer commit.
- Rama: hoy `qa` (no es la default de origin); si el owner prefiere rama feature, se crea antes del primer commit.

## Progreso

- 2026-09-18: feature doc creado; 0/12 tareas. Limpieza: `openspec/changes/multipayments/` (carpeta vacía de un enrolamiento SDD erróneo) eliminada.
- 2026-09-18: primer bloqueo E2E resuelto — el owner autorizó 1:1 la actualización de `StorePlanCatalogTests.cs` (VIP 2..16); ningún otro test afectado (verificado).
- 2026-09-18: **T1 cerrada** — rama `feat/multipayments` (cadena `feature-branch-chain`); migración `20260918131144_Add-MultiPayments-Module-And-Payment-Mirror`; evidencia: `dotnet build` 0 errores + E2E `StorePlanCatalogTests` 1/1 + `has-pending-model-changes` sin drift.
- 2026-09-18: fix de paridad de T1 — `MultiPaymentsModuleBackfill.cs` (backfill `StoreModule`/`StoreRoleFeature` para VIP activas, `ON CONFLICT DO NOTHING`) + llamadas en Up/Down de la migración; build 0 errores.
- 2026-09-18: RDD — assessment del commit `89c0a24d`: **medium → diferido al slice** (boundary `4b8a54dc`).
- 2026-09-18: **T2 cerrada** — script `18-20260918-Add-MultiPayments-Module.sql` + `backend/scripts/README.md`; DDL/backfill 1:1 con la migración; idempotencia verificada con psql (2 corridas, exit 0); RDD del slice (2 commits): **medium → diferido al slice**.

## Próximo paso

- T3 — Frontend domain: canales + tasas + conversión (con tests unitarios nuevos; sin tocar E2E).
