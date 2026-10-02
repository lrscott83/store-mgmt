# RegisterService — extracción del registro compartido

## Objetivo

Que "crear propietario desde un Gestor" use **el mismo código** que el registro público, de modo
que la operación cree owner **y tienda** (hoy solo crea owner). Se extrae la lógica de
`RegisterCommandHandler` a un `IRegisterService` / `RegisterService`, siguiendo el patrón ya
establecido de `ICreateStoreService` / `CreateStoreService`.

## Problema

`CreateOwnerCommandHandler` (POST /api/v1/Owners) solo crea el owner y, si el actor es Gestor, el
link `ReSellerOwner`. No crea tienda: no inyecta `ICreateStoreService` y `CreateOwnerCommand` ni
siquiera tiene campo de nombre de tienda. No hay ruta alternativa — la pantalla
`/management/stores/create` está detrás de `ownerStoresGate()` → `adminLoader()` (SuperAdmin u
OwnerAdmin únicamente), así que un Gestor tampoco puede crearla por a mano.

## Por qué

Dos flujos casi idénticos se habían separado: el registro público (`RegisterCommandHandler`) crea
owner + tienda + plan; el alta desde el Gestor crea owner. La divergencia no fue una decisión, fue
omisión. El Gestor queda con clientes sin tienda, sin Billing y sin módulos.

## Alcance

### Incluye
- `IRegisterService` + `RegisterService` en `Application/Services/Authentication/`.
- `RegisterCommandHandler` pasa a delegar (conserva token + save).
- `CreateOwnerCommandHandler` pasa a delegar (conserva su `OwnerDto` + save + manejo de duplicados).
- `StoreName` nuevo en `CreateOwnerCommand` + validador + formulario React.
- Tests del handler reubicados al servicio; el fixture se reacomoda.

### Fuera de alcance
- Cambiar el contrato público de `POST /auth/register`. `Code` sigue siendo el campo público.
- Plan distinto de Pago para las tiendas del Gestor.
- La descripción `"Tienda de prueba"` de la tienda se mantiene.
- `OwnerDto.StoreModules` puede quedar vacío en la respuesta del create (el link owner→stores no
  se puebla en memoria). Es la misma clase de defecto que el `ReSellerName` ya corregido, pero no
  afecta el síntoma reportado. Se anota, no se toca.

## Decisiones

| Decisión | Motivo |
|---|---|
| El servicio devuelve `Owner`, no `AuthDto` | El token es responsabilidad de auth; `CreateOwnerCommandHandler` recibiría algo que no sabe usar |
| Fallos por `ApiException` con los mismos `AcctionCode` | `ErrorHandlerMiddleware.cs:88-92` produce respuesta idéntica a `ResponseResult.Failure`, así que el contrato público no se mueve |
| El save **siempre** en el handler, nunca en el servicio | Un solo `SaveChangesAsync` al final. Verificado: `CreateOwnerService` y `CreateStoreService` no guardan, y `GenericRepository.cs:67` lo dice textual |
| `Code` se mantiene en el comando público | Renombrarlo rompe 3 tests del validador y el formulario React sin ganancia |
| `reSellerLogin` sale del actor autenticado en el flujo Gestor | `OwnersCreateGestorAutoAssignTests` criterio 2 prohíbe que un Gestor colgue su owner en otro Gestor |
| Gestor inexistente se tolera (no es error) | El E2E existente depende de esa tolerancia |
| Nombre de tienda = campo del formulario | `RegisterCommandValidator` ya lo exige; sin él el servicio no puede crear la tienda |

## Contrato que se preserva (invariantes)

- Ningún código de error cambia: `Register.PlanLoadFailed`, `Register.OwnerUserNotCreated`,
  `Register.ReSellerAssociationFailed`, `Register.FailedToSave`.
- Ninguna aserción se borra ni se debilita.
- Los 6 E2E de `SMCA.WebApi.E2ETests/Auth/AuthRegister*` quedan **sin tocar**.
- Los 33 tests de `RegisterCommandValidator*` quedan **sin tocar**.
- Si alguno de esos necesitara tocarse, es señal de que cambió comportamiento observable → parar.

## Verificación

- Compilación limpia de `Application`, `SMCA.WebApi` y los dos proyectos de test.
- Tests de register (unitarios) verdes.
- E2E de Auth (register) verdes sin modificación.
- E2E de Owners verdes (`OwnersCreateGestorAutoAssignTests` incluido).
- Nuevo E2E: owner creado por Gestor trae tienda con los módulos del plan Pago.
- Frontend: typecheck, lint y suite.

## Tareas

- [x] T1 `IRegisterService` + `RegisterService` (lógica movida sin cambios de comportamiento)
- [x] T2 `RegisterCommandHandler` delega; conserva token y save
- [x] T3 `CreateOwnerCommand` + validador: campo `StoreName`
- [x] T4 `CreateOwnerCommandHandler` delega; `reSellerLogin` derivado del actor
- [x] T5 DI registra `IRegisterService`
- [x] T6 Tests: 31 reubicados al servicio, fixture reducido, 18 en el handler + 5 nuevos
- [x] T7 Frontend: campo de nombre de tienda en el formulario del Gestor
- [x] T8 E2E nuevo: owner de Gestor trae tienda (plan Pago, módulos, approved, SelectedStoreId)
- [x] T9 Verificación completa

## Progreso — completado

### Una regresión evitada antes de escribir código

El diseño inicial era dejar que el servicio lanzara `ApiException` **sin** que el handler la
atrapara. El usuario pidió revisar por qué un refactor cambiaría algo, y la respuesta fue real:
`AuthController.cs:110-114` mapea todo fallo por un `switch` cuya rama por defecto **también** es
`BadRequest`. Un fallo devuelto da **HTTP 400**; una excepción que escapa al middleware da
**HTTP 500**. Mismo cuerpo, distinto status. Y `AuthRegisterPlanTests` solo cubre el 201, así que
los E2E no lo habrían detectado.

Corrección: el servicio lanza, el handler **atrapa** y rearma el `ResponseResult` idéntico.

### La asimetría entre los dos controladores

`OwnersController.cs:69-71` hace lo OPUESTO:
`return result.Succeeded ? CreatedAtAction(...) : Ok(result);` — `Ok` es HTTP 200.
Un fallo devuelto produce **HTTP 200** con `succeeded:false`. Como hoy los fallos se lanzan, en
owner-create hay que **dejar escapar** la excepción. O sea: register **atrapa**, owner-create
**propaga**. Cada handler devuelve lo que le corresponde, como pidió el usuario.

### Verificación

| Suite | Resultado |
|---|---|
| `dotnet test src/SMCA.sln` | **1310 tests, 0 fallos** (682 E2E + 552 Application + 76 Domain) |
| E2E `AuthRegister*` | **21/21 sin tocar un solo archivo** — prueba del refactor puro |
| E2E `Owners*` | 80/80 |
| Frontend `app/admin/owners` | 150/150 |
| `pnpm typecheck` / `pnpm lint` | limpios |
| Frontend suite completa | 4934/4938; los 4 fallos son flakes preexistentes de auth/storage, **verificados en aislamiento: 60/60 verdes** |

### Tests que muerden (probados revirtiendo)

- **Regresión de status HTTP**: el nuevo `Handle_WhenServiceThrows_ShouldRebuildTheSameFailureResponse`
  falla si el handler deja escapar la excepción.
- **Creación de tienda**: desactivando `CreateStoreAsync` en el servicio,
  `Create_owner_as_reseller_creates_the_store_too` falla. No puede pasar sin el fix.

### E2E tocados (autorizados explícitamente por el usuario)

Solo para añadir `storeName` a los cuerpos, que pasó a ser obligatorio. Ninguna aserción se borró
ni se debilitó. Atención especial a dos que habrían pasado **por el motivo equivocado** sin el campo:

- `OwnersCreateValidationTests`: sus 8 tests affirman un código de error concreto; sin `storeName`
  válido habrían pasado por el error de `StoreName`, no por el que prueban.
- `Create_duplicate_login_409_Conflict`: sin `storeName` el validador devolvería 400 y nunca se
  llegaría al 409 del índice único que ese test existe para verificar.

### `OwnerDto.StoreModules` — CORREGIDO, no era un problema

Anoté antes que "puede quedar vacío porque el link owner→stores no se puebla en memoria". **Eso
era falso**, y estaba escrito de memoria sin verificar. Medido con un E2E:

- **Antes:** el endpoint no creaba tienda → `StoreModules = []` y `Approved = false`.
- **Ahora:** `StoreModules` trae la tienda y `Approved = true`.

Funciona porque el `SaveChanges` del handler corre **antes** del `_mapper.Map`, y el relationship
fixup de EF puebla `owner.Stores` en ese save. `RegisterService` nunca asigna la colección
(`CreateStoreService` solo recibe `ownerId` y agrega la `Store` por repositorio).

Impacto en la UI: ninguno, porque el frontend nunca lee esa respuesta — `owner-create.tsx` solo
mira `res.succeeded` y navega a `/admin/owners`, que vuelve a pedir la lista, y ahí sí se cargan
las tiendas por `Include`. Hay dos aserciones que lo fijan.