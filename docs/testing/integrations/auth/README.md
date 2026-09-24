# Integración — Autenticación y sesión

> Specs E2E cubiertos: `login.spec.ts`, `login-offline.spec.ts`, `login-rate-limit.spec.ts`,
> `register.spec.ts`, `register-rate-limit.spec.ts`, `change-password.spec.ts`,
> `logout-silent.spec.ts`, `superadmin-login.spec.ts`, `profile-session.spec.ts`,
> `edit-profile.spec.ts`, `auth-me-deleted-user.spec.ts`, `auth-me-session-rejection.spec.ts`,
> `valid-session-navigation.spec.ts`, `t8-navigation-source.spec.ts` (77 tests).
>
> **Leyenda**
> - ✅ **Total** — toda la afirmación es lógica de negocio y vive en servicios/repositorios/dominio.
> - ⚠️ **Parcial** — la lógica es probable sin navegador, pero el test además prueba algo que exige
>   render/router/red (se indica qué).
> - ❌ **No** — la afirmación depende del navegador o del backend real.
>
> **Regla del proyecto:** los specs E2E no se tocan sin autorización explícita del usuario.

Aquí la lógica pura es mucha y ya está cubierta: los guards de ruta
(`auth/routes/__tests__/loaders.test.ts` + `loaders.cold-boot.test.ts`), el store de sesión
(`shared/lib/stores/__tests__/`, 10 archivos), el gate de desbloqueo
(`shared/lib/offline/__tests__/`, 14) y la pantalla de login/registro
(`auth/routes/__tests__/`, 9 + `auth/components/__tests__/`, 3).

| Test | Qué prueba | Clasificación | Ya cubierto en |
|---|---|---|---|
| `login` REQ-4 — campos vacíos bloquean el submit en el cliente | Que no se envía el formulario vacío | ⚠️ **Parcial** — la validación es pura; **visual:** el botón/errores | `auth/routes/__tests__/login.test.tsx` |
| `login` REQ-5 — sin conexión y sin roster bloquea antes de la red y muestra el banner | Que sin red y sin roster no se intenta nada | ⚠️ **Parcial** — la decisión es pura (conectividad + roster); **visual:** el banner | `auth/routes/__tests__/login.offline.test.tsx` |
| `login` REQ-1/2/6/10/13 — un login real muestra solo el overlay en orden causal, persiste el token y aterriza en `/sales/products` sin tráfico de productos | Que el arranque post-login hace solo las llamadas necesarias y aterriza en el destino del rol | ⚠️ **Parcial** — el orden de llamadas y el destino (`resolveUserHomePath`) son puros; **visual/red:** el overlay, y el login real | `shared/lib/stores/__tests__/`, `shared/lib/auth/__tests__/` (4), `auth/routes/__tests__/` |
| `login` REQ-3 — una contraseña incorrecta contra la cuenta recién registrada muestra el texto literal del backend | Que el error del backend se pinta tal cual | ⚠️ **Parcial** — el mapeo del error es del store; **visual:** el texto | `auth/routes/__tests__/login.test.tsx` |
| `login` REQ-11 — un StoreUser sigue la misma rama que un OwnerAdmin, con y sin productos | Que el destino del login depende del rol y del catálogo | ⚠️ **Parcial** — `resolveUserHomePath` es puro; **visual:** la ruta final | `shared/lib/auth/__tests__/` |
| `login` REQ-9 — un OwnerAdmin con productos aterriza en `/sales/new` tras un re-login real | Que con productos el destino es la nueva venta | ⚠️ **Parcial** — ídem | ídem |
| `login` REQ-7 — un OwnerAdmin ya autenticado que visita `/login` va a su home, nunca a `/` | Que el guard de invitado redirige al home del rol | ⚠️ **Parcial** — `guestOnlyLoader` es puro; **visual:** la navegación | `auth/routes/__tests__/loaders.test.ts` |
| `login` REQ-12/14 — ningún OwnerAdmin/StoreUser aterriza en `/admin/owners`, y el rebote del guard coincide con el destino del login explícito | Que el destino del guard y el del login son el mismo | ⚠️ **Parcial** — ambas decisiones son puras; **visual:** las rutas finales | ídem |
| `login` REQ-1 (T1) — un reload con caché válida hace cero llamadas a `/me` | Que la caché evita el `/me` | ⚠️ **Parcial** — la regla de caché es del store (verificable con el HTTP bloqueado); **visual:** el contador de peticiones del navegador | `shared/lib/stores/__tests__/` (10), `shared/lib/http/__tests__/` (6) |
| `login` REQ-2 (T2) — un desajuste de caché dispara exactamente un `/me` y mantiene la sesión | Que el desajuste se resuelve con un solo `/me` | ⚠️ **Parcial** — ídem | ídem |
| `login` REQ-3 (T3) — `/me` inalcanzable sin caché usable retiene la sesión | Que un fallo de red no cierra sesión | ⚠️ **Parcial** — ídem | ídem |
| `login` REQ-5 (T5) — un 500 de `/me` muestra el diálogo bloqueante pero mantiene la sesión | Que un 500 no cierra sesión | ⚠️ **Parcial** — ídem; **visual:** el diálogo | ídem |
| `login` REQ-10 (T10) — una navegación interna sin conexión mantiene la sesión viva | Que navegar offline no expulsa al login | ⚠️ **Parcial** — ídem | ídem |
| `login` REQ-11 (T11) — un payload parseable que no es `AUTH_MODEL` nunca se borra ni dispara `logout()` | Que un payload inesperado no cierra la sesión | ⚠️ **Parcial** — ídem | ídem |
| `login` REQ-4 (T4) — un 401 real de `/me` termina la sesión y aterriza en `/login` | Que el 401 sí cierra la sesión | ⚠️ **Parcial** — ídem; **visual:** el aterrizaje en `/login` | ídem |
| `login` REQ-6 (T6) — un `expiresIn` exactamente igual a "ahora" cuenta como expirado | Que el borde de expiración es estricto | ⚠️ **Parcial** — la comparación es pura | `shared/lib/stores/__tests__/` |
| `login` REQ-7 (T7) — `logout()` elimina solo `AUTH_MODEL` | Que el logout no borra más de lo que debe | ⚠️ **Parcial** — puro; **visual:** el contenido de `localStorage` | ídem |
| `login` REQ-8 (T8) — `logout()` estando ya en `/login` no dispara navegación extra | Que no hay navegación redundante | ⚠️ **Parcial** — ídem | ídem |
| `login` REQ-9 (T9) — un 401 fuera de `/me` deja la sesión intacta | Que solo `/me` decide la sesión | ⚠️ **Parcial** — ídem | ídem |
| `login-offline` T1 — golden path: cero HTTP, online igual a offline, `localStorage` hidratado, destino sin productos | Que el login offline completo funciona sin red | ⚠️ **Parcial** — la verificación de contraseña offline (verifier) y la hidratación son del servicio de auth offline; **visual:** el formulario y el destino | `auth/routes/__tests__/login.offline.e2e.test.tsx` (roster real + servicio real) |
| `login-offline` T2 — destino con productos: siembra por UI, logout y segundo submit offline | Que un segundo login offline con catálogo sigue funcionando | ⚠️ **Parcial** — ídem | ídem |
| `login-offline` T3 — login ausente y contraseña incorrecta muestran el mismo `AUTH.INVALID_CREDENTIALS` | Que un usuario inexistente no se distingue de una contraseña mala | ⚠️ **Parcial** — la regla es del servicio; **visual:** el mensaje | ídem |
| `login-offline` T4 — usuario inactivo con contraseña correcta muestra `AUTH.ACCOUNT_INACTIVE` | Que la inactividad se distingue del error de credenciales | ⚠️ **Parcial** — ídem | ídem |
| `login-offline` T5 — inactivo con contraseña incorrecta ve credenciales inválidas (orden verifier→password→isActive) | Que el orden de evaluación no filtra información | ⚠️ **Parcial** — el orden es del servicio; **visual:** el mensaje | ídem |
| `login-offline` T6 — un verifier malformado muestra `AUTH.SERVER_ERROR` | Que un roster corrupto no se interpreta como credenciales malas | ⚠️ **Parcial** — ídem | ídem |
| `login-offline` T7 — DEK corrupta con contraseña correcta muestra `AUTH.UNLOCK_FAILED`, nunca credenciales inválidas | Que un fallo de descifrado no se disfraza de contraseña mala | ⚠️ **Parcial** — ídem | ídem + `shared/lib/storage/__tests__/` (17) |
| `login-offline` T8 — un bundle vencido cae a la vía online sin gastar cupo del rate-limit | Que un roster caducado no bloquea el login | ⚠️ **Parcial** — la regla de expiración es pura; **visual/red:** la petición interceptada | `shared/lib/offline/__tests__/` (14) |
| `login-offline` T9 — bundle vencido + navegador offline muestra el banner `AUTH.OFFLINE_LOGIN` | Que sin red y con roster vencido hay mensaje claro | ⚠️ **Parcial** — ídem; **visual:** el banner | ídem |
| `login-offline` T10 — recargar con roster v2 recupera el DEK del wrap de dispositivo y sigue en `/sales/products` | Que el DEK se recupera solo del dispositivo | ❌ **No** — depende de IndexedDB y del arranque real del navegador | `shared/lib/storage/__tests__/` (device-dek, 17 archivos) |
| `login-offline` F4 — clave de dispositivo destruida con wrap de contraseña intacto exige contraseña en `/login?unlock=1` y recupera los mismos datos | Que sin clave de dispositivo se pide la contraseña y los datos vuelven | ❌ **No** — IndexedDB + navegación real | `shared/lib/offline/__tests__/unlock-gate.test.ts` |
| `login-offline` T11 — sin conexión aterriza en la misma ruta que con conexión | Que el destino no depende de la conectividad | ⚠️ **Parcial** — `resolveUserHomePath` es puro; **visual:** la ruta | `shared/lib/auth/__tests__/` |
| `login-rate-limit` — una avalancha de logins fallidos acaba mostrando el banner de demasiados intentos | Que el rate-limit se comunica al usuario | ❌ **No** — es el backend + tiempo real (@rate-limit) | Backend E2E |
| `register` REQ-1 — el submit queda deshabilitado hasta aceptar los términos | Que los términos son obligatorios | ⚠️ **Parcial** — la validación es pura; **visual:** el botón | `auth/routes/__tests__/register.test.tsx` |
| `register` REQ-2 — un `storeName` vacío bloquea el submit en el cliente | Que el nombre de tienda es obligatorio | ⚠️ **Parcial** — ídem; **visual:** el error | ídem |
| `register` REQ-3 — un solo toggle revela los dos campos de contraseña a la vez | Que el ojo de contraseña controla ambos campos | ❌ **No** — interacción de interfaz | — |
| `register` REQ-4 — una contraseña fuera de la política bloquea el submit | Que la política de contraseña se aplica en el cliente | ⚠️ **Parcial** — la política es pura; **visual:** el error | `auth/routes/__tests__/register.test.tsx` |
| `register` REQ-5 — una confirmación distinta muestra el mensaje esperado | Que la confirmación se valida | ⚠️ **Parcial** — ídem | ídem |
| `register` REQ-7 — sin conexión bloquea el submit y muestra el banner | Que no se registra sin red | ⚠️ **Parcial** — guard de conectividad; **visual:** el banner | ídem |
| `register` REQ-8 — un registro exitoso aterriza en `/login` sin sesión | Que tras registrarse no queda sesión abierta | ⚠️ **Parcial** — el flujo es del servicio HTTP; **visual/red:** el POST real y la navegación | `auth/routes/__tests__/register.test.tsx` |
| `register` REQ-6 — un email vacío llega a la API y se muestra el texto literal del 400 | Que el error del backend se pinta tal cual | ⚠️ **Parcial** — el mapeo del error es del componente; **visual:** el popup | ídem |
| `register` F-2 — un OwnerAdmin recién registrado aterriza en `/sales/products` | Que el primer destino del owner es la venta | ⚠️ **Parcial** — `resolveUserHomePath` es puro; **visual:** la ruta | `shared/lib/auth/__tests__/` |
| `register-rate-limit` — una avalancha de registros duplicados acaba mostrando el banner | Que el rate-limit de registro se comunica | ❌ **No** — backend + tiempo real (@rate-limit) | Backend E2E |
| `change-password` — cambiar contraseña cierra sesión y la nueva funciona | Que el cambio de contraseña invalida la sesión y sirve para volver a entrar | ⚠️ **Parcial** — el cambio de clave/DEK es del servicio de storage/auth; **visual/red:** los formularios y el login real | `profile/routes/__tests__/` (2), `profile/lib/services/__tests__/` (1), `shared/lib/storage/__tests__/` |
| `change-password` — offline: el botón de envío está deshabilitado | Que no se cambia la contraseña sin red | ⚠️ **Parcial** — guard de conectividad; **visual:** el botón | ídem |
| `logout-silent` — cerrar sesión desde una pantalla con datos es silencioso: sin diálogo ni rechazo sin manejar | Que el logout no deja promesas rechazadas ni diálogos | ⚠️ **Parcial** — la política de fallos de descifrado es del store/servicio (`handleDecryptionFailure`); **visual:** el diálogo ausente | `shared/lib/storage/__tests__/decryption-failure-policy.test.tsx` |
| `superadmin-login` — crear la persona SuperAdmin y capturar snapshot | Que el arnés fabrica una sesión SuperAdmin | ❌ **No** — infraestructura del arnés | — |
| `superadmin-login` — la sesión SuperAdmin sobrevive a la recarga sin error de DEK | Que un SuperAdmin sin tienda no revienta al recargar | ⚠️ **Parcial** — la exclusión del usuario sin tienda es pura (`needsUnlock`); **visual:** la recarga | `shared/lib/offline/__tests__/unlock-gate.test.ts` |
| `superadmin-login` — el SuperAdmin accede a `/admin/owners` directamente | Que el gate de superadmin lo deja pasar | ⚠️ **Parcial** — `superAdminLoader` es puro; **visual:** la ruta | `auth/routes/__tests__/loaders.test.ts` |
| `profile-session` — persistencia de la sesión de perfil | Que la sesión sobrevive al ciclo de vida del perfil | ⚠️ **Parcial** — del store de sesión; **visual:** el contexto de navegador | `shared/lib/stores/__tests__/` |
| `edit-profile` — editar perfil: pre-carga, payload con `isActive`, éxito y permanencia | Que la edición de perfil arma el payload correcto y se queda en la pantalla | ⚠️ **Parcial** — el payload es del servicio (asertable con HTTP mockeado); **visual:** el formulario y el mensaje | `profile/routes/__tests__/` (2), `profile/components/__tests__/` (2) |
| `edit-profile` — formulario pre-cargado con los datos del usuario | Que el formulario llega pre-cargado | ⚠️ **Parcial** — la lectura es del store; **visual:** los campos | ídem |
| `edit-profile` — offline: el envío está deshabilitado | Que no se edita sin red | ⚠️ **Parcial** — guard de conectividad | ídem |
| `auth-me-deleted-user` el setup | Que el arnés fabrica y captura la sesión | ❌ **No** — infraestructura del arnés | — |
| `auth-me-deleted-user` A — online + usuario borrado: `getMe()` rechaza → logout | Que si el usuario ya no existe, con red, se cierra la sesión | ⚠️ **Parcial** — la regla es del store de auth; **visual/red:** el 401/404 real | `shared/lib/stores/__tests__/`, `shared/lib/http/__tests__/` |
| `auth-me-deleted-user` B — offline + usuario borrado: error de red → retiene la sesión | Que sin red no se cierra sesión | ⚠️ **Parcial** — ídem | ídem |
| `auth-me-session-rejection` el setup | Que el arnés fabrica la sesión | ❌ **No** — infraestructura del arnés | — |
| `auth-me-session-rejection` 1a/1b — usuario inactivo: online hace logout, offline retiene | Que la inactividad del usuario cierra la sesión solo con veredicto del servidor | ⚠️ **Parcial** — la regla es del store; **visual/red:** el backend real | `shared/lib/stores/__tests__/` |
| `auth-me-session-rejection` 2a/2b — tienda inactiva: online hace logout, offline retiene | Ídem para tienda inactiva | ⚠️ **Parcial** — ídem | ídem |
| `auth-me-session-rejection` 3a/3b — owner inactivo: online hace logout, offline retiene | Ídem para owner inactivo | ⚠️ **Parcial** — ídem | ídem |
| `auth-me-session-rejection` 4a/4b — token en lista negra: online hace logout, offline retiene | Ídem para token revocado | ⚠️ **Parcial** — ídem | ídem |
| `auth-me-session-rejection` 5 — token expirado: logout sin llamada de red | Que un token vencido cierra sesión sin ir al servidor | ⚠️ **Parcial** — la expiración es pura | `shared/lib/stores/__tests__/` |
| `auth-me-session-rejection` 6 — reactivar el usuario y volver a entrar restaura la sesión | Que el ciclo completo vuelve a funcionar | ⚠️ **Parcial** — ídem | ídem |
| `valid-session-navigation` 1 — online/intacto: recargar mantiene la sesión | Que recargar con la clave presente no expulsa de la app | ⚠️ **Parcial** — el loader (`authLoader`) es puro; **visual:** el menú de usuario en el inicio | `auth/routes/__tests__/loaders.test.ts`, `loaders.cold-boot.test.ts` |
| `valid-session-navigation` 2 — online/intacto: ir a `/login` redirige al home del rol | Que el guard de invitado redirige al home | ⚠️ **Parcial** — `guestOnlyLoader` es puro; **visual:** la navegación | ídem |
| `valid-session-navigation` 3 — online/intacto: ir a `/register` redirige al home del rol | Ídem para `/register` | ⚠️ **Parcial** — ídem | ídem |
| `valid-session-navigation` 7 — offline/intacto: recargar mantiene la sesión | Que recargar sin red mantiene la sesión | ⚠️ **Parcial** — ídem | ídem |
| `valid-session-navigation` 8 — offline/intacto: ir a `/login` redirige al home | Ídem sin red | ⚠️ **Parcial** — ídem | ídem |
| `valid-session-navigation` 9 — offline/intacto: ir a `/register` redirige al home | Ídem sin red | ⚠️ **Parcial** — ídem | ídem |
| `valid-session-navigation` 10 — offline/sin clave: ir a `/login` redirige al home | Que sin clave de dispositivo, con el roster presente, ir a `/login` devuelve al home | ⚠️ **Parcial** — la decisión (`needsUnlock` + `hasUnreadableCiphertext`) es pura; **visual:** la navegación *(known-issue: hoy muere por timeout del entorno, la app se comporta bien)* | `shared/lib/offline/__tests__/unlock-gate.test.ts`, `loaders.test.ts` |
| `valid-session-navigation` 11 — offline/sin clave: ir a `/register` redirige al home | Ídem para `/register` | ⚠️ **Parcial** — ídem | ídem |
| `valid-session-navigation` 12 — offline/sin clave: recargar con ciphertext ilegible va a `/login?unlock=1` SIN logout | Que cuando hay datos cifrados ilegibles se pide desbloquear **sin** cerrar la sesión | ⚠️ **Parcial** — la decisión es pura y ya está pineada; **visual:** que la sesión sobreviva y que en el inicio se vea el menú *(known-issue: el test espera otra cosa que lo que el contrato define)* | `loaders.test.ts` ("authLoader — locked-provisioned WITH ciphertext: redirects to /login?unlock=1 WITHOUT logging out") |
| `t8-navigation-source` — reload misma URL (baseline) | Sonda: que un reload no empuja `/login` casi nunca | ❌ **No** — sonda de comportamiento del navegador | — |
| `t8-navigation-source` — boot cross-URL (predicción) | Sonda: que el boot cross-URL sí lo empuja | ❌ **No** — ídem | — |

**Ninguno es ✅ Total** con la regla estricta de esta carpeta: casi todos son ⚠️ Parcial con la parte
pura ya cubierta en vitest, y los que dependen de IndexedDB, del rate-limit del backend o de sondas
de navegador son ❌ No.

- *Actualizado: 2026-09-24.*
