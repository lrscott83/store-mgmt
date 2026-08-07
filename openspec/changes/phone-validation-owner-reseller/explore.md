# Exploración — phone-validation-owner-reseller

**Fecha**: 2026-08-07
**Fase**: sdd-explore
**Modo de artefactos**: hybrid (este fichero + engram `sdd/phone-validation-owner-reseller/explore`)
**Fuente de verdad**: `docs/contracts/login-is-not-email.md`, sección "Still open — the phone rules" (líneas 79-109)

> Este fichero lo escribió el orquestador a partir del retorno del sub-agente `sdd-explore`,
> que corrió sin herramienta de escritura. El contenido es el del agente, no una reescritura.

## Regla que gobierna esta exploración

`CLAUDE.md`, innegociable: *"Never modify, delete, rename, skip, weaken, or 'fix' an existing
E2E test without explicit authorization from the user."* En esta fase no se tocó ningún test
ni una línea de producción.

## Estado del contrato — verificación de citas

Las 5 filas de la tabla del contrato y sus dos decisiones cerradas se verificaron línea por
línea contra el source actual. **Cero deriva**: todas las citas siguen apuntando a lo que el
contrato dice.

| Cita del contrato | Estado |
|---|---|
| `admin/owners/routes/owner-create.tsx:80` (const en `:21`) | `PHONE_REGEX` confirmado |
| `admin/owners/routes/owner-edit.tsx:200` (const en `:27`) | confirmado |
| `admin/resellers/routes/reseller-create.tsx:59` (const en `:16`) | confirmado |
| `admin/resellers/routes/reseller-edit.tsx:106` (const en `:14`) | confirmado |
| `management/users/components/UserDetailsForm.tsx:46` | confirmado; único llamador: `user-edit.tsx` |
| `profile/components/edit-profile-form.tsx:42` | confirmado |
| `CreateStoreUserCommandValidator.cs` | confirmado: no tiene regla de `CellPhone` |
| `auth/routes/register.tsx:71` + `RegisterCommandValidator.cs:32` | confirmado: siguen exigiendo teléfono (decisión cerrada) |
| `CreateOwnerCommandValidator.cs:35`, `UpdateOwnerCommandValidator.cs:22`, `CreateReSellerCommandValidator.cs:48`, `UpdateReSellerCommandValidator.cs:32` | `NotNull()`/`NotEmpty()` confirmados exactos (decisión cerrada) |

Todas las rutas de frontend cuelgan de `frontend-react/apps/web-store-pos/app/`; las de
backend, de `backend/src/`.

## Hallazgo crítico — el error del servidor no se renderiza

Confirmado como brecha real, trazada de punta a punta:

1. El backend devuelve `errors[0].description` = `"Cellphone es requerido"` /
   `"CellPhone es requerido"` con HTTP 400 (`SMCA.WebApi/Middlewares/ErrorHandlerMiddleware.cs`;
   el body JSON se verificó correcto y en camelCase — un bug previo ahí ya estaba arreglado,
   según el comentario del propio fichero). El texto interpola el `PropertyName` crudo: patrón
   preexistente, no algo que introduzca este cambio.
2. `shared/lib/http/api-client.ts` no sobreescribe `validateStatus`, así que axios **rechaza**
   en 400. La rama `!res.succeeded` de los 4 formularios es **código muerto** para este fallo.
3. Cada `catch` mapea solo 409/403/404 a mensajes propios; el 400 cae al genérico
   `"Ocurrió un error. Intentá de nuevo."` (`OWNER.ERROR` / `RESELLERS.ERROR`, `es.ts:743,765`).
   Los formularios de reseller ni siquiera inspeccionan el status.

**Consecuencia**: si solo se borra el regex, mandar el teléfono vacío en cualquiera de los 4
formularios muestra un error genérico inútil, no "el teléfono es requerido". El contrato ya
puso esto como condición de "hecho" ("the backend message has to render properly in those forms
before the work counts as done"). No hay convención previa en el código que lo resuelva: es
trabajo nuevo, no un borrado de una línea.

## Chequeo de rol para "editar perfil propio"

`UserModel` (`packages/domain/src/models/auth.ts:40-57`) expone `isSuperAdmin`, `isOwnerAdmin`
e `isReSeller` como booleanos planos — **no** hay un campo `ERoles` acá (refina la nota de
memoria). Los helpers establecidos están en `shared/lib/auth/authorization-service.ts:8-14`:
`isOwnerAdmin(user)` / `isReSeller(user)`.

Expresión objetivo: `isOwnerAdmin(user) || isReSeller(user)`.

`EditProfileForm` hoy **no recibe** `user` como prop. La ruta (`edit-profile.tsx`) tendría que
calcular y pasar un booleano `phoneRequired`, que es la forma de props primitivas que el
componente ya usa.

## Superficie afectada

- `owner-create.tsx`, `owner-edit.tsx`, `reseller-create.tsx`, `reseller-edit.tsx` — sacar
  `PHONE_REGEX` **y** arreglar el renderizado del error.
- `UserDetailsForm.tsx` — sacar el chequeo `!cellPhone.trim()`.
- `edit-profile-form.tsx` + `edit-profile.tsx` (ruta) — condicionar el requerido al rol.
- Los `catch` de los 4 formularios + `owner-error-message.ts` — falta un camino que maneje 400.

## Tests que pinean la conducta actual (pedido de autorización)

Ninguno se tocó. **Ningún spec de Playwright afirma nada de esto.**

**(a) Se romperían al implementar el contrato** — todos vitest de componente:

| Test | Qué pinea |
|---|---|
| `owner-create.test.tsx:350-371` | validación de formato de teléfono |
| `owner-edit.test.tsx:475-498` | ídem |
| `reseller-create.test.tsx` (~228) | ídem |
| `reseller-edit.test.tsx:413-438` | ídem |
| `user-details-form.test.tsx:79-97` | "cellPhone is required" en editar usuario |
| `edit-profile-form.test.tsx:70-124` | "cellPhone is required (new check, Angular parity)", hoy incondicional |
| `owner-create.test.tsx:498-514`, `owner-edit.test.tsx:646-652` | pinean el mensaje genérico **roto** del 400; hay que darlos vuelta cuando se arregle el punto anterior |

**(b) Sin efecto**: `user-create-form.test.tsx` (no afirma teléfono requerido); E2E de backend
`OwnersCreateValidationTests.cs:39`, `OwnersUpdateGapTests.cs:23-34`,
`AuthRegisterValidationTests.cs:47-48`, `UsersUpdateTests.cs:139-152` (las reglas de backend no
cambian).

## Pregunta abierta — fork genuino

Cómo renderizar el 400:

- **Opción A** — reenviar la descripción del backend tal cual. Simple; la copia queda un poco
  áspera y con el casing del `PropertyName`.
- **Opción B** — mapear `errors[0].code` a una clave i18n propia. Prolijo; hay que manejar el
  desajuste de casing `"Cellphone"` (create) vs `"CellPhone"` (update).

Queda para `sdd-propose` / `sdd-design`.

## Riesgos

- El renderizado del error del servidor convierte esto de "borrar un regex" en cambios de lógica
  reales en 4 `catch`. Va scopeado en la propuesta, no como arreglo al pasar.
- 7 tests de componente (vitest) requieren decisión del usuario antes de `sdd-apply`.
- Ningún E2E implicado: la regla innegociable de `CLAUDE.md` no se dispara en este cambio.
