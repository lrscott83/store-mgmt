# Diseño — `e2e-playwright-register-s1-01`

**La decisión de arquitectura, primero**: la suite se construye sobre **un único observador de red instalado por un fixture automático**, del que salen las tres cosas que este cambio necesita — probar que una petición salió, probar que **ninguna** salió, y diagnosticar por qué el backend no contestó. Todo lo demás (page object, generador de identidad, aislamiento de A10) cuelga de ahí.

**El cambio no modifica ni una línea de `playwright.config.ts`.** Cada mecanismo elegido es alcanzable desde archivos de spec/soporte y scripts de `package.json`. Eso no es una casualidad: es la consecuencia directa de la regla innegociable de abajo.

> ## Regla innegociable del proyecto — textual, y gobierna todo lo que salga de este diseño
>
> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."
>
> Agregar tests E2E **nuevos** está permitido. Tocar tests E2E **existentes** de cualquier forma requiere autorización explícita del usuario.
> `frontend-react/e2e/smoke.spec.ts` y `frontend-react/e2e/api-health.spec.ts` son tests **existentes**. Este diseño **no** los edita y **no** cambia cómo corren.
> Ver §9, que documenta el único punto donde este diseño roza esa frontera y **se detiene a pedir autorización en lugar de rodearla en silencio**.

---

## 0. Dos hallazgos que corrigen la propuesta

Los pongo primero porque cambian decisiones ya escritas. Ambos están verificados en código, con `file:line`.

### H1 — `API_URL` debe terminar en `/api`. La propuesta (D4) dice que no, y está mal.

| Evidencia | Qué dice |
|---|---|
| `backend/src/SMCA.WebApi/Controllers/BaseApiController.cs:11` | `[Route("api/v1/[controller]")]` — todos los controladores viven bajo `/api`. |
| `frontend-react/apps/web-store-pos/app/shared/lib/http/auth-http-service.ts:41` | La app postea a la ruta relativa `'/v1/auth/register'`. |
| `frontend-react/e2e/api-health.spec.ts:28,36` | El spec existente ya asume lo mismo: su mensaje de error sugiere `API_URL=https://localhost:44320/api` y arma `${API_URL}/v1/auth/ping`. |

Con `API_URL=http://localhost:5019` (lo que dice la propuesta), la petición sale a `http://localhost:5019/v1/auth/register` → **404**. La app mostraría `REGISTRATION.UNEXPECTED_ERROR` y A6/A8/A9 fallarían todas, por una barra faltante.

**Valor correcto: `API_URL=http://localhost:5019/api`.** Es lo que va en `.env.example` (§7).

### H2 — Un email vacío **no** produce un 400. La decisión 5 necesita otro disparador.

`backend/src/Application/Features/Authentication/Commands/Register/RegisterCommandValidator.cs:36-39`:

```csharp
When(x => !string.IsNullOrEmpty(x.Email), () =>
{
    RuleFor(x => x.Email!).EmailAddress().WithMessage(...);
});
```

Un email **vacío salta la regla entera**: es válido del lado del servidor. Un envío con email vacío y el resto correcto devuelve **201, no 400**.

Esto no invalida la decisión 5 (un solo envío sirve A6 **y** A9) — obliga a que el 400 lo dispare **otro** campo, manteniendo el email vacío. El único 400 alcanzable desde el formulario, con todos los demás campos pasando la validación de cliente, es **login duplicado** (`RegisterCommandValidator.cs:20`, `MustAsync(IsUniqueName)`). §5 desarrolla la consecuencia estructural.

Alternativas descartadas para el 400, y por qué:

| Alternativa | Por qué no |
|---|---|
| Email con **formato** inválido (`not-an-email`) | Dispara `EmailFormatInvalid` sin registro previo — más barato y sin acoplamiento. **Pero el email no queda vacío**, y A6 exige exactamente eso. Incompatible con la fusión que pide la decisión 5. |
| `password` que falle en el servidor | Imposible: la regex de cliente (`register.tsx:57`) es **más estricta** que el servidor (`:22-26`, mínimo 8 + mayúscula, sin exigir dígito). Todo lo que pasa el cliente pasa el servidor. |
| `?code=` de reseller inválido | El handler lo **traga**: loguea un warning y sigue sin asociar (`RegisterCommand.cs:100-104`). El registro igual sale 201. |
| `fullName`/`cellPhone`/`storeName` vacíos | Bloqueados por `validate()` en el cliente (`register.tsx:65-75`). La petición nunca sale. |

---

## 1. Camino rápido — qué se crea y qué se edita

| Archivo | Qué es | Estado |
|---|---|---|
| `frontend-react/e2e/support/test.ts` | **La puerta de entrada de la suite.** Re-exporta `test`/`expect` extendidos con fixtures. Todo spec nuevo importa de acá, nunca de `@playwright/test`. | Nuevo |
| `frontend-react/e2e/support/network-observer.ts` | Fixture `registerNetwork`: observa la red, prueba salida/no-salida y emite los diagnósticos. | Nuevo |
| `frontend-react/e2e/support/register-page.ts` | Page object de `/register`: locators, `fillValidForm()`, `submit()`. | Nuevo |
| `frontend-react/e2e/support/identity.ts` | Generador de identidad única por corrida. | Nuevo |
| `frontend-react/e2e/register.spec.ts` | A1–A9. Corre por defecto. | Nuevo |
| `frontend-react/e2e/register-rate-limit.spec.ts` | Solo A10, etiquetado `@rate-limit`. | Nuevo |
| `frontend-react/.env.example` | ~~Documenta `API_URL`~~ **(superseded — ver nota en §10; eliminado, `git rm`)**. | Descartado |
| `frontend-react/package.json` | 3 scripts (§8). | Editado |
| `frontend-react/e2e/README.md` | Prerrequisitos, comandos, advertencia de cuota. **Es documentación, no un test.** | Editado |
| `frontend-react/playwright.config.ts` | — | **SIN TOCAR** |
| `frontend-react/e2e/smoke.spec.ts`, `e2e/api-health.spec.ts` | — | **SIN TOCAR** |

### Por qué `support/` plano y no `support/{fixtures,pages,data}/`

Cuatro archivos. Anidar tres carpetas para cuatro archivos es estructura sin información: obliga a recordar en cuál cae cada cosa sin ganar nada a cambio. Cuando `support/` pase de ~8 archivos, la partición se hará con evidencia de qué agrupa con qué, no por adivinanza.

### Lo que se construye ahora vs. la costura que se deja abierta

El encargo pide establecer la capa para los **12 escenarios que siguen**, la mayoría con sesión autenticada. Distingo explícitamente:

| Pieza | ¿Ahora? | Razón |
|---|---|---|
| `support/test.ts` (el `test` extendido) | **Sí** | Es *la* costura. Existe hoy con un solo fixture, pero fija la convención "los specs importan de `support/test.ts`". Cuando llegue `signedInPage`, se agrega ahí y **ningún spec cambia su import**. Si no se establece ahora, S1-02 lo tendrá que retrofitear en cada spec ya escrito. |
| `support/register-page.ts` | **Sí** | S1-01 lo necesita. Además fija el patrón page-object que replicarán los demás. |
| `support/identity.ts` | **Sí** | S1-01 lo necesita, y toda escena futura que cree datos lo va a reusar tal cual. |
| `support/network-observer.ts` | **Sí** | S1-01 lo necesita. El diagnóstico de cuota (§6) sirve a toda la suite. |
| `support/auth.ts` — fixture `signedInPage` con `storageState` | **No** | S1-01 corre como visitante anónimo. Construirlo ahora sería diseñar a ciegas contra un flujo de login que todavía no se leyó. `support/test.ts` es exactamente el lugar donde va a enchufar. |
| `support/api.ts` — cliente HTTP crudo para seed/teardown | **No** | Ídem. Se menciona para que quede claro que la ausencia es deliberada, no un olvido. |
| Carpetas vacías como placeholder | **No** | Una carpeta vacía commiteada es una promesa sin fecha. |

---

## 2. Flujo de datos — cómo un test de navegador llega a un backend real

```
frontend-react/.env                     API_URL=http://localhost:5019/api
        │
        ▼  Vite lo expone al bundle: envPrefix ['VITE_','API_',...]  (vite.config.ts:65)
           envDir = raíz de frontend-react                            (vite.config.ts:64)
        │
        ▼  api-client.ts:21   baseURL = import.meta.env['API_URL'] ?? ''
        │
        ▼  auth-http-service.ts:41   POST '/v1/auth/register'
        │
   http://localhost:5019/api/v1/auth/register
        │
        ▼  CORS: origen http://localhost:3333 ya permitido            (Program.cs:135)
        ▼  RateLimiter "RegisterPolicy", 10/10min por IP              (AuthController.cs:102, RateLimitPolicies.cs:26-35)
        ▼  RegisterCommandValidator                                    (RegisterCommandValidator.cs:17-43)
        ▼  201 Created  |  400 BadRequest { errors: [{ code, description }] }   (AuthController.cs:108-114)
```

**Playwright observa en el borde del navegador**, no en el medio: `page.on('request' | 'response' | 'requestfailed')`. Nunca se interpone.

---

## 3. Cómo se prueba que **no** salió ninguna petición

Es la decisión mecánica central del cambio (A4 y A7). Las tres herramientas disponibles no prueban lo mismo:

| Mecanismo | Qué prueba realmente | Veredicto |
|---|---|---|
| `page.route('**/v1/auth/register', ...)` | Que **una petición que coincide con el glob** fue interceptada. Para el caso negativo probaría que el handler nunca corrió — pero **solo ve las URLs que matchean**. Si `API_URL` está vacía y la llamada se va a `localhost:3333`, el glob igual matchea el path… y si el glob se escribe con host, no matchea nada y el test pasa en falso. Además **interpone**: con `route` instalada la petición ya no viaja, así que el mismo montaje no sirve para los tests positivos. | **Rechazado** como mecanismo primario |
| `page.on('request')` | Que el navegador **inició** (o no) una petición. Es pasivo: no altera el sistema bajo prueba. Ve **todas** las URLs, así que el caso "se fue al dev server por `API_URL` mal configurada" queda **visible** en vez de invisible. | **Elegido** |
| `context.setOffline(true)` | Nada, por sí solo: es el **disparador** de A7, no la aserción. La aserción de "no salió nada" sigue siendo `page.on('request')`. | Complementario |

### La precisión que importa: "no salió nada" necesita una ventana definida

La ausencia de un evento no se puede afirmar en el vacío — hay que decir *durante cuánto*. Descartado `waitForTimeout(N)`: es lento y su verde depende de que N sea suficiente, que es la definición de flaky.

**Ancla determinística elegida**: primero se espera el **efecto de UI observable** (el `<p>` de error de validación, o el banner offline), y *recién entonces* se afirma que hay cero peticiones registradas.

Es válido porque el camino del código es secuencial y sin await intermedio: `handleSubmit` (`register.tsx:92-106`) valida → si hay errores hace `setErrors` y **retorna**; si está offline hace `setIsOffline(true)` y **retorna**. La llamada a `authHttpService.register` (`:110`) está *después* de ambos returns. Si el mensaje ya está pintado, la rama que habría emitido la petición ya se decidió. No hay carrera que esperar.

**Refuerzo que hace completo el cuadro**: `playwright.config.ts:32` bloquea service workers (`serviceWorkers: 'block'`). Sin eso, un SW podría haber atendido el `fetch` internamente y el evento `request` de la página podría no reflejar la verdad. Con el bloqueo activo, `page.on('request')` **es** el cuadro completo. (Ese ajuste ya está en la config; este diseño se apoya en él y **no lo modifica**.)

### El filtro

Se registra toda petición con `method === 'POST'` y `new URL(request.url()).pathname` terminando en `/v1/auth/register`. Se filtra por **path, no por host** — a propósito: así el observador también ve la petición mal dirigida al dev server, que es justo el caso que hay que diagnosticar (§6). El `method === 'POST'` descarta cualquier preflight.

---

## 4. Cómo se fuerza el offline real (A7)

`page.context().setOffline(true)` activa la emulación de red offline del contexto de Chromium. Chromium la expone en la página como `navigator.onLine === false`.

La cadena hasta el código de la app, completa y sin mocks:

```
context.setOffline(true)
   → navigator.onLine === false en la página
   → connectivity-service.ts:4   return navigator.onLine;      ← lee la propiedad viva, en cada llamada,
                                                                  sin caché ni suscripción a eventos
   → register.tsx:103            if (!ConnectivityService.isOnline())
   → register.tsx:104-105        setIsOffline(true); return;   ← nunca llega a la línea 110
```

Esto es lo que hace que A7 sea la aserción **con más valor** de las diez: la suite vitest mockea `ConnectivityService.isOnline` como un `vi.fn()` y **nunca ejecuta `connectivity-service.ts`**. Este es el primer test que corre ese archivo de verdad.

**Orden obligatorio** en el test: `goto` → llenar el formulario → `setOffline(true)` → click. Poner el offline antes del `goto` haría fallar la carga del bundle y el test moriría por la razón equivocada. No hace falta restaurar: Playwright crea un contexto nuevo por test, así que el offline no se filtra al siguiente.

**Alternativa rechazada**: `page.route('**/*', r => r.abort())`. Simula una red caída pero deja `navigator.onLine === true`, así que la app tomaría la rama **online**, emitiría la petición y mostraría `REGISTRATION.UNEXPECTED_ERROR`. Probaría una rama distinta a la que A7 nombra, y pasaría verde creyendo haber probado el banner offline.

---

## 5. Cómo se prueba el texto literal del backend (A6 + A9 fusionadas)

### El disparador determinístico

Por H2, el 400 lo dispara un **login duplicado**, con el email vacío. Eso encadena dos tests:

| Orden | Test | Envío | Consumo |
|---|---|---|---|
| 1 | **A8** — el éxito navega a `/login` | `login = identity.login`, email vacío o poblado, todo válido → **201** | 1 permiso, 1 fila `Owner`+`Store` |
| 2 | **A6+A9** — el email vacío llega a la API y el 400 se muestra literal | `login = identity.login` (el mismo), `email = ''` → **400**, `errors[0].description` | 1 permiso, 0 filas |

**Total: 2 registros reales por corrida por defecto.** Es exactamente el techo que fija la decisión 5.

### El acoplamiento, dicho de frente

Los dos tests quedan **ordenados**: A6+A9 solo tiene sentido si A8 ya creó el login. Se resuelve con `test.describe.serial(...)`, que fuerza el orden y **saltea el resto del bloque si el primero falla** — que es el comportamiento correcto: un 400 por duplicado no significa nada si no se sabe que el registro previo ocurrió.

El precio se paga a cambio de la fusión que pide la decisión 5. **La alternativa sin acoplamiento existe** — email con formato inválido, 400 sin registro previo, tests independientes — y **está descartada porque no satisface A6** (el email tiene que estar vacío). Queda anotado por si alguna vez se revisa la decisión 5.

`test.describe.serial` es local al bloque: **no** requiere tocar `fullyParallel: true` (`playwright.config.ts:11`), y por lo tanto no altera cómo corre ningún spec existente.

### La aserción de A6 — más fuerte que "salió una petición"

No basta con contar la petición. Se lee el cuerpo:

```ts
const [attempt] = registerNetwork.attempts();
expect(attempt.postData.email).toBe('');   // request.postDataJSON()
```

`auth-http-service.ts:29-36` incluye `email` en el body **sin condicionar**, así que la cadena vacía viaja de verdad. Esto prueba las dos mitades de A6: que el cliente **no** bloqueó, y que el valor vacío **cruzó el cable**.

### La aserción de A9 — sin hardcodear el texto del backend

**Decisión**: el test **no** compara contra una cadena literal escrita a mano. Intercepta la respuesta 400, extrae `body.errors[0].description`, y afirma:

```ts
expect(banner).toHaveText(body.errors[0].description);            // vino del backend, textual
expect(banner).not.toHaveText('Error de validación. Por favor, revise sus datos.');  // NO es el genérico
```

Las dos aserciones juntas son la prueba completa: la primera fija la **procedencia** (el texto pintado es byte a byte el que mandó el servidor), la segunda descarta el **falso positivo** de que fuese la cadena de cliente `REGISTRATION.VALIDATION_ERROR` (`es.ts:125`) — que es la rama de fallback de `register.tsx:135` cuando `description` viene `undefined`.

**Alternativa rechazada**: hardcodear `'El usuario ya existe.'` (`I18n.resx:240-242`). Además de más frágil, es **incorrecta como aserción**: pasar esa comparación no distingue entre "la app pintó lo que dijo el backend" y "la app tiene la misma cadena hardcodeada". Y hay evidencia concreta de fragilidad: la selección de cultura del backend **no está cableada** — `app.UseLocalizationExtension()` está definido (`ServiceExtensions.cs:104-118`) pero **nunca se invoca** en `SMCA.WebApi/Program.cs`; solo lo llama otro proyecto (`WebApi/Startup.cs:89`). O sea que la cultura efectiva es la del proceso servidor, que depende del locale del SO de quien lo levanta. (Hoy termina en español igual, porque `I18n.en.resx` no define la clave `UserAlreadyExists` y el fallback cae al recurso neutro. Pero apoyar un test en esa cadena de coincidencias es apostar.)

Leer el valor del cable no depende de nada de eso.

### El detalle que puede morder: leer el body antes de que la página navegue

En A8 la app navega a `/login` (`register.tsx:120`) apenas resuelve el 201. Si el observador intentara leer el cuerpo *después*, podría encontrarse la respuesta ya descartada por la navegación.

**Mitigación de diseño**: el handler de `response` lee el cuerpo **de inmediato** (`void response.text().then(store)`) y guarda el texto, no el objeto `Response`. Los accesores del fixture devuelven lo ya capturado. Queda como riesgo R3 (§10) hasta verse correr.

---

## 6. Diagnósticos: dónde viven y por qué ahí

El requisito: si la suite choca contra la cuota de registros, tiene que fallar con un mensaje que un humano entienda al instante — no con `expect(received).toHaveText(expected)`.

### La decisión: un **fixture automático**, no un matcher ni un helper suelto

| Opción | Por qué no / por qué sí |
|---|---|
| Matcher `expect` personalizado | **Rechazada.** Un matcher solo dispara donde lo llamás. El 429 hay que diagnosticarlo *sea cual sea* la aserción que venía después, incluso en tests que no asertan nada de red. Un matcher no puede cubrir lo que no se invoca. |
| Función helper llamada test por test | **Rechazada.** Es opt-in. El que escriba el escenario 14 se la olvida y recupera exactamente el fallo confuso que este requisito existe para eliminar. Una salvaguarda que se puede omitir no es una salvaguarda. |
| Hook `test.afterEach` | **Rechazada.** Corre *después* de que el test ya falló con el mensaje engañoso. Puede agregar una anotación; no puede reemplazar la causa del fallo. Llega tarde por construcción. |
| **Fixture `registerNetwork` (auto)** | **Elegida.** (a) Se instala **antes** del cuerpo de cada test, sin ceremonia por test: imposible de olvidar. (b) Dispara **temprano** — dentro de los accesores que el test llama igual, antes de su propia aserción. (c) Es la **misma costura** donde después enchufa el fixture de sesión autenticada. Una pieza, tres razones. |

### Convención que hace que el diagnóstico llegue siempre primero

> **Siempre se espera el resultado de red antes de asertar el efecto de UI.**

Sin esto, A8 fallaría así con la cuota agotada: la app pinta `TOO_MANY_ATTEMPTS`, nunca navega, y `waitForURL('/login')` revienta a los 30 s con un timeout mudo. Con la convención, `await registerNetwork.waitForResponse()` ve el 429 y tira el mensaje explicativo **antes** de que se evalúe la aserción de navegación.

### Los cuatro diagnósticos, todos del mismo observador

| Señal observada | Diagnóstico emitido |
|---|---|
| `response.status() === 429` | `Cuota de registros agotada para esta IP: 10 por ventana de 10 minutos (RateLimitPolicies.cs:26-35). Esperá hasta 10 minutos — el limitador libera permisos de a ~1 minuto (SegmentsPerWindow=10). Este fallo NO indica un defecto de la app.` |
| `requestfailed` con `net::ERR_CONNECTION_REFUSED` / `ERR_NAME_NOT_RESOLVED` | `El backend no respondió en {url}. Levantalo con: dotnet run --project backend/src/SMCA.WebApi --launch-profile http` |
| La URL de la petición no empieza con `E2E_API_URL` (superseded — ver nota en §10; cubre tanto "se fue al dev server" como "el dev server reutilizado apuntaba a otro backend") | `La petición de registro salió a ... pero el backend esperado es .... Parná el dev server externo y volvé a correr la suite.` |
| 404 con `content-type: text/html` | `API_URL apunta a una base equivocada — ¿le falta el sufijo /api? (BaseApiController.cs:11). Esperado: http://localhost:5019/api` |

**Por qué el mensaje se deriva de la URL observada y no de una constante duplicada**: si el helper guardara su propia copia de `http://localhost:5019/api`, un día diría "el backend no respondió en …:5019" mientras la app llama a otro puerto. Derivarlo del evento real hace el diagnóstico **imposible de desincronizar** con lo que la app hace, y elimina la constante duplicada por completo. Es también la razón por la que este diseño **no** necesita leer `API_URL` desde el proceso de Playwright — con eso se evita tener que agregarle un cargador de `.env` a `playwright.config.ts`, que sería un cambio de config con efectos sobre specs existentes (§9).

**Sobre el "N minutos"**: el rechazo del limitador **no** emite `Retry-After` (`Program.cs:112-118` solo setea `RejectionStatusCode`), así que el número no se puede leer de la respuesta. Va como constante documentada en el helper, con referencia al `file:line` que la fija. Se dice tal cual en el mensaje: "hasta 10 minutos", no un número inventado con precisión falsa.

### Nunca se saltea. Nunca.

**Regla de diseño, sin excepciones**: en esta suite no hay `test.skip()` condicional, ni `test.fixme()`, ni chequeos previos que degraden a "salteado" cuando falta el backend. Si la dependencia no está, el test **falla** — con el mensaje de arriba, que dice cómo arreglarlo. Un test que se saltea solo cuando falta su dependencia **miente en verde**: la corrida reporta éxito y la cobertura reportada no existió.

---

## 7. Datos de prueba únicos

`support/identity.ts` expone una función pura:

```ts
export interface TestIdentity {
  login: string; storeName: string; fullName: string;
  cellPhone: string; password: string;
}
export function newTestIdentity(): TestIdentity;
```

Forma del valor generado:

| Campo | Valor | Por qué |
|---|---|---|
| `login` | `e2e-20260805T174233-k3f9qz` → `e2e-{YYYYMMDD}T{HHmmss}-{6 chars base36}` | 26 caracteres. Ver abajo. |
| `storeName` | `E2E Store 20260805T174233-k3f9qz` | Mismo sufijo → la fila `Store` es rastreable hasta la misma corrida que la fila `Owner`. |
| `fullName` | `E2E Owner` | Fijo. No participa de la unicidad. |
| `cellPhone` | `1100000000` | Fijo. Solo tiene que ser no vacío (`RegisterCommandValidator.cs:32-34`). |
| `password` | `E2eTest1234` | Satisface la regex de cliente `/^(?=.*[A-Z])(?=.*\d).{8,}$/` (`register.tsx:57`), que es más estricta que la del servidor. |

Cada parte del `login` gana algo distinto:

- **Prefijo `e2e-`** — hace que la basura acumulada (riesgo aceptado D5) sea **greppable y borrable a mano** en la base `smca`. Sin prefijo, D5 es un costo aceptado que no se puede pagar nunca.
- **Timestamp** — ordenable. "Borrá todo lo anterior a ayer" se vuelve una operación trivial.
- **6 caracteres aleatorios** — mata las colisiones entre workers paralelos dentro del mismo segundo. `fullyParallel: true` (`playwright.config.ts:11`) hace que eso sea un escenario real, no teórico.

**Alternativa rechazada**: `crypto.randomUUID()` a secas (el patrón de `AuthRegisterDuplicateTests.cs:24`). Nunca colisiona, pero produce filas indistinguibles y no ordenables. En C# da igual, porque esa suite **borra lo que crea** (`DbTestHelpers.CleanupTenantCascadeAsync`). Acá no hay teardown alcanzable, así que la legibilidad de la basura **es** la mitigación. La razón por la que el patrón de C# no se copia tal cual es precisamente esa diferencia.

**Regla de uso**: `newTestIdentity()` se llama **una vez por test**. La única excepción es el bloque `describe.serial` de §5, donde los dos tests comparten deliberadamente la misma identidad — el `beforeAll` del bloque la genera y la comparten. Compartirla sin querer entre tests independientes reintroduce la colisión que el generador existe para evitar.

---

## 8. Selectores: política y cadenas exactas

### Política, en orden de preferencia

1. **`#id` para controles de formulario.** La página los tiene todos, estables y verificados: `#fullName` (`register.tsx:171`), `#login` (`:188`), `#email` (`:205`), `#cellPhone` (`:222`), `#storeName` (`:239`), `#password` (`:257`), `#passwordConfirmation` (`:286`), `#acceptTerms` (`:312`). Precedente en el repo: `smoke.spec.ts:15-16` ya usa `input#email`.
2. **Rol + nombre accesible para controles sin id.** Los dos toggles de contraseña (`:264-273`, `:293-302`) no tienen id pero sí `aria-label`. El botón de submit tampoco tiene id.
3. **Texto español visible para mensajes y banners.** Solo se publica el locale `es` (`i18n-provider.tsx`, `SUPPORTED_LOCALES = ['es']` hardcodeado), así que asertar texto renderizado es estable, no una apuesta.
4. **Nunca clases de Tailwind** (`.text-red-600`, `.bg-amber-50`). Son presentación, no contrato: un renombre de clase rompería tests sin que haya cambiado ni un comportamiento.
5. **Nunca agregar `data-testid` a código de producción** en este cambio. Los ids que ya existen alcanzan, y el alcance es solo tests.

### Cadenas literales que los tests asertan — citadas de `es.ts`

| Uso | Cadena exacta | Fuente |
|---|---|---|
| Botón de submit | `Registrar` | `es.ts:113` |
| Botón mientras envía | `Registrando...` | `es.ts:79` |
| Toggle (oculto → visible) | `Mostrar contraseña` | `es.ts:808` |
| Toggle (visible → oculto) | `Ocultar contraseña` | `es.ts:809` |
| **A2** `storeName` requerido | `Nombre de la tienda es requerido` | `GENERAL.VALIDATION.REQUIRED` (`:350`, `{name}`) ← `STORE.STORE_NAME` (`:795`) |
| **A4** política de password | `La contraseña debe tener al menos 8 caracteres, un número y una letra en mayúscula` | `es.ts:354-355` |
| **A5** confirmación distinta | `Las contraseñas no son iguales` | `es.ts:356` |
| **A7** banner offline | `Estás offline. Se requiere conexión para registrarte.` | `es.ts:116` |
| **A9** control negativo (el banner **no** debe ser esto) | `Error de validación. Por favor, revise sus datos.` | `es.ts:125` |
| **A10** demasiados intentos | `Demasiados intentos de registro. Por favor, espere unos minutos antes de volver a intentar.` | `es.ts:126-127` |

### Mapeo aserción → mecánica

| # | Aserción | Mecánica |
|---|---|---|
| A1 | Submit deshabilitado hasta tildar términos | `getByRole('button', { name: 'Registrar' })` → `toBeDisabled()`; check `#acceptTerms`; → `toBeEnabled()`. (`register.tsx:338`, `disabled={isLoading \|\| !accepted}`) |
| A2 | `storeName` requerido | Formulario válido menos `#storeName`; submit; texto visible; `registerNetwork.expectNoAttempt()` |
| A3 | Un único toggle para ambos campos | Ambos `type="password"` → click **un** toggle → **ambos** `toHaveAttribute('type','text')` |
| A4 | Password fuera de la política, sin llamar a la API | Texto de política visible + `expectNoAttempt()` — es la mitad que vitest nunca aserta |
| A5 | Confirmación distinta | Texto visible + `expectNoAttempt()` |
| A6 | El email vacío llega a la API | `attempts()[0].postData.email === ''` (§5) |
| A7 | Offline: banner y cero peticiones | `setOffline(true)` (§4) + banner + `expectNoAttempt()` |
| A8 | El éxito navega a `/login` | `waitForResponse()` (201) → `expect(page).toHaveURL(/\/login$/)` |
| A9 | 400 muestra `errors[0].description` literal | §5 |
| A10 | 429 muestra `TOO_MANY_ATTEMPTS` | §9 |

---

## 9. Aislamiento de A10, cambios en `package.json`, y la frontera de la regla

### Aislamiento por **etiqueta**, no por config

`register-rate-limit.spec.ts` etiqueta su bloque con `@rate-limit` (`test.describe('...', { tag: '@rate-limit' }, ...)`, soportado por `@playwright/test ^1.62.1`).

| Alternativa | Veredicto |
|---|---|
| `testIgnore` en `playwright.config.ts` | **Rechazada.** Es global: excluiría el spec **también** de la corrida dedicada, que es la única que lo necesita. Y es un cambio de config. |
| Un `project` de Playwright dedicado | **Rechazada, y por un motivo que toca la regla.** El array `projects` (`playwright.config.ts:46`) tiene una sola entrada. Agregar una segunda **sin** acotarla con `testMatch` haría que **todos** los specs corran dos veces — incluidos `smoke.spec.ts` y `api-health.spec.ts`. Eso **altera cómo corren tests existentes** y requeriría autorización explícita. Se descarta antes de llegar ahí. |
| **Etiqueta + `--grep` / `--grep-invert`** | **Elegida.** Vive dentro del archivo nuevo. Config intacta. |

### `package.json` — exacto

```diff
-    "test:e2e": "playwright test",
+    "test:e2e": "playwright test --grep-invert @rate-limit",
+    "test:e2e:rate-limit": "playwright test --grep @rate-limit",
+    "test:e2e:api": "playwright test --config playwright.api.config.ts",
```

**Por qué `--grep-invert @rate-limit` no toca los specs existentes**: `--grep-invert` **deselecciona lo que matchea**. Ni `smoke.spec.ts` ni `api-health.spec.ts` llevan la etiqueta `@rate-limit`, así que siguen seleccionados exactamente como hoy. El cambio es aditivo en efecto, no solo en forma.

`test:e2e:api` es una **adición pura**: `playwright.api.config.ts` hoy **no tiene punto de entrada** — un grep en todo el repo no encuentra ninguna referencia fuera de su propio comentario. Agregar el script no cambia cómo corre nada, porque hoy nada lo corre.

### El spec de A10, por dentro

Ingenuo: 11 registros exitosos → 10 filas de basura por corrida.

**Diseño elegido**: el **primer** intento registra una identidad fresca (201, 1 fila); los intentos 2..N reusan **el mismo login** → todos 400 por duplicado. **Un 400 consume permiso igual**, porque el limitador corre en el pipeline (`Program.cs:157`) **antes** del endpoint. El bucle corta apenas el observador ve un 429 y ahí aserta el banner.

- **Costo: 1 fila por corrida en vez de 10.**
- Tras un 400 la página **no navega** (`register.tsx:132-136` solo setea el error), así que el bucle es llenar+enviar sobre la misma página. Solo el primer intento navega a `/login` y hay que volver.
- El tope es `MAX_ATTEMPTS = 11`, pero corta antes si el 429 llega antes — robusto ante una ventana ya parcialmente consumida por un `pnpm test:e2e` reciente.
- Timeout ampliado **a nivel spec** (`test.setTimeout(120_000)`), no en la config.

### ⚠️ Frontera de la regla — un hallazgo que **requiere tu autorización**, y por eso no lo resuelvo solo

Encontré una condición **preexistente** que este cambio no causa, pero con la que se va a cruzar. La expongo en vez de diseñar alrededor en silencio.

**El hecho, verificado en código:**

| Evidencia | Qué implica |
|---|---|
| `playwright.config.ts:8` — `testDir: './e2e'`, **sin** `testMatch` | El `testMatch` por defecto (`**/*.spec.ts`) incluye `api-health.spec.ts` en la corrida por defecto. |
| `playwright.api.config.ts:11-29` carga `.env`; `playwright.config.ts` **no** | Bajo `pnpm test:e2e`, `process.env.API_URL` queda indefinida. |
| `api-health.spec.ts:25-30` — `beforeAll` con `expect(API_URL).toBeTruthy()` | Ese `beforeAll` falla → sus **2 tests fallan** en la corrida por defecto. |

O sea: **`pnpm test:e2e` ya está en rojo hoy**, antes de este cambio, por dos fallos que no tienen nada que ver con S1-01. (Salvedad honesta: si tenés `API_URL` exportada en tu shell, el `beforeAll` pasa y esto no se manifiesta. No puedo verificar tu shell — decisión 2, yo no ejecuto nada.)

**Las salidas, y por qué ninguna la tomo solo:**

| Opción | Efecto | ¿Autorización? |
|---|---|---|
| O1 — `testIgnore: /api-.*\.spec\.ts/` en `playwright.config.ts` | `api-health.spec.ts` deja de correr en la config por defecto. **Cambia cómo corre un test existente.** | **Sí, explícita** |
| O2 — Portar el cargador de `.env` (`playwright.api.config.ts:11-29`) a `playwright.config.ts` | `API_URL` queda definida, el `beforeAll` pasa y sus 2 tests corren en el project chromium. **También cambia cómo corre un test existente** — aunque sea de rojo a verde. | **Sí, explícita** |
| **O3 — No tocar nada** (elegida para este cambio) | `pnpm test:e2e` reporta 2 fallos ajenos a S1-01. Se documenta en `e2e/README.md` y se agrega `test:e2e:api` para que la config de API tenga por fin un punto de entrada. | No |

**Este diseño toma O3.** No modifica `playwright.config.ts` ni los specs existentes. O1 y O2 quedan como pregunta abierta para vos (§11) — con la consecuencia dicha entera: mientras siga O3, el criterio "la corrida por defecto está verde" **no se cumple**, y hay que leer el reporte distinguiendo los 2 fallos preexistentes de los de S1-01.

---

## 10. Comandos del usuario, en orden

> Decisión 2: el agente no corre nada de esto. Son **tus** comandos.

**Paso 0 — ninguno. No hay `.env` que crear.**

> **Actualización posterior al diseño inicial** (ver apply-progress): la idea original de
> este §10 — commitear `.env.example` y pedir `cp .env.example .env` — quedó descartada
> tras implementarla. Razón: el usuario tiene su **propio** `frontend-react/.env` con su
> configuración de desarrollo; `cp .env.example .env` lo habría sobrescrito, y peor, la
> suite de registro habría heredado el `API_URL` de **desarrollo** — creando filas reales
> de Owner+Store en cualquier backend al que ese `.env` apunte, potencialmente compartido.
> `.env.example` fue **eliminado** (`git rm`).
>
> Mecanismo actual: `playwright.config.ts` expone `export const E2E_API_URL =
> process.env.E2E_API_URL ?? 'http://localhost:5019/api'` — zero-config por default, y
> **completamente independiente** del loader de `.env` que ya vivía en `playwright.config.ts`
> (ese loader sigue existiendo intacto, solo para `api-health.spec.ts`). Se inyecta como
> `API_URL` en `webServer.env` (la variable que consume `import.meta.env.API_URL` vía Vite,
> ver H1) cuando Playwright levanta el dev server. Override: exportar `E2E_API_URL` en el
> shell antes de correr los tests.
>
> **La trampa que esto no resuelve por sí solo**: `reuseExistingServer: true` (deliberadamente
> sin tocar — ver regla innegociable) significa que si el dev server de :3333 YA estaba
> corriendo antes de Playwright, el `API_URL` inyectado nunca llega a ese proceso; la app
> sigue hablando con lo que sea que ese server tenía configurado. Mitigado con un guard en
> `e2e/support/network-observer.ts`: toda petición de registro observada se valida contra
> `E2E_API_URL`; si no coincide, el test falla con un mensaje que nombra el problema (dev
> server externo reutilizado) y la solución (pararlo y volver a correr). Ver `e2e/README.md`.

**Paso 1 — backend (terminal 1).** Requiere PostgreSQL en `127.0.0.1:5432`, base `smca`; las migraciones las aplica el propio backend al arrancar (`Program.cs:128`).

```bash
dotnet run --project backend/src/SMCA.WebApi --launch-profile http
```

| Garantía del perfil `http` | Por qué importa |
|---|---|
| Escucha en `http://localhost:5019` (`launchSettings.json:11`) | Es la base que espera `API_URL`. Sin HTTPS no hay certificado autofirmado que rompa el navegador. |
| `ASPNETCORE_ENVIRONMENT=Development` (`launchSettings.json:8`) | Development **no** es `Testing`, así que el limitador está **prendido** (`Program.cs:110,155`) → A10 es verificable. |
| Bindea **solo** el puerto HTTP | `app.UseHttpsRedirection()` (`Program.cs:138`) no encuentra puerto HTTPS destino y deja pasar. Con el perfil `https` se bindean **ambos** (`launchSettings.json:21`) y te redirigiría `:5019 → :7297`, resucitando el problema del certificado. |

**Paso 2 — la suite por defecto (terminal 2).** A1–A9. El dev server lo levanta Playwright solo (`playwright.config.ts:37-42`).

```bash
cd frontend-react && pnpm test:e2e
```

Deja **2 filas** de prueba nuevas en `smca` y consume **2 permisos** de la ventana de 10/10min.

**Paso 3 — a pedido, sabiendo el costo.**

```bash
cd frontend-react && pnpm test:e2e:rate-limit
```

Agota la cuota de registros de tu IP. **Después de esto, `pnpm test:e2e` va a fallar por cuota, no por bug, hasta 10 minutos.** El fallo va a decírtelo con esas palabras (§6), no con un `expect` mudo.

**Opcional — chequeo de conectividad de la API, sin navegador:**

```bash
cd frontend-react && pnpm test:e2e:api
```

### Verificación

- [ ] `curl http://localhost:5019/health` responde (`Program.cs:161` — `/health` vive en la raíz, **fuera** de `/api`).
- [ ] `curl http://localhost:5019/api/v1/auth/ping` devuelve `true` — confirma el sufijo `/api` de H1.
- [ ] (superseded — ver nota al principio de §10) `frontend-react/.env` existe con `API_URL=http://localhost:5019/api`.
- [ ] `pnpm test:e2e` pasa A1–A9 (recordá los 2 fallos preexistentes de `api-health.spec.ts`, §9).
- [ ] Con el backend **abajo**, `pnpm test:e2e` **falla** con "El backend no respondió en…", nunca saltea.
- [ ] (superseded) Sin `.env`, falla con "API_URL no está configurada…" → ahora: con un dev server externo reutilizado en :3333, falla con "La petición de registro salió a ... pero el backend esperado es ...".
- [ ] `pnpm test:e2e:rate-limit` pasa por separado.

---

## 11. Riesgos y preguntas abiertas

| # | Riesgo | Sev. | Postura |
|---|---|---|---|
| R1 | **CORS en la respuesta 429.** El limitador corta en `Program.cs:157`, dentro del pipeline que `UseCors` (`:131`) envuelve, así que los headers CORS *deberían* aplicarse. Si no lo hacen, el navegador reporta un error de CORS (sin `error.response`), la app cae en `REGISTRATION.UNEXPECTED_ERROR` (`register.tsx:140`) y **A10 falla por infraestructura, no por comportamiento**. | Media | **No verificado en runtime** (decisión 2: no ejecuto). Hay que observarlo en la primera corrida de `test:e2e:rate-limit`. Si pasa, es un hallazgo de backend, no un bug del test. |
| R2 | **Acoplamiento serial A8 → A6+A9** (§5). Si A8 falla, A6+A9 se saltea y su cobertura desaparece de esa corrida. | Media | Aceptado. Es el precio de la fusión que pide la decisión 5. `describe.serial` hace la dependencia **explícita** en vez de dejarla implícita. |
| R3 | **Carrera al leer el body en A8**: la navegación a `/login` puede descartar la respuesta antes de leerla. | Media | Mitigado por diseño: el handler lee `response.text()` de inmediato y guarda el texto. Confirmar en la primera corrida. |
| R4 | **`pnpm test:e2e` está en rojo hoy** por `api-health.spec.ts` (§9). El criterio "la corrida por defecto verde" no se cumple bajo O3. | Media | **Pregunta abierta Q1.** No se resuelve sin autorización: cualquier salida altera cómo corre un test existente. |
| R5 | **La basura se acumula** (D5): 2 filas por corrida por defecto, 1 por corrida de rate-limit. Sin teardown alcanzable desde el navegador. | Media | Aceptado. Mitigado: el prefijo `e2e-` + timestamp (§7) las hace greppables y ordenables para borrado manual. Acotado: es la base `smca`, no `smca_test` — no contamina la suite .NET. |
| R6 | **La corrida por defecto consume cuota** (R2 de la propuesta). | Alta | Reducido a su mínimo: **2 permisos**, el techo que fija la decisión 5. Ojo con `retries: 2` en CI (`playwright.config.ts:17`): triplicaría el consumo. No aplica hoy (nadie corre esto en CI), pero se anota. |
| R7 | **`API_URL` duplicada conceptualmente** entre `.env` (que la app consume) y la config de API de Playwright. | Baja | El observador **no** duplica el valor: deriva sus diagnósticos de la URL realmente observada (§6). No hay constante que desincronizar. |
| R8 | **A1–A5 duplican cobertura jsdom** (D1). | Baja | Aceptado y atribuido. Si una auditoría futura lo marca, es **falso positivo**. |

### Q1 — la única pregunta abierta

**¿Qué hacemos con los 2 fallos preexistentes de `api-health.spec.ts` en la corrida por defecto?** O1 (`testIgnore`), O2 (portar el cargador de `.env`) u O3 (dejarlo, documentarlo). §9 tiene las tres con su efecto.

**No lo decido yo** porque O1 y O2 cambian cómo corre un test existente, y eso, por regla del proyecto, es tuyo. **Mi recomendación: O2** — hace que ese test *funcione* en vez de esconderlo, y `.env` va a existir igual después del paso 0. **Su contra, entera**: sigue siendo un cambio de comportamiento sobre un test que no escribiste en este cambio, y a partir de ahí `pnpm test:e2e` pega contra el backend también desde el project chromium, que hoy no lo hace.

---

## 12. Próximo paso

`sdd-tasks` (requiere que `sdd-spec` también esté listo).

Lo que tasks tiene que arrastrar de acá: la corrección H1 de `API_URL` (`/api`), el disparador de 400 por login duplicado de H2 con su `describe.serial`, los 4 archivos de `support/` y la pregunta Q1 sin resolver.
