# e2e-register-ui Capability Specification

**Capability**: e2e-register-ui — cobertura Playwright de negocio (browser) para [S1-01] Auto-registro, `frontend-react/e2e/`
**Origin**: SDD change `e2e-playwright-register-s1-01`
**Fuente**: `docs/testing/e2e-stage-1/S1-01.md` (antes `docs/testing/e2e-catalog-stage-1.md`, escenario [S1-01], líneas 77-124)
**Status**: Active

## Purpose

Definir, como criterios de aceptación verificables, las 10 aserciones de UI de [S1-01] que la suite Playwright nueva debe cumplir contra un backend real. Esta spec describe QUÉ debe ser cierto; no diseña mecánica de Playwright (interceptación de requests, `context.setOffline`, forma del helper) — eso es de la fase de diseño.

## Capability Scope

### In Scope
- Las 10 aserciones de UI de [S1-01] (catálogo líneas 97-106).
- La restricción de que la aserción de "email vacío llega a la API" y la de "el 400 muestra el `description` literal" se satisfacen con UN único envío/registro, no dos.
- El diagnóstico legible cuando se agota la cuota de registro.
- La invariante de que A1-A5 no se eliminan aunque dupliquen cobertura vitest/jsdom.

### Out of Scope
- Todo trabajo .NET/backend — la capa de dato de [S1-01] ya está cubierta por `AuthRegisterSuccessTests`, `AuthRegisterValidationTests`, `AuthRegisterDuplicateTests`, `Billing/StoreCreationTrialTests`.
- La aserción de destino post-login (catálogo :110, `/sales/products`): pertenece a **[S1-02]** — `resolveUserHomePath` corre en el LOGIN, no en el registro.
- Ejecución por un agente o en CI: el usuario corre backend, dev server y suite en su propia máquina; ningún requirement asume un backend provisto automáticamente.
- Cualquier edición a `frontend-react/e2e/smoke.spec.ts` o `frontend-react/e2e/api-health.spec.ts` (tests existentes, regla innegociable del proyecto).

### Supuestos operativos (implícitos en cada GIVEN de abajo)
Backend real en `http://localhost:5019`, perfil `http`/Development, levantado manualmente por el usuario. Ningún escenario asume que el backend lo levanta CI o el agente.

## Requirements

### Requirement: REQ-1 — Envío deshabilitado sin aceptar términos
El botón de envío MUST permanecer deshabilitado mientras el checkbox de términos y condiciones no esté tildado. (Catálogo :97)

#### Scenario: Checkbox destildado bloquea el envío
- GIVEN el formulario cargado con el resto de los campos completos y válidos, checkbox sin tildar
- WHEN se intenta enviar
- THEN el botón de envío permanece deshabilitado

### Requirement: REQ-2 — storeName requerido en cliente
`storeName` MUST ser requerido por validación de cliente; sin valor, el envío MUST bloquearse sin llamar a la API. (Catálogo :98)

#### Scenario: storeName vacío bloquea el envío
- GIVEN el formulario completo salvo `storeName`
- WHEN se intenta enviar
- THEN el envío se bloquea y no sale ninguna petición a la API

### Requirement: REQ-3 — Un único toggle de contraseña
Un único control `showPassword` MUST alternar simultáneamente la visibilidad de `password` y `passwordConfirmation`. (Catálogo :99)

#### Scenario: El toggle afecta ambos campos a la vez
- GIVEN ambos campos de contraseña ocultos
- WHEN se activa el toggle de mostrar contraseña
- THEN ambos campos cambian a texto visible simultáneamente

### Requirement: REQ-4 — Política de password sin llamar a la API
Un `password` que no cumpla `/^(?=.*[A-Z])(?=.*\d).{8,}$/` MUST mostrar el error de política de cliente y MUST NOT emitir ninguna petición a la API. (Catálogo :100)

#### Scenario: Password débil bloquea antes de la red
- GIVEN un `password` sin mayúscula, sin dígito, o de menos de 8 caracteres
- WHEN se intenta enviar
- THEN se muestra el error de política y no sale ninguna petición

### Requirement: REQ-5 — Confirmación de password distinta
`passwordConfirmation` distinto de `password` MUST mostrar `GENERAL.VALIDATION.INVALID_PASSWORD`. (Catálogo :101)

#### Scenario: El mismatch muestra el mensaje esperado
- GIVEN `password` válido y `passwordConfirmation` con un valor distinto
- WHEN se intenta enviar
- THEN se muestra el texto correspondiente a `GENERAL.VALIDATION.INVALID_PASSWORD`

### Requirement: REQ-6 — email vacío llega a la API y el 400 muestra el texto literal del backend, en un único envío
`email` MUST NOT ser validado como requerido en cliente: un envío con `email` vacío MUST resultar en una petición real a la API (catálogo :102). La respuesta HTTP 400 de ESA MISMA petición MUST mostrarse con el texto literal de `errors[0].description` del backend, no un mensaje genérico (catálogo :105). Restricción de la suite: MUST resolverse con UN ÚNICO registro real, no dos pruebas separadas — cada registro adicional consume cuota compartida con REQ-8.

#### Scenario: Un solo envío prueba salida a la API y el texto de error literal
- GIVEN el formulario completo con `email` vacío y el resto de campos válidos
- WHEN se envía el formulario una única vez
- THEN se observa que salió una petición HTTP real hacia la API (no bloqueada en cliente)
- AND la respuesta 400 de esa petición se refleja en pantalla con el texto exacto de `errors[0].description`

### Requirement: REQ-7 — Offline no emite peticiones y muestra el banner
Sin conexión, el formulario MUST NOT emitir ninguna petición de red y MUST mostrar `REGISTRATION.OFFLINE_BANNER`. (Catálogo :103)

#### Scenario: Offline bloquea antes de la red
- GIVEN el navegador en estado offline
- WHEN se intenta enviar el formulario con datos válidos
- THEN no sale ninguna petición de red
- AND se muestra el banner `REGISTRATION.OFFLINE_BANNER`

### Requirement: REQ-8 — Éxito navega a /login sin autenticar
Un registro exitoso MUST navegar a `/login` y MUST NOT autenticar automáticamente. (Catálogo :104)

#### Scenario: Registro exitoso aterriza en /login
- GIVEN un registro con datos válidos y un `login` único no existente
- WHEN la API responde éxito
- THEN el navegador queda en `/login`
- AND no hay sesión autenticada activa

### Requirement: REQ-9 — Límite de intentos, aislado en archivo y script propios
HTTP 429 tras exceder el umbral del backend (10 registros/10min/IP) MUST mostrar `REGISTRATION.TOO_MANY_ATTEMPTS`. (Catálogo :106) Esta aserción MUST vivir en un spec file propio con su propio script npm y MUST quedar EXCLUIDA de la corrida por defecto de la suite.

> **Nota de estado (archive, 2026-08-06)**: implementado, tipa correctamente y aislado por tag/script tal como exige este requirement. **No verificado en ejecución** — ver `archive-report.md` de este cambio para el detalle de la brecha aceptada.

#### Scenario: 429 muestra el mensaje de cuota agotada
- GIVEN 10 intentos de registro ya consumidos en la ventana de 10 minutos desde la misma IP
- WHEN se realiza un 11º intento de registro
- THEN la respuesta HTTP es 429
- AND la UI muestra `REGISTRATION.TOO_MANY_ATTEMPTS`

#### Scenario: Aislamiento de la corrida por defecto
- GIVEN la corrida por defecto de la suite
- WHEN se ejecuta
- THEN el escenario de 429 no corre como parte de esa corrida
- AND solo corre mediante su propio comando dedicado

### Requirement: REQ-10 — Diagnóstico legible cuando se agota la cuota de registro
Cuando la suite se topa con la cuota de registro agotada, el fallo MUST comunicar un mensaje diagnosticable por un humano de forma inmediata (p. ej. "cuota de registro agotada, esperar N minutos"), no una falla de aserción cruda indistinguible de un defecto real.

#### Scenario: El fallo por cuota se distingue de un fallo funcional
- GIVEN la cuota de registro de la IP ya agotada por corridas previas
- WHEN un test que depende de un registro real se ejecuta
- THEN el fallo reportado incluye un mensaje explícito de cuota agotada y el tiempo de espera sugerido
- AND ese mensaje es distinguible de una aserción de negocio fallida

### Requirement: REQ-11 — A1-A5 no se eliminan por duplicar cobertura jsdom
REQ-1 a REQ-5 MUST permanecer en la suite Playwright aunque dupliquen cobertura ya existente en `register.test.tsx` (vitest/jsdom, 521 líneas). Es una decisión deliberada del usuario, no un descuido.

#### Scenario: Una auditoría futura no borra A1-A5
- GIVEN una revisión futura que detecta que REQ-1..REQ-5 duplican `register.test.tsx`
- WHEN se evalúa si eliminarlas por redundantes
- THEN se mantienen por esta decisión explícita — no se eliminan aserciones

## Verification Criteria
- [x] REQ-1..REQ-5, REQ-7, REQ-8 corren en la corrida por defecto (`pnpm test:e2e` o equivalente) — verificado en vivo, 12/12, 2026-08-06
- [x] REQ-6 se satisface con un único registro real por corrida — verificado en vivo, 2026-08-06 (falló en la 1ra corrida por un bug real de backend, corregido en `147b62d`; verde en la 2da corrida)
- [x] REQ-9 corre solo mediante su propio script, nunca en la corrida por defecto — verificado estáticamente (tag `@rate-limit`, excluido de `test:e2e`); **NO verificado en ejecución** (ver archive-report)
- [ ] REQ-10 verificado manualmente por el usuario al agotar la cuota — pendiente, depende de correr `test:e2e:rate-limit`
- [x] `register.test.tsx` permanece sin cambios (REQ-11) — verificado, 34/34 green
- [x] `smoke.spec.ts` permanece sin cambios — verificado (`git log` muestra un único commit desde su creación, `e12f293`)
- [x] `api-health.spec.ts` — editado en `0370b07`, cuerpos de los 2 tests intactos, ratificado por el usuario 2026-08-06 con la suite en 12/12. Ver archive-report para la secuencia completa de detección/bloqueo/ratificación.
