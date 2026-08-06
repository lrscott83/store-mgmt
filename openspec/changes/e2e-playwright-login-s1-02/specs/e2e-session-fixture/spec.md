# e2e-session-fixture Capability Specification

**Capability**: e2e-session-fixture — contrato de la fixture `signedInPage`, `frontend-react/e2e/support/test.ts`
**Origin**: SDD change `e2e-playwright-login-s1-02`
**Fuente**: Propuesta §4 ("El contrato de `signedInPage`"), `frontend-react/e2e/support/test.ts:10-13`
**Status**: Draft

## Purpose

Definir el contrato verificable de la fixture `signedInPage`: qué entrega, cómo llega ahí, y sus invariantes de costo y estado. Diez escenarios posteriores de la Etapa 1 dependen de este contrato sin tener que reabrir el spec de login. Esta spec describe QUÉ debe garantizar la fixture; no diseña su mecánica interna (`storageState`, modo `serial`) — eso es de `sdd-design`.

## Capability Scope

### In Scope
- El contrato de entrega de `signedInPage`: page autenticado + identidad + `selectedStoreId`.
- El camino de autenticación: registro + login reales, identidad única, sin invención de tokens.
- El estado inicial garantizado: tienda sin categorías ni productos.
- La invariante de "sin roster".
- Que la fixture es opt-in (sin `auto: true`).
- La obligación de contemplar reutilización de sesión para abaratar el costo agregado de la Etapa 1.

### Out of Scope
- Las 14 aserciones de S1-02 en sí — capacidad `e2e-login-ui`.
- Mecánica exacta de `storageState` / modo `serial` — `sdd-design` (responde Q1).
- Cualquier edición no aditiva a `support/test.ts` o `support/network-observer.ts`.
- El observador de red de login (`login-network-observer.ts`) — soporte del spec de login, no de esta fixture.

### Supuestos operativos
La fixture corre contra el mismo backend real que el resto de la suite; no hay modo mock.

## Requirements

### Requirement: REQ-1 — Entrega page autenticado con identidad direccionable
`signedInPage` MUST entregar un `page` ya autenticado como OwnerAdmin recién creado, junto con la identidad de esa cuenta y su `selectedStoreId`, de modo que el test consumidor pueda direccionar su propio dato. (Propuesta §4, cláusula "Qué entrega")

#### Scenario: El consumidor puede identificar su propia tienda
- GIVEN un test que usa la fixture `signedInPage`
- WHEN la fixture se resuelve
- THEN el test recibe un `page` autenticado, la identidad de la cuenta y su `selectedStoreId`

### Requirement: REQ-2 — Autenticación por el camino real, sin tokens inventados
La fixture MUST autenticar registrando e iniciando sesión por el camino real de la UI, con identidad única por uso (`newTestIdentity()`), contra el backend real. MUST NOT escribir `AUTH_MODEL` ni ningún token directamente en `localStorage`. (Propuesta §4, cláusula "Cómo llega ahí")

#### Scenario: La sesión se obtiene vía registro + login reales
- GIVEN una nueva invocación de la fixture
- WHEN se resuelve
- THEN se observa al menos un registro y un login reales contra el backend con una identidad nunca usada antes
- AND ningún token se escribe directamente en `localStorage`

### Requirement: REQ-3 — Estado inicial sin categorías ni productos
La cuenta que entrega la fixture MUST partir sin categorías ni productos, de modo que `resolveUserHomePath` resuelva `/sales/products` de forma determinista. La siembra posterior de datos MUST ser opt-in del test consumidor, nunca implícita de la fixture. (Propuesta §4, cláusula "Estado inicial garantizado")

#### Scenario: El estado recién entregado resuelve a /sales/products
- GIVEN una sesión recién entregada por `signedInPage` sin siembra adicional
- WHEN el test consulta o navega al home resuelto
- THEN el destino determinista es `/sales/products`

### Requirement: REQ-4 — Nunca aprovisiona roster
La fixture MUST NOT aprovisionar un roster en ningún momento; `isRosterProvisioned()` MUST permanecer falso tras su resolución. (Propuesta §4, cláusula "Sin roster")

#### Scenario: isRosterProvisioned queda falso
- GIVEN una sesión entregada por `signedInPage`
- WHEN se consulta `isRosterProvisioned()` en ese dispositivo
- THEN el resultado es falso

### Requirement: REQ-5 — Opt-in, sin auto:true
`signedInPage` MUST NOT declararse con `auto: true`; un test MUST solicitarla explícitamente para pagar su costo. (Propuesta §4, cláusula "Opt-in, no auto")

#### Scenario: Un test que no la usa no paga su costo
- GIVEN un spec que no incluye `signedInPage` en su lista de fixtures
- WHEN ese spec corre
- THEN no se dispara ningún registro ni login atribuible a esta fixture

### Requirement: REQ-6 — Costo amortizable vía reutilización de sesión
El diseño de la fixture MUST contemplar reutilización de sesión (p. ej. `storageState`) para los tests consumidores que no necesiten observar un envío de credenciales en vivo, de modo que la Etapa 1 completa no dependa de un login real por cada uno de los diez escenarios que la consumen. (Propuesta §4, cláusula "Costo amortizable"; §6 R2)

#### Scenario: Un consumidor que no observa el envío en vivo reutiliza sesión
- GIVEN dos tests consumidores de `signedInPage` donde ninguno necesita observar el `POST /v1/auth/login` en vivo
- WHEN ambos corren en la misma ejecución de la suite
- THEN el número de logins reales atribuibles a `signedInPage` es menor al número de tests consumidores

## Verification Criteria
- [ ] `signedInPage` existe en `support/test.ts` y cumple REQ-1..REQ-6
- [ ] La costura declarada en `support/test.ts:10-13` queda resuelta (comentario original reemplazado o confirmado, no solo dejado como TODO)
- [ ] `registerNetwork` conserva `auto: true` y su comportamiento exacto (no roto por esta fixture)
- [ ] `register.spec.ts` sigue verde tras la adición
