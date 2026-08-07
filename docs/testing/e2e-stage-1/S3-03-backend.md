# S3-03 — Plan de backend

> Trabajo **diferido**. Nada de acá se ejecuta sin decisión explícita del usuario.
>
> Plan de backend específico de [S3-03](S3-03.md). Sale de una auditoría del 2026-08-07 que contrastó **cada aserción declarada en la US** contra el código real de `backend/src/SMCA.WebApi.E2ETests/`. No sale de leer la sección "Estado de cobertura" de la US: esa sección es justamente lo que estaba mal.
>
> **Regla del proyecto (`CLAUDE.md`, innegociable)**: tocar un test E2E existente requiere autorización explícita. Agregar tests nuevos está permitido.

## Qué encontró la auditoría

**Las dos aserciones en `[ ]` ya están cubiertas**, y el resultado sale partido: una mitad del aislamiento funciona y la otra no.

`Users/UsersIsolationTests.cs` llegó con el merge del 2026-08-07:

| Aserción de la US | Test | Resultado |
|---|---|---|
| Aislamiento **cross-tenant** en `PUT /v1/users/{id}` | `Update_owner_admin_updates_user_in_other_tenant_returns_envelope_404` | ✅ **Aísla**: HTTP 200 con `actionCode: 404` en el envelope, y el usuario ajeno **no se modifica** en base |
| Aislamiento **cross-store** (mismo tenant) | `Update_owner_admin_updates_user_in_other_store_returns_200` | ❌ **No aísla**: la edición se aplica |

O sea que **H-11 queda partida**: la mitad de tenant está cerrada; la de tienda es un defecto abierto.

Las otras 6 aserciones se verificaron y están cubiertas: `Delete_self_as_super_admin_returns_400`, `List_includeInactive_true/false`, `Delete_as_super_admin_soft_deletes`, `Activate_true/false`, `Update_partial_body_preserves_email_and_cellphone`, `Update_omitting_isActive_preserves_active_state`.

## Qué hacer

1. **Documentación**: pasar los 2 checkboxes a `[x]` y reescribir el bloque **FALTA** con el resultado partido.
2. **Decisión de producto**: el segundo test **fija como correcto** que un OwnerAdmin edite usuarios de otra tienda de su tenant. Si esa es la intención, no hay nada que hacer. Si no lo es, el arreglo toca producción **y** ese test.

**Alcance.** El punto 1 es solo documentación. El punto 2 toca un test existente: **autorización requerida**.
