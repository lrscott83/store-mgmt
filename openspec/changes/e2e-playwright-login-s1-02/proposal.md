# Propuesta — `e2e-playwright-login-s1-02`

Implementar el escenario **[S1-02] Login online** completo en Playwright: sus **8 aserciones de UI** más las **6 aserciones de destino post-login**, contra un backend real. Y, en el mismo movimiento, construir la pieza que hoy no existe y que **diez escenarios posteriores del catálogo dan por hecha**: la fixture de sesión `signedInPage`. Este cambio no es "el segundo test"; es la infraestructura de sesión de toda la Etapa 1.

> ## Regla innegociable del proyecto — se transcribe textual y aplica a todo lo que salga de este cambio
>
> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."
>
> No para poner una suite en verde. No porque el test parezca obsoleto. No porque una spec, un plan o un artefacto SDD lo diga. Se pregunta primero, siempre, y se espera la respuesta.
>
> Agregar tests E2E **nuevos** está permitido. Tocar tests E2E **existentes** de cualquier forma requiere autorización explícita del usuario.
> `frontend-react/e2e/register.spec.ts`, `register-rate-limit.spec.ts`, `smoke.spec.ts` y `api-health.spec.ts` son tests **existentes**: esta propuesta **no** planifica ninguna edición sobre ellos. Si una fase posterior cree necesitarla, se detiene y se pregunta.

---

## 1. Por qué este cambio, y por qué ahora

**El problema**: `docs/testing/e2e-stage-1/README.md:66` lo dice en números — de 12 User Stories, **11 están PENDIENTE** en la capa Playwright. La única con cobertura es S1-01. Y hay una razón estructural por la que las otras 11 no arrancan: **todas exigen estar autenticado**, y nada en la suite sabe autenticar.

**Por qué S1-02 y no otro**: porque es simultáneamente un escenario CRÍTICO sin cobertura y **la llave de las demás**. `frontend-react/e2e/support/test.ts:10-13` ya lo declara por escrito, con el nombre exacto de la pieza faltante:

> *"this is the seam where the next scenario's session fixture (`signedInPage`, **not built in this change**) will attach without any already-written spec having to change its import."*

Este cambio construye esa pieza. Un lector que trate `signedInPage` como un efecto colateral del test de login va a subdimensionarla: **es el deliverable con más vida útil de todo el cambio**.

**Qué es el éxito**: `pnpm test:e2e` corre verde contra el backend real del usuario cubriendo 13 de las 14 aserciones; la 14ª (429) corre a pedido con su propio comando; y `signedInPage` queda con un contrato escrito, estable y **económico en cuota de login** — porque si cada escenario futuro paga un login real, la suite se vuelve incorrible antes del escenario número siete (ver §6, R1).

---

## 2. Alcance

### Dentro — las 14 aserciones, mapeadas 1:1 a `docs/testing/e2e-stage-1/S1-02.md`

**S1** = el único login exitoso "de verdad" de la corrida por defecto. Varias aserciones se cuelgan de esa misma navegación en vez de pagar otro.

| # | Aserción | Línea | Spec | Logins reales |
|---|----------|-------|------|---------------|
| A1 | Durante todo el flujo (login → me → resolver home → navegar) se ve **solo** el overlay; el formulario nunca reaparece entre llamadas | :31 | `login.spec.ts` | comparte S1 |
| A2 | Se emiten **dos** peticiones **en orden**: `POST /v1/auth/login` y luego `GET /v1/auth/me` | :32 | `login.spec.ts` | comparte S1 |
| A3 | Credenciales inválidas: el backend responde **HTTP 200 con `succeeded:false`** y la UI interpola **literalmente** `errors[0].description` en `AUTH.INVALID_ERROR` | :33 | `login.spec.ts` | 1 (fallido) |
| A4 | Campos vacíos: validación local, **sin** petición | :34 | `login.spec.ts` | 0 |
| A5 | Offline en dispositivo **sin roster**: sin petición, banner `AUTH.OFFLINE_LOGIN` | :35 | `login.spec.ts` | 0 |
| A6 | Tras éxito, `localStorage` contiene `AUTH_MODEL` con `{ authToken, expiresIn }` | :36 | `login.spec.ts` | comparte S1 |
| A7 | Un usuario **ya autenticado** que visita `/login` es redirigido a su home, no a `/` | :37 | `login.spec.ts` | 0 (reusa sesión) |
| A8 | HTTP 429 muestra `AUTH.TOO_MANY_ATTEMPTS` | :38 | `login-rate-limit.spec.ts` (aislado) | 6+ |
| D1 | OwnerAdmin **con** productos → `/sales/new` | :60 | `login.spec.ts` | 1 (tras sembrar) |
| D2 | OwnerAdmin **sin** productos → `/sales/products` | :61 | `login.spec.ts` | comparte S1 |
| D3 | StoreUser con productos → `/sales/new`; sin productos → `/sales/products` (misma rama) | :62 | `login.spec.ts` | 1 |
| D4 | Ningún OwnerAdmin ni StoreUser aterriza **jamás** en `/admin/owners` | :63 | `login.spec.ts` | 0 (asserta sobre S1/D1/D3) |
| D5 | La resolución del destino consulta datos **locales**, no la API | :64 | `login.spec.ts` | 0 (aserción negativa sobre S1/D1) |
| D6 | La misma función gobierna el rebote del guard, así que el destino es consistente entre login explícito y redirect | :65 | `login.spec.ts` | 0 (reusa sesión) |

**Ninguna se declara inalcanzable.** Dos llevan una dependencia declarada, no un descuento: **A8** solo es verificable fuera del entorno `Testing` (**H-12**, `README.md:246-250`) — igual que su gemela del registro, y por eso va aislada; y **D3** depende de que un OwnerAdmin auto-registrado tenga la feature `Users` (ver §6, R3).

### Fuera — explícito

| Fuera de alcance | Por qué |
|------------------|---------|
| **Los ficheros `vitest` que cubren login** — `auth/routes/__tests__/login.test.tsx`, `login.offline.test.tsx`, `login.offline.e2e.test.tsx` (pese al `.e2e.` del nombre, es **jsdom**, no Playwright) y `shared/lib/stores/__tests__/auth-store.test.ts` | **No se tocan.** Este cambio no agrega, edita, renombra ni corre ninguno de ellos. Y hay un riesgo anticipado que se nombra acá para que nadie lo resuelva solo: S1-02 ejercita el **mismo** `login.tsx` / `auth-store.ts` que esos ficheros mockean. Si una corrida de Playwright expone una discrepancia con un mock de vitest, **eso es una pregunta al usuario**, no una edición. |
| **Todo trabajo .NET / backend** | La capa de dato de S1-02 está PARCIAL, y lo que falta (tienda inactiva → 403) es un test **.NET**, no de navegador (`S1-02.md:72,80`). Este cambio no agrega, edita ni corre un solo test .NET. |
| Cualquier edición a `register.spec.ts`, `register-rate-limit.spec.ts`, `smoke.spec.ts`, `api-health.spec.ts` | Regla innegociable (arriba). |
| S1-03 (login **offline** con roster aprovisionado) | Escenario propio. La precondición de S1-02 es **sin roster** (`S1-02.md:19`); este cambio debe garantizar activamente que ningún test aprovisione un roster antes de tiempo. |
| El comportamiento offline puro / `localStorage` como dominio | Fuera de alcance de Etapa 1 por definición (`README.md:87`). A5 y D5 no son excepciones: aseveran **ausencia de red**, que sí es observable desde el navegador. |

---

## 3. Decisiones ya tomadas por el usuario

### D1 — Sembrar `/sales/new` por el **camino real de la UI**

Para que D1 y D3 aterricen en `/sales/new`, la tienda necesita al menos una categoría activa y un producto activo/vendible (`product-repository.ts:129-134`). Se obtiene **haciendo lo que hace un usuario**: registrar → loguear → crear la categoría desde `/sales/products` → crear el producto desde el menú de la categoría. Ambas escrituras pasan por `categoryService.createProductCategory` / `productService.createProduct` — el mismo código que ejercita una persona real.

**La alternativa está RECHAZADA, y el motivo no es de gusto**: sembrar `localStorage` a mano con `page.evaluate()` obliga a escribir a mano el formato de cable privado del repositorio (`Map` serializado como array de entradas, forma exacta de `Product`, forma exacta de la clave). Eso es, exactamente, el modo de falla que `CLAUDE.md` documenta para este proyecto: el test unitario de `BillingService` que mockeaba `store.StoreModules` y **"reprodujo un mundo que la base de datos nunca produjo"**. Un test E2E que siembra sus propias tripas de almacenamiento es ese mismo mundo inventado: sigue en verde mientras el repositorio real se rompe debajo.

**Un hecho verificado que abarata esta decisión**: `logout()` borra **únicamente** la clave `AUTH_MODEL` (`auth-store.ts:303-307`, con el comentario de paridad Angular que lo explicita). Las categorías y productos sembrados **sobreviven al logout**. Por lo tanto D1 se puede probar con un **envío de credenciales de verdad** después de sembrar — no hace falta conformarse con el rebote del guard, que era la contra que la exploración le señalaba a esta opción. Y lo mismo habilita D3: el StoreUser entra en el **mismo contexto de navegador**, contra el **mismo `storeId`**, así que ve los mismos productos.

### D2 — El usuario ejecuta TODO localmente

El usuario corre el backend, el dev server y la suite en su propia máquina. El agente **nunca** corre `dotnet`, **nunca** levanta un backend y **nunca** afirma que un test pasó si no lo vio pasar. La §5 es la especificación de qué tiene que estar corriendo.

### D3 — Rama y entrega

Rama `feat/e2e-playwright-login-s1-02`, ya creada desde `main`. Entrega por **commits por unidad de trabajo** sobre esa rama y ff-merge al final. **Sin PRs apilados.**

### D4 — La aserción del 429 reusa el patrón `@rate-limit`, con los números corregidos

A8 vive en `login-rate-limit.spec.ts`, con `test.describe(..., { tag: '@rate-limit' })`, y queda fuera de la corrida por defecto vía los scripts que **ya existen** (`package.json:11-12`: `test:e2e` = `--grep-invert @rate-limit`, `test:e2e:rate-limit` = `--grep @rate-limit`). El usuario ya confirmó que ese patrón pasa hoy.

**Lo que NO se copia son las constantes.** Los umbrales difieren y el error sería silencioso:

| Política | Límite | Ventana | Segmentos |
|---|---|---|---|
| `RegisterPolicy` (lo existente) | 10 | 10 min | 10 |
| **`LoginPolicy`** (lo nuevo) | **5** | **1 min** | **3** |

(`RateLimitPolicies.cs:15-24` y `:26-35`, vía `README.md:256-257`.) `MAX_ATTEMPTS` debe **encoger**, no heredarse; y el `test.setTimeout(120_000)` a nivel spec probablemente también pueda encoger, porque la ventana es 10 veces más corta.

---

## 4. Enfoque (altura de propuesta, no de diseño)

### Archivos que aparecen

| Archivo | Qué es | ¿Nuevo? |
|---------|--------|---------|
| `frontend-react/e2e/login.spec.ts` | A1–A7 + D1–D6. Corre por defecto. | Nuevo |
| `frontend-react/e2e/login-rate-limit.spec.ts` | Solo A8. Aislado por tag. | Nuevo |
| `frontend-react/e2e/support/login-page.ts` | Page object de `/login` (goto, llenar, enviar, localizar el overlay), análogo a `register-page.ts`. | Nuevo |
| `frontend-react/e2e/support/login-network-observer.ts` | Observador de **dos** endpoints en orden (`POST /v1/auth/login` → `GET /v1/auth/me`), con error tipado de 429. **Archivo nuevo, no un injerto dentro de `network-observer.ts`** — ver abajo. | Nuevo |
| `frontend-react/e2e/support/store-seed.ts` | Helper de siembra por UI: crear categoría + producto. | Nuevo |
| `frontend-react/e2e/support/test.ts` | **Aditivo**: suma las fixtures `signedInPage` y `loginNetwork`. Es la costura que el propio fichero declara (`:10-13`). | Editado (soporte, **no es un test**) |
| `frontend-react/e2e/README.md` | Documenta `signedInPage` y el costo de la corrida de rate-limit de login. | Editado (documentación, **no es un test**) |
| `frontend-react/package.json` | **Sin cambios**: los scripts por tag ya existen. | — |

**Regla de blast radius sobre los ficheros de soporte compartidos**: `test.ts` y `network-observer.ts` los consumen los specs de registro **existentes**. Toda edición debe ser **estrictamente aditiva**: `registerNetwork` conserva su `auto: true` y su comportamiento exacto, e `installRegisterNetworkObserver` conserva su firma. Por eso el observador de login va a un **archivo propio** en vez de mutar el existente. Si el diseño concluyera que hay que cambiar la firma o el comportamiento de algo que el registro ya usa, **eso es un stop-and-ask**, no una decisión de la fase de implementación.

### El contrato de `signedInPage` — el deliverable de vida más larga

Diez escenarios posteriores van a colgarse de esto. Su contrato, para que no haya que reinventarlo cada vez:

| Cláusula | Qué garantiza |
|---|---|
| **Qué entrega** | Un `page` ya autenticado como **OwnerAdmin recién creado**, más la identidad y el `selectedStoreId` de esa cuenta, para que el test pueda direccionar su propio dato. |
| **Cómo llega ahí** | Registro + login por el camino real, con identidad única por uso (`newTestIdentity()`), contra el backend real. Sin inventar tokens ni escribir `AUTH_MODEL` a mano. |
| **Estado inicial garantizado** | Tienda **sin categorías ni productos** → `resolveUserHomePath` resuelve `/sales/products` de forma determinista. La siembra es **opt-in**, nunca implícita. |
| **Sin roster** | **Jamás** aprovisiona un roster: `isRosterProvisioned()` debe quedar en falso. Un roster convertiría el escenario en S1-03 y apagaría la rama online que S1-02 prueba. |
| **Opt-in, no `auto`** | A diferencia de `registerNetwork`, **no** lleva `auto: true`. Cuesta red real y cuota real: una fixture que se cobra sola en cada test es una fixture que rompe la suite sin que nadie la haya pedido. |
| **Costo amortizable** | El diseño **debe** contemplar reutilización de sesión (`storageState`) para los tests que no necesitan observar el envío en vivo. Si cada escenario futuro paga un login, la Etapa 1 completa se vuelve incorrible contra un techo de 5 por minuto. Esta cláusula no es una optimización: es la condición para que la fixture sirva a diez escenarios. |

### Cómo se controla el consumo de cuota

Piso realista de la corrida por defecto: **3–4 logins reales** (S1 compartido por A1/A2/A6/D2/D5; uno fallido para A3; uno tras sembrar para D1; uno de StoreUser para D3) más **2–3 registros**. Contra un techo de **5 logins por minuto**, con `fullyParallel: true` y `workers: undefined` en local (`playwright.config.ts:63,72` — todos los CPUs), una ráfaga paralela lo revienta sola. Dos palancas, ambas de fase de diseño pero acotadas acá: **modo `serial`** para los tests que consumen login, y **reutilización de sesión** donde la aserción no exija un envío en vivo. Ver §6 R1 y §7 Q1.

---

## 5. Qué tiene que correr el usuario

> D2: el agente no ejecuta nada de esto. Son **tus** comandos.

### Terminal 1 — backend

```bash
dotnet run --project backend/src/SMCA.WebApi --launch-profile http
```

Igual que en S1-01, y por los mismos tres motivos: escucha en `http://localhost:5019` (sin certificado autofirmado que rompa el navegador), `ASPNETCORE_ENVIRONMENT=Development` (que **no** es `Testing`, así que el limitador **está prendido** y A8 es verificable — **H-12**), y bindea solo HTTP (así `UseHttpsRedirection` no te manda a `:7297`).

**Requiere**: PostgreSQL en `127.0.0.1:5432`, base `smca`.

### Terminal 2 — la suite

```bash
cd frontend-react
pnpm test:e2e            # A1–A7 + D1–D6
pnpm test:e2e:rate-limit # solo A8, cuando la quieras
```

**Antes de correr el segundo, sabelo**: agota los 5 intentos de login del minuto y, al terminar, **el servidor te va a rechazar cualquier login desde esa máquina hasta que la ventana deslizante libere permisos** (~1 minuto, en 3 tramos). Y ojo con el orden inverso al del registro: acá la ventana es corta, así que la espera es de un minuto, no de diez.

### Verificación

- [ ] `pnpm test:e2e` corre verde con el backend arriba.
- [ ] `pnpm test:e2e` **falla ruidosamente** con el backend abajo (no debe saltear en silencio).
- [ ] `pnpm test:e2e:rate-limit` corre verde por separado.
- [ ] `pnpm test:e2e` **dos veces seguidas** dentro del mismo minuto: si esto se pone rojo por cuota, es R1/Q1 manifestándose, no un defecto.
- [ ] `pnpm exec playwright test e2e/register.spec.ts` sigue verde: los specs de registro no se enteraron de nada.

---

## 6. Riesgos y costos aceptados

| # | Riesgo / costo | Severidad | Postura |
|---|----------------|-----------|---------|
| **R1** | **El techo de login es 10 veces más estrecho que el de registro: 5 por minuto contra 10 cada 10 minutos.** Con `fullyParallel` y todos los CPUs, una corrida por defecto de 3–4 logins puede dispararlos casi simultáneamente y auto-limitarse. El rojo resultante **no indica ningún defecto**. | **Alta** | **Pregunta abierta Q1.** Mitigaciones identificadas: modo `serial` para los tests que consumen login + reutilización de sesión + compartir S1 entre 5 aserciones. En CI, `retries: 2` (`playwright.config.ts:69`) triplica el consumo. |
| **R2** | **La fixture `signedInPage` marca el costo de los 10 escenarios siguientes.** Si nace pagando un login real por test, la Etapa 1 se vuelve incorrible mucho antes de terminarse. | **Alta** | Mitigado por contrato: la cláusula de costo amortizable de §4 es **parte del deliverable**, no una optimización posterior. |
| **R3** | **D3 depende de una feature que no se verificó.** Crear un StoreUser pasa por `/management/users/create`, que exige `adminFeatureLoader([EFeatures.Users])` (`user-create.tsx:11`); para un OwnerAdmin eso exige que `featureIds` contenga `Users` (**H-7**), y si no la tiene **lo desloguea** en vez de mostrar un error (**H-8**). La cadena de evidencia sugiere que sí la tiene (una tienda auto-registrada recibe todos los módulos disponibles — **H-1** — y las features del OwnerAdmin se derivan filtrando `StoreRoleFeatures` por los módulos de la tienda, `AllowedFeaturesService.cs:41-48`), pero **no se ejecutó nada que lo confirme**. | Media | **Se confirma empíricamente en la fase de implementación.** Si resulta falso, D3 **no se descarta en silencio**: se detiene y se le pregunta al usuario si crear el StoreUser por API directa o diferir la aserción. |
| **R4** | **Supuesto `needsUnlock`.** `guestOnlyLoader` rebota al autenticado que visita `/login` **salvo** que `needsUnlock(user)` sea verdadero (`loaders.ts:42-59`). Se asume falso porque este escenario nunca importa un roster. Si fuera verdadero, A7 y D6 no rebotarían. | Baja | Consecuencia acotada (2 aserciones) y diagnóstico inmediato: el síntoma sería aterrizar en la pantalla de desbloqueo, no un fallo ambiguo. La misma precondición "sin roster" lo protege. |
| **R5** | **¿El login fallido consume permiso antes del handler?** A8 asume que sí — que 6 intentos con contraseña incorrecta disparan el 429 igual que 11 registros. El limitador es middleware (`Program.cs`, `UseRateLimiter`), así que debería contar toda petición al endpoint sin mirar el resultado. **No se verificó ejecutando.** | Baja | Se confirma en la primera corrida de `test:e2e:rate-limit`. Si no consumiera, A8 necesita **logins exitosos**, lo que encarece la aserción — y eso se reporta, no se disimula. |
| **R6** | **Datos de prueba acumulados**: cada corrida deja Owner + Store + (ahora también) un StoreUser en la base `smca`. Sin teardown alcanzable desde el navegador. | Media | **Aceptado**, misma postura que S1-01 (D5 de aquella propuesta). Mitigado con identidad única por corrida. Acotado: `smca`, no `smca_test` — no contamina la suite .NET. |
| **R7** | **La siembra por UI mete superficie ajena al login dentro del test de login**: si el modal de crear categoría o producto se rompe, D1/D3 se ponen rojos por un motivo que no es el login. | Media | **Aceptado y atribuido (D1 de §3).** La contra existe y es real; la contraria — sembrar tripas de `localStorage` a mano — falla peor y en silencio. El diseño debe hacer que el fallo de siembra sea **distinguible** del fallo de login en el mensaje de error. |
| **R8** | **Los ficheros de soporte compartidos los usan los specs de registro existentes.** Un cambio no aditivo en `test.ts` los rompería. | Baja | Mitigado por la regla de blast radius de §4 + el ítem de verificación que reexige `register.spec.ts` en verde. |

---

## 7. Preguntas abiertas

### Q1 — El techo de 5 logins por minuto puede poner en rojo tu corrida normal

**El problema, en criollo**: el servidor bloquea los logins después de **5 intentos en 1 minuto** desde la misma IP. La corrida normal necesita **3 o 4 logins de verdad**, y Playwright los lanza **en paralelo** por defecto (un worker por CPU). O sea: entran casi todos juntos, y si además corrés la suite dos veces seguidas, la segunda arranca con la cuota ya gastada. Vas a ver tests rojos **por cuota, no por bug**.

Con el registro esto era molesto (10 cada 10 minutos). Acá la ventana es **10 veces más estrecha**.

**Por qué no lo decido yo**: hay un intercambio genuino y depende de cómo trabajás.

- **Serializar los tests que hacen login** (Playwright los corre de a uno): elimina la ráfaga, pero **alarga la corrida** — justo lo que más se siente cuando estás iterando.
- **Reutilizar una sola sesión** para todo lo que no exija observar el envío en vivo: baja el consumo a ~2, pero **A1, A2 y D1 no se pueden reutilizar** — necesitan un envío de credenciales real para probar lo que prueban.

**Mi recomendación**: las dos a la vez. Serializar solo el bloque que consume login, y reutilizar sesión en A7, D6 y todo lo derivado. Piso ~3 logins por corrida, sobre un techo de 5.

**Su contra, dicha entera**: aun así seguís sin poder correr la suite dos veces en el mismo minuto. Si iterás rápido sobre los propios tests de login, te vas a comer una espera de ~60 segundos con la pantalla en rojo — y esa espera cae justo en el peor momento. La única salida que la eliminaría es apagar el limitador (entorno `Testing`), y eso **también apagaría A8**, que es precisamente la aserción que solo Playwright puede verificar (**H-12**).

### Q2 — Nada más

El resto se resolvió leyendo el código. Si durante la implementación aparece tensión entre una corrida de Playwright y un mock de `vitest` de los ficheros de login, **eso vuelve acá como pregunta**, no se resuelve editando.

---

## 8. Capacidades (contrato con `sdd-spec`)

### Nuevas

- `e2e-login-ui`: las 14 aserciones de [S1-02] como criterios de aceptación verificables, con el texto español exacto que cada una espera. Hermana de la ya existente `e2e-register-ui`.
- `e2e-session-fixture`: el contrato de `signedInPage` (§4) como capacidad propia. Va separada **a propósito**: la consumen diez escenarios posteriores, así que cada cambio futuro de la Etapa 1 va a leerla o modificarla sin tener que abrir el spec de login.

### Modificadas

Ninguna.

---

## 9. Plan de rollback

Todo el cambio es **aditivo sobre una rama propia**. No hay migración, ni cambio de config compartida, ni edición de test existente.

1. Los ficheros nuevos (`login.spec.ts`, `login-rate-limit.spec.ts`, `support/login-page.ts`, `support/login-network-observer.ts`, `support/store-seed.ts`) se borran sin consecuencia: nada más los importa.
2. Las ediciones aditivas en `support/test.ts` se revierten quitando las fixtures nuevas; `registerNetwork` queda intacto por construcción (regla de blast radius, §4).
3. Si nada se mergeó: `git branch -D feat/e2e-playwright-login-s1-02`.
4. Lo único **no** revertible por git son las filas de prueba en la base `smca` (R6). Es basura inerte de desarrollo, no toca `smca_test`, y se limpia a mano si molesta.

---

## 10. Criterios de éxito

- [ ] Las 14 aserciones de `S1-02.md` están implementadas y verdes (13 en la corrida por defecto, A8 con su comando).
- [ ] `signedInPage` existe, cumple las seis cláusulas de su contrato (§4) y está documentada en `e2e/README.md`.
- [ ] `login-rate-limit.spec.ts` usa los umbrales **de login** (5/1min), no los del registro copiados.
- [ ] `register.spec.ts`, `register-rate-limit.spec.ts`, `smoke.spec.ts` y `api-health.spec.ts` siguen verdes y **sin un solo byte modificado**.
- [ ] Ningún fichero `vitest` fue tocado.
- [ ] `docs/testing/e2e-stage-1/README.md` y `S1-02.md` reflejan el nuevo estado de cobertura (documentación, no tests).
- [ ] Q1 tiene respuesta del usuario y la respuesta está implementada.

---

## 11. Próximo paso

`sdd-spec` y `sdd-design` (pueden correr en paralelo).

- **spec**: las 14 aserciones como criterios verificables con el texto español literal; y el contrato de `signedInPage` como capacidad aparte.
- **design**: mecánica de Playwright — observador de dos endpoints en orden, cómo se aserta "solo el overlay" sin carrera, `context.setOffline(true)` para A5, forma exacta de la reutilización de sesión y del modo `serial` que responde Q1, mecánica de la siembra por UI y cómo hacer que su fallo sea distinguible del fallo de login.
