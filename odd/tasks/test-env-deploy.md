# Feature: test-env-deploy (entorno de test en VPS con podman — vdt.playground.sceiba.net)

Workflow: **ODD**. Rama de trabajo: `dev` — commits por unidad de trabajo a pedido del usuario (2026-09-19); la rama `test` que clona el script la crea el usuario.
Entrega: `docker-compose.test.yml` (raíz), `scripts/deploy-test.sh`, `.env-test` (gitignored) + alta en `.gitignore`.

## Objetivo

Deploy automatizado del stack de test (espejo de producción) en el VPS: backup de la BD de producción `smca` → restauración en `smca_test` → fuentes de la rama `test` → scripts SQL pendientes → build y deploy del stack aislado → tag git.

## Reglas duras

- Producción SOLO se lee (`pg_dump`); cero acciones sobre sus servicios.
- Stack test 100% aislado: `podman-compose -p smca-test -f docker-compose.test.yml` (red, volúmenes, contenedores y puertos propios).
- Imagen backend test: `localhost/store-mgmt_backend_test:latest` (+ `:previous`, + `:<sha>`). NUNCA el tag de producción.
- `.env` vive en la raíz de los fuentes (`test-store-mgmt/.env`); `.env-test` local es el borrador (gitignored) que el usuario renombra y completa con los secretos de producción.

## Decisiones

- Espejo de los 6 servicios con nombres de servicio intactos (`frontend`, `api`) para que los nginx internos no cambien; `container_name` `smca_test_*`; red `smca_test_network`; puertos 8093 (LB), 8095 (React), 5051 (pgAdmin).
- Postgres test NO monta `backend/scripts` como init (la BD siempre nace del dump de producción).
- `smca_test` se recrea en cada corrida (drop + create + restore con `ON_ERROR_STOP=1`); flag `--keep-db` para conservarla.
- Scripts pendientes: `MigrationId` extraído del script (líneas no comentadas) vs `__EFMigrationsHistory`; orden por nombre de archivo.
- Orden interno (ajustado porque el compose de test viene del clon): backup → fuentes → postgres test + BD → scripts → build → `up -d --build` → smoke → tag/estado.
- Extras: `flock`, checks previos, `gzip -t`, retención 7 backups, esperas de readiness, smoke (`/api/v1/ping` + ambos fronts), `deploy-state.txt`.

## Tasks

- [x] T1 `docker-compose.test.yml` (raíz) — escrito inline por el agente (la delegación al writer fue cancelada por el usuario; instrucción explícita de continuar la escritura).
- [x] T2 `scripts/deploy-test.sh` — escrito inline.
- [x] T3 `.env-test` (plantilla gitignored) + alta `.env-test` en `.gitignore` — escrito inline.
- [x] T4 Verificación observada (ver Evidencia).
- [x] T5 Mirror engram `odd/test-env-deploy/tasks`.

## Evidencia (2026-09-19, observada)

- `bash -n scripts/deploy-test.sh` → exit 0 (WSL bash).
- YAML: `python -c "import yaml; yaml.safe_load(open('docker-compose.test.yml'))"` → OK.
- LF: sin CRLF en `docker-compose.test.yml`, `scripts/deploy-test.sh`, `.env-test`.
- `git check-ignore -v .env-test` → `.gitignore:120:.env-test` (ignorado, no entra al commit).
- Readback compose: 6 `container_name` `smca_test_*`; `image: localhost/store-mgmt_backend_test:latest`; cero restos de `postgres_network`, `smca_postgres_db` ni del tag de imagen de producción.
- `git status --short`: `M .gitignore`, `?? docker-compose.test.yml`, `?? scripts/deploy-test.sh`, `?? odd/tasks/test-env-deploy.md`.
- Commit de infraestructura: `f4170ff9` — `feat(deploy): add isolated test-environment stack for the VPS` (compose + script + `.gitignore`); este tracker va en el commit siguiente de `dev`.
- Blobs verificados en LF (`git ls-files --eol` → `i/lf`) pese a `core.autocrlf=true` en Windows: el clon Linux recibe LF.
- Pendiente: corrida end-to-end real en el VPS (no hay podman en local).

## Actualización 2026-09-20 — Angular y LB fuera del stack test

Contexto: la primera corrida real en el VPS falló solo en `frontend` y `nginx`.
El build del Angular no generaba la imagen `smca-test_frontend` (el `podman run`
moría con `short-name ... did not resolve`); `nginx` caía por `depends_on:
frontend`. `postgres`, `api`, `pgadmin` y `web-store-pos` levantaron OK.

Decisión (opción A, elegida por el usuario): el `frontend` (Angular, legacy) NO
se levanta más, y con él se va el `nginx` LB — que existía solo para servir
Angular y no arrancaría sin el upstream `frontend`. El único entrypoint web es el
React (`web-store-pos`, :8095), autosuficiente: sirve el SPA y proxya `/api` →
`api:8000` con `frontend-react/deploy/nginx.conf`. Producción intacta
(`loadbalancer/nginx.conf` no se tocó).

Regla dura reforzada: NADA del stack test puede apuntar a producción. El build
del React hornea `API_URL=/api` (same-origin, `frontend-react/Dockerfile` ARG por
defecto) → su propio nginx → `api:8000` (servicio test). Sin URLs absolutas a prod.

- [x] T6 Remover `frontend` y `nginx` de `docker-compose.test.yml`; ajustar el
  smoke test y `deploy-state.txt` en `scripts/deploy-test.sh` (fuera `LB_PORT`).
- Verificación observada: YAML `services: [api, postgres, pgadmin, web-store-pos]`;
  `bash -n scripts/deploy-test.sh` → exit 0; cero refs funcionales a `LB_PORT`,
  `8093`, `smca_test_frontend`, `smca_test_nginx`; blobs en LF.
- Pendiente: re-subir `scripts/deploy-test.sh` al VPS y re-correr.

## Actualización 2026-09-20 (2) — Dominio test cableado al React de test

El entorno de test se sirve en `vdt.playground.sceiba.net`; producción en
`pos.playground.sceiba.net`. El routing de dominios NO vive en el repo: lo hace
HAProxy en el VPS (`/etc/haproxy/haproxy.cfg`, TLS terminado ahí, certs en
`/etc/haproxy/*.pem`). El repo no contiene ninguna config de proxy por dominio
(verificado: los nginx del repo son internos a contenedores, sin `server_name`).

- [x] T7 Apuntar `vdt` al React de test. Cambio en el VPS (fuera del repo):
  `backend vdt_backend` → `server vdt 127.0.0.1:8095 check` (antes `:8083`, el LB
  de prod que servía Angular). `pos_backend` → `127.0.0.1:8085` (React prod)
  intacto. El routing ya era separado (`use_backend vdt_backend if host_vdt`,
  `use_backend pos_backend if host_pos`).
- Verificación observada: `haproxy -c -f` válido; `systemctl reload haproxy`;
  `curl -sI https://vdt.playground.sceiba.net/` → HTTP/2 200;
  `curl -s https://vdt.playground.sceiba.net/api/v1/ping` → `{"data":"pong",...}`
  (backend de test); login OK en navegador con un usuario del dump de prod.
- Efecto colateral: `smca_nginx` (:8083) + `smca_frontend` (Angular) de prod
  quedan sin dominio. Limpieza pendiente — decisión de prod, no se toca sin OK.

## Siguiente paso (usuario)

- Hecho 2026-09-20: compose + script + tracker commiteados en la rama `test` (`59d6183a`).
- Próximo objetivo: mecanismo de **deploy a producción** análogo al de test, para
  actualizar prod una vez validado en test.
