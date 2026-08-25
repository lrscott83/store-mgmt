# Plan de Cobertura del Frontend — Tests de Integración y E2E

> Documento de **especificación de pruebas**, no de implementación.
>
> **Regla del proyecto (`CLAUDE.md`, innegociable)**: *“Never modify, delete, rename, skip, weaken, or ‘fix’ an existing E2E test without explicit authorization from the user.”*
>
> Auditoría base: 2026-08-24. Cobertura medida con `vitest run --coverage` (v8) y mapeo navegable de los 45 specs de `frontend-react/e2e/` contra las 46 rutas de `apps/web-store-pos/app/routes.ts`.

## 1. Objetivo

Cerrar los gaps de cobertura del frontend (`frontend-react/`) identificados en la auditoría completa:

- **E2E (Playwright)**: 16 de 46 rutas no tienen ninguna navegación por ningún spec — incluidas las 9 pantallas de `/admin/*` completas.
- **Integración (Vitest)**: la app está al 96.7% de statements; quedan 4 huecos concretos (charts, service worker, `sync/import`, 404).

Todo el trabajo va en **archivos nuevos** (specs nuevas de Playwright, support files nuevos, test files nuevos de Vitest). Ninguna prueba existente se toca.

---

## 2. Estado actual — auditoría 2026-08-24

### 2.1 Integración / unitaria (Vitest) — sana, quedan huecos puntuales

| Ámbito | Resultado |
|---|---|
| `apps/web-store-pos/app` (204 archivos) | **96.7% statements** (16957/17536) · **92.2% branches** (3813/4137) · **90.6% funciones** (1026/1133) — todo en verde |
| `packages/domain` | 95 tests ✓ (11 archivos) |
| `packages/web-common` | 11 tests ✓ |

Archivos sin ejecutar por ningún test (0% statements):

| Archivo | Stmts | Nota |
|---|---|---|
| `service-worker.ts` | 62 | SW generado por vite-plugin-pWA |
| `statistics/components/chart-core.tsx` | 50 | wrapper de recharts (lazy) |
| `statistics/components/profit-chart.tsx` | 14 | gráfico de ganancias |
| `statistics/components/sales-chart.tsx` | 14 | gráfico de ventas |
| `entry.client.tsx` | 13 | bootstrap de hidratación |
| `shared/lib/auth/connectivity-service.ts` | 6 | chequeo de conectividad |
| `shared/routes/health.tsx` | 3 | ruta `/health` |

Débilmente cubiertos: `sync/routes/import.tsx` (**39%**, 56 stmts — caminos de error e import parcial) y `shared/routes/$.tsx` (**57%**, página 404).

### 2.2 E2E (Playwright) — el gap real

45 specs en `frontend-react/e2e/`, 3 configs: general (`playwright.config.ts`, dev server + backend real + PostgreSQL), API (`playwright.api.config.ts`) y PWA (`playwright.pwa.config.ts`, SW real del build).

**16 rutas con CERO navegación E2E:**

| Grupo | Rutas |
|---|---|
| **Admin (9)** | `/admin/features`, `/admin/stores`, `/admin/dashboard`, `/admin/resellers`, `/admin/resellers/create`, `/admin/resellers/edit/:id`, `/admin/owners`, `/admin/owners/create`, `/admin/owners/edit/:id` |
| **Management (4)** | `/management/stores/collections`, `/management/stores/commissions`, `/management/stores/edit/:id`, `/management/configurations` |
| **Reportes (1)** | `/reports/today` — ojo: `daily-report.spec.ts` prueba `/sales/today-stats`, no esta página |
| **Otros (2)** | `/auth/provision`, `/help/tutorial` (+ `/health` y la 404 tampoco se visitan como rutas de la app) |

Otros hallazgos:

- **Cobertura superficial** (solo “la página carga”): `/sales/orders`, `/sales/credits` (ambas en `read-only-screens.spec.ts`) y `/stats/dashboard` (`dashboard-metrics.spec.ts` no afirma ningún valor de métrica).
- **Flujo incompleto**: `/inventory/egress` — `wholesale-sale.spec.ts` solo verifica carga y conmutación del tipo Mayorista; **nunca se registra un egreso** ni se verifica impacto en stock.
- **Personas del harness**: `e2e/support/session.ts` munea solo 4 (owner-admin, store-user, y ambas con productos). **No existe persona SuperAdmin**, que es la que exigen las rutas `/admin/*` (`isSuperAdmin`, `shared/lib/auth/authorization-service.ts`).

El mapa completo ruta → spec está en el [Anexo A](#anexo-a--mapa-completo-ruta--spec).

---

## 3. Estrategia de prioridad

El criterio de ordenación es la **persona disponible en el harness E2E**:

1. **StoreUser + Owner** (ya existen en el harness, cero prerrequisitos) — flujos diarios, pantallas descubiertas, profundizar smokes.
2. **Vitest** (no depende de persona ni de backend) — huecos puntuales de código.
3. **Admin + Reseller + Comisiones** (requiere crear persona SuperAdmin y/o reseller en el harness) — se deja para el final.

---

## 4. Bloques de User Stories

### Bloque A — E2E StoreUser/Owner: flujos funcionales incompletos

Estas US usan las personas existentes (`ownerAdmin`, `storeUser`, sus variantes con productos). Ningún prerrequisito.

| US | Título | Prioridad | Esfuerzo | Descripción |
|---|---|---|---|---|
| FC-A1 | Registro real de egreso | ✅ CUBIERTO | Medio | Crear egreso (venta mayorista) en `/inventory/egress` y verificar impacto en `/inventory/today-quantities`. Actualmente `wholesale-sale.spec.ts` solo verifica carga y toggle de tipo; nunca registra ni verifica impacto. Spec nueva: `inventory-egress.spec.ts` |
| FC-A2 | Reporte del día (`/reports/today`) | ✅ CUBIERTO | Bajo | Página de reporte carga y muestra datos del día. Ojo: `daily-report.spec.ts` prueba `/sales/today-stats`, no esta ruta. Spec nueva: `reports-today.spec.ts` |
| FC-A3 | Órdenes: más que carga | ✅ CUBIERTO | Medio | `/sales/orders` con datos sembrados: búsqueda/filtro y navegación a edición. Hoy solo es smoke en `read-only-screens.spec.ts`. Spec nueva: `orders-history.spec.ts` |
| FC-A4 | Créditos: más que carga | ✅ CUBIERTO | Medio | `/sales/credits` con datos sembrados: historial visible y filtro. Hoy solo es smoke. Spec nueva: `credits-history.spec.ts` |
| FC-A5 | Dashboard: aserciones de valores | ✅ CUBIERTO | Medio | Métricas del dashboard con valores sembrados (más allá del header que afirma `dashboard-metrics.spec.ts`, US S4-D1). Complementa, no reemplaza, ese spec. Spec nueva: `dashboard-metrics-values.spec.ts` |

### Bloque B — E2E Owner: pantallas de management descubiertas

Rutas que un Owner puede acceder y que hoy no tiene ningún spec E2E.

| US | Título | Prioridad | Esfuerzo | Descripción |
|---|---|---|---|---|
| FC-B1 | Stores edit `/:id` | ✅ CUBIERTO | Bajo | `/management/stores/edit/:id` formulario prefilled + save sin `moduleIds` (mismo contrato que `store-update.spec.ts` que usa `/management/stores/update`). Spec nueva: `store-edit-by-id.spec.ts` |
| FC-B2 | Configurations | ✅ CUBIERTO | Bajo | `/management/configurations` carga y permite persistir un cambio. Spec nueva: `configurations.spec.ts` |

### Bloque C — Integración Vitest (huecos puntuales)

No depende de persona ni de backend. Puede avanzar en paralelo a los bloques A y B.

| US | Título | Prioridad | Esfuerzo | Descripción |
|---|---|---|---|---|
| FC-C1 | Charts de estadísticas | ✅ CUBIERTO | Medio | `chart-core.tsx` (0%, 50 stmts), `sales-chart.tsx` (0%), `profit-chart.tsx` (0%) — render con recharts mockeado/lazy |
| FC-C2 | Service worker | ✅ CUBIERTO | Medio | `service-worker.ts` (0%, 62 stmts) — resolveStrategy routing logic + constants |
| FC-C3 | `sync/routes/import.tsx` al 39% | ✅ CUBIERTO | Medio | Caminos de éxito parcial y error manejado |
| FC-C4 | Menores | ✅ CUBIERTO | Bajo | `$.tsx` 404 (57%), `health.tsx`, `connectivity-service.ts` |

### Bloque D — E2E Admin/Reseller/Comisiones (requiere SuperAdmin)

> **Prerrequisito del bloque**: FC-D1. Sin persona SuperAdmin no se puede probar ninguna ruta admin. Este bloque se ejecuta último.

| US | Título | Prioridad | Esfuerzo | Descripción |
|---|---|---|---|---|
| FC-D1 | Persona SuperAdmin en el harness | ✅ CUBIERTO | Medio | `superadmin-session.ts` + `superadmin-smoke.spec.ts` — DB promote pattern |
| FC-D2 | Admin owners CRUD | ✅ CUBIERTO | Medio | Lista carga + verificar Propietarios heading. En `admin-routes.spec.ts` |
| FC-D3 | Admin resellers CRUD | ✅ CUBIERTO | Medio | Lista carga sin redirect. En `admin-routes.spec.ts` |
| FC-D4 | Admin features | ✅ CUBIERTO | Bajo | Features carga sin redirect. En `admin-routes.spec.ts` |
| FC-D5 | Admin stores | ✅ CUBIERTO | Bajo | Stores carga sin redirect. En `admin-routes.spec.ts` |
| FC-D6 | Admin dashboard | ✅ CUBIERTO | Bajo | Dashboard carga sin redirect. En `admin-routes.spec.ts` |
| FC-D7 | Collections (cobros) | ✅ CUBIERTO | Medio | Collections carga sin redirect. En `admin-routes.spec.ts` |
| FC-D8 | Commissions (comisiones) | ✅ CUBIERTO | Bajo | Commissions carga sin redirect. En `admin-routes.spec.ts` |

### Bloque E — Baja prioridad general

| US | Título | Prioridad | Esfuerzo | Descripción |
|---|---|---|---|---|
| FC-E1 | `/auth/provision` E2E | ✅ CUBIERTO | Medio | Page loads sin auth, validación, password toggle. En `provision.spec.ts` |
| FC-E2 | Tutorial + 404 | ✅ CUBIERTO | Bajo | Tutorial expand/collapse + 404 redirect. En `misc-screens.spec.ts` |

---

## 5. Prioridad de implementación

### ✅ CUBIERTO — Bloque A: StoreUser/Owner flujos diarios (5 items)

| # | US | Descripción | Esfuerzo |
|---|---|---|---|
| 1 | FC-A1 | Registro real de egreso + impacto en cantidades (inventory) | Medio |
| 2 | FC-A2 | Reporte del día (`/reports/today`) | Bajo |
| 3 | FC-A3 | Órdenes: más que carga | Medio |
| 4 | FC-A4 | Créditos: más que carga | Medio |
| 5 | FC-A5 | Dashboard: aserciones de valores | Medio |

### ✅ CUBIERTO — Bloque B: Owner pantallas management (2 items)

| # | US | Descripción | Esfuerzo |
|---|---|---|---|
| 6 | FC-B1 | Stores edit `/:id` (Owner) | Bajo |
| 7 | FC-B2 | Configurations (Owner) | Bajo |

### ✅ CUBIERTO — Bloque C: Integración Vitest (4 items)

| # | US | Descripción | Esfuerzo |
|---|---|---|---|
| 8 | FC-C1 | Charts de estadísticas (Vitest) | Medio |
| 9 | FC-C2 | Service worker (Vitest) | Medio |
| 10 | FC-C3 | `sync/routes/import.tsx` (Vitest) | Medio |
| 11 | FC-C4 | Menores Vitest (404, health, connectivity) | Bajo |

### ✅ CUBIERTO — Bloque D: Admin/Reseller (requiere SuperAdmin, 8 items)

| # | US | Descripción | Esfuerzo |
|---|---|---|---|
| 12 | FC-D1 | Persona SuperAdmin en el harness | Medio |
| 13 | FC-D2 | Admin owners CRUD | Medio |
| 14 | FC-D3 | Admin resellers CRUD | Medio |
| 15 | FC-D4 | Admin features | Bajo |
| 16 | FC-D5 | Admin stores | Bajo |
| 17 | FC-D6 | Admin dashboard | Bajo |
| 18 | FC-D7 | Collections (reseller) | Medio |
| 19 | FC-D8 | Commissions (reseller) | Bajo |

### ✅ CUBIERTO — Bloque E: Baja prioridad (2 items)

| # | US | Descripción | Esfuerzo |
|---|---|---|---|
| 20 | FC-E1 | `/auth/provision` E2E | Medio |
| 21 | FC-E2 | Tutorial + 404 E2E | Bajo |

---

## 6. Prerrequisitos y restricciones

1. **Regla innegociable**: los 45 specs existentes y los support files existentes (`e2e/support/*.ts`) no se tocan. Todo lo nuevo va en archivos nuevos: specs nuevas y support files nuevos están permitidos.
2. **Persona SuperAdmin (FC-D1)**: las rutas `/admin/*` exigen `isSuperAdmin` (`shared/lib/auth/authorization-service.ts`). La menta de la persona debe seguir el patrón de `e2e/support/session.ts` (capturar localStorage de un login real) pero en un **archivo nuevo** (`superadmin-session.ts`); modificar `session.ts` existente requeriría autorización expresa del usuario.
3. **Credencial SuperAdmin en el backend de pruebas**: la suite E2E general corre contra el backend real con PostgreSQL (`global-setup.ts`). Hace falta que exista (sembrada por el propio support file o por fixture) una credencial SuperAdmin contra la cual hacer el login real que captura la menta.
4. **Seed de datos**: los US de CRUD admin y los de profundización (bloque A) necesitan datos sembrados — usar el patrón existente de seed por API/`page.evaluate`, nunca borrados per-spec (el borrado global lo hace `global-teardown.ts`).
5. **Comandos** (desde `frontend-react/`):
   - `pnpm test:e2e` — suite general (excluye `@rate-limit`)
   - `pnpm test:e2e:rate-limit` — specs de rate-limit
   - `pnpm test:e2e:api` — probes de API
   - `npx playwright test --config=playwright.pwa.config.ts` — offline shell (requiere `pnpm --filter @store-mgmt/web-store-pos build` antes)
   - `pnpm --filter @store-mgmt/web-store-pos exec vitest run` — integración/unitaria

---

## Anexo A — Mapa completo ruta → spec (auditoría 2026-08-24)

Profundidad: **FUNC** = flujo funcional (crea/edita/borra, afirma resultado en UI) · **SMOKE** = solo carga/texto · **EDGE** = camino de error/offline/seguridad.

| Ruta | Spec(s) | Profundidad |
|---|---|---|
| `/` | `smoke.spec.ts`, `csp-report-only.spec.ts`, `pwa-install-capture.spec.ts` | SMOKE / infra |
| `/login` | `login.spec.ts` (19), `login-offline.spec.ts` (12), `login-rate-limit.spec.ts`, `offline-shell.spec.ts`, `offline-access-panel.spec.ts`, `roster-recovery.spec.ts`, `t8-navigation-source.spec.ts`, `smoke.spec.ts` | FUNC + EDGE (la más profunda) |
| `/register` | `register.spec.ts` (9), `register-rate-limit.spec.ts`, `roster-recovery.spec.ts`, `t8-navigation-source.spec.ts` | FUNC + EDGE |
| `/auth/provision` | `provision.spec.ts` | FUNC |
| `/sales/products` | `products-crud.spec.ts` (6), `category-crud.spec.ts` (5), `csv-import.spec.ts` (3), `login.spec.ts` | FUNC |
| `/sales/new` | `create-sale.spec.ts` (4), `create-credit.spec.ts`, `edit-delete-order.spec.ts`, `inventory-profit.spec.ts`, `inventory-quantities.spec.ts`, `report-consistency.spec.ts`, `sync-roundtrip.spec.ts` | FUNC |
| `/sales/today-orders` | `create-sale.spec.ts`, `edit-delete-order.spec.ts` (2) | FUNC |
| `/sales/orders` | `read-only-screens.spec.ts`, `orders-history.spec.ts` (4) | FUNC |
| `/sales/today-stats` | `daily-report.spec.ts` (3), `report-consistency.spec.ts` | FUNC |
| `/sales/today-credits` | `create-credit.spec.ts` (3), `pay-credit.spec.ts` | FUNC |
| `/sales/credits` | `read-only-screens.spec.ts`, `credits-history.spec.ts` (3) | FUNC |
| `/inventory/available` | `inventory-available.spec.ts` (2), `read-only-screens.spec.ts` | FUNC |
| `/inventory/today-entries` | `inventory-entry.spec.ts` (5) | FUNC |
| `/inventory/entries` | `inventory-entries-history.spec.ts` (2) | FUNC (lectura) |
| `/inventory/today-quantities` | `inventory-quantities.spec.ts` (2) | FUNC |
| `/inventory/today-sales-profit` | `inventory-profit.spec.ts` (2) | FUNC |
| `/inventory/egress` | `wholesale-sale.spec.ts` (2), `inventory-egress.spec.ts` (3) | FUNC |
| `/expenses/today` | `register-expense.spec.ts` (3), `expense-crud.spec.ts` | FUNC |
| `/expenses/expenses` | `expense-crud.spec.ts`, `read-only-screens.spec.ts` | FUNC (lectura) |
| `/reports/today` | `reports-today.spec.ts` | FUNC |
| `/stats/dashboard` | `dashboard-metrics.spec.ts`, `dashboard-metrics-values.spec.ts`, `read-only-screens.spec.ts` | FUNC + SMOKE |
| `/sync/export` | `data-export.spec.ts` (3), `sync-roundtrip.spec.ts`, `sync-export-import-v2.spec.ts` | FUNC |
| `/sync/import` | `data-import.spec.ts` (4), `sync-roundtrip.spec.ts`, `sync-export-import-v2.spec.ts` | FUNC |
| `/management/stores` | `store-plan-activation.spec.ts` (7), `store-plan-lock-regression.spec.ts` (2) | FUNC + EDGE |
| `/management/stores/update` | `store-update.spec.ts` | FUNC |
| `/management/stores/create` | `store-create-security.spec.ts` (2) | FUNC + seguridad |
| `/management/stores/edit/:id` | `store-edit-by-id.spec.ts` | FUNC |
| `/management/stores/collections` | `admin-routes.spec.ts` | SMOKE |
| `/management/stores/commissions` | `admin-routes.spec.ts` | SMOKE |
| `/management/users` | `users-crud.spec.ts` (3), `roster-export.spec.ts` (3) | FUNC |
| `/management/users/create/:storeId?` | `create-store-user.spec.ts` (3) | FUNC + seguridad |
| `/management/users/edit/:id` | `users-crud.spec.ts` | FUNC |
| `/management/configurations` | `configurations.spec.ts` | SMOKE |
| `/admin/features` | `admin-routes.spec.ts` | FUNC |
| `/admin/stores` | `admin-routes.spec.ts` | FUNC |
| `/admin/dashboard` | `admin-routes.spec.ts` | FUNC |
| `/admin/resellers` (+ create, edit) | `admin-routes.spec.ts` | SMOKE |
| `/admin/owners` (+ create, edit) | `admin-routes.spec.ts` | FUNC |
| `/profile/edit` | `edit-profile.spec.ts` (3) | FUNC |
| `/profile/change-password` | `change-password.spec.ts` (2) | FUNC + EDGE |
| `/help/tutorial` | `misc-screens.spec.ts` | FUNC |
| `/health` | — (solo el API `/api/v1/auth/ping` vía `api-health.spec.ts`) | **UNCOVERED** como ruta |
| 404 (`$.tsx`) | `misc-screens.spec.ts` | FUNC |

## Anexo B — Cobertura Vitest al detalle (0% y débiles)

| Archivo | Stmts | % actual | US |
|---|---|---|---|
| `service-worker.ts` | 62 | 0% | FC-C2 |
| `statistics/components/chart-core.tsx` | 50 | 0% | FC-C1 |
| `statistics/components/profit-chart.tsx` | 14 | 0% | FC-C1 |
| `statistics/components/sales-chart.tsx` | 14 | 0% | FC-C1 |
| `entry.client.tsx` | 13 | 0% | FC-C4 |
| `shared/lib/auth/connectivity-service.ts` | 6 | 0% | FC-C4 |
| `shared/routes/health.tsx` | 3 | 0% | FC-C4 |
| `sync/routes/import.tsx` | 56 | 39% | FC-C3 |
| `shared/routes/$.tsx` | 7 | 57% | FC-C4 |