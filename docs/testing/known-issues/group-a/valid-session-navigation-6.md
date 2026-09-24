# Test E2E `valid-session-navigation` — 6 (online, sin llave)

> Ficha autocontenida de este test pendiente, con **todos** sus detalles. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba el test

**Hallazgo de la corrida del 2026-09-24.** Test del Grupo A: flujo **online**. Con una sesión iniciada en línea (login online contra el backend real `:5019`, BD `smca_test`) y la llave de dispositivo borrada, **recargar la vista debe mantener la sesión**: el menú de usuario debe seguir visible en la pantalla de inicio y la sesión no debe cerrarse.

## Qué falla

Tras `deleteDeviceKeyDatabase()` + reload, el test muere por timeout sin llegar a la aserción. El trace (`%TEMP%\pw-trace-6\1-trace.trace`) muestra:

- **URL final:** `/login?unlock=1` — la app navega al **unlock gate** de cifrado at-rest (con `unlock=1`, **sin logout**).
- **Login online con wraps:** la respuesta del login **online** ahora trae `storeDekWraps` (material real de wraps por tienda, por la tabla `lizoft.device-dek`), no como antes.

## Causa raíz

**Misma familia que el test 12 (ya resuelto): el unlock gate de cifrado at-rest.**

- El `authLoader` corre **antes** de montar la ruta (`auth/routes/loaders.ts`): sin DEK en memoria y con el roster presente, `needsUnlock(user)` da true (la DEK no se recupera y hay wrap de dispositivo/tabla `lizoft.device-dek` en localStorage intacta).
- `hasUnreadableCiphertext()` da true: el auto-init del carrito/home deja entidades `lizoft.store-*` cifradas, y al recargar sin clave, ese ciphertext es **ilegible** → el gate exige AMBOS y redirige a `/login?unlock=1` **sin logout** (la sesión y la tabla `lizoft.device-dek` sobreviven).
- Es una **excepción legítima del contrato** `docs/contracts/authenticated-session-redirect.md` (el gate de unlock puede mostrar `/login?unlock=1` con sesión válida cuando el DEK no se puede recuperar en este boot).

> **Nota (comportamiento previo vs. actual).** La premisa anterior — "el login online no deja wraps → `needsUnlock=false`" — era cierta solo contra el proceso backend previo. Tras el reinicio del entorno, el backend actual devuelve `storeDekWraps` en el login online igual que en el offline, así que el gate dispara igual en ambos flujos. Este test **no fue tocado**; su fallo es información, no contaminación de cambios ajenos.

## Evidencia

- Trace de Playwright `%TEMP%\pw-trace-6\1-trace.trace` (URL final `/login?unlock=1` + respuesta de login con `storeDekWraps`).
- Re-verificación en solitario: el test **6 no pasa tampoco aislado** (determinista en la re-corrida de los fallidos).
- Etiqueta de estado de la causa raíz: 🔶 **Causa identificada** — el mismo unlock gate de cifrado at-rest que se corrigió para el test 12; decisión pendiente de qué hacer con este test.

## Propuesta / decisión pendiente

- No tocar el test (regla innegociable).
- Documentar como conocida y decidir con el usuario: alinear su spec igual que el test 12 (requiere autorización explícita por ser E2E existente), o dejarlo como known-issue pendiente.
