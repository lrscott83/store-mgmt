/**
 * Modelo, carga y persistencia del Vector Fiscal por año (S1–S8).
 *
 * Cada ejercicio se configura de cero: identidad, actividades, tributos con su
 * porcentaje y la agenda de obligaciones que trae el CSV. Nada se hereda del año
 * anterior, porque el vector de un año puede tener más o menos actividades y más
 * o menos tributos.
 */

import type { OnatWriteResult } from './onat-storage';

export type OnatPeriodicidad = 'mensual' | 'trimestral' | 'anual';

/** Naturaleza del tributo: sobre qué se calcula o si es un importe declarado. */
export type OnatBase = 'ingresos' | 'salarios' | 'fija';

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

export interface OnatTributo {
  /** Código ONAT de 7 dígitos, tal como lo usa el vector (p. ej. `0114022`). */
  codigo: string;
  nombre: string;
  /** Tasa expresada como fracción: `0.10` es 10 %. */
  porcentaje: number;
  base: OnatBase;
  periodicidad: OnatPeriodicidad;
}

export interface OnatObligacion {
  /** `2026-01` mensual, `2026-Q1` trimestral, `2026-A` anual. */
  periodo: string;
  /** Fecha límite de pago en ISO `AAAA-MM-DD`, tal como la trae el vector. */
  vence: string;
  codigo: string;
  /** `null` cuando el tributo se calcula; el vector solo trae importe en los fijos. */
  importe: number | null;
  /** Código de pago de 5 dígitos (RC-04A). */
  rc04a: string;
  pagado: boolean;
}

export interface OnatVector {
  ownerId: string;
  year: number;
  identidad: OnatIdentidad;
  actividades: OnatActividad[];
  tributos: OnatTributo[];
  obligaciones: OnatObligacion[];
}

export const ONAT_CSV_COLUMNS = ['periodo', 'vence', 'codigo', 'importe', 'rc04a', 'pagado'] as const;

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

/** Acepta `1200.00` y `1200,00`; devuelve `null` si no es un número válido. */
function parseImporte(valor: string): number | null | 'invalido' {
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

function esPagadoValido(valor: string): boolean | null {
  const limpio = valor.trim().toLowerCase();
  if (limpio === '' || limpio === 'no') return false;
  if (limpio === 'si' || limpio === 'sí') return true;
  return null;
}

/**
 * Lee el CSV de obligaciones del vector. La cabecera es obligatoria y se mapea por
 * nombre, así que el orden de las columnas no importa.
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
  const requeridas = ['periodo', 'vence', 'codigo', 'importe', 'rc04a'];
  const faltantes = requeridas.filter((columna) => !cabecera.includes(columna));
  if (faltantes.length > 0) {
    return {
      ok: false,
      obligaciones: [],
      errores: [{ linea: indiceCabecera + 1, motivo: `Faltan columnas: ${faltantes.join(', ')}.` }],
    };
  }

  const posicion = (columna: string): number => cabecera.indexOf(columna);

  for (let i = indiceCabecera + 1; i < lineas.length; i += 1) {
    const crudo = lineas[i];
    if (crudo.trim() === '') continue;

    const numeroLinea = i + 1;
    const campos = crudo.split(SEPARADOR);
    const tomar = (columna: string): string => (campos[posicion(columna)] ?? '').trim();

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

    const importe = parseImporte(tomar('importe'));
    if (importe === 'invalido') {
      errores.push({ linea: numeroLinea, motivo: `Importe inválido: "${tomar('importe')}".` });
      continue;
    }

    const rc04a = parseRc04(tomar('rc04a'));
    if (rc04a === null) {
      errores.push({ linea: numeroLinea, motivo: `Código RC-04A inválido: "${tomar('rc04a')}".` });
      continue;
    }

    const pagado = cabecera.includes('pagado') ? esPagadoValido(tomar('pagado')) : false;
    if (pagado === null) {
      errores.push({ linea: numeroLinea, motivo: `Valor de "pagado" inválido: "${tomar('pagado')}".` });
      continue;
    }

    obligaciones.push({ periodo, vence, codigo, importe, rc04a, pagado });
  }

  if (obligaciones.length === 0 && errores.length === 0) {
    errores.push({ linea: indiceCabecera + 1, motivo: 'El archivo no tiene obligaciones.' });
  }

  return { ok: errores.length === 0, obligaciones, errores };
}

/** Exporta las obligaciones al mismo CSV que se importa, para poder reeditarlo. */
export function serializeOnatCsv(obligaciones: readonly OnatObligacion[]): string {
  const filas = obligaciones.map((obligacion) => {
    const importe = obligacion.importe === null ? '' : obligacion.importe.toFixed(2);
    return [
      obligacion.periodo,
      obligacion.vence,
      obligacion.codigo,
      importe,
      obligacion.rc04a,
      obligacion.pagado ? 'si' : 'no',
    ].join(SEPARADOR);
  });

  return [ONAT_CSV_COLUMNS.join(SEPARADOR), ...filas].join('\n');
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
    tributos: [],
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
  if (!esObjeto(valor)) return crearVectorVacio('', 0).identidad;
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

function normalizarTributos(valor: unknown): OnatTributo[] {
  if (!Array.isArray(valor)) return [];
  const bases: OnatBase[] = ['ingresos', 'salarios', 'fija'];
  const periodicidades: OnatPeriodicidad[] = ['mensual', 'trimestral', 'anual'];

  return valor
    .filter(esObjeto)
    .filter((tributo) => typeof tributo.codigo === 'string' && CODIGO_TRIBUTO.test(tributo.codigo))
    .map((tributo) => ({
      codigo: textoDe(tributo.codigo),
      nombre: textoDe(tributo.nombre),
      porcentaje: typeof tributo.porcentaje === 'number' && Number.isFinite(tributo.porcentaje)
        ? tributo.porcentaje
        : 0,
      base: bases.includes(tributo.base as OnatBase) ? (tributo.base as OnatBase) : 'ingresos',
      periodicidad: periodicidades.includes(tributo.periodicidad as OnatPeriodicidad)
        ? (tributo.periodicidad as OnatPeriodicidad)
        : 'mensual',
    }));
}

function normalizarObligaciones(valor: unknown): OnatObligacion[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter(esObjeto)
    .filter((obligacion) => esPeriodoValido(textoDe(obligacion.periodo)))
    .filter((obligacion) => esFechaValida(textoDe(obligacion.vence)))
    .filter((obligacion) => CODIGO_TRIBUTO.test(textoDe(obligacion.codigo)))
    .map((obligacion) => ({
      periodo: textoDe(obligacion.periodo),
      vence: textoDe(obligacion.vence),
      codigo: textoDe(obligacion.codigo),
      importe: typeof obligacion.importe === 'number' && Number.isFinite(obligacion.importe)
        ? obligacion.importe
        : null,
      rc04a: parseRc04(textoDe(obligacion.rc04a)) ?? '',
      pagado: obligacion.pagado === true,
    }))
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
      tributos: normalizarTributos(guardado.tributos),
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
 * ese año (S2); la identidad, las actividades y los tributos configurados se
 * conservan. Si el archivo tiene cualquier error no se escribe nada.
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
