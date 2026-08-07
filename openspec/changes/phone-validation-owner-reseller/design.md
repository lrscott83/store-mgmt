# Design: phone-validation-owner-reseller

**Modo de artefactos**: hybrid (este fichero + engram `sdd/phone-validation-owner-reseller/design`)
**Insumos**: `proposal.md`, `explore.md`, `docs/contracts/login-is-not-email.md:79-109`
**Fase**: sdd-design — el CÓMO arquitectónico. Los pasos ejecutables van en `tasks.md`.

> `CLAUDE.md`, innegociable: *"Never modify, delete, rename, skip, weaken, or 'fix' an existing
> E2E test without explicit authorization from the user."* Acá **no se dispara**: ningún spec de
> Playwright afirma nada de esta conducta (`explore.md:82`). Este diseño no toca
> `frontend-react/e2e/`.

## La decisión, primero

El error de validación del backend se mapea a **copy i18n propia** y se pinta en el **banner
único que ya existe arriba de cada formulario** (`validationError || serverError`). **No** hay
slot por campo, **no** hay UI nueva. El discriminador es el `code` del body del 400, normalizado a
minúsculas, resuelto por **un helper compartido nuevo** en `shared/lib/http/`.

> **Supersede al proposal en un punto.** `proposal.md:56-67` diseñaba el error inline en el campo
> y metía un slot por campo en los 4 formularios admin. El usuario lo rechazó. Ese trabajo queda
> **fuera de alcance**. El resto del proposal se mantiene tal cual.

## Camino rápido (el flujo completo, de punta a punta)

1. El usuario manda owner/reseller con el teléfono vacío (o en blanco).
2. `ValidationBehaviour.cs:25` tira `ValidationException(failures)`; cada failure se vuelve
   `new Error(failure.PropertyName, failure.ErrorMessage)` (`ValidationException.cs:20`).
3. `ErrorHandlerMiddleware.cs:51-56` responde **400** (`ApiException.cs:18`,
   `HttpStatusCode.BadRequest` por defecto) con el body serializado en camelCase
   (`ErrorHandlerMiddleware.cs:19-20,74`): `{ errors: [{ code, description }] }`.
4. `api-client.ts` no sobreescribe `validateStatus`, así que axios **rechaza** (verificado: el
   fichero completo, `:20-26` y `:54-100`, no menciona `validateStatus`).
5. El `catch` del formulario llama al helper, que lee `error.response.data.errors[*].code`,
   lo baja a minúsculas, encuentra `"cellphone"` y devuelve la clave i18n del feature.
6. `setServerError(...)` → el `<p role="alert">` que ya existe pinta *"El teléfono es obligatorio."*

## Contrato del backend — verificado línea por línea

| Dato | Evidencia | Valor |
|---|---|---|
| Forma del error | `Domain/Common/Results/Error.cs:3` | `record Error(string Code, string Description)` |
| De dónde sale el `Code` | `Application/Exceptions/ValidationException.cs:20` | `failure.PropertyName` — **crudo, sin normalizar** |
| Status | `Application/Exceptions/ApiException.cs:18` | `BadRequest` (400) por defecto; `ValidationException` no lo cambia |
| Serialización | `ErrorHandlerMiddleware.cs:19-20,74` | `JsonSerializerDefaults.Web` → **nombres de propiedad** en camelCase (`code`, `description`); los **valores** string quedan intactos |
| Regla owner create | `CreateOwnerCommandValidator.cs:35-37` | `NotNull().NotEmpty()` sobre `x.Cellphone` |
| Regla owner update | `UpdateOwnerCommandValidator.cs:22-24` | `NotNull().NotEmpty()` sobre `x.CellPhone` |
| Regla reseller create | `CreateReSellerCommandValidator.cs:48` | `x.Cellphone` |
| Regla reseller update | `UpdateReSellerCommandValidator.cs:32` | `x.CellPhone` |

**El casing es real y sale del DTO, no del validador**: `CreateOwnerCommand.cs:20` declara
`string Cellphone`; `UpdateOwnerCommand.cs:24` declara `string CellPhone`. Idéntico en reseller
(`CreateReSellerCommand.cs:24` vs `UpdateReSellerCommand.cs:18`). Un mapeo case-sensitive arregla
la mitad de la superficie y deja la otra mitad en el genérico — exactamente el riesgo que el
proposal marcó (`proposal.md:137`).

**NO VERIFICADO** (comportamiento de FluentValidation, no de este repo): que `NotEmpty()` trate
un string de solo espacios como vacío. Si lo hiciera, `" "` pasa el `required` nativo del HTML y
llega al 400 — que es justamente el camino que este diseño arregla. Nada del diseño depende de
esa respuesta.

## Forma del frontend — verificado

Los 4 formularios admin comparten **una sola** forma de render de error:

| Formulario | Banner único | Ya pinta ahí el error de teléfono |
|---|---|---|
| `admin/owners/routes/owner-create.tsx` | `:124-128` | `:80-81` (`OWNER.PHONE_FORMAT`) |
| `admin/owners/routes/owner-edit.tsx` | `:275-279` | `:200-202` |
| `admin/resellers/routes/reseller-create.tsx` | `:95-99` | `:59-61` (`RESELLERS.PHONE_FORMAT`) |
| `admin/resellers/routes/reseller-edit.tsx` | `:176-180` | `:106-108` |

O sea: el mensaje de teléfono **ya sale por ese canal hoy**, en el mismo `<p role="alert">` que la
política de contraseña y el error de servidor. La decisión del usuario no inventa un canal: usa el
que el error de teléfono ya venía usando. Cero UI nueva.

Envelope del frontend: `BaseError { code: string; description: string }`
(`packages/domain/src/models/base.ts:17-20`), dentro de `BaseResponseModel<T>` (`:13-15`). El
mismo nombre de campo (`code`) en los dos canales.

---

# Decisiones (ADR)

## ADR-1 — Helper compartido nuevo en `shared/lib/http/`, y `ownerErrorMessageId` pasa a wrapper

**Decisión.** Crear `frontend-react/apps/web-store-pos/app/shared/lib/http/api-error-message.ts`:

```ts
/** El `code` de un error de validación del backend es el PropertyName crudo
 *  (ValidationException.cs:20) y su casing varía por comando: "Cellphone" en create,
 *  "CellPhone" en update. Normalizado a minúsculas — ADR-2. */
export const API_ERROR_CODE_CELL_PHONE = 'cellphone';

export interface ApiErrorMessageOptions {
  /** Claves EN MINÚSCULAS. Gana sobre byStatus — ADR-4. */
  byCode?: Record<string, string>;
  byStatus?: Record<number, string>;
  /** Obligatorio y explícito: nunca se devuelve vacío — ADR-4. */
  fallback: string;
}

export function apiErrorMessageId(error: unknown, options: ApiErrorMessageOptions): string;
```

`admin/owners/lib/owner-error-message.ts` conserva su nombre y su export, y delega:

```ts
export function ownerErrorMessageId(
  error: unknown,
  byStatus: Record<number, string>,
  byCode?: Record<string, string>   // ← tercer parámetro OPCIONAL
): string {
  return apiErrorMessageId(error, { byStatus, byCode, fallback: 'OWNER.ERROR' });
}
```

Los 2 formularios de reseller llaman a `apiErrorMessageId` **directo**, con
`fallback: 'RESELLERS.ERROR'`. **No** se crea un `reseller-error-message.ts`: hoy los `catch` de
reseller no mapean ningún status (`reseller-create.tsx:81-82`, `reseller-edit.tsx:132-133`) y este
cambio no agrega ninguno, así que un wrapper sin `byStatus` sería indirección sin contenido.

**Por qué.** El bloqueante de extender `ownerErrorMessageId` tal cual es su fallback hardcodeado
`'OWNER.ERROR'` (`owner-error-message.ts:19`): reseller necesita `'RESELLERS.ERROR'`. En cuanto se
parametriza el fallback, la función deja de ser "de owners" y el nombre miente. Pero **moverla o
renombrarla no es gratis**: tiene 4 call sites (`owner-create.tsx:106`, `owner-edit.tsx:155`,
`:172`, `:241` — dos de ellos en el camino de **carga**, no de submit) y un fichero de tests
propio con 11 aserciones (`admin/owners/lib/__tests__/owner-error-message.test.ts`). El wrapper
deja los 4 call sites y los 11 tests intactos, y esos tests pasan a ser la red de regresión de la
delegación.

**Consistencia con las decisiones previas del fichero** (su comentario de cabecera, `:1-9`):

- **D1** — leer la rejection *estructuralmente*, sin importar axios: se mantiene. El helper nuevo
  tampoco importa axios; lee `response.data.errors` por forma.
- **D2** — un mapa explícito por call site: se mantiene y se extiende al `byCode`.
- **D-1** — el canal de rejection (`response.status`) gana sobre la sonda de envelope, que lee el
  **nivel superior** (`actionCode` del objeto, nunca `error.response.data.actionCode`): se
  mantiene textual. El canal de `code` replica la misma disyunción: `error.response.data.errors`
  para la rejection, `error.errors` **solo si** `error.succeeded === false` para el envelope.

**Rechazadas:**

| Alternativa | Por qué no |
|---|---|
| 4 `catch` locales con la lógica repetida | Duplica la normalización de casing en 4 lugares — la deriva de casing es *el* riesgo de este cambio (ADR-2). Un solo punto de verdad o nada. |
| Mover/renombrar `ownerErrorMessageId` a `shared/` | Rompe 4 call sites y obliga a reescribir un fichero de tests de 11 aserciones que pinea conducta **ajena** a este cambio. Churn de review sin valor. |
| Poner el helper en `admin/` compartido entre owners y resellers | La clasificación de errores HTTP es una preocupación de transporte, no de un feature de administración. `shared/lib/http/` es donde ya vive `api-client.ts` y `session-rejected-error.ts`. |

## ADR-2 — Se discrimina por `code` normalizado a minúsculas, nunca por status 400

**Decisión.** El discriminador es `code.toLowerCase()`. Las claves del mapa `byCode` se escriben
**en minúsculas**, y el único código que este cambio necesita se exporta como constante
(`API_ERROR_CODE_CELL_PHONE = 'cellphone'`) para que nadie escriba `'CellPhone'` en un mapa.

**Por qué.** Mapear `400 → "teléfono obligatorio"` sería **incorrecto**: *todo* fallo de
validación del backend llega como 400 (`ApiException.cs:18`) — nombre vacío, email inválido,
reseller inexistente (`CreateOwnerCommandValidator.cs:31-33,39-43`). Un mapeo por status le
mostraría al usuario "el teléfono es obligatorio" cuando lo que falló fue el nombre. El status
dice *que* hubo un fallo de validación; solo el `code` dice **cuál**.

`toLowerCase()` (no `toLocaleLowerCase()`) es independiente del locale, así que no hay trampa de
la I turca.

**Rechazadas:** mapa con las dos variantes literales (`{ Cellphone: ..., CellPhone: ... }`) —
duplica cada entrada y falla silenciosamente el día que el backend agregue un tercer casing;
comparar contra `description` — es texto localizado del servidor, no un identificador.

## ADR-3 — Se escanea **todo** el array `errors`, no `errors[0]`

**Decisión.** Recorrer `errors` en orden y devolver la clave del **primer** `code` que tenga
mapeo. Si ninguno mapea, seguir con `byStatus` y después con el fallback.

**Por qué.** El backend acumula **todos** los failures (`ValidationBehaviour.cs:22`
`SelectMany(r => r.Errors)`, `ValidationException.cs:18-21` itera). Guardar owner con nombre
**y** teléfono vacíos devuelve dos errores, y `FullName` va primero (`CreateOwnerCommandValidator.cs:31`
antes de `:35`). Leer `errors[0]` daría el genérico justo cuando el teléfono sí falló. Es la misma
razón por la que los call sites actuales que hacen `res.errors[0]?.description`
(`owner-create.tsx:98`) muestran solo un error: conducta preexistente que este helper **no**
replica.

**Consecuencia aceptada:** con dos fallos, el usuario ve el mensaje del primero **que tenga
mapeo**, no el primero del array. Con un solo código mapeado (`cellphone`) eso es exactamente lo
deseado.

## ADR-4 — Precedencia `byCode` → `byStatus` → `fallback`, con fallback obligatorio

**Decisión.** En ese orden. `fallback` es un parámetro **requerido** (no tiene default). Un
`code` desconocido, un body ausente, un body que no es array, un `code` que no es string, una
falla de red sin `response`: **todos** terminan en el fallback del feature —
`'OWNER.ERROR'` (`es.ts:765`) o `'RESELLERS.ERROR'` (`es.ts:743`). Nunca string vacío, nunca el
mensaje de otro campo.

> Nota de verificación: `explore.md:50` cita esas dos claves con los números de línea invertidos.
> Verificado contra `es.ts`: **765 = `OWNER.ERROR`**, **743 = `RESELLERS.ERROR`**.
> `proposal.md:55` ya las tiene bien.

**Por qué esa precedencia.** El `code` es estrictamente más específico que el status: un 409 no
trae `errors` de validación, y un 400 con `code` conocido es más informativo que "hubo un 400".
Cuando los dos mapas podrían responder, gana el más específico.

**Por qué el fallback es requerido y no `'GENERAL.ERROR'` por default.** Un default silencioso
haría que un call site nuevo pinte copy de otro feature sin que nadie lo note. Que el
compilador lo exija cuesta una palabra por call site.

## ADR-5 — Claves i18n nuevas por feature, y se borran las 3 que quedan huérfanas

**Fichero**: `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts`.
**Locales hermanos**: verificado — **no existen**. `shared/lib/i18n/` contiene solo `es.ts` e
`i18n-provider.tsx` (glob del directorio). No hay ningún otro fichero de mensajes que actualizar.

**Altas** (copy exacta):

| Clave | Copy |
|---|---|
| `OWNER.PHONE_REQUIRED` | `'El teléfono es obligatorio.'` |
| `RESELLERS.PHONE_REQUIRED` | `'El teléfono es obligatorio.'` |

**Bajas** (quedan con **cero** referencias en producción y en tests después de este cambio —
verificado con un grep de todo `frontend-react/`; los únicos hits restantes son artefactos de
`openspec/changes/archive/`, que son histórico y no se tocan):

| Clave | Línea | Por qué muere |
|---|---|---|
| `OWNER.PHONE_FORMAT` | `es.ts:771` | Se va el regex de owner-create/edit |
| `RESELLERS.PHONE_FORMAT` | `es.ts:742` | Se va el regex de reseller-create/edit |
| `USERS.CELL_PHONE_REQUIRED` | `es.ts:710` | Se va el chequeo de `UserDetailsForm.tsx:46-49` |

**Por qué dos claves con copy idéntica en vez de reusar `USERS.CELL_PHONE_REQUIRED`.** Es la
convención que el repo ya sigue: `OWNER.PASSWORD_POLICY` (`es.ts:769`) y
`RESELLERS.PASSWORD_POLICY` (`es.ts:740`) son strings **byte a byte idénticos** en claves
separadas por feature. Reusar la clave `USERS.*` desde las pantallas de owners/resellers acopla
tres pantallas sin relación y deja el namespace mintiendo.

**Sin claves nuevas para el perfil.** `PROFILE.REQUIRED` (`es.ts:603`, `'Este campo es
obligatorio.'`) ya cubre nombre y teléfono en el mismo mensaje (`edit-profile-form.tsx:42-45`).
Solo cambia la condición, no la copy.

## ADR-6 — `phoneRequired?: boolean` en `EditProfileForm`, con default `true`

**Decisión.** `EditProfileFormProps` gana `phoneRequired?: boolean` con **default `true`**. La
condición pasa a:

```ts
if (!fullName.trim() || (phoneRequired && !cellPhone.trim())) {
```

La ruta lo calcula y lo baja:

```ts
// profile/routes/edit-profile.tsx — `user` ya está en scope desde useAuthStore() (:14)
const phoneRequired = user ? isOwnerAdmin(user) || isReSeller(user) : false;
```

`isOwnerAdmin` / `isReSeller` desde `~/shared/lib/auth/authorization-service`
(`authorization-service.ts:8-14`), que leen booleanos planos de `UserModel`.

**Por qué props primitivas y no `user`.** Confirmado leyendo **los dos** ficheros:
`EditProfileFormProps` (`edit-profile-form.tsx:11-18`) es 100% primitivas y callbacks —
`initialValues`, `isOnline`, `isLoading`, `onSubmit`, `error`, `successMessage`. No recibe
`user` ni ningún modelo de dominio. Pasarle el `UserModel` rompería esa forma y le metería al
componente la responsabilidad de decidir roles.

**Por qué opcional con default `true` y no requerida.**

1. **Fail-safe**: si un call site futuro se olvida, el formulario mantiene la regla **más
   estricta** (la de hoy). Un default `false` o una prop requerida mal puesta relajarían una
   validación en silencio — la dirección peligrosa.
2. **Tamaño de review**: `edit-profile-form.test.tsx` tiene **12** `render(<EditProfileForm .../>)`
   (`:23,38,54,73,88,106,121,139,154,171,185,202`). Una prop requerida obliga a tocar las 12; con
   el default solo se tocan las que hablan del teléfono.

**Rechazada:** prop requerida — más explícita, pero paga 12 ediciones mecánicas y pierde el
fail-safe. Rechazada: leer `useAuthStore()` dentro del componente — lo acopla al store y rompe la
forma de props primitivas que el componente ya tiene.

**El `user` nulo.** `edit-profile.tsx:20-24` ya tolera `user` nulo (`user?.fullName ?? ''`) y
`handleSubmit` corta en `:31` (`if (!user) return`). `phoneRequired = false` en ese caso no
habilita nada: sin usuario no hay submit posible.

## ADR-7 — El atributo HTML `required` del campo teléfono **se queda** en los 4 formularios admin

**Decisión.** No se toca `required` en `owner-create.tsx:240`, `reseller-create.tsx:190` ni sus
equivalentes de edición.

**Por qué.** El contrato saca el **formato** (`+53`), no el **requisito**: el teléfono sigue
siendo obligatorio para owner y reseller (`login-is-not-email.md:87-88` dice "no validation" para
el regex; `:102-106` deja explícito que el `NotEmpty` del backend se queda). El `required` nativo
no es validación de formato: es la contraparte cliente de ese `NotEmpty`. Sacarlo iría más lejos
que el contrato.

**Consecuencia para los tests** (verificada): los tests actuales disparan
`fireEvent.submit(form)` directo (`owner-create.test.tsx:336,363`), que **no** pasa por la
validación de restricciones del navegador. El camino del 400 es testeable en vitest sin pelearse
con el `required`.

## ADR-8 — Regex y camino del 400 caen en el **mismo** commit por formulario

**Decisión.** El proposal ordena "(c) primero el 400, después (a) los borrados"
(`proposal.md:98-100`). Se refina: el helper compartido va primero (es una unidad aislada y
testeable), pero **por cada formulario**, el borrado del regex y el cableado del `byCode` van
juntos en el mismo commit.

**Por qué.** Un commit que borra el regex sin el `byCode` deja ese formulario mostrando
*"Ocurrió un error. Intentá de nuevo."* ante un teléfono vacío — exactamente lo que el contrato
prohíbe entregar (`login-is-not-email.md:105-106`). Con commits por work unit, cada commit tiene
que ser un estado entregable, no solo el PR completo.

---

# Corrección al insumo: los 2 tests del 400 genérico **no** se dan vuelta

`explore.md:94` y `proposal.md:126` afirman que `owner-create.test.tsx:498-514` y
`owner-edit.test.tsx:646-652` "pinean el mensaje genérico roto del 400 y hay que darlos vuelta".
**Verificado, y es incorrecto.** Los dos rechazan con un objeto **sin body**:

- `owner-create.test.tsx:502-504` → `mockRejectedValue({ response: { status: 400 } })`
- `owner-edit.test.tsx:647` → `submitWithRejection({ response: { status: 400 } })`

Bajo este diseño, un 400 **sin** `data.errors` no tiene ningún `code` que mapear y cae al fallback
`OWNER.ERROR` por ADR-4. Los dos tests **siguen verdes sin tocarlos**, y de yapa se convierten en
la red de regresión del fallback. Los títulos ("unclassified status") ya describen bien lo que
afirman.

Esto baja el conteo de tests a modificar de 7 a **5**, y agrega **8 tests nuevos** (2 por
formulario: casing de create y casing de update).

---

# Mapa de componentes

```
                 ┌───────────────────────────────────────────────┐
                 │ shared/lib/http/api-error-message.ts   [NUEVO] │
                 │  apiErrorMessageId(error, {byCode,byStatus,    │
                 │                            fallback})         │
                 │  API_ERROR_CODE_CELL_PHONE = 'cellphone'      │
                 └───────┬───────────────────────────┬───────────┘
                         │ delega                    │ directo
        ┌────────────────┴──────────────┐   ┌────────┴─────────────────┐
        │ admin/owners/lib/             │   │ reseller-create.tsx      │
        │   owner-error-message.ts      │   │ reseller-edit.tsx        │
        │   (wrapper, fallback OWNER)   │   │ (fallback RESELLERS)     │
        └────────┬──────────────────────┘   └──────────────────────────┘
                 │
        ┌────────┴───────────────┐
        │ owner-create.tsx       │
        │ owner-edit.tsx         │   ← los 4 pintan en su <p role="alert"> YA EXISTENTE
        └────────────────────────┘

   (independientes del helper — no consumen el 400)
        UserDetailsForm.tsx ......... se le saca el chequeo
        edit-profile-form.tsx ....... prop phoneRequired
        profile/routes/edit-profile.tsx ... calcula el rol
```

## Puntos de integración — fichero por fichero

| Fichero | Acción | Detalle |
|---|---|---|
| `shared/lib/http/api-error-message.ts` | **Nuevo** | `apiErrorMessageId` + `API_ERROR_CODE_CELL_PHONE` |
| `admin/owners/lib/owner-error-message.ts` | Modificado | 3er param opcional `byCode`; el cuerpo delega |
| `admin/owners/routes/owner-create.tsx` | Modificado | fuera `PHONE_REGEX` (`:21`) y su bloque (`:79-83`); `:106` suma `byCode` |
| `admin/owners/routes/owner-edit.tsx` | Modificado | fuera const (`:27`) y bloque (`:200-203`); `:241` suma `byCode`. **Los call sites de carga (`:155`, `:172`) no se tocan** |
| `admin/resellers/routes/reseller-create.tsx` | Modificado | fuera const (`:16`) y bloque (`:58-62`); `catch {}` (`:81`) → `catch (error)` + `apiErrorMessageId` |
| `admin/resellers/routes/reseller-edit.tsx` | Modificado | fuera const (`:14`) y bloque (`:106-109`); `catch {}` (`:132`) → ídem |
| `management/users/components/UserDetailsForm.tsx` | Modificado | fuera `:46-49`, **y también** el estado `cellPhoneError` (`:40`), su limpieza en el `onChange` (`:106`) y su render (`:109-111`) — sin el chequeo quedan muertos |
| `profile/components/edit-profile-form.tsx` | Modificado | prop `phoneRequired?: boolean = true`; condición `:42` |
| `profile/routes/edit-profile.tsx` | Modificado | calcula el booleano; lo pasa en `:64-71` |
| `shared/lib/i18n/es.ts` | Modificado | +2 claves, −3 claves (ADR-5) |
| `management/users/components/UserCreateForm.tsx` | **Sin cambios** | Verificar que sigue sin validar teléfono |
| `backend/src/**` | **Sin cambios** | Decisión cerrada (`proposal.md:71-72`) |
| `frontend-react/e2e/**` | **Sin cambios** | Ningún spec implicado |

---

# Estrategia de tests — STRICT TDD activo

Runner: turbo/vitest bajo `frontend-react/`. **Cada work unit empieza en rojo.**

## WU1 — El helper (puro, sin UI)

**RED**: `shared/lib/http/__tests__/api-error-message.test.ts` (el directorio ya existe).
Casos, todos antes de escribir el helper:

| # | Entrada | Espera |
|---|---|---|
| 1 | `{ response: { status: 400, data: { errors: [{ code: 'Cellphone' }] } } }` | la clave de `byCode.cellphone` |
| 2 | ídem con `code: 'CellPhone'` | **la misma** clave (el caso del casing) |
| 3 | `errors: [{ code: 'FullName' }, { code: 'CellPhone' }]` | la clave del teléfono (ADR-3) |
| 4 | `{ response: { status: 400 } }` (sin body) | `fallback` |
| 5 | `{ response: { status: 400, data: { errors: [{ code: 'FullName' }] } } }` | `fallback`, **nunca** la del teléfono |
| 6 | `{ response: { status: 409 } }` con `byStatus[409]` | la clave del status |
| 7 | 400 con `code` conocido **y** `byStatus[400]` definido | gana `byCode` (ADR-4) |
| 8 | `{ succeeded: false, errors: [{ code: 'CellPhone' }] }` (envelope) | la clave del teléfono |
| 9 | `{ isNetworkError: true }`, `undefined`, `null` | `fallback` |
| 10 | `errors` que no es array, o `code` que no es string | `fallback`, sin tirar |

**GREEN**: escribir `api-error-message.ts` y convertir `owner-error-message.ts` en wrapper.
**Barra**: `owner-error-message.test.ts` (11 aserciones) tiene que quedar **verde sin tocarlo**.
Si hay que editarlo, la delegación cambió conducta y el refactor está mal.

## WU2 — Formularios de owner

**RED**: en `owner-create.test.tsx` y `owner-edit.test.tsx`, **borrar** el test de formato
(`:350-371` y `:475-498` — son vitest de componente, no E2E) y **agregar** por fichero un test
que rechace con `{ response: { status: 400, data: { errors: [{ code: 'Cellphone' }] } } }` en
create / `'CellPhone'` en edit, y afirme `getByRole('alert')` con
`esMessages['OWNER.PHONE_REQUIRED']`.
**GREEN**: claves i18n, fuera el regex, `byCode` en los 2 `catch`.
**Intactos**: los 2 tests del 400 genérico (ver la corrección de arriba) y los de 409/403/404.

## WU3 — Formularios de reseller

Mismo patrón. Borrar `reseller-create.test.tsx:~199-228` y `reseller-edit.test.tsx:413-438`;
agregar los 2 tests de 400 con los dos casings; después el `catch (error)` + `apiErrorMessageId`.

## WU4 — Editar usuario

**RED**: dar vuelta `user-details-form.test.tsx:79-97` — con el teléfono vacío, `onSubmit`
**se llama**, y no aparece el mensaje de obligatorio.
**GREEN**: borrar el chequeo y el estado `cellPhoneError` completo.

## WU5 — Perfil propio

**RED**, dos niveles:

- Componente (`edit-profile-form.test.tsx:70-124`): con `phoneRequired={false}` y teléfono vacío
  → `onSubmit` se llama; con `phoneRequired` **omitido** (default `true`) → sigue bloqueando. Ese
  segundo test es el que pinea el fail-safe del ADR-6.
- Ruta (`profile/routes/__tests__/profile-routes.test.tsx`): el mock de `useAuthStore` ya expone
  `isOwnerAdmin` / `isReSeller` (`:25-26`), así que se puede afirmar que un usuario sin rol guarda
  con el teléfono vacío y uno con rol no.

**GREEN**: la prop y el cálculo en la ruta.

## WU6 — Limpieza de i18n

Borrar las 3 claves huérfanas (ADR-5). Se puede plegar al final de WU2-WU4; se lista aparte para
que nadie la olvide. **Barra**: un grep de las 3 claves en `frontend-react/apps/` y
`frontend-react/packages/` tiene que volver vacío.

## Ninguna E2E implicada

Cero cambios en `frontend-react/e2e/`. Los E2E de backend (`OwnersCreateValidationTests.cs:39`,
`OwnersUpdateGapTests.cs:23-34`, `AuthRegisterValidationTests.cs:47-48`,
`UsersUpdateTests.cs:139-152`) tampoco se tocan: ninguna regla de backend cambia.

---

# Fronteras de work unit y presupuesto de review

| WU | Alcance | Prod. (líneas ≈) | Tests (líneas ≈) |
|---|---|---|---|
| WU1 | helper + wrapper | ~55 | ~110 |
| WU2 | owners (2 formularios) | ~25 | ~60 (−45 borradas, +55 nuevas) |
| WU3 | resellers (2 formularios) | ~25 | ~60 |
| WU4 | `UserDetailsForm` | −12 | ~20 |
| WU5 | perfil + ruta | ~15 | ~45 |
| WU6 | i18n | ~5 | 0 |
| | **Total** | **~115** | **~295** |

**Estimado: ~410 líneas cambiadas.** Riesgo de presupuesto de 400: **medio-alto**. Sigue siendo
candidato a PRs encadenados, pero por poco.

**Cuánto ahorró sacar el slot inline.** El diseño del proposal sumaba, por cada uno de los 4
formularios: estado `cellPhoneError`, limpieza en el `onChange`, el `<p>` bajo el campo, y ramificar
el `catch` entre error de campo y error de banner (≈12 líneas de producción), más un test de
ubicación del slot por formulario (≈25 líneas). Son **≈150 líneas** que no se escriben: pasaba de
~560 a ~410, un recorte de **~27%**. También borra el riesgo de que 4 formularios estrenen un
patrón de error por campo que hoy solo existe en `UserDetailsForm.tsx:109-111` — y que ese mismo
componente **pierde** en WU4.

**Corte sugerido si se encadena** (2 PRs, en este orden):

1. **PR 1 — el camino del 400** (WU1 + WU2 + WU3, ≈335 líneas): helper, owners, resellers. Cierra
   la cláusula de aceptación del contrato. Es autónomo y entregable solo.
2. **PR 2 — las relajaciones de requisito** (WU4 + WU5 + WU6, ≈75 líneas): editar usuario, perfil
   propio, limpieza. **No depende de WU1**, así que puede ir en paralelo o antes si conviene.

`sdd-tasks` decide el corte final; acá queda la frontera y su justificación.

---

# Checklist de diseño

- [ ] El helper vive en `shared/lib/http/api-error-message.ts` y `ownerErrorMessageId` delega sin cambiar conducta
- [ ] El mapeo discrimina por `code` en minúsculas, jamás por `status === 400`
- [ ] `'Cellphone'` (create) y `'CellPhone'` (update) caen en la **misma** clave
- [ ] Se recorre todo el array `errors`, no `errors[0]`
- [ ] Todo lo desconocido cae en `OWNER.ERROR` / `RESELLERS.ERROR` — nunca vacío, nunca de otro campo
- [ ] El error se pinta en el `<p role="alert">` que ya existe; cero UI nueva
- [ ] `phoneRequired` es opcional con default `true`, y la ruta lo calcula con `isOwnerAdmin || isReSeller`
- [ ] `es.ts`: +2 claves, −3 claves; grep de las borradas vuelve vacío
- [ ] `owner-error-message.test.ts` queda verde **sin editarlo**
- [ ] Los 2 tests del 400 sin body quedan verdes **sin editarlos**
- [ ] Cero diff en `frontend-react/e2e/` y en `backend/src/`

# Preguntas abiertas

Ninguna. Todo fork quedó cerrado por el contrato, por la decisión del usuario sobre el banner, o
por un ADR de este documento.

# Próximo paso

`sdd-tasks` — cortar WU1-WU6 en pasos ejecutables, con el pronóstico de review de arriba y el
corte de 2 PRs como punto de partida.
