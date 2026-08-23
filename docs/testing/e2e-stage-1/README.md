# Etapa 1 — Plan general

> Documento de **especificación de pruebas**, no de implementación. No modifica ni propone modificar ningún test existente.
>
> **Regla del proyecto (`CLAUDE.md`, innegociable)**: *"Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."* Agregar tests nuevos está permitido; tocar los existentes requiere autorización explícita. Donde este plan sugiere que un test existente debería cambiar, queda anotado como **nota para el usuario**, sin ejecutar nada.

Toda aserción de esta etapa está anclada a código leído, con `archivo:línea`. Nunca se rellenó un hueco con una aserción plausible: donde no se pudo verificar, se escribió el negativo o se dejó planteado como test a ejecutar.

Este fichero contiene **solo lo general y el estado**. El detalle de cada User Story —flujo, precondiciones y aserciones— vive en su fichero propio.

> **Trabajo diferido**, uno por capa: [plan-frontend.md](plan-frontend.md) reúne lo abierto en Playwright — un flake sin causa raíz, una guarda que el navegador no puede discriminar y dos brechas declaradas. [plan-backend.md](plan-backend.md) reúne lo que apareció en el servidor mientras se implementaba esta etapa — el hueco de método que dejó pasar dos bugs de producción, el vencimiento por calendario de `ToCollectTests` (**ya resuelto** en `fb273edb` con pin de reloj) y las demás fechas hardcodeadas (**pineadas en su mayoría** durante `store-creation-trial` y el roster offline). Nada de lo que queda abierto se ejecuta sin decisión explícita.

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
| [S1-01](S1-01.md) | Auto-registro crea cuenta y tienda en un solo paso | CRÍTICA | **CUBIERTO** — REQ-1…REQ-9 + F-2 implementados (`e2e/register.spec.ts`, `e2e/register-rate-limit.spec.ts`); F-2 verifica destino post-registro `/sales/products` | **CUBIERTO** |
| [S1-02](S1-02.md) | Login online | CRÍTICA | **CUBIERTO** — REQ-1…REQ-16 implementados y verificados en vivo contra backend real el 2026-08-07 (`e2e/login.spec.ts`; REQ-8/429 en `e2e/login-rate-limit.spec.ts`, que corre aparte con `pnpm test:e2e:rate-limit`) | **CUBIERTO** — tienda inactiva → 403 cubierta (`AuthLoginFailureTests.cs:64`); **429 ahora alcanzable en .NET** tras fix H-12 (2026-08-23): `Program.cs` ya no excluye `AddRateLimiter`/`UseRateLimiter` bajo `Testing`. Login subió a 40/min para dar margen a la suite paralela. |
| [S1-03](S1-03.md) | Login offline en dispositivo aprovisionado | CRÍTICA | **CUBIERTO** — 11 tests / 12 aserciones implementados y verificados el 2026-08-08 sin backend levantado (`e2e/login-offline.spec.ts`), corre en la suite por defecto | **N/A** — cero HTTP; la contraparte de servidor es S3-01 |
| [S1-04](S1-04.md) | Hidratación de sesión: la caché válida no llama al backend | CRÍTICA | **CUBIERTO** — T1-T11 verificados en vivo (`e2e/login.spec.ts`, backend real). Brechas G1/G2 declaradas y cubiertas por .NET E2E (`AuthMeDeactivationTests.cs`) y vitest (`auth-store.test.ts`) | **CUBIERTO** |

### Bloque B — Ciclo de vida de tienda y plan

| US | Título | Prioridad | E2E frontend (Playwright) | E2E backend (.NET) |
|---|---|---|---|---|
| [S2-01](S2-01.md) | DG-7 — El OwnerAdmin activa el plan pago una sola vez, en una sola dirección | CRÍTICA | **CUBIERTO** — 11 aserciones, 2 tests (`e2e/store-plan-activation.spec.ts`); G1 (rama `succeeded===false` no cubierta) y G2 (`Stores=73` sin re-observar tras la degradación) quedan declaradas, no disfrazadas | **CUBIERTO** |
| [S2-02](S2-02.md) | Regresión DG-7 — el candado no puede volver a colgarse de `paymentStartDate` | CRÍTICA | **CUBIERTO** — 3 aserciones (`e2e/store-plan-lock-regression.spec.ts`) | **CUBIERTO** |
| [S2-03](S2-03.md) | Seguridad — un OwnerAdmin en `/management/stores/create` no puede crear una tienda | CRÍTICA | **CUBIERTO** — 2 tests, 6 aserciones (`e2e/store-create-security.spec.ts`): OwnerAdmin edita (PUT, nunca POST) + StoreUser deslogueado. Camino B maneja OwnerAdmin sin feature Stores | **CUBIERTO** — el fix está entregado en `fix/s2-03-backend-h10` (`93c829c2` test 403, `96fa69d3` restringe `POST /v1/stores` a SuperAdmin, `115515ab` endurece el handler y quita el re-point, `04e6868f` archive, 2026-08-12). El merge a `main` no es un problema a resolver (decisión del usuario, 2026-08-13) |

### Bloque C — Gestión de usuarios

| US | Título | Prioridad | E2E frontend (Playwright) | E2E backend (.NET) |
|---|---|---|---|---|
| [S3-01](S3-01.md) | Exportar el roster de aprovisionamiento | ALTA | **CUBIERTO** — 3 tests, 7 aserciones (`e2e/roster-export.spec.ts`): descarga ZIP + PK signature + panel cierra, empty password error, button enabled online. 5 aserciones restantes cubiertas por vitest | **CUBIERTO** |
| [S3-02](S3-02.md) | Crear cuenta StoreUser | ALTA | **CUBIERTO** — 3 tests, 5 aserciones (`e2e/create-store-user.spec.ts`): payload roleIds[3] + storeId, offline, StoreUser guard | **CUBIERTO** |
| [S3-03](S3-03.md) | Listar, editar, activar y dar de baja usuarios | ALTA | **CUBIERTO** — 3 tests, 15 aserciones (`e2e/users-crud.spec.ts`): listar + editar, activar/desactivar (DELETE vs activate), offline no-op | **CUBIERTO** — CRUD + ciclo de vida + aislamiento medido (`Users/UsersIsolationTests.cs`): **cross-tenant SÍ aísla** (envelope 404, sin escritura). **Cross-store 200 es REGLA DE NEGOCIO**: el OwnerAdmin es dueño del tenant y de todas sus tiendas; la frontera de seguridad es el tenant, no la tienda (ver H-11) |

### Bloque D — Perfil propio

| US | Título | Prioridad | E2E frontend (Playwright) | E2E backend (.NET) |
|---|---|---|---|---|
| [S4-01](S4-01.md) | Editar el perfil propio | MEDIA | **CUBIERTO** — 3 tests, 6 aserciones (`e2e/edit-profile.spec.ts`): pre-carga + payload + éxito, formulario pre-cargado, offline | **CUBIERTO** |
| [S4-02](S4-02.md) | Cambiar la contraseña propia | ALTA | **CUBIERTO** — 2 tests, 5 aserciones (`e2e/change-password.spec.ts`): logout forzado + re-login con nueva contraseña + offline | **CUBIERTO** |

### Invariante transversal

| US | Título | Prioridad | E2E frontend (Playwright) | E2E backend (.NET) |
|---|---|---|---|---|
| [AUTH-INV-01](AUTH-INV-01.md) | La expiración de autenticación debe ser 35 días | CRÍTICA | **N/A** — el refresh token no es observable desde la UI | **CUBIERTO** — 2 tests E2E (`AuthRefreshTokenLifetimeTests.cs`) fijan el 35d; producción ya emite 35d (`AuthenticationSettings.cs` default + `appsettings*.json`), tests verdes |

### Totales

12 User Stories + 1 invariante transversal.

- **E2E frontend**: 12 CUBIERTO · 0 PARCIAL · 0 PENDIENTE · 1 N/A (AUTH-INV-01 no es observable desde la UI). **Etapa 1 frontend COMPLETADA.**
- **E2E backend**: 9 CUBIERTO · 3 PARCIAL · 1 N/A (S1-03 es cero HTTP; su contraparte de servidor es S3-01).

Trabajo diferido, uno por capa: [plan-frontend.md](plan-frontend.md) y [plan-backend.md](plan-backend.md).

**Planes de backend por US** — salen de la auditoría del 2026-08-07, que contrastó cada aserción declarada contra el código real de `SMCA.WebApi.E2ETests`, no contra la sección "Estado de cobertura" de cada US:

| Plan | Qué encontró |
|---|---|
| [S1-01-backend.md](S1-01-backend.md) | 6 aserciones marcadas cubiertas que **ningún test afirma** |
| [S1-02-backend.md](S1-02-backend.md) | La única aserción abierta **ya está cubierta** |
| [S2-01-backend.md](S2-01-backend.md) | 4 aserciones marcadas cubiertas sin test |
| [S2-03-backend.md](S2-03-backend.md) | 3 aserciones ya cubiertas, y confirman un **defecto de producción** |
| [S3-03-backend.md](S3-03-backend.md) | Aislamiento medido: cross-tenant sí, **cross-store no** |
| [AUTH-INV-01-backend.md](AUTH-INV-01-backend.md) | El fichero de la US **se contradice con este catálogo** |

Sin plan propio, porque su cobertura se verificó y coincide con lo declarado: S1-03 (N/A), S1-04, S2-02, S3-01, S3-02, S4-01, S4-02.

Ningún escenario está completo en ambas capas.

**Playwright hoy** (`frontend-react/e2e/`): `register.spec.ts` + `register-rate-limit.spec.ts` cubren S1-01, `login.spec.ts` + `login-rate-limit.spec.ts` cubren S1-02 y S1-04 (T1-T11, capability `e2e-session-hydration`), `login-offline.spec.ts` cubre S1-03 (11 tests, capability `e2e-offline-login-ui`, corre sin backend levantado — verificado sin proceso `dotnet` activo el 2026-08-08), y `store-plan-activation.spec.ts` cubre S2-01 (2 tests: un `test()` continuo con las 10 aserciones DOM+red del plan, y un `test()` independiente para el fallo de carga — SÍ necesita backend real levantado, a diferencia de `login-offline.spec.ts`); `smoke.spec.ts` y `api-health.spec.ts` son infraestructura, no negocio. La corrida por defecto pasó de 31 a **42 tests** (31 + los 11 de `login-offline.spec.ts`), observada verde contra backend real el 2026-08-08 (`42 passed (55.3s)`, 8 workers, corrido por el usuario). Con `store-plan-activation.spec.ts` la corrida por defecto pasa de 42 a **44 tests** (`pnpm test:e2e`) — aritmética **42 + 2 = 44**, confirmada por `pnpm exec playwright test --list --grep-invert @rate-limit` (`Total: 44 tests in 6 files`, no necesita backend ni navegador), pero **no** es una corrida observada: quien implementó S2-01 no tuvo backend disponible en su sesión para correr Playwright de verdad, así que si esos 44 pasan en verde queda pendiente de confirmación por el usuario. Además, `login-offline.spec.ts` en solitario se corrió **sin backend levantado** y dio 11/11 verdes, lo que sostiene aparte que S1-03 no necesita servidor. La corrida completa actual (2026-08-23) es **72 passed** (grep-invert @rate-limit), incluyendo los 5 specs nuevos de S2-02, S2-03, S3-02, S3-03 y S4-02.

Además: `store-create-security.spec.ts` (S2-03, 2 tests), `users-crud.spec.ts` (S3-03, 3 tests), `create-store-user.spec.ts` (S3-02, 3 tests), `change-password.spec.ts` (S4-02, 2 tests) y `store-plan-lock-regression.spec.ts` (S2-02, 3 aserciones). Todos verificados contra backend real el 2026-08-23.

Los dos specs de rate-limit quedan fuera a propósito —gastan decenas de intentos— y corren con `pnpm test:e2e:rate-limit`. También se corrieron el **2026-08-08 tras el refactor del núcleo de observers**: `2 passed (18.2s)`. Eso importa más que un verde cualquiera: cada uno de esos specs lanza un error explícito si su bucle termina sin observar un 429, así que verde ⇒ el límite se disparó ⇒ las dos clases de error (`RegisterRateLimitError` con su umbral 50/10min — subido de 10 el 2026-08-15 — y `LoginRateLimitError` con su 15/1min — subido de 10 el 2026-08-15) siguen construyéndose bien cada una en su módulo. Es la única evidencia por ejecución de que el núcleo compartido no las unificó.

Una limitación que conviene no perder: **la línea base de los 31 verdes ANTES del refactor de observers nunca se re-corrió en la rama de S1-03**. La evidencia de "verde antes" es la corrida documentada del 2026-08-07. Lo que sí está observado es el "verde después", con los 42.

**La fixture de sesión ya existe.** `signedInPage` (capacidad `e2e-session-fixture`) nació con S1-02 y es de lo que dependen los diez escenarios restantes: todos arrancan con "usuario autenticado" en sus precondiciones. Presupuesto vigente: **4 logins reales por corrida contra un techo de 40/min** (subido de 5→10→15→40; 2026-08-23 para H-12), amortizados con `storageState`. Ese margen es la restricción a respetar al escribir el próximo escenario.

**Rate limiting hoy** (H-12 resuelto 2026-08-23): `Program.cs` ya no excluye `AddRateLimiter`/`UseRateLimiter` bajo `Testing` — el middleware está activo. Login 40/min (subido de 15 para margen de suite paralela), Register 50/10min. `RateLimitPoliciesTests.cs` (4 tests Register) y `LoginRateLimitPoliciesTests.cs` (4 tests Login) verifican opciones y partición. La suite .NET E2E ahora sí puede ejercitar 429s reales.

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

### H-11 — La frontera de seguridad de `PUT /v1/users/{id}` es el **tenant**, no la tienda (regla de negocio)

**Cliente**: `/management/users/edit/:id` toma el id de la URL y llama `getUserById` sin comprobar pertenencia alguna (`user-edit.tsx:21,32-47`). No hay filtro por tienda.

**Servidor**: el handler tiene exactamente un guard, y es de rol, no de pertenencia:

```csharp
if (request.Id != _httpContextService.UserExternalId.ToGuid() && !_httpContextService.IsSuperAdminOrOwnerAdmin)
    return ResponseResult.Failure<bool>(UserErrors.NotFound, 404);   // UpdateUserCommand.cs:49-50
```

Traducido: *"o sos vos mismo, o sos admin"*. **Y es correcto**: el OwnerAdmin es dueño del tenant —y de todas sus tiendas—, y su scope de gestión de usuarios es el tenant entero (`HttpContextService.cs:45-50`, con el `TenantId` viniendo del claim del JWT). No existe ni debe existir un límite por tienda para el OwnerAdmin.

**La frontera real se cumple en el ORM**: el filtro global sobre `User` (`UserEntityTypeConfiguration.cs:22-24`) aplica al camino `FindAsync` — un usuario de **otro tenant** es invisible → `user is null` → envelope 404, sin escritura. Verificado empíricamente por `Users/UsersIsolationTests.cs:22`. La incógnita que la primera versión de este hallazgo dejó abierta (¿el filtro aplica al camino `FindAsync` de `GenericRepository.cs:82-85`?) quedó respondida por corrida real: **sí aplica**.

**Consecuencia sobre la cobertura**: la mitad "cross-store" de la aserción de S3-03 era una expectativa equivocada (aislamiento por tienda), no un defecto. El comportamiento medido —un OwnerAdmin edita a un usuario de otra tienda del mismo tenant y el cambio se aplica (`UsersIsolationTests.cs:48`)— es la regla de negocio. La única consideración que queda es de UI (qué lista ve el OwnerAdmin según `SelectedStoreId`), que es producto, no seguridad.

### H-12 — El rate limiting estaba **apagado** en el entorno de pruebas — **RESUELTO** (2026-08-23)

`Program.cs` envolvía `AddRateLimiter` y `UseRateLimiter` en `if (!Environment.IsEnvironment("Testing"))`. La suite E2E corre precisamente bajo ese entorno (`WebAppFixture.cs:25`). **Fix**: se eliminaron ambos guards, de modo que el rate limiter ahora está activo bajo todos los entornos incluyendo `Testing`.

Consecuencia resuelta: la suite .NET E2E ahora **sí puede ejercitar el 429** — no requiere un entorno externo.

Los umbrales están **hardcodeados**, no configurados (`SMCA.WebApi/PolicyCode/RateLimitPolicies.cs`):

| Política | Límite | Ventana | Segmentos | Cola | Partición |
|---|---|---|---|---|---|
| `LoginPolicy` (`:15-24`) | 40 | 1 min | 3 | 0 | IP remota |
| `RegisterPolicy` (`:26-35`) | 50 | 10 min | 10 | 0 | IP remota |

El límite de login subió de 15→40 para dar margen a la suite E2E (que ejecuta tests de login en paralelo, todos compartiendo la misma partición IP). Aplicadas vía `[EnableRateLimiting("LoginPolicy")]` (`AuthController.cs:27`) y `[EnableRateLimiting("RegisterPolicy")]` (`AuthController.cs:102`). La partición es por **IP**, no por login.

### H-13 — `POST /v1/auth/refresh` y `POST /v1/auth/revoke` existen y no tienen rate limit

`AuthController.cs:44` (`refresh`) y `:57` (`revoke`) no llevan `[EnableRateLimiting]`, a diferencia de `login` y `register`. El `refresh` ya tiene cobertura E2E desde entonces (`Auth/AuthRefreshTokenLifetimeTests.cs:86`, `Refresh_returns_new_refresh_token_expiring_in_35_days`, que golpea `POST /api/v1/auth/refresh`), así que lo que queda abierto no es la cobertura sino el **límite**: los dos endpoints siguen sin `[EnableRateLimiting]`.

### H-14 — Un login **offline** arma telemetría que intenta un `POST`, sin ninguna guarda de conectividad

Encontrado al implementar la cobertura Playwright de [S1-03](S1-03.md), no por lectura previa: el login offline **no es HTTP-cero**.

`login.tsx` llama `armTracking()` en **las dos** ramas de éxito — la offline (`login.tsx:114`, dentro del bloque que retorna en `:123`) y la online (`:140`). Es la misma función, importada de `store-usage-tracker` (`login.tsx:11`). Una vez armada, `use-store-usage-tracker.ts` la dispara al renderizar la ruta siguiente, y el tracker emite `POST /v1/usages/store-daily-usage` (`store-usage-tracker.ts:104-107`) con los días sin guardar.

**Lo que convierte esto en hallazgo y no en detalle**: `store-usage-tracker.ts` y `use-store-usage-tracker.ts` **no consultan la conectividad en ningún punto** — cero referencias a `isOnline`, `ConnectivityService` o `navigator.onLine`. Así que un dispositivo aprovisionado que entra sin red arma la telemetría igual y la petición sale igual, a fallar.

No es una regresión: el mismo camino ya existía para los logins online, y el `POST` es telemetría de background que deliberadamente no maneja el overlay de carga global (`store-usage-tracker.ts:108-110`). Pero desmiente la lectura intuitiva de que un login offline no toca la red.

**Consecuencia para la capa Playwright**: la aserción "cero peticiones" de S1-03 no puede ser literal. `e2e/support/any-request-observer.ts` se mantuvo genérico y la tolerancia vive donde corresponde, en el spec: `expectOnlyKnownTelemetry()` en `e2e/login-offline.spec.ts`. Un observer que tolerara esto por dentro habría escondido el hallazgo en vez de declararlo.

### H-15 — El backend no tiene candado de dirección única para el plan de una tienda

Encontrado al implementar la cobertura Playwright de [S2-01](S2-01.md). `UpdateStoreCommandHandler.Handle` (`UpdateStoreCommand.cs:69-106`) tiene un único guard de autorización — `IsSuperAdminOrOwnerAdmin` (`:71-72`) — y ninguna otra rama compara el `moduleIds` entrante contra el conjunto actual de la tienda, ni consulta `PaymentStartDate` para rechazar una bajada de plan. DG-7 ("el OwnerAdmin activa el plan pago una sola vez") es, del lado servidor, una garantía que **no existe**: es exclusivamente una barrera de UI, documentada en prosa en `plan-picker.tsx:9-15` (`readOnly` no renderiza el botón de activación, pero nada impide un `PUT` directo con cualquier conjunto de módulos).

Misma forma que **H-10** (el backend permite crear tiendas como OwnerAdmin, la única barrera es un accidente del frontend), con una diferencia que vale la pena escribir: en H-10 la barrera de frontend es **emergente** — un colapso de `??` que nadie diseñó a propósito. Acá la barrera de frontend es **deliberada y documentada** (`store-form.tsx:72-83` cita explícitamente DG-7). Lo que falta no es intención — es la mitad de servidor de una intención que sí existe del lado cliente.

La ironía conviene escribirla explícita, no dejarla implícita: **la ausencia de este candado del lado servidor es la única razón por la que la cobertura Playwright de [S2-01](S2-01.md) puede existir** — `e2e/support/store-fixture.ts` degrada una tienda real a plan gratuito con un `PUT` directo precisamente porque el servidor lo permite sin objeción. Si H-15 se arreglara algún día, ese `PUT` de siembra empezaría a fallar y la precondición de S2-01 dejaría de ser alcanzable con el Approach A actual.

### H-16 — Dos nociones distintas de "owner admin" en el mismo código

Encontrado al implementar la cobertura Playwright de [S2-01](S2-01.md), y corrigió una aserción de esa US que estaba mal escrita (`S2-01.md:62`, ver abajo).

`management/stores/routes/edit-store.tsx:37` calcula:

```ts
const isOwnerAdmin = isSuperAdmin || hasOwnersAvailableFeature(user);
```

`hasOwnersAvailableFeature` (`authorization-service.ts:44-46`) exige que `user.featureIds` contenga la feature `Owners` (`authorization-service.ts:31`, rama OwnerAdmin de `isUserAuthorized`). Ese `featureIds` de nivel usuario viene de `GetMeQuery.cs:83` → `AllowedFeaturesService.GetAllowedFeatureIdsForCurrentUserAsync` → para un OwnerAdmin, `GetAllowedFeatureIdsByRoleAsync(RoleType.OwnerAdmin, storeModuleIds)` (`AllowedFeaturesService.cs:27-28,41-47`), que filtra el enum `StoreRoleFeatures` por `GetRoles().Any(r => r == OwnerAdmin) && GetModuleType().HasValue && storeModuleIds.Contains(...)`. `Owners` cae del filtro **por dos razones independientes**: `OwnersAdmin` (`StoreRoleFeatures.cs:12-14`) lleva `[HasRoles(SuperAdmin, ReSeller)]` — **nunca** `OwnerAdmin` — y no lleva ningún `[HasModule]`, así que `GetModuleType()` es `null`. Cualquiera de las dos ya la excluye. Por si hiciera falta un tercer cierre: la feature `Owners` (`FeatureEntityTypeConfiguration.cs:56-64`) cuelga de `ModuleType.Administration`, sembrado `availableToStore: false` (`ModuleEntityTypeConfiguration.cs:39`) — `StoreModuleRepository.cs:22` filtra por `sm.Module.AvailableToStore`, así que ninguna tienda porta nunca ese módulo tampoco. **Ninguna de las tres puertas se abre nunca para un OwnerAdmin real**, así que `isOwnerAdmin` en `edit-store.tsx` es `false` para cualquiera de ellos, incluida la persona `owner-admin` de la suite Playwright.

Mientras tanto, `adminLoader` (`auth/routes/loaders.ts:101`) mira una cosa completamente distinta: el flag `user.isOwnerAdmin`, que viene de `GetMeQuery.cs:96` (`IsOwnerAdmin = _httpContextService.IsOwnerAdmin`). Ese flag SÍ es `true` para un OwnerAdmin real — es lo que deja pasar la ruta `/management/stores` en primer lugar.

**Consecuencia sobre [S2-01](S2-01.md)**: la aserción "el selector de dueño está deshabilitado en modo edición" (`S2-01.md:62`, versión anterior a este cambio) era falsa. El selector no está deshabilitado — **no se renderiza en absoluto**, porque todo el bloque está gateado por `isAdminUser = isSuperAdmin || isOwnerAdmin` (`store-form.tsx:69,179`), y ese `isOwnerAdmin` es el de `edit-store.tsx:37`, no el flag. Corregido en `S2-01.md` y cubierto en su forma verdadera por `e2e/store-plan-activation.spec.ts`.

**Segundo orden, digno de su propia nota — dos defectos se cancelan**: si `isOwnerAdmin` en `edit-store.tsx` usara la primera definición (el flag `user.isOwnerAdmin`, `true` para esta persona), `edit-store.tsx:52` llamaría `listOwners()`. `OwnersController.cs:18` lleva `[HasPermission(StoreRoleFeatures.OwnersAdmin)]`, y `OwnersAdmin` (`StoreRoleFeatures.cs:12-14`) admite `SuperAdmin`/`ReSeller`, **no** `OwnerAdmin` — esa llamada respondería 403. El 403 caería en el `.catch()` de `edit-store.tsx:80-82`, `loadError` se setearía, y `<StoreForm>` nunca montaría — matando 10 de las 11 aserciones de [S2-01](S2-01.md). Es `false` por la definición real, así que el tercer miembro del `Promise.all` es `Promise.resolve(success([]))` y en modo edición solo salen 2 GET reales. Cambiar cualquiera de los dos defectos por separado (la definición de `isOwnerAdmin` en `edit-store.tsx`, o el permiso de `OwnersController`) rompería la otra mitad de esta US — es su propio cambio, con su propia decisión de producto, no un "arreglo" de esta pasada.

### H-17 — El "refresco de sesión" tras guardar una tienda no refresca nada del servidor

Encontrado el 2026-08-08 por la **primera corrida real** de la cobertura de [S2-01](S2-01.md) contra backend: el test se colgó los 30 segundos completos del timeout esperando una petición que la app nunca emite.

`edit-store.tsx:132-139` guarda y después llama `await getUserByToken()`, con un comentario que dice *"refresh user session via the consolidated getUserByToken() action"*. Leído así, parece un `GET /v1/auth/me`. **No lo es.** `getUserByToken()` corta por caché:

```ts
const cachedProfile = StorageService.getCurrentUser();
if (cachedProfile && cachedProfile.authToken === auth.authToken) {
  // OFFLINE-FIRST: a valid cached session is authoritative — make NO backend call.
  set({ user: userWithExpiry, isAuthenticated: true, error: null });
  return userWithExpiry;
}
```

(`auth-store.ts:126-140`.) Con una sesión válida —el caso normal tras guardar— toma esa rama y **cero peticiones salen**. El corto es deliberado y está justificado en `:133-137`: Angular sí disparaba un `/me` de fondo acá (`auth.service.ts:159`), y se quitó porque el 401 de ese `/me` lo convertía en `logout()` el interceptor de errores compartido, rompiendo el uso offline.

**Por qué es un hallazgo y no un detalle.** El servidor **sí** recalcula los `featureIds` al cambiar los módulos: `UpdateStoreCommand.cs:124-130` desactiva las `StoreRoleFeature` de los módulos dados de baja, y `:163-171` genera las de los nuevos. Pero el cliente sigue con los `featureIds` que trajo del último login real, y nada los invalida. Después de activar el plan pago, un OwnerAdmin queda con permisos calculados sobre el plan **anterior** hasta que vuelva a loguearse. La intención de refrescar la sesión está escrita en el código; lo que falta es el efecto.

⚠️ **NO VERIFICADO**: qué consecuencia observable tiene esa desincronización — si alguna pantalla se comporta distinto con `featureIds` viejos tras activar el plan. No se midió, y no se dedujo. Es candidato a US propia.

**Consecuencia sobre la cobertura**: la aserción 5 de S2-01 afirmaba el `/me`. Corregida para afirmar el comportamiento real —cero `/me`, cero recarga— con un anclaje explícito: se espera a que el botón "Guardar" vuelva a habilitarse (`edit-store.tsx:118,153-154` + `store-form.tsx:70,124`), lo que prueba que el `await getUserByToken()` ya corrió. Sin ese anclaje la aserción sería vacua, porque la ausencia de una petición no prueba nada si el código que la emitiría todavía no se ejecutó. `page.waitForURL` no sirve como ancla acá: el guardado navega a `/management/stores` estando ya en esa URL.

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
| 7 | Umbrales de rate limiting | **Resuelto**: login 15/1min (subido de 10 el 2026-08-15), register 50/10min (subido de 10 el 2026-08-15), por IP, hardcodeados | [S1-01](S1-01.md), [S1-02](S1-02.md) + **H-12**, **H-13** |
| 8 | ¿`GET /v1/stores/{id}` devuelve solo módulos activos? | **Resuelto y la suposición del frontend SE SOSTIENE** | [S2-01](S2-01.md) (bloque "De dónde sale cada mitad") |

### La incógnita deliberada quedó respondida por corrida real

La pregunta que la primera versión de la etapa dejó escrita como test y no como afirmación —si el filtro global de tenant de `User` aplica al camino `FindAsync` de `PUT /v1/users/{id}` (`UserEntityTypeConfiguration.cs:22-24`, `GenericRepository.cs:82-85`)— fue contestada por `Users/UsersIsolationTests.cs:22` contra base real: **sí aplica** (cross-tenant → envelope 404, sin escritura). El caso "cross-store" resultó ser la regla de negocio del OwnerAdmin (ver **H-11**). Cero incógnitas abiertas.

---

## 7. Cómo correr cada capa

```bash
# E2E backend (.NET) — requiere PostgreSQL en localhost:5432, base smca_test
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj

# E2E frontend (Playwright)
# ver frontend-react/e2e/README.md
```
