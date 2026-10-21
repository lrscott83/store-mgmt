# Feature: deploy-public-url-check — el deploy valida el dominio público, no solo el contenedor

Workflow: **ODD**. Rama: trabajo actual. Entrega: `scripts/deploy-test.sh`, `scripts/deploy-prod.sh`, `scripts/README.md`.
Runner: `wsl bash -n` (no hay bash nativo en Windows). No se puede ejecutar el deploy real desde local (requiere el VPS).

## Specs

### S1 — test falla si `vdt` no responde
Después del smoke local, `deploy-test.sh` MUST comprobar `GET https://vdt.playground.sceiba.net/api/v1/ping`.
Si el smoke local pasa y esta comprobación falla, el script MUST terminar con código distinto de cero,
MUST imprimir el código HTTP observado y MUST indicar que el `server` de HAProxy debe apuntar a `127.0.0.1:8095`.
MUST NOT ejecutar rollback: el stack está sano y el rollback no arregla el proxy.

### S2 — producción falla si `pos` no responde
`deploy-prod.sh` MUST hacer lo mismo con `https://pos.playground.sceiba.net/api/v1/ping` y el puerto `127.0.0.1:8085`.
La comprobación MUST ejecutarse DESPUÉS del bloque de rollback y MUST NOT dispararlo.

### S3 — URL configurable
Ambos scripts MUST permitir sobreescribir la URL con `PUBLIC_SMOKE_URL`, con default por entorno.

### S4 — documentación
`scripts/README.md` MUST describir la comprobación y su carácter de "falla sin rollback".

### S5 — sin regresiones
El smoke local (`localhost:$REACT_PORT`) y todas las rutas de rollback existentes MUST conservar su comportamiento.
`deploy-state.txt` MUST registrar la URL pública usada.

## Tasks

- [x] T1 `deploy-test.sh`: `PUBLIC_SMOKE_URL` (default `https://vdt.playground.sceiba.net`), `public_ok()`, STEP 7b sin rollback, `PUBLIC_URL=` en `deploy-state.txt`. Evidencia: `bash -n` exit 0.
- [x] T2 `deploy-prod.sh`: `PUBLIC_SMOKE_URL` (default `https://pos.playground.sceiba.net`), `public_ok()`, STEP 7b después del rollback, `PUBLIC_URL=` en `deploy-state.txt`. Evidencia: `bash -n` exit 0.
- [x] T3 `scripts/README.md`: paso 8 en la lista de test y subsección común "Verificación de la URL pública".
- [x] T4 Verificador independiente (item de riesgo 5: deploy) + spot check del padre.
  Evidencia: `bash -n` OK en ambos; verificador ejecutó los scripts con `podman`/`curl` simulados en un
  directorio temporal y confirmó S1–S5, **cero blockers**; comparación contra `git show HEAD:` mostró
  smoke local y rollbacks idénticos. Spot check del padre: `bash -n` OK, `git diff --stat` = 35/0 y 34/0
  líneas (solo adiciones).
  Advisories del verificador: (a) lista "Qué hace" de producción sin el paso 7b → corregida;
  (b) ante fallo de la URL pública el `deploy-state.txt` queda describiendo el deploy anterior → aceptado
  (el run termina en error con log explícito).

## Log

### L1 — Pedido del usuario (verbatim)

> si, y al de produccion pero en lugar de vdt con pos. Entendiste? Luego me dices ese cambio donde se hizo y que debo hacer? Despues segguimos con la causa raiz porque hace falta saber por que se cambio ese puerto para que no vuelva a pasar

### L2 — Decisión de diseño

La comprobación es **posterior y separada** del smoke local, y **no** forma parte del rollback:
restaurar BD o imagen no corrige un `backend` mal apuntado en HAProxy, y destruiría un deploy sano
por una causa ajena (el incidente real del 2026-10-21). Se le da 30 s de margen para propagación.

### L3 — Evidencia local

`wsl bash -n scripts/deploy-test.sh` → exit 0. `wsl bash -n scripts/deploy-prod.sh` → exit 0.
`git diff --check` → sin errores. Sin ejecución real: el deploy vive en el VPS.
