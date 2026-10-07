# Scripts — deploy de test y de producción

Dos entornos en el mismo VPS, aislados entre sí:

| Entorno | Dominio | Stack podman | Rama fuente | Script |
|---|---|---|---|---|
| **Test** | `vdt.playground.sceiba.net` | `smca-test` (`smca_test_*`) | `test` | `deploy-test.sh` |
| **Producción** | `pos.playground.sceiba.net` | `store-mgmt` (`smca_*`) | `main` | `deploy-prod.sh` |

El **routing de dominios NO vive en este repo**: lo hace HAProxy en el VPS
(`/etc/haproxy/haproxy.cfg`, TLS terminado ahí). Los nginx del repo son internos a
contenedores, sin `server_name`.

---

## 1. Deploy de TEST (`deploy-test.sh`)

### Qué hace (default: no toca producción)

1. Clona/actualiza las fuentes de la rama `test` → `./test-store-mgmt`.
2. Levanta el Postgres de test y **conserva** la BD `smca_test` actual.
3. **Backup de la BD de TEST** (`pg_dump smca_test`) → `./backups` **antes** de correr scripts,
   más un **backup de las imágenes del catálogo** (`smca_test_images_backup_<ts>.tar.gz`), que
   viven en un volumen podman y no están en el dump.
4. Aplica los scripts SQL pendientes de `backend/scripts`; **si falla uno, restaura `smca_test`**
   desde ese backup y **restaura también las imágenes** del catálogo.
5. Buildea la imagen `localhost/store-mgmt_backend_test:latest`.
6. Levanta el stack aislado (`podman-compose -p smca-test`).
7. Smoke test; **si falla, rollback** (BD de test + imágenes del catálogo + imagen `:previous`) y redeploy.
8. Tag git y `deploy-state.txt`.

**Por defecto producción NO se toca** (ni `pg_dump` ni el contenedor). El backup y
montaje de la BD de producción quedan detrás de `--from-prod`.

### Stack de test

`api`, `postgres`, `pgadmin`, `web-store-pos`. **Sin Angular y sin LB** — el React
es autosuficiente (sirve el SPA y proxya `/api` → `api:8000` con su propio nginx).

- React: `http://<VPS>:8095`
- pgAdmin: `http://<VPS>:5051`

### Preparación (una sola vez)

```bash
# En el VPS
mkdir -p /home/malayo/lizo/test-deploy
```

```powershell
# Desde tu máquina: script + .env de test
scp scripts\deploy-test.sh .env malayo@<VPS>:/home/malayo/lizo/test-deploy/
```

```bash
# En el VPS
chmod +x /home/malayo/lizo/test-deploy/deploy-test.sh
```

El `.env` se arma desde `.env-test` (gitignored) completando `AUTH_PEPPER`,
`STORE_ENCRYPTION_MASTER_SECRET` y `JWT_SECRET` con **los mismos valores de
producción** (la BD clonada los necesita para validar logins y desencriptar datos).

### Correr

```bash
cd /home/malayo/lizo/test-deploy
./deploy-test.sh                # deploy completo SIN tocar producción
./deploy-test.sh --from-prod    # además: backup de prod y recrea smca_test desde ese dump
./deploy-test.sh --help
```

### Flags

| Flag | Qué hace |
|---|---|
| `--from-prod` | Hace el backup de la BD de producción (solo lectura) y **recrea `smca_test` desde ese dump**. Es el comportamiento que antes era el default. |
| `--keep-db` | Deprecado, no-op: conservar la BD de test ya es el default. |
| `--help` | Ayuda. |

### Rollback

Si falla un script SQL, el build de la imagen, `compose up` o el smoke test, el
script **restaura `smca_test`** desde el backup tomado al inicio (y re-tagea
`:previous` como `:latest` cuando la imagen ya se había buildeado).

En **todos** esos caminos restaura además **las imágenes del catálogo**: sin eso la
BD vuelve atrás pero los archivos quedan, y el catálogo queda desincronizado.

Excepción deliberada: con `--no-rollback` no se restaura nada (es el modo de
diagnóstico, el stack queda como falló).

### Imágenes del catálogo

Las fotos viven en el volumen `storage_test_data` montado en
`/app/storage` del contenedor `smca_test_backend`, en
`/app/storage/storage/catalog` (`Storage:CatalogImageRoot = storage/catalog`).
Un `pg_dump` **no** las incluye.

- El nombre real del volumen **se lee en runtime** del mount del contenedor
  corriendo (`podman inspect ... .Mounts`), nunca se hardcodea: `podman-compose`
  lo prefija con el proyecto (`smca-test_storage_test_data`).
- El `.tar.gz` se crea con el **mismo timestamp** que el dump de la BD, así que
  `smca_test_backup_<ts>.sql.gz` y `smca_test_images_backup_<ts>.tar.gz` siempre
  describen el mismo estado.
- Se valida con `gzip -t` al crearse, y rota sola (`rotate_backups`, retención 7).
- Al restaurar, **limpia el destino antes de extraer**: extraer encima dejaría
  vivos los archivos que el backup no contiene, que es justo el problema.
- Si el contenedor `smca_test_backend` **no está corriendo** (típicamente el
  primer deploy de test, donde el contenedor todavía no existe), el backup de
  imágenes se salta con `[WARN]` en vez de bloquear el deploy: ese volumen todavía
  no tiene fotos que perder.
- En el rollback que corre **después** de `compose down` (el de `compose up`
  fallido) el contenedor ya no existe: el restore usa un contenedor descartable
  montado sobre el mismo volumen.

### Salidas

- `./logs/` — log por corrida
- `./backups/` — tres familias con retención 7 cada una:
  `smca_test_backup_*.sql.gz` (default), `smca_backup_*.sql.gz` (`--from-prod`) y
  `smca_test_images_backup_*.tar.gz` (imágenes del catálogo)
- `./deploy-state.txt` — commit, tag, `MODE`, backup, backup de imágenes y URLs de la última corrida

---

## 2. Deploy de PRODUCCIÓN (`deploy-prod.sh`)

### Qué hace

1. **Backup de la BD de producción** (`pg_dump`) → `./backups`. **Obligatorio.**
   Junto con él, un backup de las **imágenes del catálogo** desde el volumen de
   storage, con el **mismo timestamp**.
2. Clona/actualiza las fuentes de la rama `main` → `./prod-store-mgmt`.
3. Buildea `localhost/store-mgmt_backend:latest` (+ tags `:previous` y `:<sha>`).
4. Aplica los scripts SQL pendientes **contra la BD de producción**.
5. Levanta el stack de producción.
6. Smoke test; **si falla, rollback automático**.
7. Tag git y `deploy-state.txt`.

### Reglas duras

- **Sin backup válido no avanza.** Del dump de la BD **y** del archivo de imágenes.
- **El rollback restaura la BD**, no solo la imagen: `DROP DATABASE` → `CREATE
  DATABASE` → restore del dump previo. Un rollback de imagen no arregla el esquema
  ni los datos.
- **El rollback restaura también las imágenes del catálogo**, en los tres caminos
  que restauran la BD: `--rollback` manual, migración fallida y smoke test
  fallido. Es lo mismo que en test: si la BD vuelve atrás y las fotos no, el
  catálogo queda inconsistente.
- **Punto de no retorno** = primera escritura a la BD de prod (las migraciones).
  Antes de eso, abortar no requiere rollback.
- **Nunca toca el stack de test** (`smca-test`, :8095, :5051).
- El nombre de proyecto de podman-compose se **lee en runtime** de la label
  `io.podman.compose.project` del contenedor `smca_postgres_db` (hoy: `store-mgmt`).
  Nunca se inventa: inventarlo haría que `up` cree **volúmenes nuevos** (BD vacía)
  en vez de reusar los de producción.
- El **volumen de las imágenes** también se lee en runtime del mount
  `/app/storage` del contenedor `smca_backend` corriendo (`store-mgmt_storage_data`),
  nunca hardcodeado. Requiere que `smca_backend` esté corriendo: sin él el deploy
  para antes de escribir nada.

### ⚠️ No correrlo hasta que `main` tenga el cleanup de Angular

El script clona **`main`** y usa **su** `docker-compose.yml`. Mientras `main` no
tenga el cambio que quita Angular + LB (hoy está en `test`), el script intentaría
buildear Angular en producción y **fallaría**. Primero actualizá `main` con `test`.

### Preparación (una sola vez)

```bash
# En el VPS
mkdir -p /home/malayo/prod-deploy
```

```powershell
# Desde tu máquina: script + .env de PRODUCCIÓN
scp scripts\deploy-prod.sh .env malayo@<VPS>:/home/malayo/prod-deploy/
```

```bash
# En el VPS
chmod +x /home/malayo/prod-deploy/deploy-prod.sh
```

### Correr

```bash
cd /home/malayo/prod-deploy

./deploy-prod.sh --dry-run   # ensayo: backup + clone + build, SIN escribir nada
./deploy-prod.sh             # deploy real (pide confirmación interactiva)
./deploy-prod.sh --yes       # deploy real sin confirmación
./deploy-prod.sh --rollback  # restaura BD + imágenes del catálogo del último backup + :previous + redeploy
```

### Flags

| Flag | Qué hace |
|---|---|
| `--dry-run` | Backup + fuentes + build + validación. **No escribe** en prod ni despliega. |
| `--yes` | Saltea la confirmación interactiva. |
| `--rollback` | Rollback manual: restaura la BD y las imágenes del catálogo del último backup, vuelve a `:previous` y redeploya. |
| `--help` | Ayuda. |

### Rollback

Se dispara **automáticamente si falla el smoke test**, y también a mano con
`--rollback`. Restaura:

1. **La BD** desde el backup tomado antes del deploy.
2. **Las imágenes del catálogo** desde `smca_images_backup_<ts>.tar.gz`, el archivo
   con el mismo timestamp que el dump (ver *Imágenes del catálogo* en la sección de test).
3. **La imagen** `:previous` (re-tageada como `:latest`).
4. Redeploy del stack.

Si falla una migración (antes del deploy), se restaura la BD **y las imágenes** y
se aborta sin tocar la imagen del backend: la app sigue corriendo la versión anterior.

Un backup tomado **antes** de este feature no tiene `.tar.gz` pareja: el rollback
restaura la BD igual y avisa por log que las imágenes no se restauraron.

### Salidas

Igual que test: `./logs/`, `./backups/` (tres familias con retención 7: el dump de
prod, las imágenes de prod y —si corriste `deploy-test.sh` en la misma carpeta— las
de test), `./deploy-state.txt` (incluye `IMAGES_BACKUP=`).

---

## 3. Notas comunes

### Los `.env` NO se commitean

`.env` (producción) y `.env-test` (plantilla de test) están en `.gitignore`. Se
suben al VPS a mano. El script los busca en la raíz del clon
(`test-store-mgmt/.env` / `prod-store-mgmt/.env`) y, si no están, los copia desde
la carpeta del script.

### Backups manuales de emergencia

Ver el `README.md` raíz, sección *"VPS — Comandos de administración"*:

```bash
podman exec smca_postgres_db pg_dump -U postgres smca | gzip > ./smca_backup_$(date +%Y%m%d_%H%M%S).sql.gz
gunzip -c ./smca_backup_YYYYMMDD_HHMMSS.sql.gz | podman exec -i smca_postgres_db psql -U postgres -d smca
```

Las imágenes del catálogo se respaldan y restauran a mano así (el volumen real se
lee del contenedor, nunca se hardcodea):

```bash
# Backup
podman exec smca_backend tar -cf - -C /app/storage storage/catalog | gzip > ./smca_images_backup_$(date +%Y%m%d_%H%M%S).tar.gz

# Restore (limpia antes de extraer: si no, sobreviven archivos que el backup no tiene)
podman exec smca_backend sh -c 'rm -rf /app/storage/storage/catalog && mkdir -p /app/storage/storage/catalog'
gunzip -c ./smca_images_backup_YYYYMMDD_HHMMSS.tar.gz | podman exec -i smca_backend tar -xf - -C /app/storage
```

### Puertos en el VPS

| Contenedor | Puerto host | Qué es |
|---|---|---|
| `smca_web_pos` | 8085 | React producción |
| `smca_test_web_pos` | 8095 | React test |
| `smca_pgadmin` | 5050 | pgAdmin producción |
| `smca_test_pgadmin` | 5051 | pgAdmin test |

(`smca_frontend` + `smca_nginx` de producción quedaron sin dominio y sin servicio
en el compose: Angular está muerto. Los directorios `frontend/` y `loadbalancer/`
siguen en el repo congelados, solo se quitaron sus servicios.)
