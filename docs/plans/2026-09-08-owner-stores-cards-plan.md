# Plan: Vista "Mis tiendas" del Owner (cards) + endpoints de soporte

**Fecha:** 2026-09-08
**Rama:** `qa`
**Alcance:** Reorganizar la vista de tiendas del OWNER (no la del superadmin) en cards con gear, popups de edición (nombre/estado y plan), soportada por un endpoint nuevo de listado (todas sus tiendas + próxima fecha de cobro) y un endpoint nuevo de activación/desactivación.
**Contexto:** El owner hoy NO tiene vista de listado de tiendas: `/management/stores` muestra solo el plan de su tienda seleccionada. Este plan añade una vista nueva de cards sin tocar la vista "Plan de la tienda" (decisión P4).

**Decisiones del usuario (2026-09-08, respuestas P1–P4):**

- **P1 = (b):** Frontend + backend. Se aprueba tocar producción backend: el owner debe ver sus tiendas inactivas, cambiar `isActive` de sus tiendas, y recibir `nextDueDate` por tienda en el listado.
- **P2:** El precio del pago en el card usa el MISMO criterio que la vista del plan de la tienda (pestaña "Pago" del PlanPicker: total de módulos de pago, tachado cuando el total original > total con descuento).
- **P3:** El popup "Editar el plan" usa la MISMA lógica que la vista del plan de la tienda (`store-plan.tsx`): PlanPicker + guardado vía `PUT /v1/stores/{id}` con `moduleIds`, con el candado DG-7 (`readOnly = !isSuperAdmin && isOnPaidPlan`).
- **P4:** La vista "Plan de la tienda" (`/management/stores`, `store-plan.tsx`) NO se toca.

**Reglas del repo vigentes (CLAUDE.md):**

- El usuario APROBÓ explícitamente cambios en producción backend para este plan (P1-b). Todo cambio de backend queda listado en la §3.1 con archivos exactos.
- Los tests E2E existentes (backend `SMCA.WebApi.E2ETests/`, frontend `frontend-react/e2e/*.spec.ts`) NO se tocan. Toda cobertura nueva va en ARCHIVOS NUEVOS.
- Backend: solo se permiten AÑADIR tests E2E nuevos; no modificar los existentes.
- Tests unit/integration: libre edición (nuevos describe/it en archivos propios).

---

## 1. Estado actual (verificado en código)

### 1.1 Rutas y vistas existentes

| Ruta | Archivo | Rol que la usa | Contenido |
| --- | --- | --- | --- |
| `/management/stores` | `app/management/stores/routes/store-plan.tsx` | Owner + SuperAdmin | Plan de UNA tienda (`selectedStoreId` o `:id`). **No se toca (P4).** |
| `/management/stores/update` | `routes/update-store.tsx` → `EditStorePage includePlan=false` | Owner | Datos de la tienda seleccionada (nombre, dirección...). |
| `/management/stores/edit/:id` | idem | SuperAdmin | Datos de cualquier tienda (incluye `isActive`, `approved`). |
| `/admin/stores` | `app/admin/stores/routes/store-list.tsx` | SuperAdmin/ReSeller | Listado en cards con gear (`StoreCardList`). **No se toca.** |

El owner NO tiene hoy ninguna vista de listado de sus tiendas.

### 1.2 Backend — endpoints relevantes (StoresController.cs)

| Endpoint | Gate | Comportamiento verificado |
| --- | --- | --- |
| `GET /v1/stores/by-current-user` | auth | SuperAdmin: TODAS (IgnoreQueryFilters). ReSeller: activas de su cartera. Owner: `GetActiveStoresByUserIdAsync` — **filtra `s.IsActive`**, dueño activo, excluye DefaultStore. |
| `GET /v1/stores/{id}/plan` | SuperAdmin/StoresAdmin roles | Devuelve snapshot módulos + `nextDueDate` calculado (trial + último pago). |
| `PUT /v1/stores/{id}` (update) | `IsSuperAdminOrOwnerAdmin` (handler) | Owner solo cambia `Name`/`Address`. `Approved`/`IsActive`/`Description`/`PaymentStartDate` **solo SuperAdmin** (UpdateStoreCommand.cs:107-112). DG-7 lock: OwnerAdmin no cambia módulos si hay módulo pago activo. **NO verifica ownership** — cualquier OwnerAdmin puede editar cualquier tienda. |
| `DELETE /v1/stores/{id}` (deactivate) | `HasPermission(SuperAdmin)` | Solo SuperAdmin. |
| `POST /v1/stores/{storeId}/toggle-plan` | SuperAdmin + StorePaymentAdmin | Toggle Free↔Pago. No es para el owner. |

### 1.3 Hallazgos (verificados, alimentan el diseño)

- **H-1 — `by-current-user` NO trae módulos:** `GetActiveStoresByUserIdAsync`/`GetAllStoresIncludingOwnerAndIgnoreQueryFiltersAsync` solo hacen `Include(Owner.User)` — el mapper mapea `StoreModules` sin cargarlos ⇒ `modules: []` silenciosamente. Hoy nadie lo consume, pero el endpoint nuevo **SÍ debe hacer `Include(s.StoreModules).ThenInclude(sm => sm.Module)`**.
- **H-2 — `nextDueDate` solo existe en `GET {id}/plan`:** `StoreDto.NextPaymentDate` NO se calcula en ningún listado (queda `default`). El cálculo canónico vive en `GetStorePlanQuery.cs:42-53` (`StoreBillingUtils.GetNextDueDate(paymentStartDate, trialMonths, lastPaidBeforeDate)`).
- **H-3 — Método muerto en el frontend:** `storeHttpService.activateStore` llama `POST /v1/stores/activate` — el backend NO expone esa ruta (404). Nadie lo usa. Este plan lo sustituye por el endpoint real de activación (§3.1.2) y elimina el muerto.
- **H-4 — El owner no puede cambiar `isActive`:** ni por update (gate SuperAdmin) ni por endpoint propio.
- **H-5 — DG-7 lock:** OwnerAdmin + módulos pagos activos ⇒ cambio de módulos rechazado (`PlanLocked`) salvo same-set. La vista del plan ya lo respeta con `readOnly` — el popup lo replica (P3).
- **H-6 — Patrón visual existente:** `StoreCardList` (superadmin) pinta inactivas `bg-danger/10 border border-danger` y usa `ActionMenu` (gear). Se replica el patrón en la vista del owner.

---

## 2. Diseño de la vista (frontend)

**Ruta nueva:** `/management/my-stores` · **Ítem de menú nuevo:** "Mis tiendas" (`MENU.MY_STORES`), grupo Management, `featureIds: [EFeatures.Stores]`, `moduleId: Management`. *(Propuesta — confirmar en revisión, ver §7.)*

**Card por tienda:**

```
┌──────────────────────────────────────────────┐
│ Nombre de la tienda                   [⚙]    │  header: nombre izq. + ActionMenu der.
├──────────────────────────────────────────────┤
│ Plan de Pago                                 │  tipo de plan (STORES.PAID_PLAN / FREE_PLAN)
│ Próximo cobro: 15/10/2026                    │  solo si plan de pago (mismo gate que store-plan)
│ ~~10~~ 8 USD                                 │  precio tachado + actual (criterio PlanPicker)
└──────────────────────────────────────────────┘
```

- **Tipo de plan:** `isOnPaidPlan = modules.some(m => !m.priceIncluded && m.selected)` (con `mergeStoreModules`, idéntico a `store-plan.tsx:71`).
- **Próxima fecha:** solo si `isOnPaidPlan && nextDueDate` (idéntico a `store-plan.tsx:152`), formato `formatDateOnly`.
- **Precio (P2):** mismo criterio que la pestaña "Pago" del PlanPicker: `paidTotal = Σ currentPrice` de los módulos de pago del catálogo merged, `paidOriginalTotal = Σ price`; si `paidTotal < paidOriginalTotal` ⇒ original tachado (`line-through`, sin "USD" — `formatPlanAmount`) + actual en negrita (`formatPlanPrice`, con "USD").
- **Tienda inactiva:** `bg-danger/10 border border-danger` (patrón H-6) + etiqueta "(Inactiva)".

**Gear (`ActionMenu`) — 2 opciones:**

1. **Editar** (`intent="edit"`, `STORES.EDIT`) → popup modal:
   - Campo nombre (required, validación igual que `StoreForm`: `STORES.NAME_REQUIRED`).
   - Checkbox "Activa" (`STORES.IS_ACTIVE`).
   - Guardar → `PUT /v1/stores/{id}` (nombre; el owner ya puede) + `PUT /v1/stores/{id}/activation` si cambió `isActive`. Refresca el listado.
2. **Editar el plan** (nuevo key `STORES.EDIT_PLAN`) → popup modal con **la misma vista del plan** (P3):
   - `PlanPicker` con `modules = mergeStoreModules(catalogo, plan.modules)`, `onChange=setModuleIds`.
   - Fecha "Próximo cobro" arriba solo si pago (igual que `store-plan.tsx:150-160`).
   - Botón Guardar → mismo save que `store-plan.tsx:73-102`: `updateStore(id, {...plan, moduleIds})` + `getUserByToken()` para refrescar sesión.
   - `readOnly = !isSuperAdmin && isOnPaidPlan` (DG-7, idéntico).
   - Nota: el owner en tienda FREE puede activar el plan pago (la activación gasta su única vez — DG-7 la protege después).

**Archivos frontend nuevos:**

| Archivo | Contenido |
| --- | --- |
| `app/management/stores/routes/my-stores.tsx` | Página: fetch (`getMyStores` + `getModulesToStore`), grid de cards, orquesta popups. Loader: `featureLoader([EFeatures.Stores])` (mismo que las otras rutas de management stores). |
| `app/management/stores/components/owner-store-card.tsx` | Card individual (header/gear/contenido) — recibe store + merged modules + callbacks. |
| `app/management/stores/components/edit-store-modal.tsx` | Popup nombre + isActive. |
| `app/management/stores/components/edit-plan-modal.tsx` | Popup con PlanPicker + próxima fecha + save (lógica clonada de `store-plan.tsx`). |

**Archivos frontend modificados (mínimos):**

| Archivo | Cambio |
| --- | --- |
| `app/routes.ts` | + `route('management/my-stores', ...)`. |
| `app/shared/lib/config/menu-config.ts` | + ítem `MENU.MY_STORES` (grupo Management). |
| `app/shared/lib/i18n/es.ts` | + keys: `MENU.MY_STORES`, `STORES.EDIT_PLAN`, `STORES.INACTIVE_BADGE` (si aplica), títulos de popups. |
| `app/management/stores/lib/services/store-http-service.ts` | + `getMyStores()`, + `setStoreActivation(id, isActive)`; **eliminar** `activateStore` muerto (H-3). |
| `packages/domain/src/models/store.ts` | + `OwnerStoreWithPlan` interface (lo que devuelva el endpoint nuevo). |

**Vista "Plan de la tienda" (`store-plan.tsx`): SIN CAMBIOS (P4).** `/admin/stores` y `/management/stores/update`: SIN CAMBIOS.

---

## 3. Diseño del backend (APROBADO por P1-b)

### 3.1. Endpoint nuevo — `GET /v1/stores/my-stores`

**Objetivo:** todas las tiendas del owner actual (activas E inactivas), con snapshot de módulos y `nextDueDate` calculado.

- **Controller:** `StoresController.cs` — `[HttpGet("my-stores")]`, sin `HasPermission` adicional (gate en handler, como `UpdateStore`).
- **Handler gate:** solo OwnerAdmin (`_httpContextService.IsOwnerAdmin` — el flag que usa `IsSuperAdminOrOwnerAdmin`; SuperAdmin y ReSeller reciben `ApiException(Forbidden)`; store-user también). *(Verificar el nombre exacto del flag en `IHttpContextService` al implementar — ver §7-A.)*
- **Repositorio:** método nuevo en `IStoreRepository`/`StoreRepository`:

```csharp
// TODAS las tiendas del owner (sin filtro IsActive), Dueño activo, excluye DefaultStore,
// con StoreModules + Module cargados (H-1).
Task<IEnumerable<Store>> GetAllStoresByOwnerUserIdAsync(Guid userId, Guid? excludeStoreId = null);
```

(`Where(s => s.Owner != null && s.Owner.UserId == userId)` + `IgnoreQueryFilters` + `Include(StoreModules).ThenInclude(Module)` + `Include(Owner.User)` — espejo de `GetActiveStoresByUserIdAsync` quitando `s.IsActive`.)

- **DTO nuevo** `Application/Dtos/StoreManagement/OwnerStoreDto.cs` (NO tocar `StoreDto`):

```csharp
public sealed class OwnerStoreDto {
    public Guid Id { get; set; }
    public string Name { get; set; }
    public bool IsActive { get; set; }
    public bool Approved { get; set; }
    public DateOnly? PaymentStartDate { get; set; }   // null = nunca activó plan pago
    public DateOnly? NextDueDate { get; set; }         // null = sin fecha calculable
    public List<ModuleDto> Modules { get; set; } = new(); // snapshot (precios de la tienda)
}
```

- **`nextDueDate`** — mismo cálculo canónico que `GetStorePlanQuery.cs:42-53`: `trialMonths` de `ISystemConfigurationRepository.GetTestingPeriodInMonthsAsync()` + último `StorePaymentRepository.GetLastByStoreIdAsync`. Por tienda (N+1 aceptable: un owner tiene pocas tiendas; documentado).
- **Mapping:** profile nuevo o extensión en `StoreProfile` — `CreateMap<Store, OwnerStoreDto>` con `NextDueDate` seteado a mano en el handler (el cálculo no es mapeable).

### 3.2. Endpoint nuevo — `PUT /v1/stores/{id}/activation`

**Objetivo:** owner activa/desactiva SU tienda. Cubre el hueco de H-3/H-4 sin relajar el update general.

- **Controller:** `[HttpPut("{id}/activation")]` → `SetStoreActivationCommand(id, isActive)`.
- **Handler gate y reglas:**
  1. Si no es OwnerAdmin ni SuperAdmin ⇒ `Forbidden`.
  2. Carga la tienda con `GetStoreByIdIgnoreQueryFiltersAsync` (las inactivas están filtradas por el query filter global). Null ⇒ 404.
  3. **Ownership:** OwnerAdmin ⇒ exige `store.Owner.UserId == currentUser.Id`; ajena ⇒ `Forbidden`. SuperAdmin pasa (paridad con `DELETE {id}`).
  4. Excluir `DataUtils.DefaultStore.Id` ⇒ `Forbidden`.
  5. `store.IsActive = request.IsActive`; `UpdateAsync` + `SaveChangesAsync`.
- **NO se modifica** `UpdateStoreCommand` (ni su falta de ownership check — fuera de alcance, ver §7-B).

### 3.3. Frontend service (nuevo)

```ts
async getMyStores(): Promise<BaseResponseModel<OwnerStoreWithPlan[]>>
  // GET /v1/stores/my-stores
async setStoreActivation(id: string, isActive: boolean): Promise<BaseResponseModel<boolean>>
  // PUT /v1/stores/{id}/activation  body: { isActive }
// ELIMINAR: activateStore (POST /v1/stores/activate — no existe, H-3)
```

---

## 4. Plan de implementación (orden)

| Paso | Capa | Contenido | Verificación del paso |
| --- | --- | --- | --- |
| 1 | Backend | DTO `OwnerStoreDto` + repo `GetAllStoresByOwnerUserIdAsync` + query `GetMyStoresQuery` + handler + ruta controller + mapper. | `dotnet test Application.Tests` (nuevos handler tests §5.1). |
| 2 | Backend | Command `SetStoreActivationCommand` + handler (ownership) + ruta. | ídem. |
| 3 | Backend | E2E nuevos (§5.2): `Stores/MyStoresTests.cs` + `Stores/StoreActivationTests.cs`. | `dotnet test SMCA.WebApi.E2ETests` (solo specs nuevos + suite existente sin tocar). |
| 4 | Domain/frontend | Interface `OwnerStoreWithPlan` + service methods (+ eliminar muerto H-3). | `pnpm typecheck`. |
| 5 | Frontend | Ruta + menú + i18n + página + card + 2 popups (§2). | `pnpm typecheck`, `pnpm lint`. |
| 6 | Frontend | Unit tests de ruta/componentes (§5.3). | `pnpm test` (vitest). |
| 7 | Frontend | E2E nuevo spec (§5.4). | Playwright contra backend real. |
| 8 | Ambos | Suite completa de no-regresión (§8). | — |

---

## 5. Tests

### 5.1. Backend — unit/integration (Application.Tests, archivos nuevos)

`GetMyStoresQueryHandlerTests` (mocks: repo, mapper, httpContext, systemConfig, storePayment):

1. OwnerAdmin ⇒ usa `GetAllStoresByOwnerUserIdAsync(currentUser)` con `excludeStoreId = DefaultStore`.
2. No-OwnerAdmin (SuperAdmin/ReSeller/StoreUser) ⇒ `ApiException Forbidden`.
3. `nextDueDate`: tienda pago sin pagos ⇒ `PaymentStartDate + trial + 1 mes`.
4. `nextDueDate`: tienda pago con último pago ⇒ su `PaymentBeforeDate`.
5. `nextDueDate`: `paymentStartDate` null ⇒ null.
6. Modules mapeados desde el snapshot (no vacíos — H-1).

`SetStoreActivationCommandHandlerTests`:

1. OwnerAdmin + tienda propia ⇒ cambia `IsActive` (ambas direcciones).
2. OwnerAdmin + tienda ajena ⇒ Forbidden.
3. OwnerAdmin + DefaultStore ⇒ Forbidden.
4. Tienda inexistente ⇒ error NotFound.
5. SuperAdmin + cualquier tienda ⇒ cambia.
6. No-admin ⇒ Forbidden.

### 5.2. Backend — E2E (`SMCA.WebApi.E2ETests`, ARCHIVOS NUEVOS, cobertura del endpoint al 100%)

**`Stores/MyStoresTests.cs`** (persona OwnerAdmin fixture; siembra directa a BD como `StoresByCurrentUserTests`):

| # | Caso | Esperado |
| --- | --- | --- |
| M-01 | Sin token | 401 |
| M-02 | Login store-user | 403 |
| M-03 | Login reseller | 403 |
| M-04 | Login superadmin | 403 (decisión §7-A) |
| M-05 | Owner sin tiendas | 200 + `[]` |
| M-06 | Owner con 1 tienda activa | 200 + 1, `isActive: true` |
| M-07 | Owner con tienda **inactiva** | **aparece**, `isActive: false` (diferencia clave vs `by-current-user`) |
| M-08 | DefaultStore asignada al owner | excluida |
| M-09 | Tiendas de otro owner | no aparecen |
| M-10 | Snapshot módulos con precio/descuento | `modules[].price/currentPrice/discountText` = sembrado |
| M-11 | Tienda free (`paymentStartDate` null) | `nextDueDate: null` |
| M-12 | Tienda pago sin pagos | `nextDueDate = startDate + trial + 1 mes` (pin del `SystemConfiguration` trial) |
| M-13 | Tienda pago con `RegisterStorePayment` previo | `nextDueDate = PaymentBeforeDate` del último |
| M-14 | Tienda inactiva EN plan pago | sigue trayendo `nextDueDate` + módulos (el estado no altera el plan) |
| M-15 | `approved` | viaja correcto (true/false sembrado) |

**`Stores/StoreActivationTests.cs`:**

| # | Caso | Esperado |
| --- | --- | --- |
| A-01 | Sin token | 401 |
| A-02 | Login store-user | 403 |
| A-03 | Login reseller | 403 |
| A-04 | Owner activa su tienda inactiva | 200; re-lectura `{id}` ⇒ `isActive: true` |
| A-05 | Owner desactiva su tienda activa | 200; `{id}` ⇒ `isActive: false` |
| A-06 | Owner sobre tienda ajena | 403 |
| A-07 | Owner sobre DefaultStore | 403 |
| A-08 | Tienda inexistente | 404 |
| A-09 | Body sin `isActive` | 400 |
| A-10 | Owner desactiva y `by-current-user` | la tienda DESAPARECE del listado activo (regresión del flujo completo) |
| A-11 | Owner re-activa y `by-current-user` | la tienda REAPARECE |
| A-12 | SuperAdmin activa/desactiva cualquier tienda | 200 (paridad con `DELETE {id}`) |
| A-13 | Activar ya-activa (idempotencia) | 200 sin cambio |

### 5.3. Frontend — unit tests (vitest, archivos nuevos `__tests__/my-stores*.test.tsx`)

1. Render: card por tienda, nombre en header, gear presente.
2. Tienda inactiva ⇒ clase `bg-danger/10`/`border-danger` (patrón H-6) + badge "Inactiva".
3. Tipo de plan: free ⇒ "Plan Gratis", sin fecha, sin precio; pago ⇒ "Plan de Pago" + fecha + precio.
4. Precio con descuento ⇒ original `line-through` + actual con "USD"; sin descuento ⇒ sin tachado.
5. `nextDueDate` null en pago ⇒ no renderiza la línea de fecha.
6. Gear → "Editar" abre popup con nombre + checkbox activa prellenados.
7. Guardar edición ⇒ `updateStore` con nombre y (si cambió) `setStoreActivation`; refetch del listado.
8. Validación: nombre vacío ⇒ `STORES.NAME_REQUIRED`, no llama al service.
9. Gear → "Editar el plan" abre popup con PlanPicker merged; tienda free ⇒ botón "Activar este plan" visible; tienda pago + owner ⇒ NO visible (DG-7).
10. Guardar plan ⇒ `updateStore` con `moduleIds` completos (misma forma que `store-plan.tsx`).
11. Error del service ⇒ mensaje visible (mock reject).

### 5.4. Frontend — E2E (Playwright, **ARCHIVO NUEVO** `e2e/owner-stores.spec.ts`, persona `owner-admin`)

| # | Caso | Esperado |
| --- | --- | --- |
| E-01 | Login owner → menú "Mis tiendas" → navega | cards de sus tiendas visibles (data-testid `owner-store-card`) |
| E-02 | Tienda inactiva sembrada por BD | card con estilo inactivo |
| E-03 | Card free vs pago | "Plan Gratis" sin fecha/precio; "Plan de Pago" con ambos |
| E-04 | Próximo cobro | visible solo en pago, formato fecha |
| E-05 | Precio con descuento (módulos sembrados con `PercentDiscountPrice`) | tachado + precio actual |
| E-06 | Gear "Editar" → popup | nombre + checkbox activa; cambiar nombre + guardar ⇒ card refrescada con nombre nuevo (pin por re-lectura) |
| E-07 | Gear "Editar" → desactivar | card pasa a estilo inactivo (`setStoreActivation` ejercida real) |
| E-08 | Gear "Editar el plan" en tienda free | popup PlanPicker; activar plan pago + guardar ⇒ card pasa a "Plan de Pago" con próxima fecha (auto `PaymentStartDate`) |
| E-09 | Gear "Editar el plan" en tienda pago (owner) | PlanPicker sin botón "Activar este plan" (DG-7, espejo de `store-plan-lock-regression.spec.ts`) |
| E-10 | Guardar edición con error simulado (abort API) | mensaje de error visible, sin crash |

*(Sin tocar `login.spec.ts`, `store-plan-lock-regression.spec.ts`, ni ningún spec existente — regla CLAUDE.md.)*

---

## 6. Riesgos

- **R-1 — Desactivar la tienda seleccionada (`selectedStoreId`):** si el owner desactiva la tienda de su sesión, `by-current-user` deja de listarla y los feature gates por tienda pueden fallar. **Mitigación propuesta:** `confirmDialog` antes de desactivar (texto aviso); NO bloqueo backend (ver §7-C).
- **R-2 — N+1 de `nextDueDate`:** una query de pagos + una de configuración por tienda. Aceptable (decenas de tiendas máx.). Documentado en el handler.
- **R-3 — DG-7 edge:** owner activa plan pago en tienda free desde el popup ⇒ gasta su única activación (auto `PaymentStartDate`). Es el comportamiento existente de la vista del plan — el popup lo replica exacto (P3). El E2E E-08 lo fija.
- **R-4 — Ownership check del `UpdateStoreCommand` general:** sigue SIN verificar ownership (preexistente, fuera de alcance). El endpoint de activación NUEVO sí verifica. No relajar nada más.

---

## 7. Decisiones ABIERTAS (revisar antes de implementar)

| # | Decisión | Propuesta |
| --- | --- | --- |
| A | ¿`my-stores` admite SuperAdmin? | **403** — solo OwnerAdmin. El SuperAdmin ya tiene `/admin/stores`. Verificar flag exacto (`IsOwnerAdmin`) en `IHttpContextService`. |
| B | ¿Añadir ownership check al `UpdateStoreCommand` general? | **No** en este cambio (riesgo de regresión). Queda como deuda documentada; el endpoint nuevo de activación sí verifica. |
| C | ¿Bloquear desactivar la tienda seleccionada? | **No bloquear**; `confirmDialog` frontend con aviso claro. Alternativa (backend lee `MyStoreId` vía `SetMyStore`): más segura pero más alcance. |
| D | Ruta + label del menú | `/management/my-stores` + "Mis tiendas". Alternativas: `/owner/stores`, "Tiendas". |
| E | ¿Eliminar `activateStore` muerto (H-3)? | **Sí** — nadie lo usa y su ruta no existe. |
| F | ¿`activation` como PUT `{id}/activation` o POST con body? | **PUT `{id}/activation`** con `{ isActive }` — idempotente y REST-ish, espejo de `payment-date`. |

---

## 8. Checklist de no-regresión (correr al final)

**Backend:** `dotnet test backend/src/SMCA.sln` — suite existente verde + specs nuevos M-01..A-13.
**Frontend:** `pnpm lint` · `pnpm typecheck` · `pnpm test` (vitest) · `pnpm build` — todo verde.
**Intactos (sin diff):** `store-plan.tsx`, `store-list.tsx` (admin), `StoreCardList`, `update-store.tsx`/`edit-store.tsx`, todos los E2E existentes (backend y frontend), `login.spec.ts` y familia.
**Nuevo:** `e2e/owner-stores.spec.ts`, `Stores/MyStoresTests.cs`, `Stores/StoreActivationTests.cs`, `getMyStores`/`setStoreActivation` + eliminación de `activateStore`.
