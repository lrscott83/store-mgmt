# Vector fiscal y tributos del Trabajador por Cuenta Propia (TCP) — Cuba

Documento de referencia construido a partir de fuentes oficiales descargadas de
**https://www.onat.gob.cu** (portal de la Oficina Nacional de Administración Tributaria).

- **Fecha de la investigación:** 26 de octubre de 2026 (última actualización del portal en esa fecha).
- **Ejercicio fiscal de referencia:** 2026 (declaración de los ingresos de 2025).
- **Recursos:** originales en `pdf/` y `modelos/`, texto de trabajo en `md/`. Ver [Inventario](#8-inventario-de-recursos).

> **Advertencia normativa.** La Ley del Presupuesto del Estado se aprueba cada año y fija la
> escala progresiva del Impuesto sobre los Ingresos Personales, las bonificaciones y los plazos
> del ejercicio. Todo lo marcado como "del año" caduca el 31 de diciembre. Verificar siempre
> contra la Ley del Presupuesto vigente antes de implementar reglas de cálculo.

---

## 1. Marco legal aplicable al TCP

| Norma | Identificador / publicación | Qué regula | Texto en este repo |
|---|---|---|---|
| **Ley 113/2012** "Del Sistema Tributario" | Concordada: `GOC-2026-19-ES1`, 12/01/2026 | Arts. 19–67: Impuesto sobre los Ingresos Personales (ISP) y el régimen tributario del TCP | [md](md/ley113-concordada-2026.md) |
| **Decreto 308/2012** | — | Reglamento de las normas generales y los procedimientos tributarios | [md](md/ley113-concordada-2026.md) (mismo tomo) |
| **Decreto-Ley 107/2025** | Gaceta Ordinaria 97, 23/12/2025 | Modifica la Ley 113 (incluye el NIT como código único) | citado en [md](md/ley113-concordada-2026.md) |
| **Resolución 162/2025 (ONAT)** | Gaceta Ordinaria 97, 03/12/2025 | Uso obligatorio del NIT para personas naturales y jurídicas | no descargada |
| **Decreto-Ley 90/2024** "Sobre el ejercicio del trabajo por cuenta propia" | Concordado: `GOC-2026-498-ES12`, 07/09/2026 | Ejercicio de la actividad, autorizaciones, suspensión y baja | [md](md/decreto-ley-90-tcp-concordado-2026.md) |
| **Ley 181/2025** "Del Presupuesto del Estado para 2026" | `GOC-2025-O99`, 29/12/2025 | Escala progresiva del ISP, bonificaciones, plazos y cuantías del ejercicio | [md](md/ley181-presupuesto-2026.md) |
| **Resolución 246/2023 (MFP)** | `GOC-2023-916-EX75`, 06/11/2023 | Modifica los tributos del TCP: ventas 10 %, cuota 5 %, cuenta bancaria fiscal | [md](md/resolucion-246-2023-tributos-tcp.md) |
| **Resolución 345/2021 (MFP)** | 14/08/2021 | Régimen General de Tributación del TCP (modificada por la 246/2023) | no descargada |
| **Resolución 346/2021 (MFP)** | 14/08/2021 | Normas específicas de contabilidad para el TCP | no descargada |
| **Resolución 347/2021 (MFP)** | 14/08/2021 | Obligación de operar una **cuenta bancaria fiscal** | no descargada |
| **Res. 494/2016, 498/2016, 407/2019, 166/2021 (MFP)** | — | Paquete de contabilidad y estados financieros que la ONAT publica para TCP | [md](md/contabilidad/) |

### Puntos clave del régimen

- **Todos los TCP tributan por el Régimen General** (Res. 246/2023, art. 3 de la Res. 345/2021).
  Quedan fuera los trabajadores contratados por cualquier actor económico no estatal y el
  pescador comercial. El **Régimen Simplificado** (Ley 113, arts. 60–66) sigue en la ley pero
  no se aplica a los TCP bajo este régimen.
- Presentan **Declaración Jurada anual** los TCP inscritos en el Registro de Contribuyentes
  **antes del 1.º de octubre** del año que se liquida (Res. 246/2023, art. 4).
- El **NIT** es obligatorio en todo acto económico y coincide con el carné de identidad para
  las personas naturales.

---

## 2. Qué es el "vector fiscal"

Es el documento **personalizado** que la ONAT emite a cada contribuyente. No es una plantilla
genérica: se genera por NIT y lista, obligación por obligación:

| Campo | Contenido |
|---|---|
| Tributo | Nombre del impuesto, tasa o contribución |
| Código | Código del tributo (p. ej. `011402`) |
| Base / cuantía | Sobre qué se calcula o el importe fijo |
| Vencimiento | Fecha límite de pago del período |
| Código de barras | Referencia con la que se paga en banco o por Transfermóvil |

**Dónde se obtiene**

1. **Portal Tributario** → servicio "Vector Fiscal" (requiere NIT + contraseña).
2. **Oficina municipal de la ONAT** del domicilio fiscal.
3. En papel, como **RC-04A**, para pagar en agencia bancaria o por Transfermóvil.

> **Actualización (2026-10-28):** el repositorio **sí contiene tres ejemplares reales**, transcritos en
> `md/ejemplo-vector-fiscal.md` (2021), `md/vector-fiscal-2025.md` y `md/vector-fiscal-2026.md`.
> Los tres tienen capa de texto. Con ellos queda fijada la forma de la tabla: 5 columnas
> (período, vencimiento, código de tributo, importe, código RC-04A), con el importe vacío en los
> tributos variables y el código RC-04A de 5 dígitos como referencia de pago.

---

## 3. Registro de Ingresos y Gastos (el control diario)

Modelo oficial: **"Registro de Ingresos y Gastos para TCP 2026"** (`modelos/registro-ingresos-gastos-tcp-2026.xlsx`).
Es el soporte que respalda la Declaración Jurada. Tiene cuatro hojas:

### Hoja `GENERALES`
Identificación: nombre y apellidos, **NIT**, domicilio fiscal (lugar donde desarrolla la
actividad), domicilio legal (según carné), municipio, provincia, **actividad y código**, año.

### Hoja `INGRESOS`
Una fila por operación. Columnas: `D` (día del mes) + importe, repetidas para los 12 meses.
Al cierre de cada mes:

- se suma la columna del mes en la fila **`Total`**;
- se pasa raya anulando las filas no utilizadas;
- el acumulado va a **`Total de Ingresos Anuales`**.

### Hoja `GASTOS`
Idéntica estructura que `INGRESOS`.

### Hoja `TRIBUTOS`
Una fila por mes y quince columnas:

| Col | Concepto | Código |
|---|---|---|
| 1 | Impuesto sobre Ventas o Servicios (10 %) | `011402` |
| 2 | Impuesto por la Utilización de la Fuerza de Trabajo | `061032` |
| 3 | Impuesto sobre Documentos / sellos | `073012` |
| 4 | Tasa por Radicación de Anuncios / cartel | `090012` |
| 5 | Contribución Especial a la Seguridad Social (20 %) | `082013` |
| 6 | Contribución a la Seguridad Social (14 %) | `081013` |
| 7 | Aporte propio (12,5 %) | — |
| 8 | Retenido para subsidios (1,5 %) | — |
| 9 | Otros tributos | — |
| 10 | **Subtotal** = cols. 1–6 + 9 | — |
| 11 | Contribución para restauración y preservación de zonas | — |
| 12 | Arrendamiento de bienes a entidades estatales | — |
| 13 | Importes exonerados por asumir reparaciones | — |
| 14 | Otros gastos autorizados por el MFP | — |
| 15 | **Cuota mensual 5 %** a cuenta del ISP | `051012` |

La columna 6 (14 %) es la suma de las columnas 7 y 8: **12,5 % aportado + 1,5 % retenido**.

### Reglas de llenado (fijadas por el propio modelo)

1. Se registra **en CUP**. Ingresos y gastos en MLC u otra divisa convertible se anotan en pesos
   a la **tasa de cambio vigente del BCC** (flotante) del día de la operación.
2. Puede llevarse en **formato digital**, pero debe conservarse **limpio, actualizado, a tinta y
   en letra de molde legible** si es en papel.
3. Se conserva **cinco (5) años** desde el cierre del año fiscal, junto con facturas, vales y
   demás documentos que justifiquen las deducciones.
4. **Sin borrones ni tachaduras.** Al equivocarse: raya la fila, escribe `E/` (error) junto al
   importe equivocado y `C/` (corrección) en la fila siguiente con el importe correcto.
5. Si no hay ingresos o gastos, **no se hacen anotaciones**.
6. Las columnas 11, 12 y 13 **no** se incluyen en la hoja `GASTOS`, porque se deducen
   directamente de la base imponible en la Declaración Jurada.
7. No se incluyen en `TRIBUTOS` los impuestos **patrimoniales** (Transporte Terrestre y
   Embarcaciones), ni recargos por mora, ni multas.

---

## 4. Cómo se calculan los tributos

### 4.1 Mensual

| Tributo | Cálculo | Código |
|---|---|---|
| Impuesto sobre Ventas o Servicios | **10 %** sobre los ingresos mensuales obtenidos | `011402` |
| Cuota a cuenta del ISP | **5 %** sobre el ingreso mensual que **exceda 3.260 CUP** | `051012` |

- El umbral de 3.260 CUP equivale al mínimo exento anual (39.120) dividido entre 12.
- **No** están sujetos al 10 % los ingresos por comisiones de agente de telecomunicaciones y
  agente de seguros (Res. 246/2023, art. 18.2).
- **No se paga** la cuota del **mes en que se produce la reinscripción o la baja** (Ley 113, art. 56),
  ni durante una suspensión temporal acreditada ante la ONAT.
- Por situaciones climatológicas, epidemiológicas u otras declaradas por autoridad: exención de
  1 a 3 meses, o reducción de hasta el 50 % si la afectación es parcial. Los consejos municipales
  pueden reducir hasta el 35 % en zonas rurales de difícil acceso (Res. 246/2023, arts. 14 y 16).

### 4.2 Anual — Declaración Jurada DJ-08

Presentación **antes del 30 de abril** del año siguiente (el proceso del ejercicio 2025 abrió el
5 de enero y cerró el 30 de abril de 2026). Si hay cese de actividad: **15 días naturales**
desde la fecha de baja.

**Determinación de la base imponible** (Sección B del modelo):

```
Ingresos obtenidos
− mínimo exento anual                    39.120,00 CUP
− gastos deducibles de la actividad
− tributos pagados asociados a la actividad
− contribución para restauración y preservación de zonas
− arrendamiento de bienes a entidades estatales autorizadas
− importes exonerados por asumir reparaciones
− otros descuentos autorizados
− bonificaciones aprobadas por el MFP
= BASE IMPONIBLE  (equivale al ingreso neto)
```

**Gastos deducibles:** se deduce el **100 %** de los gastos incurridos siempre que se justifique
documentalmente el **80 %** de ellos (Ley 113, art. 21 modificado). Todos los gastos, con
justificante o no, deben estar anotados en el Registro. No son deducibles multas,
indemnizaciones por infracción ni responsabilidad civil derivada.

**Escala progresiva vigente** — Ley 181/2025, art. 49.1, aplicable a los ingresos de **2025**:

| Ingresos imponibles anuales (CUP) | Tipo |
|---|---|
| Hasta 25.000,00 | 5 % |
| Exceso de 25.000,00 hasta 50.000,00 | 10 % |
| Exceso de 50.000,00 hasta 100.000,00 | 15 % |
| Exceso de 100.000,00 hasta 200.000,00 | 20 % |
| Exceso de 200.000,00 hasta 350.000,00 | 25 % |
| Exceso de 350.000,00 hasta 500.000,00 | 30 % |
| Exceso de 500.000,00 hasta 650.000,00 | 35 % |
| Exceso de 650.000,00 hasta 800.000,00 | 40 % |
| Exceso de 800.000,00 hasta 1.000.000,00 | 45 % |
| Exceso de 1.000.000,00 | 50 % |

**Liquidación** (Sección C):

```
Impuesto según escala
− cuotas mensuales pagadas (5 %)
− otros pagos anticipados o créditos del ejercicio anterior
− retenciones
− bonificaciones autorizadas
= Impuesto a pagar   (si el resultado es negativo, para TCP se iguala a cero)
```

**Total a pagar** (Sección E): impuesto a pagar − bonificación por pronto pago − impuesto ya
pagado en DJ anteriores del mismo año + recargo por mora.

### 4.3 Regla de oro: la cuota puede ser definitiva

Si la suma de las cuotas mensuales pagadas **supera** el impuesto determinado en la DJ, esa suma
se considera **definitiva** y no hay diferencia a pagar (Ley 113, art. 52). En la práctica, para
muchos TCP la declaración anual no genera pago adicional.

### 4.4 Bonificaciones

| Bonificación | Condición | Norma |
|---|---|---|
| **5 %** del importe a pagar | Declarar y pagar hasta el **28 de febrero** | Ley 113, art. 39 / Ley 181/2025, art. 52.1 |
| **3 %** del importe | Pagar por canales electrónicos | Portal ONAT |
| **3 %** adicional | En la DJ, fila 19 (bonificación sobre tributos pagados por vía electrónica, excluye la cuota `051012`) | Instructivo DJ-08 |

### 4.5 Ejemplo ilustrativo (cálculo propio, **no** es un caso oficial)

Ingresos anuales 300.000 CUP · gastos 150.000 CUP · tributos pagados 10.000 CUP.

```
Base imponible = 300.000 − 39.120 − 150.000 − 10.000 = 100.880
Impuesto       = 25.000×5% + 25.000×10% + 50.000×15% + 880×20%
               = 1.250 + 2.500 + 7.500 + 176 = 11.426 CUP
Cuotas 5 % pagadas en el año ≈ 5 % × (300.000 − 39.120) = 13.044 CUP
→ 13.044 > 11.426 ⇒ la suma de cuotas es definitiva: no hay diferencia a pagar
```

---

## 5. Cómo se paga

| Vía | Detalle |
|---|---|
| **Agencia bancaria** | Con el **vector fiscal del año que se declara**, o con el modelo **CR-09** |
| **Transfermóvil / Telebanca / Banca Remota / Virtual Bandec** | Descuento del **3 %** del importe a pagar |
| **Portal Tributario** | Consulta de pagos y descarga del vector fiscal |

Reglas prácticas:

- **El modelo de la Declaración Jurada nunca se entrega en el banco.** Se entrega un ejemplar en
  la ONAT (buzón) y el contribuyente guarda el otro **5 años**.
- Si la DJ **no da importe a pagar**, se deposita en el buzón de la ONAT del municipio donde está
  inscrito el contribuyente (o en cualquier otro).
- Los pagos en exceso se compensan con obligaciones futuras o se devuelven según la capacidad
  del presupuesto municipal (Res. 246/2023, Disposición Transitoria Única).

### Códigos de tributo

| Código | Tributo |
|---|---|
| `011402` | Impuesto sobre Ventas o Servicios (10 %) |
| `061032` | Impuesto por la Utilización de la Fuerza de Trabajo |
| `073012` | Impuesto sobre Documentos / sellos del timbre |
| `090012` | Tasa por Radicación de Anuncios y Propaganda Comercial |
| `082013` | Contribución Especial a la Seguridad Social (20 %) |
| `081013` | Contribución a la Seguridad Social (14 %) |
| `051012` | Cuota mensual a cuenta del ISP (5 %) |
| `053022-2` | ISP — liquidación adicional (DJ-08) · código de banco `90105` |
| `0710622` | Impuesto sobre el Transporte Terrestre (patrimonial) |
| `0710522` | Impuesto sobre la Propiedad o Posesión de Embarcaciones (patrimonial) |

---

## 6. Cuándo es obligatoria la contabilidad

Ley 113, art. 58. Están obligados a llevar **sistema contable** (no solo el Registro):

1. TCP con ingresos anuales del año anterior **iguales o superiores a 100.000 CUP**;
2. con independencia de los ingresos, quienes ejerzan: elaborador-vendedor de alimentos y
   bebidas en **restaurantes (paladares)**, elaborador-vendedor a **domicilio**,
   elaborador-vendedor en **punto fijo (cafetería)**, **productor-vendedor de calzado** y
   **contratistas privados**; y las demás actividades que apruebe el MFP.

Si cambian las circunstancias del inciso 1, el TCP puede solicitar el cese de esa obligación a la
ONAT de su domicilio fiscal, que resuelve en un plazo máximo de 30 días naturales (art. 59).

---

## 7. Discrepancias y advertencias detectadas

1. **Escala del ISP — dos textos en circulación.**
   - La **Ley 113 concordada 2026** (art. 26.1) todavía muestra la escala vieja de 5 tramos
     (15 / 20 / 30 / 40 / 50 %) sobre tramos de 10.000 a 50.000 CUP.
   - La **Ley 181/2025** (art. 49.1) fija la escala de 10 tramos (5 % → 50 %) **para los ingresos
     de 2025**, y es la que implementa el **DJ-08 2026**.
   - **Prevalece la ley anual del presupuesto** para el ejercicio que se liquida. No usar el
     art. 26 de la Ley 113 como fuente de cálculo sin contrastarlo.
2. **Mínimo exento.** La Ley 113 de 2012 decía 10.000 CUP; el vigente es **39.120 CUP**
   (art. 22 modificado por el Decreto-Ley 21/2020).
3. **Resolución 346/2021 vs. paquete 494/2016.** La Res. 246/2023 cita la **346/2021** como norma
   específica de contabilidad del TCP, mientras la ONAT publica para TCP el paquete
   **494/2016 + 498/2016 + 407/2019 + 166/2021** (clasificador de cuentas y estados financieros,
   de alcance general y sin mención expresa al TCP). Ambos están incluidos en `pdf/` y `md/`;
   **no se ha verificado** cuál deroga a cuál. Confirmar con la oficina tributaria antes de
   automatizar un plan contable.

---

## 8. Inventario de recursos

Todos descargados de `onat.gob.cu` el 26/10/2026. Se conservan los **originales en `pdf/`** y la
**extracción a Markdown en `md/`** (misma estructura de nombres); el texto de trabajo es el `.md`.

```
docs/vector-fiscal/
├── README.md                                        (este documento)
├── md/                                              ← texto de consulta
│   ├── ley113-concordada-2026.md                   Ley 113 + Decreto 308 concordados (GOC-2026-19-ES1)
│   ├── ley181-presupuesto-2026.md                  Ley del Presupuesto 2026 (escala, plazos, bonificaciones)
│   ├── decreto-ley-90-tcp-concordado-2026.md       Decreto-Ley 90/2024 TCP, anotado y concordado (ES-12)
│   ├── resolucion-246-2023-tributos-tcp.md         Res. 246/2023 MFP: ventas 10 %, cuota 5 %, cuenta fiscal
│   ├── instructivo-dj08-2026.md                    Instructivo oficial de llenado de la DJ-08 (secciones A–I)
│   ├── bonificaciones-dj08.md                      transcripción manual de la infografía escaneada
│   ├── ejemplo-vector-fiscal.md                    vector fiscal real 2021 (10 tributos, 7 columnas)
│   ├── vector-fiscal-2025.md                       vector fiscal real 2025 (4 tributos, 29 obligaciones)
│   ├── vector-fiscal-2026.md                       vector fiscal real 2026 (4 tributos, 29 obligaciones)
│   └── contabilidad/
│       ├── resolucion-494-2016-contabilidad.md
│       ├── resolucion-498-2016-estados-financieros.md
│       ├── resolucion-407-2019-modifica-494-2016.md
│       └── resolucion-166-2021-modifica-474-2016.md
├── pdf/                                             ← originales, misma estructura
└── modelos/                                         ← planillas Excel oficiales (sin extracción)
    ├── registro-ingresos-gastos-tcp-2026.xlsx
    └── dj08-2026.xlsx
```

> La extracción se hizo con `markitdown` mediante el puente del proyecto
> `gaceta-cuba-tools/normas-extrartor/pdf_a_texto.py`. No hace OCR: los PDF escaneados
> (`bonificaciones-dj08.pdf`) quedan sin texto.

### Fuentes no descargadas (solo referencia)

- **Res. 345/2021, 346/2021 y 347/2021 (MFP):** conocidas por las cláusulas "POR CUANTO" de la
  Res. 246/2023, que las modifica. No se localizó el PDF en el portal.
- **Vector fiscal de ejemplo:** resuelto. Tres ejemplares reales (2021, 2025, 2026) transcritos en `md/`.
- **RC-04 / RC-04A / CR-09:** modelos de pago. El CR-09 está en Descargas (páginas 12 del portal).

---

## 9. Pendientes / preguntas abiertas

- [x] ~~Conseguir un **vector fiscal real** de un TCP (datos personales tapados) para fijar el
      modelo de datos.~~ Resuelto: 2021, 2025 y 2026 en `md/`.
- [ ] Confirmar con la ONAT la vigencia de la **Res. 346/2021** frente al paquete **494/2016**.
- [ ] Verificar la **escala del ejercicio 2026** (ingresos de 2026, a declarar en 2027) cuando se
      publique la Ley del Presupuesto 2027.
- [ ] Definir si esto se implementa como módulo de `store-mgmt` (React + backend) o queda como
      documentación de referencia.
