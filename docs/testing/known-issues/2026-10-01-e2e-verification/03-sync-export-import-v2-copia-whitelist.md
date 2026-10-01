# 3. `sync-export-import-v2.spec.ts` tiene una copia del whitelist de cero HTTP y falla por el mismo chat siempre visible

**Qué prueba el test.**
`sync-export-import-v2.spec.ts` (V2-08, SYNC-02): round trip de backup entre dos
dispositivos — A exporta un backup con producto sembrado, B lo importa y lo ve (T1, línea
213); T2 (línea 272) hace lo mismo con un store vacío. Ambos afirman cero HTTP con una
**copia independiente** del helper de `login-offline.spec.ts`:
`expectOnlyKnownTelemetry` (líneas 65-81), con el whitelist viejo de un solo path
(`/v1/usages/store-daily-usage`).

**Qué falla (en simple).**
Misma causa raíz que la ficha 2, otro spec: con el chat del Owner siempre visible y red
disponible, la página autenticada dispara negotiate del hub de SignalR y GET de
conversaciones. La copia del helper no tolera esos requests conocidos → los tests T1 y T2
fallan. Reproducido: T1 aislado falló **3/3 intentos** con
`Error: device A — zero HTTP beyond the tolerated usage tracker`; el intento previo del
spec completo dejó 2 failed (T1 y T2).

**Estado de la causa raíz:** confirmada — es la ficha 2; aquí solo cambia el archivo
donde vive la copia del whitelist.

**Propuesta de solución (AUTORIZADA por el usuario 2026-10-01 — aplicada y verificada).**
La misma corrección ya autorizada y verificada en la ficha 2, aplicada a la copia:
ampliar el whitelist local de `sync-export-import-v2.spec.ts` con `/hubs/messages` y
`/api/v1/messages` (`KNOWN_BACKGROUND_PATHS`, misma forma que la ficha 2).

**Aplicación y verificación (2026-10-01).**
Se editó SOLO `sync-export-import-v2.spec.ts` (autorización 1 a 1). Verificación:
`pnpm test:e2e e2e/sync-export-import-v2.spec.ts --workers=1` → **2/2 passed** (19.4 s),
T1 y T2, los dos que fallaban. Sin commitear.
