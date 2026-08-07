# S1-01 — Plan de backend

> Trabajo **diferido**. Nada de acá se ejecuta sin decisión explícita del usuario.
>
> Plan de backend específico de [S1-01](S1-01.md). Sale de una auditoría del 2026-08-07 que contrastó **cada aserción declarada en la US** contra el código real de `backend/src/SMCA.WebApi.E2ETests/`. No sale de leer la sección "Estado de cobertura" de la US: esa sección es justamente lo que estaba mal.
>
> **Regla del proyecto (`CLAUDE.md`, innegociable)**: tocar un test E2E existente requiere autorización explícita. Agregar tests nuevos está permitido.

## Qué encontró la auditoría

La US marca **8 aserciones de backend como cubiertas (`[x]`)**. El único test de registro que las cubriría es `Auth/AuthRegisterSuccessTests.cs:28` (`Register_with_valid_payload_creates_owner_and_store`), y ese test afirma **cuatro cosas**: 201 Created, `Succeeded`, el `login` devuelto, y que existen un `Owner` y un `Store` para el tenant.

Todo lo demás que la US declara **no lo afirma nadie**. Los checkboxes describen el comportamiento del **código de producción**, no cobertura de test.

## Aserciones declaradas cubiertas que ningún test E2E verifica

| # | Aserción de la US | Estado real |
|---|---|---|
| 1 | `owner.User.SelectedStoreId` queda seteado al id de la tienda recién creada | Sin test en el camino de registro. `SelectedStoreId` sí se afirma en otros contextos (`StoreCreateAuthorizationGapTests`, `AuthMePermissionsTests`), nunca como efecto de `POST /v1/auth/register` |
| 2 | La descripción del Owner se compone como `"Nombre de la tienda: " + storeName` | Sin test. Grep literal de `Nombre de la tienda` en toda la suite E2E: cero |
| 3 | La tienda se crea con `description = "Tienda de prueba"` y `approved = false` | Sin test. Grep literal de `"Tienda de prueba"`: cero |
| 4 | La tienda recibe **todos** los módulos de `GetAvailableModulesToStore()`, gratuitos y pagos (**H-1**) | Sin test. Ningún test liga módulos al registro; `StoreCreationTrialTests` sí toca módulos, pero para facturación |
| 5 | La respuesta `AuthDto` **no** trae refresh token | Sin test. `AuthTokenLifetimeTests.cs:69` cubre el `ExpiresIn` del registro, pero nadie afirma la ausencia del refresh token |
| 6 | Si `code` matchea un ReSeller se crea un `ReSellerOwner` | Sin test en el camino de registro. `ReSellerOwner` aparece en tests de facturación, siempre sembrado a mano |

**Sí está cubierto**, para que no se re-verifique: `PaymentStartDate = hoy` → `Billing/StoreCreationTrialTests.cs:332` (`Register_creates_store_with_paymentStartDate_today`). Y el `ExpiresIn` del token → `Auth/AuthTokenLifetimeTests.cs:69`.

## Qué hacer

Extender `Auth/AuthRegisterSuccessTests.cs` —o agregar un fichero nuevo al lado— para afirmar los 6 puntos. Todos son verificables leyendo la base después del `POST /v1/auth/register`, que es lo que ese test ya hace para `Owner` y `Store`.

El #4 es el que más importa: **H-1** dice que la tienda nace con módulos **pagos** incluidos. Si eso cambia alguna vez, hoy no hay nada que lo detecte.

**Alcance.** Agregar aserciones a un test existente **requiere autorización**; crear un fichero nuevo al lado es aditivo y no la requiere.

## Corrección al propio fichero de la US

Los 6 checkboxes de arriba están en `[x]` y deberían estar en `[ ]`, o marcados como "comportamiento verificado por lectura de código, sin test E2E". Tal como están, el catálogo afirma una cobertura que no existe.
