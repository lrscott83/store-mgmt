# Propuesta — `e2e-playwright-session-hydration-s1-04`

> Fase SDD: **propose**. Estado: **abierta**. Fecha: 2026-08-07.
> Entrada: [`exploration.md`](exploration.md) (cerrada, 4 decisiones resueltas + requisito 7-bis).
> Próximas fases: `sdd-spec` y `sdd-design` (pueden correr en paralelo).

## En una frase

Llevar S1-04 de **PENDIENTE** a cubierto en la capa Playwright con **11 tests aditivos y cero logins nuevos**, y aprovechar el viaje para **pinear contra regresión** el invariante que el usuario pidió: *ni la falta de red ni una respuesta de error terminan la sesión; solo la termina un veredicto del servidor o una acción del usuario*.

---

## 1. Intención

### El problema

`docs/testing/e2e-stage-1/README.md:33` marca S1-04 como **PENDIENTE** en Playwright. La hidratación de sesión es CRÍTICA y hoy su única cobertura de navegador es **ninguna**: lo que existe es `vitest`/`jsdom` (`auth-store.test.ts`, `auth-store.session-rejected.test.ts`), y el plan de Etapa 1 es explícito en que eso **no cuenta** como E2E frontend (`README.md:24`).

Encima hay un problema de segundo orden, más silencioso: el comportamiento *offline-first* de `getUserByToken()` está sostenido únicamente por **comentarios**. El propio código lo dice en `auth-store.ts:178-179`:

> *"clearing here breaks offline use, which is the whole product."*

Un comentario no falla en CI. Cualquier refactor que "limpie" ese `catch` rompe el producto entero para un usuario sin conexión, y **ningún test de navegador se pondría rojo**.

### Por qué ahora

Tres razones que convergen:

1. **La fixture ya está paga.** `signedInPage`/`personaCache` nació con S1-02 y las 4 personas están memoizadas. Los diez escenarios restantes de Etapa 1 arrancan con "usuario autenticado"; S1-04 es el primero que puede consumir esa inversión con **costo marginal cero de logins**.
2. **El usuario levantó el invariante explícitamente** (exploración, sección 7-bis). Está sin pinear y sin documentar.
3. **El mapa de líneas de `S1-04.md` está podrido** (+24 a +47). Cada día que pasa, un lector más cita código equivocado.

### Cómo se ve el éxito

| # | Criterio | Verificable con |
|---|---|---|
| 1 | Las 8 aserciones de S1-04 tienen un test Playwright, o una **brecha declarada por escrito** con su causa | `login.spec.ts` + spec del cambio |
| 2 | El invariante offline-resiliencia queda pineado con al menos los 2 casos que pidió el usuario (401 no-`/me`, red caída) | tests T9, T10 |
| 3 | La corrida por defecto sigue gastando **exactamente 4 logins reales** | `expectLoginThenMe` + ausencia de personas nuevas |
| 4 | Ningún test existente cambió, ni una línea | `git diff` sobre `login.spec.ts`: solo adiciones al final del `describe.serial` |
| 5 | Los 6 disparadores de logout quedan escritos como **lista cerrada** en los dos READMEs | `docs/testing/README.md`, `docs/testing/e2e-stage-1/README.md` |
| 6 | `S1-04.md` no tiene ni una cita de línea desfasada | diff contra el mapa de la sección 2 de la exploración |

---

## 2. La restricción que manda: cero logins nuevos

El techo es **5 logins/minuto por IP** (`LoginPolicy`, H-12) y `login.spec.ts` ya gasta **4**. El margen es **1**, y ese 1 es el colchón para reintentos, no presupuesto disponible.

La decisión #1 ya lo resolvió: **los 11 tests van al final del `describe.serial` de `login.spec.ts`**. De ahí sale una regla que el diseño y la implementación no pueden negociar:

> **Todo test nuevo restaura una persona ya acuñada. Ninguno acuña una persona nueva, ni llama `personaCache.prime*()`.**

No es estilo, es aritmética. Si un test nuevo resolviera `owner-admin` **antes** de que el primer test lo primee, `mintOwnerAdmin()` cae al fallback y hace un **registro + login reales** (`session.ts:207-226`) → 5/5 sin colchón. Apendear al final del bloque serial es lo que garantiza que eso no pase: cuando corren los nuevos, `owner-admin` (test #1) y `store-user` (REQ-11) ya están primeados, y las dos personas `-with-products` se derivan por *merge* de snapshots sin tocar la red.

Personas permitidas para los tests nuevos: `owner-admin` (la más barata), y si hace falta `owner-admin-with-products` / `store-user` / `store-user-with-products`. **Ninguna cuesta un login.** El costo de `owner-admin-with-products` es de *tiempo* (abre contexto y siembra por UI), no de cuota.

---

## 3. Alcance

### Dentro

| # | Bloque | Qué entra |
|---|---|---|
| A | Las 8 aserciones originales de S1-04 | 8 tests, honrando decisiones #1, #2 y #3 |
| B | Invariante de resiliencia offline (7-bis) | 3 tests aditivos más allá de las 8 |
| C | Infraestructura del observer | 1 método **aditivo** para afirmar el conteo exacto de `GET /me` |
| D | Documentación del invariante | `docs/testing/README.md` + `docs/testing/e2e-stage-1/README.md` |
| E | Decisión #4 | Corregir las citas de línea de `docs/testing/e2e-stage-1/S1-04.md` |

### Fuera — con la razón, no como omisión

| Fuera | Por qué |
|---|---|
| **Cambiar el comportamiento de producción** | El invariante **ya existe y funciona** (`auth-store.ts:189-190`, `api-client.ts:84-86`). Estos tests lo pinean; no lo crean. Cualquier hallazgo que pida tocar `auth-store.ts` o `api-client.ts` **para y pregunta** |
| Tocar cualquier test existente, incluido el **título** del `describe.serial` | La autorización de la decisión #1 es **estrictamente aditiva**. Renombrar el título es tocar una línea existente y **no está autorizado** — ver pregunta abierta P1 |
| El **404 real** de `GET /me` | Decisión #2. Depende del gap **H-6**: ninguna pantalla llama `activate(false)`, así que desactivar una cuenta desde la UI no es alcanzable |
| Disparadores de logout #3 (rol), #5 (idle 1h) y #6 (post-cambio de contraseña) | Se **documentan** como parte de la lista cerrada, pero su cobertura E2E pertenece a S2-03/S3-03 (H-8), a un escenario de vida de sesión (H-4) y a S4-02 respectivamente |
| Un spec file nuevo | Costaría el login del margen (exploración, sección 4) |
| `network-observer.ts` (el de register) | Lo consumen `register.spec.ts` y `register-rate-limit.spec.ts`. No se toca |
| S1-03 (login offline con roster) | `session.ts:40-45` nunca importa un roster a propósito; importarlo convertiría esto en otro escenario |
| La capa .NET | S1-04 ya está **CUBIERTO** ahí (`AuthMeTests`, `AuthMeFailureTests`, `AuthMePermissionsTests`) |

---

## 4. Enfoque — el inventario de tests

### Bloque A — las 8 aserciones de S1-04

| Test | Aserción | Vehículo | Costo |
|---|---|---|---|
| **T1** | Caché válida ⇒ **cero** `GET /me` | restaurar `owner-admin` → `page.reload()` → `expectMeRequestCount(0)` | 0 |
| **T2** | Sin caché usable ⇒ **exactamente un** `GET /me` | corromper `currentUser.authToken` (⚠️ **no** `AUTH_MODEL`) → reload → rama *best-effort* → `expectMeRequestCount(1)`, sigue autenticado | 0 |
| **T3** | Servidor inalcanzable + sin caché ⇒ **sigue autenticado** | mismo mismatch + `page.route()` que aborta `/me` → reload → `AUTH_MODEL` intacto, no rebota a `/login` | 0 |
| **T4** | `/me` **401** ⇒ logout + `/login` | corromper `AUTH_MODEL.authToken` con un JWT inválido y `expiresIn` futuro → **401 del backend real** | 0 |
| **T5** | `/me` **500** ⇒ **NO** desloguea | mismatch + `page.route()` que responde 500 → sigue autenticado | 0 |
| **T6** | `expiresIn === Date.now()` exacto ⇒ expirada | `page.clock` congelado + `AUTH_MODEL.expiresIn` = ese instante exacto | 0 |
| **T7** | `logout()` borra **solo** `AUTH_MODEL` | botón "Salir" real → `AUTH_MODEL` ausente, `token` y `currentUser` **presentes y obsoletos a propósito** | 0 |
| **T8** | `logout()` **no** redirige en `/login` o `/` | escribir `AUTH_MODEL` vencido estando en `/login` → `goto('/login')` → `initialize()` dispara `logout()` con `pathname === '/login'` | 0 |

**Por qué T4 es elegante y no un truco.** Una sola mutación produce las dos condiciones que el test necesita: al corromper `AUTH_MODEL.authToken`, el `cachedProfile.authToken` deja de coincidir (`auth-store.ts:127`) — así que se entra a la rama *best-effort* — y el token que viaja en el header es inválido, así que el backend **real** contesta 401. Cero mocks, decisión #2 respetada al pie.

**La brecha del 404, redactada con precisión** (refinamiento de la decisión #2). `isSessionRejection` evalúa `status === 401 || status === 404` en **la misma expresión** (`auth-store.ts:44`). Por lo tanto T4 ejercita **exactamente la rama de cliente** que un 404 recorrería. La brecha declarada **no** es "la reacción del cliente al 404 está sin cubrir" — es únicamente: *no está verificado en Playwright que el backend devuelva 404 para una cuenta desactivada*. Eso depende de **H-6**.

**Por qué T7 y T8 valen aunque `vitest` ya los cubra.** Decisión #3: el plan de Etapa 1 dice que `vitest` no cuenta como E2E frontend. Cuestan cero logins.

### Bloque B — el invariante de resiliencia offline

| Test | Aserción | Vehículo | Costo |
|---|---|---|---|
| **T9** | Un **401 en una llamada que NO es `/me`** deja la sesión intacta | restaurar `owner-admin` → `/profile/edit` → `page.route()` responde 401 al `PUT /v1/users/{id}` → sigue en la pantalla, `AUTH_MODEL` intacto, una ruta protegida sigue abriendo | 0 |
| **T10** | **Sin red**, la sesión sobrevive | `context.setOffline(true)` → el arranque no puede alcanzar `/me` → usuario *best-effort* retenido, `AUTH_MODEL` intacto, no `/login` | 0 |
| **T11** | `AUTH_MODEL` malformado pero parseable ⇒ **no borra nada** | escribir `{"foo":1}` → reload → `AUTH_MODEL` **sigue en `localStorage`** | 0 |

**T9: por qué acá sí se mockea, sin contradecir la decisión #2.** Son dos preguntas distintas y merecen instrumentos distintos:

- Decisión #2 prohibió mockear el 404 porque la pregunta era **"¿qué devuelve el servidor?"** — una pregunta de servidor, y mockearla la responde con la respuesta que uno mismo escribió.
- T9 pregunta **"¿qué hace el interceptor del cliente con un 401?"** (`api-client.ts:84-86`). Es una pregunta 100% de cliente: no hay verdad de servidor que aseverar. El 401 es la **entrada** del sistema bajo prueba, no su salida.

**T9: por qué `/profile/edit` y no otra pantalla.** Es la única pantalla verificada que un OwnerAdmin auto-registrado alcanza **sin riesgo de H-8**: usa `featureLoader([EFeatures.Profile])` (`edit-profile.tsx:10`), y `featureLoader` tiene el bypass de OwnerAdmin **antes** de cualquier chequeo de `featureIds` (`loaders.ts:89-91`). Las pantallas de `/management/*` usan `adminFeatureLoader`, que **no** tiene ese bypass (`loaders.ts:107-112`) y **desloguea** al OwnerAdmin sin la feature — un falso positivo catastrófico justo para el test que afirma "acá nadie desloguea". El envío del formulario dispara `PUT /v1/users/{id}` (`profile-http-service.ts:21`), que es real, es de usuario y no es `/me`.

**T11: la afirmación exacta, que no es la obvia.** `auth-store.ts:112-115` hace `return null` **sin** llamar `logout()` y **sin** borrar nada. En arranque en frío, el estado queda en su default `{ user: null, isAuthenticated: false }`, así que los guards **sí** rebotan a `/login`. Decir "la sesión sobrevive" sería **falso**. Lo observable, y lo único que este test debe afirmar, es que **`AUTH_MODEL` sigue presente y `logout()` no corrió** — que es exactamente la fila del inventario. Escribirlo de la otra forma sería un test que no distingue el comportamiento correcto del incorrecto.

### Bloque C — el único artefacto de soporte que se escribe

El observer sabe decir "cero intentos de login" (`expectNoLoginAttempt`, `login-network-observer.ts:332`) pero **no tiene el hermano para `/me`**. T1 y T2 lo necesitan.

**Adición propuesta**: un método `expectMeRequestCount(expected)` sobre la interfaz `LoginNetworkObserver`. Estrictamente aditivo:

- No modifica ninguna función existente.
- No cambia el listener de `page.on('request')` — el contador de `/me` ya se puede derivar del array `events` que hoy se llena en `:194`.
- `login.spec.ts` y `login-rate-limit.spec.ts` deben quedar **verdes sin cambios** — es una compuerta, no un deseo.

**Precedente considerado, y por qué no aplica.** El propio fichero documenta (`:123-129`) que se duplicó desde `network-observer.ts` en vez de modificarlo, para no poner en riesgo dos specs existentes. Ese precedente era sobre **reestructurar un núcleo compartido**. Agregar un método nuevo que nadie existente invoca es una operación de naturaleza distinta. La compuerta de arriba es lo que separa una cosa de la otra.

### Bloque D — documentación del invariante

Dos ficheros, **en castellano**, respetando la estructura y la voz que ya tienen.

**`docs/testing/README.md`** — hoy tiene una sección "Regla del proyecto (innegociable)" y otra "Las dos capas de cobertura". El invariante entra como sección hermana, corta, con la lista cerrada de 6 disparadores y la superficie que **no** debe cerrar sesión.

⚠️ **Cuidado con una contradicción aparente**: `docs/testing/README.md:20` dice *"Ninguna de las dos prueba el comportamiento offline puro sobre `localStorage`"*, y sigue siendo cierto. El invariante **no** es sobre los dominios offline (productos, ventas, inventario): es sobre la **supervivencia de la sesión** ante red caída o respuesta de error. La redacción tiene que dejar esa frontera nítida en vez de pisarla.

**`docs/testing/e2e-stage-1/README.md`** — la nota del invariante va junto a los hallazgos, y además hay que dejar el fichero **verdadero**:

| Línea | Qué queda desactualizado |
|---|---|
| `:33` | Fila de S1-04: **PENDIENTE** → el estado que corresponda |
| `:73` | *"La corrida por defecto son 20 tests"* → nuevo conteo |
| `:75` | El presupuesto de logins sigue siendo 4/5 — hay que **confirmarlo**, no reescribirlo |

Esas tres actualizaciones se hacen **cuando los tests estén verdes**, no antes: un README que promete cobertura que todavía no corrió es peor que uno desactualizado.

### La lista cerrada de disparadores de logout

Esto es lo que hay que escribir en los dos READMEs. Sale del inventario **verificado** de la exploración (7-bis).

**La sesión termina automáticamente — solo acá:**

| # | Sitio | Disparador | ¿Pineado en este cambio? |
|---|---|---|---|
| 1 | `auth-store.ts:117-120` | Token vencido **localmente** (`expiresIn <= Date.now()`) | ✅ T6, T8 |
| 2 | `auth-store.ts:185-186` | **Veredicto** del `/me` de arranque: `SessionRejectedError`, 401 o 404 (`isSessionRejection:39-45`) | ◐ T4 (401 real; 404 = brecha, H-6) |
| 3 | `auth/routes/loaders.ts:17` | Fallo de autorización por rol (**H-8**) | ❌ fuera de alcance (S2-03/S3-03) |

**La termina el usuario o la UI — solo acá:**

| # | Sitio | Disparador | ¿Pineado en este cambio? |
|---|---|---|---|
| 4 | `shared/components/navbar.tsx:46` | Click en "Salir" | ✅ T7 |
| 5 | `shared/components/app-layout.tsx:58` | Timer de inactividad de 1h (**H-4**) | ❌ fuera de alcance |
| 6 | `profile/routes/change-password.tsx:28` | Después de cambiar la contraseña | ❌ fuera de alcance (S4-02) |

**Lo que explícitamente NO cierra sesión — la superficie blindada:**

| Caso | Sitio que lo garantiza | ¿Pineado? |
|---|---|---|
| **Cualquier** 401 del interceptor HTTP compartido (diverge de Angular a propósito) | `api-client.ts:84-86` | ✅ T9 |
| Error de red, DNS, timeout de 30s o **5xx** durante el `/me` de arranque | `auth-store.ts:189-190` | ✅ T3, T5, T10 |
| `AUTH_MODEL` malformado pero parseable | `auth-store.ts:112-115` | ✅ T11 |

### Bloque E — decisión #4: las citas de `S1-04.md`

Trabajo mecánico contra el mapa ya corregido de la exploración (sección 2). Las **13 filas** de ese mapa se materializan en **15 cadenas de cita** dentro de `S1-04.md`, más una que la exploración no había mapeado:

| Fila | Cadena en `S1-04.md` | Real |
|---|---|---|
| — (**nueva, no estaba en el mapa**) | `:23` → `auth-store.ts:74-168` | **`:98-190`** — `getUserByToken` abre en `:98` y cierra en `:190`, verificado de primera mano |
| 1 | `:27` → `:75-76` | `:99-100` |
| 2 | `:28` → `:79-84` | `:103-108` |
| 3 | `:29` → `:86-89` | `:110-113` |
| 4 | `:30` → `:91-96` · `:46` → `:91` | `:115-120` · `:115` |
| 5 | `:31` → `:100-114` | `:124-138` |
| 6 | `:32` → `:120-129` | `:144-153` |
| 7 | `:41` → `:107-113` | `:131-137` |
| 8 | `:42` → `:129` | `:153` |
| 9 | `:43` → `:147-164` | `:171-188` |
| 10 | `:44` → `:39-45` **(correcta, no tocar)** · `:159-161` | `:39-45` · `:183-185` |
| 11 | `:45` → `:159-164` | `:183-188` |
| 12 | `:47` → `:303-307` | `:350-359` |
| 13 | `:48` → `:317-320` | `:364-367` |

**Dos ítems más que hay que verificar, no asumir**, en el mismo work unit:

- `S1-04.md:44` cita el comentario en `auth-store.ts:29-33`. La exploración no lo mapeó.
- `S1-04.md:64` cita `auth-store.test.ts:321,338,360` y `auth-store.session-rejected.test.ts:68-124`. La exploración verificó que `auth-store.test.ts:287-315` **no** está desfasada, pero **no** verificó esas tres. Se comprueban leyendo; si están bien, se dejan.

---

## 5. Unidades de trabajo

Entrega **commits-only** (sin PR) en rama nueva `feat/e2e-playwright-session-hydration-s1-04`, creada **desde la rama actual** `feat/e2e-playwright-login-s1-02`. Un commit por unidad (skill `work-unit-commits`).

| WU | Contenido | Ficheros | Riesgo |
|---|---|---|---|
| **1** | `expectMeRequestCount()` + **T1** + **T2** | `login-network-observer.ts` (aditivo), `login.spec.ts` (append) | Compuerta: `login-rate-limit.spec.ts` verde |
| **2** | **T3** + **T5** + **T10** + **T11** — la resiliencia | `login.spec.ts` | R1 (bundle offline), R2 (Swal del 500) |
| **3** | **T4** — el único veredicto real observable | `login.spec.ts` | Ninguno destacado |
| **4** | **T6** — `page.clock`, límite inclusivo | `login.spec.ts` | R3 (relojes) |
| **5** | **T7** + **T8** — qué borra `logout()` y cuándo no redirige | `login.spec.ts` | R4 (redirección no observable) |
| **6** | **T9** — 401 en llamada no-`/me` | `login.spec.ts` | Ninguno destacado |
| **7** | Documentación del invariante + los 3 arreglos de verdad del README de Etapa 1 | `docs/testing/README.md`, `docs/testing/e2e-stage-1/README.md` | Va **después** de que 1–6 estén verdes |
| **8** | Decisión #4 — citas de `S1-04.md` | `docs/testing/e2e-stage-1/S1-04.md` | Independiente; puede ir primero |

**Orden de aplicación obligatorio dentro de `login.spec.ts`**: WU-1…WU-6 **apendean al final** del `describe.serial`, en ese orden. Nunca insertar entre tests existentes — el fichero declara en `:85-89` que el orden de declaración es *load-bearing* (el primer test primea `owner-admin`, REQ-11 primea `store-user`).

**Estimación de volumen**: ~11 tests × 20-35 líneas + ~40 del observer + ~80 de documentación ≈ **450-550 líneas**, casi todas aditivas. Por encima del presupuesto de 400 líneas de una revisión — `sdd-tasks` va a tener que pronunciarse sobre el fraccionamiento.

### Nota sobre Strict TDD

Está activo, y hay que aplicarlo con honestidad en vez de mecánicamente:

- **Sí aplica literalmente** al único artefacto nuevo: `expectMeRequestCount()`. Rojo primero, con T1 fallando por ausencia del método.
- **No aplica literalmente** a T1–T11 como *pins*: el comportamiento de producción **ya existe**, así que un pin bien escrito pasa en la primera corrida. Rojo-primero ahí sería teatro.
- **La disciplina equivalente es la verificación de mordida**: antes de dar por bueno cada pin, comprobar localmente que puede fallar (invirtiendo la expectativa del test, en el árbol de trabajo, sin commitear). Un pin que no se demostró capaz de ponerse rojo no es un pin: es una línea verde decorativa. Esto **nunca** implica tocar código de producción.

---

## 6. Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| **R1** | **`setOffline(true)` + `reload()` puede no cargar el bundle de la SPA.** Es la misma trampa que ya documentan `login.spec.ts:68-71` y REQ-7 de register: hay que ir online primero, y recién ahí cortar | T10 falla contra la pantalla de error del navegador, no contra la app | El diseño elige entre: (a) cortar **solo el tráfico de API** con `page.route()` en vez de matar la red entera, o (b) disparar el camino de arranque con una navegación interna en vez de un `reload()`. **Debe resolverse en `sdd-design`, no en `sdd-apply`** |
| **R2** | **Un 500 abre un diálogo bloqueante** (`showBlockingError`, `api-client.ts:88-95`) | T5 se cuelga o afirma sobre una pantalla tapada por un modal | Tratar el diálogo como parte del comportamiento esperado: afirmarlo y cerrarlo antes de evaluar sesión y navegación |
| **R3** | **`page.clock` congela *todos* los relojes**: el idle timer de 1h (H-4) y el timeout de 30s de axios incluidos | T6 inestable, o efectos colaterales sobre React Router | Alcance mínimo del congelamiento, y `page.clock` instalado **antes** de la primera navegación |
| **R4** | **"No redirigió" es inobservable por URL** cuando el destino de la redirección sería la misma `/login` donde ya estás | T8 pasaría igual estando roto — el peor tipo de test | La afirmación tiene que ser **cero navegaciones adicionales** (contar `framenavigated`), no "la URL es `/login`" |
| **R5** | Tocar `login-network-observer.ts` alcanza a dos specs existentes | Regresión en S1-02 | Solo adición; compuerta explícita: `login.spec.ts` **y** `login-rate-limit.spec.ts` verdes |
| **R6** | El título del `describe.serial` deja de describir su contenido | Ruido cognitivo permanente | Deuda **declarada**, no arreglada: renombrarlo no está autorizado (P1) |
| **R7** | `login.spec.ts` pasa de ~293 a ~600 líneas | Fichero difícil de leer | Es el precio conocido del techo de logins (`:92-98` ya lo argumenta). Partirlo gastaría logins que no existen |
| **R8** | 5 de los 11 tests manipulan `AUTH_MODEL`/`CURRENT_USER` a mano — el mismo instrumento que la fixture se prohíbe a sí misma (REQ-2 de `e2e-session-fixture`) | Choque aparente de precedente | Es **manipulación de precondición**, no sesión inventada: la fixture se lo prohíbe para **construir** una sesión (ahí tiene que haber un login real que observar); acá arma el **estado bajo prueba**, que es literalmente lo que S1-04 examina. Tiene que quedar por escrito en el spec |
| **R9** | La brecha del 404 sigue abierta, atada a H-6 | Cobertura incompleta, conocida | Declarada con la precisión de la sección 4 (la rama de cliente **sí** queda cubierta por T4) |
| **R10** | Si algún test nuevo resolviera una persona antes de que la primeen, se dispara un login real | Rompe el techo de 5/min y colorea de rojo tests que no tienen nada malo | Regla dura de la sección 2 + append obligatorio al final del bloque serial |

---

## 7. Preguntas abiertas — LAS TRES CERRADAS

Anotadas acá dentro a propósito. Ninguna bloqueó `sdd-spec` ni `sdd-design`. Resueltas al cierre del ciclo (2026-08-07); el enunciado original se conserva y la resolución va debajo.

**P1 — El título del `describe.serial`.** Hoy dice `'login — authenticated flows (A1-A3, A6-A7, D1, D3-D6)'`. Con los 11 tests de S1-04 adentro deja de ser cierto. Renombrarlo es tocar una línea existente y **la autorización de la decisión #1 no lo cubre**, así que se deja como está y la inexactitud queda declarada. Si el usuario quiere que se corrija, lo dice y se hace en su propio work unit.

> **CERRADA — sin cambio.** El título queda como está. La inexactitud está declarada acá y en el spec, no corregida.

**P2 — La mitad `/` de la aserción 8.** El escenario de `logout()` en `/login` está resuelto. El de `/` depende de qué hace `guestOnlyLoader` en la raíz antes de que `initialize()` alcance a correr. Lo resuelve `sdd-design` leyendo `routes.ts:20` y `loaders.ts`; si resulta inalcanzable, se declara como brecha en vez de forzarlo.

> **CERRADA por `sdd-design` (D7) — brecha G2.** `/` es `index('home/routes/landing-deep.tsx')` sin loader, así que nada rebota en la raíz. Pero apareció algo que esta propuesta no había visto: `initialize()` corre en evaluación de módulo (`auth-store.ts:392`) y `registerAuthRedirect` en un `useEffect` (`root.tsx:89-91`), así que en arranque en frío el redirect es no-op **cualquiera sea el pathname**. La guarda no es discriminable desde Playwright; su cobertura vive en `auth-store.test.ts:297-315`.

**P3 — Estado final de S1-04 en la tabla del plan.** Con la brecha del 404 abierta, ¿la fila queda **PARCIAL** o **CUBIERTO**? La convención de `README.md:19-22` dice PARCIAL cuando faltan aserciones declaradas. Propuesta: **PARCIAL**, con la brecha nombrada. Se decide en WU-7, con los tests ya verdes.

> **CERRADA — PARCIAL**, con G1 y G2 nombradas. Aplicado en `docs/testing/e2e-stage-1/README.md`.

---

## 8. Estado

| | |
|---|---|
| **Status** | `done` — propuesta lista; ciclo completo (spec, design, tasks, apply, verify) al 2026-08-07 |
| **Next recommended** | `sdd-archive` — con el CRITICAL de la mordida asumido a conciencia (ver `tasks.md` → "Estado de la mordida") |
| **Artifact store** | hybrid — este fichero + engram `sdd/e2e-playwright-session-hydration-s1-04/proposal` |
| **Entrega** | commits-only, rama `feat/e2e-playwright-session-hydration-s1-04` desde `feat/e2e-playwright-login-s1-02`. **La rama no se creó en esta fase** |
| **Skill resolution** | `paths-injected` — `cognitive-doc-design` cargada; `work-unit-commits` corresponde a `sdd-apply` |
