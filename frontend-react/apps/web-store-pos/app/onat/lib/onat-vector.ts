/**
 * Modelo, carga y persistencia del Vector Fiscal por año (S1–S9).
 *
 * Cada ejercicio se configura de cero: identidad, actividades y la agenda de
 * obligaciones que trae el CSV. El archivo es la fuente de qué tributos aplican y
 * con qué porcentaje; no hay catálogo especulativo.
 */

import type { OnatWriteResult } from './onat-storage';

export type OnatPeriodicidad = 'mensual' | 'trimestral' | 'anual';

/** Naturaleza del tributo: sobre qué se calcula o si es un importe declarado. */
export type OnatBase = 'ingresos' | 'salarios' | 'fija';

export const ONAT_BASES: readonly OnatBase[] = ['ingresos', 'salarios', 'fija'];

export interface OnatActividad {
  nombre: string;
  codigo: string;
}

export interface OnatIdentidad {
  nombre: string;
  nit: string;
  /** Código de barras del RC-05: 16 dígitos, sin guiones. */
  rc05: string;
  domicilioFiscal: string;
  domicilioLegal: string;
  municipio: string;
  provincia: string;
}

export interface OnatObligacion {
  /** `2026-01` mensual, `2026-Q1` trimestral, `2026-A` anual. */
  periodo: string;
  /** Fecha límite de pago en ISO `AAAA-MM-DD`, tal como la trae el vector. */
  vence: string;
  /** Código ONAT de 7 dígitos, tal como lo usa el vector (p. ej. `0114022`). */
  codigo: string;
  /**
   * Importe fijo tal como lo trae el vector. Si no es `null`, es el valor a pagar
   * y no se calcula nada: el documento manda.
   */
  importe: number | null;
  /** Tasa como fracción (`0.10` es 10 %). `null` cuando la fila trae importe. */
  porcentaje: number | null;
  /** Sobre qué se aplica el porcentaje. `fija` cuando la fila trae importe. */
  base: OnatBase;
  /** Código de pago de 5 dígitos (RC-04A). */
  rc04a: string;
  pagado: boolean;
}

/** Tributo derivado de la agenda: código, porcentaje y base, sin repetir períodos. */
export interface OnatTributo {
  codigo: string;
  porcentaje: number | null;
  base: OnatBase;
}

export interface OnatVector {
  ownerId: string;
  year: number;
  identidad: OnatIdentidad;
  actividades: OnatActividad[];
  obligaciones: OnatObligacion[];
}

export const ONAT_CSV_COLUMNS = [
  'periodo',
  'vence',
  'codigo',
  'importe',
  'rc04a',
  'porcentaje',
  'base',
  'pagado',
] as const;

export interface OnatCsvError {
  /** Número de línea del archivo, 1-based. La cabecera es la línea 1. */
  linea: number;
  motivo: string;
}

export interface OnatCsvParseResult {
  ok: boolean;
  obligaciones: OnatObligacion[];
  errores: OnatCsvError[];
}

const SEPARADOR = ';';
const CODIGO_TRIBUTO = /^\d{7}$/;
const RC04 = /^\d{5}$/;
const PERIODO_MENSUAL = /^\d{4}-(0[1-9]|1[0-2])$/;
const PERIODO_TRIMESTRAL = /^\d{4}-Q[1-4]$/;
const PERIODO_ANUAL = /^\d{4}-A$/;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function limpiarBom(texto: string): string {
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

function normalizarCabecera(valor: string): string {
  return valor.trim().toLowerCase();
}

/** Acepta `1200.00` y `1200,00`; devuelve `'invalido'` si no es un número válido. */
function parseDecimal(valor: string): number | null | 'invalido' {
  const limpio = valor.trim();
  if (limpio === '') return null;
  const numero = Number(limpio.replace(',', '.'));
  if (!Number.isFinite(numero) || numero < 0) return 'invalido';
  return numero;
}

/** Normaliza `100 - 15` o `30016` a cinco dígitos contiguos. */
function parseRc04(valor: string): string | null {
  const limpio = valor.replace(/[\s-]/g, '');
  return RC04.test(limpio) ? limpio : null;
}

function esFechaValida(valor: string): boolean {
  if (!FECHA_ISO.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

function esPeriodoValido(valor: string): boolean {
  return PERIODO_MENSUAL.test(valor) || PERIODO_TRIMESTRAL.test(valor) || PERIODO_ANUAL.test(valor);
}

function esBaseValida(valor: string): valor is OnatBase {
  return (ONAT_BASES as readonly string[]).includes(valor);
}

function esPagadoValido(valor: string): boolean | null {
  const limpio = valor.trim().toLowerCase();
  if (limpio === '' || limpio === 'no') return false;
  if (limpio === 'si' || limpio === 'sí') return true;
  return null;
}

/**
 * Lee el CSV del vector. La cabecera es obligatoria y se mapea por nombre, así que
 * el orden de las columnas no importa.
 *
 * Reglas por fila:
 * - Si trae `importe`, ese es el valor a pagar y no se calcula (fijos, seguridad social).
 * - Si no trae `importe` y trae `porcentaje`, se calcula sobre `base`.
 * - Si no trae ninguno de los dos, la obligación existe pero queda pendiente de declarar
 *   (el caso del `0530222`, que el vector trae sin importe).
 * - El porcentaje se escribe en unidades de por ciento: `10` es 10 %.
 *
 * Devuelve todos los errores encontrados, no solo el primero: importar a medias en
 * silencio produciría una agenda incompleta que parece válida.
 */
export function parseOnatCsv(texto: string): OnatCsvParseResult {
  const errores: OnatCsvError[] = [];
  const obligaciones: OnatObligacion[] = [];
  const lineas = limpiarBom(texto).split(/\r?\n/);

  const indiceCabecera = lineas.findIndex((linea) => linea.trim() !== '');
  if (indiceCabecera === -1) {
    return { ok: false, obligaciones: [], errores: [{ linea: 1, motivo: 'El archivo está vacío.' }] };
  }

  const cabecera = lineas[indiceCabecera].split(SEPARADOR).map(normalizarCabecera);
  const requeridas = ['periodo', 'vence', 'codigo', 'rc04a'];
  const faltantes = requeridas.filter((columna) => !cabecera.includes(columna));
  if (faltantes.length > 0) {
    return {
      ok: false,
      obligaciones: [],
      errores: [{ linea: indiceCabecera + 1, motivo: `Faltan columnas: ${faltantes.join(', ')}.` }],
    };
  }

  const tiene = (columna: string): boolean => cabecera.includes(columna);
  const posicion = (columna: string): number => cabecera.indexOf(columna);

  for (let i = indiceCabecera + 1; i < lineas.length; i += 1) {
    const crudo = lineas[i];
    if (crudo.trim() === '') continue;

    const numeroLinea = i + 1;
    const campos = crudo.split(SEPARADOR);
    const tomar = (columna: string): string =>
      tiene(columna) ? (campos[posicion(columna)] ?? '').trim() : '';

    const periodo = tomar('periodo');
    if (!esPeriodoValido(periodo)) {
      errores.push({ linea: numeroLinea, motivo: `Período inválido: "${periodo}".` });
      continue;
    }

    const vence = tomar('vence');
    if (!esFechaValida(vence)) {
      errores.push({ linea: numeroLinea, motivo: `Fecha límite inválida: "${vence}".` });
      continue;
    }

    const codigo = tomar('codigo');
    if (!CODIGO_TRIBUTO.test(codigo)) {
      errores.push({ linea: numeroLinea, motivo: `Código de tributo inválido: "${codigo}".` });
      continue;
    }

    const rc04a = parseRc04(tomar('rc04a'));
    if (rc04a === null) {
      errores.push({ linea: numeroLinea, motivo: `Código RC-04A inválido: "${tomar('rc04a')}".` });
      continue;
    }

    const importe = parseDecimal(tomar('importe'));
    if (importe === 'invalido') {
      errores.push({ linea: numeroLinea, motivo: `Importe inválido: "${tomar('importe')}".` });
      continue;
    }

    const porcentajeCrudo = parseDecimal(tomar('porcentaje'));
    if (porcentajeCrudo === 'invalido') {
      errores.push({ linea: numeroLinea, motivo: `Porcentaje inválido: "${tomar('porcentaje')}".` });
      continue;
    }
    if (porcentajeCrudo !== null && porcentajeCrudo > 100) {
      errores.push({
        linea: numeroLinea,
        motivo: `Porcentaje fuera de rango: "${tomar('porcentaje')}". Se escribe en por ciento (10 = 10 %).`,
      });
      continue;
    }

    const baseCruda = tomar('base').toLowerCase();

    if (importe === null && porcentajeCrudo !== null && !esBaseValida(baseCruda)) {
      errores.push({
        linea: numeroLinea,
        motivo: `Base inválida para un tributo calculado: "${baseCruda}". Use ingresos, salarios o fija.`,
      });
      continue;
    }

    const pagado = tiene('pagado') ? esPagadoValido(tomar('pagado')) : false;
    if (pagado === null) {
      errores.push({ linea: numeroLinea, motivo: `Valor de "pagado" inválido: "${tomar('pagado')}".` });
      continue;
    }

    obligaciones.push({
      periodo,
      vence,
      codigo,
      importe,
      porcentaje: importe === null && porcentajeCrudo !== null ? porcentajeCrudo / 100 : null,
      base: importe === null && esBaseValida(baseCruda) ? baseCruda : 'fija',
      rc04a,
      pagado,
    });
  }

  if (obligaciones.length === 0 && errores.length === 0) {
    errores.push({ linea: indiceCabecera + 1, motivo: 'El archivo no tiene obligaciones.' });
  }

  if (errores.length === 0) {
    errores.push(...erroresDeCoherencia(obligaciones));
  }

  return { ok: errores.length === 0, obligaciones, errores };
}

/**
 * Un mismo tributo no puede llevar dos porcentajes o dos bases distintas en el
 * mismo archivo: la agenda se contradiría a sí misma.
 */
function erroresDeCoherencia(obligaciones: readonly OnatObligacion[]): OnatCsvError[] {
  const porCodigo = new Map<string, OnatObligacion>();
  const errores: OnatCsvError[] = [];

  for (const obligacion of obligaciones) {
    const previa = porCodigo.get(obligacion.codigo);
    if (previa === undefined) {
      porCodigo.set(obligacion.codigo, obligacion);
      continue;
    }

    const mismoPorcentaje = previa.porcentaje === obligacion.porcentaje;
    const mismaBase = previa.base === obligacion.base;
    if (!mismoPorcentaje || !mismaBase) {
      errores.push({
        linea: 0,
        motivo: `El tributo ${obligacion.codigo} declara porcentaje o base distintos entre filas.`,
      });
      break;
    }
  }

  return errores;
}

/** Exporta las obligaciones al mismo CSV que se importa, para poder reeditarlo. */
export function serializeOnatCsv(obligaciones: readonly OnatObligacion[]): string {
  const filas = obligaciones.map((obligacion) => {
    const importe = obligacion.importe === null ? '' : obligacion.importe.toFixed(2);
    const porcentaje =
      obligacion.porcentaje === null ? '' : String(Math.round(obligacion.porcentaje * 10000) / 100);
    return [
      obligacion.periodo,
      obligacion.vence,
      obligacion.codigo,
      importe,
      obligacion.rc04a,
      porcentaje,
      obligacion.base,
      obligacion.pagado ? 'si' : 'no',
    ].join(SEPARADOR);
  });

  return [ONAT_CSV_COLUMNS.join(SEPARADOR), ...filas].join('\n');
}

/** Tributos del año, en el orden en que aparecen en la agenda y sin repetir. */
export function tributosDelVector(obligaciones: readonly OnatObligacion[]): OnatTributo[] {
  const vistos = new Map<string, OnatTributo>();

  for (const obligacion of obligaciones) {
    if (!vistos.has(obligacion.codigo)) {
      vistos.set(obligacion.codigo, {
        codigo: obligacion.codigo,
        porcentaje: obligacion.porcentaje,
        base: obligacion.base,
      });
    }
  }

  return [...vistos.values()];
}

export function crearVectorVacio(ownerId: string, year: number): OnatVector {
  return {
    ownerId,
    year,
    identidad: {
      nombre: '',
      nit: '',
      rc05: '',
      domicilioFiscal: '',
      domicilioLegal: '',
      municipio: '',
      provincia: '',
    },
    actividades: [],
    obligaciones: [],
  };
}

const CLAVE_VECTOR = 'lizoft.onat-vector-';

function claveVector(ownerId: string, year: number): string {
  return `${CLAVE_VECTOR}${ownerId}-${year}`;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function textoDe(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function normalizarIdentidad(valor: unknown): OnatIdentidad {
  const vacia = crearVectorVacio('', 0).identidad;
  if (!esObjeto(valor)) return vacia;
  return {
    nombre: textoDe(valor.nombre),
    nit: textoDe(valor.nit),
    rc05: textoDe(valor.rc05),
    domicilioFiscal: textoDe(valor.domicilioFiscal),
    domicilioLegal: textoDe(valor.domicilioLegal),
    municipio: textoDe(valor.municipio),
    provincia: textoDe(valor.provincia),
  };
}

function normalizarActividades(valor: unknown): OnatActividad[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter(esObjeto).map((actividad) => ({
    nombre: textoDe(actividad.nombre),
    codigo: textoDe(actividad.codigo),
  }));
}

function normalizarObligaciones(valor: unknown): OnatObligacion[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter(esObjeto)
    .filter((obligacion) => esPeriodoValido(textoDe(obligacion.periodo)))
    .filter((obligacion) => esFechaValida(textoDe(obligacion.vence)))
    .filter((obligacion) => CODIGO_TRIBUTO.test(textoDe(obligacion.codigo)))
    .map((obligacion) => {
      const importe =
        typeof obligacion.importe === 'number' && Number.isFinite(obligacion.importe)
          ? obligacion.importe
          : null;
      const porcentaje =
        typeof obligacion.porcentaje === 'number' && Number.isFinite(obligacion.porcentaje)
          ? obligacion.porcentaje
          : null;
      const base = esBaseValida(textoDe(obligacion.base))
        ? (obligacion.base as OnatBase)
        : 'fija';

      return {
        periodo: textoDe(obligacion.periodo),
        vence: textoDe(obligacion.vence),
        codigo: textoDe(obligacion.codigo),
        importe,
        porcentaje: importe === null ? porcentaje : null,
        base: importe === null ? base : 'fija',
        rc04a: parseRc04(textoDe(obligacion.rc04a)) ?? '',
        pagado: obligacion.pagado === true,
      };
    })
    .filter((obligacion) => obligacion.rc04a !== '');
}

/** Vector del año; si no existe devuelve uno vacío en vez de `null`. */
export function getOnatVector(ownerId: string, year: number): OnatVector {
  const vacio = crearVectorVacio(ownerId, year);
  if (typeof window === 'undefined') return vacio;

  try {
    const crudo = localStorage.getItem(claveVector(ownerId, year));
    if (crudo === null) return vacio;
    const guardado: unknown = JSON.parse(crudo);
    if (!esObjeto(guardado)) return vacio;

    return {
      ownerId,
      year,
      identidad: normalizarIdentidad(guardado.identidad),
      actividades: normalizarActividades(guardado.actividades),
      obligaciones: normalizarObligaciones(guardado.obligaciones),
    };
  } catch {
    return vacio;
  }
}

export function saveOnatVector(vector: OnatVector): OnatWriteResult {
  if (typeof window === 'undefined') return { succeeded: false };
  try {
    localStorage.setItem(claveVector(vector.ownerId, vector.year), JSON.stringify(vector));
    return { succeeded: true };
  } catch {
    return { succeeded: false };
  }
}

/**
 * Importa el CSV del vector para un año. **Reemplaza todas las obligaciones** de
 * ese año (S2); la identidad y las actividades configuradas se conservan. Si el
 * archivo tiene cualquier error no se escribe nada.
 */
export function importOnatCsv(
  ownerId: string,
  year: number,
  texto: string,
): { ok: boolean; vector: OnatVector; errores: OnatCsvError[]; guardado: boolean } {
  const vector = getOnatVector(ownerId, year);
  const parseado = parseOnatCsv(texto);

  if (!parseado.ok) {
    return { ok: false, vector, errores: parseado.errores, guardado: false };
  }

  const actualizado: OnatVector = { ...vector, obligaciones: parseado.obligaciones };
  const escritura = saveOnatVector(actualizado);
  return {
    ok: escritura.succeeded,
    vector: actualizado,
    errores: escritura.succeeded ? [] : [{ linea: 0, motivo: 'No se pudo guardar el vector.' }],
    guardado: escritura.succeeded,
  };
}

/** Marca una obligación como pagada o impagada, por período y código. */
export function setObligacionPagada(
  ownerId: string,
  year: number,
  periodo: string,
  codigo: string,
  pagado: boolean,
): OnatWriteResult {
  const vector = getOnatVector(ownerId, year);
  const obligaciones = vector.obligaciones.map((obligacion) =>
    obligacion.periodo === periodo && obligacion.codigo === codigo
      ? { ...obligacion, pagado }
      : obligacion,
  );

  return saveOnatVector({ ...vector, obligaciones });
}
