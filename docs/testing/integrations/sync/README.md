# Integración — Respaldo (export / import)

> Specs E2E cubiertos: `data-export.spec.ts`, `data-import.spec.ts`,
> `sync-export-import-v2.spec.ts`, `sync-roundtrip.spec.ts` (10 tests).
>
> **Leyenda**
> - ✅ **Total** — toda la afirmación es lógica de negocio y vive en servicios/repositorios/dominio.
> - ⚠️ **Parcial** — la lógica es probable sin navegador, pero el test además prueba algo que exige
>   render/router/red (se indica qué).
> - ❌ **No** — la afirmación depende del navegador o del backend real.
>
> **Regla del proyecto:** los specs E2E no se tocan sin autorización explícita del usuario.

El fondo de esto (comprimir/descomprimir el ZIP, cifrar con contraseña, fusionar entidades) son
servicios de `app/sync/lib/services/` (9 archivos de test) y el `Synchronizer`. El E2E aporta el
input de archivo, la descarga real del navegador y el ZIP.

| Test | Qué prueba | Clasificación | Ya cubierto en |
|---|---|---|---|
| `data-export` — la exportación descarga un ZIP con firma válida | Que el respaldo se genera con el formato/firma correctos | ⚠️ **Parcial** — el contenido y la firma son del servicio; **visual/navegador:** que se dispare la descarga del archivo | `sync/lib/services/__tests__/` (9 archivos) |
| `data-export` — contraseña vacía muestra error sin descargar | Que no se exporta sin contraseña | ⚠️ **Parcial** — el guard es del servicio (error tipado); **visual:** el mensaje y que no haya descarga | ídem |
| `data-export` — la operación funciona correctamente en modo offline | Que se puede respaldar sin red | ❌ **No** — modo offline del navegador | `shared/lib/offline/__tests__/` |
| `data-import` — seleccionar archivo y contraseña válida importa los datos | Que un respaldo válido se restaura | ⚠️ **Parcial** — la restauración es del `Synchronizer`/servicios; **visual:** el input de archivo y los datos en pantalla | `sync/lib/services/__tests__/`, `app/__tests__/entries-multistore-integration.test.tsx` |
| `data-import` — sin archivo seleccionado muestra error | Que no se importa sin archivo | ⚠️ **Parcial** — guard del formulario; **visual:** el mensaje | `sync/routes/__tests__/` (3) |
| `data-import` — contraseña vacía muestra error | Que no se importa sin contraseña | ⚠️ **Parcial** — ídem | ídem |
| `data-import` — la operación funciona correctamente en modo offline | Que se puede importar sin red | ❌ **No** — modo offline del navegador | `shared/lib/offline/__tests__/` |
| `sync-export-import-v2` T1 — el dispositivo A exporta un respaldo con un producto y el dispositivo B lo importa y lo ve | Que el respaldo viaja entre dispositivos con los datos intactos | ⚠️ **Parcial** — el round-trip entidad→ZIP→entidad es del servicio y se puede hacer íntegro en vitest; **visual/entorno:** dos contextos de navegador y el archivo real | `sync/lib/services/__tests__/` (bundle/merge), `app/integrations/multi-payment-two-channels.integration.test.ts` (patrón de servicios reales sobre `localStorage`) |
| `sync-export-import-v2` T2 — round trip de una tienda vacía (V2-11) | Que una tienda vacía exporta e importa limpiamente | ⚠️ **Parcial** — ídem | ídem |
| `sync-roundtrip` S4-B1 — exportar e importar preserva los datos | Que el ciclo completo no pierde ni altera datos | ⚠️ **Parcial** — ídem | ídem |

**Ninguno es ✅ Total**: los tres round-trips están a un paso de serlo (todo el fondo es de servicios),
pero el spec hace la descarga/subida real de un archivo en el navegador. Si se quisiera un test de
integración puro, habría que escribir el ZIP a memoria en vez de descargarlo; el round-trip en sí no
depende del navegador.

- *Actualizado: 2026-09-24.*
