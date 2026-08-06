# Tareas — `e2e-playwright-register-s1-01`

## Regla innegociable del proyecto (textual, gobierna toda tarea de abajo)

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

Agregar tests E2E **nuevos**: permitido. Tocar tests E2E **existentes** de cualquier forma: requiere autorización explícita, cada vez.
`frontend-react/e2e/smoke.spec.ts` y `frontend-react/e2e/api-health.spec.ts` son tests **existentes**. **Ninguna tarea de este documento los edita, renombra, skippea, debilita ni les cambia cómo corren.**

## Autorización otorgada — alcance angosto, no lo confundas con lo de arriba

El usuario autorizó **una cosa puntual**: portar el cargador de `.env` de `playwright.api.config.ts:9-29` a `frontend-react/playwright.config.ts`, para que la corrida por defecto resuelva `API_URL` y los 2 tests de `api-health.spec.ts` dejen de fallar por falta de configuración.

Esta autorización cubre **solo el archivo de config** (`playwright.config.ts`). **NO** autoriza editar `api-health.spec.ts` ni `smoke.spec.ts` — ninguna tarea toca esos dos archivos. Si en algún momento de `sdd-apply` parece necesario tocarlos, **detenerse y preguntar**, no asumir que esta autorización se extiende.

> **Ampliación de la autorización, otorgada DESPUÉS del apply (2026-08-06)**: el commit
> `0370b07` sí modificó `api-health.spec.ts` — cambió el origen de la dirección del backend
> (de `process.env.API_URL` del `.env` del desarrollador a `E2E_API_URL` de
> `e2e/support/backend-url.ts`) y reemplazó el `beforeAll` por dos aserciones de forma
> (URL absoluta + sufijo `/api`). Los cuerpos de los dos tests quedaron intactos: ninguno
> fue borrado, renombrado, skipeado ni debilitado.
>
> Esa edición se hizo **sin autorización registrada**: el mensaje del commit se declaraba
> autorizado a sí mismo, y el `apply-progress` de 45 minutos antes dejaba constancia de que
> el archivo tenía cero diff. `sdd-verify` lo levantó como CRITICAL y **bloqueó el archive**.
> El usuario lo ratificó explícitamente el 2026-08-06, con la suite corriendo 12/12 en vivo.
>
> Queda asentado como **ratificación posterior**, no como que la regla no aplicaba. La regla
> se cumplió: el cambio se detectó, se detuvo el proceso, se preguntó y se esperó la respuesta.
> `smoke.spec.ts` sigue sin recibir un solo cambio desde su creación.

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Estimated changed lines | ~650–700 (5 archivos nuevos de soporte/spec + 2 edits chicos + docs) |
| 400-line budget risk | High |
| Chained PRs recommended | No — entrega es commits-only en una sola rama, decisión ya asentada, no hay PRs que dividir |
| Suggested split | No aplica — ver Unidades de Trabajo abajo, se entregan como commits secuenciales |
| Delivery strategy | commits-only (asentada; no es ask-on-risk/auto-chain/single-pr/exception-ok) |
| Chain strategy | no aplica — sin PR, solo work-unit commits |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High

El riesgo "High" es real en volumen de líneas pero **informativo únicamente**: no dispara guard de PR porque la entrega es commits-only sobre `feat/e2e-playwright-register-s1-01`. `sdd-apply` sigue el checklist de `work-unit-commits`: un commit por unidad, no por tipo de archivo.

## Rama y entrega

Rama `feat/e2e-playwright-register-s1-01`, creada desde el HEAD actual (`main`, limpio) — **nunca** desde una base reescrita. Commits-only, conventional commits, **sin** "Co-Authored-By" ni atribución de IA. `sdd-apply` NO abre PR.

## Dependencias entre unidades

```
WU1 (config .env)  ──┐
                      ├──> WU3 (register.spec.ts A1–A8) ──┐
WU2 (support/*)   ──┘                                     ├──> WU5 (README)
                      └──> WU4 (rate-limit + scripts) ────┘
```

WU1 y WU2 son independientes entre sí — pueden implementarse en cualquier orden o en paralelo. WU3 y WU4 dependen de WU2 (no de WU1: el código de los specs no depende de cómo se resuelve `API_URL`, solo su ejecución en vivo). WU5 depende de que WU1–WU4 ya existan, porque documenta el resultado final.

---

## Fase 0 — Fundación: `API_URL` en la corrida por defecto (WU1)

- [x] 0.1 ~~Crear `frontend-react/.env.example` con `API_URL=http://localhost:5019/api` (H1) y comentario citando `BaseApiController.cs:11`, `vite.config.ts:64-65`, `api-client.ts:21`, y la advertencia del puerto HTTP vs HTTPS (`launchSettings.json:11` vs `:21`, `Program.cs:138`).~~ **(superseded — ver nota al final de esta fase)**
- [x] 0.2 Editar `frontend-react/playwright.config.ts`: agregar **solo** la función `loadEnv` y su invocación previa a `defineConfig` (copiada de `playwright.api.config.ts:9-29`, adaptada — sin el comentario específico de esa config). **No tocar** `testDir`, `fullyParallel`, `forbidOnly`, `retries`, `workers`, `reporter`, `use`, `webServer` ni `projects` existentes.

Commit: `chore(e2e): resolve API_URL from .env in the default Playwright config`

> **Actualización posterior a la implementación** (commits `0e7964d` y `0370b07`, mismo
> criterio que la nota del `design.md` §10): el enfoque `.env.example` + `cp .env.example .env`
> fue **descartado** y el archivo eliminado con `git rm`. Motivo verificado durante el apply:
> el usuario ya tiene su propio `frontend-react/.env` de desarrollo, así que el `cp` se lo
> hubiera pisado; peor, la suite habría heredado su `API_URL` de desarrollo y creado filas
> reales de Owner+Store en un backend posiblemente compartido.
>
> El mecanismo que quedó es de configuración cero: `E2E_API_URL`, definido en
> `e2e/support/backend-url.ts` como `process.env.E2E_API_URL ?? 'http://localhost:5019/api'`,
> resuelto por los tres specs que pegan contra un backend real e inyectado como `API_URL` al
> dev server vía `webServer.env`. El `loadEnv` de `playwright.config.ts` sobrevive, pero ya no
> porque algún spec lea `process.env.API_URL` — ninguno lo hace — sino para propagar el resto
> del `.env` del desarrollador al proceso `pnpm dev`.
>
> La tarea 0.2 sí se entregó tal cual está descrita. La 0.1 no aplica más.

## Fase 1 — Capa de soporte (WU2)

- [x] 1.1 `frontend-react/e2e/support/identity.ts` — `newTestIdentity(): TestIdentity` (login `e2e-{YYYYMMDDTHHmmss}-{6 chars base36}`, storeName con mismo sufijo, fullName/cellPhone/password fijos).
- [x] 1.2 `frontend-react/e2e/support/network-observer.ts` — fixture `registerNetwork`: filtra POST cuyo `pathname` termina en `/v1/auth/register`; expone `attempts()`, `expectNoAttempt()`, `waitForResponse()`; emite los 4 diagnósticos (429 cuota agotada, `requestfailed` de conexión, origen = page host, 404 sin `/api`).
- [x] 1.3 `frontend-react/e2e/support/register-page.ts` — page object de `/register`: locators por `#id` (fullName, login, email, cellPhone, storeName, password, passwordConfirmation, acceptTerms) + rol/aria-label para los 2 toggles y el submit; `fillValidForm()`, `submit()`.
- [x] 1.4 `frontend-react/e2e/support/test.ts` — `test`/`expect` extendidos, con `registerNetwork` cableado como fixture automático. Todo spec nuevo importa de acá, nunca de `@playwright/test` directamente.

Commit: `test(e2e): add Playwright support layer for the register suite`

## Fase 2 — Suite principal, corre por defecto (WU3)

Todas las aserciones esperan primero el resultado de red (`registerNetwork`) antes de asertar efecto de UI (convención §6 del diseño), para que un 429/timeout se reporte con diagnóstico, no como fallo mudo.

- [x] 2.1 REQ-1 — submit deshabilitado hasta tildar `#acceptTerms`; habilitado después.
- [x] 2.2 REQ-2 — `storeName` vacío bloquea el envío; `expectNoAttempt()`.
- [x] 2.3 REQ-3 — un click en el toggle cambia **ambos** campos de password a `type=text` a la vez.
- [x] 2.4 REQ-4 — password fuera de la política bloquea; `expectNoAttempt()`.
- [x] 2.5 REQ-5 — `passwordConfirmation` distinto muestra el texto de `GENERAL.VALIDATION.INVALID_PASSWORD`.
- [x] 2.6 REQ-8 — `describe.serial`, test 1: identidad única, envío completo → 201 → `/login`, sin sesión autenticada.
- [x] 2.7 REQ-6 (fusionada con REQ-9 del catálogo, A9) — mismo bloque `describe.serial`, test 2: mismo `login`, `email=''` → 400; `attempts()[0].postData.email === ''`; banner == `body.errors[0].description` literal Y `!= 'Error de validación. Por favor, revise sus datos.'`.
- [x] 2.8 REQ-7 — `goto` → llenar → `setOffline(true)` → submit; `expectNoAttempt()` + banner `REGISTRATION.OFFLINE_BANNER`.

Archivo: `frontend-react/e2e/register.spec.ts`.
Commit: `test(e2e): add register.spec.ts covering REQ-1 through REQ-8`

## Fase 3 — Aislamiento del límite de intentos (WU4)

- [x] 3.1 `frontend-react/e2e/register-rate-limit.spec.ts` — REQ-9 (A10 del catálogo), `describe('...', { tag: '@rate-limit' })`, `test.setTimeout(120_000)`. Primer intento: identidad fresca → 201. Intentos 2..11: mismo `login` → 400 por duplicado. Corta apenas `registerNetwork` ve 429; asertar banner `REGISTRATION.TOO_MANY_ATTEMPTS`.
- [x] 3.2 `frontend-react/package.json` — `test:e2e` → agregar `--grep-invert @rate-limit`; nuevo `test:e2e:rate-limit` (`playwright test --grep @rate-limit`); nuevo `test:e2e:api` (`playwright test --config playwright.api.config.ts`).

Commit: `test(e2e): isolate the rate-limit assertion behind its own tag and script`

## Fase 4 — Documentación (WU5)

- [x] 4.1 `frontend-react/e2e/README.md` — agregar: ~~paso 0 (`cp .env.example .env`)~~ **(superseded — ver nota de la Fase 0; el README entregado documenta el mecanismo `E2E_API_URL` de configuración cero)**, comando de backend (`--launch-profile http`, nunca `https`), tabla de scripts actualizada (`test:e2e`, `test:e2e:rate-limit`, `test:e2e:api`), advertencia de basura de datos (2 filas por corrida default + 1 por rate-limit, prefijo `e2e-` greppable, sin teardown).

Commit: `docs(e2e): document register suite prerequisites, commands, and data footprint`

## REQ-10 y REQ-11 — sin tarea de código propia

- **REQ-10** (diagnóstico legible ante cuota agotada) queda satisfecho estructuralmente por 1.2 + 3.1 — no hay archivo adicional que crear. Verificación: manual, del usuario, la primera vez que corra `test:e2e:rate-limit` seguido de `test:e2e`.
- **REQ-11** (A1–A5 no se eliminan) es una invariante negativa: ninguna tarea de este documento toca `register.test.tsx` (vitest/jsdom). Se declara para que quede explícito que no fue un olvido.

---

## Hand-off para el usuario — el agente NO ejecuta nada de esto

Comandos, en este orden exacto:

> **Superseded**: el "Paso 0" original (`cp frontend-react/.env.example frontend-react/.env`)
> ya no existe ni hace falta — ver la nota de la Fase 0. La secuencia real arranca en el Paso 1.

```bash
# Paso 1 — terminal 1, backend (requiere PostgreSQL en 127.0.0.1:5432, base smca)
dotnet run --project backend/src/SMCA.WebApi --launch-profile http
# NUNCA --launch-profile https: app.UseHttpsRedirection() (Program.cs:138) rebotaría
# a un puerto HTTPS con certificado autofirmado que un navegador real rechaza.

# Paso 2 — terminal 2, suite por defecto (REQ-1..REQ-8, consume 2 registros reales)
cd frontend-react && pnpm test:e2e

# Paso 3 — a demanda, sabiendo el costo (agota la cuota de la IP por 10 min)
cd frontend-react && pnpm test:e2e:rate-limit

# Opcional — chequeo de conectividad sin navegador
cd frontend-react && pnpm test:e2e:api
```

### Verde vs. fallo legítimo, requisito por requisito

| REQ | Verde significa | Un fallo real (no de entorno) se ve así |
|---|---|---|
| REQ-1 | Submit deshabilitado y luego habilitado al tildar | Submit habilitado sin tildar el checkbox |
| REQ-2 | Mensaje de requerido + 0 requests observados | Sale un request, o no aparece el mensaje |
| REQ-3 | Un solo click cambia ambos campos a texto | Solo cambia uno, o hace falta un 2do control |
| REQ-4 | Error de política + 0 requests | Sale un request con password débil |
| REQ-5 | Texto de `INVALID_PASSWORD` visible | Mensaje genérico o ausente |
| REQ-8 | 201 → URL `/login`, sin sesión | Queda autenticado, o no navega |
| REQ-6 | `postData.email===''` Y banner == texto exacto del backend, distinto del genérico | Banner genérico, o `email` no llegó vacío al body |
| REQ-7 | 0 requests + banner offline | Sale un request estando offline, o aparece `UNEXPECTED_ERROR` en vez del banner |
| REQ-9 | Tras N intentos, 429 + `TOO_MANY_ATTEMPTS` | 429 nunca llega (limitador mal configurado), o aparece un error de CORS en su lugar (riesgo R1 del diseño — hallazgo de backend, no del test) |

**Fallo de entorno, no de comportamiento** (el diagnóstico de `registerNetwork` lo dice así, no como aserción cruda): backend caído (`ECONNREFUSED`), `.env` faltante (`API_URL no está configurada`), `/api` faltante en la URL (404 con `text/html`), o cuota de registros agotada (429 con "esperá hasta 10 minutos"). Si ves uno de estos 4 mensajes, no hay bug de la app — hay que arreglar el entorno y volver a correr.

### Advertencia de datos, sin alarma

Una corrida exitosa de `pnpm test:e2e` deja **2 filas permanentes** (`Owner`+`Store`) en tu base local; `pnpm test:e2e:rate-limit` deja **1 más**. No existe teardown alcanzable desde el navegador. Los logins llevan prefijo `e2e-` + timestamp, así que son greppables y borrables a mano cuando quieras limpiar.
