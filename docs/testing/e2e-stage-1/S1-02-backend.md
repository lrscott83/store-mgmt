# S1-02 — Plan de backend

> Trabajo **diferido**. Nada de acá se ejecuta sin decisión explícita del usuario.
>
> Plan de backend específico de [S1-02](S1-02.md). Sale de una auditoría del 2026-08-07 que contrastó **cada aserción declarada en la US** contra el código real de `backend/src/SMCA.WebApi.E2ETests/`. No sale de leer la sección "Estado de cobertura" de la US: esa sección es justamente lo que estaba mal.
>
> **Regla del proyecto (`CLAUDE.md`, innegociable)**: tocar un test E2E existente requiere autorización explícita. Agregar tests nuevos está permitido.

## Qué encontró la auditoría

**La US está mejor de lo que dice.** Su única aserción en `[ ]` ya está cubierta.

| Aserción | Estado en la US | Estado real |
|---|---|---|
| Tienda inactiva → **403** con código `Store.Inactive` | `[ ]` — *"Sin cobertura hoy"* | **CUBIERTO** desde el merge: `Auth/AuthLoginFailureTests.cs:64`, `Login_with_inactive_store_returns_403`, que afirma el 403 **y** el código `Store.Inactive` |

Las otras 5 aserciones se verificaron y están cubiertas de verdad.

## Qué hacer

Marcar ese checkbox en `[x]` con su cita, y borrar el párrafo que dice que `Store.Inactive` no aparece en ningún test — ya no es cierto.

**Alcance.** Solo documentación. No toca ningún test.

## Nota aparte

**H-12 quedó refutada.** Decía que el rate limit era inalcanzable bajo `Testing`; la corrida de Playwright del 2026-08-07 observó un 429 real contra ese entorno. Lo que sigue faltando es un test .NET que lo fije — el límite hoy solo lo prueba el navegador.
