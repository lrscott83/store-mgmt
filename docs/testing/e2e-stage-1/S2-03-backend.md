# S2-03 — Plan de backend

> Trabajo **diferido**. Nada de acá se ejecuta sin decisión explícita del usuario.
>
> Plan de backend específico de [S2-03](S2-03.md). Sale de una auditoría del 2026-08-07 que contrastó **cada aserción declarada en la US** contra el código real de `backend/src/SMCA.WebApi.E2ETests/`. No sale de leer la sección "Estado de cobertura" de la US: esa sección es justamente lo que estaba mal.
>
> **Regla del proyecto (`CLAUDE.md`, innegociable)**: tocar un test E2E existente requiere autorización explícita. Agregar tests nuevos está permitido.

## Qué encontró la auditoría

**Tres de las cuatro aserciones en `[ ]` ya están cubiertas**, y lo que fijan es grave: confirman que el requisito de seguridad de esta US **no se cumple en producción**.

`Stores/StoreCreateAuthorizationGapTests.cs` llegó con el merge del 2026-08-07:

| Aserción de la US | Test | Qué demuestra |
|---|---|---|
| Un OwnerAdmin que llama `POST /v1/stores` directamente obtiene **201 Created** | `OwnerAdmin_with_stores_feature_can_create_store_directly_and_repoints_selected_store_id` | El endpoint **no defiende la regla**. La tienda nace |
| Tras esa llamada, su `SelectedStoreId` apunta a la tienda **nueva** | mismo test | Confirmado en base |
| Un caller que no es SuperAdmin ni OwnerAdmin recibe **400**, no 403 | `Store_user_with_stores_feature_gets_400_not_403` | Falla por forma, no por permiso |

**H-10 deja de ser un hueco de cobertura y pasa a ser un defecto de producción confirmado, con test que lo prueba.**

## Lo que sigue sin cubrir

| Aserción | Por qué |
|---|---|
| Tras el flujo **por UI**, la cantidad de filas `Store` del tenant es la misma | Necesita manejar el navegador. Es una aserción de dato **dependiente de Playwright**, y la capa frontend de esta US está en PENDIENTE |

## Qué hacer

1. **Documentación**: pasar los 3 checkboxes a `[x]` con sus citas, y reescribir el párrafo que dice *"NUEVO — no existe ningún test"*.
2. **Decisión de producto, que no es de testing**: el endpoint permite que un OwnerAdmin cree tiendas. Los tests hoy **fijan ese comportamiento como correcto**. Si la regla de la US es la que vale, entonces esos tests están pineando un bug — y arreglarlo significa cambiar producción **y** los tests. Eso requiere autorización explícita y no se decide acá.

**Alcance.** El punto 1 es solo documentación. El punto 2 toca tests existentes: **autorización requerida**.
