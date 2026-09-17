# Plan: refresco de permisos y menús tras cambiar el plan de una tienda

**Fecha:** 2026-09-15
**Estado:** Propuesto. Implementación NO iniciada. Los tests E2E (backend y frontend) requieren **autorización explícita** del usuario antes de escribirse (regla innegociable), y el arreglo obliga a **modificar una aserción E2E existente** (ver §6).

## 1. Objetivo

Cuando el owner cambia el plan de una tienda (subir o bajar), el usuario autenticado debe quedar con los permisos del plan nuevo y el menú debe mostrar las entradas correspondientes a ese plan, sin necesidad de cerrar sesión y volver a entrar.

## 2. El problema, en simple

El servidor hace bien su parte: al cambiar el plan reescribe los módulos de la tienda y las features de sus roles, y cada petición vuelve a calcular los permisos en vivo. Si alguien pregunta, la respuesta ya es la correcta.

El problema está en el navegador. Cuando el cambio de plan termina, la app pide "refrescar la sesión"… pero esa función, si ya hay un perfil guardado con el mismo token, **devuelve el perfil guardado sin preguntarle al servidor**. Y un cambio de plan no cambia el token. Resultado: los permisos que el menú usa siguen siendo los viejos, y el menú sigue mostrando el plan anterior. Lo mismo pasa tras recargar la página, porque la recarga toma el mismo atajo. Solo un logout + login lo actualiza.

En una frase: **el botón que iba a refrescar los permisos no refresca nada, y el menú queda congelado en el plan viejo.**

## 3. Causa raíz candidata

`getUserByToken()` — la única acción que los dos handlers de cambio de plan invocan para "refrescar la sesión" — retorna el perfil cacheado sin tocar la red cuando `cachedProfile.authToken === AUTH_MODEL.authToken`, condición que un cambio de plan nunca altera porque `POST .../change-plan` no emite token nuevo. Los campos `featureIds` / `storeModuleIds` / `roles[].featureIds` que alimentan el menú quedan por lo tanto describiendo el plan anterior.

**Estado epistémico: CONFIRMADO POR LECTURA DE CÓDIGO + ASERCIÓN E2E EXISTENTE; NO REPRODUCIDO EN EJECUCIÓN.** Falta el repro en vivo (§7).

## 4. Evidencia

### 4.1 Frontend — el atajo por caché

| Hecho | Ubicación |
|---|---|
| `getUserByToken()` tiene 4 salidas; la única que llama a `/me` es la de "no hay caché usable" | `apps/web-store-pos/app/shared/lib/stores/auth-store.ts:134-229` |
| Salida por caché: si `cachedProfile.authToken === auth.authToken`, hace `set(...)` y `return` **sin red** | `auth-store.ts:160-177` (comentario deliberado en `:167-171`) |
| `AUTH_MODEL` solo lo escriben `setUser` (login/loginOffline) y `updateUser`; un cambio de plan no lo toca | `auth-store.ts:241-244`, `:255-258` |
| Los dos handlers de cambio de plan llaman `getUserByToken()` esperando un refresco | `management/stores/routes/my-stores.tsx:187-192`, `management/stores/routes/store-plan.tsx:93-97` |
| El menú se re-renderiza si `user` cambia, y filtra por `featureIds` | `shared/components/sidebar.tsx:17-31` |
| `isUserAuthorized` decide con `user.featureIds` (OwnerAdmin/ReSeller) o `roles[].featureIds` (StoreUser) | `shared/lib/auth/authorization-service.ts:16-41` |
| Un E2E ya pinea el atajo | `frontend-react/e2e/store-plan-activation.spec.ts:175` → `loginNetwork.expectMeRequestCount(0)` |

### 4.2 Backend — correcto y en vivo (no es el problema)

| Hecho | Ubicación |
|---|---|
| Endpoint del owner | `SMCA.WebApi/Controllers/v1/StoresController.cs:248-257` |
| El handler reescribe `StorePlanId`, `StoreModules` (soft-delete/insert/reactivación) y `StoreRoleFeatures`; el ancla de pago nunca se toca | `Application/Features/StoreManagement/Stores/Commands/ChangeStorePlan/ChangeStorePlanCommand.cs:83-245` |
| `/me` recalcula módulos y features **por request**, sin caché | `Application/Features/Authentication/Queries/GetMe/GetMeQuery.cs:103-117` |
| El chequeo de permisos también es en vivo | `SMCA.WebApi/Filters/HasPermissionAttribute.cs:86-101` |
| Ya existen E2E que prueban plan + `/me`, pero **solo por `toggle-plan` de SuperAdmin** | `SMCA.WebApi.E2ETests/Auth/AuthMePlanModulesTests.cs:144` (upgrade), `:185` (downgrade) |

Conclusión: el servidor entrega el estado correcto de inmediato en ambas direcciones; nadie se lo pide.

## 5. Restricciones canónicas que el arreglo debe respetar

| Spec | Qué fija | Implicación |
|---|---|---|
| `openspec/specs/e2e-session-hydration/spec.md:38` (REQ-1) | Con `AUTH_MODEL` vigente y `cachedProfile.authToken` coincidente, un `page.reload()` MUST producir **cero** `GET /v1/auth/me` | **Prohíbe** el arreglo ingenuo de hacer que `getUserByToken()` llame siempre a `/me`: rompería offline-first |
| `openspec/specs/management-stores/spec.md:91-97` (Soft Refresh After Update) | Tras actualizar una tienda, el sistema MUST refrescar al usuario vía **`getMe()` + `updateUser`**, sin recargar la página | Es la descripción canónica del arreglo correcto; hoy la implementación no la cumple |
| `openspec/specs/e2e-store-plan-activation-ui/spec.md:68-76` (REQ-5) | El "refresco de sesión" tras guardar MUST NOT emitir ningún `/me` (corregido el 2026-08-08, **H-17**, para reflejar el atajo) | **Contradice** a la spec anterior. El arreglo implica actualizar este requisito y su aserción E2E |
| `openspec/specs/sidebar-navigation/spec.md:57-79` | La visibilidad de cada ítem sigue `isUserAuthorized` sobre `featureIds`, sin lógica nueva | El arreglo va en la **fuente** de `user`, nunca en el sidebar |
| `openspec/specs/auth-session/spec.md:97-117` | Único `getUserByToken()` consolidado; la revalidación MUST preservar `expiresIn` | Mantener la firma y la seam |
| `CLAUDE.md:93-100` | Invariante: una sesión válida NUNCA debe aterrizar en `/login`; tocar la hidratación de `auth-store` exige releer `docs/contracts/authenticated-session-redirect.md` y aprobación explícita | El `/me` nuevo no debe poder destruir una sesión válida |

## 6. Solución propuesta

### 6.1 El arreglo

Añadir una acción de **refresco suave** reutilizable — `getMe()` seguido de `updateUser(fresh)` — y usarla en los flujos que hoy llaman `getUserByToken()` esperando un refresco real. Es el patrón que **ya existe** en `shared/lib/stores/switch-store.ts:43,67` y el que la spec `management-stores` ya exige.

En concreto:

- Nuevo `softRefreshSession()` en `apps/web-store-pos/app/shared/lib/stores/` (o acción equivalente en `auth-store`): llama a `authHttpService.getMe()` y, con la respuesta, `updateUser(freshUser)`.
- **Best-effort y sin daño:** si el refresco falla por red, se conserva el usuario cacheado (nada de logout); solo un rechazo de sesión explícito mantiene el camino actual.
- **No se toca** `getUserByToken()`: su atajo por caché sigue intacto, así que REQ-1 (reload = cero `/me`) y el comportamiento offline-first se preservan.
- Se reemplaza la llamada en `my-stores.tsx` (`handlePlanActivate`) y en `store-plan.tsx` (`handleActivate`). El menú se actualiza solo: `sidebar.tsx` ya consume `useAuthStore()`, y ningún filtro nuevo se agrega.

### 6.2 Documentación normativa que acompaña al cambio

- Actualizar `openspec/specs/e2e-store-plan-activation-ui/spec.md` REQ-5 (y su nota H-17) para que diga lo correcto: el refresco tras un cambio de plan **sí** emite un `/me` acotado, mientras que el reload con caché válida sigue sin emitir ninguno.
- Alinear `management-stores/spec.md` con la implementación resultante (ya describe el comportamiento correcto).

### 6.3 Alcance

El brief pide el cambio de plan. El mismo atajo roto afecta además a otros cuatro call sites (`my-stores.tsx:130` activación de tienda, `:165` creación de tienda, `edit-store.tsx:146` edición de tienda, y el gate MultiStores de `my-stores.tsx:37`). **Decisión abierta para el usuario** (§9).

## 7. Tests propuestos

**Regla:** primero el test que reproduce (en rojo contra el código actual), después el arreglo. Todos los E2E requieren autorización previa.

### 7.1 E2E backend (proyecto `SMCA.WebApi.E2ETests`)

Se piden nuevos, en el patrón existente (`[Collection("e2e")]`, `WebAppFixture`, `DbTestHelpers.AuthedClient`).

| # | Test propuesto | Qué prueba | Hueco que llena |
|---|---|---|---|
| B1 | `change-plan` del owner (con **el mismo token**) → `GET /v1/auth/me`: en **upgrade**, `FeatureIds` incluye las features del plan nuevo (afirmación **positiva**, no solo `StoreModuleIds`) y `roles[].featureIds` es acorde; en **downgrade**, desaparecen | Que `/me` entrega los permisos nuevos inmediatamente, en ambas direcciones, por el camino del **owner** (`change-plan`), no solo por `toggle-plan` de SuperAdmin | Hoy el par (plan, `/me`) solo existe con `toggle-plan`, y el upgrade no afirma `FeatureIds` en absoluto |
| B2 | Flip en endpoint gateado con el **mismo token**: un endpoint protegido por una feature que el plan retira pasa de **200 → 403** (downgrade) y de **403 → 200** (upgrade), sin relogin | Que el enforcement server-side cambia al instante por efecto del plan | **Cobertura cero hoy** |
| B3 | Un **StoreUser** (no owner) de la tienda hace `/me` tras el `change-plan` y ve `roles`/`featureIds` actualizados | Que el efecto alcanza a los usuarios de la tienda, no solo al owner | Hoy solo hay aproximaciones por roster, con semántica distinta |

Opcional si se quiere cerrar más el círculo: B4 — la lista de módulos activos de la tienda (`StoreModuleIds` en `/me` y/o BD) coherente con B1/B2 en la misma corrida.

### 7.2 E2E frontend (`frontend-react/e2e/`)

| # | Test propuesto | Qué prueba | Naturaleza |
|---|---|---|---|
| F1 | Tras `change-plan` en la **tienda seleccionada**, abrir el sidebar y afirmar que una entrada gateada por el módulo **agregado aparece** y una del módulo **retirado desaparece**, sin `reload` | El eslabón realmente roto: la sesión del cliente y el menú | **Nuevo** (no existe ningún E2E de menú × plan) |
| F2 | Tras el cambio, el conteo de `GET /v1/auth/me` es **exactamente uno** | Que el refresco suave ocurrió (y que no se disparan `/me` de más) | **Modifica una aserción existente**: `e2e/store-plan-activation.spec.ts:175` hoy exige **cero** |

F1 puede apoyarse en el helper de sidebar que ya existe en `e2e/warehouses.spec.ts:652-676` (`a[href="/inventory/warehouses"]`), y los flujos de plan ya están montados en `e2e/owner-plan-change-dialog.spec.ts` y `e2e/store-plan-activation.spec.ts`.

### 7.3 Unit (sin permiso especial; no son E2E)

- `auth-store` / el nuevo `softRefreshSession`: que llame a `getMe()` y aplique `updateUser`, que preserve `expiresIn`, y que un fallo de red **no** cierre sesión.
- Que `getUserByToken()` siga tomando el atajo por caché (regresión de REQ-1 a nivel unitario).
- Actualizar los mocks de `my-stores.test.tsx` / `store-plan.test.tsx` que hoy verifican que se llama `getUserByToken()`.

## 8. Verificación prevista

- Backend: `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~SMCA.WebApi.E2ETests.Auth"` y las clases nuevas por separado, con PostgreSQL en `localhost:5432` (BD `smca_test`).
- Frontend: `npx vitest run` de las suites tocadas + `pnpm run typecheck` desde `apps/web-store-pos`; y los specs E2E nuevos por `--grep`.
- Todo con comando exacto, código de salida y salida relevante.

## 9. Decisiones abiertas para el usuario

1. **Autorización de E2E**, en especial F2, que **cambia una aserción existente** (cero `/me` → un `/me`) y obliga a actualizar REQ-5 de la spec.
2. **Alcance**: ¿solo el cambio de plan, o también los otros cuatro call sites con el mismo defecto (crear/editar/activar tienda y el gate MultiStores)?
3. Si se autoriza el alcance amplio, ¿un solo cambio o dos entregas separadas?

## 10. Fuera de alcance

- Notificar en vivo a **otros usuarios/otras pestañas** de la tienda sin recargar (no hay canal push; la convergencia ocurre al siguiente login o al refresco suave cuando ese usuario ejecute una mutación).
- Cambios en el contrato del endpoint de cambio de plan.
- Reemplazar el atajo por caché de `getUserByToken()` (violaría REQ-1 y offline-first).
