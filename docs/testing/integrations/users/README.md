# Integración — Usuarios

> Specs E2E cubiertos: `users-crud.spec.ts`, `create-store-user.spec.ts` (6 tests).
>
> **Leyenda**
> - ✅ **Total** — toda la afirmación es lógica de negocio y vive en servicios/repositorios/dominio.
> - ⚠️ **Parcial** — la lógica es probable sin navegador, pero el test además prueba algo que exige
>   render/router/red (se indica qué).
> - ❌ **No** — la afirmación depende del navegador o del backend real.
>
> **Regla del proyecto:** los specs E2E no se tocan sin autorización explícita del usuario.

| Test | Qué prueba | Clasificación | Ya cubierto en |
|---|---|---|---|
| `users-crud` — listar muestra usuarios, editar modifica y guarda | Que la lista carga los usuarios y que la edición persiste | ⚠️ **Parcial** — el listado y la edición son del servicio/repositorio de usuarios; **visual:** la tabla, el modal y el toast | `management/users/lib/services/__tests__/` (1), `management/users/components/__tests__/` (4) |
| `users-crud` — activar y desactivar usuario desde la lista | Que el ciclo de vida del usuario se refleja en la lista | ⚠️ **Parcial** — la regla de activo/inactivo es del servicio; **visual:** el estado en la fila y la confirmación | ídem |
| `users-crud` — offline: las acciones de ciclo de vida no emiten peticiones | Que activar/desactivar no llama a la red | ⚠️ **Parcial** — que no haya petición se puede probar con el bloqueador de HTTP de vitest; **visual:** el botón/estado del navegador offline | `shared/lib/http/__tests__/` (6), `app/shared/lib/testing/block-real-http.ts` |
| `create-store-user` — el payload incluye `roleIds [3]`, el storeId del usuario, y navega a la lista | Que el formulario arma el contrato correcto y navega tras guardar | ⚠️ **Parcial** — el payload se puede asertar con el servicio HTTP mockeado; **visual/red:** el POST real y la navegación | `management/users/lib/services/__tests__/`, `management/users/routes/__tests__/` (1) |
| `create-store-user` — offline: el botón guardar está deshabilitado | Que sin conexión no se puede guardar | ⚠️ **Parcial** — la regla depende de la conectividad (servicio puro); **visual:** el botón deshabilitado | `shared/lib/auth/__tests__/` (connectivity) |
| `create-store-user` — un StoreUser en `/management/users/create` es deslogueado | Que un usuario de tienda no puede entrar a crear usuarios | ⚠️ **Parcial** — el gate es puro (`featureLoader`/`isUserAuthorized`); **visual:** la redirección a /login y el logout | `auth/routes/__tests__/loaders.test.ts` |

**Ninguno es ✅ Total**: todos mezclan la regla de negocio con la tabla/modal renderizados o con el
backend real. La parte pura (payload, gate de permisos, offline) ya está cubierta en vitest.

- *Actualizado: 2026-09-24.*
