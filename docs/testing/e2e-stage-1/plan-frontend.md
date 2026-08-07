# Etapa 1 — Plan de arreglos de frontend

> Trabajo **diferido**. Nada de acá se ejecuta sin decisión explícita del usuario.
>
> Contraparte de [plan-backend.md](plan-backend.md), para la capa Playwright. Reúne lo que quedó abierto mientras se implementaba la cobertura de [S1-01](S1-01.md), [S1-02](S1-02.md) y [S1-04](S1-04.md), que hasta ahora vivía repartido dentro de cada US. Cada ítem lleva su causa con `archivo:línea`.

## Regla que gobierna este plan

**`CLAUDE.md`, innegociable**: *"Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."*

Cada ítem declara si toca un test existente. Ninguno se ejecuta sin autorización, ni siquiera cuando el arreglo parece trivial.

## Estado de un vistazo

| # | Ítem | Severidad | ¿Bloquea hoy? | ¿Toca un E2E existente? |
|---|---|---|---|---|
| [F-1](#f-1) | El catálogo dice que el rate limit nunca corrió, y sí corrió | Baja | No — el dato está desactualizado | No — solo corre y documenta |
| [F-2](#f-2) | Falta la aserción del destino post-registro (S1-01) | Media | No — brecha declarada | **Sí** — encadena sobre `register.spec.ts` |
| [F-3](#f-3) | La guarda de pathname de `logout()` no es verificable en navegador | Media | No — brecha G2, cubierta en vitest | No — pide un test nuevo |
| [F-4](#f-4) | T8 es un flake latente, sin causa raíz | **Alta** | No — verde hoy | **Sí** — el arreglo vive dentro de T8 |
| [F-5](#f-5) | El título del `describe.serial` de `login.spec.ts` es inexacto | Baja | No | **Sí** — autorización requerida |

---

## F-1

### El catálogo dice que el rate limit nunca corrió, y sí corrió

`login-rate-limit.spec.ts` y `register-rate-limit.spec.ts` están fuera de la corrida por defecto (`test:e2e` usa `--grep-invert @rate-limit`) porque gastan decenas de intentos. El catálogo los daba por **no ejecutados**, y el backend por **inalcanzable bajo `Testing`** (H-12).

**Eso ya no es cierto.** El usuario los corrió el 2026-08-07 y **los dos pasaron**. Y pasar no es ambiguo acá: si el bucle agota sus intentos sin ver un 429, el test **lanza un error explícito** (`login-rate-limit.spec.ts:68-72`, `register-rate-limit.spec.ts:70-74`). Verde ⇒ el 429 ocurrió ⇒ el banner de "demasiados intentos" se mostró.

**Qué falta.** La salida de consola de esa corrida no quedó registrada, así que la evidencia es el reporte verbal y no un artefacto. Correr `pnpm test:e2e:rate-limit`, guardar la salida, y actualizar las filas de [S1-01](S1-01.md) y [S1-02](S1-02.md) en el [README](README.md) — hoy dicen "**NUNCA ejecutado**" y "el rate limit es inalcanzable bajo `Testing` (H-12)".

**Alcance.** No toca ningún test. Es correr y documentar.

---

## F-2

### Falta la aserción del destino post-registro (S1-01)

`S1-01.md:67` lo declara: REQ-1…REQ-9 están implementados, pero **falta** afirmar que después del registro el usuario aterriza en `/sales/products`.

**Por qué no se cubrió.** Exige encadenar registro **y** login en el mismo test — el registro deja al usuario en `/login`, no adentro. Ese encadenado es exactamente lo que gasta el presupuesto de logins reales que gobierna toda la suite.

**Alcance.** Encadena sobre `register.spec.ts`, que es un fichero existente. Si se resuelve agregando un test nuevo al final, es aditivo; si se extiende un test existente, **hace falta autorización**.

**Origen.** [S1-01.md](S1-01.md) → "Destino post-registro — lo que falta".

---

## F-3

### La guarda de pathname de `logout()` no es verificable en navegador

`logout()` decide si redirige con `pathname !== '/login' && pathname !== '/'` (`auth-store.ts:367`). Ese `if` **no se puede pinear desde Playwright** en arranque en frío: `initialize()` corre en evaluación de módulo (`auth-store.ts:390`) mientras `registerAuthRedirect(navigate)` corre en un `useEffect` (`root.tsx:89-91`), así que cuando la guarda se evalúa `authRedirect` todavía es `undefined` y el `?.()` es no-op **cualquiera sea el pathname**. Un test de arranque en frío pasaría igual con la guarda borrada.

**Qué haría falta.** Un escenario donde `logout()` se dispare **después** de que React montó — por ejemplo un logout por inactividad — no en el arranque. Es un test nuevo, con su propio diseño.

**Mientras tanto** la cobertura discriminante vive en `auth-store.test.ts:297-315`, con un spy real. Es vitest, no E2E.

**Alcance.** Solo agrega tests nuevos.

**Origen.** Brecha G2 de `e2e-playwright-session-hydration-s1-04`, ver [S1-04.md](S1-04.md) → P-1.

---

## F-4

### T8 es un flake latente, sin causa raíz

El test *"logout estando en `/login` no genera navegación extra"* falló **tres corridas seguidas** reportando una navegación de más (`["/login","/login"]` contra `["/login"]`), y a la cuarta pasó **sin que se arreglara nada**.

Leer el código no lo explica: el redirect de `logout()` está guardado en `/login` (`auth-store.ts:367`), `guestOnlyLoader` devuelve `null` para un visitante no autenticado (`loaders.ts:42-58`), y las dos corridas que el test compara —la que ejecuta `logout()` y la de control— dejan el store en el mismo `{user: null, isAuthenticated: false}`.

**Severidad alta pese a estar verde**: un test que falla y se cura solo es peor que uno que falla siempre. El día que vuelva a ponerse rojo, nadie va a saber si es la app o el test.

**Qué hay puesto.** El test cuenta los requests de documento junto a las navegaciones, así que el próximo rojo desambigua: `documents: 1` con dos navegaciones ⇒ la empujó el router del cliente; `documents: 2` ⇒ hubo recarga dura. **Está instrumentado, no resuelto.**

**Alcance.** El arreglo vive dentro de T8, un test existente. **Autorización requerida.**

**Origen.** [S1-04.md](S1-04.md) → P-3.

---

## F-5

### El título del `describe.serial` de `login.spec.ts` es inexacto

Dice `'login — authenticated flows (A1-A3, A6-A7, D1, D3-D6)'` (`login.spec.ts:96`). Con los 11 tests de S1-04 adentro, esa enumeración dejó de describir lo que el bloque contiene.

**Por qué sigue así.** Renombrarlo es tocar una línea existente, y la autorización que cubrió S1-04 era **solo aditiva**. Se dejó como está y la inexactitud quedó declarada en vez de corregida por cuenta propia.

**Alcance.** Una línea. **Autorización requerida.**

**Origen.** Pregunta P1 de `e2e-playwright-session-hydration-s1-04`, cerrada sin cambio.
