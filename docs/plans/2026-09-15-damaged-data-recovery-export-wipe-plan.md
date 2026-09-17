# Plan: Recuperación de datos dañados (botón "Recuperar datos" en el popup de datos ilegibles)

**Fecha:** 2026-09-15
**Estado:** Propuesto. La implementación NO está iniciada. Requiere tu aprobación; los tests E2E requieren, además, permiso explícito (regla innegociable).

## 1. Problema (explicado en simple)

Cuando el navegador no puede abrir la información guardada en el dispositivo, la app muestra:

> "La información guardada en este dispositivo está dañada y no se pudo leer. No se borró nada."

...y cierra la sesión, dejando al usuario en `/login`. El mensaje es honesto (nada se borró), pero es un callejón sin salida: el usuario no puede entrar, no puede sacar su información y tampoco puede empezar de cero, porque los datos dañados siguen ahí y seguirán bloqueando cada intento de lectura.

Hoy existen dos salidas diseñadas —recuperar la clave (login con conexión o importar un roster), que NO sirve si los bytes están dañados— y el botón "Limpiar" del catálogo (`products.tsx`), que sí borra los datos de la tienda pero es inalcanzable, porque el usuario nunca llega al catálogo.

Lo que falta es lo que pides: en ese mismo popup, permitir al usuario **descargar lo que todavía se puede leer** y, recién después de guardarlo, **limpiar los datos de esa tienda** para que la aplicación vuelva a funcionar.

## 2. Dónde ocurre hoy (contexto técnico)

| Pieza | Archivo |
|---|---|
| Mensaje y popup | `apps/web-store-pos/app/shared/lib/i18n/es.ts:1132-1133` (`ENCRYPTION.DATA_DAMAGED`) → `showBlockingError` (`app/shared/lib/blocking-alert.ts`) |
| Política que anuncia y desloguea | `apps/web-store-pos/app/shared/lib/storage/decryption-failure-policy.ts` |
| Dos vías de llegada del error | rechazo no manejado (`registerDecryptionFailurePolicy`) y `ErrorBoundary` (`apps/web-store-pos/app/root.tsx`) |
| Origen del error | `EntityUnreadableError` en `app/shared/lib/storage/read-entity-or-throw.ts` (el ciphertext no autentica, o el texto no parsea) |
| Export existente | `app/sync/lib/services/data-serializer-service.ts` + `app/sync/routes/export.tsx` (ZIP v2 con contraseña) |
| Borrado por tienda (ya existe) | `app/shared/lib/storage/store-data-reset.ts` → `clearStoreData(storeId)` |
| Claves y entidades por tienda | `app/shared/lib/storage/storage-keys.ts` (`BUSINESS_ENTITY_NAMES`, `StorageKeys.entityKey`) |

Dos hechos que condicionan el diseño:

1. **El export normal no sirve aquí.** `DataSerializerService.export()` lee todas las entidades por el camino de lectura (que descifra). Si una entidad está dañada, la lectura lanza y el export completo falla. Además exige la contraseña del usuario, que en este punto ya no está en memoria.
2. **El daño puede ser parcial.** Basta que UNA entidad no se pueda leer para disparar el aviso, pero las demás pueden estar intactas y descifrables. La recuperación debe aprovechar lo legible y preservar los bytes de lo ilegible.

## 3. Qué prueba hoy cada test (respuesta directa)

| Test | Tipo | Qué prueba | ¿Se toca? |
|---|---|---|---|
| `apps/web-store-pos/app/shared/lib/storage/__tests__/decryption-failure-policy.test.tsx` | Unit (vitest) | Que el aviso de datos dañados muestre el texto exacto, con UN solo diálogo y un solo cierre de sesión; y que el `ErrorBoundary` produzca el mismo resultado. | **Sí**: cambia el mecanismo del popup (pasa a 2 botones). Es unitario, no E2E. |
| `apps/web-store-pos/app/shared/lib/storage/__tests__/store-data-reset.test.ts` | Unit (vitest) | Que `clearStoreData` borra las 10 entidades de la tienda y NO toca `token`/`AUTH_MODEL`/`currentUser`/`language` ni los datos de otra tienda. | No: se reutiliza tal cual. |
| `frontend-react/e2e/roster-recovery.spec.ts` (E2E 4 y E2E 5) | E2E | Que ante un fallo de descifrado **recuperable** (`ENCRYPTION.KEY_UNAVAILABLE`: falta la clave) se avisa y NO se modifica ni un byte de lo guardado. | No. Cubre el caso "falta la clave", **no** el de datos dañados. |
| `frontend-react/e2e/data-export.spec.ts` | E2E | Que `/sync/export` descarga un ZIP válido. | No. |
| `frontend-react/e2e/login-offline.spec.ts` (T7) | E2E | Que una DEK corrupta con contraseña correcta muestra `AUTH.UNLOCK_FAILED` y nunca "credenciales inválidas". | No. |

**Conclusión:** hoy NO existe ningún test E2E que cubra el popup de "datos dañados"; la única cobertura es unitaria. Por eso la implementación no obliga a modificar ningún E2E existente. Cubrir el flujo nuevo con E2E sería AGREGAR un spec nuevo, y eso solo con tu permiso (sección 6).

## 4. Solución propuesta

### Fase 1 — El popup gana un botón (mismo popup, mismo mensaje)

- Nuevo helper en `app/shared/lib/blocking-alert.ts`: `showDamagedDataRecoveryDialog(title, message, options)`.
  - Mismo `icon: 'error'` y mismo texto actual.
  - Botón de confirmación: **"Recuperar datos"** (nuevo texto i18n).
  - Botón de cancelación: **"Ahora no"** (nuevo texto i18n).
  - Devuelve la elección del usuario (`result.isConfirmed`), en el estilo del `confirmDialog` ya existente.
- `decryption-failure-policy.ts`:
  - Al clasificar `damaged`, **capturar `storeId` ANTES** de llamar a `logout()` (`useAuthStore.getState().user?.selectedStoreId`), porque el cierre de sesión limpia el usuario.
  - Mantener el cierre de sesión inmediato (regla 4 vigente: un dispositivo que no puede abrir sus datos no entra) y el *latch* de un solo diálogo.
  - Si el usuario confirma, invocar la recuperación mediante **import dinámico** (patrón que el propio módulo ya documenta para no arrastrar dependencias pesadas al arranque en frío).
  - Si no hay `storeId` (usuario sin tienda), no ofrecer recuperación: se mantiene el comportamiento actual.
  - El caso `missing-key` (`ENCRYPTION.KEY_UNAVAILABLE`) **no cambia**: es recuperable y no debe borrar nada.

### Fase 2 — Archivo de recuperación ("toda su info, como un export")

Nuevo módulo: `apps/web-store-pos/app/shared/lib/storage/damaged-data-recovery.ts`.

- `collectRecoveryBundle(storeId)`: por cada nombre de `BUSINESS_ENTITY_NAMES`, lee el valor CRUDO de `localStorage` y, en un `try/catch` individual, intenta descifrar+parsear.
  - Legible → se incluye el JSON plano de la entidad.
  - Ilegible → se incluye el string crudo tal cual (ciphertext `enc:v1:` incluido) más el `name` del error y el largo en bytes.
  - Un fallo por entidad nunca aborta las demás.
- `buildRecoveryExport(storeId)`: serializa a **un único archivo JSON** (`respaldo-datos-YYMMDD-HHMM.json`), siguiendo el precedente ya existente del export plano (`datos-plano-*.json` en `export.tsx`). Contenido: `meta` (storeId, `exportedAt`, versión de app, motivo `damaged-recovery`), el reporte por entidad y los datos.
- `downloadRecoveryExport(...)`: dispara la descarga con el mismo mecanismo de `export.tsx` (ancla + `URL.createObjectURL` + `a.click()` + `revokeObjectURL`).
- **Por qué JSON plano y no el ZIP v2:** en el momento del daño la clave de exportación no está disponible y el camino cifrado es justamente el que falla. Un archivo plano es lo único que se puede generar siempre, es trivial de enviar a soporte y no puede "fallar por contraseña".
- **Límite de seguridad (restricción dura):** el bundle incluye SOLO las entidades de negocio de esa tienda. Nunca `token`, `AUTH_MODEL`, `currentUser`, `language`, el roster offline, la tabla de wraps del dispositivo ni la DEK. Mismo alcance que `clearStoreData`.

### Fase 3 — Limpiar recién después de guardar

`recoverDamagedStoreData(storeId)`:

1. Construir y descargar el archivo (Fase 2).
2. Mostrar un diálogo de confirmación: "¿Ya guardaste el archivo? Al continuar se borrarán los datos de esta tienda en este dispositivo." con "Sí, borrar" / "Cancelar".
3. Solo si confirma: `clearStoreData(storeId)` + limpiar el carrito (`useCartStore.getState().clear()`, para que no quede un carrito apuntando a productos ya inexistentes), y reportar el resultado (incluido el arreglo de entidades cuyo borrado falló, que `clearStoreData` ya devuelve).
4. Si cancela: no se borra nada y se informa que nada se borró.

Tras esto, la tienda queda vacía y legible: el próximo login (con conexión o con roster válido) entra a una tienda limpia en lugar de quedar bloqueado.

## 5. Archivos afectados

| Archivo | Cambio |
|---|---|
| `apps/web-store-pos/app/shared/lib/storage/damaged-data-recovery.ts` | Nuevo: recolectar, construir, descargar y orquestar el borrado. |
| `apps/web-store-pos/app/shared/lib/blocking-alert.ts` | Nuevo helper `showDamagedDataRecoveryDialog`. |
| `apps/web-store-pos/app/shared/lib/storage/decryption-failure-policy.ts` | Rama `damaged`: capturar tienda, popup con 2 botones, import dinámico de la recuperación. |
| `apps/web-store-pos/app/shared/lib/i18n/es.ts` | Textos nuevos (botón, confirmación, resultado). El texto actual del aviso no cambia. |
| `apps/web-store-pos/app/shared/lib/storage/__tests__/damaged-data-recovery.test.ts` | Nuevo (unitario). |
| `apps/web-store-pos/app/shared/lib/storage/__tests__/decryption-failure-policy.test.tsx` | Actualizar aserciones del caso `damaged`. |
| `apps/web-store-pos/app/__tests__/root.test.tsx` | Revisar/actualizar el mock si el grafo del módulo cambia. |

Sin cambios de backend, sin cambios de contrato de API.

## 6. Tests

### Unitarios (no requieren permiso)

- `damaged-data-recovery.test.ts`: (a) incluye TODAS las entidades de la tienda; (b) una entidad ilegible no aborta las demás y su crudo queda en el archivo; (c) NUNCA incluye `token`/`AUTH_MODEL`/`currentUser`/roster/DEK; (d) el nombre de archivo y el contenido tienen la forma esperada; (e) el borrado ocurre solo tras la confirmación; (f) idempotencia y reporte de fallos de borrado.
- `decryption-failure-policy.test.tsx` (actualizado): el caso `damaged` sigue mostrando el texto exacto y cerrando sesión una sola vez; confirmar ejecuta la recuperación; cancelar no borra nada.
- `store-data-reset.test.ts`: sin cambios (ya cubre el alcance del borrado).

### E2E (REQUIERE TU PERMISO EXPLÍCITO — no se escribe sin él)

Propuesta: un spec NUEVO `frontend-react/e2e/damaged-data-recovery.spec.ts` que:

1. Plante un roster con wrap (como `roster-recovery.spec.ts`), entre, siembre una categoría/producto y sostenga la sesión.
2. **Corrompa a mano** una única entidad (`localStorage` con un `enc:v1:` inválido), que es el disparador real de `EntityUnreadableError`.
3. Recargue y afirme que aparece el mensaje actual y el botón "Recuperar datos".
4. Intercepte la descarga y verifique que el archivo baja y contiene las entidades de esa tienda.
5. Confirme el borrado y afirme que las claves de entidades de esa tienda quedaron ausentes, que el resto del almacenamiento (sesión/roster/dispositivo) NO se tocó, y que el carrito quedó limpio.
6. Verifique que la app vuelve a ser usable tras un nuevo login.

Es cobertura NUEVA, no una modificación de tests existentes. Coste: 1–2 logins reales por corrida (presupuesto de rate-limit, igual que `login.spec.ts`/`roster-recovery.spec.ts`).

## 7. Verificación prevista

- `npx tsc --noEmit`, luego las suites vitest objetivo, y `pnpm typecheck` / `pnpm test` desde `frontend-react/`.
- Backend intacto: sin build ni tests de backend (no hay cambio de contrato).
- E2E solo si lo autorizas; en ese caso, corrida acotada por `--grep` del spec nuevo.

## 8. Riesgos y decisiones abiertas (para tu criterio)

1. **Formato del archivo de recuperación:** propuesto JSON plano. Alternativa: ZIP con contraseña para las entidades legibles (reimportable, pero inútil para las dañadas y exige contraseña). Recomendación: JSON plano.
2. **Momento del cierre de sesión:** propuesto mantenerlo inmediato (como hoy) capturando antes el `storeId`. Alternativa: esperar a que el usuario decida en el popup; cambia la regla 4 vigente.
3. **Limpiar el carrito:** propuesto sí, para no dejar un carrito apuntando a productos borrados. El carrito no está separado por tienda, así que es una decisión consciente.
4. **Detección de "ya se guardó":** no es posible saber con certeza que el archivo llegó al disco, por eso la limpieza exige una segunda confirmación explícita del usuario.
5. **"No se borró nada" vs. el flujo nuevo:** el texto del aviso se conserva; se borra únicamente tras la confirmación explícita, y la UI lo dice antes de hacerlo.

## 9. Fuera de alcance

- Reparar los bytes dañados o intentar descifrarlos sin la clave (imposible por diseño del cifrado autenticado).
- Recuperación en el servidor o soporte remoto.
- Cambios en el export/import normales (`/sync/export`, `/sync/import`).
- Automatizar el borrado sin consentimiento del usuario.
