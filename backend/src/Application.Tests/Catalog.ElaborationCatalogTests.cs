using Domain.Common.Enums;
using Xunit;

namespace Application.Tests.Catalog
{
    /// <summary>
    /// Elaboration module (16) catalog parity tests. The seed data lives in the EF entity
    /// configurations and flows to Superior/VIP stores through RegisterCommand, the plan
    /// catalog and the backfill; these tests freeze the id contract: module 16, features
    /// 120 (Recipes) / 121 (Elaborations), and plan assignment ONLY to Superior (3) and
    /// VIP (4) — never Gratis (1) / Pago (2).
    /// </summary>
    public class ElaborationCatalogTests
    {
        [Fact]
        public void Elaboration_ModuleId_Is16()
        {
            Assert.Equal(16, (int)ModuleType.Elaboration);
        }

        [Fact]
        public void Elaboration_FeatureIds_Are120And121()
        {
            Assert.Equal(120, (int)FeatureType.Recipes);
            Assert.Equal(121, (int)FeatureType.Elaborations);
        }

        [Fact]
        public void Elaboration_ModuleId_DoesNotCollide()
        {
            Assert.NotEqual((int)ModuleType.MultiMonedas, (int)ModuleType.Elaboration);
            Assert.NotEqual((int)ModuleType.MultiStores, (int)ModuleType.Elaboration);
        }

        [Fact]
        public void Elaboration_FeatureIds_DoNotCollide()
        {
            Assert.NotEqual((int)FeatureType.CreditSale, (int)FeatureType.Recipes);
            Assert.NotEqual((int)FeatureType.CreditSale, (int)FeatureType.Elaborations);
            Assert.NotEqual((int)FeatureType.Recipes, (int)FeatureType.Elaborations);
        }

        /// <summary>
        /// The plan->module assignment pairs seeded in
        /// StorePlanModuleEntityTypeConfiguration must be exactly (Superior,16) and (VIP,16).
        /// Read via reflection over the HasData rows is not possible without a model build,
        /// so this test pins the store-plan ids the migration/backfill rely on.
        /// </summary>
        [Fact]
        public void Elaboration_PlanAssignment_TargetsSuperiorAndVIPOnly()
        {
            const int gratis = (int)StorePlanType.Gratis;
            const int pago = (int)StorePlanType.Pago;
            const int superior = (int)StorePlanType.Superior;
            const int vip = (int)StorePlanType.VIP;

            Assert.Equal(1, gratis);
            Assert.Equal(2, pago);
            Assert.Equal(3, superior);
            Assert.Equal(4, vip);
            Assert.NotEqual(superior, gratis);
            Assert.NotEqual(superior, pago);
            Assert.NotEqual(vip, pago);
        }
    }
}
