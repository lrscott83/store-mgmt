## Verification Report

**Change**: phone-validation-owner-reseller
**Version**: N/A (no versioned spec header)
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total (tasks.md, real count) | 26 (not 28 — recuento propio por `rg` de `- [x]`/`- [ ]`) |
| Tasks complete | 26 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: N/A — no build step invoked (frontend-only vitest change, `dotnet` prohibido por el user, ningún build de Vite pedido)

**Tests**: ✅ 2392 passed / 0 failed / 0 skipped (`@store-mgmt/web-store-pos`), ✅ 95 passed (`@store-mgmt/domain`), ✅ 11 passed (`@store-mgmt/web-common`) — **2498 tests total**, todos verdes
```text
$ cd frontend-react && npx turbo run test --force
@store-mgmt/domain:test: cache bypass, force executing cd78114e4cdc902c
@store-mgmt/domain:test:  Test Files  11 passed (11)
@store-mgmt/domain:test:       Tests  95 passed (95)
@store-mgmt/web-common:test: cache bypass, force executing 9ee72c88ba4714ce
@store-mgmt/web-common:test:  Test Files  1 passed (1)
@store-mgmt/web-common:test:       Tests  11 passed (11)
@store-mgmt/web-store-pos:test:  Test Files  180 passed (180)
@store-mgmt/web-store-pos:test:       Tests  2392 passed (2392)
@store-mgmt/web-store-pos:test: Type Errors  no errors
Tasks:    3 successful, 3 total
Cached:    0 cached, 3 total
Time:    31.107s
```
`--force` confirmado en las 3 corridas (`cache bypass, force executing`) — no es evidencia cacheada.

**Coverage**: no hay tool de coverage configurado en el runner (vitest sin `--coverage` en el script de turbo) → ➖ Not available

### Spec Compliance Matrix

**Delta: phone-requirement**

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| PHONE-1 #1-5 (regex fuera, 4 forms) | Formato no-cubano/vacío ya no bloquea | Verificado por lectura: `PHONE_REGEX` ausente en `owner-create.tsx`, `owner-edit.tsx`, `reseller-create.tsx`, `reseller-edit.tsx` (grep de todo `frontend-react/apps`+`packages` vuelve vacío); tests de formato borrados, submit ya no early-return | ✅ COMPLIANT |
| PHONE-2 #1 | Empty phone saves en edit-user | `user-details-form.test.tsx:80` `calls onSubmit with an empty cellPhone and never shows a required error` | ✅ COMPLIANT |
| PHONE-3 #1 | Owner bloqueado con teléfono vacío | `profile-routes.test.tsx:230` `blocks submit with an empty phone when the user is owner admin` | ✅ COMPLIANT |
| PHONE-3 #2 | Reseller bloqueado con teléfono vacío | `profile-routes.test.tsx:244` `blocks submit with an empty phone when the user is a reseller` | ✅ COMPLIANT |
| PHONE-3 #3 | Store user pasa con teléfono vacío | `profile-routes.test.tsx:215` `saves with an empty phone when the user is neither owner nor reseller` | ✅ COMPLIANT |
| PHONE-3 #4 | fullName sigue obligatorio | `edit-profile-form.test.tsx:141,157` (bloque EDIT-8, no tocado) | ✅ COMPLIANT (regresión intacta) |
| PHONE-4 #1 | Create-store-user nunca validó teléfono | Verificado por lectura: `UserCreateForm.tsx` sin `PHONE_REGEX` ni `.trim()` guard sobre `cellPhone` (tarea 7.1, sin cambios) | ✅ COMPLIANT (checkpoint, sin código nuevo) |
| PHONE-5 #1 | Registro sigue bloqueando teléfono vacío | Verificado por lectura: `auth/routes/register.tsx:71` y `RegisterCommandValidator.cs:32` intactos (tarea 7.2, sin diff) | ✅ COMPLIANT (checkpoint, sin código nuevo) |

**Delta: admin-owners-resellers**

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| FE-OC7 #1 (create, casing `Cellphone`) | Owner create → 400 code `Cellphone` | `owner-create.test.tsx:702-717` | ✅ COMPLIANT |
| FE-OC7 #2 (update, casing `CellPhone`) | Owner update → 400 code `CellPhone` | `owner-edit.test.tsx:634-639` | ✅ COMPLIANT |
| FE-OC7 #3 (ambos casings → misma copy) | Create y update pintan la misma copy | Inferido de #1+#2 (misma clave `OWNER.PHONE_REQUIRED` en ambos) + `api-error-message.test.ts:16-20` (unit, ambos casings → misma clave) | ✅ COMPLIANT |
| FE-OC7 #4 (escaneo completo del array) | `FullName` en `errors[0]`, teléfono en `errors[1]` | `api-error-message.test.ts:22-28` (unit, sobre `findByCodeMatch` — la MISMA función que consumen los 4 formularios vía `apiErrorMessageId`/`ownerErrorMessageId`) | ✅ COMPLIANT (capa unit, no component — ver nota abajo) |
| FE-OC7 #5 (400 no relacionado → genérico) | `errors: [{code:'FullName'}]` sin `cellphone` | `owner-create.test.tsx:471` `shows OWNER.ERROR (generic) when createOwner rejects with an unclassified status` (400 sin body, no exactamente `{code:'FullName'}` pero mismo fallback path) + `api-error-message.test.ts:36-40` (unit, caso exacto `{code:'FullName'}`) | ✅ COMPLIANT |
| FE-OC7 #6 (400 sin body → genérico) | `{response:{status:400}}` | `owner-create.test.tsx:471-476` y `owner-edit.test.tsx:618-619` — **los mismos tests preexistentes, sin editar**, confirmado por lectura | ✅ COMPLIANT (regresión intacta, tal como pinea FE-OC9 #4) |
| FE-OC8 #1 (reseller create, `Cellphone`) | Reseller create → 400 code `Cellphone` | `reseller-create.test.tsx:203-218` | ✅ COMPLIANT |
| FE-OC8 #2 (reseller update, `CellPhone`) | Reseller update → 400 code `CellPhone` | `reseller-edit.test.tsx:413-438` | ✅ COMPLIANT |
| FE-OC8 #3 (escaneo completo, resellers) | `FullName` en `errors[0]` | Solo cubierto por el mismo unit test de `api-error-message.test.ts:22-28` (función compartida) — **ningún test de componente de reseller** arma el caso de co-fallo | ⚠️ PARTIAL — ver WARNING-1 |
| FE-OC8 #4 (400 no relacionado, resellers) | `errors` sin código de teléfono | **Ningún test de componente de reseller** cubre este caso específico (solo el unit test del helper) | ⚠️ PARTIAL — ver WARNING-1 |
| FE-OC8 #5 (no-400 sin afectar) | Rechazo sin `response` (network) | `reseller-create.test.tsx:295-308` y `reseller-edit.test.tsx:537-560` (`new Error('Network error')`, preexistente) | ✅ COMPLIANT |
| FE-OC9 #1-4 (password policy, match, 409/403/404, tests del 400 sin body) | Nada del banner compartido cambia | Grep de `PASSWORD_POLICY`/`PASSWORDS_MUST_MATCH`/`DUPLICATE_LOGIN`/`FORBIDDEN`/`NOT_FOUND` en los 4 archivos de test — todos presentes, no editados por los commits (confirmado por `git show --stat`) | ✅ COMPLIANT |
| FE-OC10 #1 (un solo `role="alert"`) | Ningún slot nuevo por campo | Verificado por lectura de los 4 forms: un solo `<p role="alert">` en cada uno; `UserDetailsForm.tsx` explícitamente le sacaron `cellPhoneError`/su render | ✅ COMPLIANT |

**Delta: management-users**

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Empty phone saves in edit-user | `onSubmit` se llama, sin `cellPhoneError` | `user-details-form.test.tsx:80-93` | ✅ COMPLIANT |
| Non-empty phone sigue guardando | Formato cualquiera | `user-details-form.test.tsx:97-108` | ✅ COMPLIANT |
| Create store user checkpoint | Sin validación, sin cambios | Ver PHONE-4 arriba | ✅ COMPLIANT |

**Compliance summary**: 21/23 escenarios COMPLIANT en capa component/integration/unit; 2/23 (FE-OC8 #3, #4) solo cubiertos en capa unit del helper compartido, no en capa component de reseller — ver WARNING-1.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|---|---|---|
| Casing×surface matrix (4 combos) | ✅ Implemented | `owner-create.tsx:104` (`Cellphone`), `owner-edit.tsx:241` (`CellPhone`), `reseller-create.tsx:77` (`Cellphone`), `reseller-edit.tsx` catch (`CellPhone`) — los 4 wired con `API_ERROR_CODE_CELL_PHONE` |
| Escaneo del array completo | ✅ Implemented | `api-error-message.ts:39-44` (`findByCodeMatch`, `for (const entry of errors)`), no `errors[0]` en ningún call site nuevo |
| Fallback intacto | ✅ Implemented | `apiErrorMessageId` siempre devuelve `fallback` si no hay match — `api-error-message.ts:69` |
| Rol bidireccional (perfil) | ✅ Implemented | `edit-profile.tsx:30` `isOwnerAdmin(user) \|\| isReSeller(user)`; default `true` fail-safe en `edit-profile-form.tsx:35` |
| Cero diff e2e/backend | ✅ Implemented | `git diff --stat main..HEAD -- frontend-react/e2e backend` → vacío |
| Dead code (regex, claves huérfanas) | ✅ Implemented | `PHONE_REGEX` ausente en `apps/`+`packages/`; `OWNER.PHONE_FORMAT`/`RESELLERS.PHONE_FORMAT`/`USERS.CELL_PHONE_REQUIRED` ausentes (grep vacío); `AUTH.CELL_PHONE_REQUIRED` (`es.ts:77`) permanece pero pertenece a `register.tsx`, feature no tocada por este cambio — no es dead code |
| ADR-8 (regex+wiring mismo commit) | ✅ Implemented | `c2b9053` toca `owner-create.tsx`+`owner-edit.tsx` juntos; `f04f7bf` toca `reseller-create.tsx`+`reseller-edit.tsx` juntos — verificado con `git show --stat` |

### Coherence (Design)
| Decision | Followed? | Notes |
|---|---|---|
| ADR-1 (helper compartido + wrapper) | ✅ Yes | `api-error-message.ts` nuevo, `owner-error-message.ts` delega, 4 call sites de owner intactos, 10 tests de `owner-error-message.test.ts` verdes sin editar |
| ADR-2 (discriminador por `code.toLowerCase()`, nunca status 400) | ✅ Yes | `code.toLowerCase()` en `api-error-message.ts:42`, ningún mapeo por `status === 400` |
| ADR-3 (escanear todo `errors`) | ✅ Yes | `findByCodeMatch` itera el array completo |
| ADR-4 (precedencia byCode→byStatus→fallback, fallback requerido) | ✅ Yes | `apiErrorMessageId:64-69`; `fallback` es campo requerido del tipo `ApiErrorMessageOptions` |
| ADR-5 (2 claves nuevas, 3 borradas) | ✅ Yes | `es.ts:741,770` altas; grep de las 3 bajas vuelve vacío |
| ADR-6 (`phoneRequired?: boolean`, default `true`) | ✅ Yes | `edit-profile-form.tsx:21,35`; fail-safe testeado (`edit-profile-form.test.tsx:122-138`) |
| ADR-7 (`required` HTML se queda) | ✅ Yes | `required` presente en el input `cellPhone` de los 4 forms admin (verificado por lectura) |
| ADR-8 (regex+wiring mismo commit) | ✅ Yes | Ver tabla de correctness |
| Corrección de scope (banner, no inline) | ✅ Yes | Ningún form admin ganó slot por campo; proposal.md queda superseded en ese punto, tal como el design lo documenta |

### TDD Compliance
| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | ⚠️ Parcial | `apply-progress` y `tasks.md` narran RED/GREEN por WU (con ficheros y líneas citadas), pero **no** hay una tabla formal "TDD Cycle Evidence" con columnas RED/GREEN/TRIANGULATE/SAFETY NET por tarea, tal como pide el protocolo estricto |
| All tasks have tests | ✅ | Cada WU (1-6) cita un fichero de test RED antes del GREEN correspondiente; verificado por lectura de los 7 ficheros de test tocados |
| RED confirmed (tests exist) | ✅ | Los 7 ficheros de test citados existen y contienen los casos descritos (verificado línea por línea) |
| GREEN confirmed (tests pass) | ✅ | 2498/2498 tests verdes en la corrida `--force` (arriba) |
| Triangulation adequate | ⚠️ Parcial | WU1 (helper): 10 casos ✅. WU2/WU3 (owner/reseller): 1 caso de 400-phone por fichero (create+update), consistente con las 2 escenarios de casing de la spec — adecuado. WU5 (perfil): 2 niveles (component + route), 3 combinaciones de rol — adecuado. El escaneo-de-array-completo (ADR-3) solo se triangula en el helper compartido, no repetido por formulario — ver WARNING-1 |
| Safety Net for modified files | ✅ | Tests preexistentes (409/403/404, password policy, 400-sin-body) confirmados verdes SIN editar en los 4 archivos de test de owner/reseller |

**TDD Compliance**: 4/6 checks ✅ pleno, 2/6 ⚠️ parcial (formato de evidencia, triangulación de reseller)

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|---|---|---|---|
| Unit | 10 | 1 (`api-error-message.test.ts`) | vitest |
| Integration (component) | ~16 nuevos (2×owner-create, 2×owner-edit, 1×reseller-create, 1×reseller-edit, 2×user-details-form, 2×edit-profile-form, 3×profile-routes) | 7 | vitest + @testing-library/react |
| E2E | 0 (innegociable: cero cambios en `frontend-react/e2e/`) | 0 | Playwright (no tocado) |
| **Total** | **~26 tests nuevos/modificados** (dentro de los 2498 totales) | 8 | |

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected en el script de turbo (`vitest` sin `--coverage`).

### Assertion Quality
Escaneados los 8 ficheros de test tocados por este cambio (`api-error-message.test.ts`, `owner-create.test.tsx`, `owner-edit.test.tsx`, `reseller-create.test.tsx`, `reseller-edit.test.tsx`, `user-details-form.test.tsx`, `edit-profile-form.test.tsx`, `profile-routes.test.tsx`) contra los patrones prohibidos (tautologías, loops fantasma, mocks sin aserción, smoke-only). Ningún hit.

**Assertion quality**: ✅ All assertions verify real behavior

### Quality Metrics
**Linter**: ➖ No ejecutado (no pedido, y no forma parte de los comandos autorizados citados en el prompt)
**Type Checker**: ✅ No errors — `Type Errors  no errors` en la salida de `npx turbo run test --force` (vitest typecheck mode, confirmado en memoria previa como convención del repo)

---

### Issues Found

**CRITICAL**: None

**WARNING**:
1. **Cobertura component-level asimétrica entre owner y reseller para FE-OC8 #3/#4** (`admin/resellers/routes/__tests__/reseller-create.test.tsx`, `reseller-edit.test.tsx`). Los formularios de owner tienen un test explícito de "400 sin código conocido → fallback" (`owner-create.test.tsx:471`, `owner-edit.test.tsx:618`). Los de reseller NO tienen su equivalente — solo cubren el caso de red sin `response` (`new Error('Network error')`, un path distinto: sin `.response.status` en absoluto, no un 400 con `errors` no relacionados). El caso "escanea el array completo con `FullName` en `errors[0]`" (FE-OC8 #3) tampoco tiene test de componente para reseller — solo el unit test del helper compartido (`api-error-message.test.ts:22-28`). Dado que los 4 formularios llaman a la MISMA función `findByCodeMatch`/`apiErrorMessageId` sin lógica propia de escaneo, el riesgo real es bajo (verificado por lectura: `reseller-create.tsx:76-79` y `reseller-edit.tsx` catch delegan igual que owner), pero la spec (FE-OC8 #3, #4) describe estos escenarios a nivel de formulario, y ese nivel no está pineado por un test que falle si alguien rompe el wiring específico de reseller sin tocar el helper.
2. **Sin tabla formal "TDD Cycle Evidence"** en el `apply-progress` (Strict TDD activo). La evidencia RED/GREEN existe en prosa (`tasks.md`, commits por WU), y fue verificada independientemente contra el código real — pero el formato no sigue el protocolo estricto al pie de la letra.

**SUGGESTION**:
1. Si se quiere cerrar la asimetría del WARNING-1, agregar 2 tests de componente en `reseller-create.test.tsx`/`reseller-edit.test.tsx`: uno con `errors: [{code:'FullName'}]` (400 no relacionado → `RESELLERS.ERROR`) y uno con `errors: [{code:'FullName'},{code:'Cellphone'/'CellPhone'}]` (co-fallo → `RESELLERS.PHONE_REQUIRED`), espejando los que ya existen para owner.
2. `tasks.md` reporta "180 test files / 2392 tests" como cierre (Fase 7.4) pero no menciona los paquetes `@store-mgmt/domain` (95) ni `@store-mgmt/web-common` (11) que también corren en el mismo `turbo run test`. No es un error — el 2392 es exacto para `web-store-pos` — pero el total real de la corrida es 2498, dato que no queda escrito en ningún artefacto.

### Verdict
**PASS WITH WARNINGS**

Los 4 combos casing×surface están completos y wireados correctamente, el escaneo de array completo está implementado y probado (a nivel del helper compartido), el fallback nunca queda vacío ni cruza de campo, el rol bidireccional en perfil está cubierto en ambos sentidos, cero diff en `e2e/`+`backend/`, cero dead code relevante, ADR-8 se sostiene a nivel de commit, y las 2498 pruebas (frontend completo) pasan en una corrida `--force` real. Los dos WARNINGS son de **cobertura de test** (asimetría owner/reseller en 2 escenarios de FE-OC8, y formato de la evidencia TDD) — no de código roto ni de un requisito incumplido en producción. No hay nada que bloquee el archive; quedarían como deuda opcional a resolver antes o después, según el user decida.
