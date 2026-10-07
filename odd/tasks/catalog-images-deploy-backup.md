# Feature — Backup de imágenes del catálogo en los deploys de test y producción

## Objetivo

Que las fotos del catálogo se respalden junto con la base de datos en cada deploy,
y que el rollback las restaure. Hoy solo se backs up la BD.

## Problema

`scripts/deploy-prod.sh` respalda únicamente la base de datos
(`pg_dump | gzip`, línea 173-176). Las fotos del catálogo viven en un volumen
podman separado (`storage_data`) y **nadie las respalda**.

Consecuencia: cuando el rollback se dispara, `restore_db()` hace
`DROP DATABASE ... WITH (FORCE)` + `CREATE DATABASE` + restore (líneas 146-155).
La BD vuelve al backup, las filas de productos y sus referencias de imagen
vuelven atrás, pero **los archivos siguen en disco**. Resultado:

- Fotos desaparecen de la UI sin que nadie haya borrado un archivo.
- Archivos huérfanos se acumulan en el volumen, uno por rollback.
- El estado real (BD) y el volumen (fotos) quedan desincronizados.

Ningún script del repo destruye volúmenes: no existe `down -v`, `--volumes` ni
`volume rm` en ningún lado. Las fotos no se pierden solas — el problema es que
nadie las archiva ni las revierte.

## Por qué ahora

Un requerimiento del clientegatgún sobre resiliencia de deploy, y el desync
descrito ya es observable. El rollback actual es correcto para la BD pero deja
el catálogo inconsistente.

## Alcance

Autorizado por el usuario: **backup + restauración automática en el rollback**
(la alternativa "solo backup" fue explícitamente descartada).

### Script 1 — `scripts/deploy-prod.sh` (producción)

- Resolver el origen real del mount `/app/storage` leyendo los labels/mounts del
  contenedor `smca_backend` que está corriendo. No hardcodear el nombre del
  volumen: `podman-compose` lo prefija con el nombre del proyecto, así que el
  volumen en disco se llama `<proyecto>_storage_data`, no `storage_data`.
- Crear el archivo de backup **antes de cualquier escritura**, junto al paso 1
  actual. Reusar el mismo timestamp que el backup de BD para que los dos
  artefactos sean emparejables.
- Validar integridad del `.tar.gz` igual que hoy se valida el dump con
  `gzip -t`. Un backup que no se validó no es un backup.
- Rotar con la misma política `KEEP_BACKUPS` (default 7).
- Añadir `restore_images()` y llamarla en los **tres** call sites de rollback:
  1. línea ~221, modo `--rollback` explícito
  2. línea ~278, migración fallida
  3. línea ~307, smoke test fallido
- El restore debe dejar el directorio como estaba, no encima: limpiar el destino
  antes de extraer, o extraer sobre contenido viejo deja archivos que el backup
  no contiene.

### Script 2 — `scripts/deploy-test.sh` (test)

Mismo tratamiento para `smca_test_backend` / volumen `storage_test_data`.
El script ya tiene una función `rotate_backups(prefix)` parametrizada; el
backup de imágenes debe reusarla en vez de duplicar el loop de rotación inline
que usa `deploy-prod.sh`.

`deploy-test.sh` respalda dos familias (`smca_backup_` = dump de producción,
`smca_test_backup_` = dump de test). Las imágenes de test son una tercera
familia propia, no deben mezclarse con ninguna de las dos.

## Fuera de alcance

- No tocar `docker-compose.yml` ni `docker-compose.test.yml`: los volúmenes ya
  están bien declarados y ningún cambio es necesario para este feature.
- No migrar los volúmenes a otra tecnología.
- No tocar la red, ni los contenedores, ni las variables de entorno.
- No agregar CI: el deploy es manual por diseño.

## Criterios de aceptación

1. Un deploy de producción crea un `.tar.gz` de imágenes **antes** de aplicar
   migraciones, y lo dice en el log.
2. El archivo de imágenes se valida al crearse (equivalente a `gzip -t`).
3. La rotación_respeta `KEEP_BACKUPS` y no toca los backups de BD.
4. Los tres call sites de rollback restauran también las imágenes.
5. Un restore deja el directorio de fotos exactamente como estaba en el backup:
   sin archivos del estado anterior que sobrevivan.
6. `deploy-test.sh` behaves igual para su propio volumen.
7. Los nombres de archivo incluyen un timestamp compartido con el dump de BD, de
   modo que un operador pueda emparejar `smca_backup_<ts>.sql.gz` con su
   `.tar.gz` de imágenes.
8. Los backups de BD existentes se siguen restaurando igual que antes: el feature
   es aditivo y no debe cambiar el comportamiento del rollback de datos.
9. Ambos scripts siguen siendo sintácticamente válidos (`bash -n`).

## Checks

```bash
bash -n scripts/deploy-prod.sh
bash -n scripts/deploy-test.sh
```

Ejecución real de los deploys: **no** se corre en esta tarea. Requieren podman,
los contenedores corriendo y tocar producción.

### Evidencia observada (2026-10-07)

Bash disponible: `C:\WINDOWS\system32\bash.exe` (WSL, `uname -s` → `Linux`).
`shellcheck` **no** está instalado en este entorno.

**Sobre el CRLF:** este checkout de Windows tiene `core.autocrlf=true` y
`.gitattributes` sólo fija `eol=lf` para `.githooks/*`, así que los dos scripts
llegan a disco **con CRLF** (476 y 536 saltos de línea, CR=LF en ambos). Bash
POSIX rechaza los `\r`, así que sobre los archivos crudos:

```
$ bash -n scripts/deploy-prod.sh
scripts/deploy-prod.sh: line 93: syntax error near unexpected token `$'{\r''
scripts/deploy-prod.sh: line 93: `redact() {'
  exit=2

$ bash -n scripts/deploy-test.sh
scripts/deploy-test.sh: line 101: syntax error near unexpected token `$'{\r''
scripts/deploy-test.sh: line 101: `redact() {'
  exit=2
```

Eso **no** es un defecto de los scripts: es el artefacto del checkout local. En el
VPS los scripts corren con LF (así están en el repo). Contra copias normalizadas a
LF —los mismos bytes que git guarda—:

```
$ bash -n scripts/deploy-prod.sh
  bash -n scripts/deploy-prod.sh -> exit=0 (no output = OK)

$ bash -n scripts/deploy-test.sh
  bash -n scripts/deploy-test.sh -> exit=0 (no output = OK)
```

### Verificación funcional de la lógica nueva (sin podman)

Para no confiar sólo en la sintaxis, se extrajeron las funciones nuevas de cada
script y se corrieron contra un `podman` falso en un directorio temporal, con un
árbol de catálogo real en `/app/storage/storage/catalog`. **28 checks, todos PASS**
(18 en `deploy-test.sh`, 10 en `deploy-prod.sh`):

- `resolve_storage_volume` elige el mount `/app/storage` entre varios mounts y
  devuelve el nombre con prefijo de proyecto (`smca-test_storage_test_data`,
  `store-mgmt_storage_data`), nunca el corto.
- `backup_images` escribe el `.tar.gz` con el timestamp del dump, pasa `gzip -t` y
  guarda las rutas relativas a `/app/storage` (no `app/storage/...`).
- `restore_images` **limpia y después extrae**: un archivo huérfano creado después
  del backup desaparece, un archivo modificado vuelve a su contenido anterior y un
  archivo borrado reaparece.
- Sin archivo pareja (backups previos a este feature) avisa y **devuelve 0**: el
  rollback sigue con retag y redeploy.
- `rotate_backups` respeta `KEEP_BACKUPS` y sólo toca la familia de imágenes:
  `smca_backup_*.sql.gz` y `smca_test_backup_*.sql.gz` quedan intactas.
- Sin contenedor `smca_test_backend`, el restore de test cae al contenedor
  descartable sobre el mismo volumen y aun así rewindea el directorio.

## Progreso

- [x] T1 — Investigación: volúmenes, contenedores, call sites de rollback
- [x] T2 — `deploy-prod.sh`: backup + restore de imágenes
- [x] T3 — `deploy-test.sh`: backup + restore de imágenes
- [x] T4 — Checks (`bash -n`) + documentar en `scripts/README.md`

### Notas de implementación

- **T2 ya estaba escrito** en el working tree (`scripts/deploy-prod.sh` figuraba
  modificado, sin commitear) cuando empezó esta tarea. Se revisó línea por línea
  contra los criterios y se verificó funcionalmente con el harness de arriba en
  lugar de reescribirlo. Los tres call sites de `restore_db` (`:352` rollback
  manual, `:413` migración fallida, `:443` smoke fallido) llaman a `restore_images`.
- **T3 se escribió acá.** `backup_images` se llama una sola vez, después del dump
  de BD y antes de STEP 4, para que las dos familias de BD (`smca_backup_`,
  `smca_test_backup_`) y la de imágenes (`smca_test_images_backup_`) queden
  separadas y emparejadas por el mismo `BACKUP_STAMP`.
- **Una decisión deliberada que se aparta de producción:** si
  `smca_test_backend` no está corriendo, `deploy-test.sh` hace `[WARN]` y sigue
  en vez de morir. En el primer deploy de test ese contenedor todavía no existe, y
  su volumen no tiene fotos que perder; bloquear el deploy de test por un backup
  vacío sería peor que el hueco que protege. Desde el segundo deploy el contenedor
  está arriba y el backup es obligatorio otra vez. Si el contenedor está corriendo
  pero **no** tiene el mount `/app/storage`, eso sí es `die`.
- **El rollback que corre después de `compose down`** (STEP 6, `compose up`
  fallido) ya no tiene contenedor: `podman exec` es imposible. Ahí el restore de
  test se monta el volumen en un contenedor descartable. En producción esa vía no
  existe: `compose up` no está guardado y no hay rollback tras `compose down`.
- Fuera de alcance respetado: no se tocó `docker-compose.yml`,
  `docker-compose.test.yml`, `backend/` ni ningún test. Los cambios están sólo en
  `scripts/deploy-prod.sh`, `scripts/deploy-test.sh`, `scripts/README.md` y este
  documento.