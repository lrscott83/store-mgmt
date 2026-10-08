using Infrastructure.Migrations;
using Xunit;

namespace Application.Tests.Catalog
{
    /// <summary>
    /// Contract parity for the two modules split out of "Catálogo web" (18) on 2026-10-08 —
    /// "Pedidos WhatsApp" (19) and "Gestión de pedidos" (20). The per-store half of the change is
    /// raw SQL (EF cannot express per-row, per-store data from the model), so the shared
    /// <see cref="PedidosModulesBackfill"/> constants ARE the contract: the EF migration Up/Down and
    /// backend/scripts/31-*.sql embed this exact text. These tests freeze the decisions that a
    /// careless edit to those constants would silently break.
    /// </summary>
    public class PedidosModulesBackfillTests
    {
        [Fact]
        public void Backfill_PinsTheModuleAndFeatureIdContract()
        {
            Assert.Equal(18, PedidosModulesBackfill.WebCatalogModuleId);
            Assert.Equal(19, PedidosModulesBackfill.PedidosWhatsAppModuleId);
            Assert.Equal(20, PedidosModulesBackfill.GestionPedidosModuleId);
            Assert.Equal(123, PedidosModulesBackfill.OnlineOrdersFeatureId);
            Assert.Equal(124, PedidosModulesBackfill.PedidosWhatsAppFeatureId);
            Assert.Equal(2, PedidosModulesBackfill.OwnerAdminRoleId);
            Assert.Equal(3, PedidosModulesBackfill.StoreUserRoleId);
        }

        /// <summary>
        /// The universe is the ACTIVE stores that already hold module 18 — NOT StorePlanId, because a
        /// store can hold module 18 by negotiation and a Superior store may never have activated it.
        /// The price literal (Price=10, 50 % percent discount, not included) mirrors the module catalog (M5).
        /// </summary>
        [Fact]
        public void StoreModuleSql_TargetsBothNewModulesOnTheWebCatalogUniverseAtTheCatalogPrice()
        {
            Assert.Contains("JOIN (VALUES (19), (20))", PedidosModulesBackfill.StoreModuleSql);
            Assert.Contains("sm.\"ModuleId\" = 18", PedidosModulesBackfill.StoreModuleSql);
            Assert.Contains("s.\"IsActive\" = TRUE", PedidosModulesBackfill.StoreModuleSql);
            Assert.Contains(
                "SELECT sm.\"StoreId\", v.\"ModuleId\", FALSE, 10, 10, 0, 50",
                PedidosModulesBackfill.StoreModuleSql);
        }

        /// <summary>
        /// Feature 124 (cart + its configuration) is OwnerAdmin-only (M4) and feature 123 (order
        /// management) is OwnerAdmin + StoreUser. The grant is deliberately driven by module 18, not
        /// module 20: tying it to 20 would hand order-management permissions to a store that only
        /// activated the WhatsApp module (M2/M3).
        /// </summary>
        [Fact]
        public void StoreRoleFeatureSql_GrantsWhatsAppToOwnerOnlyAndKeepsTheWebCatalogUniverse()
        {
            Assert.Contains(
                "JOIN (VALUES (2, 124), (2, 123), (3, 123))",
                PedidosModulesBackfill.StoreRoleFeatureSql);
            Assert.Contains("sm.\"ModuleId\" = 18", PedidosModulesBackfill.StoreRoleFeatureSql);
            Assert.DoesNotContain("(3, 124)", PedidosModulesBackfill.StoreRoleFeatureSql);
        }

        /// <summary>
        /// The broad DELETEs are MANDATORY, not sloppy: the generated Down() also removes Module 19/20
        /// and Feature 124, and those FKs are Restrict — so any StoreModule or StoreRoleFeature row
        /// surviving here would make the rollback raise a foreign-key violation. Feature 123 rows are
        /// left alone: they belong to the earlier 20261007021020 backfill, not to this one.
        /// </summary>
        [Fact]
        public void DownSql_RemovesTheRowsTheRestrictForeignKeysWouldOtherwiseBlock()
        {
            Assert.Contains("DELETE FROM \"StoreRoleFeature\"", PedidosModulesBackfill.DownSql);
            Assert.Contains("WHERE \"FeatureId\" = 124", PedidosModulesBackfill.DownSql);
            Assert.Contains("DELETE FROM \"StoreModule\"", PedidosModulesBackfill.DownSql);
            Assert.Contains("WHERE \"ModuleId\" IN (19, 20)", PedidosModulesBackfill.DownSql);
        }
    }
}