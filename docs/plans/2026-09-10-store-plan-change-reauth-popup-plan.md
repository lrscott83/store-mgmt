# Plan: Impacto de cambio de plan + popup de re-autenticación (roster)

**Fecha:** 2026-09-10
**Estado:** Aprobado (solo documento del plan — la implementación queda pendiente de una orden explícita)

## Objetivo

Tras cambiar el plan/módulos de una tienda, mostrar al admin que ejecutó el cambio un popup indicando que **todos los usuarios de esa tienda deben volver a autenticarse para acceder al roster**. Sin logout forzado de otros usuarios: el servidor ya aplica los nuevos permisos en vivo y los clientes convergen al recargar o re-login (análisis abajo).

## Análisis de impacto

### Backend — enforcement inmediato, sin agujero de seguridad

- `UpdateStoreCommandHandler` (`Application/Features/StoreManagement/Stores/Commands/UpdateStore/UpdateStoreCommand.cs`) reescribe `StoreModules` y `StoreRoleFeatures`: desactiva los removidos, re-activa/crea los agregados.
- **Cada chequeo server-side es en vivo**: `HasPermissionAttribute` (`SMCA.WebApi/Filters/HasPermissionAttribute.cs`) y `GetMeQueryHandler` (`Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs`) consultan módulos/billing/features por request. El nuevo plan se aplica en la API al instante — un usuario con una feature removida recibe `403` ya, sin esperar nada.

### Cliente — snapshot vieja hasta converger (solo cosmético)

- Cada tab logueada cachea su snapshot de autorización en el `UserModel` persistido (`AUTH_MODEL` en localStorage + zustand): `featureIds`, `roles[].featureIds`, `storeModuleIds`, `planType`, `paymentStatus`. No hay canal push (SignalR/WebSocket no existe en la app).
- Puntos de convergencia existentes: carga completa de página (los loaders de auth llaman `getUserByToken()` → `/me` fresco) y los refresh de sesión ya codificados tras estas mismas mutaciones (`store-plan.tsx`, `my-stores.tsx`, `edit-store.tsx` llaman `getUserByToken()` después de guardar) — pero eso refresca **solo al usuario que ejecuta**, no a los demás.
- Consecuencia práctica para los otros usuarios: desactualización cosmética del menú hasta su próximo reload/login. Peor caso real: clickean un ítem de menú ya removido y reciben un `403` de la API.

### ¿Desloguear a los usuarios autenticados? — No (decisión)

1. El servidor aplica el nuevo set de permisos al instante (queries vivas), el logout forzado no agrega seguridad.
2. Los clientes convergen igual en reload/próximo login.
3. Un logout forzado por tienda requeriría infraestructura inexistente: blacklist de tokens con scope de tienda o contador de generación de sesión validado en `/me`, más una reacción del cliente a esa señal. Desproporcionado para este cambio (YAGNI).

### El roster offline — el único gap real

- El bundle de roster (`OfflineRosterUser`, `frontend-react/apps/web-store-pos/app/shared/lib/offline/roster-types.ts`) lleva por usuario `roles`, `featureIds` y `storeModuleIds`, se exporta **por tienda** y vive en cada dispositivo.
- Un cambio de plan vuelve stale todo roster ya exportado de esa tienda — y **un re-login online NO refresca el archivo de roster**: se refresca re-exportando (página Users) y re-importando en los dispositivos.
- Por eso el texto del popup menciona explícitamente el roster: la re-autenticación sola no repara el roster, pero es el momento en que el usuario percibe que su acceso cambió; el re-export queda como paso operativo del manager.

## Dónde ocurre un cambio de plan en la UI

Solo estas dos rutas envían `moduleIds` (activación inmediata por panel):

| Ruta | Función | Flujo actual |
|---|---|---|
| `management/stores/routes/store-plan.tsx` | `handleActivate` | `updateStore` → `getUserByToken()` → re-read del plan |
| `management/stores/routes/my-stores.tsx` | `handlePlanActivate` | `updateStore` → cerrar modal → `getUserByToken()` → toast → `load()` |

Los guardados solo de datos (`edit-store.tsx`, renombrar en `my-stores.tsx`) omiten `moduleIds` — **no** son cambios de plan y no muestran el popup.

## Cambios propuestos (solo frontend — sin cambio de backend ni de contrato API)

### 1. `app/management/stores/routes/store-plan.tsx`
- En `handleActivate`, tras el `updateStore` exitoso (y antes del refresh de sesión), mostrar el popup con `showBlockingInfo(title, message)` de `shared/lib/blocking-alert.ts` (bloqueante, solo OK, icono info — el wrapper estándar de la app para este shape):
  - Título: `STORES.PLAN.CHANGED_TITLE`
  - Mensaje: `STORES.PLAN.CHANGED_MESSAGE`

### 2. `app/management/stores/routes/my-stores.tsx`
- Mismo popup en `handlePlanActivate`, tras el `updateStore` exitoso.
- Suprimir el toast genérico `STORES.UPDATE_SUCCESS` en ese camino — el popup es el feedback.

### 3. `app/shared/lib/i18n/es.ts`
- `STORES.PLAN.CHANGED_TITLE: 'Plan actualizado'`
- `STORES.PLAN.CHANGED_MESSAGE: 'Todos los usuarios de esta tienda deben volver a autenticarse para acceder al roster.'`

### No se muestra para guardados solo de datos
`edit-store.tsx` y renombrar en `my-stores.tsx` omiten `moduleIds` — no son cambios de plan.

## Tests previstos (solo unitarios — E2E intocados, regla innegociable)

- `store-plan.test.tsx`: al activar un plan se muestra el popup de re-autenticación del roster.
- `my-stores.test.tsx`: al activar plan se muestra el popup; al renombrar (solo datos) NO se muestra.
- Mock de `shared/lib/blocking-alert` con el patrón existente de esas suites.

## Verificación prevista

- `npx tsc --noEmit` + suites vitest objetivo, luego `pnpm typecheck` / `pnpm test` desde `frontend-react/`.
- Backend intacto: sin build/tests (no hay cambio de contrato).

## Pendiente de decisión futura (fuera de alcance)

- **Recordatorio de re-export del roster**: el re-login online no refresca el archivo de roster; el manager debería re-exportarlo desde Users. Puede agregarse una segunda línea al popup o un prompt de re-export.
- **Logout forzado real** requeriría blacklist por tienda / contador de generación en `/me` — desaconsejado por ahora (el enforcement del servidor ya es en vivo).
