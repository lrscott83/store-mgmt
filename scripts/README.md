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

### Qué hace

1. **Backup de la BD de producción** (`pg_dump`, solo lectura) → `./backups`.
2. Clona/actualiza las fuentes de la rama `test` → `./test-store-mgmt`.
3. Recrea la BD `smca_test` desde ese dump.
4. Aplica los scripts SQL pendientes de `backend/scripts`.
5. Buildea la imagen `localhost/store-mgmt_backend_test:latest`.
6. Levanta el stack aislado (`podman-compose -p smca-test`).
7. Smoke test y tag git.

**Producción solo se LEE.** Nada del stack de test apunta a producción.

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
./deploy-test.sh              # deploy completo
./deploy-test.sh --keep-db    # conserva la BD de test actual (no recarga el dump)
```

### Salidas

- `./logs/` — log por corrida
- `./backups/` — dumps de producción (retención: 7)
- `./deploy-state.txt` — commit, tag, backup e URLs de la última corrida

---

## 2. Deploy de PRODUCCIÓN (`deploy-prod.sh`)

### Qué hace

1. **Backup de la BD de producción** (`pg_dump`) → `./backups`. **Obligatorio.**
2. Clona/actualiza las fuentes de la rama `main` → `./prod-store-mgmt`.
3. Buildea `localhost/store-mgmt_backend:latest` (+ tags `:previous` y `:<sha>`).
4. Aplica los scripts SQL pendientes **contra la BD de producción**.
5. Levanta el stack de producción.
6. Smoke test; **si falla, rollback automático**.
7. Tag git y `deploy-state.txt`.

### Reglas duras

- **Sin backup válido no avanza.**
- **El rollback restaura la BD**, no solo la imagen: `DROP DATABASE` → `CREATE
  DATABASE` → restore del dump previo. Un rollback de imagen no arregla el esquema
  ni los datos.
- **Punto de no retorno** = primera escritura a la BD de prod (las migraciones).
  Antes de eso, abortar no requiere rollback.
- **Nunca toca el stack de test** (`smca-test`, :8095, :5051).
- El nombre de proyecto de podman-compose se **lee en runtime** de la label
  `io.podman.compose.project` del contenedor `smca_postgres_db` (hoy: `store-mgmt`).
  Nunca se inventa: inventarlo haría que `up` cree **volúmenes nuevos** (BD vacía)
  en vez de reusar los de producción.

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
./deploy-prod.sh --rollback  # restaura la BD del último backup + :previous + redeploy
```

### Flags

| Flag | Qué hace |
|---|---|
| `--dry-run` | Backup + fuentes + build + validación. **No escribe** en prod ni despliega. |
| `--yes` | Saltea la confirmación interactiva. |
| `--rollback` | Rollback manual: restaura la BD del último backup, vuelve a `:previous` y redeploya. |
| `--help` | Ayuda. |

### Rollback

Se dispara **automáticamente si falla el smoke test**, y también a mano con
`--rollback`. Restaura:

1. **La BD** desde el backup tomado antes del deploy.
2. **La imagen** `:previous` (re-tageada como `:latest`).
3. Redeploy del stack.

Si falla una migración (antes del deploy), se restaura la BD y se aborta sin
tocar la imagen: la app sigue corriendo la versión anterior.

### Salidas

Igual que test: `./logs/`, `./backups/` (retención: 7), `./deploy-state.txt`.

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
