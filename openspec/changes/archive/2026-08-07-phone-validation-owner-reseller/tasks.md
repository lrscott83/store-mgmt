# Tasks: phone-validation-owner-reseller

**Rama**: nueva desde `main` (rama actual, `git branch --show-current` = `main`), p.ej.
`feat/phone-validation-owner-reseller`.
**Entrega**: commits-only por work unit, conventional commits, **sin PR**.
**TDD estricto activo**: cada GREEN empieza en rojo. Runner: `npx turbo run test --force`
(obligatorio para cualquier evidencia citada — turbo replaya corridas cacheadas).
**Innegociable**: cero diff en `frontend-react/e2e/`; verificado al cierre (Fase 7).

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~410 (~115 prod / ~295 tests) — verificado por muestreo de línea contra el código real (ver notas abajo) |
| 400-line budget risk | High |
| Chained PRs recommended | No — no hay PR; entrega es commits-only en una rama |
| Suggested split | 6 commits por work unit (WU1-WU6), en orden |
| Delivery strategy | commits-only, no PR (instrucción explícita) |
| Chain strategy | pending — no aplica (no hay flujo de PR) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High

**Nota de verificación propia**: confirmé por lectura directa que `owner-create.test.tsx:350-371`
(bloque de formato, 22 líneas), `owner-edit.test.tsx:475-498`, y el bloque `reseller-create.test.tsx:202-233`
(32 líneas) existen tal como cita `design.md`. También confirmé que `edit-profile-form.test.tsx:70-101`
llama a `<EditProfileForm>` **sin** `phoneRequired` — con default `true` esos tests quedan verdes
**sin tocarlos**; solo se agregan tests nuevos ahí. Esto corrige el conteo a **5 tests que cambian**
(4 de formato + `user-details-form.test.tsx:79-95`), no 6. El estimado de ~410 líneas de `design.md`
se mantiene como orden de magnitud razonable.

## Fase 1 — WU1: helper compartido (aislado, sin UI)

- [x] 1.1 RED: crear `shared/lib/http/__tests__/api-error-message.test.ts` con los 10 casos de
  `design.md` (casing, escaneo completo del array, precedencia byCode→byStatus→fallback,
  envelope vs rejection, entradas malformadas). Satisface FE-OC7/FE-OC8 (base del mapeo).
- [x] 1.2 GREEN: crear `shared/lib/http/api-error-message.ts` (`apiErrorMessageId`,
  `API_ERROR_CODE_CELL_PHONE = 'cellphone'`).
- [x] 1.3 GREEN: convertir `admin/owners/lib/owner-error-message.ts` en wrapper que delega
  (3er param opcional `byCode`). No cambia su firma pública ni sus 4 call sites.
- [x] 1.4 Barra: `owner-error-message.test.ts` (10 aserciones — el "11" del enunciado no coincidía
  con el fichero real) verde **sin editarlo**.
- [x] Commit: `feat(http): add code-based api error message helper` (343f3f5)

## Fase 2 — WU2: formularios de owner (FE-OC7)

- [x] 2.1 RED en `owner-create.test.tsx`: borrado el bloque `:350-371` (formato); agregado test que
  rechaza `{ response: { status: 400, data: { errors: [{ code: 'Cellphone' }] } } }` → banner
  muestra `OWNER.PHONE_REQUIRED`. Ídem en `owner-edit.test.tsx` (borrado `:475-498`), casing
  `'CellPhone'`.
- [x] 2.2 GREEN: en `es.ts` alta `OWNER.PHONE_REQUIRED`; en `owner-create.tsx` sacado
  `PHONE_REGEX` (`:21`, `:79-83`) y sumado `byCode` al `catch` (`:106`); ídem `owner-edit.tsx`
  (const `:27`, bloque `:200-203`, `catch` `:241`). Regex y `byCode` en el **mismo commit**
  (ADR-8).
- [x] 2.3 Barra: `owner-create.test.tsx` y `owner-edit.test.tsx` — los tests de 400 sin body
  quedaron verdes **sin tocarlos**.
- [x] Commit: `feat(owners): drop phone regex and map 400 phone-required to banner copy` (c2b9053)

## Fase 3 — WU3: formularios de reseller (FE-OC8)

- [x] 3.1 RED: borrados `reseller-create.test.tsx:202-233` y `reseller-edit.test.tsx:412-443`;
  agregados los 2 tests de 400 (casing create/update) por fichero.
- [x] 3.2 GREEN: alta `RESELLERS.PHONE_REQUIRED` en `es.ts`; sacado const+bloque en
  `reseller-create.tsx` (`:16`, `:58-62`) y `reseller-edit.tsx` (`:14`, `:106-109`); cambiado
  `catch {}` → `catch (error)` + `apiErrorMessageId` (`:81`, `:132`). Mismo commit por ADR-8.
- [x] Commit: `feat(resellers): drop phone regex and map 400 phone-required to banner copy` (f04f7bf)

## Fase 4 — WU4: editar usuario (PHONE-2)

- [x] 4.1 RED: dado vuelta `user-details-form.test.tsx:79-95` — teléfono vacío, `onSubmit` **se
  llama**, sin mensaje de obligatorio.
- [x] 4.2 GREEN: borrado `UserDetailsForm.tsx:46-49` (chequeo), estado `cellPhoneError` (`:40`),
  su limpieza en `onChange` (`:106`) y su render (`:109-111`).
- [x] Commit: `feat(users): stop requiring phone on edit-user form` (5a8c81a)

## Fase 5 — WU5: perfil propio (PHONE-3)

- [x] 5.1 RED en `edit-profile-form.test.tsx`: agregado test `phoneRequired={false}` + teléfono
  vacío → `onSubmit` se llama, y test del fail-safe (`phoneRequired` omitido → sigue bloqueando).
  Confirmado que los tests existentes `:70-101` (sin la prop) siguen verdes por el default
  `true` — no editados.
- [x] 5.2 RED en `profile/routes/__tests__/profile-routes.test.tsx`: usuario sin rol
  (`isOwnerAdmin=false`, `isReSeller=false`) guarda con teléfono vacío; usuario con rol, no.
- [x] 5.3 GREEN: `EditProfileFormProps.phoneRequired?: boolean` (default `true`) en
  `edit-profile-form.tsx`; en `edit-profile.tsx` calculado
  `isOwnerAdmin(user) || isReSeller(user)` y pasado a `EditProfileForm`.
- [x] Commit: `feat(profile): require phone only for owner/reseller` (fa7eb3c)

## Fase 6 — WU6: limpieza i18n (ADR-5)

- [x] 6.1 Borradas `OWNER.PHONE_FORMAT` (`es.ts:771`), `RESELLERS.PHONE_FORMAT` (`es.ts:742`),
  `USERS.CELL_PHONE_REQUIRED` (`es.ts:710`).
- [x] 6.2 Barra: `rg` de las 3 claves en `frontend-react/apps/` y `frontend-react/packages/`
  volvió vacío (excluye `openspec/changes/archive/`).
- [x] Commit: `chore(i18n): remove orphaned phone-format and cell-phone-required keys` (efd11ef)

## Fase 7 — Cierre y verificación (PHONE-4, PHONE-5)

- [x] 7.1 Verificado (sin modificar) `UserCreateForm.tsx` y
  `CreateStoreUserCommandValidator.cs`: ninguno valida `cellPhone`. No generó commit — sin
  cambios.
- [x] 7.2 Verificado `auth/routes/register.tsx:71` (bloquea con teléfono vacío) y
  `RegisterCommandValidator.cs:32` (`RuleFor(x => x.CellPhone).NotNull().NotEmpty()`): intactos.
- [x] 7.3 `git diff --stat -- frontend-react/e2e/` vacío. `git diff --stat -- backend/` vacío.
  Verificado.
- [x] 7.4 `npx turbo run test --force` bajo `frontend-react/` — verde, evidencia real (no
  cacheada, `cache bypass, force executing` en cada paquete). Desglose exacto por paquete
  (corregido — la versión anterior de esta línea omitía `domain` y `web-common`):

  | Paquete | Test files | Tests |
  |---|---|---|
  | `@store-mgmt/domain` | 11 | 95 |
  | `@store-mgmt/web-common` | 1 | 11 |
  | `@store-mgmt/web-store-pos` | 180 | 2392 |
  | **Total** | **192** | **2498** |

  Total real de la corrida completa: **2498 tests**, no 2392. Verificado corriendo el comando,
  no copiado de un artefacto previo.

## Fase 8 — Cierre de verify-report (batch de cierre, 2026-08-07)

Cierra los 4 findings de `verify-report.md` (WARNING-1, WARNING-2, SUGGESTION-1, SUGGESTION-2).
Ninguno queda diferido — instrucción explícita del user ("cerralo todo, arreglalo todo").

- [x] 8.1 WARNING-1 + SUGGESTION-1: agregados 4 tests de componente en
  `reseller-create.test.tsx` y `reseller-edit.test.tsx` (2 por fichero: fallback a
  `RESELLERS.ERROR` con `errors:[{code:'FullName'}]`, y co-fallo con `errors:[{code:'FullName'},
  {code:'Cellphone'/'CellPhone'}]` → `RESELLERS.PHONE_REQUIRED`), espejando la convención exacta
  de `owner-create.test.tsx:702` / `owner-edit.test.tsx:634`. Casing verificado: `Cellphone` en
  create, `CellPhone` en update — igual que el resto del cambio.
  Probado que muerden con 2 mutaciones temporales distintas (revertidas antes de commitear,
  `git diff --stat` vacío verificado):
  1. Sacar el argumento `byCode` de `reseller-create.tsx`/`reseller-edit.tsx` → rompió los 2
     tests de co-fallo (los que ya existían de casing simple también rompieron, como control).
  2. Intercambiar el valor de `fallback` a `'RESELLERS.PHONE_REQUIRED'` → rompió los 2 tests de
     fallback (unrelated 400), más 2 tests preexistentes de red (`HTTP throw`) como control
     adicional de que la mutación era real.
  Commit: `test(resellers): pin FE-OC8 #3/#4 component-level coverage` (ea4cfd8)
- [x] 8.2 WARNING-2: tabla formal "TDD Cycle Evidence" reconstruida más abajo en este documento
  y en el `apply-progress` mergeado (engram). Donde no se pudo confirmar un RED genuino desde
  git (commits WU1-WU6 son squash de test+implementación, sin commit intermedio en rojo), se
  documenta explícitamente como brecha de evidencia, no como RED inventado.
- [x] 8.3 SUGGESTION-2: corregido arriba (Fase 7.4) — desglose completo por paquete, total real
  2498.
- [x] 8.4 Re-verificación completa tras WU7: `npx turbo run test --force` bajo `frontend-react/`
  — verde, `--force` confirmado (`cache bypass, force executing` en los 3 paquetes):

  | Paquete | Test files | Tests |
  |---|---|---|
  | `@store-mgmt/domain` | 11 | 95 |
  | `@store-mgmt/web-common` | 1 | 11 |
  | `@store-mgmt/web-store-pos` | 180 | 2396 (2392 + 4 nuevos de WU7) |
  | **Total** | **192** | **2502** |
- [x] 8.5 `git diff --stat main..HEAD -- frontend-react/e2e backend` vacío — verificado en el
  cierre.
- [x] 8.6 **Segunda ronda de cierre** (mismo día, hallazgo del coordinador confirmado por
  `rg -n "FullName"` sobre los 4 ficheros de test admin: hits solo en los 2 de reseller, cero en
  los 2 de owner): la brecha de co-fallo/array-scan documentada como "fuera de alcance" en la
  nota de WU7 en realidad SÍ estaba cubierta por la instrucción "cerralo todo, arreglalo todo, no
  dejes nada para despues". Cerrada — ver WU8 abajo. El test de fallback ("400 sin código
  conocido") de owner (`owner-create.test.tsx:471`, `owner-edit.test.tsx:618`) se verificó que
  sigue existiendo y NO se duplicó.
- [x] 8.7 Chequeo de familia: `rg -n "apiErrorMessageId|ownerErrorMessageId|byCode:"` sobre
  `frontend-react/apps/web-store-pos/app` (fuera de `__tests__/`) confirma que solo hay 4 call
  sites con clasificación `byCode` de teléfono (`reseller-create.tsx:76-77`,
  `reseller-edit.tsx:128-129`, `owner-create.tsx:98-104`, `owner-edit.tsx:234-240`) — los 4 ya
  tienen test de array-scan a nivel de componente tras WU7+WU8. Los otros 2 usos de
  `ownerErrorMessageId` en `owner-edit.tsx:153,170` son del path de CARGA (`getOwner`), sin
  clasificación por código de teléfono — no aplica el mismo patrón ahí. No queda ninguna
  instancia del mismo hueco sin cerrar dentro del alcance de este cambio.
- [x] 8.8 Total de tests corregido de nuevo tras WU8 (+2): **2504**. Ver Fase 9 abajo.
- [x] 8.9 `git diff --stat main..HEAD -- frontend-react/e2e backend` vacío — re-verificado tras
  WU8.

## Fase 9 — Cierre de la brecha simétrica en owner (WU8, segunda ronda del mismo batch de cierre)

- [x] 9.1 Agregados 2 tests de componente: `owner-create.test.tsx` (`errors:[{code:'FullName'},
  {code:'Cellphone'}]` → `OWNER.PHONE_REQUIRED`) y `owner-edit.test.tsx` (mismo, casing
  `CellPhone`), espejando exactamente los de reseller (WU7). El test de fallback existente
  (`owner-create.test.tsx:471`, `owner-edit.test.tsx:618`) NO se tocó ni se duplicó — se verificó
  que sigue intacto antes de agregar los nuevos.
  Nota de implementación: en `owner-edit.test.tsx` el test nuevo se agregó DENTRO del mismo
  `describe('OwnerEditPage — FE-OC3: classified rejections', ...)` que ya existía (no en un
  `describe` nuevo), porque reutiliza el helper local `submitWithRejection` que solo vive en el
  scope de ese bloque — un `describe` separado producía `ReferenceError: submitWithRejection is
  not defined` (detectado y corregido en la primera pasada de la corrida verde).
  Probado que muerden con 1 mutación temporal (revertida antes de commitear, `git diff --stat`
  vacío verificado): sacar el 4to argumento `byCode` del objeto pasado a `ownerErrorMessageId` en
  `owner-create.tsx:104` y `owner-edit.tsx:240` → rompió los 2 tests nuevos de array-scan MÁS los
  2 tests preexistentes de casing simple (`owner-create.test.tsx:702`, `owner-edit.test.tsx:634`)
  como control de que la mutación era real (4 tests fallidos de 79, el resto — incluidos los 2
  tests de fallback preexistentes — se mantuvo verde, sin tocar).
  Commit: `test(owners): pin FE-OC7 #4 component-level array-scan coverage` (faef857)
- [x] 9.2 Re-verificación completa final: `npx turbo run test --force` bajo `frontend-react/` —
  verde, `--force` confirmado (`cache bypass, force executing` en los 3 paquetes):

  | Paquete | Test files | Tests |
  |---|---|---|
  | `@store-mgmt/domain` | 11 | 95 |
  | `@store-mgmt/web-common` | 1 | 11 |
  | `@store-mgmt/web-store-pos` | 180 | 2398 (2396 + 2 nuevos de WU8) |
  | **Total** | **192** | **2504** |

- [x] 9.3 `git diff --stat main..HEAD -- frontend-react/e2e backend` vacío. `git status --short`
  limpio tras el commit de este WU. Verificado.

### TDD Cycle Evidence

**Salvedad metodológica**: los commits WU1-WU6 son cada uno un único commit que bundlea el test
nuevo/modificado JUNTO con la implementación (no hay un commit intermedio en estado rojo). Por lo
tanto, el historial de git **no puede** confirmar por sí solo que el test corrió en rojo antes del
código de producción — esa evidencia existe solo como narración en `tasks.md` (Fases 1-6, escritas
durante el propio `sdd-apply`). Se marca explícitamente abajo dónde el RED es "asertado en prosa,
no re-verificable desde git" en vez de reclamarlo como confirmado.

| Work Unit | RED | GREEN | TRIANGULATE | SAFETY NET | Commit |
|---|---|---|---|---|---|
| WU1 — helper compartido (`api-error-message.ts`) | ⚠️ Asertado en prosa (tarea 1.1: "10 casos... RED"); no re-verificable desde git — `343f3f5` bundlea el test de 10 casos y la implementación en un solo commit | ✅ `api-error-message.test.ts` (10 casos) verde en la corrida final | ✅ 10 casos: casing, escaneo de array completo, precedencia byCode→byStatus→fallback, envelope vs rejection, entradas malformadas | ✅ `owner-error-message.test.ts` (10 aserciones) verde sin editar (wrapper delegado) | `343f3f5` |
| WU2 — formularios owner (FE-OC7) | ⚠️ Asertado en prosa (tarea 2.1: bloque de formato borrado + tests de 400-phone agregados antes del wiring); no re-verificable desde git — `c2b9053` bundlea tests y prod. **Este marcador NO se actualiza retroactivamente** aunque la columna TRIANGULATE de esta fila sí cambió (WU8, abajo) — el RED de WU2 en sí sigue sin ser re-verificable desde git, cerrar WU8 no lo confirma ni lo invalida | ✅ verde en la corrida final | Originalmente ⚠️ Parcial (1 caso por casing/superficie, sin test de componente de co-fallo/array-scan) — **cerrado en una segunda ronda de este mismo batch**, ver WU8 | ✅ tests preexistentes "400 sin body → genérico" (`owner-create.test.tsx:471`, `owner-edit.test.tsx:618`) verdes sin editar — confirmado que siguen intactos tras WU8 | `c2b9053` |
| WU3 — formularios reseller (FE-OC8) | misma salvedad que WU2; no re-verificable desde git | ✅ verde en la corrida final | Originalmente ⚠️ Parcial (1 caso por casing, sin test de array-scan/fallback) — **cerrado en este batch**, ver WU7 | ✅ tests preexistentes de red sin `response` (`reseller-create.test.tsx:295`, `reseller-edit.test.tsx:537`) verdes sin editar | `f04f7bf` |
| WU4 — edit-user (PHONE-2) | ⚠️ Asertado en prosa (tarea 4.1: "dado vuelta... teléfono vacío"); no re-verificable desde git | ✅ verde en la corrida final | N/A — 1 solo escenario, corresponde a PHONE-2 #1 de la spec | N/A — sin comportamiento adyacente asertado por separado | `5a8c81a` |
| WU5 — perfil (PHONE-3) | ⚠️ Asertado en prosa (tarea 5.1/5.2: 2 tests RED agregados antes del wiring — fail-safe de `EditProfileForm` y las 3 combinaciones de rol en `profile-routes`) | ✅ verde en la corrida final | ✅ 3 combinaciones de rol (owner/reseller/store-user) × 2 capas (default del componente, wiring de la ruta) | ✅ tests preexistentes de `edit-profile-form.test.tsx` sin la prop `phoneRequired` siguen verdes (default `true`, fail-safe) | `fa7eb3c` |
| WU6 — limpieza i18n (ADR-5) | N/A — borrado puro, sin test nuevo (verificado con `rg` vacío sobre las 3 claves, no es un ciclo RED/GREEN) | N/A | N/A | ✅ suite completa verde después del borrado | `efd11ef` |
| WU7 — cierre de cobertura reseller (este batch, cierra WARNING-1/SUGGESTION-1) | ✅ Verificado genuinamente — **no es TDD clásico** (el wiring de producción ya existía desde WU3); es un ciclo de test de caracterización + mutation testing: (1) los 4 tests nuevos se escribieron y corrieron verdes en primera pasada, (2) se sacó temporalmente el argumento `byCode` de `reseller-create.tsx`/`reseller-edit.tsx` → los 2 tests de co-fallo fallaron como se esperaba, (3) se intercambió temporalmente el valor de `fallback` a `'RESELLERS.PHONE_REQUIRED'` → los 2 tests de fallback fallaron como se esperaba, (4) ambas mutaciones revertidas con edits dirigidos, `git diff --stat` vacío en los 2 ficheros de componente confirmado antes de commitear | ✅ 43/43 verde en `reseller-create.test.tsx` + `reseller-edit.test.tsx` tras el revert | ✅ ahora simétrico con owner: fallback (400 no relacionado) + co-fallo (array-scan, `FullName` en índice 0) cubiertos a nivel de componente para create y edit | ✅ los 39 tests preexistentes de reseller quedaron verdes durante todo el ciclo | `ea4cfd8` |
| WU8 — cierre de la brecha simétrica en owner (segunda ronda del mismo batch, cierra el hueco documentado en la nota de WU7) | ✅ Verificado genuinamente — mismo tipo de ciclo que WU7 (test de caracterización + mutation testing, no TDD clásico: el wiring `byCode` de owner ya existía desde WU2): (1) los 2 tests nuevos se escribieron y corrieron verdes en primera pasada, (2) se sacó temporalmente el 4to argumento `byCode` de `ownerErrorMessageId(...)` en `owner-create.tsx:104` y `owner-edit.tsx:240` → los 2 tests nuevos fallaron como se esperaba, junto con los 2 tests preexistentes de casing simple (control), (3) mutación revertida con `git checkout --`, `git diff --stat` vacío confirmado antes de commitear | ✅ 79/79 verde en `owner-create.test.tsx` + `owner-edit.test.tsx` tras el revert | ✅ ahora los 4 formularios (owner create/edit, reseller create/edit) tienen test de array-scan a nivel de componente — chequeo de familia (`rg` sobre los 4 call sites de `byCode`) confirma que no queda ninguna instancia del mismo patrón sin cubrir dentro del alcance de este cambio | ✅ los 77 tests preexistentes de owner quedaron verdes durante todo el ciclo (incluido el test de fallback `owner-create.test.tsx:471`/`owner-edit.test.tsx:618`, confirmado sin tocar) | `faef857` |

**Nota (actualizada tras WU8)**: el hueco de cobertura de co-fallo/array-scan a nivel de
componente del lado owner, documentado en la versión anterior de esta nota como "fuera de
alcance de este batch", quedó **cerrado** en una segunda ronda del mismo batch de cierre, a
pedido explícito del coordinador tras verificar el hallazgo (`rg -n "FullName"` sobre los 4
ficheros de test admin devolvía hits solo en los 2 de reseller antes de este WU). Chequeo de
familia realizado (tarea 8.7): no queda ninguna otra instancia del mismo patrón sin test de
array-scan dentro del alcance de `phone-validation-owner-reseller`.
