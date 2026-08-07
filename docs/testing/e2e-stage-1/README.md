# Etapa 1 — Plan general

> Documento de **especificación de pruebas**, no de implementación. No modifica ni propone modificar ningún test existente.
>
> **Regla del proyecto (`CLAUDE.md`, innegociable)**: *"Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."* Agregar tests nuevos está permitido; tocar los existentes requiere autorización explícita. Donde este plan sugiere que un test existente debería cambiar, queda anotado como **nota para el usuario**, sin ejecutar nada.

Toda aserción de esta etapa está anclada a código leído, con `archivo:línea`. Nunca se rellenó un hueco con una aserción plausible: donde no se pudo verificar, se escribió el negativo o se dejó planteado como test a ejecutar.

Este fichero contiene **solo lo general y el estado**. El detalle de cada User Story —flujo, precondiciones y aserciones— vive en su fichero propio.

> **Trabajo diferido de backend**: [plan-backend.md](plan-backend.md) reúne lo que apareció en el servidor mientras se implementaba esta etapa — un test E2E vencido por calendario, otras 20 fechas hardcodeadas con la misma bomba, y el hueco de método que dejó pasar dos bugs de producción. Nada de eso se ejecuta sin decisión explícita.

---

## 1. Estado por User Story

Convención de estado:

- **CUBIERTO** — existe cobertura E2E real en esa capa para las aserciones del escenario.
- **PARCIAL** — hay cobertura, pero faltan aserciones declaradas.
- **PENDIENTE** — no existe ningún test E2E en esa capa.
- **N/A** — la capa no aplica, con la razón escrita en el fichero de la US.

Cobertura `vitest`/`jsdom` **no** cuenta como E2E frontend. Playwright es la única capa que corre navegador contra la app y la API real.

### Bloque A — Sesión y acceso

| US | Título | Prioridad | E2E frontend (Playwright) | E2E backend (.NET) |
|---|---|---|---|---|
| [S1-01](S1-01.md) | Auto-registro crea cuenta y tienda en un solo paso | CRÍTICA | **PARCIAL** — REQ-1…REQ-9 implementados (`e2e/register.spec.ts`, `e2e/register-rate-limit.spec.ts`); falta el destino post-registro | **CUBIERTO** |
| [S1-02](S1-02.md) | Login online | CRÍTICA | **PARCIAL** — REQ-1…REQ-7, REQ-9…REQ-16 implementados y verificados en vivo (`e2e/login.spec.ts`, 8 tests, backend real, 2026-08-07); REQ-8 (429) implementado y aislado (`e2e/login-rate-limit.spec.ts`) pero **NUNCA ejecutado** | **PARCIAL** — falta tienda inactiva → 403; el rate limit es inalcanzable bajo `Testing` (H-12) |
| [S1-03](S1-03.md) | Login offline en dispositivo aprovisionado | CRÍTICA | **PENDIENTE** | **N/A** — cero HTTP; la contraparte de servidor es S3-01 |
| [S1-04](S1-04.md) | Hidratación de sesión: la caché válida no llama al backend | CRÍTICA | **PARCIAL** — REQ-1…REQ-11 implementados (`e2e/login.spec.ts`, T1-T11, capability `e2e-session-hydration`); **corrida en vivo pendiente** (sdd-apply no tuvo backend disponible para ejecutar Playwright); la rama del 404 real de REQ-4 es brecha declarada (H-6) | **CUBIERTO** |

### Bloque B — Ciclo de vida de tienda y plan

| US | Título | Prioridad | E2E frontend (Playwright) | E2E backend (.NET) |
|---|---|---|---|---|
| [S2-01](S2-01.md) | DG-7 — El OwnerAdmin activa el plan pago una sola vez, en una sola dirección | CRÍTICA | **PENDIENTE** | **CUBIERTO** |
| [S2-02](S2-02.md) | Regresión DG-7 — el candado no puede volver a colgarse de `paymentStartDate` | CRÍTICA | **PENDIENTE** | **CUBIERTO** |
| [S2-03](S2-03.md) | Seguridad — un OwnerAdmin en `/management/stores/create` no puede crear una tienda | CRÍTICA | **PENDIENTE** | **PARCIAL** — `OwnerAdmin` sobre `POST /v1/stores` no tiene ningún test (H-10) |

### Bloque C — Gestión de usuarios

| US | Título | Prioridad | E2E frontend (Playwright) | E2E backend (.NET) |
|---|---|---|---|---|
| [S3-01](S3-01.md) | Exportar el roster de aprovisionamiento | ALTA | **PENDIENTE** | **CUBIERTO** |
| [S3-02](S3-02.md) | Crear cuenta StoreUser | ALTA | **PENDIENTE** | **CUBIERTO** |
| [S3-03](S3-03.md) | Listar, editar, activar y dar de baja usuarios | ALTA | **PENDIENTE** | **PARCIAL** — falta el aislamiento cross-store / cross-tenant (H-11) |

### Bloque D — Perfil propio

| US | Título | Prioridad | E2E frontend (Playwright) | E2E backend (.NET) |
|---|---|---|---|---|
| [S4-01](S4-01.md) | Editar el perfil propio | MEDIA | **PENDIENTE** | **CUBIERTO** |
| [S4-02](S4-02.md) | Cambiar la contraseña propia | ALTA | **PENDIENTE** | **CUBIERTO** |

### Invariante transversal

| US | Título | Prioridad | E2E frontend (Playwright) | E2E backend (.NET) |
|---|---|---|---|---|
| [AUTH-INV-01](AUTH-INV-01.md) | La expiración de autenticación debe ser 35 días | CRÍTICA | **N/A** — el refresh token no es observable desde la UI | **PENDIENTE** — 🔴 el test especificado **hoy falla**; el rojo es el defecto, no el test |

### Totales

12 User Stories + 1 invariante transversal.

- **E2E frontend**: 2 PARCIAL · 10 PENDIENTE · 2 N/A (S1-03 lo tiene solo en la capa de dato; AUTH-INV-01 no aplica).
- **E2E backend**: 8 CUBIERTO · 3 PARCIAL · 1 PENDIENTE · 1 N/A.

Ningún escenario está completo en ambas capas.

**Playwright hoy** (`frontend-react/e2e/`): `register.spec.ts` + `register-rate-limit.spec.ts` cubren S1-01, y `login.spec.ts` + `login-rate-limit.spec.ts` cubren S1-02 y S1-04 (T1-T11, capability `e2e-session-hydration`); `smoke.spec.ts` y `api-health.spec.ts` son infraestructura, no negocio. La corrida por defecto son 31 tests (`pnpm test:e2e`); los dos specs de rate-limit quedan fuera a propósito y corren con `pnpm test:e2e:rate-limit`.

**La fixture de sesión ya existe.** `signedInPage` (capacidad `e2e-session-fixture`) nació con S1-02 y es de lo que dependen los diez escenarios restantes: todos arrancan con "usuario autenticado" en sus precondiciones. Presupuesto vigente: **4 logins reales por corrida contra un techo de 5/min**, amortizados con `storageState`. Ese margen de uno es la restricción a respetar al escribir el próximo escenario.

**Rate limiting hoy**: `SMCA.WebApi.E2ETests/RateLimiting/RateLimitPoliciesTests.cs` tiene 4 tests (`:38,49,72,83`) y **todos** son de la política **Register**. La política **Login** no tiene ninguno. Y ninguno de los cuatro es de extremo a extremo: son unitarios de la fábrica de políticas, con el limitador construido a mano (`RateLimitPoliciesTests.cs:24-35`), porque bajo `Testing` el middleware ni se registra (**H-12**).

---

## 2. Propósito y alcance

### Qué es la Etapa 1

La Etapa 1 cubre **únicamente las operaciones que efectivamente cruzan la frontera hacia la API**. Es el subconjunto donde una prueba de extremo a extremo puede afirmar algo sobre el servidor y la base de datos.

### Qué queda FUERA, y por qué

| Fuera de alcance | Razón verificada |
|---|---|
| Productos, ventas, inventario, gastos, créditos, reportes, estadísticas | La app React es *offline-first*: esos dominios operan contra `localStorage` (cifrado en reposo con AES-GCM) y **no llaman a la API**. No hay dato de servidor que aseverar. |
| Sync export / import | Es un flujo **basado en archivos**: ZIP cifrado vía `@zip.js/zip.js`, descargado con un `<a download>`; el import entra por selector de archivos. **Cero llamadas HTTP**. No confundir con la exportación de *roster* (escenario S3-01), que sí es un `GET`. |
| `ERoles.ReSeller` y `ERoles.SuperAdmin` | Fuera de alcance por decisión de producto. Solo se mencionan como **notas de exclusión** cuando una pantalla es exclusiva de esos roles. |

**Prefijo de rutas.** El frontend construye rutas `\/v1/...` sobre `apiClient.baseURL = import.meta.env['API_URL'] ?? ''` (`frontend-react/apps/web-store-pos/app/shared/lib/http/api-client.ts:21-22`). La suite .NET E2E golpea `\/api/v1/...` (p. ej. `backend/src/SMCA.WebApi.E2ETests/Billing/StoreCreationTrialTests.cs:610`). En estos documentos se escribe la ruta como la ve cada capa.

---

## 3. Mapeo de personas — vocabulario del código

**No existe un rol `StoreOwner` en el código.** Verificado en `frontend-react/packages/domain/src/enums/index.ts:1-6`:

```
ERoles.SuperAdmin = 1
ERoles.OwnerAdmin = 2
ERoles.StoreUser  = 3
ERoles.ReSeller   = 4
```

| Cómo se lo nombra coloquialmente | Nombre real en el código | Cómo se detecta en runtime |
|---|---|---|
| "StoreOwner" / dueño de la tienda | **`ERoles.OwnerAdmin`** | `UserModel.isOwnerAdmin` (`frontend-react/packages/domain/src/models/auth.ts:47`) |
| "StoreUser" | **`ERoles.StoreUser`** — literal | Rol *hardcodeado* al crear una cuenta: `roleIds: [ERoles.StoreUser]` (`management/users/routes/user-create.tsx:49`) |

Ningún lector debe asumir que existe un rol `StoreOwner`. Cuando estos documentos dicen **OwnerAdmin**, se refieren a `ERoles.OwnerAdmin` / `isOwnerAdmin`.

**Matiz de autorización verificado** (`shared/lib/auth/authorization-service.ts:16-41`): ser OwnerAdmin **no** otorga acceso universal. `isUserAuthorized` exige, para un OwnerAdmin, que `user.featureIds` contenga alguno de los `featureIds` requeridos (línea 31). El único bypass total es `isSuperAdmin` (línea 26). Existe además un bypass más amplio en `featureLoader` (`auth/routes/loaders.ts:89-91`) que **no** se aplica a `adminFeatureLoader` ni a `resellerFeatureLoader` (comentario explícito en `loaders.ts:61-64`).

---

## 4. Las dos capas de aserción

Cada escenario declara **ambas**. Si una capa genuinamente no aplica, se escribe `— (no aplica)` con la razón en una cláusula.

### Playwright (UI)

Maneja el navegador contra la app corriendo + API real. Prueba **lo que el usuario ve y puede hacer**: redirecciones, módulos renderizados, estado visible, controles habilitados/deshabilitados, mensajes de error literales.

**Lo que NO prueba**: que el dato quedó bien persistido. Una UI puede mostrar "guardado" sobre un `SaveChangesAsync` que no escribió nada — trampa documentada en `CLAUDE.md` (`ApplicationDbContext` es `NoTracking` por defecto).

### .NET E2E (dato)

Suite en `backend/src/SMCA.WebApi.E2ETests/`, contra base de datos real (PostgreSQL `smca_test`; `WebAppFixture` aplica migraciones). Prueba **la verdad del dato**: campos persistidos, fechas, relaciones, estado de plan/trial computado.

**Lo que NO prueba**: que la pantalla lo muestre, que el botón exista, que el guard redirija. Precedente registrado en `CLAUDE.md`: 303 tests de integración pesaron más que 315 unitarios porque los mocks reproducían un mundo que la base de datos nunca produjo.

**Lo que ninguna de las dos prueba**: el comportamiento offline puro (`localStorage`), fuera de alcance de Etapa 1 por definición.

### Convención de marcas en los ficheros de US

🔴 = comportamiento defectuoso o riesgoso confirmado, el test lo documenta en vez de esconderlo · 🆕 = aserción sin cobertura hoy.

---

## 5. Hallazgos

Hechos con evidencia, encontrados al escribir esta etapa. No son recomendaciones.

### H-1 — Una tienda auto-registrada nace en plan **pago**, no gratuito

`RegisterCommand.cs:73,81-83` le pasa a `CreateStoreAsync` **todos** los ids de `GetAvailableModulesToStore()`. Ese filtro (`ModuleRepository.cs:17-23`) no discrimina por `PriceIncluded`: devuelve todo módulo activo y disponible para tienda. Por lo tanto la tienda recibe módulos pagos desde el minuto cero.

Confirmado contra base de datos real por un test ya existente: `Billing/StoreCreationTrialTests.cs:359-361` asevera `PlanType == "Paid"` para una tienda auto-registrada, con el comentario textual *"Module 6 'Estadísticas' passes GetAvailableModulesToStore's filter, so a self-registered store always receives at least one paid module."*

Consecuencia sobre DG-7: como `isOnPaidPlan = modules.some(m => !m.priceIncluded && m.selected)` (`store-form.tsx:83`), el candado engancha **inmediatamente** en toda tienda nacida del auto-registro. El recorrido "OwnerAdmin en plan gratuito activa el plan pago" **no es alcanzable por esa vía**. Ver [S2-01](S2-01.md).

### H-2 — El "35" son **cuatro constantes independientes**, más un quinto camino de lectura divergente

No hay una única fuente de verdad. Coinciden por configuración manual:

1. `Jwt.TokenLifetimeDays` en `appsettings.json:79` — consumida por `JwtProvider.cs:34` vía `JwtOptions`.
2. `Authentication.TokenLifetimeDays` en `appsettings.json:87` — consumida por `AuthenticationSettings.cs:11`.
3. Fila de base de datos `OfflineRosterTtlDays`, **mutable en runtime**, sembrada en `"35"` (`SystemConfigurationEntityTypeConfiguration.cs:38-39`), con fallback 35 en código (`SystemConfigurationRepository.cs:48-49`).
4. Constante *hardcodeada* en el frontend `THIRTY_FIVE_DAYS_MS` (`auth-store.ts:16`).

Y además, para **el mismo valor**, Login y Refresh leen **secciones distintas**:

- `LoginCommand.cs:63` → `_authTokenConfig.TokenLifetimeDays` (sección `Jwt`, vía `JwtAuthTokenConfig.cs:15`).
- `RefreshCommand.cs:80` → `_authSettings.TokenLifetimeDays` (sección `Authentication`).

Cambiar una sola de las dos secciones haría que login y refresh reporten expiraciones distintas sin ningún error.

### H-3 — El frontend nunca lee el `expiresIn` del servidor

El servidor **sí** lo devuelve: `AuthDto.ExpiresIn` (`Application/Dtos/Authentication/AuthDto.cs:6`), y el tipo del cliente lo declara (`packages/domain/src/models/auth.ts:10`). Pero `auth-store.ts:220` estampa el suyo:

```ts
const expiresIn = Date.now() + THIRTY_FIVE_DAYS_MS;
```

Un cambio futuro de la vida del token del lado del servidor **desincroniza el cliente en silencio**: no hay error, no hay warning; el cliente simplemente se cree autenticado hasta su propia fecha.

### H-4 — El bloqueo por inactividad de 1 hora **no es** la vida de la sesión

`shared/lib/offline/idle-timeout.ts:11` define `ONE_HOUR_MS = 3_600_000`, usado como default de `createIdleTimer`. Eso es **inactividad**: cierra por no usar la app. La vida de la sesión son los 35 días. Son dos relojes distintos y no deben confundirse en ninguna lectura de esta etapa.

### H-5 — `openspec/specs/billing/spec.md` está **desactualizado** respecto del código en la regla del candado

La tabla del spec (líneas 13-15) dice:

> `Activation | Set to DateOnly.FromDateTime(DateTime.UtcNow) on first paid-module add while null`
> `Lock | Once non-null, OwnerAdmin cannot change modules (plan is locked).`

El código ya no hace lo segundo. `CreateStoreService.cs:39-43` arranca el reloj **en toda** creación de tienda, y el candado del frontend se movió a `isOnPaidPlan` justamente porque el criterio del spec habría consumido la única activación del dueño al nacer la tienda (`store-form.tsx:72-82`). El backend, en cambio, **sí** conserva la activación-al-primer-módulo-pago (`UpdateStoreCommand.cs:91-97`) — que hoy solo alcanza a tiendas cuyo `PaymentStartDate` sea `null`, es decir, tiendas *legacy*.

Para DG-7 ese spec **ya no es la fuente de verdad**: la fuente vigente es el código más su comentario en `store-form.tsx:72-83`.

### H-6 — "Desactivar usuario" en la UI emite `DELETE`, no `activate(false)`

`user-list.tsx:72-73`:

```tsx
onActivate={(id) => handleLifecycleAction((userId) => userHttpService.activateUser(userId, true), id)}
onDeactivate={(id) => handleLifecycleAction(userHttpService.deleteUser, id)}
```

`POST /v1/users/activate` **solo** se invoca con `isActive: true`. La mitad `false` del endpoint existe en el servicio (`user-http-service.ts:52-57`) pero ninguna pantalla la alcanza. El `DELETE` correspondiente es un *soft delete* del lado servidor, así que el efecto neto es coherente — pero la cobertura E2E de `activate(false)` solo puede llegar por API directa, nunca por UI.

### H-7 — `adminFeatureLoader` **no** deja pasar a cualquier OwnerAdmin

`adminFeatureLoader` encadena `adminLoader` (exige `isSuperAdmin || isOwnerAdmin` — `loaders.ts:101-103`) **y luego** `featureGate`, que para un OwnerAdmin exige que `user.featureIds` contenga el feature pedido (`authorization-service.ts:31`). El bypass amplio de OwnerAdmin existe solo en `featureLoader` (`loaders.ts:89-91`) y está **deliberadamente aislado** de las cadenas admin/reseller (comentario en `loaders.ts:61-64`). Un OwnerAdmin sin la feature `Stores` es **deslogueado** al entrar a `/management/stores/create`, no simplemente redirigido.

### H-8 — Un fallo de autorización desloguea, no muestra "no autorizado"

`denyAccess()` llama `logout()` **y** redirige a `/login` (`loaders.ts:16-19`). No existe una ruta `/unauthorized`. Cualquier escenario de Playwright que espere un mensaje de "acceso denegado" fallará: el resultado observable es **pérdida de sesión**.

### H-9 — El campo `email` del registro no tiene validación de cliente

`register.tsx:63-89` valida `fullName`, `login`, `cellPhone`, `storeName`, `password` y `passwordConfirmation`. No hay rama para `email`. Un registro con email vacío llega a la API. (En el backend, `RegisterCommand` declara `string? Email` — `RegisterCommand.cs:21`.)

### H-10 — 🔴 El backend **permite** que un OwnerAdmin cree tiendas; la única barrera es un accidente del frontend

Este es el hallazgo más serio del relevamiento.

Tres hechos encadenados:

1. `POST /v1/stores` **no lleva `[HasPermission]` a nivel de acción** (`SMCA.WebApi/Controllers/v1/StoresController.cs:83-85`), a diferencia de sus vecinos `DELETE /{id}` (`:129`) y `PUT /{storeId}/payment-date` (`:112`), que sí llevan `[HasPermission(StoreRoleFeatures.SuperAdmin)]`. Por lo tanto aplica el atributo de clase, que admite `StoresAdmin` además de `SuperAdmin` (`StoresController.cs:27`).
2. El handler admite explícitamente al OwnerAdmin: `if (!_httpContextService.IsSuperAdminOrOwnerAdmin) throw new ApiException(NotAuthorized, BadRequest)` (`Application/Features/StoreManagement/Stores/Commands/CreateStore/CreateStoreCommand.cs:50-51`), con `IsSuperAdminOrOwnerAdmin => IsSuperAdmin || IsOwnerAdmin` (`HttpContextService.cs:50`).
3. Hay una rama **escrita a propósito para el OwnerAdmin**: al crear, se le reapunta el `SelectedStoreId` a la tienda nueva (`CreateStoreCommand.cs:57-61`). Nadie escribe eso por accidente.

Conclusión: la creación de tiendas por un OwnerAdmin está **habilitada en el servidor**. Lo único que hoy la impide en la práctica es que la pantalla nunca entra en modo creación, por el colapso `paramId ?? user?.selectedStoreId ?? ''` + `Boolean(storeId)` (`edit-store.tsx:33-34`) — una protección **emergente, no diseñada**. Un `curl` con el token de un OwnerAdmin la esquiva por completo.

Nota adicional: el rechazo del handler devuelve **400 BadRequest**, no 403 (`CreateStoreCommand.cs:51`), divergiendo de los demás guards de este controlador.

### H-11 — `PUT /v1/users/{id}` no tiene scoping por tienda, ni en el cliente ni en el handler

**Cliente**: `/management/users/edit/:id` toma el id de la URL y llama `getUserById` sin comprobar pertenencia alguna (`user-edit.tsx:21,32-47`). No hay filtro por tienda.

**Servidor**: el handler tiene exactamente un guard, y es de rol, no de pertenencia:

```csharp
if (request.Id != _httpContextService.UserExternalId.ToGuid() && !_httpContextService.IsSuperAdminOrOwnerAdmin)
    return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);   // UpdateUserCommand.cs:49-50
```

Traducido: *"o sos vos mismo, o sos admin"*. Ningún OwnerAdmin es rechazado por editar a un usuario de otra tienda. Lo único que podría frenarlo es el filtro global de tenant sobre `User` (`UserEntityTypeConfiguration.cs:22-24`), pero la búsqueda entra por `FindAsync` (`GenericRepository.cs:82-85`) — **no se determinó por lectura si ese camino aplica el filtro**, y por eso [S3-03](S3-03.md) lo plantea como aserción a resolver empíricamente, no como afirmación.

Lo que sí queda establecido por lectura: **el aislamiento por tienda no existe como regla explícita en ninguna capa**. Si funciona, funciona por efecto colateral del tenant, no por diseño.

### H-12 — El rate limiting está **apagado** en el entorno de pruebas

`Program.cs:110` y `:156` envuelven tanto `AddRateLimiter` como `UseRateLimiter` en `if (!Environment.IsEnvironment("Testing"))`. La suite E2E corre precisamente bajo ese entorno (`SMCA.WebApi.E2ETests/Infrastructure/WebAppFixture.cs:25` lo menciona explícitamente al justificar por qué aplica migraciones a mano).

Consecuencia: las ramas 429 del frontend (`register.tsx:137-138`, `login.tsx:175-176`) **no son alcanzables desde la suite .NET E2E**. Solo pueden probarse en Playwright contra un entorno no-`Testing`.

Los umbrales están **hardcodeados**, no configurados (`SMCA.WebApi/PolicyCode/RateLimitPolicies.cs`):

| Política | Límite | Ventana | Segmentos | Cola | Partición |
|---|---|---|---|---|---|
| `LoginPolicy` (`:15-24`) | 5 | 1 min | 3 | 0 | IP remota |
| `RegisterPolicy` (`:26-35`) | 10 | 10 min | 10 | 0 | IP remota |

Aplicadas vía `[EnableRateLimiting("LoginPolicy")]` (`AuthController.cs:27`) y `[EnableRateLimiting("RegisterPolicy")]` (`AuthController.cs:102`). `RejectionStatusCode = 429` (`Program.cs:114`). La partición es por **IP**, no por login: varios usuarios detrás de un mismo NAT comparten cupo.

### H-13 — `POST /v1/auth/refresh` y `POST /v1/auth/revoke` existen y no tienen rate limit

`AuthController.cs:44` (`refresh`) y `:57` (`revoke`) no llevan `[EnableRateLimiting]`, a diferencia de `login` y `register`. Sumado a que `refresh` no tiene ningún test E2E (ver [AUTH-INV-01](AUTH-INV-01.md)), es superficie sin cobertura ni límite.

---

## 6. ⚠️ No verificado

**Los 8 huecos de la primera versión de esta etapa fueron cerrados.** Queda cero ítems abiertos.

Bitácora de cierre, para que el próximo lector sepa qué se resolvió y dónde vive ahora:

| # | Hueco original | Resolución | Dónde quedó |
|---|---|---|---|
| 1 | Rechazo de `POST /v1/stores` para OwnerAdmin | **Negativo documentado**: el backend NO lo rechaza | [S2-03](S2-03.md) (aserciones 🔴) + **H-10** |
| 2 | `Store.Inactive` → 403 | **Negativo documentado**: el mapeo existe, ningún test lo cubre | [S1-02](S1-02.md) (aserción 🆕) |
| 3 | Contenido de `StoreAuthorizationTests` / `StoreCreateTests` / `StoreRoleAccessTests` | **Leídos completos**: 15 tests catalogados | Estado de cobertura de [S2-01](S2-01.md) y [S2-03](S2-03.md) |
| 4 | Scoping por tienda en `/management/users/edit/:id` | **Negativo documentado**: no existe en el cliente ni en el handler | [S3-03](S3-03.md) (aserciones 🔴/🆕) + **H-11** |
| 5 | `resolveUserHomePath` | **Resuelto**: dos ramas, tabla completa por persona | [S1-02](S1-02.md) (tabla + 6 aserciones), [S1-01](S1-01.md), [S1-03](S1-03.md) |
| 6 | Formato de `serializeRoster` | **Resuelto**: ZIP AES de una entrada, password `${master}${storeId}` | [S3-01](S3-01.md) (5 aserciones) |
| 7 | Umbrales de rate limiting | **Resuelto**: login 5/1min, register 10/10min, por IP, hardcodeados | [S1-01](S1-01.md), [S1-02](S1-02.md) + **H-12**, **H-13** |
| 8 | ¿`GET /v1/stores/{id}` devuelve solo módulos activos? | **Resuelto y la suposición del frontend SE SOSTIENE** | [S2-01](S2-01.md) (bloque "De dónde sale cada mitad") |

### Una sola incógnita deliberada, planteada como test y no como afirmación

En [S3-03](S3-03.md), la aserción sobre **aislamiento cross-tenant de `PUT /v1/users/{id}`** queda escrita como pregunta a responder ejecutando el test, no como afirmación. Lo que **sí** está verificado por lectura es lo estructural: el handler no tiene guard de tienda ni de tenant (`UpdateUserCommand.cs:49-50`) y la búsqueda entra por `FindAsync` (`GenericRepository.cs:82-85`). Lo que **no** se determinó leyendo es si ese camino de acceso aplica el filtro global de tenant de `User` (`UserEntityTypeConfiguration.cs:22-24`). Es una semántica del ORM, no del código de este repo, y se prefiere que la conteste una corrida real contra base antes que afirmarla.

---

## 7. Cómo correr cada capa

```bash
# E2E backend (.NET) — requiere PostgreSQL en localhost:5432, base smca_test
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj

# E2E frontend (Playwright)
# ver frontend-react/e2e/README.md
```
