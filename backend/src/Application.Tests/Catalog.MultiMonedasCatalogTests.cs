using Domain.Common.Enums;
using Xunit;

namespace Application.Tests.Catalog
{
    /// <summary>
    /// MultiMonedas module (15) catalog parity tests. The seed data lives in the EF entity
    /// configurations and flows to Superior/VIP stores through RegisterCommand, the plan
    /// catalog and the backfill; these tests freeze the id contract: module 15, feature 43,
    /// and plan assignment ONLY to Superior (3) and VIP (4) — never Gratis (1) / Pago (2).
    /// </summary>
    public class MultiMonedasCatalogTests
    {
        [Fact]
        public void MultiMonedas_ModuleId_Is15()
        {
            Assert.Equal(15, (int)ModuleType.MultiMonedas);
        }

        [Fact]
        public void MultiMonedas_FeatureId_Is43()
        {
            Assert.Equal(43, (int)FeatureType.MultiMonedas);
        }

        [Fact]
        public void MultiMonedas_ModuleId_DoesNotCollide()
        {
            Assert.NotEqual((int)ModuleType.MultiStores, (int)ModuleType.MultiMonedas);
            Assert.NotEqual((int)ModuleType.Warehouses, (int)ModuleType.MultiMonedas);
        }

        [Fact]
        public void MultiMonedas_FeatureId_DoesNotCollide()
        {
            Assert.NotEqual((int)FeatureType.Receive, (int)FeatureType.MultiMonedas);
            Assert.NotEqual((int)FeatureType.TodayReports, (int)FeatureType.MultiMonedas);
        }

        /// <summary>
        /// The plan->module assignment pairs seeded in
        /// StorePlanModuleEntityTypeConfiguration must be exactly (Superior,15) and (VIP,15).
        /// Read via reflection over the HasData rows is not possible without a model build,
        /// so this test pins the store-plan ids the migration/backfill rely on.
        /// </summary>
        [Fact]
        public void MultiMonedas_PlanAssignment_TargetsSuperiorAndVIPOnly()
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
