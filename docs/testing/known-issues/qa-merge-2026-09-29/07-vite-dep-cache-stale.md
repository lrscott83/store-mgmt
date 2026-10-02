# 7. Defecto sistémico — el caché de dependencias de Vite puede servir un workspace desactualizado

**Estado: 🔴 ABIERTO — requiere decisión.** No lo introdujo ningún test: rompe la app de dev
y, por lo tanto, cualquier test que dependa de ella.

**Alcance.** Este defecto no pertenece a una corrida ni a un spec. Vive mientras viva
`vite.config.ts:222-224`. Puede volver a romper cualquier suite E2E en cualquier momento,
sin que nadie toque código.

---

## El problema en una frase (para un usuario)

Cambiaste el código de un paquete compartido del proyecto, el build se recompiló
correctamente, y aun así la aplicación usa la **versión vieja** de ese paquete. La pantalla
se queda en blanco con un error que no dice nada útil, y los tests E2E caen sin motivo
aparente.

## Por qué ocurre

`frontend-react/apps/web-store-pos/vite.config.ts:222-224`:

```ts
optimizeDeps: {
  include: ['@store-mgmt/domain'],
},
```

`optimizeDeps.include` le dice a Vite: "pre-empaqueta este paquete en un archivo generado y
sírvelo desde ahí". El resultado vive en
`apps/web-store-pos/node_modules/.vite/deps/@store-mgmt_domain.js`.

**Vite decide cuándo re-empaquetar una dependencia mirando su `package.json` y el lockfile,
no el contenido de su carpeta `dist/`.** Así que:

1. Editás `packages/domain/src/commons/plan-module-groups.ts` y agregás un export.
2. `pnpm dev` → `turbo run dev` → `dependsOn: ["^build"]` recompila `packages/domain/dist/`
   **correctamente** (esto ya está bien; `turbo.json:24-28`).
3. Vite **no se entera**: sigue sirviendo el `.vite/deps/` viejo.
4. Toda ruta que importe el export nuevo revienta con
   `SyntaxError: does not provide an export named '...'`.
5. React Router convierte ese `SyntaxError` en `No result returned from dataStrategy` y lo
   muestra en el error boundary. **La causa real nunca llega a la pantalla.**

### Evidencia medida

| Artefacto | Fecha | `NO_PLAN_GROUP` |
|-----------|-------|-----------------|
| `packages/domain/src/commons/plan-module-groups.ts` | 2026-09-29 15:27 | presente |
| `packages/domain/dist/commons/plan-module-groups.js` | 2026-09-29 15:56 | presente |
| `apps/web-store-pos/node_modules/.vite/deps/@store-mgmt_domain.js` | **2026-09-28 10:20** | **ausente** |

El `dist/` estaba más nuevo que el caché. El caché era el eslabón podrido.

## Por qué es peligroso, no solo molesto

- **El mensaje de error miente.** Dice "No result returned from dataStrategy", que suena a
  problema de React Router o de la ruta. No lo es. Cuesta horas encontrarlo.
- **Falla en silencio y selectivo.** Solo rompen las rutas que importan el símbolo nuevo.
  El resto de la app funciona normal, así que parece un bug de una sola pantalla.
- **Se propaga a los tests como si fuera defecto de la app.** Dos specs quedaron
  documentados como "la lista de tiendas no carga". El backend nunca estuvo implicado.
- **Genera falsas señales verdes.** `e2e/admin-routes.spec.ts` pasaba mientras la app estaba
  rota, porque solo afirma que el pathname no es `/login` y que el body tiene texto. Una
  página de error cumple las dos.

## Opciones para que no vuelva a pasar

### Opción A — Quitar `optimizeDeps.include` (recomendada)

```ts
// vite.config.ts — eliminar el bloque optimizeDeps completo
```

Vite **no** pre-empaqueta por defecto los paquetes del workspace enlazados: los sirve
directamente. Como `packages/domain/dist/` ya está compilado por turbo antes de que arranque
el dev server (`dev` → `dependsOn: ["^build"]`), servirlo directo siempre entrega la versión
correcta. **El fallo deja de ser posible por construcción**, no por disciplina.

- A favor: ataca la causa; sin coste en build ni en `preview` (es config de dev); no depende
  de que alguien recuerde borrar nada.
- En contra: cambia el comportamiento de dev (más módulos individuales en vez de uno
  pre-empaquetado). **A verificar:** la primera carga de dev puede ser algo más lenta, y hay
  specs CSP/PWA que corren contra `vite preview`, no contra este dev server — no deberían
  verse afectadas, pero hay que confirmarlo corriendo la suite.
- Riesgo: **desconocido hasta medirse.** No se aplicó todavía.

### Opción B — `optimizeDeps.force: true`

Fuerza el re-empaquetado en cada arranque. Correcto, pero paga el coste en cada `pnpm dev`,
incluidos arranques que no tocan `domain`. Es un parche, no una solución: deja el modo de
fallo intacto para el resto de paquetes.

### Opción C — Limpiar `.vite` en el `globalSetup` de Playwright

`frontend-react/e2e/support/global-setup.ts` ya existe y ya corre antes de la suite. Borrar
`apps/web-store-pos/node_modules/.vite` ahí protege **a los tests**, pero no a una persona
que abre `pnpm dev` en su máquina. Es defensa en profundidad, no la solución.

### Opción D — Nada, solo documentar

Se acepta el riesgo y esta ficha queda como referencia de diagnóstico. Costo: el próximo
`NO_PLAN_GROUP` vuelve a costar horas, y probablemente se diagnostique mal otra vez.

---

## Decisión pendiente

1. **¿Se aplica la Opción A?** Requiere tocar `vite.config.ts` (código de la app) y
   re-correr la suite E2E completa para confirmar que nada se rompe.
2. **¿Se refuerza `admin-routes.spec.ts`?** Hoy pasa en falso. Endurecer sus aserciones
   significa **modificar un test E2E existente**, y la regla del proyecto es que eso no se
   toca sin autorización explícita del usuario.
3. **¿Se reclasifican las fichas 3 a 6 de esta corrida?** Los fallos `web-catalog`,
   `mayorista-sale`, `precache-split` y `store-switcher-refresh` se documentaron en la misma
   corrida y siguen **sin verificar**. No se comprobó si son víctimas del mismo caché o
   defectos reales independientes. Solo `store-module-pricing` y `plan-catalog-superadmin`
   fueron reproducidos y confirmados.

## Cómo diagnosticar esto en 60 segundos si reaparece

Si un test E2E falla con `No result returned from dataStrategy`, **no busques en React
Router**. Mirá la consola del navegador por el `SyntaxError: does not provide an export
named`:

```powershell
Remove-Item apps\web-store-pos\node_modules\.vite -Recurse -Force
```

Si el símbolo que falta es `NO_PLAN_GROUP`, `PLAN_MODULE_GROUP` u otro export de
`@store-mgmt/domain`, es este defecto y se resuelve con ese borrado.
