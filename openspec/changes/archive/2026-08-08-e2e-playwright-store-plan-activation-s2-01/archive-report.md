# Archive Report — `e2e-playwright-store-plan-activation-s2-01`

**Modo**: hybrid (openspec + engram). **Rama**: `feat/e2e-playwright-store-plan-activation-s2-01`, 10 commits sobre `main`, working tree limpio, **sin pushear**. **Fecha de archive**: 2026-08-08.

## 1. Qué se cierra

Cobertura Playwright para [S2-01] — DG-7, "el OwnerAdmin activa el plan pago una sola vez". Es la primera US CRÍTICA del Bloque B en pasar de PENDIENTE a CUBIERTO en la capa Playwright (la capa .NET ya estaba CUBIERTA). Las 11 aserciones de UI de `docs/testing/e2e-stage-1/S2-01.md:53-63` quedan mapeadas 1:1 a `expect`s genuinos en `frontend-react/e2e/store-plan-activation.spec.ts`, verificadas por lectura de código y por gates sin backend — **no** por una corrida real contra servidor.

## 2. Commits (10)

| Commit | Contenido |
|---|---|
| `bcd91da` | artefactos de planificación (proposal, explore, design, tasks) |
| `8e35849` | ensanchar `ObserverSubject` + `readBearerToken` (WU-1) |
| `27a5c57` | `store-fixture.ts` (WU-2) |
| `e40d4bf` | `store-network-observer.ts` (WU-3) |
| `b347f72` | aserciones DOM de plan gratuito + guarda `featureIds` (WU-4) |
| `cfa49b5` | aserciones de round-trip de guardado (WU-5) |
| `c748ad0` | aserciones de plan pago + fallo de carga (WU-6) |
| `86b0490` | documentación S2-01/README ×2/H-15/H-16 (WU-7) |
| `9e0c7d4` | verify report |
| `9c03809` | corrección del comentario `Parná` (cierre de SUGGESTION-1) |

## 3. Veredicto de verify

**PASS WITH WARNINGS** — 0 CRITICAL, 2 WARNING, 2 SUGGESTION.

- **WARNING-1** (aceptado, no resuelto): un solo `test()` con 10 aserciones oculta el resultado de las posteriores tras un fallo temprano. Decisión mecánica explícita de `tasks.md` §0, justificada; el spec sigue el diagrama del design sin desviación.
- **WARNING-2** (aceptado, no resuelto): el gate `pnpm typecheck`/`pnpm lint` nombrado en `tasks.md` es un **no-op real** para `e2e/` — `pnpm-workspace.yaml` solo declara `apps/*` y `packages/*`; no existe `e2e/tsconfig.json` ni referencia a `e2e` en ningún `eslint.config.*`. Debilidad estructural preexistente, heredada, no introducida por este cambio.
- **SUGGESTION-1**: **CERRADA** por `9c03809` — el comentario de `network-observer-core.ts:114` afirmaba que el typo `Parná` está citado literalmente por `e2e/README.md`; no lo estaba (el README parafrasea). Reescrito para dar la razón verdadera (extracción byte-a-byte de S1-03).
- **SUGGESTION-2**: sigue abierta como nota, no como acción — R4 del design (`⚠️ NO VERIFICADO`) persiste sin gate.

## 4. Gates — quién observó qué

| Gate | Resultado | Observado por |
|---|---|---|
| `npx turbo run test --force` | 179 archivos / 2392 tests verdes, 0 errores de tipo | apply y verify, en sesión |
| `pnpm exec playwright test --list --grep-invert @rate-limit` | `Total: 44 tests in 6 files` | apply, verify **y el orquestador**, en sesión |
| `tsc --noEmit` ad-hoc sobre los 5 ficheros `e2e/` tocados | 0 errores | verify, en sesión — **no cableado a ningún script del repo** |
| `pnpm exec playwright test e2e/store-plan-activation.spec.ts` | ⚠️ **NO VERIFICADO** | diferido al usuario, requiere backend real |
| `pnpm test:e2e` (regresión de los 44) | ⚠️ **NO VERIFICADO** | diferido al usuario, requiere backend real |

El `--list` de 44 confirma mecánicamente la aritmética 42+2 y que ningún spec existente rompió su descubrimiento. **No** confirma que ninguna aserción nueva pase en ejecución real — eso permanece completamente sin observar.

## 5. Frontera de autorización

El usuario autorizó ficheros nuevos más ediciones estrictamente aditivas a `e2e/support/network-observer-core.ts` y un `readBearerToken` nuevo en `auth-storage.ts`. Verificado independientemente por verify y por el orquestador: `git diff` sobre los 5 `*.spec.ts` existentes, `e2e/support/test.ts` y `e2e/support/session.ts` da **0 líneas**. El único cambio en el núcleo compartido es una línea: `ObserverSubject` gana `'tienda'`.

## 6. Hallazgos nuevos para el catálogo

**H-15** — el backend no tiene candado de dirección única para el plan (`UpdateStoreCommand.cs:69-106`, único guard `IsSuperAdminOrOwnerAdmin` en `:71-72`). DG-7 es una garantía exclusivamente de UI. A diferencia de H-10 (barrera de frontend *emergente*), acá es **deliberada y documentada** (`plan-picker.tsx:9-15`) — falta la mitad de servidor de una intención que sí existe. Ironía registrada: la ausencia de ese candado es la única razón por la que este test puede existir; el cambio depende del defecto que documenta.

**H-16** — dos nociones de "owner admin" en el mismo código. `edit-store.tsx:37` computa `isOwnerAdmin` desde `hasOwnersAvailableFeature`, no desde el flag `user.isOwnerAdmin`, y esa feature nunca puede otorgarse porque cuelga de `ModuleType.Administration`, sembrado `availableToStore: false` (`ModuleEntityTypeConfiguration.cs:39`). Esto **corrigió la aserción 10 de la US**: el selector de dueño no se renderiza, no está meramente deshabilitado. Segundo orden, el que importa a futuro: **dos defectos se cancelan**. Si `isOwnerAdmin` fuera `true`, `listOwners()` dispararía (`edit-store.tsx:52`), `OwnersController.cs:18` respondería 403, ese 403 caería en el `.catch()` de `edit-store.tsx:80-82`, y el formulario no montaría — matando 10 de las 11 aserciones. Quien "arregle" `isOwnerAdmin` pone esta suite en rojo sin tocar un test.

## 7. Brechas de cobertura declaradas, arrastradas tal cual

- **G1**: la rama `succeeded === false` de `edit-store.tsx:55-58` — la que la aserción 11 cita literalmente — **no** está cubierta. `route.abort()` ejercita el `.catch()` de `:80-82`, no esa rama. Alcanzarla exige fabricar un body de respuesta, es decir un mock real, rechazado en el design.
- **G2**: ningún `/me` corre entre la degradación y el guardado, así que si `Stores=73` sobrevive a la degradación queda sin observar — ni roto ni confirmado.

## 8. Qué queda para el futuro

- [S2-02] (regresión DG-7) necesita la misma precondición y puede reusar `degradeStoreToFreePlan` de `e2e/support/store-fixture.ts` tal cual.
- R4 del design sigue sin resolver: si el backend acepta el header `Authorization` armado a mano vía `page.request` — solo la corrida real del usuario lo confirma.

## 9. Specs sincronizadas

| Dominio | Acción | Detalle |
|---|---|---|
| `e2e-store-plan-activation-ui` | **Creada** | Capability nueva — no existía spec previo. Copiada tal cual del delta; único cambio estructural: `Status: Draft — nueva capability, sin spec previo` → `Status: Active` (mismo criterio que S1-03). |
| `e2e-network-observer-core` | **Actualizada (merge)** | REQ-7 fusionado en el spec canónico existente, preservando REQ-1..REQ-6 sin tocar una línea. Se agregó la sección `### Requirement: REQ-7 …` con sus 2 escenarios, transcrita literal del delta, insertada después de REQ-6 y antes de `## Verification Criteria` (posición que implica el orden numérico del propio archivo). Se agregó un checkbox `- [ ] REQ-7 verificado: …` a `## Verification Criteria` — contenido nuevo, no transcripción, necesario porque el delta no traía sección de Verification Criteria propia; sigue el mismo formato que los checkboxes REQ-1..REQ-6 ya presentes. No se tocó `Origin` (sigue apuntando a `e2e-playwright-offline-login-s1-03`, la capability original) ni ningún otro requisito existente. |

### Ediciones estructurales realizadas (para diff-check del orquestador)

1. `e2e-store-plan-activation-ui/spec.md` (archivo nuevo): `Status: Draft — nueva capability, sin spec previo` → `Status: Active`. Resto del contenido es transcripción literal del delta en `openspec/changes/{change}/specs/e2e-store-plan-activation-ui/spec.md`.
2. `e2e-network-observer-core/spec.md` (merge): insertada la sección `### Requirement: REQ-7` completa (transcripción literal del delta, sin la cabecera de sección `## ADDED Requirements` que era framing local del delta) entre REQ-6 y `## Verification Criteria`. Agregado un checkbox nuevo para REQ-7 en `## Verification Criteria` (contenido nuevo, no transcripción — el delta no traía Verification Criteria). Ningún otro carácter del archivo tocado.

## 10. Movimiento de carpeta

**No ejecutado por este agente.** Por instrucción explícita del alcance, la carpeta `openspec/changes/e2e-playwright-store-plan-activation-s2-01/` queda donde está; el orquestador la relocaliza con `git mv` a `openspec/changes/archive/2026-08-08-e2e-playwright-store-plan-activation-s2-01/` para preservar los bytes exactamente.

## 11. Trazabilidad (observation IDs / rutas)

- Proposal: `openspec/changes/e2e-playwright-store-plan-activation-s2-01/proposal.md`
- Explore: `openspec/changes/e2e-playwright-store-plan-activation-s2-01/explore.md`
- Design: `openspec/changes/e2e-playwright-store-plan-activation-s2-01/design.md`
- Tasks: `openspec/changes/e2e-playwright-store-plan-activation-s2-01/tasks.md`
- Verify report: `openspec/changes/e2e-playwright-store-plan-activation-s2-01/verify-report.md`
- Delta specs: `openspec/changes/e2e-playwright-store-plan-activation-s2-01/specs/e2e-store-plan-activation-ui/spec.md`, `.../specs/e2e-network-observer-core/spec.md`
- Specs canónicas actualizadas: `openspec/specs/e2e-store-plan-activation-ui/spec.md` (nueva), `openspec/specs/e2e-network-observer-core/spec.md` (merge de REQ-7)
- Engram: `sdd/e2e-playwright-store-plan-activation-s2-01/{proposal,spec,design,tasks,verify-report,archive-report}` (project `store-mgmt`)
