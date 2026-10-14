# Hotspot — transferencia de archivos dispositivo a dispositivo (PWA)

**Objetivo:** compartir/recibir los exports de la app (roster, export de datos, CSV) entre dos dispositivos con la misma PWA, por la LAN del hotspot, sin backend ni servidor de señalización.
**Rama:** `feat/hotspot-device-transfer` (creada desde `qa`).
**Estrategia de entrega:** `ask-on-risk` — pronóstico de líneas autoradas > 400 → se pedirá una vez la estrategia de cadena (stacked / feature-branch-chain) antes del primer PR.
**Runner de tests:** Vitest (`pnpm exec vitest run`), Playwright para E2E, `pnpm typecheck` + `pnpm lint` para cierre.
**Plan de referencia:** `docs/deploy/2026-09-09-device-to-device-file-transfer-plan.md` (opción A).

---

## Specs

> Las cadenas entre comillas son textos ya decididos en el plan del owner (no son inventados aquí). Todo lo marcado **(supuesto)** es una inferencia mía y está abierto a corrección.

- **S1** — Transferencia de archivos entre dos dispositivos con la misma PWA por la LAN del hotspot, sin backend ni servidor de señalización.
- **S2** — Canal de datos = **WebRTC DataChannel**, ICE **non-trickle** (espera `icegatheringstate === 'complete'`), sin STUN configurado (solo candidatos host/mDNS de LAN).
- **S3** — Señalización **sin servidor**: oferta/respuesta comprimidas (deflate + base45) como **QR** + **código de copiar/pegar** de respaldo. Interacción total: **2 escaneos**.
- **S4** — Autenticación de emparejamiento: el emisor genera un **código de 6 dígitos**, deriva una clave con los helpers de `offline-crypto.ts` y el canal **solo se abre tras verificar el hash en ambos lados**.
- **S5** — Protocolo de transferencia: fragmentos binarios de **16 KiB** con contrapresión (`bufferedAmountLowThreshold`), **frame de metadatos primero** `{ name, size, sha256, kind }`, integridad por **SHA-256 en streaming** en ambos lados. **Sin reanudación** en v1.
- **S6** — El payload son **exactamente los exports cifrados existentes** (ZIP de roster, export de datos v2, CSVs). **No hay serialización nueva.**
- **S7** — Al completar, el receptor abre el flujo de importación existente **con el `File` precargado**, heredando el manejo de contraseña incorrecta, fichero corrupto y enrutado por el sobre (`WrongStoreError` incluido).
- **S8** — Acción **"Compartir por hotspot"** junto a los botones existentes de Exportar/Importar, en la sección de sincronización y en el panel de export del roster.
- **S9** — Robustez: aviso claro ante **aislamiento AP/cliente** (ICE no conecta en N segundos), **Wake Lock** durante la transferencia, límites de tamaño, errores al usuario **sin telemetría**.
- **S10** — **Fuera de alcance (v1):** transferencia de ficheros arbitrarios del dispositivo, reanudación de transferencias parciales, difusión a varios receptores, cualquier componente de backend o servidor de señalización.

### Cadenas exactas del plan (verbatim)

- Etiqueta de la acción: **"Compartir por hotspot"**.
- Aviso de aislamiento AP: **"los dispositivos no se ven; desactiva el aislamiento AP o usa el hotspot del otro dispositivo"**.
- Etiqueta del modal de emparejamiento: **"[dispositivo] · código 482913"** *(formato ilustrativo del plan; el texto final lo fija i18n en T8)*.

### Supuestos (verificar antes de implementar)

- **A1 (corrección al plan):** el escáner de la app usa **`@zxing/browser`** (`BrowserMultiFormatReader`), **NO `BarcodeDetector`**. El plan §3.2 afirma lo contrario. La lectura de QR debe reutilizar zxing; `BarcodeDetector` no existe en Safari iOS. → El plan anterior queda corregido en este punto.
- **A2:** generar el export del roster **requiere estar online** (`roster-export-panel.tsx` deshabilita si `!isOnline`, porque pide `GET /v1/storeusers/{storeId}/offline-roster`). Compartir un archivo ya generado no requiere red; generarlo, sí.
- **A3:** **no existe hoy** una librería de *generación* de QR (solo lectura con zxing). Hay que añadir una pequeña (p. ej. `qrcode`) como **import dinámico** (regla de dependencias pesadas de `frontend-react/AGENTS.md`).

---

## Decisiones

| # | Decisión | Origen |
| --- | --- | --- |
| D1 | **Matriz v1 = solo Chromium (Android + PC).** Safari iOS queda fuera de v1 (degradado al respaldo copiar/pegar, sin soporte garantizado). | Owner, 2026-10-14 (respuesta a §8.2 del plan) |
| D2 | Codificación de la señalización: **deflate + base45** (alfabeto base45 = exactamente el alfanumérico de QR, por eso gana a base58). | Plan §3.2 |

---

## Alcance

### Autorizado (solo `frontend-react/`)

- Nuevo: `apps/web-store-pos/app/sync/lib/hotspot/` (`sdp-codec.ts`, `pairing-code.ts`, `peer-connection.ts`, `chunker.ts`, `transfer-protocol.ts`).
- Nuevo: `apps/web-store-pos/app/sync/components/hotspot-share-modal.tsx`, `hotspot-receive-modal.tsx`, `qr-code.tsx`.
- Editar: `apps/web-store-pos/app/sync/routes/import.tsx` (entrada "Recibir por hotspot" + handoff a `ImportForm`).
- Editar: `apps/web-store-pos/app/sync/routes/export.tsx` y `app/management/users/components/roster-export-panel.tsx` (entrada "Compartir por hotspot").
- Editar: `app/shared/lib/i18n/es.ts` (claves nuevas).
- **Nuevos** tests: unit en `app/sync/lib/hotspot/__tests__/`, componente en `app/sync/components/__tests__/`, E2E nuevo en `frontend-react/e2e/`.
- Dependencia nueva: librería de generación de QR (lazy).

### Fuera de alcance

- **Backend y BD**: no se tocan. Impacto 0.
- **`frontend/` (Angular)**: PROHIBIDO leerlo o tocarlo (regla del repo).
- **E2E existentes** (`frontend-react/e2e/*.spec.ts` y `e2e/support/*`): **intocables**. Solo se **añaden** specs nuevos.
- **Sin reanudación, sin multi-receptor, sin ficheros arbitrarios** (S10).

---

## Diseño técnico

### Módulos (funciones puras primero → testeable sin navegador)

| Módulo | Responsabilidad | Verificación |
| --- | --- | --- |
| `sdp-codec.ts` | Comprimir SDP (`CompressionStream('deflate')`) + `base45`/`base58` y el inverso | Unit: round-trip, payload malformado |
| `pairing-code.ts` | Código de 6 dígitos, hash y verificación (reusa `pbkdf2Base64`) | Unit: código incorrecto |
| `peer-connection.ts` | Oferta/respuesta non-trickle, espera ICE `complete`, mDNS | Integración: 2 `RTCPeerConnection` en loopback |
| `chunker.ts` | Fragmentos 16 KiB + contrapresión | Unit con `RTCDataChannel` mockeado |
| `transfer-protocol.ts` | Frame de metadatos, progreso, SHA-256 streaming | Unit + integración loopback |

### Puntos de anclaje (ya verificados en código)

- **Importación (reutilización total):** `ImportForm` expone `onImport: (file: File, password: string) => Promise<SyncResult>`. Producir un `File` en el receptor = entrar por `handleImport` de `sync/routes/import.tsx` con **cero cambios** en el flujo de import.
- **Exportación (reutilización total):** `serializeRoster(bundle, master, storeId)` (`shared/lib/offline/roster-serializer.ts`) y `DataSerializerService.export(...)` ya devuelven `Uint8Array`; hoy se convierten a `Blob` para descarga. El hotspot reutiliza esos bytes, sin nueva serialización.
- **Cripto:** `shared/lib/offline/offline-crypto.ts` → `sha256Base64`, `pbkdf2Base64`, `verifyOfflinePassword`.
- **Cámara:** `sales/components/scanner-modal.tsx` (`@zxing/browser`, imports dinámicos).

### Flujo (resumen)

1. Emisor: export → **oferta** WebRTC (espera ICE `complete`) → QR + código de 6 dígitos.
2. Receptor: escanea el QR → **respuesta** → muestra su QR de respuesta.
3. Emisor: escanea la respuesta → el canal se abre tras verificar el código.
4. Metadatos → chunks con progreso → SHA-256 coincide.
5. Receptor: `File` → `import-form` precargado → contraseña → Importar.

---

## Tareas

- [x] **T1** — `sdp-codec.ts`: deflate + base45/base58, round-trip. *(S2, S3)* · ruta: inline · commit `e0378bb0`
- [x] **T2** — `pairing-code.ts`: código 6 dígitos + verificación (reusa `pbkdf2Base64`). *(S4)* · ruta: inline · commit `a97d0de9`
- [ ] **T3** — `peer-connection.ts`: non-trickle, ICE `complete`, sin STUN; test de integración loopback. *(S2)* · ruta: inline
- [ ] **T4** — `chunker.ts` + `transfer-protocol.ts`: 16 KiB, contrapresión, metadatos, SHA-256 streaming, progreso. *(S5)* · ruta: inline
- [ ] **T5** — Lib de generación de QR (lazy, supuesto A3) + `qr-code.tsx`. *(S3)* · ruta: inline
- [ ] **T6** — `hotspot-share-modal.tsx` (emisor): elegir export, contraseña, QR+código, progreso. *(S1, S3, S6, S8)* · ruta: inline
- [ ] **T7** — `hotspot-receive-modal.tsx` (receptor): escanear/teclear, emparejar, QR de respuesta, progreso, handoff a `import-form`. *(S3, S7)* · ruta: inline
- [ ] **T8** — Integrar entradas en `roster-export-panel.tsx` y `sync/routes/import.tsx` + i18n (`es.ts`). *(S8)* · ruta: inline
- [ ] **T9** — Robustez: aviso aislamiento AP/ICE timeout, Wake Lock, límites de tamaño. *(S9)* · ruta: inline
- [ ] **T10** — E2E **nuevos** (Playwright, 2 contextos en `localhost`, escaneo sustituido por inyección del código). *(S1, S3, S5, S7)* · ruta: inline
- [ ] **T11** — Verificación final: `typecheck`, `lint`, `vitest`, y confirmar el chunk lazy en `pnpm build`.

Verificación por tarea con **test-first** (RED observado → GREEN → refactor) para los módulos con comportamiento determinista; los componentes UI llevan test de componente. Las líneas de `Evidencia de verificación` se rellenan al cerrar cada tarea.

---

## Criterios de aceptación

1. Dos dispositivos con la misma PWA, en la LAN del hotspot, completan una transferencia sin backend y sin datos móviles.
2. El canal es WebRTC DataChannel sobre candidatos de LAN (sin STUN) y no se abre sin el código de emparejamiento correcto.
3. El receptor termina en el formulario de importación existente con el `File` precargado, y los errores de contraseña/fichero/store se heredan sin cambios.
4. SHA-256 detecta un stream corrupto e **impide la importación**.
5. El camino sin cámara (copiar/pegar) completa el mismo flujo.
6. Aislamiento AP/ICE sin conectar → timeout + mensaje de guía.
7. No se toca `frontend/` (Angular), ni backend, ni ningún E2E existente.

## Comandos de verificación

```bash
cd frontend-react/apps/web-store-pos
pnpm typecheck
pnpm lint
pnpm exec vitest run app/sync
pnpm build   # confirmar que la lib de QR y el motor WebRTC caen en chunks lazy
```

E2E nuevo (desde `frontend-react/`):

```bash
pnpm exec playwright test e2e/hotspot-transfer.spec.ts
```

## Riesgos

- **iOS Safari** (mDNS + PWA): **fuera de v1** por D1. No se verifica ni se soporta; el respaldo copiar/pegar sigue existiendo para PC sin cámara.
- **Aislamiento AP/cliente** del hotspot: bloquea dispositivo↔dispositivo en algunas skins de Android; cubierto por S9.
- **SDP grande** para cámaras viejas: aceptable por el respaldo copiar/pegar.
- **Dependencia nueva de QR**: debe entrar lazy (regla de dependencias pesadas), y justificar su inclusión.
- **No tocar E2E existentes**: cualquier fricción se escala al owner, no se "arregla".
- **`import-form` con `accept=".zip"`**: el handoff por `File` salta el picker; conservar la extensión del nombre (el sobre es agnóstico al nombre — precedente `roster-any-filename`).

## Evidencia de verificación

Por tarea:

- **T1** — `pnpm exec vitest run app/sync/lib/hotspot` → **16 passed**, 0 fallos (KAT RFC 9285 + round-trip). `pnpm typecheck` → 0 errores. `pnpm lint` → 0 errores. Commit `e0378bb0`.
- **T2** — `pnpm exec vitest run app/sync/lib/hotspot` → **25 passed** (16 T1 + 9 T2). `pnpm typecheck` → 0 errores. `pnpm lint` → 0 errores. Commit `a97d0de9`. RDD (`assess` sobre `affae51f..`): risk `medium`, `review_due` según presupuesto de la rebanada.

Cierre de feature (se rellena al final):

| Comando | Resultado |
| --- | --- |
| `pnpm typecheck` | 0 errores (a fecha de T1) |
| `pnpm lint` | 0 errores (a fecha de T1) |
| `pnpm exec vitest run app/sync` | pendiente |
| E2E nuevo | pendiente |

## Log

- **L1 (owner, verbatim):** "investigar para ver la solucion mas simple Si dos dispositivos estan conectados por bluetooth se puede pasar info entre las aplicaciones?"
- **L2 (owner, verbatim):** "ese plan lo tenemos pero no esta implementado. Como se podria implementar? La experiencia de usuario como seria? es decir, los pasos?"
- **L3 (owner, verbatim):** "dale"
- 2026-10-14 — Investigación (read-only): Bluetooth descartado para la PWA (el emparejamiento del SO no expone canal al navegador; Web Bluetooth es solo central y no existe en Safari iOS; el modo periférico en navegador "no está planificado"). La solución sigue siendo la opción A del plan (`docs/deploy/2026-09-09-device-to-device-file-transfer-plan.md`). Confirmado con grep: **no hay** `RTCPeerConnection`/`RTCDataChannel` en `frontend-react` → el plan no está implementado.
- 2026-10-14 — Feature creado a partir del plan del owner + hallazgos de esta investigación. Sin implementación todavía. Corrección A1 registrada (zxing, no `BarcodeDetector`).
- **L4 (owner, verbatim):** "Solo Chromium (Android + PC) en v1" (respuesta a la pregunta de matriz de navegadores, §8.2 del plan). → decisión **D1**.
- 2026-10-14 — Rama `feat/hotspot-device-transfer` creada desde `qa`. Empieza **T1** (`sdp-codec.ts`) con test-first.
- **Pendiente de decisión del owner (plan §8.1):** ¿el emisor también recibe (sesión bidireccional) o basta una dirección por sesión en v1? No bloquea T1; se preguntará antes de **T6**.
- 2026-10-14 — **T1 completada** (`sdp-codec.ts`, commit `e0378bb0`): base45 (RFC 9285, KAT verificados) + deflate. Hallazgo durante el test-first: el **espacio es un símbolo válido de base45**, así que el decodificador solo debe eliminar ruido de línea (`\t\r\n`), nunca espacios — el primer intento los eliminaba y corrompía el payload. Corregido con test que lo fija.
- **Hallazgo para T3 (no afecta T1/T2):** el plan §5-P2 propone un test de integración con dos `RTCPeerConnection` reales "en el mismo proceso… runners basados en Chromium", pero el runner de este repo es **Vitest sobre jsdom**, donde `RTCPeerConnection` NO existe. La estrategia de prueba de T3 debe decidirse (unit con RTC mockeado en Vitest + integración real como E2E de Playwright, o añadir entorno de navegador). Se resolverá al empezar T3.
- 2026-10-14 — **T2 completada** (`pairing-code.ts`, commit `a97d0de9`): código de 6 dígitos uniforme (rejection sampling, sin sesgo de módulo), salt de sesión, y prueba PBKDF2 (210k) que reusa `sha256Base64`/`pbkdf2Base64` de `offline-crypto.ts`. Decisión de implementación tomada (no del owner): **PBKDF2 en vez de hash simple** porque 10^6 candidatos se fuerzan al instante con un hash rápido; el salt de 16 bytes es público pero ata la prueba a la sesión.
