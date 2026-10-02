# 1. El guard de dev server aborta TODA la suite E2E del frontend (falso positivo con el CSP de SignalR)

**Qué prueba el test.**
No es un test de la aplicación: es el preflight `assertDevServerBackend`
(`e2e/support/dev-server-guard.ts`, invocado por `globalSetup` en `playwright.config.ts`).
Antes de correr nada, hace un GET al dev server (`http://localhost:3333`), lee la cabecera
CSP y compara el "origen de la API" que encuentra en `connect-src` contra el backend que la
corrida espera (`http://localhost:5019/api`). Si no coinciden, **aborta la corrida completa**
con un mensaje accionable. Existe para evitar gastar minutos de timeouts cuando alguien corre
la suite con un dev server mal apuntado.

**Qué falla (en simple).**
El guard "mira" la lista de orígenes permitidos por el CSP del dev server y se queda con el
primer elemento que no sea una palabra clave. Como la lista ahora empieza con el comodín
`ws:` (necesario para el chat en tiempo real), el guard se confunde: cree que el dev server
está configurado contra un backend inventado llamado literalmente `ws:` y **detiene toda la
corrida aunque el dev server esté perfectamente configurado**. Nadie puede correr los tests
E2E del frontend desde que entró ese comodín.

**Causa raíz (confirmada).**
- El merge de qa trajo `a0392d07` "feat(realtime): reach the SignalR hub same-origin and
  allow it in the CSP" (2026-09-30), que añadió a `connect-src` los **comodines de esquema
  desnudos `ws:` y `wss:`** en `apps/web-store-pos/scripts/csp-policy.mjs:59` — son
  necesarios para el WebSocket del hub de SignalR.
- El extractor del guard, `apiOriginFromCsp` (`dev-server-guard.ts:61-79`), descarta como
  "no origen" los tokens `'self'`, `ws://…` y `wss://…` (comparando el **prefijo**), pero
  `ws:` y `wss:` **sin `//` no empiezan con `ws://`/`wss://`**, así que pasan el filtro.
- Resultado: `observedOrigin === 'ws:'` ≠ `http://localhost:5019` → `throw` → la corrida
  entera muere con exit 1 y "4 did not run" equivalente (0 tests ejecutados).

**Evidencia (2026-10-01, esta máquina).**
1. Dos corridas de `pnpm test:e2e --workers=4` con el backend `http-e2e` correcto en :5019:
   ambas abortan en `globalSetup` con
   `Error: El dev server de http://localhost:3333 está configurado contra ws:, pero esta
   corrida espera http://localhost:5019/api.`
2. El puerto :3333 estaba libre antes del arranque (no había server ajeno que reutilizar).
3. Dev server levantado a mano con el `API_URL` correcto inyectado
   (`API_URL=http://localhost:5019/api pnpm dev`):
   `curl -sI http://localhost:3333/` devuelve
   `connect-src 'self' ws: wss: http://localhost:5019 ws://localhost:3333; …`
   — es decir, **el origen de la API correcto SÍ está en la cabecera, en 4ª posición**, y
   aun así el guard lo rechaza porque se queda con el primer token no filtrado (`ws:`).

**Estado de la causa raíz:** confirmada con reproducción y evidencia directa.

**Propuesta de solución (autorizada por el usuario el 2026-10-01 — aplicada y verificada).**
Que el filtro de `apiOriginFromCsp` descarte también los comodines de esquema: saltar todo
token cuyo valor sea exactamente `ws:` o `wss:` (además de los que empiezan con `ws://` /
`wss://` ya filtrados, y de los tokens entre comillas que ya se saltan). Con eso, el guard
volvería a encontrar `http://localhost:5019` (4º token) y la corrida arrancaría normal.
Cambio de ~3 líneas en un archivo de soporte (`e2e/support/dev-server-guard.ts`), sin tocar
la app ni ningún spec. Alternativa descartada: quitar `ws:`/`wss:` del CSP — rompería el
hub de SignalR en producción (es un requisito real del feature, no un error).

**Aplicación y verificación (2026-10-01).**
Se aplicó el fix en `apiOriginFromCsp` (saltar tokens exactamente `ws:`/`wss:`) y se
verificó con el backend `http-e2e` real en :5019 corriendo `pnpm test:e2e
e2e/api-health.spec.ts --workers=1`: el `globalSetup` ya no aborta y los 2 tests pasaron
(11.3s). El guard volvió a encontrar `http://localhost:5019` en el `connect-src`.
Sin commitear; falta correr la suite completa para confirmar que no queda ningún otro
bloqueo.
