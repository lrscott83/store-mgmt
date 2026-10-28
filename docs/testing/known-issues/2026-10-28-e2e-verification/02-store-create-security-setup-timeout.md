# 2. store-create-security.spec.ts:88 — el setup de signedInPage agoto los 120 s y el test pasa en el reintento

**Que prueba el test — y que NO prueba.**
`store-create-security.spec.ts` tiene **dos tests, en dos describes separados, con dos roles
distintos y dos desenlaces opuestos**. Hay que leerlos juntos:

- **Test 1 (`:43`), describe `OwnerAdmin sin MultiStores`** — "OwnerAdmin sin MultiStores en
  /management/stores/create aterriza en my-stores sin poder crear". **El dueno NO es
  deslogueado.** `ownerStoresGate()` (`loaders.ts:158-169`) deja pasar a `adminLoader` (es
  OwnerAdmin) y despues, como su tienda no tiene el modulo MultiStores (14), devuelve
  `redirect('/management/my-stores')` **con la sesion viva**. El test asevera exactamente eso:
  la URL queda en `my-stores`, la card de su tienda se ve (`owner-store-body-<id>`: sesion viva)
  y cero `POST`/`PUT` a `/v1/stores`.
- **Test 2 (`:88`), describe `StoreUser`** — "StoreUser en /management/stores/create es
  deslogueado y redirigido a /login". **Aqui el rol es `store-user`, NO el dueno**: es el usuario
  de tienda o empleado (el que el owner da de alta en `/management/users/create`), no el
  propietario. Escribe a mano una URL de administracion: `ownerStoresGate()` → `adminLoader()`
  → no es SuperAdmin ni OwnerAdmin → `denyAccess()` = `logout()` + `redirect('/login')`
  (`loaders.ts:17-20` y `:124-133`). Es la convencion **H-8** del proyecto ("un fallo de
  autorizacion desloguea, no muestra 'no autorizado'" — `docs/testing/e2e-stage-1/README.md:234`),
  y ocurre al **navegar** a la URL, sin tocar ningun formulario.

**Para no leer de mas.** Ninguno de los dos tests crea una tienda, asi que este archivo **no**
dice nada sobre lo que pasa cuando alguien crea una tienda: no es un test de creacion, es un test
de acceso a una ruta de administracion. El unico deslogueo del archivo es el del Test 2, y su
causa es un **fallo de autorizacion por rol** (un `store-user` entrando a una ruta de admin), no
la creacion. Del lado del dueno el archivo prueba lo contrario: sin el modulo 14 el gate lo
devuelve a `my-stores` **sin cerrarle la sesion**.

**Que fallo (en simple).**
Fallo el intento 1 de 3 de la corrida completa del 2026-10-05, y fallo **antes de llegar al
cuerpo del test**: el fixture compartido `signedInPage` (el del **Test 2**, el que abre la sesion del rol
`store-user`) no termino de prepararse en 120 s. Paso en el reintento. Texto literal del `error-context.md`:

```
Test timeout of 120000ms exceeded while setting up "signedInPage".
```

**Evidencia (unica, de los artifacts de esa corrida).**
Snapshot de la pagina al agotarse el tiempo — la primera lectura lo etiqueto "la portada publica de la app, todavia cargando"; la lectura corregida (mas abajo) es el layout de invitado con un login en vuelo:

```yaml
- heading "VendeDTo" [level=1]
- paragraph: Automatiza tu Negocio
- status "Cargando...":
  - status "Cargando"
  - paragraph: Cargando...
- contentinfo:
  - link "Políticas de Privacidad"
  - link "Términos y Condiciones"
- button "Instalar app" [disabled]
```

Es decir: **el login no habia completado**. Archivo:
`frontend-react/test-results/store-create-security-Stor-0d832-gueado-y-redirigido-a-login-chromium/error-context.md`
(el trace conservado es el del reintento, `...-retry1/trace.zip`).

**Correccion de lectura (2026-10-06): ese snapshot NO es la portada publica.** Las dos cadenas del
arbol son `GENERAL.APP_NAME` ('VendeDTo') y `GENERAL.APP_SUBTITLE` ('Automatiza tu Negocio')
(`es.ts:3-4`), y quien las pinta es el **layout de invitado**
(`auth/components/auth-layout.tsx`): el shell de `/login`, `/register` y `/auth/provision`. La
portada publica (`home/routes/landing-deep.tsx`) renderiza 'VendeDTo' pero **no** 'Automatiza tu
Negocio' (esa cadena no existe en ese archivo), asi que la pagina del fallo estaba en una ruta de
invitado, no en `/`. El `contentinfo` con Politicas de Privacidad / Terminos y Condiciones es el
`Footer variant="guest"` de ese layout, y el `button "Instalar app"` lo pinta `App()`
(`root.tsx:99-120`) en toda la app. Los dos `status` anidados ('Cargando...' englobando a
'Cargando') son las dos capas de overlay que la propia suite documenta para un login en vuelo
(`login-page.ts`: el overlay de la pagina de login + el contador global de `root.tsx`).

**Causa raiz: CONFIRMADA (2026-10-06) — el setup se quedo esperando un login en vuelo, en una
espera sin timeout.**
Con la lectura corregida, el estado del snapshot es inequivoco: **layout de invitado sin el
contenido de la ruta y con una request en vuelo**. Asi se ve `/login` mientras una submission esta
en curso — el propio `login.spec.ts` lo pinea en REQ-1
(`await expect(page.locator('#login')).toHaveCount(0); await expect(loginPage.loadingOverlay)
.toBeVisible();`): el formulario NO esta en el DOM y el overlay si.
Tres hechos mas cierran el mecanismo:

- **Lo que el fixture hace en el setup es trabajo real de UI, no una restauracion barata.** Para
  `persona: 'store-user'`, `signedInPage` (`support/test.ts`) llama a
  `restoreSignedInSession(page, personaCache, 'store-user')`, que acuna la cadena entera
  (`session.ts`): registrar un OwnerAdmin nuevo → restaurar esa sesion en otro contexto → **crear
  el StoreUser por la UI real** (`/management/users/create`) → **`POST /v1/auth/login` real** del
  StoreUser → capturar y recien ahi reescribir la sesion en la pagina del test.
- **Cuanto cuesta eso, medido hoy en una maquina libre.** Un spec temporal (borrado despues de
  medir) llamo a la MISMA funcion del fixture y cronometro el primer resolve —mint + replay— en
  **32 324 ms**, y el segundo (memoizado) en 3 340 ms. Es decir: el setup de esta persona ya
  consume ~27% del presupuesto de 120 s **sin contencion**, y la corrida completa reparte los
  tests entre todos los CPUs (la config: 8+ workers) contra un unico dev server + backend +
  PostgreSQL.
- **Las acciones sin `actionTimeout` existen, pero NO son el cuello de botella medido.**
  `playwright.config.ts` no define `actionTimeout`, y el default de Playwright es 0 = **sin
  limite**: `locator.click()`, `fill()` y `check()` reintentan indefinidamente y su unico tope es
  el timeout del test. El resto de la cadena esta acotado (`page.goto` / `page.waitForURL` = 30 s,
  `expect` = 5 s, `expect.poll` = el explicito). **La conclusion que este punto sostenia ("una
  espera sin timeout es lo unico capaz de gastar 120 s") quedo FALSIFICADA por medicion el
  2026-10-06**: la suma de esperas **acotadas** ya consume 64.8 s de los 120 s con 8 workers sin
  que ninguna se cuelgue, y las acciones sin acotar costaron 0.5-2.0 s cada una en esa misma
  corrida. Ver "Medicion del mecanismo bajo contencion" mas abajo.

**Lo que NO es (descartado hoy).** No es el riesgo R3 documentado en `createStoreUserViaUi`
("el OwnerAdmin auto-registrado no tiene la feature Users"): `UsersAdmin` cuelga del modulo
`Management` (`StoreRoleFeatures.cs:196-200`) y ese modulo es `PriceIncluded=true` en el catalogo
real (medido en `smca_test`: modulo 7 'Gestion', FREE), asi que ningun degrade de otro spec se la
quita. Y no es una reaparicion sin diagnostico: es la misma clase de "flaky de preparacion" de la
tanda del 2026-09-25 — el fixture mintea sesiones reales en el setup.

**Clasificacion:** inestable de entorno/carga en el setup — **confirmada y medida**: el setup hace
logins reales (32.3 s en solitario; **63.6 s con 8 workers**) y el presupuesto se agota por
**suma de esperas acotadas** — navegaciones encadenadas + `POST /api/v1/auth/register` de 12 s +
transforms en frio de Vite —, no por una espera individual colgada. Ver la medicion mas abajo.

**Propuesta de solucion (paso 1 hecho; el paso 2, endurecer el fixture, sigue sin aplicar).**
Un fix distinto —ampliar el presupuesto del spec— **si se aplico y verifico** el mismo
2026-10-06 con autorizacion 1 a 1: ver "Opciones de fix" y el estado final mas abajo.
Primero medir, no parchear:

1. Correr el spec en solitario (`pnpm exec playwright test e2e/store-create-security.spec.ts`)
   y anotar el tiempo real del setup. Si pasa holgado, el problema es la carga de la suite.
   **Hecho (2026-10-06):** el archivo entero —los dos tests, cada uno con su setup completo—
   termina en 42.6 s; el setup de `store-user` solo se cronometro aparte en 32.3 s.
2. Si se repite, endurecer el fixture: esperar una marca de sesion real (por ejemplo el home
   del rol, como ya hacen otros fixtures) en lugar de depender del timeout global de 120 s.
   Con la causa confirmada, la pieza que falta es acotar las **acciones**: un `toBeVisible()`
   explicito antes de cada `fill()`/`click()` del mint (o un `actionTimeout` en la config) hace
   que el fallo reporte DONDE espera, en vez de morir en el timeout global del test.

**Verificacion.** Ninguna: no se toco nada. La corrida completa marco el test como inestable
(paso al reintento).

**Estado final (2026-10-06):** ✅ **causa raiz confirmada** — setup que agota el presupuesto
esperando un login en vuelo en una accion sin `actionTimeout` (setup medido: 32.3 s en solitario).
El endurecimiento del fixture sigue **sin aplicar**: tocar un support file E2E requiere
autorizacion 1 a 1.

---

## Re-verificacion en solitario (2026-10-06) — el fixture no es lento cuando la maquina esta libre

Se corrio **solo este spec**, con un worker y sin reintentos:

```
cd frontend-react
npx playwright test e2e/store-create-security.spec.ts --workers=1 --retries=0 --reporter=line
# 2 passed (42.6s)
# EXITCODE=0
```

Log: `/tmp/iso-store-create-security.log`.

**Respuesta al punto 1 de la propuesta** ("primero medir, no parchear"): los **dos** tests del archivo
—cada uno con su `signedInPage` completo, identidad + login + perfil— terminan en 42.6 s en total. El
setup que en la corrida completa agoto los 120 s no llega ni a la mitad de ese presupuesto cuando la
maquina esta libre. **La clasificacion "inestable de entorno/carga en el setup" queda sostenida por
evidencia**; el mecanismo exacto (que parte del armado de sesion se degrada bajo contencion) sigue sin
medirse, asi que el paso 2 (endurecer el fixture con una marca de sesion real) sigue **sin aplicar y
sin autorizacion**.

Evidencia de la corrida aislada en
[`funcionan-en-solitario.md`](funcionan-en-solitario.md).

## Medicion del mecanismo bajo contencion (2026-10-06) — se gasta por SUMA

La hipotesis que esta ficha sostenia ("solo una espera sin `actionTimeout` puede gastar los 120 s")
**se midio y quedo falsificada**. Se reprodujo contencion **sin correr la suite completa**
(subconjuntos, con `--trace on` para conservar el trace de cada intento, algo que la corrida del
2026-10-05 perdio por `trace: 'on-first-retry'` + el paso al reintento).

### Tres corridas, mismos tests

```
# A) en solitario — referencia
npx playwright test e2e/store-create-security.spec.ts --workers=1 --retries=0 --reporter=list
# 2 passed (36.4s) · Test 1: 10.0s · Test 2: 8.8s · EXITCODE=0
# (repeticion de la corrida A de arriba: mismo comando, 42.6s con la maquina mas cargada)

# B) contencion — 8 specs, 8 workers, trace on
npx playwright test e2e/store-create-security.spec.ts e2e/create-store-user.spec.ts \
  e2e/change-password.spec.ts e2e/logout-silent.spec.ts e2e/valid-session-navigation.spec.ts \
  e2e/owner-store-create.spec.ts e2e/store-update.spec.ts e2e/users-crud.spec.ts \
  --workers=8 --retries=0 --trace on --reporter=list
# 24 passed / 3 failed / 2.2m / EXITCODE=1 — los 3 fallos son specs AJENOS (contencion)

# C) mas presion — 14 specs, 12 workers, trace on
# 61 passed / 6 failed / 5 no corrieron / 6.1m / EXITCODE=1 — igual: specs ajenos
```

El victim paso las **dos** corridas con contencion, pero con el presupuesto casi agotado:

| Test | solitario (A) | 8 workers (B) | margen sobre 120 s |
|---|---|---|---|
| Test 1 `OwnerAdmin sin MultiStores` | 10.0 s | **53.7 s** | — |
| Test 2 `StoreUser` (el que fallo el 2026-10-05) | 8.8 s | **66.0 s** | **54 s** |

### Desglose del trace del Test 2 (corrida B) — ventana de 69.6 s

| Que | Cuanto |
|---|---|
| `Before Hooks` (o sea: el SETUP) | **64.8 s** — el cuerpo del test gasta ~4.8 s |
| `Fixture "signedInPage"` | **63.6 s** de esos 64.8 s |
| `Wait for navigation` justo despues del clic en "Registrar" | **26.7 s** — es el `page.waitForURL(/\/sales\/products$/)` del `mintOwnerAdmin`: 26.7 s de los 30 s que corre por default, **el 89% de su presupuesto** |
| `Navigate to "/register"` | 7.1 s (transform en frio de la ruta en Vite) |
| El resto: una decena de `goto`/`waitForURL` de 0.7-2.9 s (`/login`, `/sales/products`, `/management/users/create`, `/management/stores/create`) | ~15 s |
| 6 `expect.toBeVisible` | 5.6 s (acotados a 5 s c/u) |
| `fill` / `check` / `click` — los que NO tienen `actionTimeout` | **0.5-2.0 s cada uno**: no son el cuello de botella |

### A donde se fue ese tiempo (pestana Network del mismo trace, 4 contextos)

| Request | Duracion |
|---|---|
| `POST /api/v1/auth/register` | **11 985 ms** (201) — el backend tarda 12 s bajo carga |
| `POST /api/v1/auth/login` | **8 719 ms** (200), luego 1 488 ms |
| `POST /api/v1/storeusers` | 1 730 ms |
| 1 400 requests al dev server `:3333` | **178 641 ms** agregados: transforms en frio de Vite — `workbox-window.js` 4 833 ms, `virtual:react-router/browser-manifest` 3 000 ms, `/app/root.tsx` 2 675 ms, `/app/entry.client.tsx` 2 413 ms |

**El setup es 12 s de backend (registro) + frio de Vite + una decena de navegaciones encadenadas**,
todo contra un unico dev server + backend + PostgreSQL compartidos con 7 workers mas. En solitario
esa misma cadena cuesta 32.3 s; con 8 workers, 63.6 s — **2x**.

### Que queda corregido y que NO

- **Corregido:** el presupuesto se agota por **suma de esperas acotadas**. No hizo falta ninguna
  espera colgada, y las acciones sin `actionTimeout` no fueron lentas.
- **Sigue sin descartarse:** `playwright.config.ts` no define `actionTimeout`, asi que un
  `fill()`/`click()` contra una pagina cuyo formulario nunca monta **podria** colgarse hasta el
  timeout global — que es exactamente el mensaje observado (`Test timeout of 120000ms exceeded
  while setting up "signedInPage"`). Ninguna corrida activo ese camino (0.5-2.0 s medidos).
- **Limitacion honesta:** el paso exacto del fallo del 2026-10-05 **no tiene trace** (se perdio con
  `on-first-retry`), y las 2 reproducciones (B y C) no cruzaron los 120 s: el victim las paso.
- **Colateral observado (specs ajenos, NO tocados):** la contencion tambien flasheo a
  `logout-silent` (30 s), `valid-session-navigation` (waitForURL 15 s) y `register` (3 tests de 30 s)
  en las corridas B y C. Ese es el mismo flake de carga que la config ya describe y que absorbe
  `retries: 2`.

### Opciones de fix — la 1 APLICADA (autorizacion 1 a 1, 2026-10-06); 2 a 4 sin aplicar

1. **Ampliar el presupuesto del spec** — **APLICADA y verificada el 2026-10-06**: el describe pasa
   de `timeout: 120_000` a `timeout: 240_000` en `store-create-security.spec.ts`, con el comentario
   que deja la medicion al lado de la linea. Verificacion: `npx playwright test --list` OK (2 tests),
   `2 passed (38.0s)` en solitario, y **los dos tests `ok` bajo contencion de 8 workers** (Test 1:
   36.3 s, Test 2: 56.3 s, holgados dentro de los 240 s). El unico fallo de esa corrida fue
   `logout-silent.spec.ts:110`, un spec ajeno con el mismo flake de carga de siempre, **sin tocar**.
2. **Poner `actionTimeout` en `playwright.config.ts`** (p. ej. 30 s): cualquier espera colgada
   falla nombrando el paso en vez de morir en un timeout global de 120 s sin contexto. Es un
   cambio de la suite entera: puede volver rojo un test que hoy se cuelga y pasa al reintento.
3. **Acotar las acciones del mint en `e2e/support/session.ts`** (un `toBeVisible()` explicito antes
   de cada `fill()`/`click()`): era el paso 2 original de la propuesta. Toca un support file.
4. **Bajar la contencion** (`workers` en la config): menos flake en toda la suite, corrida mas
   larga.

**Estado final actualizado (2026-10-06):** ✅ **causa raiz medida y fix APLICADO** — el setup se
come el presupuesto por suma bajo contencion (63.6 s con 8 workers: 12 s de
`POST /auth/register`, 26.7 s de `waitForURL` tras registrar, frio de Vite) y llego a los 120 s en
la corrida completa del 2026-10-05. Presupuesto del spec subido a **240_000** con autorizacion 1 a
1, verificado en solitario (`2 passed (38.0s)`) y bajo contencion (2 `ok` de 8 workers). El paso
exacto del fallo del 2026-10-05 seguira sin registro: el trace se perdio con `on-first-retry` y
ninguna reproduccion cruzo el limite. Las opciones 2 a 4 siguen **sin autorizar**.

---

## Causa raíz DEFINITIVA (2026-10-06, tarde) — el registro aborta y la espera del mint era INFINITA

La sección "Medición del mecanismo bajo contención" explicaba la corrida B (8 workers, registro OK
en 12 s) como **suma de esperas acotadas**. La reproducción a mayor presión —autorizada por el
usuario ("arregla 2, del modo que sea… haz las otras partes")— cerró el caso del fallo original
con otro mecanismo, esta vez **con trace propio del test que muere**:

**Reproducción (8 specs / 27 tests, `--workers=16 --retries=0 --trace on`):** 8 failed / 15 passed /
4 did not run — **4 specs distintos cayeron con el mensaje exacto de esta ficha**:
`Test timeout of 120000ms exceeded while setting up "signedInPage"`
(`store-create-security:51`, `users-crud:76`, `store-update:53`, `owner-store-create:147`).
El trace del victim (`store-create-security-Owne-6cc90-…/trace.zip`) muestra:

| Hecho | Evidencia |
| --- | --- |
| `Before Hooks` = 120 497 ms; `Fixture "signedInPage"` = 119 187 ms | el test muere dentro del setup |
| `Wait for navigation` pendiente desde t=+19.2 s hasta la muerte (~101 s) | stack: `session.ts:255 mintOwnerAdmin` — el `waitForURL(/\/sales\/products$/)` tras `registerPage.submit()` |
| `POST /api/v1/auth/register` → **`net::ERR_ABORTED`** (status −1, sin respuesta) | `1-trace.network`, resource-snapshot del registro |
| Al morir: formulario lleno en `/register` + diálogo **"Ocurrió un error inesperado en la creación de la cuenta"** (`es.ts:193`) | `error-context.md` |

O sea: **el registro abortó a nivel de red, la app pintó su diálogo de error y se quedó en
`/register`, y el `waitForURL` del mint esperó ~101 s sin expirar jamás**.

**Por qué no expiró (verificado en el código fuente de Playwright 1.62.1, no en la doc).**
`waitForURL`/`goto`/`waitForLoadState` resuelven su tope por `navigationTimeout`, **NO** por
`actionTimeout`. El runner declara `navigationTimeout: [0, { option: true }]` y aplica
`playwright._defaultContextNavigationTimeout = navigationTimeout || 0` — el default es
**0 = SIN LÍMITE** — y 0 anula el fallback a `actionTimeout` (`_navigationTimeout` devuelve
`_defaultNavigationTimeout` antes de mirar `_defaultTimeout`; `rejectOnTimeout` con `timeout: 0`
no programa ningún timer). La afirmación previa de esta ficha ("`page.goto` /
`page.waitForURL` = 30 s") quedó **falsificada**. Con solo `actionTimeout: 30_000` (opción 2), la
reproducción a 16 workers fue idéntica y `grep "Timeout 30000ms exceeded"` dio 0 disparos.

## Fix aplicado (2026-10-06, opciones 2+3+4 — autorización 1 a 1: "arregla 2, del modo que sea")

1. **Timeout del spec de vuelta a `120_000`** — la ampliación a 240_000 del mismo día quedó
   **REVERTIDA** por pedido del usuario: no tapar el presupuesto, determinar el problema.
2. **Opción 2 — `actionTimeout: 30_000`** en `playwright.config.ts` `use` (aplicada antes; cubre
   `fill`/`click`/`check`, no la familia de navegación).
3. **Opción 2 extendida — `navigationTimeout: 60_000`** en el mismo `use`: toda espera de
   navegación de la suite (`waitForURL`/`goto`/`waitForLoadState`) falla a los 60 s **nombrando
   el paso** en vez de colgar hasta el timeout global. 60 s y no 30 s porque la navegación
   legítima post-registro midió 26.7 s con 8 workers.
4. **Opción 3 — mint acotado y con reintento** en `e2e/support/session.ts` (`mintOwnerAdmin`):
   - `waitForURL(…, { timeout: 30_000 })` y el **diálogo de error propio de la app**
     (`getByText('Ocurrió un error inesperado en la creación de la cuenta')`) corren en
     `Promise.race`; ambos waiters se crean ANTES del click y mapean su timeout a valor, así que
     el perdedor de la carrera jamás es un unhandled rejection. Un registro muerto se detecta en
     segundos, no a los 120 s.
   - Un intento fallido descarta su contexto y **reintenta UNA vez** con identidad y contexto
     nuevos (un `POST /v1/auth/register` más — no uno de los 4 logins del presupuesto).
   - Agotados los 2 intentos, lanza un **error con nombre** (`[mint:owner-admin] … last outcome:
     …`) que dice qué paso se rindió.
5. **Opción 4 — `workers: process.env.CI ? 1 : 4`** en el config. Antes era `undefined`, es decir
   el default de Playwright (50% de los 16 CPUs = **8**): un `pnpm test:e2e` a secas corría con 8
   y solo el flag `--workers=4` (la recomendación operativa de known-issues.md) bajaba la presión.
   Ahora el default del config ES 4.

## Verificación (2026-10-06, tarde)

| Corrida | Comando | Resultado |
| --- | --- | --- |
| Solitario | `npx playwright test e2e/store-create-security.spec.ts --workers=1 --retries=0` | **2 passed (18.6 s)**, EXIT=0 |
| Reproducción previa (estrés) | mismos 8 specs / 27 tests, `--workers=16 --retries=0 --trace on` | **19 passed / 5 failed / 3 did not run** — los 4 specs que antes caían con `while setting up "signedInPage"` **pasan**; los 5 fallos son specs AJENOS (`change-password:40`, `logout-silent:110`, `valid-session-navigation` 119/148/168) con flake de contención en sus PROPIOS registros/logins, mezcla distinta a la corrida anterior ("nunca los mismos dos veces") |
| Modo oficial | mismos 8 specs, `--workers=4 --retries=0` | **27 passed (42.2 s)**, EXIT=0 |

En la corrida de estrés los fallos ajenos ya **no son colgaderos silenciosos**: el `waitForURL` de
sus propios registros se rinde a los 60 s con `Timeout 60000ms exceeded` (familia de navegación
acotada) y `logout-silent` sigue en su `test.setTimeout(30 s)` propio.

**Limitación honesta (sin tocar).** Los specs que hacen su PROPIO registro/login real
(`valid-session-navigation.spec.ts` `registerOnline` `:70`, `change-password.spec.ts:54`,
`logout-silent.spec.ts:123`) siguen expuestos al abort de registro bajo contención extrema
(16 workers); a 4 workers pasan limpios y el `retries: 2` oficial absorbe el resto. Tocarlos
requiere autorización 1 a 1: son tests E2E existentes.

**Estado final (2026-10-06, cierre):** ✅ **causa raíz definitiva y fix aplicado** — el registro
real del mint aborta bajo contención (`net::ERR_ABORTED`) y el `waitForURL` posterior era una
espera SIN LÍMITE (`navigationTimeout` default 0); ahora el mint detecta el fallo en segundos con
el diálogo propio de la app, reintenta una vez con identidad nueva, y toda espera de navegación
de la suite está acotada a 60 s con fallo nombrado. El timeout del spec vuelve a `120_000`. La
opción 1 (ampliar presupuesto) quedó revertida: no se tapa, se arregla.
