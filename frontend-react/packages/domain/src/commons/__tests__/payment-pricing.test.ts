import { describe, expect, it } from 'vitest';
import {
  Currency,
  PaymentType,
  SalePaymentMethod,
} from '../../enums';
import {
  applyPaymentPricing,
  defaultPaymentMethodForCurrency,
  isCashMethod,
  paymentMethodOptionsForCurrency,
  paymentPricingFor,
} from '../payment-pricing';
import {
  legacyPaymentTypeToSalePaymentMethod,
  salePaymentMethodLabel,
  salePaymentMethodToLegacyPaymentType,
} from '../sale-payment-method-compat';

describe('paymentMethodOptionsForCurrency (catálogo §3 del plan)', () => {
  it('CUP → Efectivo + Transferencia', () => {
    expect(paymentMethodOptionsForCurrency(Currency.CUP)).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Transferencia,
    ]);
  });

  it('USD → Efectivo + Zelle + Transferencia', () => {
    expect(paymentMethodOptionsForCurrency(Currency.USD)).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
      SalePaymentMethod.Transferencia,
    ]);
  });

  it('EUR/CAD/MXN → solo Efectivo', () => {
    for (const c of [Currency.EUR, Currency.CAD, Currency.MXN]) {
      expect(paymentMethodOptionsForCurrency(c)).toEqual([SalePaymentMethod.Efectivo]);
    }
  });

  it('MLC/CLA → solo Transferencia (no hay efectivo)', () => {
    for (const c of [Currency.MLC, Currency.CLA]) {
      expect(paymentMethodOptionsForCurrency(c)).toEqual([SalePaymentMethod.Transferencia]);
    }
  });

  it('defaultPaymentMethodForCurrency devuelve el primero del catálogo', () => {
    expect(defaultPaymentMethodForCurrency(Currency.CUP)).toBe(SalePaymentMethod.Efectivo);
    expect(defaultPaymentMethodForCurrency(Currency.MLC)).toBe(SalePaymentMethod.Transferencia);
  });
});

describe('paymentPricingFor + applyPaymentPricing (percent/tax, defaults 0/0)', () => {
  const currencies = Object.values(Currency).filter((v): v is Currency => typeof v === 'number');
  const methods = Object.values(SalePaymentMethod).filter(
    (v): v is SalePaymentMethod => typeof v === 'number',
  );

  it('el barrido cubre todos los miembros numéricos de ambos enums', () => {
    const numericMemberCount = (e: object) =>
      Object.keys(e).filter((k) => Number.isNaN(Number(k))).length;
    expect(currencies).toHaveLength(numericMemberCount(Currency));
    expect(methods).toHaveLength(numericMemberCount(SalePaymentMethod));
  });

  it('toda combinación sin entrada en la tabla cae en percent 0 / tax 0', () => {
    for (const c of currencies) {
      for (const m of methods) {
        expect(paymentPricingFor(c, m)).toEqual({ percent: 0, tax: 0 });
      }
    }
  });

  it('con defaults 0/0 el total base no cambia (no-regresión)', () => {
    expect(applyPaymentPricing(1234.56, { percent: 0, tax: 0 })).toBe(1234.56);
  });

  it('ejemplo del plan: 100 con percent 1 y tax 10 → 111', () => {
    expect(applyPaymentPricing(100, { percent: 1, tax: 10 })).toBe(111);
  });

  it('redondea a 2 decimales', () => {
    expect(applyPaymentPricing(10.55, { percent: 15, tax: 0.004 })).toBe(12.14);
  });
});

describe('adaptador legacy PaymentType → SalePaymentMethod', () => {
  it('Efectivo → Efectivo', () => {
    expect(legacyPaymentTypeToSalePaymentMethod(PaymentType.Efectivo, Currency.CUP)).toEqual({
      method: SalePaymentMethod.Efectivo,
      currency: Currency.CUP,
    });
  });

  it('Tarjeta histórico → Transferencia en CUP (reemplazo acordado)', () => {
    const r = legacyPaymentTypeToSalePaymentMethod(PaymentType.Tarjeta, Currency.USD);
    expect(r.method).toBe(SalePaymentMethod.Transferencia);
    expect(r.currency).toBe(Currency.CUP);
  });

  it('Zelle → Zelle', () => {
    expect(legacyPaymentTypeToSalePaymentMethod(PaymentType.Zelle, Currency.CUP).method).toBe(
      SalePaymentMethod.Zelle,
    );
  });

  it('ausente → Efectivo (default histórico)', () => {
    expect(legacyPaymentTypeToSalePaymentMethod(undefined, Currency.CUP).method).toBe(
      SalePaymentMethod.Efectivo,
    );
    expect(legacyPaymentTypeToSalePaymentMethod(null, Currency.CUP).method).toBe(
      SalePaymentMethod.Efectivo,
    );
  });
});

describe('salePaymentMethodToLegacyPaymentType (escritura del campo legacy)', () => {
  it('Efectivo → Efectivo y Zelle → Zelle', () => {
    expect(salePaymentMethodToLegacyPaymentType(SalePaymentMethod.Efectivo, Currency.CUP)).toBe(
      PaymentType.Efectivo,
    );
    expect(salePaymentMethodToLegacyPaymentType(SalePaymentMethod.Zelle, Currency.USD)).toBe(
      PaymentType.Zelle,
    );
  });

  it('Transferencia-CUP → Tarjeta (compatibilidad de datos)', () => {
    expect(salePaymentMethodToLegacyPaymentType(SalePaymentMethod.Transferencia, Currency.CUP)).toBe(
      PaymentType.Tarjeta,
    );
  });

  it('Transferencia en otra moneda → Efectivo (sin equivalente legacy)', () => {
    expect(
      salePaymentMethodToLegacyPaymentType(SalePaymentMethod.Transferencia, Currency.USD),
    ).toBe(PaymentType.Efectivo);
  });
});

describe('etiquetas y helpers', () => {
  it('la transferencia siempre muestra su moneda entre paréntesis', () => {
    expect(salePaymentMethodLabel(SalePaymentMethod.Transferencia, Currency.CUP)).toBe(
      'Transferencia (CUP)',
    );
    expect(salePaymentMethodLabel(SalePaymentMethod.Transferencia, Currency.USD)).toBe(
      'Transferencia (USD)',
    );
  });

  it('Efectivo y Zelle no llevan moneda', () => {
    expect(salePaymentMethodLabel(SalePaymentMethod.Efectivo, Currency.USD)).toBe('Efectivo');
    expect(salePaymentMethodLabel(SalePaymentMethod.Zelle, Currency.USD)).toBe('Zelle');
  });

  it('solo Efectivo es método de efectivo (vuelto aplica)', () => {
    expect(isCashMethod(SalePaymentMethod.Efectivo)).toBe(true);
    expect(isCashMethod(SalePaymentMethod.Transferencia)).toBe(false);
    expect(isCashMethod(SalePaymentMethod.Zelle)).toBe(false);
  });
});
