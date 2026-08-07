# Proposal: phone-validation-owner-reseller

**Modo de artefactos**: hybrid (este fichero + engram `sdd/phone-validation-owner-reseller/proposal`)
**Fuente de verdad**: `docs/contracts/login-is-not-email.md:79-109` ("Still open — the phone rules")
**Insumo**: `openspec/changes/phone-validation-owner-reseller/explore.md`

> `CLAUDE.md`, innegociable: *"Never modify, delete, rename, skip, weaken, or 'fix' an existing
> E2E test without explicit authorization from the user."* Acá **no se dispara**: ningún spec de
> Playwright afirma nada de esta conducta (explore.md:82). `frontend-react/e2e/` no se toca.

## Intent

El `PHONE_REGEX` `/^\+53\s?[0-9]\s?[0-9]{3}-?[0-9]{4}$/` obliga a un número cubano en **todo**
teléfono. El contrato lo dice textual: *"it forces a Cuban `+53` number on every phone, which is
not a rule this product wants to make"* (`login-is-not-email.md:94-95`). El teléfono deja de ser
requisito global y pasa a ser requisito **de owner y reseller**.

El contrato también fija la condición de "hecho": *"the backend message has to render properly in
those forms before the work counts as done"* (`:105-106`). Hoy no renderiza — y ese, no el borrado
del regex, es el grueso del trabajo.

## Scope

### In Scope

**(a) Sacar validación de frontend**

| Path | Hoy | Acción |
|---|---|---|
| owner-create | `PHONE_REGEX` const `:21`, uso `:80` → `OWNER.PHONE_FORMAT` | borrar el bloque |
| owner-edit | const `:27`, uso `:200` | borrar |
| reseller-create | const `:16`, uso `:59` → `RESELLERS.PHONE_FORMAT` | borrar |
| reseller-edit | const `:14`, uso `:106` | borrar |
| `UserDetailsForm.tsx:46` | `!cellPhone.trim()` → `USERS.CELL_PHONE_REQUIRED` (`:47`) | borrar el chequeo |
| `UserCreateForm.tsx` | ya sin validación | **solo verificar**, no tocar |

Rutas de owner/reseller cuelgan de `frontend-react/apps/web-store-pos/app/admin/{owners,resellers}/routes/`.

**(b) Requerido por rol en el perfil propio**

`edit-profile-form.tsx:42` exige `!fullName.trim() || !cellPhone.trim()` siempre. Pasa a ser
condicional. La ruta `profile/routes/edit-profile.tsx` ya tiene `user` de `useAuthStore()` (`:14`),
así que calcula ahí `isOwnerAdmin(user) || isReSeller(user)`
(`shared/lib/auth/authorization-service.ts:8-14`) y baja un booleano `phoneRequired` — props
primitivas, la forma que el componente ya usa. `UserModel` expone booleanos planos
(`packages/domain/src/models/auth.ts:40-57`); **no** hay `ERoles` acá.

**(c) Render del 400 — la parte grande**

`api-client.ts` (`axios.create` en `:20`) no sobreescribe `validateStatus`, así que axios
**rechaza** en 400: la rama `!res.succeeded` de los 4 formularios admin es código muerto para este
fallo (p.ej. `owner-create.tsx:97-100`). Los `catch` de owner mapean solo 409/403 vía
`ownerErrorMessageId` (`admin/owners/lib/owner-error-message.ts:10-20`); los de reseller son
`catch {}` pelado (`reseller-create.tsx:81-82`). Todo 400 termina en el genérico *"Ocurrió un
error. Intentá de nuevo."* (`es.ts:765` `OWNER.ERROR`, `es.ts:743` `RESELLERS.ERROR`).

Decisión del usuario (2026-08-07): mapear el error de validación del backend a **copy i18n propia**
y renderizarla **inline en el campo que falla** — ni el texto crudo del backend, ni una brecha
diferida.

Dos cosas que esto implica y hay que resolver en `sdd-design`:

1. **Desajuste de casing**: el `code` es `"Cellphone"` en create y `"CellPhone"` en update
   (`openspec/specs/owners/spec.md:66` vs `:137`). El mapeo tiene que tolerar ambos.
2. **No hay slot por campo** en los 4 formularios admin: hoy pintan un único banner
   `role="alert"` arriba (`owner-create.tsx:124-128`). El precedente a copiar existe en
   `UserDetailsForm.tsx` (estado `cellPhoneError` `:40`, render `:109-110`).

### Out of Scope

- **Backend: cero cambios de producción.** Los `NotEmpty` de owner/reseller quedan
  (`CreateOwner:35`, `UpdateOwner:22`, `CreateReSeller:48`, `UpdateReSeller:32`) — decisión cerrada.
- **Registro**: sigue exigiendo teléfono en ambas capas (`auth/routes/register.tsx:71`,
  `RegisterCommandValidator.cs:32`) — decisión cerrada.
- **Create store user**: ya correcto (`CreateStoreUserCommandValidator.cs` no tiene regla de
  `CellPhone`). Verificar, no modificar.
- `frontend-react/e2e/` — ningún spec implicado.
- Máscara `+53 0 000-0000` de `management-users` (`spec.md:33-37`): es formato de input, no
  validación. Queda como está.

## Capabilities

### New Capabilities

- `phone-requirement`: dónde el teléfono es obligatorio y dónde no (owner/reseller sí; editar
  usuario y crear usuario de tienda no; perfil propio solo si el usuario es owner o reseller), más
  el contrato de render del 400 de validación en copy propia e inline.

### Modified Capabilities

- `admin-owners-resellers`: los 4 formularios dejan de validar formato y ganan un camino
  400 → error de campo. Toca la clasificación de errores ya especificada en FE-OC2 (`spec.md:244`)
  y FE-OC3 (`:264`).
- `management-users`: Editar Usuario deja de exigir teléfono en el frontend.

## Approach

Tres cortes, en este orden: **(c)** primero el camino del 400 (es el que habilita el resto),
después **(a)** los borrados, y **(b)** la condición por rol. Invertido, cualquier borrado deja al
usuario frente al error genérico inútil — exactamente lo que el contrato prohíbe entregar.

## Affected Areas

| Área | Impacto | Qué cambia |
|---|---|---|
| `admin/owners/routes/owner-{create,edit}.tsx` | Modified | fuera regex; `catch` mapea 400 |
| `admin/resellers/routes/reseller-{create,edit}.tsx` | Modified | ídem; hoy el `catch` ni mira el status |
| `admin/owners/lib/owner-error-message.ts` | Modified | no distingue código de propiedad |
| `management/users/components/UserDetailsForm.tsx` | Modified | fuera el `!cellPhone.trim()` |
| `profile/components/edit-profile-form.tsx` + `profile/routes/edit-profile.tsx` | Modified | prop `phoneRequired` |
| `shared/lib/i18n/es.ts` | Modified | clave(s) nuevas para el requerido del teléfono |
| `backend/src/**` | **Sin cambios** | decisión cerrada |

## Test Impact

7 tests de componente (vitest) pinean la conducta vieja y **se actualizan dentro de este cambio**:

| Test | Qué pinea |
|---|---|
| `owner-create.test.tsx:350-371` | formato de teléfono |
| `owner-edit.test.tsx:475-498` | ídem |
| `reseller-create.test.tsx` (~228) | ídem |
| `reseller-edit.test.tsx:413-438` | ídem |
| `user-details-form.test.tsx:79-97` | "cellPhone is required" en editar usuario |
| `edit-profile-form.test.tsx:70-124` | requerido incondicional → pasa a condicional por rol |
| `owner-create.test.tsx:498-514`, `owner-edit.test.tsx:646-652` | pinean el mensaje genérico **roto** del 400 — se dan vuelta |

Sin efecto: `user-create-form.test.tsx` y los E2E de backend (`OwnersCreateValidationTests.cs:39`,
`OwnersUpdateGapTests.cs:23-34`, `AuthRegisterValidationTests.cs:47-48`,
`UsersUpdateTests.cs:139-152`) — las reglas de backend no cambian. **Ningún Playwright implicado.**

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| El 400 sigue cayendo al genérico y el cambio empeora la UX | Media | Es la cláusula de aceptación; se testea explícitamente en los 4 formularios |
| El casing `Cellphone`/`CellPhone` se resuelve solo para una mitad | Media | Mapeo case-insensitive + un test por cada camino (create y update) |
| Tocar los 7 tests se lee como "ablandar la suite" | Baja | Cada edición se justifica contra la fila del contrato que la exige; ninguno es E2E |
| Alcance real (4 `catch` + slot inline nuevo) desborda el presupuesto de 400 líneas de review | Media | `sdd-tasks` lo pronostica; candidato natural a cortes encadenados (a)/(b)/(c) |

## Rollback Plan

Todo el cambio es frontend y por fichero. Revertir el commit del corte deja el regex y el chequeo
en su lugar; el backend nunca se movió, así que no hay migración, feature flag ni estado a
deshacer. Los tests revertidos vuelven a pinear la conducta vieja sin tocar producción.

## Dependencies

Ninguna externa. `docs/contracts/login-is-not-email.md` es insumo, no dependencia de código.

## Success Criteria

- [ ] Ningún `PHONE_REGEX` queda en `admin/owners/` ni en `admin/resellers/`
- [ ] Editar Usuario guarda con el teléfono vacío
- [ ] Crear Usuario de Tienda: verificado sin cambios
- [ ] Editar Perfil exige teléfono si el usuario es owner o reseller, y no lo exige si no lo es
- [ ] Guardar owner/reseller con teléfono vacío muestra **copy propia, inline en el campo** — no
      "Ocurrió un error. Intentá de nuevo." — tanto en create como en update (los dos casings)
- [ ] Registro sigue exigiendo teléfono
- [ ] `frontend-react/e2e/` sin diff

## Preguntas abiertas

Ninguna. El contrato cierra el alcance y el usuario cerró el fork del render del 400 (copy propia,
inline). Lo que queda —forma exacta del mapeo `code` → clave i18n, nombre de la clave, y cómo se
introduce el slot por campo en los 4 formularios admin— es diseño, no decisión de producto: va a
`sdd-design`.
