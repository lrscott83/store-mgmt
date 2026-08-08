# Delta for e2e-network-observer-core

## ADDED Requirements

### Requirement: REQ-7 — Cualquier ampliación de ObserverSubject es estrictamente aditiva
Si el diseño de S2-01 amplía `ObserverSubject` (`network-observer-core.ts:96`, hoy `'registro' | 'login'`) para admitir el sujeto del cuarto observer, el cambio MUST ser estrictamente aditivo: los dos productores existentes del tipo (`network-observer.ts:130,138` con `'registro'`; `login-network-observer.ts:231,284` con `'login'`) MUST mantener su firma y comportamiento observable sin cambios, y los 5 specs existentes que dependen de las fixtures `auto: true` de `test.ts:63,74` MUST seguir verdes sin ninguna modificación. Si el diseño en cambio decide que el cuarto observer resuelva el diagnóstico de "backend equivocado" por su cuenta sin tocar `ObserverSubject`, este requisito no aplica.

#### Scenario: Los 5 specs existentes no ven ningún cambio de comportamiento
- GIVEN `ObserverSubject` ampliado con un tercer miembro
- WHEN se corren `register.spec.ts`, `register-rate-limit.spec.ts`, `login.spec.ts`, `login-rate-limit.spec.ts` y `login-offline.spec.ts`
- THEN los 5 pasan igual que antes de la ampliación

#### Scenario: El nuevo miembro no participa en ningún switch exhaustivo
- GIVEN el código de `network-observer-core.ts` y sus dos consumidores actuales, verificado sin ningún `switch` exhaustivo sobre `subject` (grep de `subject` en `e2e/support/`)
- WHEN se agrega el tercer miembro al union
- THEN ningún consumidor existente deja de compilar por el caso nuevo, porque ambos son productores del valor, no consumidores exhaustivos del tipo
