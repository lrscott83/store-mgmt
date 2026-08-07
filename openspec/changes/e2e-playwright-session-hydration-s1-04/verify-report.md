# Reporte de verificación — e2e-playwright-session-hydration-s1-04

**Fecha**: 2026-08-07
**Modo**: Strict TDD
**Rama verificada**: `feat/e2e-playwright-session-hydration-s1-04` (HEAD real: `5df8500`, incluye 6 commits posteriores a `aa821a2` — el cierre de `sdd-apply` de este cambio)

## Completitud

| Métrica | Valor |
|---|---|
| Tareas totales | 33 |
| Tareas completas | 26 |
| Tareas incompletas | 7 |

Las 7 incompletas son las 6 "verificaciones de mordida" (1.5, 2.5, 3.2, 4.2, 5.3, 6.2) más 1.6 (compuerta `login.spec.ts` + `login-rate-limit.spec.ts` verdes sin diff propio, nunca marcada aunque hoy tiene evidencia estática parcial — ver abajo).

## Ejecución de build y tests

**Build/typecheck**: ✅ `npx tsc --noEmit` implícito en `npx turbo run test --force` (modo typecheck de vitest) — 0 errores.

**Tests unitarios (vitest, esta sesión)**:
```
npx turbo run test --force
Test Files  179 passed (179)
     Tests  2377 passed (2377)
Type Errors  no errors
```
Sin regresión — ningún fichero de producción fue tocado por S1-04 en sí (el refactor `login`≠`email` posterior sí toca producción, pero es un cambio aparte, ya cubierto por sus propios tests unitarios dentro de esos 2377).

**Playwright — parseo (esta sesión, sin browser/backend disponibles acá)**:
```
npx playwright test --list e2e/
Total: 31 tests in 4 files
```
`login.spec.ts` sube de 9 a 19 tests (8 preexistentes de S1-02 + T1-T11 = 19, correcto). `login-rate-limit.spec.ts`: 0 diff confirmado (`git diff --stat aa821a2..HEAD -- frontend-react/e2e/` no lo lista).

**Playwright — ejecución real**: NO corrida por este agente de verify (Chromium local sin `libglib-2.0.so.0`; backend .NET no es mío). **Dato del usuario, no verificado independientemente**: 31 passed, suite completa en verde, en su máquina Windows.

## Matriz de cumplimiento de spec

| Requisito | Escenario | Test | Resultado |
|---|---|---|---|
| REQ-1 | Caché válida → 0 `/me` | `login.spec.ts:306` (T1) | ⚠️ PARTIAL — pasa según el usuario, pero sin mordida confirmada |
| REQ-2 | Mismatch → exactamente 1 `/me`, sesión best-effort | `login.spec.ts:320` (T2) | ⚠️ PARTIAL — ídem |
| REQ-3 | `/me` inalcanzable retiene sesión | `login.spec.ts:340` (T3) | ⚠️ PARTIAL — ídem |
| REQ-4 | 401 real de `/me` → logout + `/login` | `login.spec.ts:447` (T4) | ⚠️ PARTIAL — ídem; rama 404 real (G1) explícitamente fuera de alcance |
| REQ-5 | 500 de `/me` no desloguea | `login.spec.ts:362` (T5) | ⚠️ PARTIAL — ídem |
| REQ-6 | `expiresIn === now` cuenta como vencida | `login.spec.ts:470` (T6) | ⚠️ PARTIAL — ídem |
| REQ-7 | `logout()` borra solo `AUTH_MODEL` | `login.spec.ts:489` (T7) | ⚠️ PARTIAL — ídem |
| REQ-8 | `logout()` en `/login` no navega de más | `login.spec.ts:516` (T8) | ⚠️ PARTIAL — pasa hoy, pero con historial de flake sin causa raíz (ver WARNING) |
| REQ-9 | 401 fuera de `/me` no desloguea | `login.spec.ts:585` (T9) | ⚠️ PARTIAL — ídem |
| REQ-10 | Arranque offline retiene sesión | `login.spec.ts:390` (T10) | ⚠️ PARTIAL — ídem |
| REQ-11 | AUTH_MODEL malformado no borra nada | `login.spec.ts:428` (T11) | ⚠️ PARTIAL — ídem |
| REQ-12 | `expectMeRequestCount` aditivo, specs viejos verdes | `login-network-observer.ts:99,361-368` | ✅ COMPLIANT — estático: método aditivo, 0 diff en `login-rate-limit.spec.ts` |
| REQ-13 | READMEs listan los 6 disparadores | `docs/testing/README.md:22-48`, `e2e-stage-1/README.md:33` | ✅ COMPLIANT |
| REQ-14 | Citas de línea correctas | `docs/testing/e2e-stage-1/S1-04.md` | ⚠️ PARTIAL — corregidas en WU-8, pero un commit posterior (`12ee1ce`) corrió 2 líneas `auth-store.ts` y las desactualizó de nuevo (ver WARNING) |

**PARTIAL** aquí no significa "falla la aserción": significa que la única evidencia de ejecución real es un reporte de terceros (el usuario), sin la mordida (RED) que el propio `tasks.md` exige bajo Strict TDD. La regla dura del skill ("un escenario es compliant solo cuando un test que lo cubre pasó en runtime") se satisface parcialmente: sí corrió y pasó (según el usuario), pero no se demostró que discrimina lo correcto de lo incorrecto.

**Resumen de cumplimiento**: 3/14 COMPLIANT sin reservas (REQ-12, REQ-13, y REQ-14 con nota), 11/14 con la reserva de mordida-nunca-hecha.

## Corrección (evidencia estática)

Verificado por lectura directa del código, no asumido:

| Aserción | Código fuente | Nota |
|---|---|---|
| T2/T3/T5/T10 mutan solo `AUTH_MODEL.authToken` | `auth-storage.ts:61-86` | Confirma D3 |
| T4 muta `AUTH_MODEL.authToken` + `token` | `login.spec.ts:457-461`, `auth-storage.ts:95-100` | Confirma D3 (dos claves distintas: `storage-keys.ts:4` vs `:5`) |
| `getUserByToken` — ramas cache-válida/mismatch/malformado/expirado | `auth-store.ts:100-192` | Coincide con el flujo del design.md §2 (líneas corridas +2 respecto a lo citado en S1-04.md, ver WARNING) |
| `logout()` borra solo `AUTH_MODEL` | `auth-store.ts:352-356` | Confirma T7 |
| Guarda de redirect de `logout()` | `auth-store.ts:364-369` | Confirma D7/G2 — `authRedirect` es `undefined` en eval de módulo |
| 401 fuera de `/me` no especial-casea | `api-client.ts:79-98` | Confirma T9/REQ-9 |
| 500 abre `showBlockingError` con copy literal | `api-client.ts:88-96`, `es.ts:322,327` | Confirma T5 |
| `PUT /v1/users/{id}` es el endpoint real de `updateProfile` | `profile-http-service.ts:17-26` | Confirma el `page.route('**/v1/users/*')` de T9 |
| Botón "Guardar cambios" / mensaje de error de perfil | `es.ts:589,592` | Confirma copy literal de T9 |
| `describe.serial` título sin tocar (P1) | `login.spec.ts:96` | Sin cambios — respeta la regla de no autorización |
| Cero personas nuevas acuñadas en T1-T11 | grep de `personaCache.prime*`/`restoreSignedInSession` en `login.spec.ts` | Solo `restoreSignedInSession`, ninguna llamada `prime*` nueva |

## Coherencia con el diseño

| Decisión | ¿Seguida? | Nota |
|---|---|---|
| D1 (restoreSignedInSession, sin reload previo) | ✅ Sí | Todos los T1-T11 la usan |
| D2 (conteo absoluto, sin reset) | ✅ Sí | `expectMeRequestCount` no tiene reset |
| D3 (T4 con dos mutaciones) | ✅ Sí | Confirmado en código |
| D4 (T10 sin reload offline) | ✅ Sí, y reforzado | El fix `df8dff9` agregó "warm the route" antes de cortar la red — refinamiento, no desvío |
| D5 (diálogo del 500 es parte de la aserción) | ✅ Sí | T5 lo afirma visible antes de cerrar |
| D6 (`auth-storage.ts` fichero nuevo) | ✅ Sí | |
| D7 (G2 declarada, no forzar mitad `/`) | ✅ Sí, con evolución | El comentario de T8 fue actualizado (`f1bc470`) para marcar el último paso como "razonamiento de código fuente, no confirmado" tras una corrida que lo contradijo — coherente con la honestidad que D7 pedía |

## Assertion Quality Audit (Strict TDD, paso 5f)

Escaneados `login.spec.ts` (bloque T1-T11), `auth-storage.ts`, `login-network-observer.ts` (método nuevo). Sin tautologías (`expect(true).toBe(true)`), sin asserts sin llamada a código de producción, sin ghost-loops (no hay `for`/`forEach` sobre colecciones potencialmente vacías con asserts adentro), sin asserts solo-de-tipo aislados. Todas las comparaciones son de valores concretos (URLs, conteos de red, contenido crudo de `localStorage`, arrays de navegación).

**Assertion quality**: ✅ Sin hallazgos — todas las aserciones verifican comportamiento real.

## TDD Compliance

| Check | Resultado | Detalle |
|---|---|---|
| Evidencia TDD reportada | ⚠️ Parcial | `apply-progress` documenta RED/GREEN en prosa para 1.1/1.2 (el método del observer) pero NO para T3-T11 — son pins de comportamiento existente, no producción nueva, así que el RED clásico no aplica; el sustituto declarado ("verificación de mordida") es el que falta |
| Todas las tareas tienen test | ✅ Sí | 11/11 tests existen, uno por REQ |
| RED confirmado (archivo de test existe) | ✅ Sí | Verificado — `login.spec.ts` contiene los 11 tests, `playwright test --list` los enumera |
| GREEN confirmado (tests pasan) | ⚠️ Solo por reporte de terceros | No ejecutado por este agente; usuario reporta 31/31 verdes |
| Mordida (bite) confirmada | ❌ NO | 6/6 verificaciones sin ejecutar — CRITICAL, ver abajo |
| Triangulación | ➖ N/A | Cada REQ tiene un solo escenario en la spec; no aplica triangulación múltiple |

**TDD Compliance**: 3/6 checks plenamente pasados.

## Hallazgos

### CRITICAL

1. **Las 6 verificaciones de mordida nunca se ejecutaron** (tasks.md ítems 1.5, 2.5, 3.2, 4.2, 5.3, 6.2) — ni durante `sdd-apply` (sin backend disponible) ni durante la corrida posterior del usuario (31 passed no incluyó invertir-la-aserción/confirmar-rojo/revertir). Bajo Strict TDD Mode, ningún test T1-T11 fue visto fallar a propósito: "pasa" y "prueba algo" siguen siendo dos afirmaciones distintas hasta que se confirme la mordida. La auditoría estática de aserciones (arriba) no encontró tautologías ni asserts vacíos — reduce el riesgo, no lo cierra. Acción mínima pendiente: con el backend arriba (ya lo está, según el usuario), invertir cada uno de los 6 pins, confirmar rojo, revertir sin commitear — es una verificación manual de ~15-20 minutos, no una reescritura de código.

### WARNING

1. **T8 (REQ-8) tiene flake histórico sin causa raíz identificada.** Tres corridas consecutivas fallaron reportando una navegación de más durante el logout-boot (`["/login","/login"]` vs. `["/login"]` esperado); la cuarta pasó SIN que la causa se explicara — lo que cambió entre medio fue la métrica del propio test (de conteo absoluto → comparación control/tratamiento con `withLogout`/`withoutLogout`) y selectores de otros ficheros no relacionados con T8. El diseño final es sólido — aísla correctamente la contribución de `logout()` comparando dos reloads idénticos salvo por si `AUTH_MODEL` existe o no — pero no hay evidencia de que se haya corrido más de una vez tras el cambio final, así que su estabilidad bajo repetición sigue sin probarse. Tratado como riesgo abierto.
2. **REQ-14 quedó desactualizado por un commit posterior fuera del alcance de S1-04.** `12ee1ce` (`refactor(auth): name the sign-in credential login, not email`) agregó 2 líneas a `auth-store.ts` antes del bloque `getUserByToken`/`logout`, corriendo 2 líneas todas las citas que WU-8 (`6aeb042`) había verificado como correctas en su momento. Ejemplos verificados en esta fase: la guarda de `logout()` citada como `:364-367` está ahora en `:364-369` (el `if` en `:367`); el bloque `getUserByToken` citado como `:98-190` está ahora en `:100-192`; `:153` (el `await import` de `getMe`) está ahora en `:155`. No rompe ningún test — es documentación — pero el estado actual de `S1-04.md` ya no satisface literalmente REQ-14 ("cada cita coincide con el rango real del fichero citado").
3. **`docs/testing/e2e-stage-1/README.md:33` sigue diciendo "corrida en vivo pendiente"** pese a que el usuario ya reportó la corrida verde (31 passed). Dato superado por eventos posteriores a WU-7; no bloqueante, pero inexacto si se archiva el cambio sin actualizarlo.

### SUGGESTION

1. Ninguna corrida de Playwright fue observada directamente por este agente de verify (limitación de entorno: falta `libglib-2.0.so.0` para Chromium acá, y el backend .NET no corre en esta máquina). La evidencia de "31 passed" es un reporte del usuario. Si se quiere blindar el cierre, valdría pegar la salida cruda de esa corrida (idealmente con el desglose T1-T11 visible) en el `apply-progress` o en este mismo reporte antes de archivar.

## Veredicto

**FAIL** — bloqueado por 1 CRITICAL: Strict TDD Mode está activo y exige mordida confirmada; los 6 pins de S1-04 nunca la tuvieron. La implementación en sí está completa, es estáticamente correcta (sin tautologías, con citas de código verificadas una por una) y funcionalmente verde según el reporte del usuario — esto NO es un defecto de producción ni una regresión; es un gate de proceso sin cerrar. Acción recomendada: correr las 6 verificaciones de mordida (backend ya disponible según el usuario) + actualizar las 2 líneas de documentación obsoletas (README `:33`, `S1-04.md` citas de `auth-store.ts`), después re-verificar.
