import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  crearVectorVacio,
  getOnatVector,
  importOnatCsv,
  parseOnatCsv,
  saveOnatVector,
  serializeOnatCsv,
  setObligacionPagada,
  tributosDelVector,
} from '../onat-vector';
import type { OnatObligacion, OnatVector } from '../onat-vector';

const OWNER_ID = 'owner-1';
const YEAR = 2026;
const CLAVE = `lizoft.onat-vector-${OWNER_ID}-${YEAR}`;

const CSV_VALIDO = [
  'periodo;vence;codigo;importe;rc04a;porcentaje;base',
  '2026-01;2026-02-20;0114022;;30016;10;ingresos',
  '2026-01;2026-02-20;0510122;;60046;5;ingresos',
  '2026-Q1;2026-04-20;0820132;1200.00;00206;;',
  '2026-A;2027-04-30;0530222;;10106;',
].join('\n');

function vectorConObligaciones(obligaciones: OnatObligacion[]): OnatVector {
  return { ...crearVectorVacio(OWNER_ID, YEAR), obligaciones };
}

describe('parseOnatCsv', () => {
  it('usa el importe cuando la fila lo trae y no calcula nada', () => {
    const resultado = parseOnatCsv(CSV_VALIDO);

    expect(resultado.ok).toBe(true);
    expect(resultado.obligaciones[2]).toEqual({
      periodo: '2026-Q1',
      vence: '2026-04-20',
      codigo: '0820132',
      importe: 1200,
      porcentaje: null,
      base: 'fija',
      rc04a: '00206',
      pagado: false,
    });
  });

  it('convierte el porcentaje del CSV a fracción', () => {
    const resultado = parseOnatCsv(CSV_VALIDO);

    expect(resultado.obligaciones[0].porcentaje).toBe(0.1);
    expect(resultado.obligaciones[0].base).toBe('ingresos');
    expect(resultado.obligaciones[1].porcentaje).toBe(0.05);
  });

  it('si trae importe y porcentaje, manda el importe', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a;porcentaje;base\n2026-01;2026-02-20;0114022;500.00;30016;10;ingresos';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(true);
    expect(resultado.obligaciones[0].importe).toBe(500);
    expect(resultado.obligaciones[0].porcentaje).toBeNull();
    expect(resultado.obligaciones[0].base).toBe('fija');
  });

  it('acepta importe con coma decimal', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a\n2026-Q1;2026-04-20;0820132;1200,50;00206';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(true);
    expect(resultado.obligaciones[0].importe).toBe(1200.5);
  });

  it('acepta porcentaje con coma decimal', () => {
    const csv = 'periodo;vence;codigo;rc04a;porcentaje;base\n2026-01;2026-02-20;0610322;80114;7,5;salarios';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(true);
    expect(resultado.obligaciones[0].porcentaje).toBe(0.075);
    expect(resultado.obligaciones[0].base).toBe('salarios');
  });

  it('ignora el BOM y las líneas en blanco', () => {
    const csv = `\uFEFF${CSV_VALIDO}\n\n`;
    expect(parseOnatCsv(csv).obligaciones).toHaveLength(4);
  });

  it('normaliza el código RC-04A con guiones y espacios', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a\n2026-01;2026-02-20;0820132;1200.00;100 - 15';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(true);
    expect(resultado.obligaciones[0].rc04a).toBe('10015');
  });

  it('mapea las columnas por nombre, sin depender del orden', () => {
    const csv = 'rc04a;codigo;periodo;vence;porcentaje;base\n30016;0114022;2026-01;2026-02-20;10;ingresos';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(true);
    expect(resultado.obligaciones[0].codigo).toBe('0114022');
    expect(resultado.obligaciones[0].porcentaje).toBe(0.1);
  });

  it('rechaza un código de tributo que no sea de siete dígitos', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a\n2026-01;2026-02-20;011402;500.00;30016';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0].linea).toBe(2);
    expect(resultado.errores[0].motivo).toContain('Código de tributo');
    expect(resultado.obligaciones).toEqual([]);
  });

  it('rechaza un período inválido', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a\n2026-13;2026-02-20;0114022;500.00;30016';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0].motivo).toContain('Período');
  });

  it('rechaza una fecha imposible', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a\n2026-01;2026-02-31;0114022;500.00;30016';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0].motivo).toContain('Fecha límite');
  });

  it('rechaza un RC-04A que no tenga cinco dígitos', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a\n2026-01;2026-02-20;0114022;500.00;3001';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0].motivo).toContain('RC-04A');
  });

  it('acepta una fila sin importe ni porcentaje como pendiente de declarar', () => {
    const csv = 'periodo;vence;codigo;importe;rc04a;porcentaje;base\n2026-01;2026-02-20;0530222;;30016;;';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(true);
    expect(resultado.obligaciones[0].importe).toBeNull();
    expect(resultado.obligaciones[0].porcentaje).toBeNull();
    expect(resultado.obligaciones[0].base).toBe('fija');
  });

  it('rechaza un porcentaje mayor que 100', () => {
    const csv = 'periodo;vence;codigo;rc04a;porcentaje;base\n2026-01;2026-02-20;0114022;30016;150;ingresos';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0].motivo).toContain('fuera de rango');
  });

  it('rechaza una base desconocida en un tributo calculado', () => {
    const csv = 'periodo;vence;codigo;rc04a;porcentaje;base\n2026-01;2026-02-20;0114022;30016;10;ventas';
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0].motivo).toContain('Base inválida');
  });

  it('rechaza el mismo tributo con porcentajes distintos', () => {
    const csv = [
      'periodo;vence;codigo;rc04a;porcentaje;base',
      '2026-01;2026-02-20;0114022;30016;10;ingresos',
      '2026-02;2026-03-20;0114022;50816;12;ingresos',
    ].join('\n');
    const resultado = parseOnatCsv(csv);

    expect(resultado.ok).toBe(false);
    expect(resultado.errores[0].motivo).toContain('porcentaje o base distintos');
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

describe('tributosDelVector', () => {
  it('deduce los tributos de la agenda sin repetir códigos', () => {
    const obligaciones = parseOnatCsv(CSV_VALIDO).obligaciones;
    const tributos = tributosDelVector(obligaciones);

    expect(tributos).toHaveLength(4);
    expect(tributos[0]).toEqual({ codigo: '0114022', porcentaje: 0.1, base: 'ingresos' });
    expect(tributos[2]).toEqual({ codigo: '0820132', porcentaje: null, base: 'fija' });
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

  it('exporta el porcentaje en por ciento, no en fracción', () => {
    const csv = serializeOnatCsv(parseOnatCsv(CSV_VALIDO).obligaciones);

    expect(csv).toContain(';10;ingresos;');
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

  it('guarda y recupera identidad y actividades del año', () => {
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
      {
        periodo: '2025-01', vence: '2025-02-20', codigo: '0114022',
        importe: 99, porcentaje: null, base: 'fija', rc04a: '99999', pagado: true,
      },
    ]));

    const resultado = importOnatCsv(OWNER_ID, YEAR, CSV_VALIDO);

    expect(resultado.ok).toBe(true);
    expect(resultado.vector.obligaciones).toHaveLength(4);
    expect(resultado.vector.obligaciones.some((o) => o.rc04a === '99999')).toBe(false);
    expect(getOnatVector(OWNER_ID, YEAR).obligaciones).toHaveLength(4);
  });

  it('si el CSV tiene errores no escribe nada', () => {
    saveOnatVector(vectorConObligaciones([
      {
        periodo: '2026-01', vence: '2026-02-20', codigo: '0114022',
        importe: 500, porcentaje: null, base: 'fija', rc04a: '30016', pagado: false,
      },
    ]));

    const resultado = importOnatCsv(OWNER_ID, YEAR, 'periodo;vence;codigo;importe;rc04a\n2026-01;2026-02-20;1;500.00;30016');

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
