# ONAT — Análisis de brechas y carga del Vector Fiscal

**Fecha:** 2026-10-27 · **Rama base:** `dev` · **Estado:** análisis, sin implementación · **Alcance:** solo `frontend-react/` (el Angular `frontend/` está congelado)

Este documento es el resultado de la auditoría pedida por el Owner: las cuatro promesas del módulo ONAT
frente a lo que realmente existe hoy, y el diseño de la carga del **Vector Fiscal (RC-04A)**, que es el
punto 1 de la lista de prioridades.

---

## 1. Lo que ya está implementado

Módulo `frontend-react/apps/web-store-pos/app/onat/` (2 rutas + 4 librerías):

| Pieza | Qué hace | Evidencia |
|---|---|---|
| Menú y rutas | Grupo `ONAT` antes de Gestión, items *Vector Fiscal* y *Configuraciones*, solo Owner, con módulo 22 y feature 126 | `app/onat/routes/vector-fiscal.tsx:245`, `app/onat/routes/configurations.tsx` |
| Agregación mensual | 12 filas en CUP, multi-tienda, créditos por `paidDate`, moneda con tasas de la tienda y fecha del registro | `app/onat/lib/onat-aggregation.ts:169-318` |
| Tributos calculados | Ventas y Servicios 10 % (`011402`), Cuota mensual 5 % sobre el exceso de 3.260 (`051012`), Fuerza de Trabajo 5 % de salarios (`061032`) | `app/onat/lib/onat-calculations.ts:11-53` |
| Cierre anual | Mínimo exento 39.120, escala de 10 tramos (Ley 181/2025 art. 49.1), cuotas, retenciones, bonificación 5 % pronto pago | `onat-calculations.ts:27-150` |
| Tributos pagados | 11 nomencladores fiscales registrables como gasto, cada uno con su código ONAT | `app/onat/lib/onat-taxonomy.ts:27-127` |
| Overrides | Ingreso y gasto mensual sobrescribibles con el original congelado | `app/onat/lib/onat-storage.ts:213-245` |
| Configuraciones | Nombre, NIT, domicilio fiscal/legal, municipio, provincia, actividades (nombre + código) | `onat-storage.ts:19-28`, `configurations.tsx:43-50` |
| Backend | Solo catálogo: `ModuleType.Onat = 22`, `FeatureType.Onat = 126`, `StoreRoleFeatures.OnatAdmin`, migración `20261027162947_AddOnatModule`, script `42-20261027-Add-Onat-Module.sql` | sin entidades, endpoints ni servicios fiscales |

El módulo nace con `Module.IsActive = false`; hay que encenderlo con
`UPDATE "Module" SET "IsActive" = TRUE WHERE "Id" = 22;`.

---

## 2. Lo que falta, por prioridad

### P1 — El Vector Fiscal como tal (bloqueante)
`OnatConfig` guarda **solo identificación**. No modela el vector: qué tributos aplican por actividad, con
qué tasa, qué exenciones, contribución territorial, arrendamientos. Las tasas son constantes globales
(`onat-calculations.ts:11-16`). Además, ocho nomencladores nunca se calculan: sellos `073012`, anuncios
`090012`, CESS 20 % `082013`, seguridad social 14 % `081013`, contribución de zonas, arrendamientos,
exoneraciones y "otros tributos".

### P2 — Registro de Ingresos y Gastos oficial
No existe el formulario con hojas GENERALES / INGRESOS / GASTOS / TRIBUTOS, ni export a Excel o PDF desde
ONAT. No hay librería xlsx/exceljs/sheetjs instalada; `jspdf` y `jspdf-autotable` existen pero solo los usa
el reporte de inventario (`app/reports/lib/pdf/inventory-today-sale-pdf.ts`). El único export es el ZIP JSON
cifrado genérico (`app/sync/routes/export.tsx`, `DataSerializerService.collectEntries`).

### P3 — Avisos de fechas límite y recargos
No hay calendario fiscal, recordatorios ni alertas. El 5 % de pronto pago solo se aplica si el Owner marca
`pagaAntesDel28Febrero` (`vector-fiscal.tsx:349`); el DJ-08 del 30 de abril no existe en el modelo. El
sistema de notificaciones backend es solo el campanario de registro de owners del SuperAdmin
(`Domain/Entities/Notifications/Notification.cs`), sin tipo ni fecha de vencimiento.

### P4 — Nómina y activos fijos
`ExpenseType.Salario = 1` es todo el rastro de nómina; solo alimenta el 5 % de Fuerza de Trabajo. No hay
empleados, planilla, deducciones ni seguridad social sobre salarios. Tampoco activos fijos ni depreciación,
ni en frontend ni en backend.

### Transversal
Todo el estado fiscal vive en `localStorage` plano por Owner (`lizoft.onat-config-<ownerId>`,
`lizoft.onat-overrides-<ownerId>`), sin cifrar. No hay persistencia ni respaldo del servidor. El guard
"solo Owner" es de cliente.

---

## 3. Punto 1 — El Vector Fiscal (RC-04A)

### 3.1 Qué es y cómo lo entrega la ONAT

- El **vector fiscal** es formalmente el modelo **RC-04A "Vector Fiscal de persona natural"**: un resumen
  individualizado de las obligaciones tributarias del contribuyente — qué tributos debe pagar, por qué
  importe y con qué periodicidad. No es un impuesto; es la herramienta de pago.
- **Se obtiene en PDF desde el Portal Tributario** (`onat.gob.cu`): el contribuyente se registra con NIT,
  contraseña y el **código de barras de 16 dígitos del RC-05** (carnet del contribuyente, que también
  aparece impreso en el propio vector). Ya registrado, entra con NIT + contraseña y pulsa el recuadro
  **Vector Fiscal**; el documento se descarga en PDF.
- Es un **vector dinámico**: cada generación refleja los cambios de actividad, cuotas o suspensiones. No hay
  una versión "guardada" en el portal.
- **También se entrega en papel** en la oficina municipal de la ONAT (RC-04A) y es el documento que se lleva
  al banco. Transfermóvil lo usa como opción de pago ("Vector Fiscal (RC-04A)") con un **código RC-04 de
  cinco dígitos** por tributo y mes.
- Los **tenedores de libros** pueden consultar el vector de sus contribuyentes asociados desde el mismo
  portal.
- **Formato disponible: solo PDF.** No hay CSV, Excel, JSON ni API pública. La sección Descargas publica los
  modelos (DJ-08 en Excel/PDF, Registro de Ingresos y Gastos en Excel), **no** un export del vector.

Fuentes: `onat.gob.cu` portada y servicio *Vector Fiscal*; FAQ "¿Cuáles son los SERVICIOS PARA
CONTRIBUYENTES?" y "¿Cómo me registro en el Portal Tributario?"; noticia 2026-09-30 "Portal Tributario";
noticia de vencimiento de Transporte Terrestre (2026-09-22), que describe el uso del RC-04A en Transfermóvil.

> **Limitación de la evidencia:** no existe una muestra pública de un vector fiscal real; el PDF solo se
> obtiene con credenciales. Los campos de §3.2 son la intersección documentada de lo que la ONAT declara que
> contiene, no una copia de un documento concreto.

### 3.2 Contenido que hay que poder representar

**Identificación**
- NIT (para persona natural coincide con el carné de identidad)
- Nombre y apellidos
- Domicilio fiscal (y legal si difiere)
- Municipio y provincia
- Código de barras RC-05 (16 dígitos)
- Actividad(es) con su código de nomenclador
- Fecha de emisión / vigencia del vector

**Obligaciones (una fila por tributo)**
- Código de tributo (3–6 dígitos: `011402`, `051012`, `061032`, `081013`, `082013`, `073012`, `090012`, …)
- Descripción
- Periodicidad (mensual / trimestral / anual / único)
- Forma de cálculo: porcentaje sobre ingresos, porcentaje sobre salarios, cuota fija, o importe libre
- Tasa o cuota, si el vector la fija
- Exención o suspensión, si aplica
- Código RC-04 de 5 dígitos para el pago
- Vencimiento (día y mes)
- Vigencia desde / hasta

### 3.3 Vías de carga evaluadas

| Vía | Viabilidad | Por qué |
|---|---|---|
| **A. Captura manual asistida desde el PDF/papel** | ✅ Recomendada | Es la única fuente real. El formulario replica el RC-04A: identificación + tabla de obligaciones. Una sola vez por contribuyente y se actualiza cuando cambie la actividad. |
| **B. Plantilla propia (CSV/JSON) que el Owner llena** | ✅ Complemento de A | Útil para tenedores de libros con muchos contribuyentes. La plantilla la definimos nosotros; ONAT no la emite. |
| **C. Descarga automática desde el portal** | ❌ Descartada | Requiere custodiar NIT + contraseña de cada contribuyente, no hay API, el documento es PDF y el portal es de terceros. Riesgo legal y de credenciales desproporcionado. |
| **D. Parsear el PDF del vector** | ❌ Descartada por ahora | No hay librería de extracción instalada, el layout no es un contrato estable y un cambio de plantilla rompe la carga en silencio. |

### 3.4 Modelo de datos propuesto (P1)

Separar **lo que la ONAT declara** (el vector) de **lo que nosotros calculamos**:

```ts
interface OnatVector {
  readonly version: 1;
  readonly obtenidoEl: string;          // ISO
  readonly fuente: 'manual' | 'plantilla' | 'oficina';
  readonly contribuyente: {
    readonly nit: string;
    readonly nombre: string;
    readonly domicilioFiscal: string;
    readonly domicilioLegal?: string;
    readonly municipio: string;
    readonly provincia: string;
    readonly rc05: string;              // 16 dígitos, opcional
  };
  readonly actividades: readonly { codigo: string; nombre: string }[];
  readonly obligaciones: readonly OnatObligacion[];
}

interface OnatObligacion {
  readonly codigo: string;              // nomenclador ONAT
  readonly descripcion: string;
  readonly periodicidad: 'mensual' | 'trimestral' | 'anual' | 'unico';
  readonly base: 'ingresos' | 'salarios' | 'fija' | 'libre';
  readonly tasa?: number;               // 0.10, 0.05, …
  readonly cuotaFija?: number;          // CUP
  readonly exenta?: boolean;
  readonly rc04?: string;               // 5 dígitos
  readonly vence: { readonly mes: number; readonly dia: number };
  readonly vigenteDesde: string;
  readonly vigenteHasta?: string;
}
```

Consecuencia de diseño: el vector pasa a ser **la fuente que decide qué calculadoras se aplican**. Hoy la
pantalla suma siempre los mismos tres tributos sin preguntar; con el vector, un contribuyente sin ventas y
servicios, o con una cuota fija, deja de ver cálculos que no le corresponden.

### 3.5 Corrección (2026-10-27): no se carga el vector, se configura su contenido imprescindible

El Owner corrigió el enfoque: **no se trata de transcribir el documento ni de "cargar el vector"**, sino de
tener un **formulario de configuración con los valores necesarios e imprescindibles** para que el sistema
sepa qué obligaciones tiene ese contribuyente. La pantalla `Configuraciones` deja de ser identificación y
pasa a ser el vector configurado.

**Campos imprescindibles del formulario** (todos derivados de `docs/vector-fiscal/README.md`):

*Identificación (ya existe)*
- Nombre, NIT, domicilio fiscal, domicilio legal, municipio, provincia
- Actividades con su código de nomenclador

*Régimen y condiciones*
- Régimen general (el simplificado no aplica a TCP: Res. 246/2023)
- ¿Sujeto al 10 % de ventas? Excluye comisiones de agente de telecomunicaciones y de seguros (Res. 246/2023 art. 18.2)
- Obligación de contabilidad: ingresos del año anterior ≥ 100.000 CUP o actividad listada en el art. 58
- Fecha de inscripción / baja / reinscripción (los meses de baja y reinscripción no pagan cuota, Ley 113 art. 56)

*Obligaciones: interruptor por tributo, con su parámetro*
- Ventas o Servicios 10 % — `011402`
- Cuota mensual 5 % sobre lo que exceda 3.260 CUP — `051012`
- Fuerza de Trabajo 5 % — `061032` — requiere la base de salarios del mes
- Contribución a la Seguridad Social 14 % (12,5 aporte propio + 1,5 retenido) — `081013`
- Contribución Especial a la Seguridad Social 20 % — `082013`
- Sellos `073012`, Anuncios `090012`, Contribución de zonas, Arrendamientos a entidades, Exoneración por reparaciones — importe fijo o porcentaje declarado
- Patrimoniales fuera del Registro: Transporte Terrestre `0710622` y Embarcaciones `0710522`, con su cuantía anual

*Situaciones que cambian el cálculo*
- Suspensión temporal acreditada (rango de fechas): no se paga la cuota
- Exención por catástrofe o epidemia: 1 a 3 meses, o reducción de hasta 50 %
- Reducción de hasta 35 % en zonas rurales de difícil acceso (Res. 246/2023 arts. 14 y 16)
- Bonificaciones: 5 % pronto pago (hasta el 28 de febrero) y 3 % por pago electrónico

Lo que **no** se le pide al usuario: las tasas legales (10 %, 5 %, 14 %, 20 %, escala de 10 tramos, mínimo
exento 39.120). Van precargadas como referencia legal; el formulario solo pregunta **qué aplica** y **cuál es
la base o el importe fijo**.

### 3.5.1 ¿Los `.md` alcanzan para llenar ese formulario?

Sí para el universo TCP, no como catálogo exhaustivo del sistema tributario. `docs/vector-fiscal/README.md`
cubre el régimen completo del TCP: los 6 tributos mensuales, la liquidación anual, la escala, las
bonificaciones, el mínimo exento, la cuota, la obligación de contabilidad y los códigos del Registro.

Huecos concretos que el formulario necesitaría y que **no** están en esos `.md`:

1. **Códigos RC-04 de 5 dígitos** por tributo y mes (solo se documentan dos, en la noticia de Transporte Terrestre del portal, no en el repo).
2. **Día exacto de vencimiento mensual** por tributo: el README fija 28 de febrero, 30 de abril y 30 de septiembre (agropecuario), pero no el día de pago mensual.
3. **Cuándo aplica CESS 20 % (`082013`) y cuándo Seguridad Social 14 % (`081013`)**: la hoja `TRIBUTOS` del Registro tiene ambas columnas y el README no aclara si son alternativas o acumulables por actividad.
4. **Contribución Especial a la Seguridad Social agropecuaria `081043`** (Res. 32/2024, publicada por la ONAT en septiembre de 2026): no está en el repo.
5. **"Otros tributos" y "otros gastos autorizados por el MFP"**: aparecen como columna 9 y 14 sin catálogo.
6. **Un vector fiscal real**: el propio README lo deja como pendiente; sin él no se puede confirmar la forma exacta de cada fila.

Ninguno de esos huecos impide construir el formulario; sí impiden prometer que el cálculo cubre "todo lo que
puede tener un vector".

### 3.6 Formato de carga masiva (CSV)

La ONAT **no emite CSV**. Cualquier CSV es un contrato nuestro, para que el Owner o un tenedor de libros
cargue las obligaciones sin teclearlas una por una. El CSV es el formato de **intercambio**; el modelo
persistido sigue siendo el objeto anidado de §3.4.

**Un solo archivo, una fila por obligación.** La identificación del contribuyente ya vive en
`Configuraciones`, así que el CSV solo aporta obligaciones y valida que el NIT coincida con el configurado.
Separador `;` y **UTF-8 con BOM**: Excel en español abre bien las tildes y no reinterpreta la coma decimal.

| Columna | Obligatoria | Valores admitidos | Nota |
|---|---|---|---|
| `nit` | sí | texto | Debe coincidir con el NIT configurado; si no, se rechaza el archivo |
| `actividad_codigo` | no | texto | Vacío = aplica a todas las actividades |
| `tributo_codigo` | sí | `011402`, `051012`, `061032`, `081013`, `082013`, `073012`, `090012`, `0710622`, `0710522`, … | Código desconocido = fila rechazada |
| `tributo_nombre` | no | texto | Solo informativo; el nombre canónico sale del catálogo |
| `periodicidad` | sí | `mensual` \| `trimestral` \| `anual` \| `unico` | |
| `base` | sí | `ingresos` \| `salarios` \| `fija` \| `libre` | Decide qué calculadora aplica |
| `tasa` | condicional | decimal con coma (`0,10`) | Solo con base `ingresos` o `salarios`. **Vacío = tasa legal por defecto** |
| `cuota_fija` | condicional | decimal | Solo con base `fija` |
| `exenta` | sí | `si` \| `no` | |
| `rc04` | no | 5 dígitos | Hoy es un hueco documental (§3.5.1) |
| `vence_mes` | no | 1–12 | Ídem: el día mensual no está documentado |
| `vence_dia` | no | 1–31 | |
| `vigente_desde` | sí | `AAAA-MM-DD` | |
| `vigente_hasta` | no | `AAAA-MM-DD` | Vacío = vigente indefinidamente |
| `notas` | no | texto | |

Ejemplo (dos obligaciones del mismo contribuyente):

```csv
nit;actividad_codigo;tributo_codigo;tributo_nombre;periodicidad;base;tasa;cuota_fija;exenta;rc04;vence_mes;vence_dia;vigente_desde;vigente_hasta;notas
90010112345;9312;011402;Impuesto sobre Ventas o Servicios;mensual;ingresos;0,10;;no;;;;2026-01-01;;
90010112345;9312;061032;Fuerza de Trabajo;mensual;salarios;0,05;;no;;;;2026-01-01;;
```

**Reglas del importador**

1. Se valida fila por fila y se informa la línea exacta del error; nunca se importa a medias en silencio.
2. Clave de deduplicación: `actividad_codigo + tributo_codigo + vigente_desde`. Un duplicado se rechaza.
3. Si `tasa` viene vacía se aplica la tasa legal del código; si viene con valor distinto, se guarda como
   override con su fecha, para que quede rastro de que no es el valor de la ley.
4. El CSV **nunca reescribe vigencias pasadas**: una obligación nueva con `vigente_desde` anterior a una ya
   cargada exige cerrar la anterior con `vigente_hasta`.
5. Un archivo sin filas válidas no modifica nada.

**¿Y un JSON en vez de CSV?** Como formato de intercambio, el CSV gana porque se edita en Excel. El JSON
anidado (§3.4) se reserva para la persistencia y para un futuro export/import entre instalaciones.

### 3.6.2 Corregido con vectores reales (2026-10-28) — sustituye la tabla anterior

Hay **tres vectores fiscales reales** en `docs/vector-fiscal/md/`:
`ejemplo-vector-fiscal.md` (2021), `vector-fiscal-2025.md` y `vector-fiscal-2026.md`. Los tres tienen capa de texto.

**El documento tiene tres cosas distintas y no se deben mezclar en una sola tabla:**

| Parte | Naturaleza | Cómo se carga |
|---|---|---|
| Identidad (NIT, nombre, municipio, RC-05, año) | Clave-valor, 6 campos | Formulario `Configuraciones`, ya existe |
| Actividades (1–2 filas: código + nombre) | Lista corta | Formulario `Configuraciones` |
| **Tabla de obligaciones** | Tabla real, 5 columnas, 29 filas | **CSV** |
| Reglas por tributo (tasas, deducciones, bonificaciones) | Texto legal, no dato del contribuyente | Catálogo en código, **no se importa** |

Por eso la tabla del documento son **5 columnas**. Al CSV se le añaden las dos que hacen falta para
calcular, porque el vector explica el porcentaje de cada tributo:

| Columna | Obligatoria | Ejemplo 2026 | Nota |
|---|---|---|---|
| `periodo` | sí | `2026-01`, `2026-Q1`, `2026-A` | Derivado del texto del período |
| `vence` | sí | `2026-02-20` | Viene en el documento, ya con el corrimiento a día hábil |
| `codigo` | sí | `0114022` | 7 dígitos |
| `importe` | no | `1200.00` | **Si viene, manda**: es el caso de los fijos (seguridad social) |
| `rc04a` | sí | `30016` | 5 dígitos; en 2025 venía como `100 - 15` |
| `porcentaje` | no | `10` | En por ciento (`10` = 10 %). Obligatorio si no hay importe |
| `base` | no | `ingresos` | `ingresos`, `salarios` o `fija`. Obligatorio si hay porcentaje |
| `pagado` | no | `no` | Marca manual del Owner; al importar se conserva si viene |

```csv
periodo;vence;codigo;importe;rc04a;porcentaje;base
2026-01;2026-02-20;0114022;;30016;10;ingresos
2026-01;2026-02-20;0510122;;60046;5;ingresos
2026-Q1;2026-04-20;0820132;1200.00;00206;;
2026-A;2027-04-30;0530222;;10106;;
```

**Reglas del archivo:**

1. **Si trae importe, ese es el valor y no se calcula** (seguridad social y demás fijos).
2. **Si no trae importe, debe traer porcentaje y base** para poder calcularlo.
3. **Si no trae ninguno de los dos**, la obligación existe pero queda pendiente de declarar. Es el caso del
   `0530222`: el vector lo trae sin importe y sin porcentaje.
4. **El mismo tributo no puede declarar dos porcentajes distintos** en el mismo archivo.
5. **No se repite la identidad en cada fila.** El NIT no va en el CSV: sale de la sesión y del formulario.
6. Los códigos son de **7 dígitos** (`0114022`), no de 6.
7. El **RC-04A** es el código de 5 dígitos de la segunda columna de la tabla, tal como lo explica el
   documento de 2026.

**Huecos que esto cierra:** forma de la tabla, código RC-04A, vencimiento, importe fijo de la CESS y el
porcentaje por tributo. **Siguen abiertos:** cuándo aparece `081013` (no está en ningún vector), la
contribución agropecuaria `081043` y el catálogo de "otros tributos".

### 3.6.3 Decisiones del Owner (2026-10-28)

1. **Configuración por año.** El formulario se llena de nuevo en cada ejercicio: puede haber más o menos
   actividades y más o menos tributos. Nada se hereda del año anterior.
2. **El CSV reemplaza todo** el contenido de ese año. No hay fusión ni deduplicación contra lo anterior.
3. **Cada tributo lleva su porcentaje.** El vector es la fuente: el texto del propio documento dice el %
   de cada tributo. El cálculo es `base × %`. El porcentaje es dato de configuración, no una constante
   escondida en el código.
4. **El pago es manual.** El Owner paga por fuera y marca la obligación como pagada. No hay integración
   con el portal ni consulta de pagos.
5. **El CSV define qué tributos aplican.** Se eliminan los interruptores por tributo y cualquier catálogo
   especulativo.
6. **Salarios = total del mes.** Varios gastos de tipo `Salario` en un mes se suman; ese total es la base
   del tributo de fuerza de trabajo.

**Consecuencia sobre el modelo:** el CSV sigue siendo de 5 columnas (la tabla), y el porcentaje de cada
tributo vive en la configuración del año, junto al tributo, no en el CSV. Son dos piezas distintas del
mismo vector.

**Pendiente conocido:** si algún año aparece el `0520522` (retención al trabajador), un porcentaje plano no
reproduce la tabla progresiva por trabajador. Queda anotado; en los tres vectores reales ese tributo no
aparece.

### 3.6.1 Qué del corpus hace falta para esto

No todo. El material de `docs/vector-fiscal/` se usa en tres niveles:

| Nivel | Qué se toma | Dónde está |
|---|---|---|
| **Cargar** (este punto) | Códigos de tributo, periodicidad, base, tasa legal, vencimientos | `README.md` §3 y §5 |
| **Calcular** | 10 %, 5 % sobre 3.260, 14 % (12,5 + 1,5), 20 %, 5 % de fuerza de trabajo, mínimo exento 39.120, escala de 10 tramos, las tres bonificaciones | `README.md` §4, `md/ley181-presupuesto-2026.md`, `md/bonificaciones-dj08.md` |
| **Excluir por ahora** | Contabilidad y estados financieros, Decreto-Ley 90 completo, articulado de la Ley 113 fuera del TCP | `md/contabilidad/`, `md/decreto-ley-90-tcp-concordado-2026.md`, `md/ley113-concordada-2026.md` |

Los dos primeros niveles son unas 40 páginas de lectura útil. El tercero solo entra cuando se ataquen el
Registro (P2), los avisos de baja/suspensión (P3) y la nómina (P4).

### 3.7 Decisiones abiertas para el Owner

1. ¿Los contribuyentes que se van a cargar son **TCP** (RC-04A, persona natural) o también **MIPYME/CNA**
   (otro régimen, sin RC-04A)? Cambia el modelo.
2. ¿Un contribuyente puede tener **varias actividades** con vectores distintos, o una sola?
3. ¿La carga la hace el propio Owner o un **tenedor de libros** por varios contribuyentes?
4. ¿Hace falta conservar **histórico** de versiones del vector (un cambio de actividad modifica las
   obligaciones de los meses siguientes) o basta el vector vigente?

---

## 4. Orden de trabajo propuesto

1. **P1** — Vector Fiscal: modelo, carga manual/plantilla, y que las calculadoras se deriven de él.
2. **P2** — Registro de Ingresos y Gastos: hojas oficiales + export Excel y PDF.
3. **P3** — Calendario fiscal y avisos de vencimiento, alimentados por las obligaciones del vector.
4. **P4** — Nómina y activos fijos.

P2 y P3 dependen de P1: sin saber qué obligaciones tiene el contribuyente, no hay registro que cuadrar ni
fecha que avisar.
