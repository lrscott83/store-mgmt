import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseType } from '@store-mgmt/domain';
import {
  BONIFICACION_PRONTO_PAGO,
  MINIMO_EXENTO_ANUAL,
  TASA_CUOTA,
  TASA_FUERZA_TRABAJO,
  TASA_VENTAS,
  UMBRAL_CUOTA_MENSUAL,
  cierreAnual,
  cuotaMensual,
  fuerzaTrabajo,
  impuestoEscala,
  impuestoVentas,
} from '../onat-calculations';
import type { CierreAnualInput } from '../onat-calculations';
import { getOnatConfig, getOnatOverrides, saveOnatConfig, setOnatOverride } from '../onat-storage';
import { ONAT_TAXONOMY, isFiscalExpenseType } from '../onat-taxonomy';

const OWNER_ID = 'owner-1';
const CONFIG_KEY = `lizoft.onat-config-${OWNER_ID}`;

function makeCierre(overrides: Partial<CierreAnualInput> = {}): CierreAnualInput {
  return {
    ingresos: 0,
    gastos: 0,
    tributosDeducibles: 0,
    contribucionZonas: 0,
    arrendamientos: 0,
    exoneraciones: 0,
    otrasBonificaciones: 0,
    cuotasPagadas: 0,
    retenciones: 0,
    bonificaciones: 0,
    pagaAntesDel28Febrero: false,
    ...overrides,
  };
}

describe('constantes fiscales', () => {
  it('expone los valores de la Ley 181/2025', () => {
    expect(MINIMO_EXENTO_ANUAL).toBe(39120);
    expect(UMBRAL_CUOTA_MENSUAL).toBe(3260);
    expect(TASA_VENTAS).toBe(0.1);
    expect(TASA_CUOTA).toBe(0.05);
    expect(TASA_FUERZA_TRABAJO).toBe(0.05);
    expect(BONIFICACION_PRONTO_PAGO).toBe(0.05);
  });
});

describe('impuestoEscala', () => {
  it.each([
    [1, 0.05],
    [10_000, 500],
    [25_000, 1_250],
    [25_001, 1_250.1],
    [30_000, 1_750],
    [50_000, 3_750],
    [75_000, 7_500],
    [100_000, 11_250],
    [150_000, 21_250],
    [200_000, 31_250],
    [275_000, 50_000],
    [350_000, 68_750],
    [425_000, 91_250],
    [500_000, 113_750],
    [575_000, 140_000],
    [650_000, 166_250],
    [725_000, 196_250],
    [800_000, 226_250],
    [900_000, 271_250],
    [1_000_000, 316_250],
    [1_200_000, 416_250],
  ])('base %d paga %d de forma acumulativa', (base, esperado) => {
    expect(impuestoEscala(base)).toBe(esperado);
  });

  it('devuelve cero para base cero o negativa', () => {
    expect(impuestoEscala(0)).toBe(0);
    expect(impuestoEscala(-50_000)).toBe(0);
  });
});

describe('impuestoVentas', () => {
  it('aplica el 10 % del ingreso del mes', () => {
    expect(impuestoVentas(1_000)).toBe(100);
    expect(impuestoVentas(123.4)).toBe(12.34);
  });

  it('nunca devuelve un importe negativo', () => {
    expect(impuestoVentas(-500)).toBe(0);
    expect(impuestoVentas(0)).toBe(0);
  });
});

describe('cuotaMensual', () => {
  it('solo grava el exceso sobre el umbral de 3.260 CUP', () => {
    expect(cuotaMensual(3_260)).toBe(0);
    expect(cuotaMensual(3_000)).toBe(0);
    expect(cuotaMensual(4_260)).toBe(50);
    expect(cuotaMensual(10_000)).toBe(337);
  });

  it('nunca devuelve un importe negativo', () => {
    expect(cuotaMensual(-1)).toBe(0);
  });
});

describe('fuerzaTrabajo', () => {
  it('aplica el 5 % de los salarios del mes', () => {
    expect(fuerzaTrabajo(10_000)).toBe(500);
  });

  it('nunca devuelve un importe negativo', () => {
    expect(fuerzaTrabajo(-100)).toBe(0);
    expect(fuerzaTrabajo(0)).toBe(0);
  });
});

describe('cierreAnual', () => {
  it('calcula la base imponible con todas las deducciones y la escala', () => {
    const resultado = cierreAnual(
      makeCierre({
        ingresos: 100_000,
        gastos: 20_000,
        tributosDeducibles: 5_000,
        contribucionZonas: 2_000,
        arrendamientos: 3_000,
        exoneraciones: 1_000,
        otrasBonificaciones: 500,
        cuotasPagadas: 100,
        retenciones: 50,
        bonificaciones: 38,
        pagaAntesDel28Febrero: true,
      }),
    );

    expect(resultado).toEqual({
      baseImponible: 29_380,
      impuesto: 1_688,
      impuestoAPagar: 1_500,
      bonificacionProntoPago: 75,
      totalAPagar: 1_425,
    });
  });

  it('no aplica la bonificación por pronto pago si el Owner no paga antes del 28 de febrero', () => {
    const resultado = cierreAnual(makeCierre({ ingresos: 39_120 + 25_000 }));

    expect(resultado.baseImponible).toBe(25_000);
    expect(resultado.impuesto).toBe(1_250);
    expect(resultado.impuestoAPagar).toBe(1_250);
    expect(resultado.bonificacionProntoPago).toBe(0);
    expect(resultado.totalAPagar).toBe(1_250);
  });

  it('iguala a cero todo importe que resultaría negativo', () => {
    const resultado = cierreAnual(
      makeCierre({
        ingresos: 40_000,
        gastos: 20_000,
        cuotasPagadas: 1_000,
      }),
    );

    expect(resultado.baseImponible).toBe(0);
    expect(resultado.impuesto).toBe(0);
    expect(resultado.impuestoAPagar).toBe(0);
    expect(resultado.bonificacionProntoPago).toBe(0);
    expect(resultado.totalAPagar).toBe(0);
  });

  it('aplica el mínimo exento antes de la escala', () => {
    expect(cierreAnual(makeCierre({ ingresos: 39_120 })).baseImponible).toBe(0);
    expect(cierreAnual(makeCierre({ ingresos: 39_121 })).baseImponible).toBe(1);
  });
});

describe('onat-taxonomy', () => {
  it('mapea cada tipo fiscal con su código y su fila del DJ-08', () => {
    expect(ONAT_TAXONOMY[ExpenseType.ImpuestoVentas]).toMatchObject({
      codigoOnat: '011402',
      seccionDj08: 'F',
      filaDj08: 37,
      deducibleDeLaBase: true,
      pagoACuenta: false,
    });
    expect(ONAT_TAXONOMY[ExpenseType.FuerzaTrabajo]).toMatchObject({
      codigoOnat: '061032',
      seccionDj08: 'F',
      filaDj08: 38,
    });
    expect(ONAT_TAXONOMY[ExpenseType.ImpuestoSellos]).toMatchObject({
      codigoOnat: '073012',
      seccionDj08: 'F',
      filaDj08: 39,
    });
    expect(ONAT_TAXONOMY[ExpenseType.Anuncios]).toMatchObject({
      codigoOnat: '090012',
      seccionDj08: 'F',
      filaDj08: 40,
    });
    expect(ONAT_TAXONOMY[ExpenseType.ContribucionEspecialSeguridadSocial]).toMatchObject({
      codigoOnat: '082013',
      seccionDj08: 'F',
      filaDj08: 41,
    });
    expect(ONAT_TAXONOMY[ExpenseType.ContribucionSeguridadSocial]).toMatchObject({
      codigoOnat: '081013',
      seccionDj08: 'F',
      filaDj08: 42,
    });
    expect(ONAT_TAXONOMY[ExpenseType.Impuesto]).toMatchObject({
      codigoOnat: null,
      seccionDj08: 'F',
      filaDj08: 43,
      deducibleDeLaBase: true,
    });
    expect(ONAT_TAXONOMY[ExpenseType.CuotaMensual]).toMatchObject({
      codigoOnat: '051012',
      seccionDj08: 'C',
      filaDj08: 22,
      deducibleDeLaBase: false,
      pagoACuenta: true,
    });
    expect(ONAT_TAXONOMY[ExpenseType.ContribucionZonas]).toMatchObject({
      codigoOnat: null,
      seccionDj08: 'B',
      filaDj08: 15,
    });
    expect(ONAT_TAXONOMY[ExpenseType.ArrendamientoEntidades]).toMatchObject({
      codigoOnat: null,
      seccionDj08: 'B',
      filaDj08: 16,
    });
    expect(ONAT_TAXONOMY[ExpenseType.ExoneracionReparaciones]).toMatchObject({
      codigoOnat: null,
      seccionDj08: 'B',
      filaDj08: 17,
    });
  });

  it('solo considera fiscales a los tipos presentes en la tabla', () => {
    expect(isFiscalExpenseType(ExpenseType.CuotaMensual)).toBe(true);
    expect(isFiscalExpenseType(ExpenseType.ImpuestoVentas)).toBe(true);
    expect(isFiscalExpenseType(ExpenseType.Salario)).toBe(false);
    expect(isFiscalExpenseType(ExpenseType.Otro)).toBe(false);
    expect(isFiscalExpenseType(ExpenseType.Impuesto)).toBe(true);
    expect(ONAT_TAXONOMY[ExpenseType.Salario]).toBeUndefined();
  });
});

describe('onat-storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('devuelve una configuración vacía cuando el Owner no tiene datos', () => {
    expect(getOnatConfig(OWNER_ID)).toEqual({
      ownerId: OWNER_ID,
      nombre: '',
      nit: '',
      domicilioFiscal: '',
      domicilioLegal: '',
      municipio: '',
      provincia: '',
      actividades: [],
    });
  });

  it('persiste y recupera la configuración del Owner', () => {
    const config = {
      ownerId: OWNER_ID,
      nombre: 'Bodega Liz',
      nit: '12345678901',
      domicilioFiscal: 'Calle 1 # 2',
      domicilioLegal: 'Calle 3 # 4',
      municipio: 'Centro Habana',
      provincia: 'La Habana',
      actividades: [{ nombre: 'Comercio minorista', codigo: '4711' }],
    };

    saveOnatConfig(config);

    expect(getOnatConfig(OWNER_ID)).toEqual(config);
  });

  it('normaliza datos corruptos sin lanzar', () => {
    localStorage.setItem(CONFIG_KEY, '{esto no es json');

    expect(getOnatConfig(OWNER_ID)).toEqual({
      ownerId: OWNER_ID,
      nombre: '',
      nit: '',
      domicilioFiscal: '',
      domicilioLegal: '',
      municipio: '',
      provincia: '',
      actividades: [],
    });
  });

  it('conserva el original congelado al editar dos veces el mismo campo (S3)', () => {
    setOnatOverride(OWNER_ID, 2026, 3, 'ingresos', 298_000, 312_500);
    const segundo = setOnatOverride(OWNER_ID, 2026, 3, 'ingresos', 999_999, 350_000);

    expect(segundo['2026']?.['3']?.ingresos).toMatchObject({
      original: 298_000,
      value: 350_000,
    });
    expect(getOnatOverrides(OWNER_ID)['2026']?.['3']?.ingresos?.original).toBe(298_000);
  });

  it('mantiene independientes los overrides de ingresos y gastos', () => {
    setOnatOverride(OWNER_ID, 2026, 3, 'ingresos', 298_000, 312_500);
    const overrides = setOnatOverride(OWNER_ID, 2026, 3, 'gastos', 100_000, 90_000);

    expect(overrides['2026']?.['3']?.ingresos?.original).toBe(298_000);
    expect(overrides['2026']?.['3']?.gastos?.original).toBe(100_000);
    expect(overrides['2026']?.['3']?.gastos?.value).toBe(90_000);
  });

  it('es SSR-safe: sin window devuelve el valor por defecto sin tocar localStorage', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    vi.stubGlobal('window', undefined);

    try {
      expect(getOnatConfig(OWNER_ID)).toEqual({
        ownerId: OWNER_ID,
        nombre: '',
        nit: '',
        domicilioFiscal: '',
        domicilioLegal: '',
        municipio: '',
        provincia: '',
        actividades: [],
      });
      expect(getOnatOverrides(OWNER_ID)).toEqual({});
      expect(setOnatOverride(OWNER_ID, 2026, 3, 'ingresos', 1, 2)).toEqual({});
      expect(getItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      getItem.mockRestore();
    }
  });
});
