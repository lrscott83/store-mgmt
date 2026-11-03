# 22. owner-store-create.spec.ts:161 — la tienda nueva no recibe el módulo 22 (ONAT) que sí está en el plan Superior

## Qué prueba el test

`owner-store-create.spec.ts:161:5` — *"MC-02 — creating a store posts the owner-branch contract and is
born with the Superior plan modules"*. Crea una tienda desde el camino del Owner y exige que su
snapshot de módulos sea **exactamente** el catálogo del plan Superior, para que el nacimiento no
regrese silenciosamente al plan Pago.

## Qué falla (en simple)

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 0

@@ -16,7 +16,6 @@
    17,
    18,
    19,
    20,
    21,
-   22,
  ]

> 251 |   expect(createdModuleIds).toEqual(await readSuperiorPlanModuleIds());
```

La tienda nace con los módulos 2–21; el plan Superior contiene además el **22**.

## Evidencia

- Corrida completa del **2026-10-28**: falló los **3 intentos** (`retries: 2`).
- Artifact: `frontend-react/test-results/owner-store-create-MC-02-*/error-context.md`.
- Estado real de `smca_test` al momento de la corrida:

```
Id 22 | ONAT | IsActive = f | AvailableToStore = t | PriceIncluded = t | Price = 0
StorePlanModule del plan 3 (Superior): ... 20, 21, 22
```

## Causa raíz — CONFIRMADA

El nacimiento de tienda **deriva** los módulos del plan y los filtra por catálogo activo:

`CreateStoreService.cs:60-64` —
`plan.StorePlanModules.Where(spm => spm.Module is not null && spm.Module.IsActive && spm.Module.AvailableToStore)`.

El módulo 22 (ONAT) está en el plan Superior pero tiene `IsActive = false`, así que **correctamente**
no se copia a la tienda nueva. El helper del test, en cambio, lee la pertenencia al plan sin ese
filtro (`readSuperiorPlanModuleIds()`), por lo que su "esperado" incluye un módulo que el servicio
excluye a propósito.

Hipótesis descartada: no es una regresión del nacimiento en Superior — el plan se sigue leyendo y los
módulos 12/14/15/17/18 sí llegan; la única diferencia es el módulo inactivo.

## Clasificación

**Defecto del test** — el esperado no aplica el mismo predicado que la regla de negocio. La aplicación
es correcta.

## Propuesta de solución — NO APLICADA

Filtrar el helper por el mismo predicado del servicio (`IsActive && AvailableToStore`) antes de
comparar, o afirmar solo sobre módulos activos. Requiere autorización 1 a 1 para tocar el spec.

## Aplicación y verificación

**APLICADA (2026-10-28, autorizada por el usuario).** `readSuperiorPlanModuleIds()` ahora hace `JOIN "Module"` y filtra `m."IsActive" AND m."AvailableToStore"`, el mismo predicado de `CreateStoreService.cs:62`.

- Comando: `pnpm exec playwright test e2e/login-offline.spec.ts e2e/sync-export-import-v2.spec.ts e2e/owner-store-create.spec.ts --workers=2 --retries=0` → **17 passed**, exit 0, 2026-10-28.
- **Prueba de mutación:** se neutralizó el filtro (`AND (m."IsActive" OR TRUE)`) → MC-02 vuelve a fallar con la diferencia `- 22`; restaurado el filtro → `1 passed (39.0s)`.

## Estado final

✅ **Resuelto** — 2026-10-28.
