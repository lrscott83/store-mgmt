# Diseño — `e2e-playwright-session-hydration-s1-04`

> Fase SDD: **design**. Fecha: 2026-08-07. Entrada: [`proposal.md`](proposal.md).
> Toda cita es `fichero:línea` verificada de primera mano en esta fase.

## En una frase

La hidratación se arma **restaurando un snapshot ya acuñado** y mutando `localStorage` a mano; el único artefacto nuevo compartido es `e2e/support/auth-storage.ts`, y el observer crece **un** método aditivo.

---

## 1. Decisiones de arquitectura

### D1 — El vehículo de hidratación es `restoreSignedInSession`, sin reload previo

**Elegido**: `restoreSignedInSession(page, personaCache, 'owner-admin')` (`session.ts:467`) → mutar `localStorage` → `page.reload()`.
**Rechazado**: `context.addInitScript` (se re-ejecuta en cada navegación y pisaría la mutación bajo prueba); `storageState` propio (desincroniza `loginNetwork` de la página del test, `test.ts:68-74`).
**Razón**: `applySnapshot` (`session.ts:135-143`) hace `goto('/login')` → escribir → `goto(homePath)`. El snapshot viene de un login real, así que `currentUser.authToken === AUTH_MODEL.authToken` (`auth-store.ts:197-199`) y el arranque toma la rama de caché válida (`:127`): **cero `GET /me`**. La restauración no contamina ningún conteo.

### D2 — El conteo de `/me` es absoluto, sin `reset()`

**Elegido**: `expectMeRequestCount(n)` deriva de `events` (`login-network-observer.ts:194`), acumulado desde el inicio del test.
**Rechazado**: agregar `resetMeCount()`.
**Razón**: el observer es `auto:true` **por test** (`test.ts:68-74`) y, por D1, la restauración aporta 0. Las personas derivadas se acuñan en contextos aparte (`session.ts:311-312`), fuera de esta página. Un `reset()` sería estado mutable extra sin ningún caso que lo pida.

### D3 — ⚠️ Corrección al proposal: **T4 necesita DOS mutaciones, no una**

**Hallazgo**: el header `Authorization` se arma con `StorageService.getTokenFromLocalStorage()` (`api-client.ts:37`), que lee la clave **`token`** (`storage-keys.ts:4`) — **no** `AUTH_MODEL.authToken` (`:5`).

| Mutación | Efecto |
|---|---|
| Solo `AUTH_MODEL.authToken` | Mismatch en `:125` ⇒ dispara `/me`, pero viaja el token **válido** ⇒ backend responde **200** |
| Solo `token` | Sin mismatch ⇒ rama de caché ⇒ **cero** `/me` |
| **Ambas** | Mismatch ⇒ `/me` **con token inválido** ⇒ **401 real** |

**Consecuencia**: T4 muta las dos claves. T2/T3/T5/T10 mutan **solo** `AUTH_MODEL.authToken` (necesitan disparar `/me` con token válido o interceptado). La frase del proposal §4 *"una sola mutación produce las dos condiciones"* queda **derogada por este diseño**.

### D4 — T10 no recarga el documento estando offline

**Elegido**: cargar online → `context.setOffline(true)` → **navegación interna** (click) a otra ruta protegida → sesión intacta, `AUTH_MODEL` presente, sin rebote a `/login`.
**Rechazado**: `setOffline(true)` + `reload()` — el documento no se sirve y se afirma contra la pantalla de error del navegador, no contra la app (R1; misma trampa que `login.spec.ts:68-71`).
**Razón**: cierra R1 sin depender del service worker. La mitad *arranque en frío sin backend* la cubre **T3** cortando el origen del API con `page.route()`, que es la simulación honesta de "el servidor no está".

### D5 — El diálogo del 500 es parte de la aserción, no un estorbo (T5)

`api-client.ts:88-95` abre un `showBlockingError` bloqueante en todo 500. T5 lo **afirma visible**, lo cierra, y recién ahí evalúa sesión y navegación.

### D6 — Los helpers de mutación viven en `e2e/support/auth-storage.ts` (fichero nuevo)

**Rechazado**: agregarlos junto a `readAuthModel` (`login.spec.ts:30-43`) — insertar ahí desplaza el fichero que la decisión #1 obliga a tocar solo por append.
**Razón / deuda declarada**: el módulo nuevo replica `AUTH_MODEL_KEY_SUFFIX` (`login.spec.ts:23`). Se acepta con el **mismo criterio de regla de tres** que el propio observer ya documenta (`login-network-observer.ts:123-129`): unificar exige tocar líneas existentes de un spec verde.

### D7 — Resolución de **P2**: la mitad `/` es alcanzable, pero **no discrimina**

**Lo que dice el código**:

1. `/` es `index('home/routes/landing-deep.tsx')` (`routes.ts:20`) — **sin loader**. `guestOnlyLoader` está cableado únicamente a `/login` (`login.tsx:14`) y `/register` (`register.tsx:10`). `landing-deep.tsx` no exporta `clientLoader`, y eso ya está pineado en unit (`landing-deep.test.tsx:85-88`). ⇒ **nada rebota** en la raíz.
2. `initialize()` tiene **un solo** call-site de producción: `auth-store.ts:390`, en evaluación de módulo.
3. `registerAuthRedirect(navigate)` corre en un `useEffect` (`root.tsx:89-91`), es decir **después** del montaje.

**Conclusión**: en arranque en frío, cuando `logout()` evalúa `pathname !== '/login' && pathname !== '/'` (`auth-store.ts:367`), `authRedirect` **todavía es `undefined`** y el `?.()` de `:368` es no-op **cualquiera sea el pathname**. Un T8 de arranque en frío pasaría igual con la guarda borrada: **no muerde**.

**Decisión**: T8 se queda, pero afirma lo que sí es observable — `AUTH_MODEL` borrado, se sigue en `/` (o en `/login`), **cero navegaciones adicionales** contadas por `framenavigated` (R4) — y se documenta que **no** cubre la guarda de pathname. **Brecha declarada**: la cobertura discriminante de esa guarda vive en `vitest` (`auth-store.test.ts:297-315`, que registra un spy real). Exponer el store en `window` para forzarlo sería tocar producción — fuera de alcance.

---

## 2. Flujo de datos del arranque

```
localStorage                auth-store.ts (module eval :388)
  AUTH_MODEL ──┐
  currentUser ─┴─→ getUserByToken :98
                     ├ no AUTH_MODEL ....... null            (0 /me)
                     ├ JSON roto ........... removeItem      (0 /me)  T-parse
                     ├ campos faltantes .... null, NO borra   (0 /me)  T11
                     ├ expiresIn <= now .... logout() :118    (0 /me)  T6,T7,T8
                     ├ token match :125 .... set(user)        (0 /me)  T1
                     └ mismatch :144-149 ... set(bestEffort) → GET /me  (1 /me)
                                               ├ 200 ......... enrich    T2
                                               ├ 401/404 ..... logout()  T4
                                               └ red/5xx ..... retiene   T3,T5,T10
                                                 (header Bearer ← clave `token`, api-client.ts:37)
```

---

## 3. Cambios de ficheros

| Fichero | Acción | Qué |
|---|---|---|
| `frontend-react/e2e/support/auth-storage.ts` | Crear | Helpers de mutación: leer/escribir `AUTH_MODEL`, mutar `token`, escribir crudo (D6) |
| `frontend-react/e2e/support/login-network-observer.ts` | Modificar (**solo adición**) | `expectMeRequestCount(expected)` en la interfaz + su implementación |
| `frontend-react/e2e/login.spec.ts` | Modificar (**solo append**) | T1–T11 al final del `describe.serial`, en orden WU-1…WU-6 |
| `docs/testing/README.md` | Modificar | Sección del invariante + lista cerrada de 6 disparadores |
| `docs/testing/e2e-stage-1/README.md` | Modificar | Invariante + `:33`, `:73`, `:75` (después de verde) |
| `docs/testing/e2e-stage-1/S1-04.md` | Modificar | Bloque E: citas de línea |

---

## 4. Contrato del observer (única superficie nueva compartida)

```ts
export interface LoginNetworkObserver {
  // ...métodos existentes, sin tocar...
  /**
   * S1-04. Cuenta EXACTA de `GET .../v1/auth/me` observados en este test.
   * Absoluto, sin reset (D2): restaurar una persona cuesta 0 /me
   * (session.ts:135-143 + auth-store.ts:127).
   */
  expectMeRequestCount(expected: number): void;
}
```

**Compuerta innegociable**: `login.spec.ts` **y** `login-rate-limit.spec.ts` verdes sin una sola línea modificada (R5).

---

## 5. Estrategia de pruebas

| Capa | Qué | Cómo |
|---|---|---|
| Unit (`vitest`) | Guarda de redirección de `logout()` | Ya cubierto — `auth-store.test.ts:297-315`. **No se toca** |
| E2E (Playwright) | T1–T11 | Append en `login.spec.ts`, cero logins nuevos |
| Verificación de mordida | Cada pin | Invertir la expectativa en el árbol de trabajo, ver rojo, revertir. **Nunca** tocar producción |

**Sin migración.** Todo el cambio es de test y documentación.

---

## 6. Brechas declaradas

| # | Brecha | Causa |
|---|---|---|
| G1 | El **404 real** de `/me` no se verifica contra el backend | H-6: ninguna pantalla llama `activate(false)`. La rama de cliente **sí** queda cubierta por T4 (`auth-store.ts:44` evalúa 401 y 404 en la misma expresión) |
| G2 | La guarda `pathname !== '/login' && pathname !== '/'` no queda pineada en navegador | D7: `authRedirect` es `undefined` en evaluación de módulo (`root.tsx:89-91` vs `auth-store.ts:390`) |

## 7. Preguntas abiertas — cerradas

- [x] **P1** (heredada): el título del `describe.serial` queda inexacto. Renombrarlo no está autorizado. **CERRADA sin cambio** — la inexactitud queda declarada, no corregida.
- [x] **P3** (heredada): ¿S1-04 queda **PARCIAL** o **CUBIERTO**? **CERRADA: PARCIAL**, con G1 y G2 nombradas en `docs/testing/e2e-stage-1/README.md`.

## 8. Riesgo abierto al cierre — T8 es un flake latente

G2 explica por qué T8 no puede discriminar la guarda de pathname. No explica lo que pasó
después: T8 falló **tres corridas seguidas** reportando una navegación de más en el arranque
con `logout()` (`["/login","/login"]` contra `["/login"]`), y en la cuarta pasó **sin que se
arreglara su causa**.

Leer el código no la explica. El redirect de `logout()` está guardado en `/login`
(`auth-store.ts:367`), `guestOnlyLoader` devuelve `null` para un visitante no autenticado
(`loaders.ts:42-58`), y las dos corridas —la que ejecuta `logout()` y la de control— dejan
el store en el mismo `{user: null, isAuthenticated: false}`.

El test quedó instrumentado para que el próximo rojo lo desambigüe: cuenta los requests de
documento junto a las navegaciones. `documents: 1` con dos navegaciones significa que el
router del cliente empujó la segunda; `documents: 2` significa que algo forzó una recarga
dura. Causas distintas, arreglos distintos.

**Esto no está resuelto. Está instrumentado.**
