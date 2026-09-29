using Domain.Common.Enums;
using Infrastructure.Migrations;
using Xunit;

namespace Application.Tests.Catalog
{
    /// <summary>
    /// WebCatalog module (18) catalog parity tests. The seed data lives in the EF entity
    /// configurations and flows to Superior and VIP stores through RegisterCommand, the plan
    /// catalog and the backfill; these tests freeze the id contract: module 18, feature 122
    /// (Catálogo web), and plan assignment to Superior (3) and VIP (4) — plans are
    /// self-contained (owner decision 2026-09-28, amends D5). Never Gratis (1) or Pago (2).
    /// </summary>
    public class WebCatalogCatalogTests
    {
        [Fact]
        public void WebCatalog_ModuleId_Is18()
        {
            Assert.Equal(18, (int)ModuleType.WebCatalog);
        }

        [Fact]
        public void WebCatalog_FeatureId_Is122()
        {
            Assert.Equal(122, (int)FeatureType.WebCatalog);
        }

        [Fact]
        public void WebCatalog_ModuleId_DoesNotCollide()
        {
            Assert.NotEqual((int)ModuleType.Elaboration, (int)ModuleType.WebCatalog);
            Assert.NotEqual((int)ModuleType.MultiPayments, (int)ModuleType.WebCatalog);
            Assert.NotEqual((int)ModuleType.MultiMonedas, (int)ModuleType.WebCatalog);
        }

        [Fact]
        public void WebCatalog_FeatureId_DoesNotCollide()
        {
            Assert.NotEqual((int)FeatureType.Elaborations, (int)FeatureType.WebCatalog);
            Assert.NotEqual((int)FeatureType.Recipes, (int)FeatureType.WebCatalog);
        }

        /// <summary>
        /// The plan->module assignment is pinned to Superior (3) AND VIP (4). Plans are
        /// SELF-CONTAINED (owner decision 2026-09-28): every Superior module is in VIP too,
        /// so the seed and the backfill must include both (amends D5, 2026-09-27).
        /// </summary>
        [Fact]
        public void WebCatalog_PlanAssignment_TargetsSuperiorAndVip()
        {
            const int superior = (int)StorePlanType.Superior;
            const int vip = (int)StorePlanType.VIP;

            Assert.Equal(3, superior);
            Assert.Equal(4, vip);
            Assert.NotEqual(superior, vip);
        }

        /// <summary>
        /// Backfill (migration + VPS script, one shared source of truth) targets Superior (3)
        /// and VIP (4): the WHERE clause is `s."StorePlanId" IN (3, 4)` — asserted against the
        /// real SQL text.
        /// </summary>
        [Fact]
        public void WebCatalogBackfill_TargetsSuperiorAndVipPlans()
        {
            Assert.Contains("s.\"StorePlanId\" IN (3, 4)", WebCatalogModuleBackfill.StoreModuleSql);
            Assert.Contains("s.\"StorePlanId\" IN (3, 4)", WebCatalogModuleBackfill.StoreRoleFeatureSql);
        }

        /// <summary>
        /// The per-store rows match the module catalog: module 18 with price 5 and 100 %
        /// discount, and feature 122 granted ONLY to OwnerAdmin (2).
        /// </summary>
        [Fact]
        public void WebCatalogBackfill_PinsModulePriceAndOwnerAdminFeature()
        {
            Assert.Equal(18, WebCatalogModuleBackfill.ModuleId);
            Assert.Equal(122, WebCatalogModuleBackfill.WebCatalogFeatureId);
            Assert.Equal(2, WebCatalogModuleBackfill.OwnerAdminRoleId);

            Assert.Contains("SELECT s.\"Id\", 18, FALSE, 5, 5, 0, 100", WebCatalogModuleBackfill.StoreModuleSql);
            Assert.Contains("SELECT s.\"Id\", 2, f.\"Id\"", WebCatalogModuleBackfill.StoreRoleFeatureSql);
            Assert.Contains("(VALUES (122))", WebCatalogModuleBackfill.StoreRoleFeatureSql);
        }
    }
}
