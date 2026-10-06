# Tests E2E que pasan en solitario

**Qué es esta carpeta.** El inventario de los specs que la suite completa marca como inestables —o
que una ficha previa dio por "solo carga de la suite"— y que **pasan cuando se corren solos**. Existe
para que la próxima vez que uno de ellos caiga en una corrida completa no se confunda carga con
defecto: acá está la medición que dice "este test funciona; lo que no funciona es correrlo junto con
otros 350".

**No cierra fichas.** Que un test pase en solitario **no** lo resuelve: la ficha sigue viva mientras el
mecanismo no esté cerrado. Lo que agrega es la clasificación —inestable de entorno/carga— sostenida
por evidencia en vez de por corazonada.

**Qué significa "en solitario" (si no, la medición no dice nada).** Un único archivo de spec por
corrida, un solo worker y sin reintentos:

```
cd frontend-react
npx playwright test e2e/<spec>.spec.ts --workers=1 --retries=0 --reporter=line
```

Sin `--workers=1`, el "pasa solo" mezcla la contención de los demás tests del archivo; sin
`--retries=0`, un verde puede ser el reintento, que es justamente el modo en que la suite completa lo
esconde. Backend real `:5019` (perfil `http-e2e`, BD `smca_test`) — cada corrida lo confirma con el
mensaje del teardown.

## Medición del 2026-10-06

| Spec | Tests | Resultado en solitario | Duración | Exit | Por qué está en esta lista |
| --- | --- | --- | --- | --- | --- |
| `change-password.spec.ts` | 2 | **2 passed** | 50.0 s | 0 | Inestable de la corrida del 2026-10-05: el botón offline no montó dentro de los 5 s de la aserción bajo carga |
| `store-create-security.spec.ts` | 2 | **2 passed** | 42.6 s | 0 | Inestable de la corrida del 2026-10-05: el fixture `signedInPage` agotó los 120 s bajo carga |
| `store-switcher-refresh.spec.ts` | 2 | **1 failed + 1 passed**, y **2 passed** en la segunda corrida | 48.7 s / 25.8 s | 1 / 0 | SWR-1 es el inestable de la corrida del 2026-10-05; el archivo además esconde un defecto propio de SWR-2 (ver abajo) |
| `plan-catalog-superadmin.spec.ts` | 2 | **2 passed** | 52.8 s | 0 | Grupo E ("solo carga de la suite", 2026-09-24) |
| `auth-me-session-rejection.spec.ts` | 11 | **11 passed** | 1.3 m | 0 | Grupo E (mismo día) |
| `auth-me-deleted-user.spec.ts` | 3 | **3 passed** | 33.8 s | 0 | Grupo E (mismo día) |
| `movement-reversal.spec.ts` | 20 | **20 passed** | 4.2 m | 0 | Ficha E-R7 del 2026-10-01, retirada como "no se reproduce" |
| `precache-split.spec.ts` | 3 | **3 passed** (con `playwright.pwa.config.ts`) | 21.1 s | 0 | Ficha 5 del merge de qa — pero **no** es "solo carga": ver abajo |

**Ocho archivos, 45 tests.** En la primera pasada: 44 aprobados y 1 fallado (SWR-2); en la segunda
pasada del archivo del switcher, 2 aprobados más. Los logs de cada corrida quedaron en
`/tmp/iso-<spec>.log` (y `/tmp/iso-swr-run2.log` para la segunda); el comando de arriba los reproduce.

## Los dos que no son "solo carga" — no confundir

- **`precache-split`** pasa, pero sólo porque corre con **su propio config** (`playwright.pwa.config.ts`,
  `vite preview` del build real). No era un test lento: corría en un config que bloquea los service
  workers. Su ficha se retiró el 2026-10-06; el cierre está en
  [`../qa-merge-2026-09-29/README.md`](../qa-merge-2026-09-29/README.md).
- **`store-switcher-refresh` SWR-2** cayó **en solitario** en la primera corrida del 2026-10-06 y pasó
  en la segunda: es un defecto propio del test (un locator que también casa con su propio aviso de
  éxito), intermitente, que no tiene nada que ver con la carga. Que un spec esté en esta lista no
  significa que **todos** sus tests sean de carga. Ficha:
  [`../2026-10-06-e2e-verification/01-store-switcher-refresh-swr2-locator-actual.md`](../2026-10-06-e2e-verification/01-store-switcher-refresh-swr2-locator-actual.md).

## Cómo se mantiene esta lista

1. Cada corrida en solitario de verificación **agrega o actualiza** la fila de su spec con la fecha, el
   resultado y el exit code. Una fila sin fecha no sirve.
2. Si un spec de esta lista empieza a fallar **de forma repetible** en solitario, deja de pertenecer
   acá: se le abre ficha con el diagnóstico (es la señal de que dejó de ser carga).
3. Un verde en solitario **no retira** la ficha del test: solo sostiene su clasificación. La ficha se
   retira cuando la causa está cerrada o el test deja de existir, según el contrato del índice maestro
   [`../../known-issues.md`](../../known-issues.md).
