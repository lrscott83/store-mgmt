# Verificación del 2026-10-06 — corridas dirigidas, nunca la suite completa

**Qué es esta carpeta.** No es una corrida completa: son corridas **dirigidas, spec por spec**, hechas
para cerrar las dos fichas que seguían vivas del merge de qa y para confirmar (o refutar) las causas
que los documentos daban por tentativas. La suite completa **no** se corrió — fue un pedido explícito.

| Pieza | Detalle |
| --- | --- |
| Backend | perfil `http-e2e` en `:5019`, BD `smca_test` (confirmada por el teardown de cada corrida) |
| Dev server | `:3333`, levantado por Playwright en cada corrida |
| Corridas | Un único spec por corrida, `--workers=1 --retries=0` |
| Logs | `/tmp/iso-<spec>.log`, `/tmp/iso-swr-run2.log`, `/tmp/pwa-run1.log`, `/tmp/pwa-rebuild.log` |

## 1. Ficha 5 (`precache-split`) — ✅ resuelta: el spec corría con el config equivocado

El fallo documentado ("el service worker nunca llega a estado activado") era un **síntoma**: el spec
corría contra el dev server de `playwright.config.ts`, que **bloquea los service workers**
(`serviceWorkers: 'block'`, línea 139) y cuyo SW de dev no precachea nada (`globPatterns: []`).
`navigator.serviceWorker.ready` no puede resolver nunca en ese config.

- **Reproducción del modo de fallo (mutación):** copia temporal de `playwright.config.ts` con
  `testIgnore: []` → `3 failed — Error: Test timeout of 30000ms exceeded (precache-split.spec.ts:31)`,
  **EXITCODE=1**. Es el mismo texto y la misma línea que documentó la ficha del 2026-09-29. El config
  temporal se borró al terminar la medición.
- **Verificación con el config correcto:** `npx playwright test --config=playwright.pwa.config.ts
  precache-split --reporter=line` → **3 passed (21.1 s), EXITCODE=0**, contra un build recién hecho; y
  **3 passed (12.9 s), EXITCODE=0** contra el build que ya existía. El build imprime
  `verify-sw-precache: OK — 192 precached entries; … all 7 required families at their declared counts.`
- **Arreglo:** ya aplicado el 2026-10-01 (commit `78f3d804`, el spec entró en `testIgnore` del config
  principal). Cierre completo en [`../qa-merge-2026-09-29/README.md`](../qa-merge-2026-09-29/README.md).

## 2. Ficha 7 (caché de dependencias de Vite) — ✅ resuelta desde el 2026-10-02

La Opción A recomendada —quitar `optimizeDeps.include`— **ya estaba aplicada** en el commit
`d6f47d53` (2026-10-02), tres días antes de la corrida completa del 2026-10-05. Comprobado hoy:
`git grep optimizeDeps HEAD -- apps/web-store-pos/vite.config.ts` no devuelve nada, y
`node_modules/.vite/deps/` no contiene ningún artefacto de `@store-mgmt/*`. La corrida completa del
2026-10-05 (351 aprobados, 0 fallidos, exit 0) es posterior al fix y es la re-verificación que la
decisión pedía. Cierre completo en [`../qa-merge-2026-09-29/README.md`](../qa-merge-2026-09-29/README.md).

## 3. Barrido de confirmación de causas — qué se sostiene y qué no

| Causa documentada | Veredicto del 2026-10-06 |
| --- | --- |
| Ficha 5: "el service worker nunca se activa" | ⚠️ Era el **síntoma**; la causa real es el config. Corregida y ficha retirada |
| Ficha 7: caché de dependencias de Vite | ✅ Cierto, y el arreglo ya estaba aplicado (2026-10-02) |
| 2026-10-05 #1 `change-password`: inestable de carga | ✅ **Sostenida** — el archivo entero pasa en solitario en 50.0 s |
| 2026-10-05 #2 `store-create-security`: inestable de carga en el setup | ✅ **Sostenida** — los dos tests con su fixture completo pasan en solitario en 42.6 s |
| 2026-10-05 #3 `store-switcher-refresh` SWR-1: inestable de carga | ✅ **Sostenida** — SWR-1 pasa en solitario; los dos intentos aislados lo dejan verde |
| Grupo E (`plan-catalog-superadmin`, `auth-me-*`): "solo carga" | ✅ **Re-confirmada** — 2/2, 11/11 y 3/3 en solitario |
| `movement-reversal` E-R7: "no se reproduce" (2026-10-01) | ✅ **Re-confirmada** — 20/20 en solitario, 4.2 m |
| `store-switcher-refresh` SWR-2: nunca falló / sin modo documentado | ❌ **Refutada** — cae en solitario (1 de 2 corridas) por un locator ambiguo: **ficha 1 de esta carpeta** |
| Grupos B, C y D, fallos 1 a 4 y 6 del merge, corridas del 2026-10-01 y del 2026-10-03 | ⏸️ **No re-corridos hoy** — sus arreglos están aplicados y verificados en sus propias corridas (commits `8e22b884`, `0ea94c58`, `6ff25ccb`, `ede7e030`, `78f3d804`, `9fa2eada`, `4c4f37a0`, `d6f47d53`). Este barrido no los re-ejecutó: eso se dice, no se asume |

## 4. Resultado del barrido en solitario

Cada spec **solo**, con `--workers=1 --retries=0`. Detalle, comandos y evidencia en
[`../funcionan-en-solitario/README.md`](../funcionan-en-solitario/README.md).

| Spec | Resultado | Duración | Exit |
| --- | --- | --- | --- |
| `change-password.spec.ts` | 2 passed | 50.0 s | 0 |
| `store-create-security.spec.ts` | 2 passed | 42.6 s | 0 |
| `store-switcher-refresh.spec.ts` (corrida 1) | **1 failed (SWR-2)** + 1 passed | 48.7 s | **1** |
| `store-switcher-refresh.spec.ts` (corrida 2) | 2 passed | 25.8 s | 0 |
| `plan-catalog-superadmin.spec.ts` | 2 passed | 52.8 s | 0 |
| `auth-me-session-rejection.spec.ts` | 11 passed | 1.3 m | 0 |
| `auth-me-deleted-user.spec.ts` | 3 passed | 33.8 s | 0 |
| `movement-reversal.spec.ts` | 20 passed | 4.2 m | 0 |
| `precache-split.spec.ts` (config PWA) | 3 passed | 21.1 s | 0 |

## 5. Fichas

| Ficha | Estado |
| --- | --- |
| [`01-store-switcher-refresh-swr2-locator-actual.md`](01-store-switcher-refresh-swr2-locator-actual.md) | 🔴 **abierta** — defecto del test confirmado (intermitente), sin autorización para corregirlo |
| [`../2026-10-05-e2e-verification/`](../2026-10-05-e2e-verification/README.md) (fichas 1 a 3) | 🟡 inestables documentados; las fichas 1 y 2 y SWR-1 quedaron re-verificadas en solitario hoy |
| [`../qa-merge-2026-09-29/`](../qa-merge-2026-09-29/README.md) | Sin fichas vivas — las 2 últimas se cerraron y retiraron hoy |

**Queda abierto, ajeno a esta verificación:** el defecto de la aplicación del botón flotante
"Instalar App" que tapa "Desactivar" en `warehouses` (2026-10-03, ficha 5 de esa carpeta) — el test se
arregló y ya no lo vigila. No se tocó hoy.

## Regla de la carpeta

Esta carpeta sigue el contrato de fichas del índice maestro
[`../../known-issues.md`](../../known-issues.md), sección "Contrato de una ficha de test fallido".
Cualquier corrida E2E nueva —completa o dirigida— empieza leyendo ese índice.
