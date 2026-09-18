import { describe, expect, it } from 'vitest';
import { EFeatures, EModules } from '../enums';

describe('Elaboration mirrors (backend parity)', () => {
  it('EModules.Elaboration = 17 (ModuleType.Elaboration backend)', () => {
    expect(EModules.Elaboration).toBe(17);
  });

  it('EFeatures.Recipes = 120 (FeatureType.Recipes backend)', () => {
    expect(EFeatures.Recipes).toBe(120);
  });

  it('EFeatures.Elaborations = 121 (FeatureType.Elaborations backend)', () => {
    expect(EFeatures.Elaborations).toBe(121);
  });

  it('does not collide with existing ids', () => {
    expect(EModules.MultiMonedas).toBe(15);
    expect(EModules.MultiStores).toBe(14);
    expect(EFeatures.CreditSale).toBe(110);
    expect(EFeatures.CreditsHistory).toBe(103);
    expect(EFeatures.Recipes).not.toBe(EFeatures.Elaborations);
  });
});
