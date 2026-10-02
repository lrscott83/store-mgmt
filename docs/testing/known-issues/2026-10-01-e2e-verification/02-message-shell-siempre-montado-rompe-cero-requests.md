# 2. El chat ahora se monta siempre y rompe el invariante de cero requests de los 4 tests offline de login-offline

**Qué prueba el test.**
`login-offline.spec.ts` (S1-03): login offline en dispositivo aprovisionado. El modo lo
decide el archivo de roster plantado en `localStorage`, NUNCA la conectividad, y el invariante
documentado es **cero requests HTTP** en el camino exitoso, salvo el POST de telemetría
conocido (`expectOnlyKnownTelemetry`, línea 70-81, tolera solo `USAGE_TRACKER_PATH`).
Cuatro tests lo afirman: **T2 (:236), T10 (:441), F4 (:504) y T11 (:577)** — los 4 fallaron.

**Qué falla (en simple).**
Desde el último merge de qa, el ícono de chat del navbar se monta para toda sesión
autenticada. Como la máquina de tests tiene red, el chat arranca su ciclo HTTP apenas
entra a cualquier página: negocia el hub de SignalR y pide las conversaciones. El test,
que exige cero tráfico, ve 4 requests prohibidos y aborta — en los 3 reintentos.

Mensaje exacto (idéntico en todos los intentos y en ambas corridas de reproducción):

```
Error: Expected zero HTTP requests other than the known store-usage telemetry POST
(T2 destino con productos), but observed 4:
POST http://localhost:5019/hubs/messages/negotiate?negotiateVersion=1 (fetch);
POST http://localhost:5019/hubs/messages/negotiate?negotiateVersion=1 (fetch);
GET http://localhost:5019/api/v1/messages/conversations (xhr);
GET http://localhost:5019/api/v1/messages/conversations (xhr).
```

**Causa raíz (confirmada con reproducción y lectura de código).**
1. El merge `eca8b499` trajo `77cf94af` "feat(messaging): keep the chat icon always
   visible…", que **quitó del navbar el gate** `{GlobalConfig.USE_ONLINE_SERVICE &&
   <MessageShell />}` (puesto en `3bd432ab` exactamente para proteger este invariante) y
   dejó `<MessageShell />` siempre montado (`navbar.tsx:106-109`).
2. La "auto-puerta" en la que confía ese commit es `useOnlineStatus()` — y ese hook es
   `useState(navigator.onLine)` + eventos `online`/`offline` del navegador
   (`use-online-status.ts:3-4`). Refleja la interfaz de red, **no** el modo del spec ni el
   flag de negocio: en la máquina E2E hay red, así que es `true` siempre.
3. Con `isOnline=true` y usuario OwnerAdmin (los rosters E2E lo son), al montar cualquier
   página autenticada: el efecto de montaje dispara `refresh(false)` → `GET
   /api/v1/messages/conversations`, y el efecto SignalR (`message-shell.tsx:299-313`)
   crea la conexión del hub → `POST /hubs/messages/negotiate` (×2 por remontaje de React).
4. `expectOnlyKnownTelemetry` exige cero → throw → 3 intentos fallidos por test.

**Evidencia (2026-10-01, esta máquina).**
1. Suite completa (`pnpm test:e2e --workers=4 --max-failures=1`, backend `http-e2e` en
   :5019, tras el fix del guard de la ficha 01): **4 failed** (los 4 del spec), 5 flaky,
   92 passed, 252 did not run (5.1m). Corte por primer fallo, como se pidió.
2. Repro en solitario del T2 (línea 236) **con backend arriba**: `1 failed`, 3/3 intentos
   con el mismo error.
3. Repro en solitario del T2 **sin backend** (README: este spec corre sin backend):
   `1 failed`, 3/3 intentos, **mismo error** — requests fallidos que el observer igual
   cuenta. El fallo es independiente del backend vivo: los requests salen por
   `navigator.onLine`.
4. El spec T2 declara su supuesto explícito (`login-offline.spec.ts:256-258`): "Zero API
   requests: GlobalConfig.USE_ONLINE_SERVICE = false routes this through the offline
   product/category services". El flag sigue en false (no hay requests de
   products/categories), pero ya no protege al shell porque el navbar lo montaba fuera de
   ese gate.

**Estado de la causa raíz:** confirmada y reproducida 6/6 intentos (3 con backend, 3 sin).

**Propuesta de solución (AUTORIZADA por el usuario 2026-10-01 — aplicada y verificada).**
El usuario resolvió la discrepancia como decisión de negocio: **el chat está SIEMPRE
visible para el Owner de la tienda autenticada** — los requests de mensajería son
comportamiento correcto y el spec debe tolerarlos.

**Aplicación y verificación (2026-10-01).**
Se editó SOLO `login-offline.spec.ts` (autorización 1 a 1): el whitelist de
`expectOnlyKnownTelemetry` pasó de un path a `KNOWN_BACKGROUND_PATHS` = telemetría +
`/hubs/messages` (negotiate + WebSocket del hub) + `/api/v1/messages` (REST del chat), con
comentarios actualizados a la regla de negocio. El invariante real de S1-03 queda intacto:
**cero AUTH y cero HTTP de products/categories** — eso no cambió y sigue asertado.
Verificación: `pnpm test:e2e e2e/login-offline.spec.ts --workers=1` → **12/12 passed**, dos
corridas consecutivas (23.6 s y 20.8 s), incluyendo los 4 tests que fallaban y T1, que
toleraba el tráfico solo por carrera y ahora es determinista. Sin commitear.

**Hallazgo colateral (pendiente de autorización — ver ficha 3).**
`sync-export-import-v2.spec.ts` tiene una COPIA independiente del mismo helper con el
whitelist viejo y falla por la misma causa (T1 y T2). NO se tocó: es otro spec y la
autorización fue 1 a 1. Detalle en la ficha 3.
