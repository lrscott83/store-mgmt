# Sonido de pedido nuevo — diseño, fuera de alcance

Estado: **documentado, no implementado** (2026-10-20). Decisión del usuario: se documenta ahora y se
implementa más adelante.

## Qué se pidió

Cuando entra un pedido nuevo desde el catálogo web, la vista de gestión debe avisar con un sonido,
sin que nadie tenga que mirar la pantalla.

## Por qué no está implementado

La vista de gestión carga su estado al montar y cuando el usuario actúa. No hay canal en tiempo real
ni sondeo: hoy, un pedido nuevo no aparece hasta que alguien recarga. Un sonido sin detección previa
sería un adorno que nunca suena.

## Qué falta decidir antes de implementarlo

1. **Transporte de la detección.** Dos opciones:
   - *Sondeo (polling)*: la vista repite la consulta del panel `Creado` cada N segundos y compara el
     `total` con el anterior. Simple, sin infraestructura nueva; cuesta una petición por intervalo y
     por pestaña abierta, y el aviso llega con hasta N segundos de retraso.
   - *Empuje (SignalR/SSE)*: el backend notifica al crear el pedido. Sin retraso ni sondeo, pero
     exige un hub, autenticación del canal y trabajo de despliegue.
   El intervalo (o el transporte) es una decisión de producto, no técnica: un sondeo de 10 s es
   razonable para una tienda y absurdo si la vista queda abierta todo el día en cinco dispositivos.
2. **Cuándo suena.** Siempre que sube el conteo, o sólo cuando la pestaña no tiene el foco. Lo
   segundo evita el sonido redundante en quien ya está mirando la pantalla, pero exige la API de
   visibilidad y un estado adicional que hoy no existe.
3. **El archivo de audio.** No hay ninguno en el repositorio. Hay que añadirlo (o sintetizarlo con
   `AudioContext`), y decidir si se sirve desde `public/` o se genera.
4. **Permisos del navegador.** El audio sólo suena tras una interacción del usuario en la página
   (política de autoplay). La vista necesita un gesto previo —el botón "Actualizar" sirve— o el
   primer aviso se pierde en silencio.

## Criterios de aceptación propuestos

- Un pedido creado por el catálogo hace sonar el aviso en la vista de gestión sin recargar.
- El sonido NO suena dos veces por el mismo pedido, ni al abrir la vista con pedidos ya existentes.
- Si el audio no puede reproducirse (política del navegador, archivo ausente), la vista sigue
  funcionando y el fallo no se convierte en un error visible para quien opera la tienda.
- El sondeo, si se elige, se detiene cuando la pestaña no está visible y al desmontar la vista.

## Punto de enganche previsto

La vista ya tiene un único lugar por el que pasan los pedidos leídos: `loadPanel` en
`frontend-react/apps/web-store-pos/app/sales/routes/ordering-orders.tsx`. La comparación de conteos
va ahí, contra el `total` anterior del panel `Creado`; no hace falta tocar el backend si se elige
sondeo.
