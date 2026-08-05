# Catálogo de escenarios E2E — Etapa 1

> Documento de **especificación de pruebas**, no de implementación. No modifica ni propone modificar ningún test existente.
>
> **Regla del proyecto (CLAUDE.md, innegociable)**: *"Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."* Agregar tests nuevos está permitido; tocar los existentes requiere autorización explícita. Donde este catálogo sugiere que un test existente debería cambiar, queda anotado como **nota para el usuario**, sin ejecutar nada.

Toda aserción de este documento está anclada a código leído, con `archivo:línea`. La sección 7 arrancó con 8 huecos declarados y hoy está en **cero**: cada uno se cerró con una aserción real o con un **negativo documentado** (verificar que algo *no* existe también es un hallazgo). Nunca se rellenó un hueco con una aserción plausible.

Convención de marcas: 🔴 = comportamiento defectuoso o riesgoso confirmado, el test lo documenta en vez de esconderlo · 🆕 = aserción sin cobertura hoy.

---

## 1. Propósito y alcance

### Qué es la Etapa 1

La Etapa 1 cubre **únicamente las operaciones que efectivamente cruzan la frontera hacia la API**. Es el subconjunto donde una prueba de extremo a extremo puede afirmar algo sobre el servidor y la base de datos.

### Qué queda FUERA, y por qué

| Fuera de alcance | Razón verificada |
|---|---|
| Productos, ventas, inventario, gastos, créditos, reportes, estadísticas | La app React es *offline-first*: esos dominios operan contra `localStorage` (cifrado en reposo con AES-GCM) y **no llaman a la API**. No hay dato de servidor que aseverar. |
| Sync export / import | Es un flujo **basado en archivos**: ZIP cifrado vía `@zip.js/zip.js`, descargado con un `<a download>`; el import entra por selector de archivos. **Cero llamadas HTTP**. No confundir con la exportación de *roster* (escenario S3-01), que sí es un `GET`. |
| `ERoles.ReSeller` y `ERoles.SuperAdmin` | Fuera de alcance por decisión de producto. Solo se mencionan como **notas de exclusión** cuando una pantalla es exclusiva de esos roles. |

**Prefijo de rutas.** El frontend construye rutas `\/v1/...` sobre `apiClient.baseURL = import.meta.env['API_URL'] ?? ''` (`frontend-react/apps/web-store-pos/app/shared/lib/http/api-client.ts:21-22`). La suite .NET E2E golpea `\/api/v1/...` (p. ej. `backend/src/SMCA.WebApi.E2ETests/Billing/StoreCreationTrialTests.cs:610`). En este catálogo se escribe la ruta como la ve cada capa.

---

## 2. Mapeo de personas — vocabulario del código

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

Ningún lector debe asumir que existe un rol `StoreOwner`. Cuando este documento dice **OwnerAdmin**, se refiere a `ERoles.OwnerAdmin` / `isOwnerAdmin`.

**Matiz de autorización verificado** (`shared/lib/auth/authorization-service.ts:16-41`): ser OwnerAdmin **no** otorga acceso universal. `isUserAuthorized` exige, para un OwnerAdmin, que `user.featureIds` contenga alguno de los `featureIds` requeridos (línea 31). El único bypass total es `isSuperAdmin` (línea 26). Existe además un bypass más amplio en `featureLoader` (`auth/routes/loaders.ts:89-91`) que **no** se aplica a `adminFeatureLoader` ni a `resellerFeatureLoader` (comentario explícito en `loaders.ts:61-64`).

---

## 3. Las dos capas de aserción

Cada escenario declara **ambas**. Si una capa genuinamente no aplica, se escribe `— (no aplica)` con la razón en una cláusula.

### Playwright (UI)
Maneja el navegador contra la app corriendo + API real. Prueba **lo que el usuario ve y puede hacer**: redirecciones, módulos renderizados, estado visible, controles habilitados/deshabilitados, mensajes de error literales.

**Lo que NO prueba**: que el dato quedó bien persistido. Una UI puede mostrar "guardado" sobre un `SaveChangesAsync` que no escribió nada — trampa documentada en `CLAUDE.md` (`ApplicationDbContext` es `NoTracking` por defecto).

### .NET E2E (dato)
Suite en `backend/src/SMCA.WebApi.E2ETests/`, contra base de datos real (PostgreSQL `smca_test`; `WebAppFixture` aplica migraciones). Prueba **la verdad del dato**: campos persistidos, fechas, relaciones, estado de plan/trial computado.

**Lo que NO prueba**: que la pantalla lo muestre, que el botón exista, que el guard redirija. Precedente registrado en `CLAUDE.md`: 303 tests de integración pesaron más que 315 unitarios porque los mocks reproducían un mundo que la base de datos nunca produjo.

**Lo que ninguna de las dos prueba**: el comportamiento offline puro (`localStorage`), fuera de alcance de Etapa 1 por definición.

---

## 4. Escenarios

### Bloque A — Sesión y acceso

---

#### [S1-01] Auto-registro crea cuenta y tienda en un solo paso

**User Story**
Como visitante anónimo, quiero registrarme con mis datos y el nombre de mi tienda, para obtener una cuenta OwnerAdmin y una tienda operativa sin intervención de nadie.

**Prioridad**: CRÍTICA
**Personas**: pública → resulta en OwnerAdmin
**Endpoint(s)**: `POST /v1/auth/register`

**Precondiciones**
- Navegador online (`ConnectivityService.isOnline()` verdadero — `auth/routes/register.tsx:103`).
- `login` no existente en el sistema.

**Flujo**
1. Ir a `/register`.
2. Completar `fullName`, `login`, `email`, `cellPhone`, `storeName`, `password`, `passwordConfirmation`.
3. Tildar el checkbox de términos y condiciones.
4. Enviar.

**Aserciones — Playwright (UI)**
- [ ] El botón de envío está **deshabilitado** mientras no se tilde el checkbox de aceptación (`register.tsx:338` — `disabled={isLoading || !accepted}`).
- [ ] Existe un campo `storeName` requerido; sin él, la validación de cliente bloquea el envío (`register.tsx:74-76`).
- [ ] Un **único** toggle `showPassword` controla los DOS campos de contraseña simultáneamente (`register.tsx:55,258,287`).
- [ ] `password` que no cumple `/^(?=.*[A-Z])(?=.*\d).{8,}$/` muestra el error de política sin llamar a la API (`register.tsx:57,79-81`).
- [ ] `passwordConfirmation` distinta de `password` muestra `GENERAL.VALIDATION.INVALID_PASSWORD` (`register.tsx:86-88`).
- [ ] El campo `email` **no** es validado como requerido en el cliente (`register.tsx:63-89` — no hay rama para `email`). Enviar con email vacío llega a la API.
- [ ] Offline: no se emite ninguna petición; se muestra el banner `REGISTRATION.OFFLINE_BANNER` (`register.tsx:103-106,153-157`).
- [ ] Éxito (`response.succeeded`) navega a `/login` — **no** autentica automáticamente (`register.tsx:119-121`).
- [ ] HTTP 400 muestra literalmente `errors[0].description` del backend, no un mensaje genérico (`register.tsx:132-136`).
- [ ] HTTP 429 muestra `REGISTRATION.TOO_MANY_ATTEMPTS` (`register.tsx:137-138`). El umbral real es **10 registros por 10 minutos por IP**, ventana deslizante de 10 segmentos (`backend/src/SMCA.WebApi/PolicyCode/RateLimitPolicies.cs:26-35`; aplicado por `[EnableRateLimiting("RegisterPolicy")]` en `SMCA.WebApi/Controllers/v1/AuthController.cs:102`). Ver Hallazgo **H-12**: el limitador está **apagado** bajo el entorno `Testing`, así que esta aserción **solo es verificable en Playwright contra un entorno no-Testing**, nunca desde la suite .NET E2E.

**Destino post-registro** — el registro **no** autentica: navega a `/login` (`register.tsx:119-121`). El destino final se resuelve recién en el login siguiente, vía `resolveUserHomePath` (ver S1-02). Para un usuario recién registrado, la tienda **no tiene productos**, así que:

- [ ] Registrarse e iniciar sesión inmediatamente deja al OwnerAdmin en **`/sales/products`**, no en `/sales/new` (`shared/lib/auth/user-home.ts:24-25` — `hasAnyAvailableToSaleProduct()` es falso sin productos).

**Aserciones — .NET E2E (dato)**
- [ ] Se crea un `Owner` y un `Store` en la misma operación (`Application/Features/Authentication/Commands/Register/RegisterCommand.cs:66-83`).
- [ ] `owner.User.SelectedStoreId` queda seteado al id de la tienda recién creada (`RegisterCommand.cs:91`).
- [ ] La descripción del Owner se compone como `"Nombre de la tienda: " + storeName` (`RegisterCommand.cs:67`).
- [ ] La tienda se crea con `description = "Tienda de prueba"` y `approved = false` (`RegisterCommand.cs:82-83`).
- [ ] La tienda recibe **todos** los módulos de `GetAvailableModulesToStore()`, gratuitos y **pagos** (`RegisterCommand.cs:73,81-83`; filtro en `Infrastructure/Persistence/Repositories/ModuleRepository.cs:17-23`).
- [ ] `store.PaymentStartDate` se setea a **hoy** incondicionalmente (`Application/Services/Stores/CreateStoreService.cs:39-43`).
- [ ] La respuesta `AuthDto` trae `ExpiresIn = UtcNow + TokenLifetimeDays` (`RegisterCommand.cs:130`), y **no** trae refresh token (`AuthDto` con default `null` — `Application/Dtos/Authentication/AuthDto.cs:7`).
- [ ] Si `code` viene y matchea un ReSeller, se crea un `ReSellerOwner` (`RegisterCommand.cs:93-119`). *Nota: ReSeller está fuera de alcance; se lista solo como efecto del registro.*

**Estado de cobertura**: YA CUBIERTO → `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterSuccessTests.cs:28` (crea owner + store, token, expiry), `Auth/AuthRegisterValidationTests.cs:32-53` (400 por campo, incl. `storeName` vacío en `:53`), `Auth/AuthRegisterDuplicateTests.cs:22`, `Billing/StoreCreationTrialTests.cs:331` (`PaymentStartDate == hoy`). UI: PARCIAL → `frontend-react/apps/web-store-pos/app/auth/routes/__tests__/register.test.tsx` cubre las 10 aserciones de UI a nivel **vitest/jsdom**; en **Playwright** todo es NUEVO.

---

#### [S1-02] Login online

**User Story**
Como OwnerAdmin o StoreUser con conexión, quiero autenticarme con mi usuario y contraseña, para acceder a mi tienda.

**Prioridad**: CRÍTICA
**Personas**: ambas
**Endpoint(s)**: `POST /v1/auth/login` seguido de `GET /v1/auth/me`

**Precondiciones**
- Dispositivo **sin roster** provisionado (`isRosterProvisioned()` falso — `login.tsx:106`). Con roster, el flujo es S1-03, no éste.
- Navegador online.

**Flujo**
1. Ir a `/login`.
2. Ingresar credenciales y enviar.
3. La app llama `POST /v1/auth/login`, guarda el token, y llama `GET /v1/auth/me`.
4. Navega al home resuelto para ese usuario.

**Aserciones — Playwright (UI)**
- [ ] Durante todo el flujo (login → me → resolver home → navegar) se ve **solo** el overlay de carga; el formulario nunca reaparece entre llamadas (`login.tsx:76,185-187`).
- [ ] Se emiten **dos** peticiones en orden: `POST /v1/auth/login` y luego `GET /v1/auth/me` (`shared/lib/stores/auth-store.ts:197,230` → `getUserByToken` → `:129`).
- [ ] Credenciales inválidas: el backend responde **HTTP 200 con `succeeded:false`**, y la UI muestra `AUTH.INVALID_ERROR` interpolando **literalmente** `errors[0].description` (`auth-store.ts:207-217`, `login.tsx:158-168`).
- [ ] Campos vacíos: validación local, sin petición (`login.tsx:78-98`).
- [ ] Offline en dispositivo sin roster: sin petición, banner `AUTH.OFFLINE_LOGIN` (`login.tsx:124-127,195-199`).
- [ ] Tras éxito, `localStorage` contiene `AUTH_MODEL` con `{ authToken, expiresIn }` (`auth-store.ts:223-226`).
- [ ] Un usuario ya autenticado que visita `/login` es redirigido a su home, no a `/` (`loaders.ts:42-58`).
- [ ] HTTP 429 muestra `AUTH.TOO_MANY_ATTEMPTS` (`login.tsx:175-176`). Umbral real: **5 intentos por minuto por IP**, ventana deslizante de 3 segmentos (`SMCA.WebApi/PolicyCode/RateLimitPolicies.cs:15-24`; `[EnableRateLimiting("LoginPolicy")]` en `AuthController.cs:27`). Igual que en el registro, **solo verificable fuera del entorno `Testing`** — ver Hallazgo **H-12**.

**Destino post-login — `resolveUserHomePath`** (`shared/lib/auth/user-home.ts:19-26`). Es la respuesta a *"¿la redirección va a donde toca?"*. Solo hay **dos ramas**:

```ts
if (user.isReSeller || user.isSuperAdmin) return '/admin/owners';           // user-home.ts:20-22
const result = await createProductService(user.selectedStoreId).hasAnyAvailableToSaleProduct();
return result.data ? '/sales/new' : '/sales/products';                       // user-home.ts:24-25
```

| Persona | Estado de la tienda | Destino |
|---|---|---|
| **OwnerAdmin** | tiene al menos un producto disponible para venta | **`/sales/new`** |
| **OwnerAdmin** | sin productos vendibles (p. ej. recién registrada) | **`/sales/products`** |
| **StoreUser** | tiene productos vendibles | **`/sales/new`** |
| **StoreUser** | sin productos vendibles | **`/sales/products`** |
| *(excluido)* SuperAdmin / ReSeller | — | `/admin/owners` |

**El destino NO depende del rol** entre OwnerAdmin y StoreUser: ambos comparten exactamente la misma rama. Lo único que lo decide es si la tienda tiene productos vendibles.

- [ ] OwnerAdmin con productos → aterriza en `/sales/new` (`user-home.ts:25`).
- [ ] OwnerAdmin **sin** productos → aterriza en `/sales/products` (`user-home.ts:25`).
- [ ] StoreUser con productos → aterriza en `/sales/new`; sin productos → `/sales/products` (misma rama, `user-home.ts:24-25`).
- [ ] Ningún OwnerAdmin ni StoreUser aterriza jamás en `/admin/owners` (rama exclusiva de ReSeller/SuperAdmin — `user-home.ts:20-22`).
- [ ] La resolución del destino consulta datos **locales**, no la API: `hasAnyAvailableToSaleProduct()` corre sobre el servicio de productos offline (`user-home.ts:2,24`). Por eso el destino post-login es idéntico online y offline.
- [ ] La misma función gobierna el rebote de un usuario ya autenticado que visita `/login` (`loaders.ts:56`), así que el destino es consistente entre login explícito y redirect del guard.

**Aserciones — .NET E2E (dato)**
- [ ] Credenciales válidas → 200, `Succeeded=true`, `AuthToken` no vacío (`LoginCommand.cs:60-65`).
- [ ] Contraseña incorrecta → **401** con código de error `Auth.InvalidCredentials` (`LoginCommand.cs:88-90`).
- [ ] Cuenta inactiva → **403** con código `Auth.AccountInactive` (`LoginCommand.cs:84-86`).
- [ ] 🆕 Tienda inactiva → **403** con código `Store.Inactive` (`LoginCommand.cs:84-86`). **Sin cobertura hoy**: verificado por grep sobre toda la suite E2E — `Store.Inactive`, `StoreInactive` y `Store.IsActive` no aparecen en ningún test. `Auth/AuthLoginFailureTests.cs:43` cubre la variante *cuenta* inactiva (`Auth.AccountInactive`, aserción en `:55`), no la de *tienda* inactiva. Son dos ramas distintas del mismo `switch` y solo una está probada.
- [ ] Se persiste una fila `RefreshToken` con expiry `UtcNow + RefreshTokenExpirationDays` (`LoginCommand.cs:55-58`).
- [ ] `AuthDto.ExpiresIn = UtcNow + _authTokenConfig.TokenLifetimeDays` — nótese que **Login lee `IAuthTokenConfig`** (sección `Jwt`), no `AuthenticationSettings` (`LoginCommand.cs:63`). Ver Hallazgo H-2.

**Estado de cobertura**: PARCIAL (dato) → YA CUBIERTO: `Auth/AuthLoginSuccessTests.cs:22`, `Auth/AuthLoginFailureTests.cs:22` (401 contraseña incorrecta), `Auth/AuthLoginFailureTests.cs:43` (403 **cuenta** inactiva), `Auth/AuthLoginTests.cs:17,31`, `Auth/AuthMeTests.cs:29`. **NUEVO**: tienda inactiva → 403, y el rate limit de login (inalcanzable bajo `Testing`, ver H-12). **NUEVO** en Playwright, incluidas las 6 aserciones de destino post-login (existe cobertura vitest en `auth-store.test.ts:125` y `login.test.tsx`, pero ninguna de navegador ni de destino).

---

#### [S1-03] Login offline en dispositivo aprovisionado

**User Story**
Como OwnerAdmin o StoreUser en un local sin internet, quiero autenticarme contra el roster local, para seguir operando la caja.

**Prioridad**: CRÍTICA
**Personas**: ambas
**Endpoint(s)**: **ninguno (offline)** — cero HTTP

**Precondiciones**
- El dispositivo importó un bundle de roster y **no está vencido**: `getRoster()` devuelve no-nulo, o sea `bundle.expiresAt > Date.now()` (`shared/lib/offline/roster-store.ts:146-150,170-172`).

**Mecanismo verificado** — el que decide el modo es **el archivo de roster, nunca la conectividad**. `login.tsx:105-106` importa dinámicamente `roster-store` y ramifica sobre `isRosterProvisioned()`. Si es verdadero, se llama `loginOffline` **incluso estando online** (la comprobación de conectividad de `login.tsx:124` está *después* del `return` de la rama offline, línea 119).

**Flujo**
1. Ir a `/login` en el dispositivo aprovisionado.
2. Ingresar `login` + contraseña.
3. `authenticateOffline` resuelve contra `bundle.users` sin red.

**Aserciones — Playwright (UI)**
- [ ] **Cero peticiones HTTP** durante todo el submit exitoso (`login.tsx:105-120` retorna antes de cualquier rama online).
- [ ] Con roster provisionado y navegador **online**, igual se usa la vía offline (mismo `return` en `login.tsx:119`).
- [ ] Login ausente del roster **y** contraseña incorrecta producen **el mismo** mensaje `AUTH.INVALID_CREDENTIALS` — indistinguibles para el atacante (`login.tsx:35-37`; errores en `offline-auth-service.ts:102,117`).
- [ ] Usuario del roster con `isActive:false` → `AUTH.ACCOUNT_INACTIVE` (`login.tsx:38-40`; `offline-auth-service.ts:119-121`).
- [ ] `verifier` malformado en el bundle → `AUTH.SERVER_ERROR` (`login.tsx:47-48`; `offline-auth-service.ts:105-112`).
- [ ] Fallo de desenvuelto de DEK (`DekUnwrapError`) → `AUTH.UNLOCK_FAILED`, **no** "contraseña incorrecta" (`login.tsx:44-46`).
- [ ] Bundle **vencido** ⇒ `isRosterProvisioned()` falso ⇒ el flujo cae a la vía **online** (`roster-store.ts:148`, `login.tsx:106`). Offline + bundle vencido ⇒ banner `AUTH.OFFLINE_LOGIN`.
- [ ] Recarga en dispositivo con roster v2 cuando la DEK está en null: los loaders redirigen a `/login?unlock=1` y se ve el banner `AUTH.UNLOCK_REQUIRED` (`loaders.ts:29-32`, `login.tsx:59,201-205`, `unlock-gate.ts:10-22`).
- [ ] El orden de verificación es: verifier → contraseña → `isActive`. Un usuario inactivo con contraseña **incorrecta** ve "credenciales inválidas", no "cuenta inactiva" (`offline-auth-service.ts:114-121`).
- [ ] Tras éxito offline, `localStorage` queda hidratado igual que en login online (mismo *seam* `setUser` — `auth-store.ts:291`).
- [ ] El destino post-login offline es **idéntico** al online: misma llamada a `resolveUserHomePath(user)` (`login.tsx:112` vs `:140`), y esa función solo consulta datos locales (`user-home.ts:24`). OwnerAdmin y StoreUser con productos → `/sales/new`; sin productos → `/sales/products`.
- [ ] Un dispositivo aprovisionado **sin conexión** aterriza en la misma ruta que con conexión — ninguna rama de `user-home.ts:19-26` mira la conectividad.

**Aserciones — .NET E2E (dato)**
- — (no aplica): el flujo no toca servidor ni base de datos. La única contraparte de servidor es la **generación** del bundle, cubierta en S3-01.

**Estado de cobertura**: PARCIAL → cubierto a nivel vitest en `app/auth/routes/__tests__/login.offline.test.tsx` (suites A/B: offline en dispositivo aprovisionado, online-igual-va-offline, contraseña incorrecta, dispositivo sin roster) y `login.offline.e2e.test.tsx:116-322` (integración real con `roster-store`: bundle vencido cae a online, usuario inactivo rechazado). **Falta**: toda la capa Playwright, y en particular la aserción de **cero peticiones HTTP** a nivel de red real.

---

#### [S1-04] Hidratación de sesión: la caché válida no llama al backend

**User Story**
Como usuario que recarga la app, quiero que mi sesión se restaure al instante desde la caché local, para que un servidor caído o ausente no me expulse.

**Prioridad**: CRÍTICA
**Personas**: ambas
**Endpoint(s)**: `GET /v1/auth/me` — **solo cuando no hay caché usable**

**Precondiciones**
- `localStorage` contiene `AUTH_MODEL` con `authToken` y `expiresIn`.

**Rama verificada** (`shared/lib/stores/auth-store.ts:74-166`) — este comportamiento es **deliberado** y merece aserción propia:

| Estado de `AUTH_MODEL` / caché | Efecto |
|---|---|
| Ausente | retorna `null`, sin llamada (`:75-76`) |
| JSON inválido | borra `AUTH_MODEL`, retorna `null` (`:79-84`) |
| Parseable pero sin `authToken` o sin `expiresIn` | retorna `null` y **no borra nada** (`:86-89`) |
| `expiresIn <= Date.now()` | `logout()` — límite **inclusivo** (`:91-96`) |
| Perfil cacheado cuyo `authToken` **coincide** | hidrata sincrónicamente y **NO hace ninguna llamada** (`:100-114`) |
| Sin caché usable | hidrata *best-effort* sincrónicamente y **luego** llama `GET /v1/auth/me` (`:120-129`) |

**Flujo**
1. Autenticarse.
2. Recargar la página.

**Aserciones — Playwright (UI)**
- [ ] Con caché válida, la recarga produce **cero** `GET /v1/auth/me` (`auth-store.ts:107-113` — la revalidación en segundo plano de Angular fue **removida** a propósito; el comentario explica que el 401 de ese `/me` era convertido en logout por el interceptor y rompía el uso offline).
- [ ] Sin caché usable, la recarga produce exactamente un `GET /v1/auth/me` (`auth-store.ts:129`).
- [ ] Con el servidor apagado y sin caché: el usuario **permanece autenticado** con el usuario best-effort; no hay logout (`auth-store.ts:147-164`).
- [ ] Con `GET /v1/auth/me` respondiendo **401** o **404**: se cierra la sesión y se redirige a `/login` (`auth-store.ts:39-45,159-161`). 404 es el código que `GetMeQuery` usa tanto para *NotFound* como para *AccountInactive* (comentario `auth-store.ts:29-33`).
- [ ] Con `GET /v1/auth/me` respondiendo **500**: el usuario **NO** es deslogueado (`auth-store.ts:159-164`).
- [ ] `expiresIn` exactamente igual a `Date.now()` ⇒ sesión expirada (comparación `<=`, `auth-store.ts:91`).
- [ ] `logout()` borra **solo** `AUTH_MODEL`; `token` y `currentUser` quedan obsoletos a propósito, por paridad con Angular (`auth-store.ts:303-307`).
- [ ] `logout()` **no** redirige si ya se está en `/login` o en `/` (`auth-store.ts:317-320`).

**Aserciones — .NET E2E (dato)**
- [ ] `GET /v1/auth/me` con token válido devuelve 200 y el usuario correcto.
- [ ] Token malformado → 401.
- [ ] Usuario inexistente → 404; usuario inactivo → 404, y una segunda llamada → 401 (token en lista negra).

**Estado de cobertura**: dato = YA CUBIERTO → `Auth/AuthMeTests.cs:29`, `Auth/AuthMeFailureTests.cs:17,25,40,63`, `Auth/AuthMePermissionsTests.cs:25,38,51,64,78,90`. UI = PARCIAL → vitest cubre la rama clave en `shared/lib/stores/__tests__/auth-store.test.ts:321,338,360` (incluye explícitamente *"does NOT call authHttpService.getMe when a valid cached session exists"*) y `auth-store.session-rejected.test.ts:68-124` (401/404 cierran; red caída y 500 no). **Falta**: la verificación en navegador real de que la recarga no emite tráfico.

---

### Bloque B — Ciclo de vida de tienda y plan

---

#### [S2-01] DG-7 — El OwnerAdmin activa el plan pago una sola vez, en una sola dirección

**User Story**
Como OwnerAdmin en plan gratuito, quiero activar el plan pago desde la edición de mi tienda, para habilitar los módulos pagos; y una vez en plan pago, no quiero poder volver atrás por accidente.

**Prioridad**: CRÍTICA
**Personas**: OwnerAdmin
**Endpoint(s)**: `PUT /v1/stores/{id}` (`management/stores/routes/edit-store.tsx:122`)

**Regla de negocio** — DG-7 "plan activation (owner, once)", declarada en `management/stores/components/store-form.tsx:72-83` y apuntando a `openspec/specs/billing/spec.md`.

El candado se calcula así:

```ts
const isOnPaidPlan = modules.some((m) => !m.priceIncluded && m.selected);  // store-form.tsx:83
<PlanPicker ... readOnly={!isSuperAdmin && isOnPaidPlan} />                // store-form.tsx:252
```

Y `readOnly` **no renderiza el botón** "Activar este plan". Las pestañas siguen navegables; `onChange` está cableado **solo** a ese botón, así que quitarlo impide estructuralmente disparar un cambio de plan (`plan-picker.tsx:9-15,97-106`).

**De dónde sale cada mitad de `isOnPaidPlan`** (verificado de punta a punta):
- `m.priceIncluded` viene del **catálogo** `GET /v1/modules/ToStore` (`Module → ModuleDto`, `ModuleProfile.cs:13-18`), porque el merge itera sobre `modulesRes.data` y **no** sobrescribe `priceIncluded` desde la tienda (`edit-store.tsx:62-74` solo pisa `currentPrice`, `price` y `discountText`).
- `m.selected` viene de la **pertenencia** del módulo a la tienda: `GET /v1/stores/{id}` devuelve **únicamente módulos activos**, por include filtrado `.Where(sm => sm.IsActive)` (`StoreRepository.cs:73`), y sus ids son ids de catálogo (`ModuleProfile.cs:22`).

La suposición sobre la que descansa el merge **se sostiene**. Nota fina: `StoreModule` guarda su propio snapshot `ModulePriceIncluded` (`ModuleProfile.cs:25`, `Domain/Entities/StoreModules/StoreModule.cs:14`), que el frontend **no** usa para este cálculo — si el catálogo cambiara el `PriceIncluded` de un módulo, el candado seguiría al catálogo, no al snapshot.

> ⚠️ **Contradicción verificada con la premisa del enunciado** — ver Hallazgo **H-1**. Una tienda creada por **auto-registro** recibe *todos* los módulos disponibles, **incluidos los pagos** (`RegisterCommand.cs:73,81-83`), lo que hace `isOnPaidPlan === true` desde el nacimiento. El test E2E existente lo confirma contra base real: `Billing/StoreCreationTrialTests.cs:359-361` asevera `PlanType == "Paid"` para una tienda auto-registrada, con el comentario *"Module 6 'Estadísticas' passes GetAvailableModulesToStore's filter, so a self-registered store always receives at least one paid module."* En consecuencia, **el camino "OwnerAdmin en plan gratuito activa el pago" no es alcanzable vía auto-registro**; requiere una tienda cuyo conjunto de módulos sea solo `priceIncluded` (creada por SuperAdmin, o degradada). Los escenarios de abajo están escritos sobre esa precondición explícita, no sobre el auto-registro.

**Precondiciones**
- Existe una tienda cuyos `StoreModules` activos son **todos** `priceIncluded` (plan gratuito).
- El usuario es OwnerAdmin de esa tienda y su `featureIds` incluye `EFeatures.Stores = 73` (requisito de `adminFeatureLoader` — `loaders.ts:107-113` → `featureGate` → `authorization-service.ts:31`).

**Flujo**
1. Navegar a `/management/stores` (renderiza el formulario unificado en modo edición).
2. En el selector de plan, elegir la pestaña "pago" y presionar "Activar este plan".
3. Guardar.
4. Recargar la pantalla.

**Aserciones — Playwright (UI)**
- [ ] **Plan gratuito**: el botón `STORES.PLAN.ACTIVATE` **se renderiza** en la pestaña no seleccionada (`plan-picker.tsx:97-106`, con `readOnly` falso porque `isOnPaidPlan` es falso — `store-form.tsx:83,252`).
- [ ] Al elegir el plan pago sin guardar, aparece el aviso `STORES.PLAN.WILL_ACTIVATE_ON_SAVE` (`plan-picker.tsx:108-110`).
- [ ] La badge `STORES.PLAN.ACTIVE_BADGE` marca la pestaña del plan **actualmente activo**, derivado de los módulos, no de la selección en curso (`plan-picker.tsx:24-25,70,79`).
- [ ] Guardar emite `PUT /v1/stores/{id}` con `moduleIds` = **todos** los módulos (gratis + pagos) al elegir "pago" (`plan-picker.tsx:26-27,49`).
- [ ] Tras guardar, la app refresca la sesión vía `getUserByToken()` y navega a `/management/stores` — **sin recargar la página** (`edit-store.tsx:132-139`).
- [ ] **Ya en plan pago**: el botón "Activar este plan" **no existe en el DOM** para el OwnerAdmin (`plan-picker.tsx:100`).
- [ ] **Ya en plan pago**: las pestañas siguen siendo clickeables y **ningún click cambia la selección** (`onChange` solo cuelga del botón — `plan-picker.tsx:47-50,101`).
- [ ] El campo `paymentStartDate` **no se renderiza** para un OwnerAdmin (solo `isSuperAdmin && isEditMode` — `store-form.tsx:217`).
- [ ] El campo `isActive` **no se renderiza** para un OwnerAdmin (solo `isSuperAdmin` — `store-form.tsx:234`).
- [ ] El selector de dueño está **deshabilitado** en modo edición (`store-form.tsx:188`).
- [ ] Un fallo al cargar tienda/módulos/dueños muestra `STORES.ERROR` y **no** monta el formulario (`edit-store.tsx:55-58,158-164`).

**Aserciones — .NET E2E (dato)**
- [ ] Agregar un módulo pago a una tienda con `PaymentStartDate == null` setea `PaymentStartDate` a **hoy** (`UpdateStoreCommand.cs:93-97`).
- [ ] Un `PUT` con **solo** módulos gratuitos deja `PaymentStartDate` en `null` (`UpdateStoreCommand.cs:96` — condición no se cumple).
- [ ] Agregar módulos a una tienda que ya tiene `PaymentStartDate` **no** cambia esa fecha (`UpdateStoreCommand.cs:96`).
- [ ] Un `PaymentStartDate` explícito en el body **solo** lo aplica un SuperAdmin (`UpdateStoreCommand.cs:100-101`); un OwnerAdmin que lo mande es ignorado.
- [ ] Un caller que no es SuperAdmin ni OwnerAdmin recibe **403** (`UpdateStoreCommand.cs:71-72`).
- [ ] `GET /v1/stores/{id}` devuelve **solo los módulos activos** de la tienda: el include está filtrado, `.Include(s => s.StoreModules.Where(sm => sm.IsActive))` (`Infrastructure/Persistence/Repositories/StoreRepository.cs:73`). Un módulo dado de baja por un `PUT` previo (que setea `IsActive = false`, `UpdateStoreCommand.cs:120`) desaparece de `StoreDto.Modules`.
- [ ] Los ids de `StoreDto.Modules` son **ids de catálogo**, no ids de fila: `ModuleDto.Id = StoreModule.ModuleId` (`Application/Mappings/Administration/ModuleProfile.cs:22`). Esto es lo que hace que el merge del frontend contra `/v1/modules/ToStore` empareje.
- [ ] `Description`, `Approved` e `IsActive` **solo** se escriben si el caller es SuperAdmin (`UpdateStoreCommand.cs:84-89`).
- [ ] Nombre duplicado en otra tienda → error de validación (`UpdateStoreCommand.cs:78-79`).
- [ ] Al desactivar módulos, sus `StoreRoleFeature` asociadas quedan `IsActive = false` (`UpdateStoreCommand.cs:124-130`).
- [ ] Al insertar módulos nuevos, se generan `StoreRoleFeature` para sus features (`UpdateStoreCommand.cs:163-171`).

**Estado de cobertura**: YA CUBIERTO (dato) → `backend/src/SMCA.WebApi.E2ETests/Billing/StoreActivationTests.cs:37` (módulo pago sobre `null` setea hoy), `:71` (solo gratuitos deja `null`), `:104` (fecha existente no cambia); `Stores/StoreUpdateTests.cs:36,70,95,123,140,161,180,197,201,205,209,213,217` (incluye OwnerAdmin no puede setear fecha de pago → 403, y route-id gana sobre body-id); `Stores/StoreAuthorizationTests.cs:54` (`OwnerAdmin_update_ignores_superadmin_only_fields` — el `PUT` de un OwnerAdmin aplica `Name`/`Address` pero deja `Description` en null, `Approved` en false e `IsActive` intacto, exactamente la rama `UpdateStoreCommand.cs:84-89`). PARCIAL (UI) → vitest cubre el candado en `management/stores/components/__tests__/store-form.test.tsx:408,426,446,464` y `plan-picker.test.tsx:141,156`. **NUEVO** en Playwright: las 11 aserciones de UI.

---

#### [S2-02] Regresión DG-7 — el candado no puede volver a colgarse de `paymentStartDate`

**User Story**
Como OwnerAdmin de una tienda recién creada, quiero conservar mi única activación de plan, para que el reloj de trial que arranca al nacer la tienda no me la consuma antes de haber elegido nada.

**Prioridad**: CRÍTICA
**Personas**: OwnerAdmin
**Endpoint(s)**: `PUT /v1/stores/{id}` (indirecto — el escenario prueba el render, no el guardado)

**El defecto que este escenario existe para cazar** — documentado en `store-form.tsx:72-82`: el candado leía `initialValues?.paymentStartDate != null`. Era un proxy correcto mientras el reloj de facturación arrancaba **solo** al agregar el primer módulo pago. Desde que **toda** tienda arranca su reloj al crearse (`CreateStoreService.cs:39-43`, comentario textual: *"Every created store starts its trial clock unconditionally (paid or free-only modules)"*), ese proxy gastaría la única activación del dueño **en el nacimiento de la tienda**, dejándolo fuera del plan pago para siempre.

**Precondiciones**
- Tienda con `PaymentStartDate != null` (siempre cierto post-creación) **y** cuyos módulos activos son todos `priceIncluded`.
- Usuario OwnerAdmin de esa tienda.

**Flujo**
1. Abrir la edición de la tienda.
2. Observar el selector de plan.

**Aserciones — Playwright (UI)**
- [ ] Con `paymentStartDate` **no nulo** y **cero** módulos pagos seleccionados, el botón "Activar este plan" **SÍ se renderiza** (`store-form.tsx:83` depende de `modules`, no de `paymentStartDate`).
- [ ] Este es el test de regresión: si alguien reintroduce `readOnly = !isSuperAdmin && initialValues?.paymentStartDate != null`, la aserción anterior falla.
- [ ] Simétrico: con `paymentStartDate` **nulo** pero un módulo pago seleccionado, el botón **NO** se renderiza (el candado sigue la condición real).

**Aserciones — .NET E2E (dato)**
- [ ] Una tienda creada por `CreateStoreService` con **solo** módulos gratuitos tiene igualmente `PaymentStartDate == hoy` (`CreateStoreService.cs:42-43`).
- [ ] Una tienda *legacy* sembrada esquivando `CreateStoreService` conserva `PaymentStartDate == null` (no hay retro-activación).

**Estado de cobertura**: dato = YA CUBIERTO → `Billing/StoreCreationTrialTests.cs:249` (`Create_with_free_only_modules_also_sets_paymentStartDate`), `:213`, `:232`, `:659` (`Legacy_stores_with_null_paymentStartDate_are_not_retro_activated`). UI = PARCIAL → `store-form.test.tsx:426` cubre "plan gratuito ⇒ picker interactivo" en vitest; **falta** el caso explícito que combina `paymentStartDate` no nulo **con** plan gratuito, que es el que ataca directamente la regresión. **NUEVO** en Playwright.
> **Nota para el usuario**: agregar ese caso de regresión sería un test **nuevo** (permitido). No implica modificar `store-form.test.tsx` existente.

---

#### [S2-03] Seguridad — un OwnerAdmin en `/management/stores/create` no puede crear una tienda

**User Story**
Como responsable del producto, quiero que un OwnerAdmin que navegue a la URL de creación de tiendas no pueda crear una segunda tienda, para que la creación de tiendas siga siendo una operación de SuperAdmin.

**Prioridad**: CRÍTICA (escenario de seguridad)
**Personas**: OwnerAdmin
**Endpoint(s)**: el escenario asevera que **`POST /v1/stores` NUNCA se emite**

**Mecanismo verificado — y es frágil.** La negativa no proviene de un guard. Proviene de la interacción de un `??` y un `Boolean()`:

```ts
// management/stores/routes/edit-store.tsx:33-34
const storeId    = paramId ?? user?.selectedStoreId ?? '';
const isEditMode = Boolean(storeId);
```

- La ruta `management/stores/create` **está registrada** y renderiza el mismo componente que `/management/stores` y `/management/stores/edit/:id` (`app/routes.ts:72-74`).
- `adminFeatureLoader([EFeatures.Stores])` deja pasar a un OwnerAdmin **si** su `featureIds` incluye `73` (`loaders.ts:107-113` → `featureGate` → `authorization-service.ts:31`). *Corrección de matiz respecto del enunciado: no lo deja pasar incondicionalmente.*
- Como todo OwnerAdmin tiene `selectedStoreId` (seteado en el registro — `RegisterCommand.cs:91`), `storeId` nunca es `''` ⇒ `isEditMode` es `true` ⇒ el componente edita **su propia tienda**.
- Solo un `selectedStoreId` vacío alcanza el modo creación — en la práctica, SuperAdmin.
- El comentario en `edit-store.tsx:15-26` declara esto **intencional**, por paridad byte-a-byte con Angular (`params.id || currentUser.selectedStoreId`).

**Precondiciones**
- OwnerAdmin autenticado con `selectedStoreId` no vacío y con la feature `Stores`.

**Flujo**
1. Navegar directamente a `/management/stores/create`.
2. Modificar el formulario y guardar.

**Aserciones — Playwright (UI)**
- [ ] El título es `STORES.EDIT_TITLE`, **no** `STORES.CREATE_TITLE` (`edit-store.tsx:178`).
- [ ] El botón de guardar muestra el ícono de edición, no el de "+" (`store-form.tsx:125`).
- [ ] El formulario aparece **pre-cargado** con los datos de la tienda propia — prueba de que se llamó `GET /v1/stores/{selectedStoreId}` (`edit-store.tsx:48-50`).
- [ ] Guardar emite **`PUT /v1/stores/{selectedStoreId}`** y **jamás `POST /v1/stores`** (`edit-store.tsx:120-131` vs `:141-148`).
- [ ] Tras guardar, se navega a `/management/stores`, **no** a `/management/users/create/` (que es el destino post-creación — `edit-store.tsx:139` vs `:149`).
- [ ] Un OwnerAdmin **sin** la feature `Stores` en `featureIds` es deslogueado y redirigido a `/login` (`loaders.ts:16-19,72-74`).
- [ ] Un StoreUser en esa URL es deslogueado y redirigido a `/login` (`adminLoader` — `loaders.ts:101-103`).

**Aserciones — .NET E2E (dato)**
- [ ] Tras el flujo por UI, la cantidad de filas `Store` del tenant es **la misma** que antes: no nació ninguna tienda.

> 🔴 **NEGATIVO DOCUMENTADO — el backend NO rechaza esto. No hay defensa en profundidad.** Ver Hallazgo **H-10**.
>
> `POST /v1/stores` **no tiene** `[HasPermission]` a nivel de acción (`SMCA.WebApi/Controllers/v1/StoresController.cs:83-85`), así que aplica el de clase: `[HasPermission(StoreRoleFeatures.SuperAdmin, StoreRoleFeatures.StoresAdmin)]` (`StoresController.cs:27`) — un OwnerAdmin con la feature `StoresAdmin` lo pasa. Y el handler admite explícitamente al OwnerAdmin: `if (!_httpContextService.IsSuperAdminOrOwnerAdmin) throw ...` (`CreateStoreCommand.cs:50-51`), donde `IsSuperAdminOrOwnerAdmin => IsSuperAdmin || IsOwnerAdmin` (`HttpContextService.cs:50`). Más aún, `CreateStoreCommand.cs:57-61` contiene una rama **dedicada al OwnerAdmin** que le reapunta el `SelectedStoreId` a la tienda nueva — es decir, el caso está *diseñado*, no olvidado.

- [ ] 🔴 Un OwnerAdmin con feature `StoresAdmin` que llama `POST /v1/stores` **directamente** (curl / Postman, salteando la UI) obtiene **201 Created** y la tienda se persiste (`StoresController.cs:83-90`, `CreateStoreCommand.cs:50-65`). Documentar este comportamiento tal cual: la única barrera real hoy es el colapso `??` + `Boolean()` del frontend.
- [ ] 🔴 Tras esa llamada directa, el `SelectedStoreId` del OwnerAdmin queda apuntando a la tienda **nueva**, no a la original (`CreateStoreCommand.cs:57-61`).
- [ ] Un caller que no es SuperAdmin ni OwnerAdmin recibe `ApiException` con **400 BadRequest** — no 403 (`CreateStoreCommand.cs:51`, `HttpStatusCode.BadRequest`).
- [ ] Sin token → **401** (comportamiento ya cubierto).

**Estado de cobertura**: PARCIAL.
- **Anónimo → 401: YA CUBIERTO** → `Stores/StoreCreateTests.cs:101` (`Create_without_token_returns_401`).
- **SuperAdmin crea: YA CUBIERTO** → `Stores/StoreCreateTests.cs:22,52,56,60,64,68,72` (persistencia + 5 validaciones 400 + nombre duplicado).
- **StoreUser / ReSeller no alcanzan el controller: YA CUBIERTO** → `Stores/StoreRoleAccessTests.cs:15,27` (ambos 403 sobre `GET /by-current-user`).
- **OwnerAdmin sobre `POST /v1/stores`: NUEVO — no existe ningún test.** Verificado leyendo `StoreCreateTests.cs` y `StoreAuthorizationTests.cs` completos: en el primero, las cuatro llamadas al endpoint (`:32,84,89,104`) autentican como SuperAdmin; en el segundo, la persona OwnerAdmin solo se ejercita contra `GET /by-current-user`, `POST /approve`, `POST /disapprove` y `PUT /{id}`.
- **Cobertura adyacente de OwnerAdmin ya existente** → `Stores/StoreAuthorizationTests.cs:16` (alcanza el controller), `:30` y `:42` (approve/disapprove → 403), `:54` (el `PUT` ignora en silencio los campos exclusivos de SuperAdmin).
- **UI**: NUEVO en Playwright. En vitest, `store-form.test.tsx:464` cubre "modo creación ⇒ picker interactivo", que es el lado opuesto.

---

### Bloque C — Gestión de usuarios

---

#### [S3-01] Exportar el roster de aprovisionamiento

**User Story**
Como OwnerAdmin, quiero exportar el roster cifrado de mi tienda a un archivo, para aprovisionar un dispositivo que deba operar sin internet.

**Prioridad**: ALTA
**Personas**: OwnerAdmin
**Endpoint(s)**: `GET /v1/storeusers/{storeId}/offline-roster` (`management/users/components/roster-export-panel.tsx:45`)

> **No confundir con sync export/import.** Aquél es archivo puro sin API; éste **sí** es una llamada HTTP cuyo resultado se serializa y se descarga (`roster-export-panel.tsx:45-58`). Alimenta `auth/routes/provision.tsx`.

**Precondiciones**
- OwnerAdmin autenticado con feature `Users` (`user-list.tsx:12` — `adminFeatureLoader([EFeatures.Users])`).
- Navegador online y `selectedStoreId` no vacío.

**Flujo**
1. Ir a `/management/users`.
2. Presionar "Exportar roster".
3. Ingresar la contraseña maestra y confirmar.

**Aserciones — Playwright (UI)**
- [ ] El botón está **deshabilitado** si el navegador está offline **o** si `selectedStoreId` está vacío (`roster-export-panel.tsx:33,74`).
- [ ] Confirmar con contraseña maestra vacía muestra `SYNC.ERROR_EMPTY_PASSWORD` y **no** emite petición (`roster-export-panel.tsx:38-41`).
- [ ] La confirmación exitosa dispara exactamente un `GET /v1/storeusers/{storeId}/offline-roster` (`roster-export-panel.tsx:45`).
- [ ] Se descarga un archivo llamado `roster-{storeId}.smcabundle` (`roster-export-panel.tsx:56`).
- [ ] El contenido descargado **no** es el JSON crudo del servidor. `serializeRoster` (`shared/lib/offline/roster-serializer.ts:55-66`) produce un **ZIP cifrado con AES de una sola entrada** llamada `roster.json` (`roster-serializer.ts:25,63`), cuya contraseña es la concatenación **`${master}${storeId}`** — la maestra primero (`roster-serializer.ts:43-48`).
- [ ] Los bytes descargados empiezan con la firma ZIP `PK\x03\x04`, no con `{`.
- [ ] El archivo **round-trip**: `deserializeRoster(payload, master, storeId)` devuelve el bundle original (`roster-serializer.ts:74-82`), y ese es el camino que consume `auth/routes/provision.tsx`.
- [ ] Una contraseña maestra incorrecta al importar produce `WrongPasswordError`, y un archivo estructuralmente inválido produce `CorruptFileError` — son errores **distintos** (`roster-serializer.ts:27-41,88`).
- [ ] El `storeId` es parte de la contraseña: un bundle de la tienda A **no** se puede abrir con la misma maestra desde la tienda B (`roster-serializer.ts:47`).
- [ ] Tras el éxito, el panel se cierra y el campo de contraseña se limpia (`roster-export-panel.tsx:60-61`).
- [ ] Un fallo de la petición muestra `USERS.ERROR` y **mantiene** el panel abierto (`roster-export-panel.tsx:62-63`).
- [ ] El toggle de visibilidad de contraseña alterna `SYNC.SHOW_PASSWORD` / `SYNC.HIDE_PASSWORD` (`roster-export-panel.tsx:98-100`).

**Aserciones — .NET E2E (dato)**
- [ ] Un OwnerAdmin puede exportar el roster de **su propia** tienda; el de una tienda ajena es rechazado.
- [ ] Un StoreUser sin permiso recibe **403**.
- [ ] `ExpiresAt = IssuedAt + ttlDays`, con `ttlDays` leído de `SystemConfiguration` (`Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs:147,153`).
- [ ] Sin fila de configuración, el TTL cae al **default de 35 días** (`Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs:46-49`). Semilla `"35"` en `Infrastructure/Persistence/EntityConfigurations/SystemConfigurationEntityTypeConfiguration.cs:38-39`.
- [ ] Cada usuario del bundle lleva `PaymentDueDate`, `IsInTrial` y `PaymentStatus` derivados del resumen de facturación (`ExportOfflineRosterQuery.cs:140-142`).
- [ ] Una tienda `Vencido` exporta **solo** módulos `priceIncluded`.

**Estado de cobertura**: YA CUBIERTO (dato) → `backend/src/SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs:34,85,109,128,153,176,193,278,310,348,379,443,477,511,559` — incluye `:443` TTL configurado = 7 aplicado, y `:477` sin fila ⇒ default **35**. También `Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs:39-274`. UI = PARCIAL → `management/users/components/__tests__/roster-export-panel.test.tsx:44,50,56,61,80` cubre habilitación/deshabilitación y la serialización, en vitest. **NUEVO** en Playwright, en particular la **descarga real del archivo**.

---

#### [S3-02] Crear cuenta StoreUser

**User Story**
Como OwnerAdmin, quiero dar de alta empleados en mi tienda, para que operen la caja con su propia cuenta.

**Prioridad**: ALTA
**Personas**: OwnerAdmin
**Endpoint(s)**: `POST /v1/storeusers` (`management/users/routes/user-create.tsx:42`)

**Precondiciones**
- OwnerAdmin autenticado con feature `Users` (`user-create.tsx:11`).
- `selectedStoreId` no vacío, o `:storeId` en la ruta.

**Flujo**
1. Ir a `/management/users` y presionar "crear", o llegar a `/management/users/create/:storeId` tras crear una tienda.
2. Completar el formulario y enviar.

**Aserciones — Playwright (UI)**
- [ ] El payload incluye **siempre** `roleIds: [3]` (`ERoles.StoreUser`), *hardcodeado* — no hay selector de rol en la pantalla (`user-create.tsx:49`; `enums/index.ts:4`).
- [ ] El `storeId` del payload resuelve como `paramStoreId ?? user.selectedStoreId` (`user-create.tsx:20,43`).
- [ ] Sin `storeId` resoluble, la pantalla **redirige** a `/management/stores` y no renderiza nada (`user-create.tsx:25-29,59-61`).
- [ ] Offline: el submit **retorna sin emitir petición** (`user-create.tsx:38`).
- [ ] Éxito → navega a `/management/users` (`user-create.tsx:51`).
- [ ] Fallo → muestra `USERS.ERROR` y permanece en la pantalla (`user-create.tsx:52-53`).
- [ ] Un StoreUser en esta ruta es deslogueado y redirigido a `/login` (`adminFeatureLoader` → `adminLoader` — `loaders.ts:101-103`).

**Aserciones — .NET E2E (dato)**
- [ ] `POST /v1/storeusers` con `roleIds: [StoreUser]` → 200 y usuario persistido con ese rol.
- [ ] `login` duplicado → 400.
- [ ] Sin token → 401.

**Estado de cobertura**: YA CUBIERTO (dato) → `Users/StoreUsersCrudTests.cs:17` (crea con `RoleIds = [RoleType.StoreUser]`), `:43` duplicado → 400, `:80` sin token → 401, `:95` get. UI = PARCIAL → el payload con `roleIds:[3]` está aseverado a nivel de servicio HTTP en `management/users/lib/services/__tests__/user-http-service.test.ts:80`; el test de ruta (`user-routes.test.tsx:337`) ejercita el flujo pero **no** asevera el valor de `roleIds`. **NUEVO** en Playwright.

---

#### [S3-03] Listar, editar, activar y dar de baja usuarios

**User Story**
Como OwnerAdmin, quiero ver, editar y dar de alta/baja a los usuarios de mi tienda, para administrar el acceso de mi equipo.

**Prioridad**: ALTA
**Personas**: OwnerAdmin
**Endpoint(s)**: `GET /v1/users/all/true`, `GET /v1/users/{id}`, `PUT /v1/users/{id}`, `DELETE /v1/users/{id}`, `POST /v1/users/activate` (`management/users/lib/services/user-http-service.ts:22-65`)

**Precondiciones**
- OwnerAdmin autenticado con feature `Users`.

**Flujo**
1. Ir a `/management/users` — la lista se carga una sola vez al montar.
2. Editar un usuario, guardar.
3. Desactivar un usuario; luego reactivarlo.

**Aserciones — Playwright (UI)**
- [ ] Al montar se emite **exactamente un** `GET /v1/users/all/true`; navegar dentro de la pantalla no la re-dispara (fetch *mount-only* — `user-list.tsx:38-41`).
- [ ] Nótese `all/true`: la ruta es **literal** con `includeInactive=true`, así que la lista **incluye usuarios inactivos** (`user-http-service.ts:24`).
- [ ] **La acción "desactivar" emite `DELETE /v1/users/{id}`, no `POST /v1/users/activate`** (`user-list.tsx:73` → `userHttpService.deleteUser`).
- [ ] La acción "activar" emite `POST /v1/users/activate` con `{ id, isActive: true }` (`user-list.tsx:72`; `user-http-service.ts:52-57`).
- [ ] Consecuencia: **la UI nunca llama `activate` con `isActive:false`** — ese semi-endpoint queda sin ejercitar desde la pantalla (`user-list.tsx:72-73`).
- [ ] Toda acción de ciclo de vida **no hace nada** si el navegador está offline (`user-list.tsx:47`).
- [ ] Una acción exitosa **recarga la lista** (`user-list.tsx:50`).
- [ ] Una acción fallida muestra `USERS.LIFECYCLE_ERROR` — mensaje distinto al de fallo de carga, que es `USERS.ERROR` (`user-list.tsx:27,53`).
- [ ] Editar emite `PUT /v1/users/{id}` y navega a `/management/users` (`management/users/routes/user-edit.tsx:59-60`).
- [ ] Un StoreUser en `/management/users` es deslogueado y redirigido a `/login` (`user-list.tsx:12` → `adminLoader`).
- [ ] 🔴 **No existe scoping por tienda del lado cliente.** `/management/users/edit/:id` toma el id **de la URL** y hace `getUserById(userId)` sin ninguna comprobación de pertenencia (`user-edit.tsx:21,32-47`). Navegar a mano al id de un usuario ajeno **carga el formulario** si el servidor devuelve el usuario. Aserción: la protección real, si existe, es del servidor. Ver Hallazgo **H-11**.
- [ ] El toggle "activo" solo se renderiza para SuperAdmin u OwnerAdmin (`user-edit.tsx:24,106`).

**Aserciones — .NET E2E (dato)**
- [ ] `GET /v1/users/all/true` incluye usuarios inactivos; con `false` los excluye.
- [ ] SuperAdmin y OwnerAdmin-con-feature obtienen 200; StoreUser y ReSeller obtienen 403; sin token, 401.
- [ ] `DELETE /v1/users/{id}` es un **soft delete** (la fila sobrevive con la bandera cambiada).
- [ ] `POST /v1/users/activate` con `true` activa y con `false` desactiva.
- [ ] `PUT /v1/users/{id}` con body parcial **preserva** email y teléfono; omitir `isActive` preserva el estado.
- [ ] Un SuperAdmin no puede borrarse a sí mismo → 400.
- [ ] 🆕 **Aislamiento entre tiendas / tenants en `PUT /v1/users/{id}`.** El handler **no** hace ninguna comprobación de tienda ni de tenant: su único guard es `if (request.Id != <yo> && !IsSuperAdminOrOwnerAdmin) → 404` (`Application/Features/UserManagement/Users/Commands/UpdateUser/UpdateUserCommand.cs:49-50`). Cualquier OwnerAdmin pasa ese guard para **cualquier** id. La única barrera posible es el filtro global de tenant sobre `User` (`Infrastructure/Persistence/EntityConfigurations/UserEntityTypeConfiguration.cs:22-24`), pero la búsqueda usa `FindAsync` (`Infrastructure/Persistence/Repositories/GenericRepository.cs:82-85`). **El test debe determinar empíricamente el resultado** — 404 (filtro aplicado) o 200 (filtro esquivado). No lo afirmo por lectura; es exactamente lo que este test existe para descubrir. Ver Hallazgo **H-11**.
- [ ] 🆕 Un OwnerAdmin editando un usuario de **otra tienda del mismo tenant**: sin scoping por tienda en el handler, se espera que **funcione**. Confirmarlo o refutarlo.

**Estado de cobertura**: PARCIAL (dato) → YA CUBIERTO: `Users/UsersListTests.cs:25,38,50,62,74,81,101,121,134`; `Users/UsersGetByIdTests.cs:26,39,52,59,72`; `Users/UsersUpdateTests.cs:17,31,44,57,65,79,93,115,139,162,185,208,229`; `Users/UsersDeleteTests.cs:20,46,63,70,91`; `Users/UsersActivateTests.cs:20,46,72,89`.
**NUEVO (dato)**: el aislamiento cross-store / cross-tenant. Verificado por lectura: el test más cercano es `Users/UsersUpdateTests.cs:208` (`Update_owner_admin_edits_staff_returns_200`), pero el usuario objetivo se siembra con `UserSeed.SeedUserWithRolesAsync`, documentado como *"Creates a User with the specified roles (no Owner/Store graph)"* (`Infrastructure/UserSeed.cs:27`) — o sea, **sin tienda alguna**, y en el **mismo** tenant por defecto (`UserSeed.cs:31,49`). No es un caso cross-store ni cross-tenant. Grep de `OtherTenant|SecondTenant|DifferentTenant|Tenant2` sobre toda la suite E2E: cero resultados.
**NUEVO (UI)** en Playwright: las 12 aserciones, en especial el mapeo desactivar→`DELETE`, que `activate(false)` es inalcanzable desde la pantalla, y la ausencia de scoping por tienda en `/management/users/edit/:id`.

---

### Bloque D — Perfil propio

---

#### [S4-01] Editar el perfil propio

**User Story**
Como OwnerAdmin o StoreUser, quiero actualizar mi nombre, teléfono y correo, para mantener mis datos al día.

**Prioridad**: MEDIA
**Personas**: ambas
**Endpoint(s)**: `PUT /v1/users/{userId}` (`profile/routes/edit-profile.tsx:37` → `profile/lib/services/profile-http-service.ts:21-22`)

**Precondiciones**
- Usuario autenticado con feature `Profile = 70` (`edit-profile.tsx:10`). El guard es `featureLoader`, que **sí** tiene el bypass OwnerAdmin/SuperAdmin (`loaders.ts:89-91`).

**Flujo**
1. Ir a la edición de perfil.
2. Cambiar los datos y guardar.

**Aserciones — Playwright (UI)**
- [ ] El formulario aparece pre-cargado con `fullName`, `cellPhone` y `email` del usuario en sesión (`edit-profile.tsx:20-24`).
- [ ] El payload incluye `isActive: user.isActive` — la pantalla **reenvía** el estado actual, no lo edita (`edit-profile.tsx:41`).
- [ ] Éxito muestra `PROFILE.UPDATE_SUCCESS` y **permanece** en la pantalla; no navega (`edit-profile.tsx:54`).
- [ ] Fallo muestra `PROFILE.UPDATE_ERROR` (`edit-profile.tsx:55-56`).
- [ ] Tras el éxito, el usuario en sesión queda actualizado **sin recargar la página** (`updateUser` — `edit-profile.tsx:53`).
- [ ] `updateUser` **preserva** el `expiresIn` vigente, de modo que editar el perfil nunca acorta ni cierra la sesión (`auth-store.ts:179-182`).
- [ ] Offline: el formulario deshabilita el envío (`edit-profile.tsx:66` pasa `isOnline` al formulario).
- [ ] La contraseña nunca viaja en el payload (`UpdateProfilePayload` no la declara — `profile-http-service.ts:4-9`).

**Aserciones — .NET E2E (dato)**
- [ ] `PUT /v1/users/{id}` sobre uno mismo → 200 y campos persistidos.
- [ ] Body parcial preserva email y teléfono; `cellPhone` vacío **sí** limpia el valor.
- [ ] Omitir `isActive` preserva el estado; un StoreUser con feature `Profile` conserva su propio `isActive`.
- [ ] Editar a **otro** usuario teniendo solo la feature `Profile` → 404 (envelope).

**Estado de cobertura**: YA CUBIERTO (dato) → `Users/UsersUpdateTests.cs:17,93,115,139,162,229`. UI = PARCIAL → `profile/components/__tests__/edit-profile-form.test.tsx` (12 casos: pre-carga, máscara de teléfono, requeridos, formato de email, offline deshabilita, payload en `:200`) en vitest. **NUEVO** en Playwright.

---

#### [S4-02] Cambiar la contraseña propia

**User Story**
Como OwnerAdmin o StoreUser, quiero cambiar mi contraseña, para recuperar el control de mi cuenta si sospecho que se filtró.

**Prioridad**: ALTA
**Personas**: ambas
**Endpoint(s)**: `POST /v1/users/change-password/{userId}` (`profile/routes/change-password.tsx:25` → `profile-http-service.ts:32-33`)

**Precondiciones**
- Usuario autenticado con feature `Profile` (`change-password.tsx:10`).

**Flujo**
1. Ir a la pantalla de cambio de contraseña.
2. Ingresar contraseña actual y nueva; enviar.

**Aserciones — Playwright (UI)**
- [ ] El payload es exactamente `{ oldPassword, newPassword }` (`change-password.tsx:19,25`; `profile-http-service.ts:11-14`).
- [ ] Un cambio exitoso **cierra la sesión** y redirige a `/login` — el redirect lo hace `logout()`, no la pantalla (`change-password.tsx:28`; `auth-store.ts:303-321`).
- [ ] Tras el logout, `AUTH_MODEL` desaparece de `localStorage` (`auth-store.ts:307`).
- [ ] Tras el logout, la DEK en memoria queda liberada (`clearDek()` — `auth-store.ts:312`).
- [ ] Un fallo muestra `PROFILE.UPDATE_ERROR` y **NO** cierra la sesión (`change-password.tsx:29-30` — `logout()` está solo en la rama de éxito).
- [ ] Offline: el envío está deshabilitado (`change-password.tsx:39`).
- [ ] Tras el cambio, la contraseña **anterior** ya no permite iniciar sesión y la nueva sí.

**Aserciones — .NET E2E (dato)**
- [ ] Cambio propio → 200 y re-login con la nueva contraseña funciona.
- [ ] Contraseña actual incorrecta → 400.
- [ ] Contraseña nueva débil → 400.
- [ ] Un StoreUser sin permiso cambiando la de otro → 403.
- [ ] Un OwnerAdmin del mismo tenant → 200; de otro tenant → 404.

**Estado de cobertura**: YA CUBIERTO (dato) → `Users/UsersChangePasswordTests.cs:22,55,73,101,119,141,162,181`. UI = PARCIAL → `profile/components/__tests__/change-password-form.test.tsx` (9 casos: regex, mismatch, offline, toggle de visibilidad, payload en `:154`) en vitest. **NUEVO** en Playwright — en particular el **logout forzado** y el re-login con la contraseña nueva.

---

## 5. AUTH-INV-01 — La expiración de autenticación debe ser 35 días

**Regla del usuario**: **35 días en todos los casos** — frontend y backend, online y offline.

### Estado actual verificado

| Dónde | Valor | Evidencia (leída) |
|---|---|---|
| JWT access token | **35 d** ✅ | `backend/src/SMCA.WebApi/appsettings.json:79` (`Jwt.TokenLifetimeDays`); `backend/src/SMCA.WebApi/Authentication/JwtProvider.cs:34,41` (fallback 35) |
| `Authentication.TokenLifetimeDays` | **35 d** ✅ | `backend/src/Application/Abstractions/Authentication/AuthenticationSettings.cs:11`; `appsettings.json:87` |
| TTL del roster offline | **35 d** ✅ | semilla en `Infrastructure/Persistence/EntityConfigurations/SystemConfigurationEntityTypeConfiguration.cs:38-39`; fallback en `Infrastructure/Persistence/Repositories/SystemConfigurationRepository.cs:46-49`; consumo en `ExportOfflineRosterQuery.cs:147,153` |
| Sesión cacheada del frontend | **35 d** ✅ | `frontend-react/apps/web-store-pos/app/shared/lib/stores/auth-store.ts:16` (`THIRTY_FIVE_DAYS_MS`) |
| **Refresh token** | **7 d** ❌ | `AuthenticationSettings.cs:12`; `appsettings.json:88`; `LoginCommand.cs:56`; `RefreshCommand.cs:67` |

### [AUTH-INV-01] El refresh token debe vivir 35 días

**User Story**
Como usuario de un punto de venta offline-first, quiero que **toda** mi ventana de autenticación dure 35 días, para que ningún componente me expulse antes que otro.

**Prioridad**: CRÍTICA
**Personas**: ambas
**Endpoint(s)**: `POST /v1/auth/login`, `POST /v1/auth/refresh`

**Aserciones — Playwright (UI)**
- [ ] — (no aplica): el refresh token no es observable desde la UI. El cliente estampa su propia expiración de sesión (`auth-store.ts:220`) y nunca lee la del servidor.

**Aserciones — .NET E2E (dato)**

> 🔴 **ESTE TEST HOY FALLA — DEFECTO DOCUMENTADO, NO LO "ARREGLES" TOCANDO EL TEST.**
> El rojo es intencional: registra el bug en lugar de esconderlo. La forma correcta de ponerlo en verde es **cambiar el código** (`AuthenticationSettings.cs:12` y `appsettings*.json`) a 35 días, nunca cambiar la aserción a 7.

- [ ] 🔴 Tras `POST /v1/auth/login`, la fila `RefreshToken` persistida expira en `UtcNow + 35 días` (`LoginCommand.cs:56-57`). **Hoy da 7 días** → `AuthenticationSettings.cs:12`.
- [ ] 🔴 Tras `POST /v1/auth/refresh`, el nuevo refresh token expira en `UtcNow + 35 días` (`RefreshCommand.cs:67-68`). **Hoy da 7 días**.
- [ ] 🔴 `AuthDto.RefreshTokenExpiresAt` de la respuesta de login es `UtcNow + 35 días` (`LoginCommand.cs:65`; `AuthDto.cs:8`). **Hoy da 7 días**.
- [ ] ✅ El JWT emitido expira en `UtcNow + 35 días` (`JwtProvider.cs:34,41`). Este ya está en verde y ya cubierto.
- [ ] ✅ El bundle de roster expira en `IssuedAt + 35 días` cuando no hay fila de configuración (`SystemConfigurationRepository.cs:46-49`). Ya en verde y ya cubierto.

**Estado de cobertura**: PARCIAL.
- **35 d del JWT: YA CUBIERTO** → `backend/src/Application.Tests/Authentication/JwtProviderTests.cs:21` (con `TokenLifetimeDays=35`, `ValidTo` cae dentro de 5 minutos de `UtcNow.AddDays(35)`), y `:37` prueba que es configurable, no fijo.
- **35 d del roster: YA CUBIERTO** → `Users/ExportOfflineRosterTests.cs:477` (`SuperAdmin_export_deletedTtlRow_usesDefault35`), `:443` (TTL configurado = 7).
- **35 d de la sesión frontend: YA CUBIERTO (vitest)** → `shared/lib/stores/__tests__/auth-store.test.ts:110`.
- **Vida del refresh token: NUEVO — no existe ningún test.** No hay test E2E de `POST /v1/auth/refresh` en absoluto (grep de `auth/refresh` en la suite E2E: cero resultados). Los tests unitarios en `Application.Tests/Authentication/Commands/Refresh/RefreshCommandHandlerTests.cs:53,77,99,121,148` construyen los `RefreshToken` **a mano** con `AddDays(7)` / `AddDays(-1)`; **ninguno** asevera que la vida derivada de la configuración se aplique.
  > **Nota para el usuario**: esos tests unitarios usan `RefreshTokenExpirationDays = 7` como *fixture* (líneas 40-41). Si algún día el código pasa a 35, esos valores del fixture quedarán desalineados. Esto es información, no una propuesta de cambio: **no toqué nada** y cualquier ajuste sobre tests existentes requiere tu autorización.

---

## 6. Hallazgos

Hechos con evidencia, encontrados al escribir el catálogo. No son recomendaciones.

### H-1 — Una tienda auto-registrada nace en plan **pago**, no gratuito

`RegisterCommand.cs:73,81-83` le pasa a `CreateStoreAsync` **todos** los ids de `GetAvailableModulesToStore()`. Ese filtro (`ModuleRepository.cs:17-23`) no discrimina por `PriceIncluded`: devuelve todo módulo activo y disponible para tienda. Por lo tanto la tienda recibe módulos pagos desde el minuto cero.

Confirmado contra base de datos real por un test ya existente: `Billing/StoreCreationTrialTests.cs:359-361` asevera `PlanType == "Paid"` para una tienda auto-registrada, con el comentario textual *"Module 6 'Estadísticas' passes GetAvailableModulesToStore's filter, so a self-registered store always receives at least one paid module."*

Consecuencia sobre DG-7: como `isOnPaidPlan = modules.some(m => !m.priceIncluded && m.selected)` (`store-form.tsx:83`), el candado engancha **inmediatamente** en toda tienda nacida del auto-registro. El recorrido "OwnerAdmin en plan gratuito activa el plan pago" **no es alcanzable por esa vía**.

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

`shared/lib/offline/idle-timeout.ts:11` define `ONE_HOUR_MS = 3_600_000`, usado como default de `createIdleTimer`. Eso es **inactividad**: cierra por no usar la app. La vida de la sesión son los 35 días. Son dos relojes distintos y no deben confundirse en ninguna lectura de este catálogo.

### H-5 — `openspec/specs/billing/spec.md` está **desactualizado** respecto del código en la regla del candado

La tabla del spec (líneas 13-15) dice:

> `Activation | Set to DateOnly.FromDateTime(DateTime.UtcNow) on first paid-module add while null`
> `Lock | Once non-null, OwnerAdmin cannot change modules (plan is locked).`

El código ya no hace lo segundo. `CreateStoreService.cs:39-43` arranca el reloj **en toda** creación de tienda, y el candado del frontend se movió a `isOnPaidPlan` justamente porque el criterio del spec habría consumido la única activación del dueño al nacer la tienda (`store-form.tsx:72-82`). El backend, en cambio, **sí** conserva la activación-al-primer-módulo-pago (`UpdateStoreCommand.cs:91-97`) — que hoy solo alcanza a tiendas cuyo `PaymentStartDate` sea `null`, es decir, tiendas *legacy*.

El enunciado de este trabajo describía ese spec como "la fuente de verdad de la regla de negocio". Para DG-7 **ya no lo es**: la fuente de verdad vigente es el código más su comentario en `store-form.tsx:72-83`.

### H-6 — "Desactivar usuario" en la UI emite `DELETE`, no `activate(false)`

`user-list.tsx:72-73`:

```tsx
onActivate={(id) => handleLifecycleAction((userId) => userHttpService.activateUser(userId, true), id)}
onDeactivate={(id) => handleLifecycleAction(userHttpService.deleteUser, id)}
```

`POST /v1/users/activate` **solo** se invoca con `isActive: true`. La mitad `false` del endpoint existe en el servicio (`user-http-service.ts:52-57`) pero ninguna pantalla la alcanza. El `DELETE` correspondiente es un *soft delete* del lado servidor, así que el efecto neto es coherente — pero la cobertura E2E de `activate(false)` solo puede llegar por API directa, nunca por UI.

### H-7 — `adminFeatureLoader` **no** deja pasar a cualquier OwnerAdmin

Corrige el enunciado de este trabajo. `adminFeatureLoader` encadena `adminLoader` (exige `isSuperAdmin || isOwnerAdmin` — `loaders.ts:101-103`) **y luego** `featureGate`, que para un OwnerAdmin exige que `user.featureIds` contenga el feature pedido (`authorization-service.ts:31`). El bypass amplio de OwnerAdmin existe solo en `featureLoader` (`loaders.ts:89-91`) y está **deliberadamente aislado** de las cadenas admin/reseller (comentario en `loaders.ts:61-64`). Un OwnerAdmin sin la feature `Stores` es **deslogueado** al entrar a `/management/stores/create`, no simplemente redirigido.

### H-8 — Un fallo de autorización desloguea, no muestra "no autorizado"

`denyAccess()` llama `logout()` **y** redirige a `/login` (`loaders.ts:16-19`). No existe una ruta `/unauthorized`. Cualquier escenario de Playwright que espere un mensaje de "acceso denegado" fallará: el resultado observable es **pérdida de sesión**.

### H-9 — El campo `email` del registro no tiene validación de cliente

`register.tsx:63-89` valida `fullName`, `login`, `cellPhone`, `storeName`, `password` y `passwordConfirmation`. No hay rama para `email`. Un registro con email vacío llega a la API. (En el backend, `RegisterCommand` declara `string? Email` — `RegisterCommand.cs:21`.)

### H-10 — 🔴 El backend **permite** que un OwnerAdmin cree tiendas; la única barrera es un accidente del frontend

Este es el hallazgo más serio del relevamiento, y **corrige** lo que el escenario S2-03 asumía antes.

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

Traducido: *"o sos vos mismo, o sos admin"*. Ningún OwnerAdmin es rechazado por editar a un usuario de otra tienda. Lo único que podría frenarlo es el filtro global de tenant sobre `User` (`UserEntityTypeConfiguration.cs:22-24`), pero la búsqueda entra por `FindAsync` (`GenericRepository.cs:82-85`) — **no determiné por lectura si ese camino aplica el filtro**, y por eso el catálogo lo plantea como aserción a resolver empíricamente en S3-03, no como afirmación.

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

`AuthController.cs:44` (`refresh`) y `:57` (`revoke`) no llevan `[EnableRateLimiting]`, a diferencia de `login` y `register`. Sumado a que `refresh` no tiene ningún test E2E (ver AUTH-INV-01), es superficie sin cobertura ni límite.

---

## 7. ⚠️ No verificado

**Los 8 huecos de la primera versión de este documento fueron cerrados.** Quedan cero ítems abiertos.

Bitácora de cierre, para que el próximo lector sepa qué se resolvió y dónde vive ahora:

| # | Hueco original | Resolución | Dónde quedó |
|---|---|---|---|
| 1 | Rechazo de `POST /v1/stores` para OwnerAdmin | **Negativo documentado**: el backend NO lo rechaza | S2-03 (aserciones 🔴) + **H-10** |
| 2 | `Store.Inactive` → 403 | **Negativo documentado**: el mapeo existe, ningún test lo cubre | S1-02 (aserción 🆕) |
| 3 | Contenido de `StoreAuthorizationTests` / `StoreCreateTests` / `StoreRoleAccessTests` | **Leídos completos**: 15 tests catalogados | Líneas `Estado de cobertura` de S2-01 y S2-03 |
| 4 | Scoping por tienda en `/management/users/edit/:id` | **Negativo documentado**: no existe en el cliente ni en el handler | S3-03 (aserciones 🔴/🆕) + **H-11** |
| 5 | `resolveUserHomePath` | **Resuelto**: dos ramas, tabla completa por persona | S1-02 (tabla + 6 aserciones), S1-01, S1-03 |
| 6 | Formato de `serializeRoster` | **Resuelto**: ZIP AES de una entrada, password `${master}${storeId}` | S3-01 (5 aserciones) |
| 7 | Umbrales de rate limiting | **Resuelto**: login 5/1min, register 10/10min, por IP, hardcodeados | S1-01, S1-02 + **H-12**, **H-13** |
| 8 | ¿`GET /v1/stores/{id}` devuelve solo módulos activos? | **Resuelto y la suposición del frontend SE SOSTIENE** | S2-01 (bloque "De dónde sale cada mitad") |

### Una sola incógnita deliberada, planteada como test y no como afirmación

En S3-03, la aserción sobre **aislamiento cross-tenant de `PUT /v1/users/{id}`** queda escrita como pregunta a responder ejecutando el test, no como afirmación. Lo que **sí** está verificado por lectura es lo estructural: el handler no tiene guard de tienda ni de tenant (`UpdateUserCommand.cs:49-50`) y la búsqueda entra por `FindAsync` (`GenericRepository.cs:82-85`). Lo que **no** determiné leyendo es si ese camino de acceso aplica el filtro global de tenant de `User` (`UserEntityTypeConfiguration.cs:22-24`). Es una semántica del ORM, no del código de este repo, y prefiero que la conteste una corrida real contra base antes que afirmarla.

---

## 8. Resumen de cobertura

| Bloque | Escenarios | Estado |
|---|---|---|
| A — Sesión y acceso | 4 (S1-01 … S1-04) | Dato PARCIAL (falta tienda inactiva + rate limit); UI Playwright toda nueva |
| B — Ciclo de vida de tienda y plan | 3 (S2-01, S2-02, S2-03) | S2-01/S2-02 dato cubierto; **S2-03 destapó un agujero de autorización real** |
| C — Gestión de usuarios | 3 (S3-01 … S3-03) | Dato cubierto salvo aislamiento cross-store; UI Playwright toda nueva |
| D — Perfil propio | 2 (S4-01, S4-02) | Dato cubierto; UI Playwright toda nueva |
| AUTH-INV-01 | 1 invariante transversal | Refresh token: sin ningún test — y el que se especifica **hoy falla** |

**Totales**: 13 escenarios + 1 invariante. `YA CUBIERTO` 0 · `PARCIAL` 12 · `NUEVO` 2 (S2-03 y el test de vida del refresh token). Ningún escenario está completo en ambas capas, porque **ninguno** tiene cobertura Playwright.

**Playwright hoy**: solo `frontend-react/e2e/smoke.spec.ts` con dos tests de infraestructura (`:12` el formulario de login renderiza; `:19` la raíz responde). Ninguna de las operaciones de este catálogo tiene cobertura de navegador.

**Rate limiting hoy**: `SMCA.WebApi.E2ETests/RateLimiting/RateLimitPoliciesTests.cs` tiene 4 tests (`:38,49,72,83`) y **todos** son de la política **Register**. La política **Login** no tiene ningún test — ni de opciones, ni de comportamiento, ni de partición por IP. Y ninguno de los cuatro es un test de extremo a extremo: son tests unitarios de la fábrica de políticas, con el limitador construido a mano (`RateLimitPoliciesTests.cs:24-35`), porque bajo `Testing` el middleware ni siquiera se registra (H-12).
