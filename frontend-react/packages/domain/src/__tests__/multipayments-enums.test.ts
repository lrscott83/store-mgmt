import { describe, expect, it } from 'vitest';
import { EFeatures, EModules } from '../enums';

describe('MultiPayments mirrors (backend parity)', () => {
  it('EModules.MultiPayments = 16 (ModuleType.MultiPayments backend)', () => {
    expect(EModules.MultiPayments).toBe(16);
  });

  it('EFeatures.MultiPayments = 44 (FeatureType.MultiPayments backend)', () => {
    expect(EFeatures.MultiPayments).toBe(44);
  });

  it('does not collide with the existing MultiMonedas ids', () => {
    expect(EModules.MultiMonedas).toBe(15);
    expect(EFeatures.MultiMonedas).toBe(43);
    expect(EModules.MultiPayments).not.toBe(EModules.MultiMonedas);
    expect(EFeatures.MultiPayments).not.toBe(EFeatures.MultiMonedas);
  });
});
