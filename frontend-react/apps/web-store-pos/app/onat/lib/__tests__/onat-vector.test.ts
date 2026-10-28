import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  crearVectorVacio,
  getOnatVector,
  importOnatCsv,
  parseOnatCsv,
  saveOnatVector,
  serializeOnatCsv,
  setObligacionPagada,
} from '../onat-vector';
import type { OnatObligacion, OnatVector } from '../onat-vector';

const OWNER_ID = 'owner-1';
const YEAR = 2026;
const CLAVE = `lizoft.onat-vector-${OWNER_ID}-${YEAR}`;

const CSV_VALIDO = [
  'periodo;vence;codigo;importe;rc04a',
  '2026-01;2026-02-20;0114022;;30016',
  '2026-01;2026-02-20;0510122;;60046',
  '2026-Q1;2026-04-20;0820132;1200.00;00206',
  '2026-A;2027-04-30;0530222;;10106',
].join('\n');

function vectorConObligaciones(obligaciones: OnatObligacion[]): OnatVector {
  return { ...crearVectorVacio(OWNER_ID, YEAR), obligaciones };
}

describe('parseOnatCsv', () => {
  it('lee las cinco columnas y deja el importe nulo en los tributos variables', () => {
    const resultado = parseOnatCsv(CSV_VALIDO);

    expect(resultado.ok).toBe(true);
    expect(resultado.errores).toEqual([]);
    expect(resultado.obligaciones).toHaveLength(4);
    expect(resultado.obligaciones[0]).toEqual({
      periodo: '2026-01',
      vence: '2026-02-20',
      codigo: '0114022',
      importe: null,
      rc04a: '30016',
      pagado: false,
    });
    expect(resultado.obligaciones[2].importe).toBe(1200);
  });

  it('acepta importe con coma decimal', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a\n2026-Q1;2026-04-20;0820132;1200,50;00206';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(true);
    expect(resultado.obligaciones[0].importe).toBe(1200.5);
  });

  it('ignora el BOM y las líneas en blanco', () => {
    const csv = `\uFEFF${CSV_VALIDO}\n\n`;
    expect(parseOnatCsv(csv).obligaciones).toHaveLength(4);
  });

  it('normaliza el código RC-04A con guiones y espacios', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a\n2026-01;2026-02-20;0114022;;100 - 15';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(true);
    expect(resultado.obligaciones[0].rc04a).toBe('10015');
  });

  it('mapea las columnas por nombre, sin depender del orden', () => {
    const csv = 'rc04a;codigo;periodo;vence;importe\n30016;0114022;2026-01;2026-02-20;';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(true);
    expect(resultado.obligaciones[0].codigo).toBe('0114022');
  });

  it('rechaza un código de tributo que no sea de siete dígitos', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a\n2026-01;2026-02-20;011402;;30016';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0].linea).toBe(2);
    expect(resultado.errores[0].motivo).toContain('Código de tributo');
    expect(resultado.obligaciones).toEqual([]);
  });

  it('rechaza un período inválido', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a\n2026-13;2026-02-20;0114022;;30016';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0].motivo).toContain('Período');
  });

  it('rechaza una fecha imposible', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a\n2026-01;2026-02-31;0114022;;30016';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0].motivo).toContain('Fecha límite');
  });

  it('rechaza un RC-04A que no tenga cinco dígitos', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a\n2026-01;2026-02-20;0114022;;3001';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0].motivo).toContain('RC-04A');
  });

  it('falla si falta una columna obligatoria', () => {
    const csv = 'periodo;vence;codigo;importe\n2026-01;2026-02-20;0114022;';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0].motivo).toContain('rc04a');
  });

  it('informa todos los errores, no solo el primero', () => {
    const csv = [
      'periodo;vence;codigo;importe;rc04a',
      '2026-01;2026-02-20;011402;;30016',
      '2026-01;2026-02-20;0510122;;6004',
    ].join('\n');
    const resultado = parseOnatCsv(csv);

    expect(resultado.errores).toHaveLength(2);
    expect(resultado.errores.map((error) => error.linea)).toEqual([2, 3]);
  });

  it('falla si no hay obligaciones', () => {
    const resultado = parseOnatCsv('periodo;vence;codigo;importe;rc04a');

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0].motivo).toContain('no tiene obligaciones');
  });
});

describe('serializeOnatCsv', () => {
  it('hace ida y vuelta con el CSV importado', () => {
    const original = parseOnatCsv(CSV_VALIDO).obligaciones;
    const serializado = serializeOnatCsv(original);
    const releido = parseOnatCsv(serializado);

    expect(releido.ok).toBe(true);
    expect(releido.obligaciones).toEqual(original);
  });
});

describe('almacenamiento del vector', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('devuelve un vector vacío cuando no hay nada guardado', () => {
    const vector = getOnatVector(OWNER_ID, YEAR);

    expect(vector.year).toBe(YEAR);
    expect(vector.obligaciones).toEqual([]);
    expect(vector.identidad.rc05).toBe('');
  });

  it('guarda y recupera identidad, actividades y tributos del año', () => {
    const vector: OnatVector = {
      ...crearVectorVacio(OWNER_ID, YEAR),
      identidad: {
        nombre: 'Owner',
        nit: '84051234567',
        rc05: '7412034567890123',
        domicilioFiscal: 'Calle 1',
        domicilioLegal: 'Calle 1',
        municipio: '2310-Cerro',
        provincia: 'La Habana',
      },
      actividades: [{ nombre: 'Actividades profesionales', codigo: 'M' }],
      tributos: [
        {
          codigo: '0114022',
          nombre: 'Ventas y servicios',
          porcentaje: 0.1,
          base: 'ingresos',
          periodicidad: 'mensual',
        },
      ],
    };

    expect(saveOnatVector(vector).succeeded).toBe(true);
    expect(getOnatVector(OWNER_ID, YEAR)).toEqual(vector);
  });

  it('no mezcla años distintos', () => {
    saveOnatVector({
      ...crearVectorVacio(OWNER_ID, 2025),
      identidad: { ...crearVectorVacio(OWNER_ID, 2025).identidad, nombre: 'Anterior' },
    });

    expect(getOnatVector(OWNER_ID, 2026).identidad.nombre).toBe('');
    expect(getOnatVector(OWNER_ID, 2025).identidad.nombre).toBe('Anterior');
  });

  it('descarta datos corruptos en vez de romper la pantalla', () => {
    localStorage.setItem(CLAVE, '{no es json');

    expect(getOnatVector(OWNER_ID, YEAR).obligaciones).toEqual([]);
  });

  it('el import reemplaza todas las obligaciones del año', () => {
    saveOnatVector(vectorConObligaciones([
      { periodo: '2025-01', vence: '2025-02-20', codigo: '0114022', importe: null, rc04a: '99999', pagado: true },
    ]));

    const resultado = importOnatCsv(OWNER_ID, YEAR, CSV_VALIDO);

    expect(resultado.ok).toBe(true);
    expect(resultado.vector.obligaciones).toHaveLength(4);
    expect(resultado.vector.obligaciones.some((o) => o.rc04a === '99999')).toBe(false);
    expect(getOnatVector(OWNER_ID, YEAR).obligaciones).toHaveLength(4);
  });

  it('si el CSV tiene errores no escribe nada', () => {
    saveOnatVector(vectorConObligaciones([
      { periodo: '2026-01', vence: '2026-02-20', codigo: '0114022', importe: null, rc04a: '30016', pagado: false },
    ]));

    const resultado = importOnatCsv(OWNER_ID, YEAR, 'periodo;vence;codigo;importe;rc04a\n2026-01;2026-02-20;1;;30016');

    expect(resultado.ok).toBe(false);
    expect(getOnatVector(OWNER_ID, YEAR).obligaciones).toHaveLength(1);
  });

  it('marca una obligación como pagada sin tocar las demás', () => {
    saveOnatVector(vectorConObligaciones(parseOnatCsv(CSV_VALIDO).obligaciones));

    expect(setObligacionPagada(OWNER_ID, YEAR, '2026-01', '0114022', true).succeeded).toBe(true);
    const vector = getOnatVector(OWNER_ID, YEAR);

    expect(vector.obligaciones.filter((o) => o.pagado)).toHaveLength(1);
    expect(vector.obligaciones.find((o) => o.pagado)?.codigo).toBe('0114022');
  });

  it('devuelve fallo si el navegador no deja escribir', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(saveOnatVector(crearVectorVacio(OWNER_ID, YEAR))).toEqual({ succeeded: false });
    vi.restoreAllMocks();
  });
});
