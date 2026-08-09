# Etapa 1 — Plan de arreglos de backend

> Trabajo **diferido**. Nada de acá se ejecuta sin decisión explícita del usuario.
>
> Contraparte de [plan-frontend.md](plan-frontend.md), que reúne lo diferido de la capa Playwright.
>
> Este documento reúne lo que apareció en el backend mientras se implementaba la cobertura Playwright de [S1-02](S1-02.md). No es una lista de deseos: cada ítem tiene causa raíz verificada con `archivo:línea`, y donde hay un cálculo, el cálculo está escrito para que se pueda refutar.

## Regla que gobierna este plan

**`CLAUDE.md`, innegociable**: *"Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."*

Varios ítems de acá **tocan tests E2E existentes**. Cada uno declara si necesita autorización. Ninguno se ejecuta sin ella, ni siquiera cuando el test está en rojo y la causa es evidente.

## Estado de un vistazo

| # | Ítem | Severidad | ¿Bloquea hoy? | ¿Toca un E2E existente? |
|---|---|---|---|---|
| [B-1](#b-1) | `ToCollectTests` vencido por fecha hardcodeada | **Alta** | **RESUELTO** — `fb273edb` | Fue sí — autorización otorgada, pin aplicado |
| [B-2](#b-2) | 20 fechas hardcodeadas más, sin reloj congelado | Alta | **RESUELTO EN SU MAYORÍA** — la ola de pins llegó; los archivos citados ya pinan el reloj | Fue sí — pins aplicados en los archivos de "ventana móvil" |
| [B-3](#b-3) | `MintToken` saltea el endpoint de login | Alta | No | No — solo agrega tests nuevos |
| [B-4](#b-4) | `GetPagedReponseAsync`: `Skip`/`Take` sin `OrderBy` | Media | No — código muerto | No |
| [B-5](#b-5) | Rechazos esperados logueados como `Unhandled exception` | Baja | No | No |
| [B-6](#b-6) | No hay forma de desactivar una cuenta, así que el 404 de `/me` no se ejerce | Media | No — brecha declarada | No — solo agrega tests nuevos |

Lo ya cerrado en la rama `feat/e2e-playwright-login-s1-02` está en [Antecedentes](#antecedentes) — leerlo primero, porque explica por qué esta lista existe.

---

## B-1

### `ToCollectTests.ReSeller_sees_own_stores_only` vence por calendario — **RESUELTO**

**Verificado el 2026-08-09**: el pin está aplicado en `ToCollectTests.cs:105-108` y **no se tocó ninguna aserción** (las de `ownInResult`/`otherInResult` siguen intactas, `:125-130`).

```csharp
// ToCollectTests.cs:105-108
// Pin "today" to 2026-07-30 so the store seeded with PaymentStartDate = 2026-06-01
// resolves to PorVencer (window 2026-07-27..2026-08-01 with trial=1, grace=5, dueSoon=5).
using var _ = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 30, 12, 0, 0, TimeSpan.Zero));
```

**Commit**: `fb273edb` — `test(e2e): pin clock in ReSeller_sees_own_stores_only (B-1)`.

**Qué hizo el arreglo**: exactamente lo que proponía este plan — congelar el reloj, no mover la fecha de siembra. La infancia de la ventana (2026-07-27 a 2026-08-01) ya no depende del día en que se corra la suite. La aserción NO cambió: la intención del test —un ReSeller ve sus tiendas y solo las suyas— sigue intacta.

**Resumen del diagnóstico original (histórico)**: el test sembraba `PaymentStartDate = 2026-06-01` (`ToCollectTests.cs:65`), corría contra el reloj real (`MutableDateTimeProvider.cs:9`), y `GetNextDueDate` + `GetStatus` lo llevaban a `Vencido` fuera del 27-jul/06-ago, desapareciendo del resultado de `GetStoresToCollectQuery`. No se rompió: se venció.

---

## B-2

### Otras 20 fechas hardcodeadas, sin reloj congelado — **RESUELTO EN SU MAYORÍA**

**Verificado el 2026-08-09**: el barrido de pins llegó a **mucho más** que el único archivo que este plan conocía. Hoy hay `Clock.Pin` en 8+ archivos de la suite:

| Archivo | Pins | Qué cubren |
|---|---|---|
| `Billing/StoreCreationTrialTests.cs` | ~24 | Grupos A–E de `store-creation-trial` (`f6fae11d`, `7950a5ad`, `a6e1e7ab`, `8f93d1aa`, `8c16d2db`, `61089680`) — trial/due/PorVencer/EnGracia/Vencido, pagos de tiendas auto-registradas, `BillingConfigSeed` |
| `Billing/ToCollectTests.cs` | 3 (`:108,:142,:203`) | Los tres tests que dependen de ventana: B-1, `AlDia_stores_excluded`, `PorVencer_and_EnGracia_included` |
| `Billing/PaymentMoneyTests.cs` | 2 (`:98,:135`) | `Payment_due_date_advances_one_month`, `Two_consecutive_payments_advance_two_months` |
| `Users/ExportOfflineRosterTests.cs` | 3 (`:282,:314,:383`) | Los tres tests con siembras de `PaymentStartDate` en ventana móvil |
| `Billing/StoreActivationTests.cs` | 3 (`:39,:73,:107`) | Ciclos de activación contra ventanas móviles |
| `Billing/GetMeBillingStatesTests.cs` | 2 (`:68,:100`) | Estados de `/me` según ventana |
| `Stores/StoreUpdateTests.cs` | 1 (`:97`) | `PaymentStartDate` derivado de reloj |

**Qué distancia hay entre el plan y la realidad**: este documento se escribió cuando el único archivo que congelaba el reloj era `StoreCreationTrialTests.cs`. Eso quedó obsoleto — el patrón se extendió y los tests que el plan clasificaba como "bomba de tiempo" hoy están pineados con exactamente el patrón propuesto (congelar el reloj, sin tocar aserciones). La categorización histórica de las 21 fechas quedó así:

| Clase | Estado real |
|---|---|
| **Ancla antigua deliberada** (`2020-01-01` y similares) | **Estable.** Sin cambios — así debe quedar (`ExportOfflineRosterTests.cs:283`, `ToCollectTests.cs:179`, `StoreCreationTrialTests.cs:277,318`, `GetMeBillingTests.cs:118`) |
| **Aserción de valor literal** (compara un campo) | **Estable.** `StoreActivationTests.cs:61,112`, `StoreUpdateTests.cs:89,117` — esas fechas son *el valor esperado*, no una ventana contra hoy |
| **Ventana móvil** (siembra un `PaymentStartDate` cuyo estado depende de hoy) | **Pineada** en los 4 archivos citados originalmente. **Restan sin pin**: `PaymentMoneyTests.cs:34,66` (test de monto puro: `Payment_amount_equals_module_sum` asevera `Price = 1500`; `Reseller_commission_is_persisted` asevera `ReSellerAmount = 500`) y `PaymentHappyPathTests.cs:27` (`SuperAdmin_pays_any_store_returns_200`) |

**Por qué los que quedan sin pin no son bomba**: el handler de pagos no evalúa el estado contra hoy para nada que el test afirme — `RegisterStorePaymentCommandHandler` calcula `amount` como suma de precios (`:72-74`), deriva `newDue` de `PaymentStartDate` + meses (`:86-92`), y usa `now` solo para sellar la fila (`:95`), no para decidir el resultado. El único `GetStatus` que depende del reloj vive en las queries de *listado* (`GetStoresToCollectQuery.cs:60`, `BillingService.cs:72`), no en el registro de pagos. Por eso `SuperAdmin_pays_any_store_returns_200` y los dos tests de monto corren contra el reloj real sin riesgo.

**Decisión abierta que ya no aplica**: este plan preguntaba si pinear los diez de una o a medida que vencen. La realidad eligió sola: los tests con aserciones dependientes de hoy se pinearon en el trabajo de `store-creation-trial` y del roster offline, sin tocar aserciones. Lo único decidible hoy es si los **tres tests de monto puro** (`PaymentMoneyTests.cs:34,66`, `PaymentHappyPathTests.cs:27`) merecen un pin preventivo por documentación — no es necesario para estabilidad (ver arriba, el handler no usa el reloj para decidir).

**Autorización**: lo que ya se aplicó **fue autorizado** (pins en tests existentes: `store-creation-trial`). Los tres tests de monto restantes son aditivos si se prefiere el pin por consistencia, pero no requieren decisión de estabilidad.

---

## B-3

### `MintToken` saltea el endpoint de login, y eso escondió un bug de producción

Este ítem no es un defecto de código: es un **hueco de método** que ya costó caro una vez.

**El hecho**: `AuthTestHelpers.MintToken` acuña el JWT directamente con `IJwtProvider.GenerateToken(userId, login)` (`AuthTestHelpers.cs:19-20`). Todo test que necesite un cliente autenticado usa `DbTestHelpers.AuthedClient`, que llama a ese helper. Ninguno de esos tests pasa jamás por `POST /api/v1/auth/login`.

Y los tests que **sí** pegan a `/auth/login` siembran:

| Persona | Qué pasa en `HasActiveStore` |
|---|---|
| SuperAdmin (`AuthLoginSuccessTests`, `AuthLoginFailureTests:25`, `AuthTokenLifetimeTests:42`, `UsersChangePasswordTests:25`) | corta en `isGlobalAdmin`, nunca llega a la rama de tienda |
| Usuario inactivo (`AuthLoginFailureTests:46`) | falla antes, en `!user.IsActive` |

**Resultado**: la rama OwnerAdmin de `HasActiveStore` no tenía cobertura de extremo a extremo. Ahí vivía el bug que dejaba a todo dueño auto-registrado sin poder entrar (ver [Antecedentes](#antecedentes)). 305 tests E2E no lo vieron porque ninguno mandaba a esa persona por la puerta de entrada.

**Regla que conviene dejar escrita**: *un helper que acuña tokens salteando el endpoint de login deja una zona ciega del tamaño del handler entero.* El atajo es legítimo —autenticar por HTTP en cada test sería lento y frágil— pero exige que **cada persona** tenga al menos un test que sí atraviese el login real.

**Estado actual**: cubierto para OwnerAdmin en `AuthLoginOwnerAdminTests.cs` (nuevo, agregado en esta rama).

**Arreglo propuesto**: agregar el round-trip que falta para las personas restantes.

| Persona | ¿Tiene login real? |
|---|---|
| SuperAdmin | Sí |
| OwnerAdmin | Sí (nuevo) |
| **StoreUser** | **No** — falta |
| **ReSeller** | **No** — falta |

El de StoreUser es el más valioso: es la otra rama de `HasActiveStore` (`AuthenticationService.cs:117-131`), con cinco condiciones encadenadas y ninguna probada por HTTP.

**Autorización**: **no requerida** — son tests **nuevos**, lo cual está expresamente permitido. Sí conviene avisar antes por el costo de corrida.

---

## B-4

### `GetPagedReponseAsync` pagina sin orden

**El hecho**: `GenericRepository.cs:18-23` hace `.Skip((pageNumber - 1) * pageSize).Take(pageSize)` sin ningún `OrderBy`. PostgreSQL no garantiza orden sin `ORDER BY`, así que la paginación puede devolver la misma fila en dos páginas y saltear otra. Es el origen del warning `The query uses a row limiting operator ('Skip'/'Take') without an 'OrderBy' operator` que aparece en el log.

**Riesgo actual: cero.** Grep sobre todo `src/`: exactamente dos menciones, la declaración en `IGenericRepository.cs:13` y la implementación. **Ningún call site.** El nombre trae una errata (`Reponse`), lo que refuerza que es andamio de plantilla que nunca se usó.

**Arreglo propuesto** — dos caminos, y no me corresponde elegir:

- **Borrarlo** de la interfaz y de la implementación. Es lo más honesto si nadie lo va a usar: el código muerto que además está mal es peor que no tenerlo.
- **Darle un `OrderBy` por clave primaria**, si se piensa usar. Requiere decidir el criterio de orden, que hoy nadie definió.

**Decisión abierta**: cuál de los dos.

**Autorización**: no requerida para tests. Es código de producción sin uso.

---

## B-5

### Rechazos esperados se loguean como `Unhandled exception` con stack completo

**El hecho**: una validación fallida de `RegisterCommand` sale por `ErrorHandlerMiddleware.cs:37` y se escribe en nivel **ERR** con el stack trace entero. Lo mismo con `BadHttpRequestException: Unexpected end of request content`, que es simplemente el cliente cortando la conexión.

Ambos son comportamiento **correcto y esperado**:

| Mensaje | Quién lo produce |
|---|---|
| `ValidationException` en `RegisterAsync` | `register.spec.ts` REQ-2 y REQ-6, aseverando que el 400 llega con el texto literal del backend |
| `Unexpected end of request content` | el test de offline, al cortar la conectividad con una petición en vuelo |

**El problema no es que ocurran: es que se ven como fallas.** Un log que grita ERR ante un rechazo previsto entrena al lector a ignorar el log, y el día que aparezca un ERR real va a pasar desapercibido. Ese es el costo, y es diferido pero seguro.

**Arreglo propuesto**: distinguir en `ErrorHandlerMiddleware` entre *el servidor se rompió* y *el servidor rechazó correctamente*. `ValidationException` y `BadHttpRequestException` van a **Warning**, sin stack. Todo lo demás queda como está.

**Riesgo**: bajo, pero no nulo — bajar el nivel de una excepción esconde información si algún día una `ValidationException` sí indica un defecto. Mitigación: conservar el mensaje y los campos que fallaron, y quitar solo el stack.

**Autorización**: no requerida. No toca tests.

---

## B-6

### No hay forma de desactivar una cuenta, así que el 404 de `/me` nunca se ejerce

**Qué pasa.** `GetMeQuery` usa 404 para dos casos distintos: *NotFound* y *AccountInactive*.
El frontend los trata igual — `isSessionRejection` (`auth-store.ts:39-45`) evalúa
`status === 401 || status === 404` en la **misma expresión** — así que la reacción del
cliente al 404 ya está cubierta por el test del 401 (S1-04, T4).

Lo que **no** está verificado es el lado del servidor: que `/me` devuelva efectivamente 404
cuando la cuenta está desactivada.

**Por qué no se cubrió en S1-04.** Para montar el escenario hay que desactivar una cuenta, y
**ninguna pantalla llama `activate(false)`** (H-6). Desde la UI no se llega. Un test E2E de
Playwright no tiene forma de producir el estado.

**Qué haría falta.** Desactivar la cuenta por fuera de la UI — endpoint directo o seed en
base — y después pedir `/me` con el token de esa cuenta. Encaja mejor como test E2E de .NET
(`SMCA.WebApi.E2ETests`) que como Playwright: el sujeto es la respuesta del servidor, no lo
que hace el navegador con ella.

**Alcance.** Solo agrega tests nuevos. No toca ningún E2E existente.

**Origen.** Brecha G1 declarada en el cambio `e2e-playwright-session-hydration-s1-04`, ver
[S1-04.md](S1-04.md) → "Pendiente para otra pasada", P-2.

---

## Antecedentes

Lo que ya se arregló en la rama `feat/e2e-playwright-login-s1-02`, porque explica de dónde salió esta lista.

| Commit | Qué |
|---|---|
| `df1f33d` | `LoginCommandValidator` exigía que el `Login` fuera un email; `RegisterCommandValidator` no. Toda cuenta registrada con un login que no fuera email quedaba **inaccesible para siempre**: registro 201, login 400 |
| `ccc1d66` | `HasActiveStore` buscaba la tienda del OwnerAdmin por `user.StoreUser`, la tabla de **empleados**. El registro nunca crea un `StoreUser`, así que **todo dueño auto-registrado recibía 403** |
| `632c5fa` | El test unitario que cubría esa rama construía un OwnerAdmin con `Owner = null` y un `StoreUser` poblado — una forma que la base de datos no produce. Ese Arrange es lo que mantenía el bug en verde |
| `765a8f8` | `AsSplitQuery` en la query de login: incluir `Owner.Stores` le dio una segunda navegación de colección y EF las unía en producto cartesiano |
| `ad316a7` | El backend responde 401 a credenciales inválidas, no 200 con `succeeded:false`. El frontend, el catálogo y el spec derivado arrastraban la premisa vieja, y el usuario veía un mensaje estático donde Angular mostraba el del servidor |

Los tres primeros son la misma historia contada tres veces: **un test que inventa un mundo que la base de datos nunca produce mantiene verde un bug de producción**. `CLAUDE.md` ya registraba el precedente con `BillingService` y `store.StoreModules`. Volvió a pasar con `user.StoreUser`.

---

## Pendiente: orden de las listas de usuarios y owners (decisión de producto, no de query)

**Origen.** Durante el cierre del cambio `e2e-stage-1-userslist-flake` (2026-08-08) se agregó `OrderBy` determinístico a los 6 sitios `Take(1000)` de las queries de listado (`UserRepository.cs:33/:42/:53`, `OwnerRepository.cs:27/:79`). El objetivo era eliminar el warning de EF *"row limiting operator ('Skip'/'Take') without an 'OrderBy'"* y volver determinística la ventana de 1000 filas. Se eligió `OrderBy(u => u.Id)` / `OrderBy(o => o.Id)` por ser PK, único, indexado y sin empates.

**Qué pasa hoy.** Las listas se devuelven en orden de `Id` ascendente, es decir **los más viejos primero**:

- `GetAllUsersQuery` (`GetAllUsersQuery.cs:37-45`) NO reordena: la salida es el orden del repo.
- `GetAllOwnersQuery` SÍ reordena en memoria (`GetAllOwnersQuery.cs:48`): `OrderByDescending(o => o.Approved)` — el `OrderBy(Id)` de la query solo define el desempate dentro del mismo estado `Approved`.

**Por qué queda pendiente.** No hay contrato de orden en la UI ni en los tests E2E, así que nada se rompe. Pero si el producto quiere **"los más recientes primero"** en las listas de usuarios/owners, el orden correcto sería `OrderByDescending(u => u.CreatedAt)` (o por `Id` descendente si el Id se genera secuencialmente) — eso es una decisión de producto con el frontend, no un cambio de query.

**Alcance cuando se analice.** Revisar cómo consume el frontend el orden actual de `/users/all` y `/owners/all` antes de decidir el criterio. No toca ningún test E2E existente; si cambia el orden de salida, verificar que ningún test asuma el orden viejo.
