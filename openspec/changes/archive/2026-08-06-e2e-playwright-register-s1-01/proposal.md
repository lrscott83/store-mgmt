# Propuesta — `e2e-playwright-register-s1-01`

Sembrar la suite Playwright de negocio implementando el escenario **[S1-01] Auto-registro** completo: sus **10 aserciones de UI**, contra un backend real, en dos specs nuevos. Hoy la capa navegador tiene **cero** cobertura de negocio; este cambio la abre y, de paso, fabrica el OwnerAdmin + Store que todos los escenarios posteriores del catálogo necesitan como precondición.

> ## Regla innegociable del proyecto — se transcribe textual y aplica a todo lo que salga de este cambio
>
> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."
>
> Agregar tests E2E **nuevos** está permitido. Tocar tests E2E **existentes** de cualquier forma requiere autorización explícita del usuario.
> `frontend-react/e2e/smoke.spec.ts` y `frontend-react/e2e/api-health.spec.ts` son tests **existentes**: este cambio **no** planifica ninguna edición sobre ellos. Si una fase posterior cree necesitarla, se detiene y se pregunta.

---

## 1. Por qué este cambio, y por qué S1-01 primero

**El problema**: `docs/testing/e2e-catalog-stage-1.md` cataloga 13 escenarios y un invariante. **Ninguno** tiene cobertura de navegador. Lo único que corre hoy en Playwright es `smoke.spec.ts` (la app carga) y `api-health.spec.ts` (la API contesta) — infraestructura, no negocio.

**Por qué S1-01 y no otro**: dos razones, y la segunda es la que manda.

| Razón | Detalle |
|-------|---------|
| Es el único alcanzable sin sesión | S1-01 arranca en `/register` como visitante anónimo. Todos los demás escenarios del catálogo exigen estar autenticado, es decir, exigen que S1-01 ya funcione. |
| **Es la semilla, no el primer test** | El registro fabrica en una sola operación el `Owner` + `Store` con `SelectedStoreId` seteado (`RegisterCommand.cs:66-91`) — exactamente la precondición de datos que S1-02 en adelante dan por hecha. Sin este flujo probado, cualquier escenario posterior corre sobre datos manufacturados a mano. |

**Qué es el éxito**: la suite Playwright por defecto corre verde contra un backend de desarrollo real levantado por el usuario, cubriendo 9 de las 10 aserciones; la décima corre a pedido, aislada, con su propio comando.

---

## 2. Alcance

### Dentro — las 10 aserciones de UI, mapeadas 1:1 al catálogo

| # | Aserción | Línea del catálogo | Spec | ¿Toca la API? |
|---|----------|--------------------|------|----------------|
| A1 | Botón de envío deshabilitado mientras no se tilde el checkbox de términos | :97 | `register.spec.ts` | No |
| A2 | `storeName` requerido; sin él la validación de cliente bloquea el envío | :98 | `register.spec.ts` | No |
| A3 | Un **único** toggle `showPassword` controla los DOS campos de contraseña | :99 | `register.spec.ts` | No |
| A4 | `password` fuera de `/^(?=.*[A-Z])(?=.*\d).{8,}$/` muestra el error de política **sin llamar a la API** | :100 | `register.spec.ts` | No (se verifica que **no** salga petición) |
| A5 | `passwordConfirmation` distinta muestra `GENERAL.VALIDATION.INVALID_PASSWORD` | :101 | `register.spec.ts` | No |
| A6 | `email` **no** es validado como requerido en el cliente: con email vacío la petición **sale** hacia la API | :102 | `register.spec.ts` | Sí |
| A7 | Offline: no se emite ninguna petición y aparece el banner `REGISTRATION.OFFLINE_BANNER` | :103 | `register.spec.ts` | No (offline real) |
| A8 | Éxito navega a `/login` — **no** autentica automáticamente | :104 | `register.spec.ts` | Sí |
| A9 | HTTP 400 muestra **literalmente** `errors[0].description` del backend, no un mensaje genérico | :105 | `register.spec.ts` | Sí |
| A10 | HTTP 429 muestra `REGISTRATION.TOO_MANY_ATTEMPTS` | :106 | `register-rate-limit.spec.ts` (aislado) | Sí, 11 veces |

### Fuera — explícito

| Fuera de alcance | Por qué |
|------------------|---------|
| **Todo trabajo .NET / backend** | La capa de dato de S1-01 ya está cubierta: `AuthRegisterSuccessTests.cs:28`, `AuthRegisterValidationTests.cs:32-53`, `AuthRegisterDuplicateTests.cs:22`, `Billing/StoreCreationTrialTests.cs:331`. Este cambio no agrega, edita ni corre un solo test .NET. |
| **La aserción de destino post-login** (catálogo :110, `/sales/products`) | El registro **no** autentica: navega a `/login` (`register.tsx:119-121`). `resolveUserHomePath` corre durante el **login**, no durante el registro. La exploración lo confirmó: esa aserción es territorio de **S1-02**. |
| Cualquier edición a `smoke.spec.ts` o `api-health.spec.ts` | Regla innegociable del proyecto (arriba). |
| Comportamiento offline puro / `localStorage` | Fuera de alcance de Etapa 1 por definición del propio catálogo (:67). |

---

## 3. Decisiones ya tomadas por el usuario

Se registran **atribuidas y con su contrapartida honesta**, para que un lector futuro no las "descubra" como descuidos y las revierta.

### D1 — Alcance completo: las 10 aserciones van a Playwright, incluidas las que duplican jsdom

La exploración estableció que **A1, A2, A3, A4 y A5 ya están cubiertas** a nivel vitest/jsdom en `frontend-react/apps/web-store-pos/app/auth/routes/__tests__/register.test.tsx` (521 líneas). Son lógica pura de DOM/estado: no hay red real ni API de navegador involucrada.

**El usuario fue informado de esta duplicación explícitamente y eligió implementarlas igual en Playwright.**

**La contrapartida, dicha sin adornos**: se paga tiempo de reloj (cada una levanta un navegador real) a cambio de confianza en DOM real — que el `disabled` realmente bloquea el click, que el toggle realmente cambia el `type` de los dos inputs renderizados, que el error realmente se ve en pantalla. jsdom aproxima eso; Chromium lo demuestra.

> **No re-abrir esta discusión.** Si una auditoría futura marca A1–A5 como cobertura redundante, es un **falso positivo**: la duplicación es deliberada.

### D2 — El usuario ejecuta TODO localmente

El usuario corre el backend, el dev server y la suite Playwright **en su propia máquina**.

- El agente **nunca** corre `dotnet`.
- El agente **nunca** levanta un backend.
- El agente **nunca** afirma que un test pasó si no lo vio pasar.

Esto no es una nota al pie: es un **requisito de primera clase** del cambio. Obliga a que la propuesta y todo artefacto posterior digan, sin que el usuario tenga que inferir nada, **qué exactamente tiene que estar corriendo y con qué comando** para que la suite signifique algo. La sección 5 es esa especificación.

### D3 — La aserción del límite de intentos va aislada

A10 vive en su **propio archivo** (`register-rate-limit.spec.ts`), detrás de su **propio script de package.json**, **excluida de la corrida por defecto** de `test:e2e`.

**Motivo**: disparar el límite quema la cuota de la IP y **bloquea todo registro desde esa máquina durante 10 minutos**. Si corriera en la misma pasada, rompería A6, A8 y A9 — que necesitan registrar de verdad.

**Además**: A10 solo es verificable contra un backend que **no** corra en el entorno `Testing`. El limitador se registra únicamente cuando `!Environment.IsEnvironment("Testing")` (`backend/src/SMCA.WebApi/Program.cs:110` y `:155`). Bajo `Testing` está apagado y la aserción sería vacía. Bajo `Development` está prendido — que es justo lo que setea el perfil de arranque que se pide en la sección 5.

### D4 — URL del backend: `http://localhost:5019`

El puerto **HTTP** de `launchSettings.json:11`. **No** el HTTPS 7297.

**Motivo**: `frontend-react/playwright.config.ts` **no** setea `ignoreHTTPSErrors` (a diferencia de `playwright.api.config.ts`, que sí lo hace). Un navegador real rechazaría el certificado autofirmado del puerto 7297.

**Esto es el bloqueante que traba 5 de las 10 aserciones (A6, A8, A9, A10 y, por simetría, la verificación de "no salió petición" de A4/A7)**, y hay que resolverlo de frente:

| Hecho verificado | Consecuencia |
|------------------|--------------|
| `api-client.ts:21` → `baseURL = import.meta.env['API_URL'] ?? ''` | Sin `API_URL`, la baseURL es cadena vacía. |
| `vite.config.ts:50-53` no declara `server.proxy` | Una baseURL vacía hace que **toda llamada a la API resuelva contra el propio dev server de la SPA en :3333**, que no tiene esos endpoints. Hoy ninguna petición sale de :3333. |
| `vite.config.ts:65` → `envPrefix: ['VITE_', 'API_', ...]` | ✅ `API_URL` **sí** queda expuesta al build de navegador. No hace falta renombrarla a `VITE_`. |
| `vite.config.ts:64` → `envDir` = raíz de `frontend-react` | El archivo va en `frontend-react/.env`, no dentro de la app. |
| No existe ningún `.env` ni `.env.example` en `frontend-react/` | Hay que crearlo. |
| `.gitignore:116` ignora `.env` | **`.env` NO se commitea. `.env.example` SÍ.** |

**Qué commitea este cambio vs. qué crea el usuario a mano**:

- **Commitea el cambio**: `frontend-react/.env.example`, con `API_URL=http://localhost:5019` documentado y explicado.
- **Crea el usuario a mano**: `frontend-react/.env` (copiando el ejemplo). Está gitignoreado y así se queda.

**Dos hechos que de-riesgan esto y conviene tener presentes**:

1. **CORS ya está resuelto.** `Program.cs:135` ya lista `http://localhost:3333` entre los orígenes permitidos. **No hace falta tocar el backend.**
2. **`app.UseHttpsRedirection()` (`Program.cs:138`) no va a estorbar — si se usa el perfil correcto.** Con el perfil `http` solo se bindea el puerto HTTP, el middleware no puede determinar un puerto HTTPS destino y deja pasar la petición. Con el perfil `https` se bindean **ambos** puertos, y entonces sí redirigiría `:5019` → `:7297`, devolviéndonos al problema del certificado autofirmado. **De ahí que la sección 5 exija `--launch-profile http` explícitamente.**

### D5 — Datos de prueba: se acumulan, y se acepta

Cada registro exitoso escribe **permanentemente** una fila `Owner` + una fila `Store` en la base local del usuario, y **no hay teardown alcanzable desde un test manejado por navegador**. El patrón de limpieza que usa la suite .NET (`DbTestHelpers.CleanupTenantCascadeAsync`) vive del lado C# y Playwright no lo alcanza.

**Mitigación**: generar un `login` único por corrida (mismo espíritu que `AuthRegisterDuplicateTests.cs:24`, `dup-{Guid}@test.com`), para que ningún registro colisione con los de corridas anteriores.

**El costo se declara, no se esconde**: las filas de prueba se acumulan corrida tras corrida en la base de desarrollo. Dato que lo acota: el backend de Development apunta a la base **`smca`** (`appsettings.Development.json:3`), **no** a `smca_test`. La basura de Playwright **no** contamina la base de la suite .NET E2E.

---

## 4. Enfoque (altura de propuesta, no de diseño)

### Archivos que aparecen

| Archivo | Qué es | ¿Nuevo? |
|---------|--------|---------|
| `frontend-react/e2e/register.spec.ts` | A1–A9. Corre por defecto. | Nuevo |
| `frontend-react/e2e/register-rate-limit.spec.ts` | Solo A10. Aislado, no corre por defecto. | Nuevo |
| `frontend-react/e2e/support/register-form.ts` | Helper compartido: generación de `login` único por corrida + llenado del formulario. Primera pieza de la capa de soporte de la suite — hoy no existe ninguna. | Nuevo |
| `frontend-react/.env.example` | Documenta `API_URL`. Commiteable. | Nuevo |
| `frontend-react/package.json` | Suma el script aislado; la corrida por defecto excluye A10. | Editado |
| `frontend-react/e2e/README.md` | Documenta el prerequisito del backend y los dos comandos. **Es documentación, no un test** — no lo alcanza la regla innegociable. | Editado |

**No se toca**: `smoke.spec.ts`, `api-health.spec.ts`, ni nada de `backend/`.

### Cómo se parte la suite

Dos comandos, dos intenciones:

- `pnpm test:e2e` → todo menos A10.
- `pnpm test:e2e:rate-limit` → solo A10, a pedido y a sabiendas de que quema la cuota.

La separación se hace por **etiqueta de Playwright** (`@rate-limit`) con `--grep` / `--grep-invert` en los scripts, en vez de `testIgnore` en `playwright.config.ts`. Razón: `testIgnore` es global — excluiría el spec **también** de la corrida explícita, que es justo la que lo necesita. La etiqueta deja la config compartida intacta. La fase de diseño puede preferir un *project* dedicado de Playwright; es la única alternativa razonable y queda para esa fase.

### Cómo un test llega a un backend real

`.env` (`API_URL=http://localhost:5019`) → Vite lo expone por `envPrefix: ['API_', ...]` → `api-client.ts:21` lo toma como `baseURL` → el navegador de Playwright en `:3333` emite la petición a `:5019` → CORS ya lo permite (`Program.cs:135`).

### Qué asertan los tests, textualmente

Solo existe el locale **`es`** en producción (`SUPPORTED_LOCALES = ['es']`, hardcodeado). Los tests asertan el **texto en español renderizado**, no claves de i18n — igual que hace hoy la suite vitest. Ejemplos ya en `es.ts`: `REGISTRATION.OFFLINE_BANNER` = "Estás offline. Se requiere conexión para registrarte." (`es.ts:116`).

### Nota de diseño que reduce el consumo de cuota

A6 ("la petición sale con email vacío") y A9 ("el 400 muestra el `description` literal") pueden resolverse con **un único envío**: se manda con email vacío, se observa la petición saliente **y** se aserta el texto literal del error del backend. Eso baja la corrida por defecto de 3 registros reales a 2. La fase de diseño decide; se deja anotado porque impacta directo en el riesgo R2.

---

## 5. Qué tiene que correr el usuario

> D2: el agente no ejecuta nada de esto. Estos son **tus** comandos.

### Paso 0 — Una sola vez: crear el `.env`

```bash
cp frontend-react/.env.example frontend-react/.env
```

Debe quedar con esta línea (y así viene el ejemplo):

```
API_URL=http://localhost:5019
```

No lo commitees: `.gitignore:116` ya lo ignora, y así tiene que quedar.

### Paso 1 — Levantar el backend (terminal 1)

```bash
dotnet run --project backend/src/SMCA.WebApi --launch-profile http
```

Tres cosas que ese comando garantiza, y por eso es ese y no otro:

| Garantía | Por qué importa |
|----------|-----------------|
| Escucha en `http://localhost:5019` | Es la URL que espera `API_URL`. Sin HTTPS no hay certificado autofirmado que rompa el navegador de Playwright. |
| `ASPNETCORE_ENVIRONMENT=Development` (`launchSettings.json:8`) | Development **no** es `Testing`, así que el limitador de intentos **está prendido** → A10 es verificable. |
| Solo bindea el puerto HTTP | `UseHttpsRedirection` no encuentra puerto HTTPS destino y deja pasar. Con el perfil `https` te redirigiría a `:7297` y volvería el problema del certificado. |

**Requiere**: PostgreSQL en `127.0.0.1:5432`, base `smca`. Las migraciones las aplica el propio backend al arrancar en Development (`Program.cs:128`, `app.ApplyMigrations()`).

### Paso 2 — Correr la suite por defecto (terminal 2)

```bash
cd frontend-react
pnpm test:e2e
```

No hace falta levantar el dev server a mano: `playwright.config.ts:37-42` lo arranca solo con `pnpm dev` y reutiliza uno existente si ya está en `:3333`.

Esto corre **A1–A9**. Deja 2–3 filas de prueba nuevas en la base `smca`.

### Paso 3 — Correr la aserción del límite, solo cuando la quieras (terminal 2)

```bash
cd frontend-react
pnpm test:e2e:rate-limit
```

**Antes de correrlo, sabelo**: hace 11 intentos de registro seguidos y, al terminar, **el servidor te va a rechazar cualquier registro desde esa máquina durante los próximos 10 minutos**. No corras `pnpm test:e2e` inmediatamente después: sus tests de éxito y de error 400 van a fallar por la cuota agotada, no por un bug. Esperá los 10 minutos.

### Verificación

- [ ] `curl http://localhost:5019/health` responde antes de correr nada.
- [ ] `frontend-react/.env` existe y tiene `API_URL=http://localhost:5019`.
- [ ] `pnpm test:e2e` corre verde con el backend arriba.
- [ ] `pnpm test:e2e` **falla ruidosamente** con el backend abajo (ver R4: no debe saltear en silencio).
- [ ] `pnpm test:e2e:rate-limit` corre verde por separado.

---

## 6. Riesgos y costos aceptados

| # | Riesgo / costo | Severidad | Postura |
|---|----------------|-----------|---------|
| R1 | **Las filas de prueba se acumulan.** Cada registro exitoso deja `Owner` + `Store` permanentes en `smca`; no hay teardown desde el navegador. | Media | **Aceptado (D5).** Mitigado con `login` único por corrida para evitar colisiones. Acotado: no toca `smca_test`, así que no contamina la suite .NET. |
| R2 | **La corrida por defecto también consume la cuota.** Con el limitador prendido bajo Development, los 2–3 registros reales de cada `pnpm test:e2e` cuentan contra el techo de 10 por 10 minutos. Iterando rápido, la 4ª–5ª corrida seguida empieza a fallar por cuota, no por bug. | **Alta** | **Pregunta abierta Q1.** Mitigación parcial ya identificada: fusionar A6+A9 en un solo envío baja a 2 por corrida. Ojo en CI: `retries: 2` (`playwright.config.ts:17`) triplica el consumo. |
| R3 | **`pnpm test:e2e:rate-limit` bloquea el registro 10 minutos** desde esa IP. | Media | **Aceptado por diseño (D3).** Es exactamente por esto que está aislado y fuera de la corrida por defecto. Documentado en el paso 3 y en el README de e2e. |
| R4 | **La suite solo significa algo con un backend real arriba.** | Media | **Aceptado.** Requisito de diseño: si el backend no está, los tests **fallan fuerte, no se saltean en silencio**. Un test que se auto-skipea cuando falta la dependencia es un test que miente en verde. |
| R5 | **A1–A5 duplican cobertura jsdom existente**, con su costo en tiempo de reloj. | Baja | **Aceptado y atribuido (D1).** Marcado acá para que ninguna auditoría futura lo borre creyendo que fue un descuido. |
| R6 | **`.env` es manual y no versionado**: en otra máquina, o tras un `clean`, la suite falla con errores de red confusos hasta recrearlo. | Baja | Mitigado con `.env.example` commiteado + el paso 0 documentado + el chequeo de verificación. |

---

## 7. Preguntas abiertas

Una sola, y es genuina — el resto se resolvió leyendo el código.

### Q1 — La corrida normal de tests también gasta la cuota de registros

**El problema, en criollo**: el servidor bloquea los registros después de 10 intentos en 10 minutos desde la misma IP. La corrida normal (`pnpm test:e2e`) hace **2 o 3 registros de verdad** cada vez que la corrés. O sea: podés correr la suite unas 3–5 veces seguidas, y a partir de ahí los tests que esperan un registro exitoso van a empezar a fallar **porque se acabó la cuota, no porque haya un bug**. El error se va a ver como un fallo real, y es ruido.

**Por qué no lo decido yo**: depende de cómo trabajás vos. Si corrés la suite una o dos veces y seguís, esto no existe. Si la dejás corriendo en loop mientras iterás sobre los tests, te va a molestar cada 10 minutos. Y la salida alternativa — levantar el backend en el entorno `Testing`, donde el limitador está apagado — **apagaría también la aserción A10** y cambiaría de base de datos. Es un intercambio sobre tu forma de trabajar, no sobre el código.

**Mi recomendación**: dejar el limitador prendido y aceptar el techo de ~4 corridas cada 10 minutos, fusionando A6+A9 en un solo envío para bajar el consumo a 2 por corrida.
**Su contra, dicha entera**: cuando te choques con el techo vas a tener que esperar 10 minutos con tests en rojo que no indican ningún defecto — y esa espera aparece justo en el peor momento, cuando estás iterando rápido.

---

## 8. Próximo paso

`sdd-spec` y `sdd-design` (pueden correr en paralelo).

- **spec**: las 10 aserciones como criterios de aceptación verificables, con el texto español exacto que cada una espera.
- **design**: mecánica de Playwright — cómo se observa la petición saliente, cómo se fuerza el offline real vía `context.setOffline(true)`, forma del helper de `login` único, etiqueta vs. project para aislar A10, y la decisión sobre fusionar A6+A9.
