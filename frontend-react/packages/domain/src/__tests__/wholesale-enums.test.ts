import { describe, expect, it } from 'vitest';
import { EFeatures, EModules } from '../enums';

describe('WholesaleSales mirrors (backend parity)', () => {
  it('EModules.WholesaleSales = 12 (ModuleType.WholesaleSales backend)', () => {
    expect(EModules.WholesaleSales).toBe(12);
  });

  it('EFeatures.WholesaleSales = 39 (FeatureType.WholesaleSales backend)', () => {
    expect(EFeatures.WholesaleSales).toBe(39);
  });

  it('does not collide with the generic Sale ids', () => {
    expect(EModules.Sales).toBe(2);
    expect(EFeatures.Sale).toBe(21);
    expect(EModules.WholesaleSales).not.toBe(EModules.Sales);
    expect(EFeatures.WholesaleSales).not.toBe(EFeatures.Sale);
  });
});