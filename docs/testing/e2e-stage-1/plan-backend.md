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
| [B-1](#b-1) | `ToCollectTests` vencido por fecha hardcodeada | **Alta** | **Sí** — suite en rojo | **Sí** — autorización requerida |
| [B-2](#b-2) | 20 fechas hardcodeadas más, sin reloj congelado | Alta | No — latente | **Sí** — autorización requerida |
| [B-3](#b-3) | `MintToken` saltea el endpoint de login | Alta | No | No — solo agrega tests nuevos |
| [B-4](#b-4) | `GetPagedReponseAsync`: `Skip`/`Take` sin `OrderBy` | Media | No — código muerto | No |
| [B-5](#b-5) | Rechazos esperados logueados como `Unhandled exception` | Baja | No | No |
| [B-6](#b-6) | No hay forma de desactivar una cuenta, así que el 404 de `/me` no se ejerce | Media | No — brecha declarada | No — solo agrega tests nuevos |

Lo ya cerrado en la rama `feat/e2e-playwright-login-s1-02` está en [Antecedentes](#antecedentes) — leerlo primero, porque explica por qué esta lista existe.

---

## B-1

### `ToCollectTests.ReSeller_sees_own_stores_only` vence por calendario

**Síntoma**: `Expected ownInResult not to be <null>` en `ToCollectTests.cs:123`. La suite E2E pasa de 307/307 a 306/307 sin que nadie haya tocado nada.

**Causa raíz, calculada**

El test siembra la tienda con `PaymentStartDate = 2026-06-01` (`ToCollectTests.cs:65`). La configuración vigente viene de la semilla de migración (`SystemConfigurationEntityTypeConfiguration.cs:27,33,36`): `TestingPeriodInMonths = 1`, `PaymentGraceDays = 5`, `DueSoonDays = 5`.

```
GetNextDueDate(2026-06-01, trial=1, sin pagos)
  = paymentStartDate.AddMonths(trialMonths + 1)      // StoreBillingUtils.cs:28
  = 2026-08-01

GetStatus(...)                                        // StoreBillingUtils.cs:31-39
  today > due.AddDays(graceDays)  → Vencido           // today > 2026-08-06
  today > due                     → EnGracia          // 2026-08-02 .. 2026-08-06
  today >= due.AddDays(-dueSoon)  → PorVencer         // 2026-07-27 .. 2026-08-01
```

Y el handler descarta todo lo que no sea `PorVencer` o `EnGracia` (`GetStoresToCollectQuery.cs:87-88`).

**La ventana en la que este test podía pasar era 2026-07-27 a 2026-08-06.** Fuera de ella la tienda cae en `Vencido` y desaparece del resultado. El test no se rompió: se venció.

**Por qué nadie lo vio venir**: el test no congela el reloj. `_dateTimeProvider.UtcNow` devuelve la hora real del sistema (`MutableDateTimeProvider.cs:9` — `_pinned ?? DateTimeOffset.UtcNow`), así que el resultado depende del día en que se corra.

**Arreglo propuesto**: congelar el reloj, **no** mover la fecha de siembra.

Mover la fecha solo corre la bomba unos meses y garantiza que esto vuelva. Congelar el reloj la desactiva. La infraestructura ya tiene la herramienta: `_fixture.Clock.Pin(...)` (`MutableDateTimeProvider.cs:11`).

```csharp
// Dentro de la ventana PorVencer para PaymentStartDate = 2026-06-01
using var clock = _fixture.Clock.Pin(new DateTimeOffset(2026, 7, 30, 12, 0, 0, TimeSpan.Zero));
```

> ⚠️ **Trampa del doble Pin**, ya documentada en `StoreCreationTrialTests.cs:24-31`: el `Dispose` de `Pin` resetea a la hora real, no a la anterior. Si un test necesita dos instantes distintos, se llama a `Pin` de nuevo y ambos scopes se liberan al salir del método. No anidar esperando un stack.

**Aserción que NO debe cambiar**: `ownInResult.Should().NotBeNull()` y `otherInResult.Should().BeNull()`. La intención del test —un ReSeller ve sus tiendas y solo las suyas— es correcta y no está en discusión. Lo único que se corrige es el instante contra el que se evalúa.

**Autorización**: **requerida**. Es un test E2E existente.

---

## B-2

### Otras 20 fechas hardcodeadas, y un solo test que congela el reloj

`ToCollectTests` no es un caso aislado: es el primero en explotar. El escaneo sobre `SMCA.WebApi.E2ETests/` encontró 21 literales `new DateOnly(...)`, y **un solo archivo** usa el `MutableDateTimeProvider`: `StoreCreationTrialTests.cs`. El resto corre contra el reloj real.

**Clasificación por riesgo**

Una fecha hardcodeada es peligrosa según *dónde* cae respecto de hoy, no por estar hardcodeada:

| Clase | Ejemplos | Riesgo |
|---|---|---|
| **Ancla antigua deliberada** — siempre `Vencido`, el estado no cambia nunca más | `ExportOfflineRosterTests.cs:283`, `ToCollectTests.cs:176`, `StoreCreationTrialTests.cs:277,318` (`2020-01-01`) | **Estable.** No tocar |
| **Aserción de valor literal** — compara un campo, no un estado calculado contra hoy | `StoreActivationTests.cs:61`, `StoreUpdateTests.cs:89,117` | **Estable** mientras la fecha no la derive el sistema |
| **Ventana móvil** — siembra un `PaymentStartDate` cuyo estado depende de hoy | `ToCollectTests.cs:65,109,145`, `PaymentMoneyTests.cs:34,66,104,141`, `ExportOfflineRosterTests.cs:315,384`, `ResellerCommissionsTests.cs:59` | **Bomba de tiempo** |

Cada una de la última fila tiene su propia fecha de vencimiento, calculable con la fórmula de B-1 y la configuración que ese test tenga sembrada. Ojo: `BillingConfigSeed` permite override de `trialMonths`/`graceDays`/`dueSoonDays` (`BillingConfigSeed.cs:39-50`), así que **la ventana se calcula por test**, no de una vez para todos.

**Arreglo propuesto**: congelar el reloj en cada test de la última fila, con el mismo patrón de B-1. No cambiar ninguna aserción.

**Decisión abierta** — preguntar antes de ejecutar: ¿se hacen los diez de una, o solo a medida que van venciendo? Hacerlos todos de una toca diez archivos de test existentes en un solo cambio, lo que es mucho blast radius; dejarlos venir de a uno significa que la suite se va a poner roja sin aviso cada tantas semanas, siempre por la misma razón, y siempre pareciendo un bug nuevo.

**Autorización**: **requerida**, y conviene pedirla test por test o por lote explícito.

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
