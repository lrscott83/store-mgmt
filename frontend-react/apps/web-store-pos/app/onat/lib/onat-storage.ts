/**
 * Persistencia frontend del Vector Fiscal, por Owner.
 *
 * Decisión documentada: se guarda JSON plano en localStorage, sin cifrado. El
 * único precedente de persistencia frontend por usuario en la app
 * (`store-usage-tracker`) también usa JSON plano, y aquí solo vive configuración
 * fiscal del negocio. Todo es SSR-safe: sin `window` se devuelve el valor por
 * defecto sin tocar el almacenamiento.
 */

const CLAVE_CONFIG = 'lizoft.onat-config-';
const CLAVE_OVERRIDES = 'lizoft.onat-overrides-';

export interface OnatActivity {
  nombre: string;
  codigo: string;
}

export interface OnatConfig {
  ownerId: string;
  nombre: string;
  nit: string;
  domicilioFiscal: string;
  domicilioLegal: string;
  municipio: string;
  provincia: string;
  actividades: OnatActivity[];
}

export interface OnatOverride {
  original: number;
  value: number;
  editedAt: string;
}

/** Resultado de una escritura: las dos únicas escrituras de esta capa fallan o no. */
export type OnatWriteResult = { readonly succeeded: true } | { readonly succeeded: false };

/** Entrada de `setOnatOverride`: un objeto con nombre para no confundir posiciones. */
export interface OnatOverrideInput {
  readonly ownerId: string;
  readonly year: number;
  readonly month: number;
  readonly field: 'ingresos' | 'gastos';
  readonly original: number;
  readonly value: number;
}

export interface OnatMonthOverrides {
  ingresos?: OnatOverride;
  gastos?: OnatOverride;
}

/** Año → mes (0-11) → campos sobrescritos por el Owner. */
export type OnatOverrides = Record<string, Record<string, OnatMonthOverrides>>;

function textoSeguro(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function leerJson(clave: string): unknown {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo === null ? null : JSON.parse(crudo);
  } catch {
    return null;
  }
}

/**
 * Única puerta de escritura. Cuota agotada, modo privado o una serialización
 * imposible devuelven un resultado fallido en vez de escapar a un handler React.
 */
function escribirJson(clave: string, valor: unknown): OnatWriteResult {
  if (typeof window === 'undefined') {
    return { succeeded: false };
  }
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return { succeeded: true };
  } catch {
    return { succeeded: false };
  }
}

function crearConfigVacia(ownerId: string): OnatConfig {
  return {
    ownerId,
    nombre: '',
    nit: '',
    domicilioFiscal: '',
    domicilioLegal: '',
    municipio: '',
    provincia: '',
    actividades: [],
  };
}

function normalizarActividad(valor: unknown): OnatActivity | null {
  if (!esObjeto(valor)) {
    return null;
  }
  return {
    nombre: textoSeguro(valor.nombre),
    codigo: textoSeguro(valor.codigo),
  };
}

function normalizarOverride(valor: unknown): OnatOverride | null {
  if (!esObjeto(valor)) {
    return null;
  }

  const { original, value, editedAt } = valor;
  if (typeof original !== 'number' || !Number.isFinite(original)) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (typeof editedAt !== 'string') {
    return null;
  }

  return { original, value, editedAt };
}

/** Configuración fiscal del Owner; normaliza datos corruptos al valor vacío. */
export function getOnatConfig(ownerId: string): OnatConfig {
  const configVacia = crearConfigVacia(ownerId);
  if (typeof window === 'undefined') {
    return configVacia;
  }

  const guardado = leerJson(CLAVE_CONFIG + ownerId);
  if (!esObjeto(guardado)) {
    return configVacia;
  }

  return {
    ownerId,
    nombre: textoSeguro(guardado.nombre),
    nit: textoSeguro(guardado.nit),
    domicilioFiscal: textoSeguro(guardado.domicilioFiscal),
    domicilioLegal: textoSeguro(guardado.domicilioLegal),
    municipio: textoSeguro(guardado.municipio),
    provincia: textoSeguro(guardado.provincia),
    actividades: Array.isArray(guardado.actividades)
      ? guardado.actividades
          .map(normalizarActividad)
          .filter((actividad): actividad is OnatActivity => actividad !== null)
      : [],
  };
}

export function saveOnatConfig(config: OnatConfig): OnatWriteResult {
  return escribirJson(CLAVE_CONFIG + config.ownerId, config);
}

/** Overrides de ingresos/gastos del Owner; descarta entradas corruptas. */
export function getOnatOverrides(ownerId: string): OnatOverrides {
  if (typeof window === 'undefined') {
    return {};
  }

  const guardado = leerJson(CLAVE_OVERRIDES + ownerId);
  if (!esObjeto(guardado)) {
    return {};
  }

  const overrides: OnatOverrides = {};

  for (const [year, meses] of Object.entries(guardado)) {
    if (!esObjeto(meses)) {
      continue;
    }

    const mesesNormalizados: Record<string, OnatMonthOverrides> = {};

    for (const [month, campos] of Object.entries(meses)) {
      if (!esObjeto(campos)) {
        continue;
      }

      const ingresos = normalizarOverride(campos.ingresos);
      const gastos = normalizarOverride(campos.gastos);
      if (ingresos === null && gastos === null) {
        continue;
      }

      const mes: OnatMonthOverrides = {};
      if (ingresos !== null) {
        mes.ingresos = ingresos;
      }
      if (gastos !== null) {
        mes.gastos = gastos;
      }
      mesesNormalizados[month] = mes;
    }

    if (Object.keys(mesesNormalizados).length > 0) {
      overrides[year] = mesesNormalizados;
    }
  }

  return overrides;
}

/**
 * Registra una sobrescritura del Owner (S3/S4).
 *
 * Si el campo ya tenía un override, conserva el `original` de la primera edición
 * y solo actualiza `value` y `editedAt`: el original queda congelado y no se
 * recalcula cuando entran ventas o gastos nuevos.
 */
export function setOnatOverride(input: OnatOverrideInput): OnatWriteResult {
  if (typeof window === 'undefined') {
    return { succeeded: false };
  }

  const { ownerId, year, month, field, original, value } = input;
  const overrides = getOnatOverrides(ownerId);
  const yearKey = String(year);
  const monthKey = String(month);
  const mesAnterior = overrides[yearKey]?.[monthKey];

  const override: OnatOverride = {
    original: mesAnterior?.[field]?.original ?? original,
    value,
    editedAt: new Date().toISOString(),
  };

  const mes: OnatMonthOverrides =
    field === 'ingresos'
      ? { ...mesAnterior, ingresos: override }
      : { ...mesAnterior, gastos: override };

  overrides[yearKey] = { ...overrides[yearKey], [monthKey]: mes };

  return escribirJson(CLAVE_OVERRIDES + ownerId, overrides);
}
