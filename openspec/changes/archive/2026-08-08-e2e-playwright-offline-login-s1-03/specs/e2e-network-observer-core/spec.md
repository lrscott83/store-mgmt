# e2e-network-observer-core Capability Specification

**Capability**: e2e-network-observer-core — núcleo compartido de observers de red, `frontend-react/e2e/support/network-observer.ts`, `login-network-observer.ts`, `any-request-observer.ts` (nombre a fijar en design)
**Origin**: SDD change `e2e-playwright-offline-login-s1-03`
**Fuente**: Proposal §"El refactor del núcleo compartido", `login-network-observer.ts:129-134`
**Status**: Draft — nueva capability, sin spec previo

## Purpose

Definir el contrato verificable del refactor que paga la deuda declarada en `login-network-observer.ts:129-134` ("extract a shared core when a THIRD observer appears") cuando aparece el tercer observer que necesita [S1-03]. Esta spec describe QUÉ garantías de compatibilidad debe sostener el refactor; no diseña la mecánica interna del núcleo compartido (nombre de módulo, forma exacta de la función parametrizada) — eso es de `sdd-design`.

## Capability Scope

### In Scope
- La garantía de compatibilidad byte-a-byte de las superficies públicas de `network-observer.ts` y `login-network-observer.ts` tras el refactor.
- El nuevo observer genérico "cero peticiones a CUALQUIER endpoint", consumido por REQ-1 de `e2e-offline-login-ui`.
- Que `RegisterRateLimitError` y `LoginRateLimitError` permanecen clases distintas con sus umbrales propios.
- Que los 5 call sites verificados en la propuesta (`test.ts`, `register-rate-limit.spec.ts`, `login-rate-limit.spec.ts`, `register.spec.ts`, `login.spec.ts`) no requieren ningún cambio.

### Out of Scope
- Unificar `RegisterRateLimitError` y `LoginRateLimitError` en una sola clase — prohibido por la trampa ya documentada en `login-network-observer.ts:22-26`.
- Cualquier edición a un `*.spec.ts` existente.
- El contrato de las 12 aserciones de negocio de [S1-03] — capacidad `e2e-offline-login-ui`.

### Supuestos operativos
El refactor se valida corriendo la suite existente antes y después del cambio, contra el mismo backend real que el resto de la Etapa 1.

## Requirements

### Requirement: REQ-1 — API pública de network-observer.ts preservada byte-a-byte
Tras el refactor, `network-observer.ts` MUST seguir exportando `installRegisterNetworkObserver`, `RegisterNetworkObserver`, `RegisterAttempt`, `RegisterResponseCapture` y `RegisterRateLimitError` con la misma firma y el mismo comportamiento observable (mensajes de error incluidos). (`network-observer.ts:6,28,34,99`)

#### Scenario: register.spec.ts y register-rate-limit.spec.ts no cambian
- GIVEN el refactor ya aplicado
- WHEN se corre `register.spec.ts` y `register-rate-limit.spec.ts` sin ninguna modificación a esos ficheros
- THEN ambos pasan igual que antes del refactor

### Requirement: REQ-2 — API pública de login-network-observer.ts preservada byte-a-byte
Tras el refactor, `login-network-observer.ts` MUST seguir exportando `installLoginNetworkObserver`, `LoginNetworkObserver` (con sus 7 métodos: `waitForLoginRequest`, `waitForMeRequest`, `waitForLoginResponse`, `expectLoginThenMe`, `expectNoLoginAttempt`, `expectNoProductApiCall`, `expectMeRequestCount`) y `LoginRateLimitError`, con la misma firma y comportamiento observable. (`login-network-observer.ts:27,55,147`)

#### Scenario: login.spec.ts y login-rate-limit.spec.ts no cambian
- GIVEN el refactor ya aplicado
- WHEN se corre `login.spec.ts` y `login-rate-limit.spec.ts` sin ninguna modificación a esos ficheros
- THEN ambos pasan igual que antes del refactor

### Requirement: REQ-3 — Núcleo compartido extrae solo lo genuinamente idéntico
El núcleo compartido MUST mover únicamente la lógica idéntica entre los dos observers existentes: la cola `Outcome`/`pushOutcome` de entrega-a-un-solo-consumidor, `createDeferred`, el matcher de sufijo de pathname, el guard de backend equivocado, y los diagnósticos 404/`requestfailed`. `wrongBackendMessage` MUST parametrizarse por un sustantivo sin cambiar el texto resultante para ninguno de los dos observers existentes. (`network-observer.ts:87-97,119-126`; `login-network-observer.ts:129-134,136-145,166-173`)

#### Scenario: Los mensajes de error siguen siendo el mismo string
- GIVEN un registro y un login que salen al backend equivocado
- WHEN se dispara `wrongBackendMessage` desde cada observer
- THEN cada uno produce el mismo texto que producía antes del refactor, solo con "de registro"/"de login" según corresponda

### Requirement: REQ-4 — Las dos clases de error de rate-limit permanecen separadas
`RegisterRateLimitError` (10/10min) y `LoginRateLimitError` (5/1min) MUST NOT unificarse en una sola clase ni compartir umbral. (`login-network-observer.ts:22-26`)

#### Scenario: Los umbrales no se mezclan
- GIVEN el núcleo compartido ya extraído
- WHEN se dispara un 429 en register o en login
- THEN cada uno lanza su propia clase de error con su propio umbral documentado en el mensaje

### Requirement: REQ-5 — Observer genérico de cero peticiones a cualquier endpoint
El sistema MUST proveer un tercer observer que asevere cero peticiones HTTP a CUALQUIER endpoint durante una ventana dada, para satisfacer REQ-1 de `e2e-offline-login-ui` (que no está acotado a login/me/product como los dos observers existentes).

#### Scenario: Ninguna petición de ningún tipo escapa al observer
- GIVEN el observer genérico instalado en una página
- WHEN se ejecuta un submit offline exitoso
- THEN el observer confirma cero peticiones observadas de cualquier método y a cualquier endpoint

### Requirement: REQ-6 — Ningún archivo `*.spec.ts` existente cambia una línea
El refactor MUST NOT requerir ninguna modificación a `register.spec.ts`, `register-rate-limit.spec.ts`, `login.spec.ts`, `login-rate-limit.spec.ts`, ni a `e2e/support/test.ts` más allá de lo estrictamente aditivo. (Verificado: los 5 call sites de la propuesta solo consumen las fixtures `registerNetwork`/`loginNetwork` o las clases de error re-exportadas por el mismo módulo)

#### Scenario: git diff de los specs existentes está vacío
- GIVEN el refactor completo aplicado y commiteado
- WHEN se corre `git diff` sobre los 4 spec files y `support/test.ts`
- THEN el diff de los 4 spec files es vacío y `support/test.ts` solo muestra cambios aditivos, si los hay

## Verification Criteria
- [ ] REQ-1, REQ-2 verificados: `pnpm test:e2e` (31 tests) y `pnpm test:e2e:rate-limit` (2 tests) verdes antes y después del refactor
- [ ] REQ-3, REQ-4 verificados por lectura del diff del núcleo compartido
- [ ] REQ-5 consumido por `e2e-offline-login-ui` REQ-1
- [ ] REQ-6 verificado: `git diff` vacío para los 4 `*.spec.ts` existentes
