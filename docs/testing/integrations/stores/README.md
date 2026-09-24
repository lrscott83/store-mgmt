# Integración — Tiendas, planes y conmutador

> Specs E2E cubiertos: `owner-stores.spec.ts`, `owner-store-create.spec.ts`,
> `owner-hard-delete.spec.ts`, `store-create-security.spec.ts`, `store-edit-by-id.spec.ts`,
> `store-update.spec.ts`, `store-plan-activation.spec.ts`, `store-plan-lock-regression.spec.ts`,
> `owner-plan-change-dialog.spec.ts`, `plan-change-permission-refresh.spec.ts`,
> `plan-catalog-superadmin.spec.ts`, `store-switch-back-logout.spec.ts`,
> `store-switcher-refresh.spec.ts` (27 tests).
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
| `owner-stores` E-01..E-05 — las tarjetas muestran plan, próxima fecha de pago y precio con descuento | Que cada tarjeta de tienda muestra su plan, su próxima fecha de pago y el precio con descuento aplicado | ⚠️ **Parcial** — el cálculo de la próxima fecha y del descuento es puro (fechas de plan + catálogo de precios); **visual:** las tarjetas | `management/stores/components/__tests__/` (3), `admin/owners/lib/__tests__/` (1) |
| `owner-stores` E-06 — el popup Editar renombra la tienda | Que el rename persiste | ⚠️ **Parcial** — el update es del servicio; **visual:** el popup y la tarjeta | `management/stores/lib/services/__tests__/` (1), `management/stores/routes/__tests__/` (7) |
| `owner-stores` E-07 — el popup Editar desactiva y reactiva la tienda | Que el ciclo activo/inactivo persiste | ⚠️ **Parcial** — ídem | ídem |
| `owner-stores` E-09 — el popup "Editar el plan" permite cambiar el plan PAGO (AD7) | Que un cambio de plan en una tienda paga se guarda | ⚠️ **Parcial** — la regla de planes es del dominio/servicio; **visual:** el popup y el plan mostrado | `management/stores/components/__tests__/`, dominio (planes) |
| `owner-stores` E-08 — el popup "Editar el plan" guarda un cambio de plan en una tienda libre | Que una tienda en plan libre también puede cambiar de plan | ⚠️ **Parcial** — ídem | ídem |
| `owner-store-create` MC-01 — el botón "+ Tienda" solo aparece con MultiStores en la tienda seleccionada | Que crear tienda está condicionado a MultiStores | ⚠️ **Parcial** — el gate es puro (`hasMultiStores`); **visual:** el botón | `shared/lib/multistore/__tests__/` (1), `management/stores/components/__tests__/` |
| `owner-store-create` MC-02 — crear una tienda hace POST del contrato del owner y hereda módulos | Que el alta de tienda arma el payload correcto y hereda los módulos | ⚠️ **Parcial** — el payload y la herencia de módulos son del servicio (asertables con el HTTP mockeado); **visual/red:** el POST real | `management/stores/lib/services/__tests__/`, `management/stores/routes/__tests__/` |
| `owner-store-create` MC-04 — la API rechaza un cuerpo no-owner (pin de 403) | Que el backend no acepta el alta por la vía del owner | ❌ **No** — es una garantía del backend | Backend E2E (`SMCA.WebApi.E2ETests`) |
| `owner-hard-delete` — el menú de engranaje muestra Eliminar | Que el engranaje ofrece borrar el owner | ❌ **No** — aserción de pantalla | — |
| `owner-hard-delete` — pulsar Eliminar abre el diálogo de confirmación | Que el borrado pide confirmación | ❌ **No** — interacción de interfaz | — |
| `owner-hard-delete` — cancelar el diálogo no borra el owner | Que cancelar no borra nada | ⚠️ **Parcial** — "no se borró" es verificable en el servicio/estado; **visual:** el diálogo | `admin/owners/routes/__tests__/` (3) |
| `store-create-security` — un OwnerAdmin en `/management/stores/create` ve el formulario de edición y guarda con PUT | Que esa ruta no crea una tienda sino que cae en el formulario de edición | ⚠️ **Parcial** — el verbo HTTP (PUT vs POST) es del servicio; **visual:** la ruta y el formulario | `management/stores/routes/__tests__/` |
| `store-create-security` — un StoreUser en `/management/stores/create` es deslogueado y va a /login | Que un usuario de tienda no entra a esa ruta | ⚠️ **Parcial** — el gate es puro (`featureLoader`); **visual:** la redirección y el logout | `auth/routes/__tests__/loaders.test.ts` |
| `store-edit-by-id` FC-B1 — el formulario se pre-carga con los datos de la tienda y guardar funciona | Que el formulario de edición por id pre-carga y guarda | ⚠️ **Parcial** — la lectura/escritura son del servicio; **visual:** el formulario pre-cargado | `management/stores/routes/__tests__/` (7) |
| `store-update` — la vista Update guarda datos sin tocar el plan y el menú ya no muestra el enlace Plan | Que el update de datos no altera el plan y que la vista no ofrece cambiar plan por ahí | ⚠️ **Parcial** — que el payload no incluya el plan es del servicio (asertable); **visual:** el menú y el formulario | `management/stores/routes/__tests__/` |
| `store-plan-activation` — un OwnerAdmin cambia el plan de su tienda vía POST change-plan | Que el cambio de plan usa el endpoint correcto | ⚠️ **Parcial** — el endpoint/contrato es del servicio (asertable con el HTTP mockeado); **visual/red:** el POST real y los paneles de plan | `management/stores/routes/__tests__/`, `management/stores/components/__tests__/` |
| `store-plan-activation` — un fallo de carga por red muestra el mensaje de conexión y no monta los paneles | Que un fallo de red degrada con su mensaje y sin paneles | ⚠️ **Parcial** — el manejo del error es del servicio/store; **visual:** el mensaje y la ausencia de paneles | `shared/lib/http/__tests__/` (6) |
| `store-plan-lock-regression` — el cambio de plan va por change-plan, nunca por PUT; el ancla `paymentStartDate` queda intacta | Que el cambio de plan no toca la fecha ancla del plan | ❌ **No** — la fecha ancla la decide el backend; desde el frontend solo se ve lo que devuelve HTTP. *(Known-issue Grupo B: el test compara fechas con `toBe`.)* | Backend E2E (`SMCA.WebApi.E2ETests`), `Application.Tests` |
| `owner-plan-change-dialog` — el OwnerAdmin cambia el plan desde el diálogo (POST change-plan, ancla intacta) | Ídem, desde el diálogo | ❌ **No** — ídem. *(Known-issue Grupo B: mismo defecto de comparación de fechas.)* | ídem |
| `plan-change-permission-refresh` — cambiar el plan refresca permisos y menú en ambas direcciones, sin recargar | Que tras cambiar de plan, el menú refleja los módulos nuevos sin recargar | ⚠️ **Parcial** — el gate de módulos es puro (`isModuleAvailable` sobre los módulos refrescados); **visual:** el menú que aparece/desaparece sin recargar | `shared/lib/auth/__tests__/` (4), `management/stores/routes/__tests__/` |
| `plan-catalog-superadmin` PCF1 — el popup muestra los cuatro paneles de plan incluido VIP | Que el catálogo de planes se pinta completo | ⚠️ **Parcial** — el catálogo es del dominio; **visual:** los paneles | dominio (planes), `admin/features/routes/__tests__/` |
| `plan-catalog-superadmin` PCF2 — Superior lista "Múltiples monedas" y "Elaboración"; VIP lista su "Múltiples pagos" exclusivo | Que cada plan lista exactamente sus módulos | ⚠️ **Parcial** — la asignación plan→módulos es del dominio (asertable sin navegador); **visual:** los paneles del popup | dominio (planes/módulos) |
| `store-switch-back-logout` SSR-1 — cambiar a una segunda tienda entra en ella sin cerrar sesión | Que el cambio de tienda no cierra la sesión | ⚠️ **Parcial** — la sesión/wrap de tienda es del servicio de auth; **visual:** el conmutador y el home de la otra tienda | `shared/lib/stores/__tests__/` (10), `shared/lib/offline/__tests__/` (14) |
| `store-switch-back-logout` SSR-2 — volver a la tienda del login NO cierra la sesión | Que el camino de vuelta tampoco desloguea | ⚠️ **Parcial** — ídem | ídem |
| `store-switch-back-logout` SSR-3 — crear-después-de-login: ninguno de los dos cambios cierra la sesión | Que con un wrap emitido por el servidor ninguno de los dos switches desloguea | ⚠️ **Parcial** — ídem | ídem |
| `store-switcher-refresh` SWR-1 — una tienda creada en esta sesión aparece en el conmutador sin re-login | Que el conmutador se actualiza tras crear una tienda | ⚠️ **Parcial** — la lista de tiendas del usuario es del store/servicio; **visual:** el conmutador del header | `shared/lib/stores/__tests__/`, `shared/lib/multistore/__tests__/` |
| `store-switcher-refresh` SWR-2 — una tienda desactivada desaparece del conmutador (la actual nunca) | Que el conmutador oculta la tienda desactivada pero nunca la activa | ⚠️ **Parcial** — la regla de filtrado es pura; **visual:** el conmutador | ídem |

**Ninguno es ✅ Total.** El Grupo B (`store-plan-lock-regression`, `owner-plan-change-dialog`) es la
excepción invertida: no se puede probar desde el frontend **ni** con integración, porque la garantía
es del backend (candidato natural a un test de integración de backend).

- *Actualizado: 2026-09-24.*
