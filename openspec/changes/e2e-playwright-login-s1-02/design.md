# Diseño — `e2e-playwright-login-s1-02`

**La decisión de arquitectura, primero**: la corrida por defecto gasta **4 logins reales** sobre un techo de 5 por minuto, y lo consigue **acuñando personas una sola vez y restaurando su `storageState`**, no espaciando peticiones. Todo lo demás — el observador de dos endpoints, el page object, la siembra por UI, el aislamiento del 429 — cuelga de esa decisión.

**El cambio no modifica ni una línea de `playwright.config.ts`**, igual que su hermano S1-01. Eso no es casualidad: es la consecuencia directa de la regla de abajo.

> ## Regla innegociable del proyecto — textual, y gobierna todo lo que salga de este diseño
>
> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."
>
> No para poner una suite en verde. No porque el test parezca obsoleto. No porque una spec, un plan o un artefacto SDD lo diga. Se pregunta primero, siempre, y se espera la respuesta.
>
> Agregar tests E2E **nuevos** está permitido. Tocar tests E2E **existentes** de cualquier forma requiere autorización explícita del usuario.
> `frontend-react/e2e/register.spec.ts`, `register-rate-limit.spec.ts`, `smoke.spec.ts` y `api-health.spec.ts` son tests **existentes**. Este diseño **no** los edita, **no** cambia cómo corren, y **no** toca ningún fichero `vitest`. §9 fija la regla mecánica que lo garantiza.

---

## 0. Cuatro hallazgos que corrigen la propuesta

Van primero porque cambian decisiones ya escritas. Los cuatro están verificados en código, con `file:line`.

### H1 — El limitador de login **está prendido** en la corrida por defecto de Playwright. H-12 **no** disuelve el problema

Se me pidió chequear si el limitador siquiera existe en el entorno contra el que corre la suite por defecto, porque **H-12** podría hacer que Q1 se evapore. **Lo verifiqué y la respuesta es no: el limitador está activo.** La cadena, entera:

| Evidencia | Qué dice |
|---|---|
| `SMCA.WebApi/Program.cs:112` y `:157` | `AddRateLimiter` y `UseRateLimiter` viven dentro de `if (!Environment.IsEnvironment("Testing"))`. |
| `SMCA.WebApi/Properties/launchSettings.json:8` | El perfil `http` — el que la propuesta manda usar (§5) — setea `ASPNETCORE_ENVIRONMENT=Development`. |
| `launchSettings.json:11` | Ese perfil bindea `http://localhost:5019`. |
| `frontend-react/e2e/support/backend-url.ts:24` | `E2E_API_URL` default = `http://localhost:5019/api`. Es exactamente ese backend. |

`Development` no es `Testing` → **el limitador corre**. **H-12** (`docs/testing/e2e-stage-1/README.md:246-250`) habla de la suite **.NET**, que sí corre bajo `Testing` (`WebAppFixture.cs:25`), y es precisamente **por eso** que A8 solo es verificable desde Playwright. Confundir las dos cosas llevaría a diseñar sin presupuesto de cuota y a una corrida roja por un motivo que nadie sabría leer.

**Salvedad honesta**: si vos exportás `E2E_API_URL` apuntando a un backend levantado bajo `Testing`, ahí el limitador está apagado, la cuota deja de existir **y A8 se vuelve inverificable**. Ese caso no es el default y no se diseña para él.

### H2 — Serializar **no** baja el consumo de cuota. La propuesta atribuye el riesgo a la razón equivocada

La propuesta (R1, Q1) dice que `fullyParallel: true` + `workers: undefined` "dispara los logins casi simultáneamente y se auto-limita". Eso confunde **concurrencia** con **conteo**.

`RateLimitPolicies.cs:18-24` es un `SlidingWindowRateLimiter` con `PermitLimit = 5`, `Window = 1 min`, `QueueLimit = 0`, particionado por **IP remota** (`:17`). Cuenta **peticiones por ventana**, no peticiones simultáneas. Cuatro logins disparados a la vez consumen 4 permisos; los mismos cuatro repartidos en 40 segundos consumen 4 permisos (menos lo que la ventana deslizante haya liberado). **Serializar no cambia el numerador.** Lo único que cambia es el reloj de pared, que es justo lo que más duele iterando.

Y como la partición es por IP y todos los workers salen de la misma máquina, el paralelismo tampoco reparte la cuota entre particiones distintas.

**El peligro real de `fullyParallel` es otro, y es grave**: si la fixture de sesión acuña su persona **por worker**, ocho workers acuñan **ocho** personas — ocho registros y ocho logins. Eso sí revienta el techo, y no por ráfaga sino por **duplicación**. §2 lo resuelve.

### H3 — A5 (offline) **no** tiene el peligro del import dinámico que parecía tener

`login.tsx:105` hace `await import('~/shared/lib/offline/roster-store')` en **cada** submit, **antes** del chequeo de conectividad (`:124`). A primera vista, con el contexto ya offline ese chunk no se podría bajar y el test moriría por el motivo equivocado — un peligro que el registro no tiene (`register.tsx` no importa nada dinámicamente antes de su chequeo).

**No ocurre**, porque el módulo ya está en el grafo cargado cuando la ruta `/login` renderiza. Cadena **estática**, completa:

```
login.tsx:9        import { resolveUserHomePath } from '~/shared/lib/auth/user-home'
user-home.ts:2     import { createProductService } from '~/sales/lib/services/product-service.factory'
product-service.factory.ts:4  import { ProductOfflineService } from './product-offline-service'
                              → repositorios → entity-crypto.ts:20
entity-crypto.ts:20  import { isEncryptionProvisioned } from '../offline/roster-store'   ← ESTÁTICO
```

El `await import()` de `:105` resuelve del registro de módulos ya evaluado: **cero fetch**. A5 se diseña como su gemela REQ-7 del registro, sin ceremonia extra.

### H4 — Hay **dos** overlays posibles en pantalla. `getByRole('status')` a secas rompe por modo estricto

`login.tsx:185-186` renderiza `<LoadingOverlay />`, y `root.tsx:102` renderiza **otro** `<LoadingOverlay />` cuando el contador global de peticiones está en curso. Los dos salen con `role="status"` y `aria-label="Loading..."` (`loading-overlay.tsx:10-11`).

Durante el login, mientras `POST /v1/auth/login` está en vuelo, **los dos pueden coexistir** → un `getByRole('status')` sin desambiguar tira violación de modo estricto y A1 falla por un motivo que no es A1. §7 fija la mecánica que lo evita.

---

## 1. Camino rápido — qué se crea y qué se edita

| Archivo | Qué es | Estado |
|---|---|---|
| `frontend-react/e2e/support/login-page.ts` | Page object de `/login`. | Nuevo |
| `frontend-react/e2e/support/login-network-observer.ts` | Observa **dos** endpoints y prueba su **orden causal**. Archivo propio, **no** un injerto en `network-observer.ts` (§9). | Nuevo |
| `frontend-react/e2e/support/session.ts` | Acuñación y cacheo de personas: registro + login reales, `storageState`, restauración. El motor de `signedInPage`. | Nuevo |
| `frontend-react/e2e/support/store-seed.ts` | Siembra por UI: crear categoría + producto. Cero red (§6). | Nuevo |
| `frontend-react/e2e/login.spec.ts` | A1–A7 + D1–D6. Corre por defecto. | Nuevo |
| `frontend-react/e2e/login-rate-limit.spec.ts` | Solo A8, etiquetado `@rate-limit`. | Nuevo |
| `frontend-react/e2e/support/test.ts` | **Estrictamente aditivo**: suma la opción `persona` y las fixtures `signedInPage` y `loginNetwork`. Es la costura que el propio fichero declara (`:10-13`). | Editado (soporte, **no es un test**) |
| `frontend-react/e2e/README.md` | Documenta `signedInPage`, el presupuesto de logins y el costo de la corrida de rate-limit. | Editado (documentación, **no es un test**) |
| `frontend-react/package.json` | **Sin cambios**: `test:e2e` / `test:e2e:rate-limit` ya existen (`:11-12`) y ya filtran por tag. | — |
| `playwright.config.ts`, `register.spec.ts`, `register-rate-limit.spec.ts`, `smoke.spec.ts`, `api-health.spec.ts`, todo `vitest` | — | **SIN TOCAR** |

**`support/` queda en 9 archivos.** El diseño hermano fijó "cuando pase de ~8, particionar con evidencia de qué agrupa con qué". Lo dejo **plano igualmente** en este cambio y anoto el disparador: la partición la decide el cambio siguiente, con los nombres reales sobre la mesa, no adivinando ahora en medio de otra cosa.

**Por qué `session.ts` y no meter todo en `test.ts`**: `test.ts` lo importan los specs de **registro** existentes. Cuanto más chico y más obviamente aditivo sea su diff, más barato es verificar que no los rompió. `test.ts` queda como cableado de fixtures y nada más; la lógica de acuñar personas (~150 líneas, con red real) vive aparte.

---

## 2. Q1 RESUELTA — el presupuesto de logins

> **Decisión**: **no** se serializa "para evitar la ráfaga" — eso no baja la cuota (H2). Se baja el **presupuesto a 4 logins reales** amortizando sesión con `storageState`, y se serializa el bloque que consume login **por una razón distinta**: garantizar que la cadena de personas se acuñe **una sola vez** en vez de una por worker.

### La palanca que sí funciona: restaurar sesión cuesta **cero peticiones**

Verificado, y es la pieza que hace viable todo lo demás:

```
storageState restaurado (AUTH_MODEL + token + currentUser + claves de entidad)
   → auth-store.ts:340-342   initialize() corre en la evaluación del módulo
   → auth-store.ts:75-76     lee AUTH_MODEL
   → auth-store.ts:100-114   hay currentUser cacheado y su authToken coincide
                             → set() y RETURN.  "make NO backend call" (comentario textual :107-111)
```

Una sesión restaurada queda autenticada **sin una sola petición**. Y como `storageState` de Playwright arrastra **todo el `localStorage` del origen**, se lleva también las claves `lizoft.store-{categories,products}-{storeId}` (`storage-keys.ts:8-9`) — es decir, **la siembra viaja con la sesión**. La parte cara se paga una vez.

### El presupuesto, acto por acto

| Acto | `POST /v1/auth/login` | Nota |
|---|---|---|
| Acuñar `owner-admin`: registro + **login observado en vivo** | **1** | Ese mismo login **es** el sujeto de A1/A2/A6/D2/D5. No se paga un login para acuñar y otro para asertar. |
| Crear el StoreUser (`POST /v1/users`) desde la sesión restaurada | 0 | Endpoint sin `[EnableRateLimiting]`. |
| Login del StoreUser → snapshot `store-user` (tienda **sin** productos) | **1** | Mitad "sin productos" de D3, en vivo. |
| Sembrar categoría + producto por UI sobre la sesión `owner-admin` restaurada | **0** | La siembra es **100% local** (§6). |
| D1: restaurar `owner-admin-with-products` → `logout()` → **envío de credenciales real** | **1** | `logout()` borra **solo** `AUTH_MODEL` (`auth-store.ts:303-307`): la siembra sobrevive → aterriza en `/sales/new`. |
| A3 credenciales inválidas (contraseña mala contra el login ya existente) | **1** | Un `succeeded:false` **consume permiso igual**: el limitador es middleware previo al endpoint (`Program.cs:157`). |
| A7, D6, D4, D5, A4, A5, y la mitad "con productos" de D3 | **0** | Sesión restaurada, rebote del guard, o aserciones negativas sobre flujos ya observados. |
| **TOTAL** | **4** | Techo: **5 por minuto** (`RateLimitPolicies.cs:20-21`). |

**Registros reales de la corrida por defecto**: 1 (el de `owner-admin`). Sumado a los 2 de `register.spec.ts`, la corrida completa gasta 3 de 10 en la ventana de 10 minutos. Sobrado.

### Lo que esto NO arregla, dicho entero

**El margen es de exactamente 1 login.** Dos corridas por defecto dentro del mismo minuto suman 8 y **se van a poner rojas por cuota**. La ventana deslizante de 3 segmentos (`:22`) libera permisos de a ~1,67 cada 20 segundos, así que en la práctica una corrida que tarda más de un minuto respira sola — pero eso es una propiedad del reloj, no una garantía, y no se asienta ninguna aserción sobre ella. El fallo por cuota **se diagnostica con texto legible** (§4), nunca con un `expect` mudo.

La única salida que eliminaría la espera es apagar el limitador (entorno `Testing`), y eso **apagaría A8** (H1) — la única aserción que solo Playwright puede verificar. No se hace.

### La serialización, con su motivo correcto

`login.spec.ts` declara `test.describe.configure({ mode: 'serial' })` sobre el bloque que consume login. Motivo, en orden:

1. **Playwright corre un bloque serial completo en UN worker.** Eso hace que la fixture de personas, cacheada a **scope de worker**, acuñe la cadena **exactamente una vez** por corrida en vez de una vez por worker. Es la mitigación de H2.
2. La cadena tiene **dependencia de orden real**: `store-user` necesita que `owner-admin` exista; D1 necesita que la siembra ya esté hecha. Serial hace explícita una dependencia que de todos modos existe.

**Su precio, dicho de frente**: si un test del bloque falla, el resto **se saltea** — la cobertura de esa corrida desaparece. Es el mismo precio que el diseño hermano ya aceptó para REQ-8/REQ-6 (`register.spec.ts:122`), y es el comportamiento correcto: asertar el destino post-login no significa nada si no se sabe que el login previo ocurrió.

A4 y A5 **no** consumen login y **no** usan `signedInPage`: viven en un `describe` aparte que sigue corriendo en paralelo.

---

## 3. El contrato de `signedInPage` — el deliverable de vida más larga

Diez escenarios posteriores se cuelgan de esto. Escrito una vez, acá.

```ts
export type PersonaKind =
  | 'owner-admin'               // recién registrada, 0 categorías, 0 productos → /sales/products
  | 'owner-admin-with-products' // + 1 categoría activa y 1 producto activo/vendible → /sales/new
  | 'store-user'                // StoreUser de la MISMA tienda, acuñado antes de sembrar → /sales/products
  | 'store-user-with-products'; // derivada: snapshot de store-user + claves de entidad sembradas

export interface SignedInSession {
  page: Page;              // ⚠️ ES el mismo objeto que la fixture `page` (ver "Composición")
  identity: TestIdentity;  // login + password reales, para poder re-enviar credenciales
  selectedStoreId: string; // leído de localStorage.currentUser, no adivinado
  homePath: string;        // '/sales/products' | '/sales/new'
}
```

### Las cláusulas

| Cláusula | Qué garantiza | Mecanismo |
|---|---|---|
| **Qué entrega** | Un `page` autenticado en el home de la persona, más la identidad y el `selectedStoreId` para que el test direccione su propio dato. | `SignedInSession` |
| **Cómo llega ahí** | Camino real: `RegisterPage` → `LoginPage` → backend real, identidad única (`newTestIdentity()`). **Nunca** se inventa un token ni se escribe `AUTH_MODEL` a mano. | `session.ts` |
| **Opt-in, nunca `auto`** | Cuesta red y cuota reales. Una fixture que se cobra sola en cada test rompe la suite sin que nadie lo haya pedido. | Opción `persona` con default; la fixture solo se instancia si el test la desestructura. |
| **Cómo se elige la persona** | `test.use({ persona: 'owner-admin-with-products' })` a nivel test o `describe`. Default: `'owner-admin'`. | Option fixture de Playwright |
| **Costo amortizado** | Cada persona se acuña **una vez por worker** y se reusa vía snapshot. Restaurar cuesta **0 peticiones** (§2). | Fixture de **scope worker** con caché `Map<PersonaKind, StorageState>` |
| **Estado inicial determinista** | `owner-admin` no tiene categorías ni productos → `resolveUserHomePath` da `/sales/products` (`user-home.ts:24-25`) sin ambigüedad. La siembra es **opt-in** vía la persona `*-with-products`, nunca implícita. | §6 |
| **Sin roster, jamás** | Ninguna persona llama `importRoster`. `isRosterProvisioned()` queda falso, así que `login.tsx:106` toma siempre la rama online y `needsUnlock` es falso (`loaders.ts:54`, riesgo R4 de la propuesta). Un roster convertiría esto en S1-03 y apagaría lo que S1-02 prueba. | Invariante escrito en `session.ts`, sin call-site que lo viole |
| **Aislamiento entre tests** | Cada test parte de una restauración limpia del snapshot. Lo que un test escriba en su `localStorage` no se filtra al siguiente (Playwright ya da contexto nuevo por test); el snapshot cacheado es inmutable. | Restaurar, nunca compartir contexto vivo |

### Composición con `registerNetwork` — la trampa que este contrato tiene que evitar

`registerNetwork` es `auto: true` y se ata a la fixture **`page`** (`test.ts:25-31`). Si `signedInPage` devolviera un `page` **distinto** (de un contexto nuevo), `registerNetwork` — y el `loginNetwork` nuevo — quedarían escuchando **la página equivocada**, en silencio, para los diez escenarios que vienen. Es el peor tipo de defecto: verde y falso.

| Opción | Veredicto |
|---|---|
| Sobreescribir la fixture `page` para que siempre entregue una autenticada | **Rechazada.** `register.spec.ts` importa el **mismo** `test`: autenticaría todos sus tests y rompería REQ-8 (que prueba que un registro **no** crea sesión). Viola la regla de blast radius y la de opt-in. |
| Devolver un `page` propio de un contexto nuevo | **Rechazada.** Desacopla los observadores del page que el test maneja. Es exactamente la trampa de arriba. |
| `context.addInitScript` para inyectar el snapshot | **Rechazada.** Se re-ejecuta en **cada** navegación: volvería a escribir `AUTH_MODEL` después del `logout()` de D1 y anularía la premisa del test. |
| **Restaurar el snapshot sobre el `page` del propio test** | **Elegida.** `page.goto('/login')` (público, anónimo, barato) → `page.evaluate()` escribe las entradas del snapshot → `page.goto(homePath)` recarga y `initialize()` hidrata. **Un solo `page` por test**, así `registerNetwork`, `loginNetwork` y toda convención futura siguen apuntando adonde el test mira. |

**Invariante publicado**: `signedInPage.page === page`. Es verificable en un assert y hay que mantenerlo.

**Sobre escribir `localStorage` con `page.evaluate()`**: esto **no** contradice la decisión D1 de la propuesta. Lo prohibido es *inventar* el formato de cable privado del repositorio; acá se **reproduce textualmente un snapshot que la propia app produjo** minutos antes, por su propio código. No hay conocimiento de forma, no hay `Map` serializado a mano, no hay clave adivinada: hay copia literal.

### La cadena de acuñación, en orden

```
1. browser.newContext()
2. RegisterPage → 201                                   [1 registro]
3. LoginPage → login real → /sales/products             [1 login]   → snapshot 'owner-admin'
4. /management/users/create → crear StoreUser           [0 login]   (POST /v1/users, sin rate limit)
5. contexto nuevo → login del StoreUser                 [1 login]   → snapshot 'store-user'
6. volver al contexto owner → seedCategoryAndProduct()  [0 red]     → snapshot 'owner-admin-with-products'
7. 'store-user-with-products' = snapshot 'store-user'
                             + claves de entidad de 'owner-admin-with-products'   [0 login]
8. cerrar contextos
```

**El paso 7 merece defensa explícita.** Es un merge de dos snapshots, y se sostiene porque **ambos lados los produjo la app**: las claves de entidad son `StorageKeys.entityKey(entity, storeId)` (`storage-keys.ts:8-9`) y las dos personas comparten **el mismo `storeId`** (el StoreUser se crea dentro de la tienda del owner, `user-create.tsx:20,43`). Se evita así un segundo login del StoreUser, que dejaría el presupuesto en 5 sin margen. La alternativa —dos tiendas, dos registros, dos logins— compra independencia que la aserción no necesita: `S1-02.md:62` dice explícitamente que las dos mitades son **la misma rama** de `user-home.ts:24-25`.

### Cuando la persona no se puede acuñar: R3, y por qué se para

`user-create.tsx:11` exige `adminFeatureLoader([EFeatures.Users])`. Y `adminFeatureLoader` (`loaders.ts:107-112`) encadena `adminLoader` **y después** `featureGate([Users])` — que **no** tiene el bypass de OwnerAdmin del `featureLoader` plano (`:89-91`). Si el OwnerAdmin auto-registrado no trae la feature `Users`, `featureGate` llama `denyAccess()`, que **desloguea y redirige a `/login`** (`loaders.ts:16-19`) en vez de mostrar un error. Es **H-8**, y produciría un fallo ilegible tres pasos más adelante.

**Mecanismo obligatorio**: tras `goto('/management/users/create')`, la acuñación asserta que **no** aterrizó en `/login`. Si aterrizó, lanza:

> `[persona:store-user] El OwnerAdmin auto-registrado NO tiene la feature Users: adminFeatureLoader deslogueó y rebotó a /login (loaders.ts:107-112 + H-8). Esto es el riesgo R3 de la propuesta materializándose. PARAR y preguntarle al usuario si crear el StoreUser por API directa o diferir D3. No lo resuelvas por tu cuenta.`

El texto dice *parar y preguntar* a propósito: la propuesta (R3) fija que D3 **no se descarta en silencio**.

---

## 4. El observador de login — cómo se prueba el **orden**, no la coexistencia

Archivo nuevo: `support/login-network-observer.ts`. Fixture `loginNetwork`, **`auto: true`** (mismo criterio que `registerNetwork`: una salvaguarda que se puede olvidar no es una salvaguarda), atada al `page` del test.

### La aserción de orden

A2 pide "**dos** peticiones **en orden**". Tres lecturas posibles, y no prueban lo mismo:

| Aserción | Qué prueba | Veredicto |
|---|---|---|
| Ambas ocurrieron | Nada sobre secuencia. Pasaría aunque `/me` saliera primero. | **Insuficiente** — es lo que la aserción dice explícitamente que no alcanza |
| El evento `request` de login precede al de `/me` | Orden de emisión del navegador. Correcto pero débil: no descarta que se hayan disparado en paralelo. | Necesario, no suficiente |
| **El `request` de `/me` arranca DESPUÉS de que llegó la `response` del login** | La afirmación causal real: `auth-store.ts:197` **espera** la respuesta del login, escribe `AUTH_MODEL` (`:223-226`) y **recién entonces** llama `getUserByToken()` (`:230`), que hace `GET /v1/auth/me` (`:129`). | **Elegida** |

Implementación: **un solo** `page.on('request')` y un solo `page.on('response')` alimentan un array append-only de `{ kind: 'login' | 'me'; phase: 'request' | 'response'; at: number }`. `expectLoginThenMe()` asserta las tres cosas: exactamente un `POST .../v1/auth/login`; al menos un `GET .../v1/auth/me`; y `meRequest.at >= loginResponse.at`.

**Confusor descartado por lectura**: en un contexto fresco, la carga de `/login` **no** emite `/me` — `initialize()` corre igual, pero `getUserByToken()` sale en `auth-store.ts:76` porque `AUTH_MODEL` no existe. El único `/me` observable en el test de A2 es el que dispara el login.

### El resto de la superficie

| Método | Para qué |
|---|---|
| `waitForLoginResponse()` | Devuelve el cuerpo **capturado en el momento** del evento `response` — no el objeto `Response`. Igual que en el registro (`network-observer.ts:141-157`): el login exitoso navega enseguida y una respuesta leída después de navegar puede encontrarse el cuerpo ya descartado. A3 depende de leer ese cuerpo. |
| `expectNoLoginAttempt()` | A4 y A5. Se llama **después** de esperar el efecto de UI, no antes: `login.tsx:94-98` (validación) y `:124-127` (offline) hacen `return` antes de cualquier llamada, así que con el mensaje ya pintado la decisión de no llamar ya está tomada. Sin carrera que esperar. |
| `expectNoProductApiCall()` | **D5**. Asserta que ninguna petición a `E2E_API_URL` con pathname que matchee `/product/i` fue observada durante el flujo (`ProductOnlineService.API_URL = '/v1/Products/'`, `product-online-service.ts:37`). Deliberadamente **acotado a productos** y no "ninguna otra petición": `login.tsx:136` llama `armTracking()`, y el tracker de uso puede emitir su propio POST en la navegación — bloquear todo haría fallar D5 por telemetría ajena a lo que D5 afirma. El observador igual guarda la lista completa de peticiones a la API para que el mensaje de fallo la imprima. |
| `LoginRateLimitError` | Error tipado en 429, con **los umbrales de login**: `5 intentos por minuto por IP, ventana deslizante de 3 segmentos (RateLimitPolicies.cs:15-24)`. **No** se heredan las constantes del registro — el error sería silencioso (propuesta D4). |
| Guard de backend equivocado + diagnóstico de `requestfailed` | Mismos dos de `network-observer.ts:87-97,130-139`, derivados de la URL observada, nunca de una constante duplicada. |

### Por qué se **duplica** el guard en vez de extraer un núcleo compartido

Extraer la lógica común a un módulo y hacer que `network-observer.ts` lo consuma sería más DRY — y **modificaría un archivo del que dependen dos specs existentes**. Ese trueque está mal puesto: se pagaría riesgo real de regresión sobre `register.spec.ts` a cambio de una ganancia cosmética.

**Decisión: se duplican ~40 líneas de guard y diagnóstico en el archivo nuevo.** Queda anotado como deuda con disparador explícito: **cuando aparezca un tercer observador** (regla de tres), se extrae el núcleo, y la corrida verde de `register.spec.ts` es el gate de ese refactor. Antes no.

---

## 5. `LoginPage` — page object

Análogo a `register-page.ts`, misma política de selectores (`#id` primero, rol + nombre accesible para lo que no tiene id, texto español para mensajes, **nunca** clases de Tailwind, **nunca** agregar `data-testid` a código de producción).

| Miembro | Selector | Fuente |
|---|---|---|
| `email` | `#email` | `login.tsx:219` |
| `password` | `#password` | `login.tsx:240` |
| `togglePasswordVisibility` | rol `button`, nombre `Mostrar contraseña` | `login.tsx:251-253`, `es.ts:808` |
| `submitButton` | rol `button`, nombre `Iniciar sesión` | `login.tsx:270`, `es.ts:62` |
| `loadingOverlay` | `page.getByRole('status').first()` | `loading-overlay.tsx:10` — **`.first()` es obligatorio** (H4) |
| `goto()`, `fill(identity)`, `submit()` | — | Espeja `RegisterPage` |

`smoke.spec.ts:15-16` localiza `input#email`/`input#password` a mano. **No se toca** (regla innegociable) — pero tampoco se repite ese patrón ad-hoc: todo spec nuevo pasa por `LoginPage`.

Nota: el botón es `disabled={isLoading}` (`login.tsx:266`) — `isLoading` del store, **no** `isSubmitting`. Mientras `isSubmitting` es verdadero el botón **no existe**: la ruta devuelve solo el overlay (`:185-186`). Ningún test intenta localizarlo en ese estado.

---

## 6. La siembra por UI — y cómo se distingue su fallo del fallo de login

`support/store-seed.ts` expone `seedCategoryAndProduct(page, name)`. Todos los selectores que necesita **ya existen** en producción; no se agrega ni uno:

| Paso | Selector | Fuente |
|---|---|---|
| Abrir modal de categoría | `[data-testid="add-category-button"]` | `products.tsx:290` |
| Nombre | `[data-testid="category-name-input"]` | `edit-product-category-modal.tsx:74` |
| Guardar (`isActive` ya viene `true`) | `[data-testid="category-save-button"]` | `:111`, default en `:20` |
| Abrir menú de la categoría | `[data-testid="category-actions-toggle-{id}"]` | `category-actions-menu.tsx:32` |
| "Nuevo Producto" | `[data-testid="add-product-button"]` | `:42` |
| Nombre / Precio | `[data-testid="product-name-input"]`, `product-price-input` | `create-product-modal.tsx:118,135` |
| Guardar (`isActive` y `availableToSale` ya vienen `true`) | `[data-testid="create-product-submit"]` | `:203`, defaults en `:42-44` |

**La siembra no emite una sola petición a la API.** `GlobalConfig.USE_ONLINE_SERVICE = false` (`global-config.ts:2`) → `createProductService` devuelve `ProductOfflineService` (`product-service.factory.ts:18-22`) → `localStorage`. Ese hecho es lo que permite que la persona `*-with-products` cueste **0 logins** (§2) — no es un detalle, es la viga.

Y como la tienda nunca importó un roster, `getDek()` es `null` y `encryptEntity`/`decryptEntity` son passthrough en claro (`entity-crypto.ts:57-71`): el snapshot que se captura es legible y estable.

### R7 — que el fallo de siembra **no** se disfrace de fallo de login

La siembra corre **dentro de la fixture de personas** (scope worker), no dentro del cuerpo del test. Consecuencia mecánica: si se rompe, Playwright la reporta como **error de setup de fixture**, no como una aserción fallada del test — nunca vas a ver `expect(page).toHaveURL('/sales/new')` cuando el problema real fue que el modal de categoría no abrió.

Encima, cada paso va envuelto y re-lanzado con su etiqueta:

> `[persona:owner-admin-with-products] la siembra falló en el paso "guardar categoría": <causa>. Esto NO es un fallo de login: revisá /sales/products y el modal de categoría (products.tsx, edit-product-category-modal.tsx).`

---

## 7. Mapeo aserción → mecánica

| # | Aserción | Mecánica | Logins |
|---|---|---|---|
| **A1** | Solo el overlay; el formulario nunca reaparece entre llamadas | Dos muestras **ancladas a eventos de red observados**, no a timeouts: (a) tras `loginNetwork.waitForLoginRequest()` y (b) tras observar el `request` de `/me`. En cada una: `await expect(page.locator('#email')).toHaveCount(0)` — el formulario está **desmontado**, no oculto (`login.tsx:185-186` devuelve solo el overlay) — y `await expect(loginPage.loadingOverlay).toBeVisible()` con el `.first()` de H4. Las dos muestras bracketean los dos huecos entre llamadas. **Residuo declarado**: esto muestrea, no prueba continuidad. La alternativa continua (un `MutationObserver` inyectado por `addInitScript` que registre si `#email` reapareció alguna vez) queda **rechazada por costo/complejidad** frente a dos muestras que ya cubren ambos huecos; anotada por si A1 alguna vez se pone flaky. | comparte S1 |
| **A2** | `POST /v1/auth/login` → `GET /v1/auth/me`, en orden | `loginNetwork.expectLoginThenMe()` (§4) | comparte S1 |
| **A3** | 200 + `succeeded:false` → banner con `errors[0].description` **literal** | Contraseña incorrecta contra el login ya existente. `waitForLoginResponse()` → `status === 200`; se parsea `errors[0].description` **del cuerpo**, se interpola en `La autenticación no es válida por el siguiente error: {error}` (`es.ts:84`) y se asserta ese texto. Control negativo obligatorio: el banner **no** es `Email o contraseña inválidos` (`es.ts:80`) — eso significaría que se tomó la rama 401 y no la de cuerpo (`login.tsx:158-172`). Misma lógica de **procedencia** que A9 del hermano: no se hardcodea el texto del backend. | **1** |
| **A4** | Campos vacíos: sin petición | Submit con todo vacío → `El email es requerido` (`es.ts:67`) + `La contraseña es requerida` (`es.ts:69`) visibles → `expectNoLoginAttempt()` | 0 |
| **A5** | Offline sin roster: sin petición, banner | Orden obligatorio: `goto` → llenar → `setOffline(true)` → submit. Banner `Estás offline. Se requiere conexión para iniciar sesión.` (`es.ts:85`) → `expectNoLoginAttempt()`. H3 confirma que el import dinámico de `:105` no rompe esto. | 0 |
| **A6** | `localStorage` tiene `AUTH_MODEL` con `{authToken, expiresIn}` | **No se hardcodea la clave.** Es `${APP_VERSION}-authf496fc5a9f17` (`storage-keys.ts:5`) y `APP_VERSION` sale de `import.meta.env` (`global-config.ts:3`). El test **escanea** `localStorage` buscando la clave que termina en `-authf496fc5a9f17` — el sufijo es la parte estable — y asserta `authToken` string no vacío + `expiresIn` numérico en el futuro. | comparte S1 |
| **A7** | Autenticado que visita `/login` es redirigido a su home | `signedInPage` (`owner-admin`) → `goto('/login')` → `toHaveURL(/\/sales\/products$/)`. Rebote de `guestOnlyLoader` (`loaders.ts:48-56`), que lee estado hidratado sincrónicamente en la evaluación del módulo (`auth-store.ts:340-342`). | 0 |
| **A8** | 429 → `AUTH.TOO_MANY_ATTEMPTS` | §8 | (spec aparte) |
| **D1** | OwnerAdmin **con** productos → `/sales/new` | `signedInPage` (`owner-admin-with-products`) → `logout()` desde la UI → **envío de credenciales real** con `identity` → `toHaveURL(/\/sales\/new$/)`. Es un login de verdad, no un rebote: `logout()` borra **solo** `AUTH_MODEL` (`auth-store.ts:303-307`) y la siembra sobrevive. | **1** |
| **D2** | OwnerAdmin **sin** productos → `/sales/products` | El aterrizaje del login S1 | comparte S1 |
| **D3** | StoreUser con productos → `/sales/new`; sin → `/sales/products` | Mitad "sin productos": login real del StoreUser (persona `store-user`, tienda todavía sin sembrar) → `/sales/products`. Mitad "con productos": persona `store-user-with-products` → `goto('/login')` → rebote del guard → `/sales/new`. Legítimo porque es **la misma función** (`S1-02.md:65`, `loaders.ts:56`). | **1** |
| **D4** | Ningún OwnerAdmin ni StoreUser aterriza en `/admin/owners` | Aserción negativa sobre las cuatro URLs finales ya observadas (S1, D1, y las dos mitades de D3): ninguna matchea `/admin/owners`. 0 navegaciones nuevas. | 0 |
| **D5** | El destino se resuelve con dato **local**, no con la API | `loginNetwork.expectNoProductApiCall()` sobre el flujo de S1 y el de D1 (§4) | 0 |
| **D6** | La misma función gobierna el rebote del guard | El destino observado en A7 (rebote) es idéntico al observado en D2 (login explícito) para la **misma** persona; y el de `store-user-with-products` (rebote) es idéntico al de D1 (login explícito) para la misma tienda sembrada. La consistencia es la aserción. | 0 |

---

## 8. A8 — aislamiento del 429, con los números de **login**

Mismo patrón que el hermano, **sin heredar sus constantes**:

```ts
test.describe('login — rate limit (A8)', { tag: '@rate-limit' }, () => {
  test.setTimeout(60_000);   // no 120_000: la ventana es 10x más corta
  const MAX_ATTEMPTS = 7;    // no 11: PermitLimit=5 (+2 de margen por si un segmento libera a mitad de bucle)
```

| | Registro (existente) | **Login (nuevo)** |
|---|---|---|
| Límite / ventana / segmentos | 10 / 10 min / 10 | **5 / 1 min / 3** |
| `MAX_ATTEMPTS` | 11 | **7** |
| Timeout del spec | 120 s | **60 s** |
| Banner | `Demasiados intentos de registro...` (`es.ts:126-127`) | **`Demasiados intentos. Esperá un momento antes de volver a intentar.`** (`es.ts:83`) |
| Filas dejadas en la base | 1 | **0** |

**Cero filas** es una mejora sobre el hermano y sale gratis: el 429 no necesita una cuenta válida. Se usan credenciales de `newTestIdentity()` **que nunca se registraron** — el servidor contesta `succeeded:false` y **consume permiso igual**, porque el limitador corre en el pipeline antes del endpoint (`Program.cs:157`). El bucle corta apenas `waitForLoginResponse()` lanza `LoginRateLimitError`, y ahí asserta el banner.

Aislamiento **por etiqueta**, nunca por config ni por un `project` nuevo: `playwright.config.ts:109` tiene una sola entrada sin `testMatch`, así que un segundo project correría **todos** los specs dos veces, incluidos `smoke.spec.ts` y `api-health.spec.ts` — o sea, cambiaría cómo corre un test existente. Se descarta antes de llegar ahí. Los scripts ya existen (`package.json:11-12`): `package.json` **no se toca**.

**Después de correrlo, cualquier login desde tu IP falla hasta ~1 minuto.** Ojo con el orden inverso al del registro: acá la espera es corta pero la ventana también, así que `pnpm test:e2e` inmediatamente después va a chocar.

---

## 9. Blast radius — la regla mecánica

`test.ts` y `network-observer.ts` los consumen los specs de registro **existentes**. Regla, sin excepciones:

| Objeto | Garantía |
|---|---|
| `registerNetwork` en `test.ts` | Conserva `auto: true`, su cuerpo y su posición. El diff de `test.ts` es **solo adiciones**: la opción `persona`, y las fixtures `loginNetwork` y `signedInPage`. |
| `installRegisterNetworkObserver` | Firma y comportamiento intactos. Por eso el observador de login va a **archivo propio** (§4). |
| `RegisterFixtures` | Se **extiende** el tipo, no se reescribe. |
| `playwright.config.ts` | Sin tocar. Sin `projects` nuevos, sin `dependencies`, sin `testIgnore`, sin cambiar `workers`. Toda la serialización vive **dentro** de `login.spec.ts` (§2). |
| `identity.ts`, `backend-url.ts`, `register-page.ts` | Se **importan**, no se modifican. |
| Cualquier fichero `vitest` | Ni se agrega, ni se edita, ni se renombra, ni se corre. |

**Si la implementación concluye que necesita cambiar la firma o el comportamiento de algo que el registro ya usa, eso es un stop-and-ask**, no una decisión de la fase de apply. Lo mismo si una corrida de Playwright expone una discrepancia con un mock de `vitest` de los ficheros de login (propuesta, Q2): vuelve como **pregunta**.

**Gate de verificación obligatorio**: `pnpm exec playwright test e2e/register.spec.ts` sigue verde.

---

## 10. Comandos del usuario, en orden

> Decisión D2 de la propuesta: el agente **no ejecuta nada de esto**. Son **tus** comandos.

**Terminal 1 — backend.** PostgreSQL en `127.0.0.1:5432`, base `smca`.

```bash
dotnet run --project backend/src/SMCA.WebApi --launch-profile http
```

**Nunca** `--launch-profile https` (certificado autofirmado que el navegador rechaza) y **nunca** bajo `ASPNETCORE_ENVIRONMENT=Testing` (apagaría el limitador y con él A8 — H1).

**Terminal 2 — la suite.** No hay `.env` que crear ni copiar.

```bash
cd frontend-react
pnpm test:e2e            # A1-A7 + D1-D6   → 4 logins, 1 registro, 1 fila Owner+Store + 1 User
pnpm test:e2e:rate-limit # solo A8         → agota la cuota de login ~1 min, 0 filas
```

### Verificación

- [ ] `pnpm test:e2e` verde con el backend arriba.
- [ ] `pnpm test:e2e` **falla ruidosamente** con el backend abajo (nunca saltea en silencio).
- [ ] `pnpm exec playwright test e2e/register.spec.ts` sigue verde — los specs de registro no se enteraron de nada (§9).
- [ ] `pnpm test:e2e:rate-limit` verde por separado, y deja **0 filas** nuevas.
- [ ] `pnpm test:e2e` **dos veces dentro del mismo minuto**: si se pone rojo por cuota, es el margen de 1 de §2 manifestándose, **no** un defecto. El mensaje lo va a decir con esas palabras.

---

## 11. Riesgos

| # | Riesgo | Sev. | Postura |
|---|---|---|---|
| **R1** | **El margen es de 1 login** (4 de 5). Dos corridas en el mismo minuto se ponen rojas por cuota. | Alta | **Aceptado y documentado.** Bajado de ~5-6 a 4 por la amortización de §2. No hay salida que lo elimine sin apagar el limitador, y eso apagaría A8 (H1). El fallo se diagnostica con texto legible, nunca con un `expect` mudo. |
| **R2** | **R3 de la propuesta: la feature `Users`.** Si el OwnerAdmin auto-registrado no la tiene, `adminFeatureLoader` **desloguea** en vez de errorear (H-8) y la persona `store-user` no se puede acuñar. **No verificado ejecutando.** | Media | Detectado explícitamente y convertido en un mensaje que **manda parar y preguntar** (§3). D3 no se descarta en silencio. |
| **R3** | **`describe.serial` aborta el resto del bloque** si un test falla. | Media | Aceptado. Es el precio de acuñar una sola vez (§2) y de dependencias de orden que existen de todos modos. Mismo trato que en `register.spec.ts:122`. |
| **R4** | **A1 muestrea, no prueba continuidad.** Podría existir un parpadeo del formulario entre las dos muestras. | Baja | Declarado en §7 con la alternativa continua nombrada y su motivo de rechazo. Las dos muestras bracketean los dos huecos que la aserción nombra. |
| **R5** | **El merge de snapshots de `store-user-with-products`** (§3, paso 7) es más sutil que un login real. Si `storeId` divergiera, la mitad "con productos" de D3 probaría nada. | Baja | Ambos snapshots los produjo la app y comparten `storeId` por construcción (`user-create.tsx:20,43`). La acuñación asserta esa igualdad antes de mergear. |
| **R6** | **La siembra por UI mete superficie ajena al login** dentro del alcance del test de login (R7 de la propuesta). | Media | Aceptado y atribuido. Mitigado hasta hacerlo inconfundible: corre en la fixture, falla como error de setup, y el mensaje nombra el paso (§6). |
| **R7** | **¿Un login fallido consume permiso?** A8 lo asume (limitador como middleware previo, `Program.cs:157`). **No verificado ejecutando.** | Baja | Se confirma en la primera corrida de `test:e2e:rate-limit`. Si no consumiera, A8 necesitaría logins **exitosos** — y eso se reporta, no se disimula. |
| **R8** | **CORS en la respuesta 429** (R1 del diseño hermano, sin verificar todavía en runtime): si el 429 no lleva headers CORS, el navegador reporta error de CORS, `login.tsx:178` cae en `AUTH.SERVER_ERROR` y A8 falla por infraestructura. | Media | **No verificado.** El mensaje de fallo del bucle lo nombra como sospechoso principal, igual que el hermano. Sería un hallazgo de backend, no un bug del test. |
| **R9** | **Basura acumulada**: 1 `Owner` + 1 `Store` + 1 `User` por corrida por defecto. Sin teardown alcanzable desde el navegador. | Media | Aceptado, misma postura que S1-01. Prefijo `e2e-` + timestamp (`identity.ts:39`) los hace greppables y borrables. Acotado a `smca`, no `smca_test`. |
| **R10** | **`support/` queda en 9 archivos**, por encima del umbral de ~8 que fijó el diseño hermano para particionar. | Baja | Se deja plano a propósito en este cambio; la partición la decide el siguiente con los nombres reales sobre la mesa. Anotado para que no se pierda. |

---

## 12. Próximo paso

`sdd-tasks` (requiere que `sdd-spec` también esté listo).

Lo que tasks tiene que arrastrar de acá: **H1** (el limitador está prendido — Q1 no se evapora), la **decisión Q1** de §2 (presupuesto de 4 logins vía `storageState`; serial por duplicación de personas, no por ráfaga), el **contrato de `signedInPage`** de §3 con su invariante `signedInPage.page === page`, la **aserción de orden causal** de §4, los **umbrales de login** de §8 (5/1min, `MAX_ATTEMPTS = 7`, timeout 60 s), la **regla de blast radius** de §9 con su gate, y los dos puntos donde la implementación **para y pregunta**: R2 (feature `Users`) y cualquier tensión con un mock de `vitest`.
