# Feature: owner-welcome-message

Rama: `dev`. Alcance: backend (producción) + `backend/src/SMCA.WebApi.E2ETests/Infrastructure/DbTestHelpers.cs` (**AUTORIZADO** por el usuario 2026-10-02, es soporte E2E).

## Objetivo

Cuando se crea un **owner**, enviarle automáticamente un mensaje de bienvenida en su conversación de chat. Ocurre en los **dos** flujos:

- el owner se registra por su cuenta;
- el Gestor/ReSeller crea un owner.

Ambos convergen en `IRegisterService.RegisterAsync`.

## Texto (decidido por el usuario, no se altera)

```
¡Hola, {Nombre Completo}! 👋
Te damos la bienvenida. Tu tienda ya está lista y puedes empezar a vender desde el primer momento.
Estamos aquí para ayudarte a hacer crecer tu negocio. Si te surge cualquier duda o quieres dejarnos una sugerencia, escríbenos por aquí con todo el gusto.
¡Mucho éxito!
```

`{Nombre Completo}` = `User.FullName` del owner creado.

## Decisiones tomadas

- **Remitente:** `MessageSenderType.SuperAdmin` y `DataUtils.SuperAdminUser.Id` (`38b96d85-bf75-41ca-bfd7-796e7fe0ebc8`). NO usar `GetSuperAdminIdAsync()` (sin orden → puede devolver `Guid.Empty`).
- **Se escribe DESPUÉS del commit del handler**, nunca dentro de `RegisterService`: los métodos de `MessageRepository` hacen `SaveChangesAsync` por su cuenta, así que llamarlos antes del `SaveChangesAsync` del handler devuelve 0 cambios y rompe el registro con `Register.FailedToSave`.
- **No bloquea el registro:** si el mensaje falla, try/catch + log y se sigue. Un saludo nunca impide un alta.
- **Solo owners:** `RegisterService` también registra ReSeller/SuperAdmin; el saludo es únicamente para OwnerAdmin.
- **Ids:** `Conversation.OwnerId` y `Message.RecipientId` son el **UserId** del owner, no el id de la entidad `Owner`.
- **Conversación get-or-create** (`GetConversationByOwnerAndStoreAsync` → `Conversation.Create`) porque hay índice único en `(OwnerId, StoreId)`; y llamar `UpdateLastMessage` como hacen los otros dos caminos de escritura.
- El outbox y los interceptores de eventos de dominio están **muertos** (interceptor comentado en `Infrastructure/DependencyInjection.cs:39`, cero `INotificationHandler`): no son mecanismo de "después del commit".

## Tareas

- [x] T1 Servicio `OwnerWelcomeMessage` (política + gate + `Resolve`) y `OwnerWelcomeMessageService` (escritura, try/catch, `ILogger`)
- [x] T2 Conectado en `RegisterCommand.cs:92` y `CreateOwnerCommand.cs:112`, ambos **después** de su `SaveChangesAsync` y del guard de `changesSaved <= 0`
- [x] T3 `DbTestHelpers`: `Message` + `Conversation` en `ResetDataAsync` y `CleanupTenantCascadeAsync` (autorizado). Las conversaciones se resuelven por los `UserId` de los owners del tenant y deben borrarse **antes** de `RemoveByTenantAsync<Owner>` (`Conversation`/`Message` extienden `AuditableEntity`, no `ITenantBaseEntity`: no tienen columna `TenantId`).
- [x] T4 Tests: 29 unitarios nuevos (servicio + gate del handler), y `RegisterCommandHandlerTestFixture` actualizado por la nueva dependencia de constructor.
- [x] T5 E2E nuevo `Messages/OwnerWelcomeMessageRegistrationTests.cs` (1 test, 683 total).

## Corrección de un error factual mío (2026-10-02)

Afirmé que `RegisterService` "también registra ReSeller/SuperAdmin" y por eso el gate OwnerAdmin era necesario. **Es falso**: `CreateOwnerService.cs:51` fija `RoleType.OwnerAdmin` sin ramas, y un Gestor se crea por `CreateReSellerCommand.cs:77`, que nunca llama a `IRegisterService`. El gate se conserva como guarda explícita y documentada (`Owner.Guest == false`), pero hoy siempre es verdadero en producción.

## Evidencia (2026-10-02)

- `dotnet build src/SMCA.sln` → 0 errores
- `dotnet test src/Domain.UnitTests` → **105/105**
- `dotnet test src/Application.Tests` → **586/586** (557 previos + 29 nuevos)
- `dotnet test src/SMCA.WebApi.E2ETests` → **683/683** (682 previos + 1 nuevo), con PostgreSQL real
- Texto verificado byte a byte contra el aprobado (290 chars con un nombre de 12; la columna permite 4000). Usa escapes `\n` explícitos para que un checkout CRLF no hornee `\r\n` en el mensaje almacenado.
- Sin push todavía (decisión del usuario).

## Commit

- `b98be7b0` feat(messages): send a welcome message when an owner registers