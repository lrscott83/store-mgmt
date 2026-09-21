# Feature: prod-deploy (deploy de producción desde `main` — pos.playground.sceiba.net)

Workflow: **ODD**. Rama de trabajo: `test` (a pedido del usuario 2026-09-20). El flujo es
`test` → `main`; cuando `main` se actualice con `test`, esto queda en `main`, que es la rama
de producción.
Entrega: `docker-compose.yml` (sin Angular/LB), `scripts/deploy-prod.sh`, este tracker.

## Objetivo

Deploy automatizado de PRODUCCIÓN desde la rama `main`: backup de la BD de prod → fuentes →
build de la imagen → migraciones SQL pendientes → deploy del stack → smoke test → tag/estado.
Si algo falla después de tocar la BD, **rollback completo**: restaura la BD desde el backup
previo + vuelve a la imagen `:previous` + redeploy.

## Reglas duras

- **Backup de la BD de prod ANTES de cualquier escritura.** Sin backup válido (`gzip -t`),
  el script no avanza.
- **El rollback restaura la BD**, no solo la imagen: `DROP DATABASE ... WITH (FORCE)` →
  `CREATE DATABASE` → restore del dump previo. Un rollback de imagen no arregla el esquema
  ni los datos.
- **Punto de no retorno = primera escritura a la BD de prod.** Antes de eso, abortar no
  requiere rollback (prod intacto).
- **Nunca tocar el stack de test** (`smca-test`, :8095, :5051). Este script es solo prod.
- **Reusar el proyecto y los volúmenes existentes de prod.** El nombre de proyecto de
  podman-compose se lee en runtime de la label `io.podman.compose.project` del contenedor
  `smca_postgres_db`; nunca se inventa. Inventarlo haría que `up` cree volúmenes NUEVOS
  (BD vacía) en vez de reusar los de prod.
- **`frontend/` y `loadbalancer/` NO se tocan como directorios** — Angular está congelado.
  Solo se quitan sus SERVICIOS del `docker-compose.yml`.

## Decisiones

- (usuario, 2026-09-20) Las migraciones se ejecutan contra la BD de prod; si algo falla, el
  rollback restaura la BD del backup tomado antes.
- (usuario, 2026-09-20) Prod sin Angular ni LB.
- (usuario, 2026-09-20) Rama de producción: `main`. El trabajo se commitea en `test` por
  ahora.
- Verificado que el React NO usa el LB: `frontend-react/deploy/nginx.conf` sirve el SPA y
  proxya `/api` → `api:8000` él mismo; HAProxy `pos_backend` → `127.0.0.1:8085` directo.
- Imagen de prod: `localhost/store-mgmt_backend:latest` (+ `:previous` + `:<sha>`).
- Stack de prod resultante: `api`, `postgres`, `pgadmin`, `web-store-pos`.
- Smoke de prod: `http://localhost:8085/` (SPA) y `http://localhost:8085/api/v1/ping`
  (same-origin → `api:8000`). El dominio `pos.playground.sceiba.net` se verifica aparte:
  lo cablea HAProxy en el host, fuera del alcance del script.

## Tasks

- [ ] T1 `docker-compose.yml`: quitar `frontend` (Angular) y `nginx` (LB). Quedan `api`,
      `postgres`, `pgadmin`, `web-store-pos`. Nada más depende de ellos (verificado:
      `web-store-pos` solo depende de `api`).
- [ ] T2 `scripts/deploy-prod.sh`:
  - [ ] T2.1 Preflight: herramientas (`podman`, `podman-compose`, `git`, `curl`, `gzip`,
        `flock`), lock, contenedores de prod corriendo, espacio en disco, y **lectura del
        proyecto podman-compose de prod** desde las labels.
  - [ ] T2.2 Backup de la BD de prod (`pg_dump` → `./backups`, `gzip -t`, retención).
  - [ ] T2.3 Fuentes de `main` (clone/reset en `./prod-store-mgmt`).
  - [ ] T2.4 Build de la imagen de prod + tags `:previous` y `:<sha>`.
  - [ ] T2.5 Migraciones pendientes contra la BD de prod (misma lógica de `MigrationId`).
        **Punto de no retorno.**
  - [ ] T2.6 Deploy del stack de prod (`up -d --build` con el proyecto real).
  - [ ] T2.7 Smoke test + rollback automático si falla.
  - [ ] T2.8 `deploy-state.txt` + tag git.
  - [ ] T2.9 Modo `--rollback`: restaura la BD del último backup + imagen `:previous` +
        redeploy.
- [ ] T3 Verificación observada (`bash -n`, YAML, LF, refs huérfanas) + mirror engram
      `odd/prod-deploy/tasks`.
- [ ] T4 (usuario) Corrida real en el VPS + chequeo de HAProxy (`grep 8083` vacío).

## Decisiones resueltas (usuario, 2026-09-20)

1. **Confirmación**: interactiva antes de tocar prod (`--yes` para saltarla).
2. **Downtime**: aceptado (el `up` recrea `api` en segundos; el rollback de BD tarda más).
3. **Rollback automático** si falla el smoke.
4. **Retención** de backups de prod: 7.
5. **`pgadmin`** de prod: se queda.
6. **`--dry-run`**: sí, incluido.

- Proyecto real de podman-compose en prod (leído de la label): **`store-mgmt`**.
