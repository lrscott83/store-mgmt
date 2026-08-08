# e2e-store-plan-activation-ui Capability Specification

**Capability**: e2e-store-plan-activation-ui — cobertura Playwright de negocio (browser) para [S2-01] DG-7 — el OwnerAdmin activa el plan pago una sola vez, `frontend-react/e2e/`
**Origin**: SDD change `e2e-playwright-store-plan-activation-s2-01`
**Fuente**: `docs/testing/e2e-stage-1/S2-01.md`, escenario [S2-01]; `proposal.md` §3 (Approach A)
**Status**: Active

## Purpose

Definir, como criterios de aceptación verificables, las 11 aserciones de UI de [S2-01] (`S2-01.md:53-63`), la precondición que las hace alcanzables (una tienda degradada a plan gratuito por un `PUT /v1/stores/{id}` real, porque el auto-registro nace en plan pago — H-1) y la aserción temprana de `featureIds` que evita el fallo silencioso de H-8. Esta spec describe QUÉ debe ser observable; no diseña la mecánica de Playwright (nombre exacto del helper de siembra, si `ObserverSubject` se ensancha o el cuarto observer resuelve por su cuenta, forma del page-object del picker) — eso es de `sdd-design`.

## Capability Scope

### In Scope
- Las 11 aserciones de UI de [S2-01] (`S2-01.md:53-63`).
- El helper de siembra que degrada una tienda real a plan gratuito vía `PUT /v1/stores/{id}` real, autenticado con el Bearer token de la sesión ya autenticada de la propia persona `owner-admin`.
- La lectura del catálogo real (`GET /v1/modules/ToStore`, filtrado por `priceIncluded`) para esa siembra — nunca ids hardcodeados.
- La aserción explícita y temprana de `user.featureIds ⊇ {73}` antes de ejercer el resto del escenario.
- Cero logins reales adicionales — reusa la persona `owner-admin` existente de `e2e/support/session.ts`.
- Actualización de `docs/testing/e2e-stage-1/S2-01.md` (11 casillas, estado PENDIENTE→CUBIERTO) y `docs/testing/e2e-stage-1/README.md` (fila de S2-01, totales, hallazgo H-15).

### Out of Scope
- [S2-02] (regresión DG-7 — el candado no puede volver a colgarse de `paymentStartDate`) — misma precondición, US propia.
- Arreglar **H-15** (el backend no tiene candado de dirección única para el plan, `UpdateStoreCommand.cs:69-106`) — decisión de producto, no de cobertura de tests.
- Arreglar **H-1** (el auto-registro otorga módulos pagos) — defecto de producto documentado, no de la suite.
- `plan-frontend.md` F-2..F-5.
- Los 4 tests .NET de `S2-01-backend.md` marcados cubiertos sin test — capa distinta, plan propio.
- Modificar, borrar, renombrar o skipear cualquier test existente — regla innegociable del `CLAUDE.md`.
- Cablear el nuevo observer como fixture `auto: true` en `e2e/support/test.ts` — `test.ts` no se toca, precedente de `any-request-observer.ts`.

### Supuestos operativos
Backend real en `http://localhost:5019`, perfil `http`/Development, levantado manualmente por el usuario. La persona `owner-admin` de `e2e/support/session.ts` ya existe y produce, sin ningún paso adicional, una tienda con todos los módulos disponibles activos, incluidos pagos (H-1).

## Requirements

### Requirement: REQ-1 — Plan gratuito: el botón de activar se renderiza (aserción 1)
Con una tienda cuyos módulos activos son todos `priceIncluded`, el botón `STORES.PLAN.ACTIVATE` MUST renderizarse en la pestaña no seleccionada. (`plan-picker.tsx:97-106`, `isOnPaidPlan` falso vía `store-form.tsx:83,252`)

#### Scenario: Botón visible en plan gratuito
- GIVEN una tienda degradada a plan gratuito (todos los módulos activos `priceIncluded`)
- WHEN el OwnerAdmin abre `/management/stores` y mira la pestaña de plan pago
- THEN el botón `STORES.PLAN.ACTIVATE` está presente en el DOM

### Requirement: REQ-2 — Aviso de activación pendiente al elegir sin guardar (aserción 2)
Elegir el plan pago sin guardar el formulario MUST mostrar el aviso `STORES.PLAN.WILL_ACTIVATE_ON_SAVE`. (`plan-picker.tsx:108-110`)

#### Scenario: Selección sin guardar muestra el aviso
- GIVEN la tienda en plan gratuito
- WHEN el OwnerAdmin presiona "Activar este plan" en la pestaña pago sin guardar el formulario
- THEN se muestra `STORES.PLAN.WILL_ACTIVATE_ON_SAVE`

### Requirement: REQ-3 — La badge marca el plan activo real, no el seleccionado (aserción 3)
La badge `STORES.PLAN.ACTIVE_BADGE` MUST marcar la pestaña del plan activo derivado de los módulos, no la pestaña seleccionada en curso. (`plan-picker.tsx:24-25,70,79`)

#### Scenario: La badge sigue al estado real tras elegir el otro plan
- GIVEN la tienda en plan gratuito
- WHEN el OwnerAdmin selecciona la pestaña de plan pago sin guardar
- THEN `STORES.PLAN.ACTIVE_BADGE` permanece en la pestaña gratuita

### Requirement: REQ-4 — Guardar emite PUT con moduleIds = todos los módulos (aserción 4)
Guardar con el plan pago elegido MUST emitir `PUT /v1/stores/{id}` con `moduleIds` conteniendo TODOS los módulos (gratis + pagos), no solo los pagos. (`plan-picker.tsx:26-27,49` vía `getPlanModuleIds`; `edit-store.tsx:122,129`)

#### Scenario: El body del PUT contiene todos los ids
- GIVEN la tienda en plan gratuito con el plan pago seleccionado en el formulario
- WHEN el OwnerAdmin guarda
- THEN el `PUT /v1/stores/{id}` observado lleva `moduleIds` con la unión completa de módulos gratis y pagos del catálogo

### Requirement: REQ-5 — Refresco de sesión y navegación sin recarga (aserción 5)
Tras guardar, la app MUST refrescar la sesión emitiendo `GET /v1/auth/me` y MUST navegar a `/management/stores` sin recargar la página (sin `location.reload()`). (`edit-store.tsx:132-139`)

#### Scenario: Sesión refrescada y navegación sin reload
- GIVEN el guardado de REQ-4 ya emitido
- WHEN la respuesta del `PUT` llega exitosa
- THEN se observa `GET /v1/auth/me` inmediatamente después
- AND el navegador termina en `/management/stores` sin ningún evento de recarga de página completa

### Requirement: REQ-6 — Plan pago: el botón no existe en el DOM (aserción 6)
Con al menos un módulo pago activo, el botón `STORES.PLAN.ACTIVATE` MUST NOT existir en el DOM para un OwnerAdmin, en ninguna pestaña. (`plan-picker.tsx:100`)

#### Scenario: Botón ausente en plan pago
- GIVEN una tienda con al menos un módulo pago activo (`priceIncluded: false`)
- WHEN el OwnerAdmin abre `/management/stores`
- THEN el botón `STORES.PLAN.ACTIVATE` no existe en el DOM, en ninguna pestaña

### Requirement: REQ-7 — Plan pago: las tabs son clickeables pero no cambian la selección (aserción 7)
Con la tienda ya en plan pago, las pestañas MUST seguir siendo clickeables mostrando cada panel, y ningún click MUST disparar `onChange` (que muta `moduleIds` en el formulario padre). (`plan-picker.tsx:47-50,67,76,101`)

#### Scenario: Click en las tabs no muta moduleIds
- GIVEN una tienda ya en plan pago
- WHEN el OwnerAdmin hace click en ambas pestañas alternadamente
- THEN el panel visible cambia con cada click
- AND ningún click dispara el `onChange` que muta `moduleIds`

### Requirement: REQ-8 — paymentStartDate no se renderiza para OwnerAdmin (aserción 8)
El campo `paymentStartDate` MUST NOT renderizarse cuando el usuario es OwnerAdmin — solo aparece con `isSuperAdmin && isEditMode`. (`store-form.tsx:217`)

#### Scenario: El campo de fecha de pago está ausente
- GIVEN un OwnerAdmin en modo edición de su tienda
- WHEN se renderiza el formulario
- THEN el input `#store-payment-start` no existe en el DOM

### Requirement: REQ-9 — isActive no se renderiza para OwnerAdmin (aserción 9)
El campo `isActive` MUST NOT renderizarse cuando el usuario es OwnerAdmin — solo aparece con `isSuperAdmin`. (`store-form.tsx:234`)

#### Scenario: El checkbox de estado activo está ausente
- GIVEN un OwnerAdmin en modo edición de su tienda
- WHEN se renderiza el formulario
- THEN el checkbox `#store-is-active` no existe en el DOM

### Requirement: REQ-10 — Selector de dueño visible pero deshabilitado en modo edición (aserción 10)
El selector de dueño MUST renderizarse — gateado por `isAdminUser = isSuperAdmin || isOwnerAdmin` — y MUST estar deshabilitado en modo edición. (`store-form.tsx:69,179,188`)

#### Scenario: El selector de dueño está visible pero deshabilitado
- GIVEN un OwnerAdmin en modo edición de su tienda
- WHEN se renderiza el formulario
- THEN el `select#store-owner` está presente en el DOM
- AND está deshabilitado (`disabled`)

### Requirement: REQ-11 — Fallo de carga muestra STORES.ERROR y no monta el formulario (aserción 11)
Un fallo al cargar tienda, módulos o dueños MUST mostrar el texto `STORES.ERROR` y MUST NOT montar `<StoreForm>`. (`edit-store.tsx:55-58,158-164`)

#### Scenario: Fallo en cualquiera de los tres GET bloquea el formulario
- GIVEN una de las tres peticiones del `Promise.all` (tienda, módulos, dueños) falla o responde no exitosa
- WHEN se carga `/management/stores`
- THEN se muestra el texto `STORES.ERROR`
- AND ningún elemento del formulario (`#store-name`, etc.) se monta en el DOM

### Requirement: REQ-12 — Precondición sembrada por PUT real, ids leídos del catálogo real
El helper de siembra MUST degradar una tienda real a plan gratuito emitiendo un `PUT /v1/stores/{id}` real con `moduleIds` limitado a los módulos `priceIncluded` del catálogo, obtenidos en vivo de `GET /v1/modules/ToStore`. Los ids MUST NOT hardcodearse en el test. (`UpdateStoreCommand.cs:71-72,96-97,108-131` — sin guard que impida bajar de pago a gratis)

#### Scenario: La siembra usa el catálogo real, no una lista fija
- GIVEN una sesión de OwnerAdmin autenticada con su propio Bearer token
- WHEN se pide degradar la tienda a plan gratuito
- THEN se emite `GET /v1/modules/ToStore` y se filtra por `priceIncluded`
- AND el `PUT /v1/stores/{id}` posterior lleva exactamente esos ids, sin ningún valor escrito a mano en el test

### Requirement: REQ-13 — Aserción temprana y ruidosa de featureIds (Stores=73)
Antes de ejercer cualquier otra aserción del escenario, el test MUST afirmar explícitamente que `user.featureIds` contiene `73` (feature `Stores`), con un mensaje de fallo que nombre el módulo `Management`, la feature `Stores=73` y H-7/H-8. (`StoreRoleFeatures.cs:192-195`, `loaders.ts:16-19,107-113`)

#### Scenario: featureIds se verifica antes de continuar
- GIVEN la tienda ya degradada a plan gratuito (REQ-12)
- WHEN se resuelve la sesión del OwnerAdmin
- THEN `user.featureIds` se afirma explícitamente conteniendo `73`, con un mensaje diagnosticable
- AND si esa aserción falla, el mensaje identifica H-7/H-8 en vez de dejar que el test falle por un logout silencioso indistinguible

### Requirement: REQ-14 — Cero logins reales adicionales
El escenario completo MUST reusar la persona `owner-admin` ya existente en `e2e/support/session.ts` y MUST NOT autenticar ninguna persona nueva. (Propuesta §3; presupuesto de 4 logins reales por corrida contra el techo de 5/min)

#### Scenario: El presupuesto de login no crece
- GIVEN la corrida completa de este spec
- WHEN se audita el conteo de `POST /v1/auth/login` reales atribuibles a este spec
- THEN el conteo es cero

### Requirement: REQ-15 — Ningún test existente se modifica
Este cambio MUST NOT modificar, borrar, renombrar ni skipear ningún fichero `*.spec.ts` existente, ni `e2e/support/test.ts` más allá de lo estrictamente aditivo. (`CLAUDE.md`, regla innegociable)

#### Scenario: git diff de los specs existentes está vacío
- GIVEN el cambio completo aplicado
- WHEN se corre `git diff` sobre los 5 `*.spec.ts` existentes
- THEN el diff es vacío para los 5

### Requirement: REQ-16 — Catálogo de documentación actualizado
`docs/testing/e2e-stage-1/S2-01.md` MUST marcar las 11 casillas de aserciones de UI y MUST actualizar el estado de "E2E frontend (Playwright)" de PENDIENTE a CUBIERTO. `docs/testing/e2e-stage-1/README.md` MUST actualizar la fila de S2-01, los totales, y MUST agregar el hallazgo **H-15** (el backend no tiene candado de dirección única para el plan).

#### Scenario: Los documentos reflejan el estado final
- GIVEN los 11 requisitos de aserciones de UI (REQ-1..REQ-11) verificados en vivo
- WHEN se actualiza la documentación
- THEN `S2-01.md` marca las 11 casillas y su estado pasa a CUBIERTO
- AND `README.md` refleja la nueva fila, los totales, y H-15

## Verification Criteria
- [ ] REQ-1..REQ-11 corren en la corrida por defecto (`pnpm test:e2e`) contra backend real
- [ ] REQ-12 verificado: cero ids de módulo hardcodeados en el helper de siembra
- [ ] REQ-13 verificado: el mensaje de fallo de featureIds es explícito y nombra H-7/H-8
- [ ] REQ-14 verificado: conteo de logins reales atribuibles a este spec = 0
- [ ] REQ-15 verificado: `git diff` vacío para los 5 `*.spec.ts` existentes y `e2e/support/test.ts` sin cambios no-aditivos
- [ ] REQ-16 verificado por lectura de `S2-01.md` y `README.md` tras la actualización
