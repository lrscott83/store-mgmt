using Domain.Common.Attributes;

namespace Domain.Common.Enums
{
    public enum StoreRoleFeatures
    {
        #region Super Admin and ReSeller features

        [HasRoles(RoleType.SuperAdmin)]        
        SuperAdmin,

        [HasRoles(RoleType.SuperAdmin, RoleType.ReSeller)]
        [HasFeature(FeatureType.Owners)]
        OwnersAdmin,

        [HasRoles(RoleType.SuperAdmin)]
        [HasFeature(FeatureType.ReSellers)]
        ReSellerAdmin,

        [HasRoles(RoleType.SuperAdmin)]
        [HasFeature(FeatureType.Roles)]
        RolesAdmin,

        [HasRoles(RoleType.SuperAdmin)]
        [HasFeature(FeatureType.Features)]
        FeaturesAdmin,

        #endregion

        #region Sales features

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.Products)]
        [HasModule(ModuleType.Sales)]
        ProductsAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.Sale)]
        [HasModule(ModuleType.Sales)]
        SaleAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.TodayOrders)]
        [HasModule(ModuleType.Sales)]
        TodayOrdersAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.TodayOrdersStats)]
        [HasModule(ModuleType.Sales)]
        TodayOrdersStatsAdmin,

        #endregion

        #region Inventory features

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Available)]
        [HasModule(ModuleType.Inventory)]
        AvailableAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Entries)]
        [HasModule(ModuleType.Inventory)]
        EntriesAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Egress)]
        [HasModule(ModuleType.Inventory)]
        EgressAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.TodayInventoryStats)]
        [HasModule(ModuleType.Inventory)]
        TodayInventoryStatsAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.InventoryTodayQuantities)]
        [HasModule(ModuleType.Inventory)]
        InventoryTodayQuantitiesAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.InventoryTodaySaleProfit)]
        [HasModule(ModuleType.Inventory)]
        InventoryTodaySaleProfitAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Warehouses)]
        [HasModule(ModuleType.Warehouses)]
        WarehousesAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.WarehouseStockMovements)]
        [HasModule(ModuleType.Warehouses)]
        WarehouseStockMovementsAdmin,

        #endregion

        #region Expenses features

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.TodayExpenses)]
        [HasModule(ModuleType.Expenses)]
        TodayExpensesAdmin,

        #endregion

        #region Billing features

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.Billing)]
        [HasModule(ModuleType.Billing)]
        BillingAdmin,

        [HasRoles(RoleType.SuperAdmin, RoleType.ReSeller)]
        [HasFeature(FeatureType.StorePayment)]
        StorePaymentAdmin,

        #endregion

        #region Histories features

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.SalesHistory)]
        [HasModule(ModuleType.Histories)]
        SalesHistoryAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.EntriesHistory)]
        [HasModule(ModuleType.Histories)]
        EntriesHistoryAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.ExpensesHistory)]
        [HasModule(ModuleType.Histories)]
        ExpensesHistoryAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.CreditsHistory)]
        [HasModule(ModuleType.Histories)]
        CreditsHistoryAdmin,

        #endregion

        #region Credits features

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.CreditSale)]
        [HasModule(ModuleType.Credits)]
        CreditSaleAdmin,

        #endregion

        #region Synchronization features

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.Send)]
        [HasModule(ModuleType.Synchronization)]
        SendAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.Download)]
        [HasModule(ModuleType.Synchronization)]
        DownloadAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.Receive)]
        [HasModule(ModuleType.Synchronization)]
        ReceiveAdmin,

        #endregion

        #region Reports features

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.TodayReports)]
        [HasModule(ModuleType.Reports)]
        TodayReportsAdmin,

        #endregion

        #region Statistics features

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Dashboard)]
        [HasModule(ModuleType.Statistics)]
        DashboardAdmin,

        #endregion

        #region Management features

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser, RoleType.ReSeller)]
        [HasFeature(FeatureType.Profile)]
        [HasModule(ModuleType.Management)]
        ProfileAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Users)]
        [HasModule(ModuleType.Management)]
        UsersAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Stores)]
        [HasModule(ModuleType.Management)]
        StoresAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Configurations)]
        [HasModule(ModuleType.Management)]
        ConfigurationsAdmin,

        #endregion

        #region MultiMonedas features

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.MultiMonedas)]
        [HasModule(ModuleType.MultiMonedas)]
        MultiMonedasAdmin,

        #endregion

        #region MultiPayments features

        // MultiPayments (feature 44, module 16) is VIP-only: module 16 is assigned only
        // to the VIP plan (StorePlanModuleEntityTypeConfiguration), so the generator
        // materializes 44 solely for VIP stores. Both the owner and store users of a
        // VIP store pay a sale with several payment channels, so mirror SaleAdmin.
        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.MultiPayments)]
        [HasModule(ModuleType.MultiPayments)]
        MultiPaymentsAdmin,

        #endregion

        #region Elaboración features

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Recipes)]
        [HasModule(ModuleType.Elaboration)]
        RecipesAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Elaborations)]
        [HasModule(ModuleType.Elaboration)]
        ElaborationsAdmin,

        #endregion

        #region WholesaleSales features

        // WholesaleSales (feature 39, module 12) is the wholesale flavour of the normal
        // sale: /sales/wholesale is gated by EFeatures.Sale and is performed by both the
        // owner and store users. Mirror SaleAdmin so both roles receive the feature.
        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.WholesaleSales)]
        [HasModule(ModuleType.WholesaleSales)]
        WholesaleSalesAdmin,

        #endregion

        #region MultiStores features

        // OwnerStores (feature 38, module 14) is the owner-scoped "Mis tiendas" capability:
        // the store switcher is owner-only (isOwnerAdmin) and Management/Stores is
        // OwnerAdmin-only. Mirror StoresAdmin — no StoreUser role.
        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.OwnerStores)]
        [HasModule(ModuleType.MultiStores)]
        MultiStoresAdmin,

        #endregion
    }
}