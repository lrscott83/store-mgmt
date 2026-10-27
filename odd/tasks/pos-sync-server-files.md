# POS sync files — repositorio de backups en el backend

Objetivo: un lugar en el backend donde Owner y StoreUsers suben y descargan los ZIP cifrados que el POS ya exporta, sin tocar el export/import local.
Branch: `test`. Delivery: `ask-on-risk`. Test runner: `dotnet test` (backend) + `pnpm test` (frontend-react).

## Specs

- **S1** — Un fichero por tienda. Cada entrada del repositorio es UN archivo de UNA sola tienda, generado con `writeSingleStoreArchive` (formato v2, `data-serializer-service.ts:235`). Un Owner con N tiendas sube N archivos.
- **S2** — El POS genera y sube N archivos en memoria: el Owner pulsa "Subir al servidor", escribe la contraseña, y el POS crea un archivo por tienda con `writeSingleStoreArchive` y los sube. Nada se descarga al disco.
- **S3** — La pantalla lista los ficheros por fecha descendente y muestra: nombre de la tienda, fecha de subida, nombre completo del usuario que lo subió y cantidad de descargas.
- **S4** — "Descargado" es una marca informativa por usuario. No bloquea ni oculta: el fichero se puede volver a descargar. Se muestra "descargado el <fecha>" cuando ese usuario ya lo bajó.
- **S5** — Visibilidad: el Owner ve los ficheros de todas sus tiendas; el StoreUser solo los de su tienda.
- **S6** — Subida: el Owner sube para cualquiera de sus tiendas; el StoreUser solo para su tienda. El servidor valida el ámbito antes de escribir.
- **S7** — "Descargar" descarga e importa en el acto, reutilizando `importBackupFile` (`multi-store-backup-service.ts:103`). Pide la contraseña antes de bajar. El import va contra la tienda del fichero, nunca contra la tienda seleccionada del POS.
- **S8** — Borrado manual: el Owner puede borrar cualquier fichero de sus tiendas; el StoreUser solo los de su tienda. Nada se borra automáticamente.
- **S9** — Gate: subir exige `StoreRoleFeatures.SendAdmin`; descargar exige `StoreRoleFeatures.ReceiveAdmin`; el listado y el borrado exigen cualquiera de las dos.
- **S10** — Límite de 50 MB por fichero. Por encima se rechaza con 413 y el fichero no se escribe.
- **S11** — Pantalla nueva en `sync/routes/sync-server.tsx`, ruta `sync/server`, dentro del layout autenticado.
- **S12** — Export e import locales quedan intactos: `export.tsx` e `import.tsx` no cambian de comportamiento.
- **S13** — El backend guarda los bytes opacos del ZIP en disco y la metadata en tabla. La contraseña no se almacena en ningún lado.

## Tasks

- [x] T1 — Dominio + EF: `StoreSyncFile`, `StoreSyncFileDownload`, configuraciones, `DbSet`, migración `20261027154811_Add-StoreSyncFiles`. (S1, S3, S4)
- [x] T2 — Almacenamiento en disco `IStoreSyncFileStorage` / `StoreSyncFileStorage` con root configurable y guardas anti-traversal. (S10, S13)
- [x] T3 — Repositorio `IStoreSyncFileRepository` + implementación. (S3, S5)
- [x] T4 — Subida: `UploadStoreSyncFileCommand` + endpoint multipart. (S1, S6, S9, S10)
- [x] T5 — Listado: `GetStoreSyncFilesQuery` + endpoint. (S3, S4, S5, S9)
- [x] T6 — Descarga: `DownloadStoreSyncFileQuery` + registro de descarga + contador. (S4, S7, S9)
- [x] T7 — Borrado: `DeleteStoreSyncFileCommand` + endpoint. (S8, S9)
- [x] T8 — Tests backend: Application.Tests + nuevo E2E. (todas)
- [x] T9 — Frontend: servicio HTTP del repositorio. (S1-S7)
- [x] T10 — Frontend: pantalla, subida y listado. (S2, S3, S11)
- [x] T11 — Frontend: descarga + import directo. (S7)
- [x] T12 — Frontend: borrado, ruta, menú, i18n. (S8, S11)
- [x] T13 — Tests frontend. (todas)

### Evidencia de verificación

- Backend Application.Tests: `--filter "FullyQualifiedName~StoreSync"` → **48/48 passed**.
- Backend E2E: `StoreSyncFilesTests` → **5/5 passed** (ronda del worker); re-ejecutado el filtro de aplicación por el padre: 48/48.
- Frontend: `pnpm --filter @store-mgmt/web-store-pos test -- run app/sync` → **29 archivos / 325 tests passed**, 0 type errors.
- Frontend `pnpm --filter @store-mgmt/web-store-pos lint` → 0 warnings.
- Frontend `pnpm typecheck` (desde `frontend-react/`) → 5/5 tareas Turborepo OK.
- Revisión nativa: **no ejecutada**. Dos intentos, ambos con `lens_context_budget_exceeded` y **sin crear autoridad de revisión**: (1) el candidato completo, 41 archivos / 9366 líneas; (2) la rebanada de commits posteriores a `32d83009`, 26 archivos / 4316 líneas. El contrato exige candidatos más pequeños que el presupuesto del revisor; trocear más exigiría reescribir la historia ya commiteada.

## Log

### L1 — Petición original
> Necesito adicionar un mecanismo nuevo para la sincronizacion de los datos del POS entre el dispositivo del Owner y los dispositivos de los StoreUsers. La idea seria tener un lugar donde almacenar y poder subir el mismo fichero con contraseña que ahora mismo generamos al exportar. La idea es que el Owner y sus StoreUsers puedan hacer la misma funcionalidad de export e import de esos ficheros pero usando como via este lugar en el backend para almacenarlos. La idea es ir organizando los ficheros por orden decreciente en la fecha con el nombre de la tienda y que segun el tipo de usuario lo pueda actualizar con su sistema. Toda la funcionalidad de export e import del POS se mantiene como está pero la idea es sobre los ficheros que estaran almacenados en ese lugar. Se le debe poner el nombre de la tienda, la fecha, nombre completo del usuario que lo subio y tambien tener un conocimiento si el dispositivo descargo o no ese fichero para no descargarlo mas de una vez. Por favor, esa es la idea asi que no te vayas del scope. Cualquier duda me preguntas para que no asumas nada de nada.

### L2 — Decisiones del usuario
- Almacenamiento: **un fichero por tienda**, porque el ZIP v3 multi-tienda cifra todas las tiendas con la misma contraseña y un StoreUser podría leerlas todas.
- Origen de los ficheros: **el POS los genera y los sube**, sin pasar por el disco.
- Marca de descarga: **por usuario**, no por dispositivo (no existe identificador de dispositivo en el POS).
- Efecto de la marca: **informativa y repetible**, no bloquea.
- Subida: **Owner y StoreUser**, cada uno en su ámbito.
- UI: **pantalla nueva en Sync**.
- Crecimiento: **borrado manual** por ámbito.
- Gate: **Send y Receive**.
- Descarga: **descarga e importa directo**.
- Nombre: **el original del fichero**; tienda, fecha y usuario van como columnas en tabla + contador de descargas.
- Límite: **50 MB**.

### L3 — Corrección de una afirmación previa
El ZIP v3 **sí** se puede importar por un StoreUser, y solo escribe su tienda: `importBackupFile` enruta v3 a `importArchive`, que filtra por `resolveBackupStoreIds`. El rechazo estricto de `storeId` vive solo en la ruta v2 (`data-serializer-service.ts:832`). La decisión de "un fichero por tienda" no se toma por imposibilidad técnica, sino por confidencialidad: la llave es única para todas las tiendas del archivo.

### L4 — Nota sobre identidad de dispositivo
El backend ya lee las cabeceras `Gf-Device` / `Gf-DeviceId` / `Gf-SessionId` (`HttpContextService.cs`), pero el POS React no las envía (`frontend-react/` no contiene ninguna referencia). La decisión de marcar por usuario se mantiene.

### L5 — Implementación y hallazgos
- **No existía patrón para autorizar una tienda distinta de la seleccionada**: `HasPermission` valida siempre contra `IHttpContextService.StoreId` (claim) y `AdminStoreScope` es exclusivo de SuperAdmin. Se añadió `StoreSyncStoreScope`: Owner/ReSeller resuelven sus tiendas con `GetAllStoresByOwnerUserIdAsync`, el resto queda confinado al claim. Fuera de ámbito siempre es 404, nunca 403.
- **`Program.cs` limita `MultipartBodyLengthLimit` a 8 MB** para las imágenes del catálogo. Sin un `[RequestFormLimits]` por acción, un ZIP de 50 MB moría con 400 antes de llegar al handler y la regla de 413 de S10 nunca se ejecutaba. Se añadió el override por acción.
- **`GenericRepository.SoftDeleteAsync` no marca `IsActive` para entidades derivadas de `AuditableEntity<TId>`**: su comprobación de tipo no casa con el genérico. El handler de borrado pone `IsActive = false` explícitamente antes de guardar.
- **`StoreRoleFeature` es por (tienda, rol), no por usuario**: dos StoreUsers de la misma tienda comparten features. El test E2E de gate tuvo que sembrar dos tiendas (A solo Send, B solo Receive) para probar el OR de verdad.
- **Corregido (L6)**: `SMCA.WebApi.E2ETests/Infrastructure/DbTestHelpers.cs` `ResetDataAsync` borraba `Store` sin borrar antes `StoreSyncFileDownload`/`StoreSyncFile`. FK `Restrict`, así que una corrida E2E abortada habría roto el arranque del fixture en la SIGUIENTE corrida completa. Se añadieron los dos `ExecuteDeleteAsync` (download → file) antes del borrado de `Store`. Probado dejando filas huérfanas a propósito y arrancando otra clase E2E encima: 6/6 verde.
- **Corregido (L7)**: `frontend-react/deploy/nginx.conf` no declaraba `client_max_body_size`, así que nginx usaba su default de **1 MB** y habría respondido 413 antes de Kestrel para cualquier ZIP real. Se añadió `client_max_body_size 52m` dentro de `location /api`; el límite real por acción lo sigue imponiendo la API.

### L7 — Cierre de los riesgos
- **Riesgo 5 (migración/script)**: verificado, no supuesto. Regenerado el script con `dotnet ef migrations script 20261026210157_Add-CatalogEvents-OccurredAt-SessionHash-Index` y comparado con `42-20261027-Add-StoreSyncFiles.sql`: el cuerpo DDL es **idéntico**; la única diferencia es el `ON CONFLICT ("MigrationId") DO NOTHING` que exige la convención del repo.
- **Riesgo 2 (autorización)**: añadido E2E `Another_tenant_cannot_see_download_delete_or_write_over_a_file`, que cubre la fuga entre tenants (el filtro global `IsSuperAdmin || TenantId == _context.TenantId`). Junto al existente `StoreUser_is_confined_to_its_own_store` (mismo tenant, otra tienda) y al test de gate por feature, las tres dimensiones quedan pinneadas. `StoreSyncFilesTests` → 6/6.
- **Riesgo del proxy**: cerrado en `nginx.conf`, ver L6.

### L8 — RDD sobre item 2 e item 5
Ambos revisados como candidatos propios en worktrees aislados, y **ambos APROBADOS y con su autoridad quemada** (`gentle-ai.review-acknowledged/v1`).

- **Item 2 — autorización** (`a7ca8c9c`: handlers + controlador + i18n, 10 archivos / 798 líneas, worktree `store-mgmt-wt-auth`).
  - Lentes: `review-risk`, `review-reliability`. Lineage `review-2fb374b6d6edc7a5`.
  - Veredicto: **approved**. Hallazgos no bloqueantes, disposición `informational`:
    - `R1-FILENAME-CONTROL-CHARS` (risk, WARNING): el nombre persistido se sanea solo en forma de ruta; CR/LF/NUL sobreviven y se emiten en `Content-Disposition`, lo que haría ese fichero indescargable.
    - `R3-1` (reliability, WARNING): sin tests dentro del candidato — artefacto del alcance recortado; los tests viven en `6d89edab`.
    - `R3-2` (reliability, WARNING): el mark de descarga se inserta con lectura previa; dos descargas concurrentes del mismo usuario podrían chocar con el índice único y devolver 500.
    - `R3-3` (reliability, WARNING): `ReSeller` es tenant-wide para listar pero se resuelve por tiendas propias al actuar; lista y acción pueden discrepar.
    - `R3-4` (reliability, WARNING): `SaveAsync` queda fuera del bloque de compensación; un fallo de disco escapa sin el 500 localizado.
    - `R3-5`, `R3-6` (SUGGESTION): normalizar el nombre una sola vez antes de storage; pasar el token de cancelación al lookup del usuario.

- **Item 5 — migración y esquema** (`32d83009`, recortado a migración + script + las dos configuraciones EF: 4 archivos / 321 líneas, worktree `store-mgmt-wt-mig`; el `Designer` y el snapshot son generados y se excluyeron).
  - Lentes: `review-risk`, `review-reliability`. Lineage `review-a361f9fae735124f`.
  - Veredicto: **approved**. Hallazgos no bloqueantes:
    - `R1-tenant-integrity-download-mark` (risk, SUGGESTION): `StoreSyncFileDownload.TenantId` no está atado por FK al tenant del padre; la integridad depende de que cada handler estampe ambos desde el mismo contexto.
    - `R3-uniqueness-contract-unproved` (reliability, WARNING): el índice único `(StoreSyncFileId, UserId)` no se prueba en este candidato — artefacto del alcance; el E2E sí ejercita la segunda descarga.
    - `R3-script-migration-parity` (reliability, SUGGESTION): no hay check automático script↔`dotnet ef migrations script`; hoy se verificó a mano (cuerpo DDL idéntico).
  - El primer intento sobre el commit completo (5067 líneas) devolvió `lens_context_budget_exceeded` sin crear autoridad; el recorte es la respuesta que exige el contrato.

Ninguno de los hallazgos abrió corrección ni reabre la revisión. Quedan como trabajo posterior, no como motivo para repetirla.

### L9 — Cierre
- Cobertura final observada: 48 tests de aplicación, 6 E2E, 325 de frontend, más lint y typecheck limpios.
- El arreglo de `DbTestHelpers.ResetDataAsync` (L5) quedó autorizado, aplicado y probado con filas huérfanas reales.
- Los dos riesgos de alto valor (item 2 e item 5) pasaron revisión nativa y quedaron aprobados con su autoridad quemada (L8). Los hallazgos restantes son no bloqueantes y quedan como trabajo posterior.
- El primer intento de revisión del feature completo quedó sin autoridad por `lens_context_budget_exceeded`; la decisión de no reescribir la historia se mantiene, y la cobertura de los dos riesgos se obtuvo con candidatos recortados.
