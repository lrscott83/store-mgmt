# Exploración — `e2e-playwright-session-hydration-s1-04`

> Fase SDD: **explore**. Estado: **cerrada, con 4 decisiones pendientes del usuario**.
> Fecha: 2026-08-07. Próxima fase: `sdd-propose`, bloqueada hasta responder la sección 7.

**User Story**: [S1-04](../../../docs/testing/e2e-stage-1/S1-04.md) — *"Hidratación de sesión: la caché válida no llama al backend"*. Capa objetivo: **E2E frontend (Playwright)**. La capa .NET ya está **CUBIERTA** y no se toca.

## Regla innegociable (verbatim, `CLAUDE.md`)

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

Agregar tests nuevos está permitido. Tocar existentes requiere autorización explícita. La decisión #1 de la sección 7 es, precisamente, una petición de esa autorización.

## Configuración del ciclo (elegida por el usuario, 2026-08-07)

| | |
|---|---|
| Modo de ejecución | **Interactivo** — parada y reporte después de cada fase |
| Artifact store | **hybrid** — ficheros en `openspec/changes/` + resumen en engram |
| Entrega | **Commits-only** en rama nueva `feat/e2e-playwright-session-hydration-s1-04`, creada **desde la rama actual** `feat/e2e-playwright-login-s1-02` (que todavía NO está en main). Sin push, sin PR. |
| Strict TDD | Activo |
| Skill registry | `.atl/skill-registry.md` (12 skills). Ninguna aplica a explore; para `sdd-apply` corresponde `work-unit-commits`. |

---

## 1. Estado actual de la capa Playwright

`frontend-react/e2e/`: `smoke.spec.ts`, `api-health.spec.ts` (infraestructura), `register.spec.ts` + `register-rate-limit.spec.ts` (S1-01), `login.spec.ts` + `login-rate-limit.spec.ts` (S1-02).

Capa de soporte en `e2e/support/`:

| Fichero | Qué aporta a S1-04 |
|---|---|
| `test.ts:48-99` | Entry point de fixtures. `registerNetwork`/`loginNetwork` son `auto:true`; `persona`/`signedInPage` son opt-in (`:78`, `:95`). |
| `session.ts` | Motor de `signedInPage`. `personaCache` es **worker-scoped**: 4 personas memoizadas de forma independiente y lazy. |
| `session.ts:135-143` | `restoreSignedInSession()` → `applySnapshot()`: `goto('/login')` → `page.evaluate()` escribe `localStorage` → `goto(homePath)`. **Costo cero de red.** Es exactamente el mecanismo que S1-04 necesita para escribir un `AUTH_MODEL` manipulado antes de un reload. |
| `login-network-observer.ts` | Observa `POST .../v1/auth/login` y `GET .../v1/auth/me`. Expone `waitForLoginRequest`, `waitForMeRequest`, `waitForLoginResponse`, `expectLoginThenMe`, `expectNoLoginAttempt`, `expectNoProductApiCall`. |
| `store-seed.ts` | Siembra vía UI real (`GlobalConfig.USE_ONLINE_SERVICE=false`), cero red. |
| `playwright.config.ts` | `fullyParallel: true`, `workers` sin fijar → multi-worker. |

**El único hueco de infraestructura**: el observer **no** sabe afirmar "cero peticiones `/me`". Tiene `expectNoLoginAttempt()` pero no su hermano. La pieza que falta es **aditiva** — un método nuevo en paralelo al existente, sin tocar los que ya están.

---

## 2. Código bajo prueba — mapa de líneas corregido

**Las citas de `S1-04.md` están desfasadas.** El corrimiento arranca en +24 líneas y crece a +47 hacia `logout()`.

**Causa verificada**: `invalidCredentialsDescription()` (hoy `auth-store.ts:62-69`), agregada durante S1-02 para el fix del literal del 401 (commit `ad316a7`), más contenido nuevo dentro de `login()` (comentarios de DEK/roster/migración) entre `getUserByToken()` y `logout()`. `isSessionRejection()` (`:39-45`) **no** se desfasó: es previa a ambas inserciones.

Verificado de primera mano con `rg` sobre `auth-store.ts` — `:100`, `:115`, `:153`, `:354`, `:365` confirmados.

| Comportamiento | `S1-04.md` dice | Línea real | Contenido |
|---|---|---|---|
| `AUTH_MODEL` ausente → `null`, sin llamada | `:75-76` | **`:99-100`** | `if (!raw) return null;` |
| JSON inválido → borra y `null` | `:79-84` | **`:103-108`** | `catch { removeItem; return null; }` |
| Parseable sin `authToken`/`expiresIn` → `null`, no borra | `:86-89` | **`:110-113`** | `if (!auth.authToken \|\| !auth.expiresIn) return null;` |
| `expiresIn <= Date.now()` → `logout()` | `:91-96` / `:91` | **`:115-120`** / **`:115`** | `if (auth.expiresIn <= Date.now()) { get().logout(); return null; }` |
| Caché coincide → hidrata sin llamada | `:100-114` | **`:124-138`** | comentario `OFFLINE-FIRST ... no backend call` + `set()` |
| Sin caché → best-effort + `GET /me` | `:120-129` | **`:144-153`** | `set(bestEffortUser)` → `getMe()` |
| Aserción "cero `/me`" | `:107-113` | **`:131-137`** | comentario OFFLINE-FIRST |
| Aserción "un `/me`" | `:129` | **`:153`** | `getMe()` |
| Aserción "servidor apagado" | `:147-164` | **`:171-188`** | bloque `catch` completo |
| Aserción 401/404 | `:39-45` (sin cambio) / `:159-161` | `:39-45` / **`:183-185`** | `isSessionRejection()`; `if (...) { get().logout(); return null; }` |
| Aserción 500 → no desloguea | `:159-164` | **`:183-188`** | mismo `catch`, cae a `return bestEffortUser` |
| `logout()` borra solo `AUTH_MODEL` | `:303-307` | **`:350-359`** | `removeItem(AUTH_MODEL)` + comentario + `clearDek()` |
| `logout()` no redirige en `/login` o `/` | `:317-320` | **`:364-367`** | `if (pathname !== '/login' && pathname !== '/') authRedirect?.('/login')` |

**Las 6 filas de la tabla de ramas y las 8 aserciones siguen siendo código vigente.** Solo cambiaron los números de línea. Ningún comportamiento documentado desapareció.

---

## 3. Alcanzabilidad de las 8 aserciones desde Playwright

| # | Aserción | Veredicto | Mecanismo |
|---|---|---|---|
| 1 | Caché válida ⇒ **cero** `GET /me` | ✅ Alcanzable | `signedInPage` + `page.reload()` + método aditivo nuevo en el observer |
| 2 | Sin caché usable ⇒ **exactamente un** `GET /me` | ✅ Alcanzable | Corromper `CURRENT_USER` (no `AUTH_MODEL`) vía `page.evaluate()` para forzar el mismatch de `authToken` |
| 3 | Servidor apagado + sin caché ⇒ sigue autenticado | ⚠️ Solo vía `page.route()` | Abortar/fallar `/me`. Apagar el backend real está fuera de alcance |
| 4 | `/me` 401 o 404 ⇒ logout + `/login` | ◐ Parcial | **401 con backend REAL** (token corrupto: el JWT no valida). **404** requiere actor real desactivando la cuenta (gap **H-6**) o mock → decisión #2 |
| 5 | `/me` 500 ⇒ **NO** desloguea | ⚠️ Solo mock | No hay forma práctica y determinística de forzar un 500 real |
| 6 | `expiresIn === Date.now()` exacto ⇒ expirada | ✅ Alcanzable | `page.clock` — Playwright `^1.62.1` confirmado en `package.json:18`, la clock API existe desde 1.45. Sin congelar el reloj, la deriva de wall-clock nunca produce igualdad exacta |
| 7 | `logout()` borra **solo** `AUTH_MODEL` | ✅ Alcanzable, costo cero | Botón "Salir" real sobre `signedInPage` |
| 8 | `logout()` no redirige en `/login` o `/` | ✅ Alcanzable, pero ya cubierta por vitest | Ver nota abajo → decisión #3 |

**Nota sobre la #8.** `/` (`routes.ts:20`) y `/login` **no tienen navbar**, así que el botón "Salir" es inalcanzable ahí. Pero `initialize()` corre en cada carga de módulo (`auth-store.ts:387-389`) sin importar la ruta: escribir un `AUTH_MODEL` expirado vía `evaluate()` estando en `/login` y luego `goto('/login')` dispara `logout()` con `pathname === '/login'` **por el camino real de producción**. Es alcanzable. La pregunta no es si se puede, es si vale la pena: `vitest` ya la cubre con precisión en `auth-store.test.ts:287-315` (líneas **sin** desfasar).

---

## 4. Presupuesto de logins reales — la restricción dominante

Techo: **5 logins / minuto**, política `LoginPolicy`, **partición por IP** (H-12 del plan general). `login.spec.ts` ya consume **4** en un único `describe.serial`: S1 vivo, REQ-3 mala contraseña, REQ-11 StoreUser vivo, REQ-9 relogin tras logout. `e2e/README.md:161-171` lo dice explícito: **el margen es de exactamente 1**.

**Ninguna de las 8 aserciones de S1-04 necesita observar un envío de formulario en vivo.** Todas parten de "usuario ya autenticado". Por lo tanto:

- **Spec file nuevo con mint propio** → +1 login → **5/5 exactos**, sin margen para reintentos ni para dos corridas en la misma ventana de un minuto.
- **Sumado al `describe.serial` de `login.spec.ts`** → **costo marginal cero**. Pero toca un fichero con tests existentes.

**Riesgo adicional de concurrencia**: `personaCache` es worker-scoped. Un spec file nuevo agendado en un worker distinto al de `login.spec.ts` mintea **su propia** `owner-admin` con **otro** login real, y puede caer en la misma ventana de 60s que los 4 anteriores → 5/5 sin ningún colchón.

---

## 5. Enfoques comparados

| # | Enfoque | Pros | Contras | Esfuerzo |
|---|---|---|---|---|
| 1 | Spec file nuevo | Coherente con "un fichero por capability"; no toca nada existente | Consume el último login del margen; riesgo de mint duplicado entre workers | Medio |
| 2 | Agregar al `describe.serial` existente | Cero logins extra; presupuesto intacto | Toca un fichero con tests E2E existentes → **requiere autorización explícita** | Bajo |
| 3 | Mock con `page.route()` para 3, 4-404 y 5 | Determinístico; sin riesgo de cuota ni de estado de cuenta real | Menos extremo-a-extremo real | Bajo-Medio |
| 4 | Estado real manipulado vía `page.evaluate()` sobre `AUTH_MODEL`/`CURRENT_USER` | Ejercita código de producción real; reusa `applySnapshot()` | Es el mismo instrumento que la fixture se prohíbe a sí misma (REQ-2 de `e2e-session-fixture`) | Bajo |

**Recomendación**: resolver primero la decisión #1, porque define el presupuesto. Para las aserciones 3 y 5, mockear es la única vía practicable. Para el 401, preferir backend real sobre mock. Para la 6, `page.clock`. Y documentar explícitamente en la propuesta que escribir `localStorage` a mano es **manipulación de precondición**, no "sesión inventada" — para no chocar con el precedente de REQ-2, que prohíbe esa técnica para construir la fixture, no para armar el estado bajo prueba.

---

## 6. Riesgos

1. **Presupuesto de login en 5/5 exactos** si se abre spec file nuevo. Cero margen para reintentos o para concurrencia entre workers.
2. **Citas de línea de `S1-04.md` desactualizadas** (+24 a +47). Si el diseño las cita literalmente sin corregir, apuntan a código equivocado. → decisión #4.
3. **5 de las 8 aserciones exigen manipular `AUTH_MODEL`/`CURRENT_USER` a mano** — mismo instrumento que la fixture se prohíbe a sí misma. Necesita quedar justificado por escrito en la propuesta.
4. **La aserción 4 queda partida en dos mitades** con niveles de fidelidad distintos (401 real vs 404 mockeado o inalcanzable).

---

## 7. ✅ Decisiones del usuario — resueltas 2026-08-07

### #1 — ¿Dónde viven los tests nuevos? → **(c) Sumarlos al `describe.serial` de `login.spec.ts`**

Costo marginal cero en logins; el presupuesto de 5/minuto queda intacto con su margen de 1.

**Autorización explícita registrada**: el usuario eligió esta opción a sabiendas de que toca un fichero E2E existente, lo que satisface la regla innegociable de `CLAUDE.md`. El alcance de esa autorización es **estrictamente aditivo**: se agregan tests nuevos al `describe.serial`. Ningún test existente se modifica, renombra, reordena ni se salta. Si durante `sdd-apply` apareciera la necesidad de tocar uno existente, **se para y se pregunta de nuevo** — esta autorización no la cubre.

### #2 — El 404 de `GET /me` → **(c) Solo 401 con backend real; el 404 queda declarado como brecha**

Sin mocks para este caso: el valor de la suite es correr contra el backend de verdad.

**Refinamiento verificado en código (2026-08-07)**: `isSessionRejection` (`auth-store.ts:39-45`) trata `401` y `404` en **la misma expresión** — `status === 401 || status === 404`. Un test de 401 real ejercita por lo tanto la rama de código exacta que el 404 recorrería. La brecha declarada es más chica de lo que suponía la sección 3: **no** es "la reacción del cliente al 404 está sin cubrir", es únicamente "no está verificado que el backend devuelva 404 para una cuenta desactivada" — lo cual depende del gap **H-6**. Redactar la brecha en el spec con esa precisión, no con la anterior.

### #3 — Aserción 8 (`logout()` no redirige en `/login` o `/`) → **(a) Sí, duplicar en Playwright**

El plan de Etapa 1 es explícito: `vitest`/`jsdom` no cuenta como E2E frontend. Costo cero de logins.

### #4 — Citas de línea de `docs/testing/e2e-stage-1/S1-04.md` → **(a) Sí, se corrigen acá, en su propio work unit**

El mapa corregido ya está en la sección 2 de este documento.

---

## 7-bis. Requisito adicional del usuario — resiliencia offline de la sesión

Pedido textual (2026-08-07): que un usuario **sin conexión a internet**, o ante **cualquier respuesta de error o inválida**, **NO** se quede sin sesión; y que el logout ocurra **solo** en los casos en que el frontend React lo hace hoy. Debe quedar anotado en el README general de testing y en el README de la Etapa 1, y cubierto con tests.

**Hallazgo — el comportamiento YA existe en el código.** Estos tests no lo crean: lo **pinean** contra regresiones. Los propios comentarios de producción lo piden por escrito (`auth-store.ts:176-177`: "clearing here breaks offline use, which is the whole product").

### Inventario verificado de disparadores de logout en React

Sesión terminada de forma automática:

| # | Sitio | Disparador |
|---|---|---|
| 1 | `auth-store.ts:115-118` | Token vencido **localmente** (`auth.expiresIn <= Date.now()`), evaluado en `initialize()` |
| 2 | `auth-store.ts:183-184` | El `/me` de arranque devuelve un **veredicto**: `SessionRejectedError` (envelope `succeeded:false`), HTTP 401 o HTTP 404 — ver `isSessionRejection:39-45` |
| 3 | `auth/routes/loaders.ts:17` | Fallo de autorización por rol (`unauthorizedLoader`) — es el hallazgo **H-8** |

Disparada por el usuario o la UI:

| # | Sitio | Disparador |
|---|---|---|
| 4 | `shared/components/navbar.tsx:46` | Click explícito en "Salir" |
| 5 | `shared/components/app-layout.tsx:58` | Timer de inactividad (`createIdleTimer`) |
| 6 | `profile/routes/change-password.tsx:28` | Después de cambiar la contraseña |

### Lo que explícitamente NO debe cerrar sesión — la superficie a blindar

| Caso | Sitio que lo garantiza |
|---|---|
| **Cualquier** 401 devuelto por el interceptor HTTP compartido | `shared/lib/http/api-client.ts:84-86` — diverge de Angular a propósito |
| Error de red, DNS, timeout de 30s o **5xx** durante el `/me` de arranque | `auth-store.ts:187-188` |
| `AUTH_MODEL` malformado pero parseable | `auth-store.ts:110-113` — devuelve `null` sin borrar nada |

### Consecuencias para el alcance de este cambio

1. Las aserciones 3 y 5 de la sección 3 dejan de ser casos sueltos: son **dos instancias** de un invariante más amplio ("solo un veredicto del servidor termina la sesión"). El spec debe expresarlo como invariante, con las 6 filas de arriba como lista cerrada.
2. Hacen falta tests aditivos **más allá** de las 8 aserciones originales de S1-04, al menos: sesión sobrevive a un 401 en una llamada de API que **no** es `/me`, y sesión sobrevive con la red caída (`context.setOffline(true)`).
3. Dos work units de documentación: nota del invariante en `docs/testing/README.md` y en `docs/testing/e2e-stage-1/README.md`.
4. El techo de logins **no** cambia: la decisión #1 dejó el costo marginal en cero, y todos estos casos parten de "ya autenticado".

---

## 8. Estado

| | |
|---|---|
| **Status** | `complete` — exploración cerrada, las 4 decisiones resueltas y el requisito adicional incorporado |
| **Next recommended** | `sdd-propose` |
| **Skill resolution** | `none` — ninguna skill del registry aplica a una fase de exploración read-only |
