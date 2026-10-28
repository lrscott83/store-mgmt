# Ejemplo de vector fiscal — RC-04A, año 2021

> **Origen:** `pdf/Ejemplo-Vector-Fiscal.pdf` — 3 páginas, con capa de texto.
> Transcripción estructurada (no es la extracción cruda: el PDF desordena las columnas al extraer).
> **NIT y carné de identidad enmascarados**; el nombre ya venía como `XXXXXXXX` en el original.

---

## 1. Cabecera

| Campo | Valor |
|---|---|
| Título | `RC-04A Vector fiscal de persona natural` |
| NIT | `00•••••••23` |
| Carné de identidad | `71•••••••23` |
| Nombre y apellidos | `XXXXXXXX` (así en el original) |
| Municipio | `3507- San Antonio del Sur` |
| Código de barras del RC-05 (DPA, NIT) | `3828 - 3200 - 0312 - 7053` |
| Año | `2021` |

---

## 2. Tabla de obligaciones

Columnas del documento, en orden:

```
Período | Fecha límite de pago | Código tributo | Importe | Código barras | Pagado | Importe c/ recargo
```

Descomposición de una fila:

```
Trimestre enero - marzo: 20/Abr/210820132262.50002 - 01 267.75
                         └ fecha ─┘└código┘└importe┘└barras┘└recargo┘
```

`Importe c/ recargo` es el importe multiplicado por **1,02** (262,50 → 267,75). Solo aparece cuando el
importe está fijado.

| Período | Vence | Tributo | Importe | Barras | c/ recargo |
|---|---|---|---|---|---|
| Trimestre ene–mar | 20/Abr/21 | `0820132` | 262.50 | 002-01 | 267.75 |
| Trimestre abr–jun | 20/Jul/21 | `0820132` | 262.50 | 226-01 | 267.75 |
| Trimestre jul–sep | 20/Ago/21 | `0510522` | 20.00 | 148-51 | 20.40 |
| Julio | 20/Ago/21 | `0510522` | 20.00 | 148-51 | 20.40 |
| Agosto | 20/Sep/21 | `0510522` | 20.00 | 156-51 | 20.40 |
| Trimestre ago–oct | 20/Sep/21 | `0510522` | 20.00 | 156-51 | 20.40 |
| Agosto | 20/Sep/21 | `0730122` | 30.00 | 459-11 | 30.60 |
| Anual | 30/Sep/21 | `0710622` | — | 801-71 | — |
| Trimestre jul–sep | 20/Oct/21 | `0510522` | — | 148-51 | — |
| Septiembre | 20/Oct/21 | `0510522` | 20.00 | 164-51 | 20.40 |
| Julio | 20/Oct/21 | `0510522` | — | 148-51 | — |
| Trimestre sep–nov | 20/Oct/21 | `0510522` | 20.00 | 164-51 | 20.40 |
| Trimestre jul–sep | 20/Oct/21 | `0820132` | 262.50 | 250-01 | 267.75 |
| Anual | 01/Nov/21 | `0530102` | — | 502-51 | — |
| Octubre | 22/Nov/21 | `0114022` | — | 772-11 | — |
| Octubre | 22/Nov/21 | `0510122` | — | 072-41 | — |
| Noviembre | 20/Dic/21 | `0114022` | — | 780-11 | — |
| Noviembre | 20/Dic/21 | `0510122` | — | 080-41 | — |
| Trimestre oct–dic | 10/Ene/22 | `0900122` | — | 674-21 | — |
| Diciembre | 20/Ene/22 | `0114022` | — | 988-11 | — |
| Diciembre | 20/Ene/22 | `0510122` | — | 288-41 | — |
| Octubre | 20/Ene/22 | `0510522` | — | 172-51 | — |
| Trimestre oct–dic | 20/Ene/22 | `0510522` | — | 172-51 | — |
| Trimestre oct–dic | 20/Ene/22 | `0520522` | — | 375-01 | — |
| Trimestre oct–dic | 20/Ene/22 | `0610322` | — | 673-11 | — |
| Trimestre oct–dic | 20/Ene/22 | `0820132` | 262.50 | 474-01 | 267.75 |
| Anual | 02/May/22 | `0530122` | — | 000-81 | — |

---

## 3. Tributos (10)

```
Impuestos sobre Ventas y Servicios-Personas Naturales*                0114022-
TCP*                                                                  0510122-
Régimen simplificado - persona natural*                               0510522-
Impuesto sobre ingresos personales - Retención trabajadores por cuenta propia*  0520522-
Impuesto s/ ingresos personales sector cañero*                        0530102-
Impuesto sobre ingresos personales sector agropecuario*               0530122-
Impuesto por la utilización de fuerza de trabajo, personas naturales*  0610322-
Impuesto sobre el transporte terrestre*                               0710622-
Contribución especial de los trabajadores a la Seguridad Social*      0820132-
Tasa por radicacion de anuncio y propaganda comercial*                0900122-
```

Notas al pie de la página 2:

```
* 0530222 - Impuesto sobre Ingresos Personales Liquidación Adicional.
* 0710522 - Impuesto sobre Embarcaciones.
```

---

## 4. Reglas por tributo (texto del documento)

- **0114022**: aporta el **10 %** de los ingresos totales por ventas y/o servicios en el mes.
- **0510122**: aporta el **5 %** de los ingresos totales del mes. Hasta tres trabajadores contratados.
  Cuenta bancaria fiscal con saldo mínimo de 3.000,00. Puede solicitar el régimen simplificado si los
  ingresos del año anterior son inferiores a 200.000,00 y no tiene trabajadores contratados.
- **0510522**: aporta el **20 %** de los ingresos del trimestre, **después de deducir 3.260,00 de los
  ingresos de cada mes**.
- **0520522**: retiene y aporta mensualmente el ISP de los trabajadores contratados:

  | Ingresos mensuales | Tipo |
  |---|---|
  | Hasta 3.260,00 | Exento |
  | El exceso de 3.260,00 hasta 9.510,00 | 3 % |
  | El exceso de 9.510,00 | 5 % |

- **0530102**: bonificación del 5 % si paga en o antes del **30 de agosto**. Deduce el 100 % de gastos si
  justifica el 80 %. Mínimo exento anual 39.120,00.
- **0530122, 0530222**: bonificación del 5 % si paga en o antes del **28 de febrero**. Mismas deducciones.
- **0610322**: paga **trimestralmente el 5 %** del total de remuneraciones pagadas. El monto mínimo para el
  cálculo mensual es el salario medio de la provincia.
- **0710622**: bonificación del **20 %** si paga en o antes del 28 de febrero del año fiscal en curso.
- **0900122**: bonificación del **10 %** si paga de forma anticipada el total del año, dentro del primer mes
  del período.
- **0530222**: DJ y liquidación adicional hasta el **30 de abril**; bonificación del 5 % antes del 28 de febrero.
- **0710522**: se paga hasta el **30 de septiembre**.

## 5. Notas generales

- Recargo **del 2 %** si paga después de la fecha límite.
- **3 %** de descuento por canales electrónicos.
- Baja como TCP: DJ en 15 días naturales por los ingresos hasta la fecha de baja.
- Régimen simplificado: ingresos del año anterior inferiores a 200.000,00 y sin trabajadores contratados.
- Si se convierte en CNA o MIPYME sin comunicarlo, se mantienen las obligaciones como TCP y como socio.

---

## 6. Advertencias de uso

1. **Este vector es de 2021** y refleja reglas anteriores a la Resolución 246/2023. No sirve como fuente de
   tasas vigentes: en 2021 el `0510122` era el 5 % de los ingresos totales **sin umbral**, y el **régimen
   simplificado existía** (`0510522`, 20 % trimestral). Desde el 1.º de enero de 2023 no hay régimen
   simplificado y el `0510122` se calcula sobre el exceso de 3.260,00.
2. Es el único de los tres que trae la columna **`Importe c/ recargo`** y tributos patrimoniales y de
   anuncios.
3. Sirve, en cambio, para ver el **catálogo completo de códigos** y el formato de las filas con importe fijo.
