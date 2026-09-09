# Transferencia de archivos entre dispositivos por hotspot — Plan

**Fecha:** 2026-09-09
**Alcance:** Frontend React PWA (`apps/web-store-pos`) — sin cambios en el backend.
**Objetivo:** Exportar/importar los archivos de la app (roster, export de datos, CSV de almacenes, etc.) directamente entre dos dispositivos con la misma app, conectados por el hotspot de uno de ellos — de forma segura y lo más simple posible.

---

## 1. Contexto y restricciones

- Ambos dispositivos ejecutan la **misma PWA en un navegador**. No hay servidor en ninguno de los dos ni proceso Node en runtime (ver plan de instalación en Windows: archivos estáticos + Caddy; en teléfonos/tablets no hay nada instalado).
- La app **ya produce exportaciones cifradas**: `roster-serializer.ts` y `data-serializer-service.ts` generan ZIPs cuyo payload está cifrado con AES usando una contraseña derivada de `master + storeId`, con un sobre plano `meta.json` (precedente `roster-any-filename` — el nombre del fichero no es load-bearing).
- La importación ya acepta un `File` (`import-form.tsx`), así que cualquier transporte que termine en un `File`/`Blob` en el receptor reutiliza todo el flujo existente, incluido el manejo de contraseña incorrecta y fichero corrupto.
- Una LAN por hotspot (un teléfono comparte hotspot, la tablet/PC se conecta) da conectividad IP a ambos, **pero el navegador no puede escuchar en puertos TCP**: el clásico "levantar un mini servidor HTTP y subir el archivo" no es opción en teléfonos.

## 2. Opciones evaluadas

| # | Opción | Veredicto | Por qué |
|---|--------|-----------|---------|
| A | **WebRTC DataChannel, solo LAN, señalización por QR / copiar-pegar** | ✅ **Recomendada** | 100% navegador, funciona teléfono↔teléfono y teléfono↔PC, P2P directo por el hotspot, cifrado DTLS por la plataforma, cero backend, cero servidores nuevos. |
| B | Hoja de compartir nativa / "guardar en Archivos" + WhatsApp/Bluetooth | Solo respaldo | La más simple pero sale del hotspot (los datos pasan por un tercero o requiere emparejamiento del SO); sin lado receptor en desktop; mala UX para uso repetido. |
| C | Mini servidor HTTP/WebSocket en un dispositivo (p. ej. el PC con Caddy) | Complemento futuro | Solo funciona cuando un extremo es el despliegue del PC; no resuelve teléfono↔teléfono. Podría añadirse después como "hub LAN" para tiendas con PC. |
| D | `navigator.share` + Web Share Target (PWA como receptor) | Descartada para v1 | El lado receptor solo funciona en Android/Chrome con PWA instalada y requiere cambios de rutas/manifest; Safari/Firefox de desktop no tienen receptor. |
| E | Wi-Fi Direct / Bluetooth / WebBluetooth | Descartada | No sirve para transferencia masiva de ficheros desde un navegador; el emparejamiento es a nivel de SO y poco fiable. |

**Por qué gana A:** cumple los dos requisitos — *segura* (el transporte va cifrado con DTLS por WebRTC y el payload ya es un ZIP cifrado, dos capas independientes) y *simple* (sin servidor, sin cuentas: escanear un código y el fichero aparece en la pantalla de importación).

## 3. Diseño recomendado (Opción A)

### 3.1 Roles

- **Emisor:** tiene el export (roster o export de datos). Crea la oferta WebRTC y muestra un **QR de emparejamiento + código corto**.
- **Receptor:** escanea el QR (o teclea el código), acepta, recibe el fichero y cae directo en el flujo de importación existente con el fichero precargado.
- **Escenario típico (teléfono ↔ teléfono):** el teléfono A comparte su hotspot y es el emisor (su pantalla muestra el QR + código); el teléfono B se conecta a ese hotspot y escanea la pantalla del A con su cámara. Ambos solo tienen la PWA abierta en el navegador — no se instala nada en ningún teléfono. La transferencia viaja solo por la LAN del hotspot, por lo que **no consume datos móviles**.

### 3.2 Señalización — sin servidor, solo LAN

- ICE **non-trickle**: el emisor espera `icegatheringstate === 'complete'` (solo candidatos LAN host/mDNS, sin servidores STUN configurados) y serializa la oferta SDP completa.
- La SDP se comprime (deflate + base45) y se codifica como:
  - un **código QR** en el emisor (escaneado con la cámara del receptor — la app ya usa `BarcodeDetector` en el escáner de ventas, misma vía de dependencia),
  - más un **código de copiar-pegar** como respaldo para dispositivos sin cámara (PC↔PC).
- El receptor responde igual (su respuesta vuelve por el mismo intercambio QR/copiar-pegar — un escaneo más de emisor→receptor, o el receptor muestra su QR de respuesta para que lo escanee el emisor). Interacción total: **2 escaneos**. Es el patrón estándar de "señalización manual"; nunca existe un servidor de señalización.

### 3.3 Autenticación del canal (emparejamiento)

- El emisor genera un **código de emparejamiento de 6 dígitos**, deriva una clave (PBKDF2 con los helpers existentes de `offline-crypto.ts`) y:
  - incluye el código dentro del QR/payload de respuesta (escanear ya autentica), y
  - lo muestra en pantalla para que ambos usuarios confirmen visualmente con qué dispositivo se emparejan.
- El canal de datos solo se abre tras verificar el hash del código en ambos lados. Combinado con DTLS, un atacante en la LAN no puede inyectar ni hacer MitM sin poseer el código mostrado en la pantalla del emisor.

### 3.4 Protocolo de transferencia por el DataChannel

- **Envío por chunks:** fragmentos binarios de 16 KiB (seguros bajo el límite SCTP de todos los navegadores), con contrapresión vía `bufferedAmountLowThreshold` para que ficheros grandes no inflen la memoria.
- **Frame de metadatos primero** (JSON): `{ name, size, sha256, kind }`, donde `kind` mapea al tipo de export (roster / export de datos v2 / CSV). El receptor muestra el nombre del fichero — el sobre `roster-any-filename` permite cualquier nombre; solo hay que conservar la extensión.
- **Integridad:** el emisor calcula SHA-256 en streaming mientras lee el fichero; el receptor lo recalcula al llegar y ambas pantallas muestran la verificación antes de abrir el paso de importación.
- **Sin reanudación en v1:** una transferencia fallida simplemente se reinicia (los exports son de pocos MB); la reanudación explícita queda fuera de alcance.

### 3.5 Payload = los exports cifrados existentes

- El emisor ofrece exactamente los ficheros que ya producen las pantallas de export (ZIP de roster, ZIP de export de datos v2, CSVs). No hay serialización nueva.
- Al completar, el receptor abre `import-form.tsx` con el `File` recibido — los comportamientos de contraseña incorrecta, fichero corrupto y enrutado por el sobre se heredan sin cambios.
- **Defensa en profundidad:** aunque el canal DTLS se viera comprometido, el payload ZIP sigue cifrado con contraseña; el código de emparejamiento nunca protege la contraseña del ZIP.

### 3.6 Ubicación en la UI

- Nueva acción "Compartir por hotspot" junto a los botones existentes de Exportar/Importar en la sección de sincronización y en el panel de export del roster.
- Pantallas: emisor (elegir fichero → QR + código + progreso) y receptor (escanear/teclear código → progreso → importación). Reutilizar los componentes de modal/diálogo de la app.

## 4. Riesgos conocidos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| **Aislamiento AP/cliente del hotspot** bloquea el tráfico dispositivo↔dispositivo (común en algunas skins de Android y hotspots de operador) | La conexión WebRTC falla rápido → mostrar aviso claro "los dispositivos no se ven; desactiva el aislamiento AP o usa el hotspot del otro dispositivo". Detección = ICE no conecta en N segundos. |
| SDP demasiado grande para un QR con cámaras viejas | Comprimir + base45 deja la SDP LAN típica en ≈500–900 B; el respaldo de copiar-pegar siempre está visible. |
| Particularidades de mDNS/PWA en iOS Safari | Verificar en Safari durante la implementación; el respaldo de copiar-pegar cubre los dispositivos donde el QR es poco fiable. Los candidatos host mDNS se resuelven bien dentro de la misma red del hotspot. |
| El navegador mata la pestaña del receptor a mitad de transferencia | Mantener la pantalla encendida (`Wake Lock` API) durante la transferencia; reiniciar si se interrumpe (v1). |
| El usuario envía al dispositivo equivocado | Código de emparejamiento + etiqueta del dispositivo para confirmar; nada se importa hasta que el usuario confirma la vista previa del fichero. |

## 5. Fases de implementación (TDD)

1. **P1 — Helpers de señalización (funciones puras):** compresión/descompresión de SDP (deflate+base45), generación/verificación del código de emparejamiento, constructores de oferta/respuesta non-trickle.
   *Tests:* unit tests de round-trips, payloads malformados, código incorrecto.
2. **P2 — Motor de transferencia:** chunker, contrapresión, frame de metadatos, SHA-256 en streaming en ambos lados, eventos de progreso.
   *Tests:* unit tests con `RTCDataChannel` mockeado; test de integración con dos `RTCPeerConnection` reales en el mismo proceso (loopback, funciona en runners basados en Chromium).
3. **P3 — UI:** modal de compartir en emisor y receptor, render de QR + escaneo con cámara (reutilizar el escáner de ventas), progreso, finalización → traspaso a `import-form`.
   *Tests:* tests de componente con transportes mockeados; spec E2E con dos contextos/páginas de Playwright sobre `localhost` simulando el par LAN, sustituyendo el escaneo por inyección directa del código.
4. **P4 — Robustez:** UX de fallo por aislamiento AP, Wake Lock, límites de tamaño, reporte de errores al usuario sin telemetría.

## 6. Escenarios E2E a cubrir

- Camino feliz: emisor exporta roster → receptor escanea → progreso 100% → SHA-256 coincide → se abre la importación con el enrutado correcto del `storeId` del sobre.
- Código de emparejamiento incorrecto en el receptor → el canal nunca se abre.
- El receptor cancela a mitad de transferencia → el emisor ve el aborto, no se importa nada.
- Stream de chunks corrupto (inyectado) → SHA-256 no coincide → importación bloqueada con mensaje claro.
- PC sin cámara → el camino de copiar-pegar completa el mismo flujo.
- Simulación de aislamiento AP (ICE nunca conecta) → timeout + mensaje de guía.

## 7. Fuera de alcance (v1)

- Transferencia de ficheros arbitrarios del dispositivo (solo exports de la app).
- Reanudación de transferencias parciales.
- Difusión a varios receptores (un emisor ↔ un receptor por sesión).
- Cualquier componente de backend o servidor de señalización.

## 8. Preguntas abiertas

1. ¿El emisor también debería poder *recibir* (sesión bidireccional en un mismo emparejamiento), o basta con una dirección por sesión en v1? *(Propuesta: una dirección; los roles simétricos son baratos de añadir después.)*
2. Matriz mínima de navegadores a soportar — se asume Chrome/Edge + Safari iOS; confirmar que no se requiere Firefox en Android.
3. ¿El despliegue en PC con Windows debería exponer después la Opción C ("hub LAN") para tiendas que quieran sincronización desatendida? *(Queda como complemento futuro; no afecta este diseño.)*
