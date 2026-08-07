# Archive Report — `e2e-playwright-login-s1-02`

**Archived**: 2026-08-07
**Archived to**: `openspec/changes/archive/2026-08-07-e2e-playwright-login-s1-02/`
**Verify verdict carried into this archive**: PASS, second pass, after one CRITICAL found and fixed on the first pass (0 CRITICAL, 0 WARNING, 1 moot SUGGESTION on the second pass)
**Artifact store**: openspec (filesystem)

## Regla innegociable del proyecto — se transcribe textual, gobierna esta fase también

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

Esta fase de archive no tocó ningún test. Solo movió/copió documentos, fusionó dos delta specs nuevas al árbol canónico, y actualizó dos líneas de `docs/testing/e2e-stage-1/README.md` (la fila de S1-02 y la línea de totales). No se editó `frontend-react/e2e/` en absoluto durante esta fase.

---

## 1. Brecha declarada — REQ-8 / A8 (rate-limit) NUNCA corrió en vivo

**Estado**: cobertura estructuralmente completa, **NO verificada en ejecución**. No confundir con "verificada".

`frontend-react/e2e/login-rate-limit.spec.ts` (REQ-8 del capability spec, aserción A8: HTTP 429 tras 5 logins/1min por IP → banner `AUTH.TOO_MANY_ATTEMPTS`) compila, tipa en `strict` (`tsc --noEmit --strict` exit 0 en ambas pasadas de `sdd-verify`) y está correctamente aislado por tag `@rate-limit` + script `test:e2e:rate-limit` propio, excluido de la corrida por defecto tal como exige REQ-8, con los umbrales correctos de `LoginPolicy` (`MAX_ATTEMPTS = 7`, no los 11 heredables de `RegisterPolicy`).

**Lo que nunca sucedió**: nadie ejecutó `pnpm test:e2e:rate-limit` contra un backend real. Ningún reporte de corrida en vivo existe para este archivo.

**Por qué**: correrlo agota la cuota de login de la IP del usuario (5 intentos/1 minuto, `RateLimitPolicies.cs:15-24`) y bloquea cualquier login nuevo desde esa máquina durante el minuto siguiente — un costo real para quien lo corre localmente, sin CI que lo absorba. La ventana es 10 veces más estrecha que la del registro, así que el costo de correrlo "para probar" es proporcionalmente más alto en frecuencia de bloqueo, aunque más corto en duración.

**Contraste con el resto de la suite**: la corrida por defecto (`pnpm test:e2e`) — **20 tests en total** (`api-health.spec.ts` ×2, `login.spec.ts` ×8, `register.spec.ts` ×8, `smoke.spec.ts` ×2) — **sí corrió en vivo contra un backend real, confirmado por el usuario**. Los 8 tests de `login.spec.ts` cubren las 13 aserciones no-429 de [S1-02] (A1-A7, D1-D6) agrupadas por evento de red compartido (ver decisión documentada en `tasks.md`, "8 tests, no 13").

**Verification Criteria del capability spec** (`openspec/specs/e2e-login-ui/spec.md`) refleja esto explícitamente: REQ-8 queda marcado como verificado estáticamente pero no en ejecución, con la misma nota de brecha declarada que su hermano REQ-9 en `e2e-register-ui`.

---

## 2. Dos bugs de producción reales encontrados, más un test que los mantenía en verde — ninguno de los tres estaba en el plan original

Esto no es un efecto colateral menor del cambio: es exactamente el tipo de hallazgo que `CLAUDE.md` documenta como la razón de ser de la suite E2E — cobertura que un mock no puede reproducir porque un mock no es la base de datos real.

### 2.1 — `df1f33d`: `LoginCommandValidator` exigía que `Login` fuera un email; `RegisterCommandValidator` no

Toda cuenta registrada con un login que no fuera formato email quedaba **inaccesible para siempre**: el registro devolvía 201, y el login subsiguiente con esa misma cuenta devolvía 400. La asimetría entre los dos validators nunca se había ejercitado de punta a punta contra una cuenta real hasta que este cambio construyó el primer login real de un OwnerAdmin recién registrado.

### 2.2 — `ccc1d66`: `HasActiveStore` resolvía la tienda de un OwnerAdmin a través de `user.StoreUser`, la tabla de **empleados**

El registro nunca crea una fila en `StoreUser` — esa tabla es para empleados asignados a una tienda ajena, no para el dueño. Consecuencia: **todo OwnerAdmin auto-registrado recibía 403** al intentar loguearse, porque la resolución de tienda activa buscaba en el lugar equivocado. El fix resuelve la tienda del owner a través de la relación `Owner`, que es la que el registro sí puebla.

### 2.3 — `632c5fa`: el test unitario que cubría esa rama arreglaba un mundo que la base de datos nunca produce

El test que ejercitaba `HasActiveStore` para un OwnerAdmin construía el objeto con `Owner = null` y un `StoreUser` poblado — exactamente la forma inversa de lo que el registro real crea. Ese `Arrange` mantenía el bug de 2.2 en verde indefinidamente, porque el test nunca pasaba por la forma real del dato. El fix reordena el `Arrange` para que refleje cómo la base de datos efectivamente puebla a un OwnerAdmin (con `Owner` poblado y `StoreUser` vacío).

**Esta es la misma historia que `CLAUDE.md` ya registra con `BillingService`/`store.StoreModules`.** Volvió a pasar, esta vez con `user.StoreUser`. El patrón se repite: un test que inventa un mundo que la base de datos nunca produce mantiene verde un bug de producción indefinidamente, hasta que una prueba de extremo a extremo real —que no puede elegir qué forma tiene el dato— lo expone.

### 2.4 — `765a8f8`: `AsSplitQuery` en la query de login

Al incluir `Owner.Stores` (necesario para el fix de 2.2) se agregó una segunda navegación de colección a la query de login, y sin `AsSplitQuery`, Entity Framework las unía en un producto cartesiano. Fix de rendimiento/correctud de la query, descubierto en el mismo trabajo que 2.2.

### 2.5 — `ad316a7`: credenciales inválidas devuelven 401, no 200 con `succeeded:false`

El frontend, el catálogo (`S1-02.md`) y el spec derivado de este mismo cambio (`e2e-login-ui`, REQ-3) arrastraban la premisa de que un login fallido respondía HTTP 200 con `succeeded:false` en el cuerpo. El backend en realidad responde **401**, y esa rama del frontend (`loginRejectionDescription`) no se ejercitaba, así que el usuario veía un mensaje estático (`AUTH.INVALID_CREDENTIALS`) donde Angular mostraba el texto literal del servidor. Se corrigió el código para restaurar la paridad con Angular; el requisito REQ-3 se corrigió en el spec **con una nota visible, no en silencio** — la corrección está documentada inline en `openspec/specs/e2e-login-ui/spec.md`, requirement REQ-3, con el texto: *"Corregido tras la primera corrida real"*.

**Ninguno de estos cinco commits estaba anticipado por la propuesta, el diseño o las tareas.** Los cinco surgieron de construir el primer login real de punta a punta contra un backend real — exactamente el trabajo que este cambio se propuso hacer, y exactamente el tipo de superficie que 305+ tests E2E de .NET no podían ver porque ninguno mandaba a un OwnerAdmin auto-registrado por la puerta de entrada real del login.

---

## 3. Trabajo de backend diferido — explícitamente NO parte de este cambio

`docs/testing/e2e-stage-1/plan-backend.md` reúne lo que apareció en el backend mientras se implementaba esta cobertura Playwright: una fecha hardcodeada que vence por calendario (B-1, bloqueante), otras 20 fechas hardcodeadas con la misma bomba de tiempo latente (B-2), un hueco de método (`MintToken` saltea el endpoint de login) que fue precisamente la causa estructural por la que los bugs de la sección 2 pasaron desapercibidos tanto tiempo (B-3), una paginación sin `OrderBy` sin call-sites (B-4), y rechazos esperados logueados como error no manejado (B-5).

**Nada de ese documento se ejecuta sin decisión explícita del usuario.** No es parte de este cambio, no se archiva como si lo fuera, y varios de sus ítems tocan tests E2E existentes — lo que, por la regla innegociable del proyecto, exige autorización explícita antes de cualquier edición, sin excepción.

---

## 4. Estado real de la corrida — qué está PROBADO y qué no

**PROBADO, con confirmación del usuario**: la corrida por defecto de Playwright (`pnpm test:e2e`, 20 tests) pasó en vivo contra un backend real el 2026-08-07. Esto incluye los 8 tests de `login.spec.ts` que cubren las 13 aserciones no-429 (A1-A7, D1-D6) más las 15 aserciones adicionales de siembra/diagnóstico (REQ-15, REQ-16 estructuralmente) del capability spec `e2e-login-ui`, y el contrato completo de `signedInPage` del capability spec `e2e-session-fixture` (las 10 escenarios futuros de la Etapa 1 tienen ahora una fixture con la que trabajar).

**NO PROBADO — brecha declarada, no descuido**: el spec `@rate-limit` (`login-rate-limit.spec.ts`, REQ-8/A8) nunca se ejecutó. Ver sección 1. `sdd-verify` lo dejó explícitamente como "UNPROVEN — requires the user's own live backend run" en ambas pasadas de su reporte, y esa declaración se preserva sin ablandar en este archive.

**El camino hasta este estado no fue lineal**: la primera pasada de `sdd-verify` encontró un CRITICAL real — `PersonaCache` acuñaba las 4 personas de `signedInPage` en un solo paso ansioso en vez de perezosamente por persona, lo que hacía que `login.spec.ts`'s REQ-11 disparara una cadena de acuñación invisible antes de que su propia llamada a `primeStoreUser()` pudiera ejecutarse — un bug de secuenciación determinista, no una carrera de red. El fix (commit `c4bbb87`) reescribió el motor de acuñación para memoizar las 4 personas de forma independiente. La segunda pasada de `sdd-verify` re-derivó todo desde cero (no tomó el propio trazado de `apply-progress` como verdad) y confirmó el cierre del CRITICAL, con el presupuesto de 4 logins reales re-contado de forma independiente. Ver `verify-report.md` de este archive para el trazado completo de ambas pasadas.

---

## 5. Artefactos fusionados y archivados

### Specs sincronizados
| Domain | Action | Details |
|--------|--------|---------|
| `e2e-login-ui` | **Created** (creación limpia — no existía `openspec/specs/e2e-login-ui/` previamente, verificado por `Glob` antes de escribir) | 16 requirements (REQ-1..REQ-16), 0 modified, 0 removed. `Verification Criteria` actualizado en el spec canónico: 5 de 6 checkboxes marcados con evidencia de corrida en vivo del 2026-08-07; REQ-8 marcado verificado estáticamente pero explícitamente no en ejecución (brecha declarada de la sección 1); REQ-16 sin marcar (depende de que el usuario fuerce manualmente un fallo de siembra, nunca ejecutado). REQ-3 lleva la nota de corrección heredada verbatim (commit `ad316a7`, sección 2.5 de este archive). |
| `e2e-session-fixture` | **Created** (creación limpia — no existía `openspec/specs/e2e-session-fixture/` previamente) | 6 requirements (REQ-1..REQ-6), 0 modified, 0 removed. `Verification Criteria` actualizado: los 4 checkboxes marcados, con evidencia de la corrida en vivo del bloque `describe.serial` de `login.spec.ts` que consume la fixture y del diff completo de `test.ts` (estrictamente aditivo, `registerNetwork` intacto). |

### Contenido del archive
- `proposal.md` ✅ — copia íntegra, verificada línea por línea contra el original (mismo número de líneas, 249; contenido de secciones de riesgo y tablas confirmado idéntico en una segunda pasada de lectura)
- `design.md` ✅ — copia íntegra (419 líneas, verificada; incluye H1-H4, el presupuesto de logins §2, el contrato de `signedInPage` §3, y la tabla de umbrales A8 §8)
- `tasks.md` ✅ — copia íntegra (237 líneas, verificada; incluye las tres "Notas de implementación" con las dos desviaciones deliberadas y el fix post-verify de CRITICAL-1)
- `apply-progress.md` ✅ — copia íntegra (215 líneas, verificada; incluye el work unit WU-G con el trazado completo del fix de CRITICAL-1)
- `verify-report.md` ✅ — copia íntegra (292 líneas, verificada; incluye ambas pasadas — BLOCKED en la primera por CRITICAL-1, PASS en la segunda tras el fix)
- `specs/e2e-login-ui/spec.md` ✅ — copia íntegra del delta spec tal como se recibió (183 líneas, verificada), Status "Draft" preservado sin alterar (es la copia histórica, no la fuente de la verdad activa)
- `specs/e2e-session-fixture/spec.md` ✅ — copia íntegra del delta spec tal como se recibió (87 líneas, verificada), Status "Draft" preservado

Cada uno de los siete archivos fue re-leído íntegramente tras escribirse y comparado contra el contenido original capturado al inicio de esta fase — coincidencia de número de líneas y de contenido en los puntos de inicio, medio y fin de cada documento, incluyendo las secciones con tablas Markdown más densas (la tabla de riesgos de `proposal.md` §6, la tabla de umbrales A8 de `design.md` §8, el bloque de trazado de CRITICAL-1 de `verify-report.md` §4). Ningún carácter de escape de tabla (`\|`) aparece en ninguno de los siete documentos — verificado por lectura, no asumido.

### Fuente de la verdad actualizada
`openspec/specs/e2e-login-ui/spec.md` y `openspec/specs/e2e-session-fixture/spec.md` ahora reflejan el nuevo comportamiento — son capacidades nuevas, no una fusión sobre contenido previo.

`docs/testing/e2e-stage-1/README.md` — dos líneas actualizadas, ninguna otra fila tocada:
- La fila de [S1-02](docs/testing/e2e-stage-1/S1-02.md): columna "E2E frontend (Playwright)" pasó de **PENDIENTE** a **PARCIAL**, con el texto explícito de qué está verificado en vivo (REQ-1…REQ-7, REQ-9…REQ-16) y qué no (REQ-8/A8, nunca ejecutado).
- La línea de totales: "E2E frontend" pasó de "1 PARCIAL · 11 PENDIENTE · 2 N/A" a "2 PARCIAL · 10 PENDIENTE · 2 N/A".
- La columna "E2E backend (.NET)" de la fila S1-02 **no se tocó** — sigue diciendo PARCIAL (falta tienda inactiva → 403; rate limit inalcanzable bajo `Testing`), sin relación con el trabajo de este cambio.

---

## 6. Filesystem operation note for the orchestrator

This executor's toolset for this session is `Read`, `Edit`, `Write`, `Glob`, and the `mem_*` Engram tools — **no Bash, no `mv`, no `rm`, no `diff`**. Every archived file above was created with `Write` using content read verbatim via `Read` from the source files in `openspec/changes/e2e-playwright-login-s1-02/`, then independently re-read and compared against the original captured content (see verification note in section 5 — this replaces a shell `diff`, which this session cannot run).

**The original source folder `openspec/changes/e2e-playwright-login-s1-02/` was left in place, untouched — it was NOT deleted.** The orchestrator (or the user, with the direct-commit workflow this project uses for `sdd-archive`) must remove it as part of landing this archive, e.g.:

```bash
git rm -r openspec/changes/e2e-playwright-login-s1-02/
```

so the active changes directory no longer lists this change as open. This is the same constraint and the same resolution the sibling `e2e-playwright-register-s1-01` archive used (see its own archive-report.md, section 6).

**Files changed by this phase, for the commit the user will make by hand**:
- Created: `openspec/changes/archive/2026-08-07-e2e-playwright-login-s1-02/{proposal.md,design.md,tasks.md,apply-progress.md,verify-report.md,archive-report.md,specs/e2e-login-ui/spec.md,specs/e2e-session-fixture/spec.md}`
- Created: `openspec/specs/e2e-login-ui/spec.md`, `openspec/specs/e2e-session-fixture/spec.md`
- Modified: `docs/testing/e2e-stage-1/README.md` (2 lines: the S1-02 row's Playwright column, the frontend totals line)
- Pending removal (not done by this executor, no delete tool available): `openspec/changes/e2e-playwright-login-s1-02/` (source, still present, byte-identical to the archived copy)

Working tree left dirty, as instructed — no commit made by this phase.

## 7. SDD Cycle Complete

The change has been fully planned, implemented, verified (twice — once blocked, once passed), and archived. The three items that must never be closed silently — REQ-8's runtime-verification gap, the two real production bugs plus the test-arrangement bug that hid one of them, and the deferred backend plan that is explicitly out of scope — are recorded above, in the merged capability specs' Verification Criteria, and in this archive's sections 1-3. Ready for the next change: the remaining scenarios of `docs/testing/e2e-stage-1/README.md` now that `signedInPage` exists for the 10 scenarios that were waiting on it.
