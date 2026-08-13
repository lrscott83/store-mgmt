# S3-03 — Plan de backend

> Trabajo **diferido**. Nada de acá se ejecuta sin decisión explícita del usuario.
>
> Plan de backend específico de [S3-03](S3-03.md). Sale de una auditoría del 2026-08-07 que contrastó **cada aserción declarada en la US** contra el código real de `backend/src/SMCA.WebApi.E2ETests/`. No sale de leer la sección "Estado de cobertura" de la US: esa sección es justamente lo que estaba mal.
>
> **Regla del proyecto (`CLAUDE.md`, innegociable)**: tocar un test E2E existente requiere autorización explícita. Agregar tests nuevos está permitido.

## Qué encontró la auditoría

**Las dos aserciones en `[ ]` están cubiertas y el resultado define la regla de negocio.**

`Users/UsersIsolationTests.cs` llegó con el merge del 2026-08-07:

| Aserción de la US | Test | Resultado |
|---|---|---|
| Aislamiento **cross-tenant** en `PUT /v1/users/{id}` | `Update_owner_admin_updates_user_in_other_tenant_returns_envelope_404` | ✅ **Aísla**: envelope `actionCode: 404`, y el usuario ajeno **no se modifica** en base. La incógnita original (¿aplica el filtro global al camino `FindAsync`?) quedó respondida por corrida real: **sí aplica** |
| Edición **cross-store** (mismo tenant) | `Update_owner_admin_updates_user_in_other_store_returns_200` | ✅ **Es la regla de negocio**: la edición se aplica y es lo correcto |

**Decisión tomada el 2026-08-13**: la frontera de seguridad es el **tenant**, no la tienda. El OwnerAdmin es dueño del tenant —y de todas sus tiendas—, y su scope de gestión de usuarios es el tenant entero (`HttpContextService.cs:45-50`). El comportamiento que el segundo test fija como correcto **es la intención**; no hay defecto que arreglar. Ver **H-11** en el [plan general](README.md).

Las otras 6 aserciones se verificaron y están cubiertas: `Delete_self_as_super_admin_returns_400`, `List_includeInactive_true/false`, `Delete_as_super_admin_soft_deletes`, `Activate_true/false`, `Update_partial_body_preserves_email_and_cellphone`, `Update_omitting_isActive_preserves_active_state`.

## Qué hacer

1. **Documentación**: hecho — los 2 checkboxes quedaron `[x]` y el bloque de aislamiento describe la regla de negocio (ver `S3-03.md`).
2. **Nada más por hacer en backend**: sin scoping por tienda en el handler es comportamiento intencional. La única consideración que queda es de UI (qué lista muestra el OwnerAdmin según `SelectedStoreId`), que es producto, no seguridad.

**Alcance.** No se tocó ningún test existente; solo se actualizó la documentación.
