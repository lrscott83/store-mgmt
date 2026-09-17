import { describe, expect, it } from 'vitest';
import { EFeatures, EModules } from '../enums';

describe('MultiMonedas mirrors (backend parity)', () => {
  it('EModules.MultiMonedas = 15 (ModuleType.MultiMonedas backend)', () => {
    expect(EModules.MultiMonedas).toBe(15);
  });

  it('EFeatures.MultiMonedas = 43 (FeatureType.MultiMonedas backend)', () => {
    expect(EFeatures.MultiMonedas).toBe(43);
  });

  it('does not collide with existing ids', () => {
    expect(EModules.MultiStores).toBe(14);
    expect(EFeatures.Receive).toBe(42);
    expect(EFeatures.TodayReports).toBe(50);
  });
});
