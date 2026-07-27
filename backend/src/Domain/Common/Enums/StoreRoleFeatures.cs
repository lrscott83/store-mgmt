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
    }
}