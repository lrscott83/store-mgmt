# Plan — Deriva de la documentación de rate limit vs. el código real

- **Fecha:** 2026-09-17
- **Ámbito:** Documentación (`frontend-react/e2e/README.md`) más un comentario obsoleto en código productivo de backend (`RateLimitPolicies.cs`). No se prevén cambios de comportamiento.
- **Estado:** Pendiente — evidencia verificada; decisiones abiertas antes de tocar nada.
- **Origen:** detectado al corregir la sección de corrida del README de E2E (scope del suite, base destino, prerequisito de cache de Vite). Al bajar a verificar las cifras de cuota, se encontró que contradecían al código.

## 1. Objetivo

Alinear lo que la documentación dice sobre las cuotas de rate limit con lo que el código realmente configura, y decidir qué hacer con las cifras **derivadas** (costo de una corrida, margen para correr el suite dos veces) que hoy inducen a error.

## 2. Evidencia verificada (2026-09-17)

Fuente de verdad: `backend/src/SMCA.WebApi/PolicyCode/RateLimitPolicies.cs` (46 líneas, leído completo).

| Política | Factory | `PermitLimit` | `Window` | `SegmentsPerWindow` | Lectura |
|---|---|---|---|---|---|
| Login | `RateLimitPolicies.Login` (:15-29) | 40 | 1 min | 3 | **40 logins/min/IP** |
| Register | `RateLimitPolicies.Register` (:31-45) | 50 | 10 min | 10 | **50 registros/10min/IP** (5 por segmento de 1 min) |

### Discrepancias contra `frontend-react/e2e/README.md`

| Línea | Dice el README | Realidad | Severidad |
|---|---|---|---|
| L262 | "el techo es **5 logins por minuto** por IP" | 40/min | Alta — subestima el margen 8× |
| L262 | "dos corridas de `pnpm test:e2e` dentro del mismo minuto suman **8** logins y **se ponen rojas por cuota**" | 8 contra 40 → no se ponen rojas | Alta — advertencia falsa |
| L195 | tabla de diagnóstico: "Cuota de **10 registros/10min** agotada" | 50/10min | Media — el mensaje de error existe, el umbral está viejo |
| L256 | "la corrida por defecto gasta **exactamente 4 logins reales**" | la corrida por defecto hoy son ~82 archivos, no el puñado original | Alta — cifra congelada en una suite que ya no existe |
| L301 | "login (40/min, `RateLimitPolicies.cs:15-29`)" | Correcto | — |

El README **se contradice consigo mismo** (L262 vs L301) y el código le da la razón a L301.

### Discrepancia en código productivo — NO tocar sin aprobación

`RateLimitPolicies.cs:20-24` comenta *"Raised 15 -> 30"* y *"30/min is still a hard ceiling"*. El valor real es `PermitLimit = 40`. El comentario de `Register` (:36-40) sí coincide con su código (50): **solo el de login está desfasado**.

**Hipótesis del origen del "5 logins/min"**: el registro son 50 permisos repartidos en 10 segmentos de 1 minuto = **5 por segmento**. Alguien tomó la tasa *por segmento* del registro y la publicó como techo del login. El README además cita `:15-24` mientras el método `Login` llega hasta `:29` — señal de que la cita se escribió contra una versión anterior del archivo.

## 3. Por qué importa

- La advertencia de L262 hace **esperar un minuto innecesario** entre corridas: fricción inventada.
- L195 **subestima la cuota de registro 5×**: alguien puede diagnosticar mal un `Registration quota exhausted` y creer que la ventana ya pasó cuando no.
- L256 sostiene a L262 con el costo de la suite vieja: las dos cifras se validan mutuamente, y ambas están mal. Ese acoplamiento es lo que hay que romper.
- La fuente de verdad del código tampoco está limpia, así que "copiar del código" no alcanza.

## 4. Pasos de análisis (antes de escribir nada)

1. **Medir el costo real de una corrida de `pnpm test:e2e`** contra `smca_test`. Método más barato: `globalTeardown` ya imprime el desglose por tabla de las filas `e2e-*` que borra — en una corrida de 2 archivos reportó `Owner=1, User=1, Store=1`. Una corrida completa sobre 82 archivos da el número real de registros y logins de una vez.
2. **Confirmar el efecto observable de `SegmentsPerWindow = 3`** en login: con ventana de 1 min, 3 segmentos y `QueueLimit = 0`, verificar contra `login-rate-limit.spec.ts` que el 429 cae donde el cálculo dice.
3. **Barrer el resto del drift**: grep por cifras de cuota en `docs/testing/**`, `docs/plans/**`, `docs/contracts/**` y comentarios de `Program.cs`. Términos: `logins`, `registros`, `cuota`, `rate limit`, `/min`, `per minute`.
4. **Decidir la fuente de verdad documental**: ¿las cifras se citan desde `RateLimitPolicies.cs` con referencia de línea (frágil — ya se desfasó una vez), o se documentan sin número y se apunta a la constante?
5. **Decidir qué hacer con L256**: ¿se mide y se publica el costo real, o se elimina la cifra y se explica que es proporcional a los archivos que corren?

## 5. Cambios propuestos (post-decisión)

1. `frontend-react/e2e/README.md`: L195, L256, L262.
2. `backend/src/SMCA.WebApi/PolicyCode/RateLimitPolicies.cs:20-24`: corregir el comentario — **requiere aprobación explícita** (código productivo backend).
3. **Tripwire propuesto**: un test .NET que asierte el `PermitLimit` de ambas políticas contra una constante, para que cambiar un límite rompa un test en vez de pudrir un comentario. Es cobertura NUEVA: no modifica ningún E2E existente.

## 6. Reglas del proyecto aplicables

- Los E2E existentes NO se tocan.
- Código productivo backend: notificación + aprobación explícita antes de tocar.
- Este documento es análisis: no se toca nada hasta cerrar las decisiones de la sección 4.

## 7. Fuera de alcance

Cambiar los límites en sí (40/min, 50/10min). Este plan alinea la documentación; si esos valores son los correctos es una decisión aparte, y la discusión de si el login necesita 40/min queda para otro documento.
