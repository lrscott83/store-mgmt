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
- [x] 7.4 `npx turbo run test --force` bajo `frontend-react/` — verde: 180 test files / 2392
  tests en `@store-mgmt/web-store-pos`, más `@store-mgmt/domain` (11/95) y `@store-mgmt/web-common`,
  todos passed, evidencia real (no cacheada, `cache bypass, force executing` en cada paquete).
