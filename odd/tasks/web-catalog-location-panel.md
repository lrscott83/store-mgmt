# Feature — Ubicación pública del catálogo en la vista del catálogo web

**Objetivo:** la captura de los campos públicos añadidos a `Store` (teléfono, ciudad, provincia,
coordenadas y horario) se muda del formulario de edición de tienda a un panel colapsable de la
vista `/sales/web-catalog`, ANTES de los productos. El dato sigue en `Store`; solo cambia la vista
que lo edita.
**Rama:** `dev` (base `622f712e`) · **Delivery:** work-unit commits, deploy manual del owner · **Runner:** vitest (`pnpm --filter @store-mgmt/web-store-pos test`).

## Specs

- **S1** — La vista `/sales/web-catalog` muestra un panel colapsable de "Ubicación y contacto"
  ANTES de la sección de productos, con los seis campos que la migración
  `20261019160559_AddStoreLocationFields` añadió a `Store`: teléfono público, ciudad, provincia,
  latitud, longitud y horario de apertura (7 días). Cita del owner: "en el catalogo web vamos a
  poner todos los campos que se adicionaron a Store para hacer este feature para el catalogo web".
- **S2** — El panel guarda con su propio botón (`updateStore` + `updateLocation: true`) y envía SOLO
  el bloque capturado: nombre, dirección, descripción, aprobado y activo viajan tal como vienen del
  `GET` de la tienda para que el guardado no pise nada fuera del bloque. Un campo vacío limpia el
  dato guardado (semántica del endpoint). Tras guardar: recarga desde el servidor y toast.
- **S3** — La vista de editar tienda queda como estaba antes de este feature: sin el bloque de
  ubicación en el formulario. Su submit sigue guardando la dirección: el endpoint aplica el bloque
  completo bajo `updateLocation` (Address incluida), así que el form sigue optando y pasa el bloque
  guardado sin tocarlo. Cita del owner: "la vista de editar tienda se queda como estaba antes de
  este feature".
- **S4** — Las etiquetas de la captura se mudan con ella: las claves `STORES.*` del bloque (título,
  campos, días, validaciones) pasan a `WEB_CATALOG.LOCATION_*` en el único catálogo (`es.ts`),
  porque su único consumidor era el bloque retirado.
- **S5** — Verificación: tests nuevos del panel; tests de la vista, del form y de la ruta de
  edición actualizados; `typecheck`, `lint` y suites de `web-store-pos` en verde.

**Supuestos (ajustables en una línea):** el panel nace expandido (el owner pidió "panel
colapsable", no plegado); su posición es inmediatamente antes de los productos (después del
showcase); el backend no se toca.

## Tasks

| ID  | Qué                                                                                                    | S#       | Ruta   | Estado    |
| --- | ------------------------------------------------------------------------------------------------------ | -------- | ------ | --------- |
| T1  | Panel `catalog-location-card.tsx` + claves `WEB_CATALOG.LOCATION_*` + montaje en la vista + tests      | S1,S2,S4 | inline | HECHO |
| T2  | Retiro del bloque en `store-form.tsx`, pass-through en `edit-store.tsx`, claves `STORES.*` retiradas, tests actualizados | S3 | inline | HECHO |
| T3  | Verificación final: typecheck, lint, suites afectadas                                                  | S5       | inline | HECHO |

## Log

- **L1 (2026-10-19, owner, textual):** "en el catalogo web vamos a poner todos los campos que se
  adicionaron a Store para hacer este feature para el catalogo web, la vista de editar tienda se
  queda como estaba antes de este feature".
- **L0 (contexto previo, textual):** "si esto es para el catalogo web, que hace en edit de la
  tienda? nunca mencione el edit de la tienda todo el tiempo fue el catalogo web"; "una cosa es
  donde se guarda y otra cosa es donde esta la vista. Quiero todo para esa vista antes de los
  productos y vamos a ponerla en un panel colapsable en esa vista".
- **Evidencia (código):** el bloque vive en `store-form.tsx:228-365` (solo edit); payload en
  `edit-store.tsx:137-147`; `UpdateStoreCommand.cs` (línea 155) aplica Address + bloque solo bajo
  `UpdateLocation` — de ahí el pass-through del form para no perder la dirección. Las claves
  `STORES.*` del bloque (1477-1497 de `es.ts`) tienen un único consumidor: ese bloque.
- **L2 (2026-10-19, evidencia de verificación):** tests focalizados: 6 archivos / 118 tests ✓ (panel nuevo,
  vista, form, ruta de edición). Suite de `web-store-pos`: 5683 passed / 1 failed / 6 skipped — el único
  fallo es `sync-routes.test.tsx > ExportPage > downloads via an anchor and never calls navigator.share`,
  flake de timeout PRE-EXISTENTE (ya documentado en `odd/tasks/sale-snapshot-completeness.md:198` como
  "timeout flaky") que pasa en ejecución aislada; nada de este feature lo toca. `typecheck` desde la raíz
  (`turbo run typecheck`): 5/5 ✓. `eslint . --max-warnings=0` en la app: 0.
- **L3 (2026-10-19, commits):** `e04de7ec` `refactor(stores): stop capturing the public location block in
  the store data form` (T2: form + pass-through + tests; 4 archivos, +47/−350) y `da99d52d`
  `feat(webcatalog): capture the public location block in the web catalog view` (T1 + mudanza de claves
  de S4; 5 archivos, +705/−22). Sin push: deploy y prod siguen siendo pasos manuales del owner.
- **L4 (2026-10-19, gotcha de entorno):** `pnpm typecheck` DENTRO de la app no reconstruye el dist de
  `@store-mgmt/domain` (el `^build` vive en el pipeline de turbo): con el dist viejo, `tsc` reporta que
  `publicPhone` y compañía "no existen" en `Store` aunque existan en `packages/domain/src` — docenas de
  errores falsos. Correr el typecheck desde `frontend-react/` (`pnpm typecheck`) y el dist queda fresco.
- **L5 (2026-10-19, owner, textual):** "Todos esos datos para el catalogo web de la tienda son opcionales,
  solo una sugerencia para un mejor SEO". Confirmado en las tres capas: el panel no exige ninguno (un campo
  vacío limpia), y el backend solo valida coherencia (pareja de coordenadas, día completo), no obligatoriedad.
- **L6 (2026-10-19, bug de producción encontrado por el owner):** `StoreAuthorizationTests.
  OwnerAdmin_update_ignores_superadmin_only_fields` en rojo determinista. Causa raíz: el PUT de
  `SMCA.WebApi/Controllers/v1/StoresController.cs` reconstruía el `UpdateStoreCommand` a mano con 8 de sus
  16 parámetros y T8a no tocó la capa WebApi — `UpdateLocation` llegaba siempre `false` por HTTP, así que el
  guardado del panel no persistía nada (200 silencioso). Fix: la reconstrucción pasa el bloque T8 con
  argumentos nombrados y `PlanId` sigue en `null` a propósito (el plan tiene su ruta propia). El test E2E
  existente recibe `UpdateLocation = true` (el flag es opt-in del bloque, no un privilegio).
- **L7 (2026-10-19, evidencia E2E):** `dotnet test` filtrado a `StoreAuthorizationTests.OwnerAdmin_...` y
  `StoreLocationUpdateTests`: Failed 0, Passed 3, Total 3 ✓ contra `smca_test` real (`[E2E Guard]` presente).
  Tests nuevos (`StoreLocationUpdateTests.cs`): con `updateLocation: true` persisten los seis campos; sin el
  flag, un rename conserva el bloque intacto.
- **Siguiente paso:** al desplegar, aplicar la migración `35-20261019-Add-Store-Location-Fields.sql`
  (pendiente). El E2E del catálogo web no cubre el bloque (lo cubren los unit tests del panel + los dos E2E
  nuevos del PUT).
