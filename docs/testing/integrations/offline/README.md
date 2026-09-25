# Integración — Offline, roster, activación y PWA

> Specs E2E cubiertos: `offline-access-panel.spec.ts`, `offline-session-expiry.spec.ts`,
> `offline-session-online-ops.spec.ts`, `offline-shell.spec.ts`, `offline-version-check.spec.ts`,
> `roster-any-filename.spec.ts`, `roster-export.spec.ts`, `roster-export-rename-import.spec.ts`,
> `roster-recovery.spec.ts`, `provision.spec.ts`, `pwa-install-capture.spec.ts`,
> `diagnostics.spec.ts` (32 tests).
>
> **Leyenda**
> - ✅ **Total** — toda la afirmación es lógica de negocio y vive en servicios/repositorios/dominio.
> - ⚠️ **Parcial** — la lógica es probable sin navegador, pero el test además prueba algo que exige
>   render/router/red (se indica qué).
> - ❌ **No** — la afirmación depende del navegador o del backend real.
>
> **Regla del proyecto:** los specs E2E no se tocan sin autorización explícita del usuario.

Esta carpeta es la más "de navegador" del proyecto: roster/DEK, IndexedDB, service worker,
`beforeinstallprompt` y descargas. Aun así, buena parte del fondo (cifrado de entidades, tabla de
wraps, gate de desbloqueo, ciclo de vida del roster) tiene 17 archivos de test en
`shared/lib/storage/__tests__/` y 14 en `shared/lib/offline/__tests__/`.

| Test | Qué prueba | Clasificación | Ya cubierto en |
|---|---|---|---|
| `offline-access-panel` — activar con el archivo exportado, entrar sin red y desactivarlo | Que el equipo se activa con un roster exportado y luego se desactiva | ⚠️ **Parcial** — la importación del bundle y el estado del roster son de servicios (`roster-store`, `importRoster`); **visual:** el panel y el login sin red | `shared/lib/offline/__tests__/` (14) |
| `offline-session-expiry` E2E 1 — `AUTH_MODEL.expiresIn` es el `expiresAt` del roster (bundle pagado, +5 días, no +35) | Que la sesión offline caduca con el roster y no con el plazo por defecto | ⚠️ **Parcial** — la regla de caducidad es pura (`expiresAt` → `expiresIn`); **visual/entorno:** los bytes de `localStorage` en el navegador | `shared/lib/offline/__tests__/`, `shared/lib/stores/__tests__/` |
| `offline-session-expiry` E2E 2 — al vencer el bundle, el próximo arranque en frío desloguea a `/login` | Que un bundle vencido expulsa al login en el siguiente arranque | ⚠️ **Parcial** — la decisión es pura (`authLoader`); **visual:** el arranque en frío del navegador | `auth/routes/__tests__/loaders.cold-boot.test.ts` |
| `offline-session-online-ops` E2E 1 — el roster con JWT hace que `/me` se autentique con ese JWT y la sesión siga | Que una sesión nacida offline usa su token para las llamadas online | ⚠️ **Parcial** — la elección del token es del store; **visual/red:** el `/me` real | `shared/lib/stores/__tests__/`, `shared/lib/http/__tests__/` |
| `offline-session-online-ops` E2E 2 — un roster legacy sin `offlineAuthToken` degrada al centinela → 401 → logout | Que un roster viejo cae por el veredicto del servidor | ⚠️ **Parcial** — ídem | ídem |
| `offline-shell` — el service worker precachea `index.html` y navega offline sirviendo la app | Que la app abre sin conexión | ❌ **No** — service worker + navegador real | `shared/lib/pwa/__tests__/` (4), `scripts/__tests__/precache-families.test.mjs` |
| `offline-shell` — los chunks de la ruta de login están precacheados | Que el shell navega offline sin fetch de red | ❌ **No** — service worker | ídem |
| `offline-version-check` — el diálogo de actualización aparece y el confirm hace hard refresh conservando la sesión offline | Que el aviso de nueva versión no tira la sesión | ❌ **No** — ciclo de vida del service worker | `shared/lib/pwa/__tests__/` |
| `roster-any-filename` — un archivo renombrado activa el dispositivo igual que un export intacto | Que la activación no depende del nombre del archivo | ⚠️ **Parcial** — la importación valida el contenido, no el nombre (del servicio); **visual:** el input de archivo | `shared/lib/offline/__tests__/` |
| `roster-any-filename` — un archivo sin extensión `.smcabundle` y con nombre casual también importa | Ídem, sin extensión | ⚠️ **Parcial** — ídem | ídem |
| `roster-export-rename-import` — el archivo exportado, renombrado, activa otro dispositivo | Que el ciclo exportar → renombrar → activar funciona | ⚠️ **Parcial** — el bundle es de servicios; **visual:** la descarga y el segundo dispositivo | `shared/lib/offline/__tests__/`, `sync/lib/services/__tests__/` |
| `roster-export` — exportar roster: descarga ZIP con nombre correcto y el panel se cierra | Que el roster se exporta con el nombre esperado | ⚠️ **Parcial** — el nombre/contenido es del servicio; **visual:** la descarga del navegador | `shared/lib/offline/__tests__/` |
| `roster-export` — contraseña vacía muestra error y no emite petición | Que no se exporta sin contraseña | ⚠️ **Parcial** — guard del servicio (error tipado) | ídem |
| `roster-export` — botón habilitado online | Que exportar requiere conexión | ⚠️ **Parcial** — guard de conectividad; **visual:** el botón | `shared/lib/auth/__tests__/` |
| `roster-export` — roster pagado: expira 5 días después de la próxima fecha de pago y el JWT coincide | Que la caducidad de un plan pagado se calcula desde la próxima fecha de pago | ⚠️ **Parcial** — el cálculo de `expiresAt` es puro; **visual:** el bundle descargado | `shared/lib/offline/__tests__/` (cálculo de caducidad), dominio (planes) |
| `roster-export` — roster libre: expira a los 35 días por defecto (`PaymentStartDate` null) y el JWT coincide | Que un plan libre usa los 35 días | ⚠️ **Parcial** — ídem | ídem |
| `roster-recovery` E2E 1 — importar un roster nuevo para la misma tienda recupera los datos que quedaron en el equipo | Que un roster nuevo puede abrir los datos ya presentes en el equipo | ⚠️ **Parcial** — el desempaquetado de la DEK con el wrap del roster es del servicio; **visual:** las pantallas con datos | `shared/lib/storage/__tests__/` (17), `shared/lib/offline/__tests__/` |
| `roster-recovery` E2E 4 — un fallo de descifrado no toca un solo byte de lo guardado | Que un fallo de descifrado no corrompe nada | ⚠️ **Parcial** — se puede asertar comparando los bytes de `localStorage` antes/después en vitest; **visual:** el aviso | `shared/lib/storage/__tests__/` (entity-crypto, decryption-failure-policy) |
| `roster-recovery` E2E 5 — un fallo de descifrado con la sesión abierta se anuncia y termina la sesión en `/login` | Que el fallo se anuncia una sola vez y cierra la sesión | ⚠️ **Parcial** — la política es de servicio y ya está cubierta; **visual:** el diálogo y el aterrizaje | `shared/lib/storage/__tests__/decryption-failure-policy.test.tsx` |
| `roster-recovery` E2E 6 — un equipo sin ninguna fuente de clave es rechazado, se queda en `/login` y conserva los bytes | Que sin ninguna clave no se entra, pero no se borra nada | ⚠️ **Parcial** — `needsUnlock`/gate + integridad de bytes son puros; **visual:** la pantalla de login | `shared/lib/offline/__tests__/unlock-gate.test.ts` |
| `roster-recovery` E2E 2 — autenticarse con conexión recupera los datos de un equipo que perdió todo su material de clave | Que el login online reconstruye el material de clave y los datos vuelven | ❌ **No** — login real + IndexedDB borrada + navegación | `shared/lib/storage/__tests__/` (device-dek), backend E2E |
| `roster-recovery` E2E 3 — lo escrito con conexión se lee sin conexión y viceversa, con la misma clave | Que el cifrado no depende del modo de autenticación | ❌ **No** — arranque/recarga reales del navegador | `shared/lib/storage/__tests__/` (kat, entity-crypto) |
| `provision` — la página `/auth/provision` carga sin autenticación y muestra el formulario | Que la pantalla de activación es pública | ❌ **No** — aserción de pantalla | — |
| `provision` — enviar el formulario vacío muestra error de archivo | Que hace falta el archivo | ⚠️ **Parcial** — la validación es del formulario; **visual:** el error | `shared/lib/offline/__tests__/` |
| `provision` — el toggle de visibilidad de la contraseña funciona | Que el ojo de contraseña funciona | ❌ **No** — interacción de interfaz | — |
| `pwa-install-capture` — carga como `<script>` clásico externo en el head | Que el script de captura de instalación se carga como corresponde | ❌ **No** — es el HTML/carga del documento | `scripts/__tests__/` (CSP/precache) |
| `pwa-install-capture` — adopta un `beforeinstallprompt` disparado tras la carga (neutro vs el inline) | Que el evento tardío se captura igual | ❌ **No** — evento del navegador | — |
| `pwa-install-capture` — registra `beforeinstallprompt` durante el parseo y el prompt sobrevive a la hidratación | Que no se pierde el prompt antes de hidratar | ❌ **No** — ciclo de vida del navegador | — |
| `diagnostics` — muestra el buffer vacío y luego captura y lista los errores inyectados | Que el panel de diagnóstico captura y lista errores del cliente | ⚠️ **Parcial** — el buffer de logs es de `shared/lib/diagnostics`; **visual:** la tabla del panel | `diagnostics/routes/__tests__/` (1), `shared/lib/diagnostics/__tests__/` (2) |
| `diagnostics` — filtra entradas por nivel | Que el filtro por nivel funciona | ⚠️ **Parcial** — el filtrado es del servicio; **visual:** la lista | ídem |
| `diagnostics` — descarga el export como `client-log-*.json` (fallback de escritorio, sin `navigator.share`) | Que el export de logs se descarga cuando no hay `navigator.share` | ⚠️ **Parcial** — la decisión de descargar vs compartir es del componente; **visual:** la descarga | ídem |
| `diagnostics` — limpia el buffer tras confirmar el diálogo Swal | Que confirmar vacía el buffer | ⚠️ **Parcial** — `clear()` es del servicio; **visual:** el diálogo | ídem |

**Ninguno es ✅ Total.** Lo que se puede probar sin navegador (cifrado, wraps, gate, caducidad,
integridad de bytes) ya está cubierto en `shared/lib/storage/__tests__/` y
`shared/lib/offline/__tests__/`; lo que queda es IndexedDB, el service worker, las descargas y los
eventos de instalación, que solo existen en un navegador real.

- *Actualizado: 2026-09-24.*
