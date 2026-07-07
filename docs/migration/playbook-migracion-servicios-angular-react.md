# Playbook de migración de SERVICIOS Angular→React (parity 100%)

## Pautas de migración Angular → React (parity 100%)

### 1. Fuente de verdad única: Angular.
El código fuente de Angular es la ÚNICA referencia. Nunca se valida contra API/backend en vivo ni se infiere del runtime — se espeja el source.

### 2. Migrar ≠ mejorar.
Paridad, no optimización. Prohibido migrar y optimizar en el mismo paso. Cualquier cambio de arquitectura, contrato o firma no justificado por la mecánica de la migración se PREGUNTA antes. Nunca se asume.

### 3. Paridad de firma en TODOS los métodos públicos.
Mismo nombre, mismos parámetros (nombre, orden, tipo, opcionalidad) y mismo tipo de dato envuelto. Única transformación permitida: `Observable<T>` → `Promise<T>`. No es identidad literal de tipos; es equivalencia semántica con esa sola conversión.

### 4. Observable → Promise, async de los dos lados.
`Observable<T>` de una emisión → `Promise<T>` (async/await).
Offline y online son AMBOS async. El offline nunca se hace síncrono.
**Excepción — streams multi-emisión:** si expone un stream reactivo (estado que re-emite, `BehaviorSubject`), NO cabe en `Promise`. Se marca y se consulta qué primitiva React usar. No se degrada a `Promise` por default.

### 5. DI como en React.
Se respeta la convención de inyección ya establecida en el repo. Si no hay convención clara para el caso, se pregunta antes de inventar un mecanismo nuevo.

### 6. Migrar el repositorio si existe.
Mismas reglas que el servicio (firma, async, errores). Se espeja la estructura del repo Angular, no se re-verifica persistencia/endpoints contra el mundo real.

### 7. Migrar offline y online si existen.
Ambas capas con idénticas reglas que el servicio. Se espeja también la lógica de orquestación Angular (cómo decide offline vs online).

### 8. Política de bugs: consultar → TDD.
Sospecha de bug: (1) lo marco y te lo explico, (2) espero tu OK, (3) recién ahí lo arreglo en React con TDD estricto. Nunca se replica, nunca se arregla sin confirmación.

### 9. Contrato de errores exacto.
La forma del error (envelope, códigos, propagación) espeja Angular al detalle. El error del `Observable` pasa a `reject` de la `Promise` conservando la MISMA estructura. Nada de aplanar envelopes.

### 10. Call-sites: mismo uso lógico que Angular.
Se adapta solo la mecánica del framework (`subscribe` → `await`/hook), sin agregar ni sacar lógica.
Método React sin uso equivalente en Angular → lo reporto y pregunto para qué es.
Uso en Angular sin correlato en React → lo reporto antes de crearlo.

### 11. Cualquier duda que fuerce una suposición → se pregunta.
Streams, DI ambigua, algo que parece bug, un uso sin correlato: todo eso frena la migración y se consulta.
