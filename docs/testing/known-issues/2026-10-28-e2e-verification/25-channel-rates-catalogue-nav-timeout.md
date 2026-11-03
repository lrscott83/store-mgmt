# 25. channel-rates-catalogue.spec.ts:108 — el sidebar no aparece a tiempo y su hermano serial queda sin ejecutar (inestable)

## Qué prueba el test

`channel-rates-catalogue.spec.ts:108:7` — *"el 15 es lo que abre la vista; con él el catálogo ofrece
canales reales y el alta pinta su label"*. Con el módulo 15 (MultiMonedas) activo, la pantalla de tasas
de cambio debe ofrecer canales reales y el alta debe pintar su etiqueta.

## Qué falla (en simple)

```
TimeoutError: locator.getAttribute: Timeout 30000ms exceeded.
> 86 |   if (!(await nav.getAttribute('class'))?.includes('w-64')) {
```

El helper intenta leer la clase del sidebar para saber si está colapsado y el locator no resuelve
dentro del `actionTimeout` de 30 s.

## Evidencia

- Corrida completa del **2026-10-28**: falló en el **primer intento** y pasó en el **retry 1** → el
  runner lo reporta como **flaky** (no como fallo de suite).
- Artifact: `frontend-react/test-results/channel-rates-catalogue-ch-a9d1f-*/error-context.md`
  (intento original + `-retry1`).
- Consecuencia: el segundo test del mismo `test.describe.serial` (`channel-rates-catalogue.spec.ts:204`,
  *"el menú no ofrece la página y la ruta queda gateada"*) quedó como el **"1 did not run"** de la
  corrida: en el primer intento el serial se cortó en el test 108.

## Causa raíz — NO CONFIRMADA

Hechos: el fallo es de **tiempo de aparición** del sidebar, no de lógica de negocio; pasó al reintentar
con menos contención. `getAttribute` no espera a que el elemento exista en el estado esperado, y el
helper no tiene una espera explícita previa.

Hipótesis descartadas: no es el gate del módulo 15 (el mismo spec pasó en el retry con el mismo estado
de datos); no es un defecto del catálogo de canales.

## Clasificación

**Inestable de carga/entorno.** No hay evidencia de defecto de la aplicación ni de expectativa
incorrecta: el test es correcto pero su helper es sensible al arranque del layout.

## Propuesta de solución — NO APLICADA

Endurecer el helper: esperar la visibilidad del sidebar (`await expect(nav).toBeVisible()`) antes de
leer su atributo, o reemplazar la lectura puntual por un locator que auto-espere
(`expect(nav).toHaveClass(/w-64/)` / `not` según el caso). Requiere autorización 1 a 1 para tocar el
spec.

## Aplicación y verificación

No aplicada.

## Estado final

🟡 **Inestable documentado** — 2026-10-28.
