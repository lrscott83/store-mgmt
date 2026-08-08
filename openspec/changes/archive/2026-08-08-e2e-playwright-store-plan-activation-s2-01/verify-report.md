# Verification Report — `e2e-playwright-store-plan-activation-s2-01`

**Change**: cobertura Playwright S2-01 (DG-7, activación de plan pago). **Modo**: hybrid (engram + este fichero). **Rama**: `feat/e2e-playwright-store-plan-activation-s2-01`, 8 commits sobre `main`, working tree limpio.

**Veredicto final: PASS WITH WARNINGS** (0 CRITICAL, 2 WARNING, 2 SUGGESTION). Ningún hallazgo bloquea el archive, pero 10 de las 11 aserciones de UI permanecen sin correr contra backend real — el bloqueador para "cerrar" S2-01 con confianza total es de infraestructura, no de esta verificación.

---

## 1. Frontera de autorización — sostenida

`git diff --name-status main..HEAD` no contiene ni una aparición de `register.spec.ts`, `register-rate-limit.spec.ts`, `login.spec.ts`, `login-rate-limit.spec.ts`, `login-offline.spec.ts`, `e2e/support/test.ts` ni `e2e/support/session.ts`. Verificado además con diff directo sobre esos siete ficheros: **0 líneas**.

REQ-15 verificado mecánicamente, no asumido. `store-plan-activation.spec.ts` es fichero nuevo (`A`), y agregar tests nuevos está permitido.

## 2. `network-observer-core.ts` — aditivo confirmado

`git diff main..HEAD` sobre ese fichero muestra **una sola línea modificada**:

```diff
-export type ObserverSubject = 'registro' | 'login';
+export type ObserverSubject = 'registro' | 'login' | 'tienda';
```

Nada más cambia (`network-observer-core.ts:96`). Los cuatro mensajes (`wrongBackendMessage`, `backendUnreachableMessage`, `apiBaseMissingMessage`, `expectNoAttemptMessage`) quedan textualmente intactos, incluido el typo `Parná`. Un `grep` de `subject` confirma cero `switch` o `Record<ObserverSubject,…>` exhaustivo: los tres productores solo escriben el literal, nunca lo consumen exhaustivamente. REQ-7 del delta cumplido.

`auth-storage.ts`: **una sola función agregada**, `readBearerToken(page)`, cero modificación de `mutateBearerToken` ni de ningún export existente.

`pnpm exec playwright test --list --grep-invert @rate-limit` → **`Total: 44 tests in 6 files`** (corrida real). Confirma mecánicamente que los 42 preexistentes se descubren sin error, que los 2 nuevos aparecen, y que el ensanche no rompió la recolección de ningún spec. **No** verifica que los 5 specs existentes sigan pasando en ejecución — eso exige backend.

## 3. Las 11 aserciones — mapeo aserción → test → `expect`

`test()` #1 ("OwnerAdmin activa el plan pago una sola vez", `store-plan-activation.spec.ts:34-161`) recorre 10 aserciones más la guarda REQ-13; `test()` #2 (`:183-191`) aísla la aserción 11.

| Aserción | Línea | `expect` que la cubre | ¿Genuina? |
|---|---|---|---|
| REQ-13 guarda `featureIds` | `:41` | `assertStoresFeature(page)` lanza si falta 73 (`store-fixture.ts:213-221`) | Sí — mensaje cita H-7/H-8 |
| 1 | `:61-63` | `expect(activateButton).toBeVisible()` | Sí |
| 2 | `:70-71` | `WILL_ACTIVATE_TEXT` visible | Sí |
| 3 | `:76-77` | badge visible en `freeTab` + `toHaveCount(0)` en `paidTab` | Sí — positivo y negativo |
| 8 | `:81` | `#store-payment-start` `toHaveCount(0)` | Sí |
| 9 | `:85` | `#store-is-active` `toHaveCount(0)` | Sí |
| 10 (corregida por H-16) | `:97` | `#store-owner` `toHaveCount(0)` | Sí |
| 4 | `:108-114` | `putCapture.moduleIds` ordenado === `allIds` ordenado | Sí |
| 5 | `:123-125` | `expectPutThenMe()` + `expectNoDocumentSince()` + `expectMeRequestCount(1)` | Sí — ver §3.1 |
| 6 | `:137-141` | botón ausente en ambas pestañas, tras click explícito a cada una | Sí |
| 7 | `:148-160` | `aria-selected`, ausencia de `SELECTED`/`ACTIVATE`/`WILL_ACTIVATE`, badge en la pestaña correcta, reaparición de `SELECTED` al volver | Sí — 6 `expect` independientes |
| 11 | `:189-190` | `getByRole('alert')` con texto + `#store-name` `toHaveCount(0)` | Sí, cubre el `.catch()` — ver G1 |

### 3.1 Los helpers del observer no son vacuos

Leído `store-network-observer.ts` completo: `expectPutThenMe()` (`:180-209`) lanza si `putRequests_.length !== 1`, si `putResponses.length !== 1`, si `meRequests.length === 0`, y si `firstMeRequest.at < putResponse.at` — las cuatro condiciones fallarían si el comportamiento real se rompiera. `expectNoDocumentSince()` (`:225-235`) compara un contador real de `resourceType()==='document'` contra un baseline: no asume, mide.

### 3.2 Riesgo de orden dentro de `test()` #1

`tasks.md` §0 decide explícitamente un solo `test()` continuo para las 10 aserciones porque partirlo en 3 exigiría un helper "elevar a pago" fuera del contrato del design. Consecuencia mecánica inevitable: si una aserción temprana falla o es flaky, las posteriores del mismo test nunca corren — Playwright reporta un fallo, no diez. Revisado el orden interno contra el diagrama del design (`restaurar → degradar → goto → 1,2,3,8,9,10 → guardar → 4,5 → recarga → 6,7`): el spec lo sigue exactamente, **no hay una aserción posterior escondida detrás de una anterior por un reordenamiento accidental**. El riesgo es inherente al diseño de un test único, ya declarado y aceptado. Queda como WARNING-1.

## 4. Precondición pineada — confirmado en código

`degradeStoreToFreePlan` (`store-fixture.ts:119-183`) ejecuta los 4 pasos: `GET /v1/modules/ToStore` → `GET /v1/stores/{id}` → `PUT` con `moduleIds: freeIds` → **re-`GET /v1/stores/{id}`** (`:153`), que compara `observedIds` contra `expectedIds` ordenados y **lanza Error nombrando el storeId y las dos listas si no coinciden** (`:160-166`), más otro Error si `paymentStartDate` volvió `null` (`:167-174`). Mismo patrón que `roster-fixture.ts:298-326` de S1-03. No es asumir que quedó gratis: es un pin verificado.

`assertStoresFeature` (`:194-222`) corre **antes** de cualquier otra acción (`store-plan-activation.spec.ts:41`, previo a la degradación), lee `localStorage.currentUser` y lanza un Error legible nombrando el módulo `Management`, la feature `Stores=73` y H-7/H-8 si falta. El guard contra el logout silencioso de H-8 existe y corre temprano.

## 5. Ids de módulo libres — no hardcodeados

`readModuleCatalog` (`store-fixture.ts:84-105`) obtiene `GET /v1/modules/ToStore` y filtra por `priceIncluded` para `freeIds`, su negación para `paidIds`, y `.map(m => m.id)` para `allIds`. Ningún literal numérico de módulo en el fichero salvo `STORES_FEATURE_ID = 73` (`:48`), que es un **feature id**, no un module id, correctamente citado contra `StoreRoleFeatures.cs:192-195` y `domain/enums/index.ts:32`.

## 6. G1 y G2 — declaradas, no cerradas silenciosamente

**G1** (`store-plan-activation.spec.ts:177-181`, `S2-01.md:63`, `README.md:39,88`): confirmado leyendo `edit-store.tsx` completo — el `route.abort()` sobre `GET /v1/modules/ToStore` dispara `requestfailed`, la promesa del `Promise.all` rechaza y cae en el `.catch()` de `edit-store.tsx:80-82`. **Nunca** evalúa la rama `!storeRes.succeeded || …` de `:55-58`, que exige una respuesta HTTP 200 con `succeeded: false` — imposible con `abort()` sin fabricar un body, o sea un mock real, rechazado en el design. G1 sigue genuinamente abierta, documentada en 3 lugares consistentes.

**G2** (`store-plan-activation.spec.ts:48-51`): confirmado — entre la degradación (`:52`) y el click de guardado (`:106`) el spec no invoca ningún `/me`; el primero llega recién en `:116`, después del PUT. La supervivencia de `Stores=73` tras la degradación queda genuinamente sin observar.

## 7. Verdad de la documentación

- `S2-01.md`: cabecera `CUBIERTO` (`:10`), las 11 casillas en `[x]` (`:53-63`), la aserción 10 reescrita con la forma corregida por H-16 (`:62`), G1 anotada junto a la aserción 11 (`:63`).
- `docs/testing/e2e-stage-1/README.md`: fila S2-01 `CUBIERTO` (`:39`), totales `3 CUBIERTO · 2 PARCIAL · 7 PENDIENTE · 1 N/A` (`:68`) — recontadas las 13 filas, cuadra exacto. El párrafo "Playwright hoy" (`:88`) declara **explícitamente** que el 44 es aritmética confirmada por `--list` y **no** una corrida observada. H-15 (`:300-306`) y H-16 (`:308-324`) presentes, con la cadena de evidencia re-verificada contra `edit-store.tsx:37`, `authorization-service.ts`, `StoreRoleFeatures.cs`, `AllowedFeaturesService.cs:41-47`.
- `frontend-react/e2e/README.md`: nueva sección de la suite de activación de plan — cita el costo real de siembra (4 peticiones), advierte que este spec **sí** necesita backend real a diferencia de `login-offline.spec.ts`, y documenta la ausencia de teardown.
- Todas las citas `archivo:línea` re-verificadas por lectura directa: `edit-store.tsx:37,49-58,80-82,122,129,132-139,158-164`; `store-form.tsx:69,83,179,188,217,234,252`; `plan-picker.tsx:24-25,26-27,47-50,67,70,76,79,97-106,100,101,108-110`. **Ninguna discrepancia.**

## 8. Gates ejecutados — evidencia real

```
$ npx turbo run test --force
→ Test Files 179 passed (179) · Tests 2392 passed (2392) · Type Errors: no errors

$ pnpm exec playwright test --list --grep-invert @rate-limit
→ Total: 44 tests in 6 files

$ npx tsc --noEmit --strict ... e2e/store-plan-activation.spec.ts e2e/support/store-fixture.ts \
    e2e/support/store-network-observer.ts e2e/support/network-observer-core.ts e2e/support/auth-storage.ts
→ exit code 0, cero errores

$ git diff main..HEAD -- (los 5 specs existentes) e2e/support/test.ts e2e/support/session.ts
→ 0 líneas
```

**Confirmado independientemente**: `pnpm-workspace.yaml` solo declara `apps/*` y `packages/*` — `e2e/` no es un package del workspace, así que `pnpm typecheck`/`pnpm lint` (que delegan a `turbo run` sobre packages) **nunca tocan `e2e/`**. No existe `e2e/tsconfig.json` ni referencia a `e2e` en ningún `eslint.config.*`. El gate nombrado por varias unidades de `tasks.md` es, en efecto, un **no-op** para los ficheros de este cambio. La capa E2E no tiene NINGÚN gate de tipos automatizado en el pipeline estándar; el `tsc --noEmit` ad-hoc de arriba es evidencia genuina pero no está cableado a ningún script del repo.

## 9. Lo que permanece explícitamente SIN VERIFICAR

⚠️ **NO VERIFICADO — requiere backend real, diferido al usuario**:

- Que las 11 aserciones de `store-plan-activation.spec.ts` pasen en ejecución real.
- Que los 42 tests preexistentes sigan pasando en ejecución tras el ensanche de `ObserverSubject`.
- Que el `PUT`/`GET` de siembra emitido por `page.request` con el header `Authorization` armado a mano sea aceptado por el backend (riesgo R4 del design, sin resolver).
- Que `Stores=73` sobreviva a la degradación (G2, no observable con el diseño actual).

Nunca se afirma acá que alguno de estos pasó. Cada mención de "44", "11 aserciones" o "genuina" se apoya en lectura de código o en una de las tres corridas reales pegadas arriba.

---

## Hallazgos

### WARNING-1 — Riesgo estructural de orden en `test()` #1

Un solo `test()` con 10 aserciones significa que un fallo temprano oculta el resultado de las posteriores en esa corrida. Es una decisión mecánica explícita de `tasks.md` §0, justificada, y el spec sigue el orden del diagrama sin desviación. No bloquea el archive — queda anotado para que quien lea un fallo futuro entienda por qué un solo `expect` roto se lee como "el resto no corrió" y no como "el resto falló".

`frontend-react/e2e/store-plan-activation.spec.ts:34-161`, `tasks.md:10-17`.

### WARNING-2 — El gate de tipos nombrado en `tasks.md` es un no-op real para `e2e/`

Confirmado independientemente (§8). No es un defecto de esta implementación: es una debilidad estructural preexistente que este cambio hereda, y que el `tsc --noEmit` ad-hoc solo mitiga puntualmente sin quedar cableado a ningún script repetible. Recomendación no bloqueante: un `e2e/tsconfig.json` propio referenciado desde un script `typecheck:e2e`, fuera del alcance de este cambio.

`frontend-react/pnpm-workspace.yaml:1-2`, `frontend-react/package.json:8-9`.

### SUGGESTION-1 — El comentario "quoted verbatim by e2e/README.md" era inexacto

`network-observer-core.ts:114` afirmaba que el typo `Parná` está citado literalmente por `e2e/README.md`. No lo está: el README parafrasea el mensaje (`e2e/README.md:69,99`) y elide la cláusula donde vive el typo. La línea **no formaba parte del diff** de este cambio, así que era una inexactitud heredada de la extracción del núcleo en S1-03, no introducida por S2-01.

**Estado**: CERRADO. El comentario se reescribió para decir la razón verdadera por la que el typo se preserva — la extracción del núcleo era contractualmente byte-a-byte, y cambiar copy visible dentro de un refactor es cómo un refactor "puro" deja de serlo — en vez de apoyarse en una cita que no existe.

### SUGGESTION-2 — R4 del design sigue `⚠️ NO VERIFICADO`

El header Bearer armado a mano vía `page.request` sigue sin validarse contra un backend real, porque ningún gate con backend corrió ni en apply ni en verify. No es nuevo; solo se re-confirma que persiste.

`design.md:199`, `store-fixture.ts:61-64,86-88,127-139`.

---

## Trazabilidad requisito → evidencia

REQ-1..REQ-11: §3. REQ-12: §5. REQ-13: §4. REQ-14: verificado por lectura — cero `login()`/`restore()` de otra persona en el spec, solo `test.use({ persona: 'owner-admin' })`. REQ-15: §1 y §8. REQ-16: §7. `e2e-network-observer-core` REQ-7: §2.

Las 7 unidades de trabajo están marcadas en `tasks.md` y cada commit existe en el log de la rama, con IDs que coinciden 1:1 con las unidades. El checkpoint de regresión de los 44 en ejecución real queda para el usuario.
