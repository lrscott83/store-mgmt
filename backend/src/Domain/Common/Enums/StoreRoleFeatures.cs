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

        #endregion

        #region Sales features

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.Products)]
        ProductsAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.Sale)]
        SaleAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.TodayOrders)]
        TodayOrdersAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.TodayOrdersStats)]
        TodayOrdersStatsAdmin,

        #endregion

        #region Inventory features

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Available)]
        AvailableAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Entries)]
        EntriesAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.TodayInventoryStats)]
        TodayInventoryStatsAdmin,

        #endregion

        #region Synchronization features

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.Send)]
        SendAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.Download)]
        DownloadAdmin,

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser)]
        [HasFeature(FeatureType.Receive)]
        ReceiveAdmin,

        #endregion

        #region Reports features

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.TodayReports)]
        TodayReportsAdmin,

        #endregion

        #region Statistics features

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Dashboard)]
        DashboardAdmin,

        #endregion

        #region Management features

        [HasRoles(RoleType.OwnerAdmin, RoleType.StoreUser, RoleType.ReSeller)]
        [HasFeature(FeatureType.Profile)]
        ProfileAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Users)]
        UsersAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Stores)]
        StoresAdmin,

        [HasRoles(RoleType.OwnerAdmin)]
        [HasFeature(FeatureType.Configurations)]
        ConfigurationsAdmin,

        #endregion
    }
}