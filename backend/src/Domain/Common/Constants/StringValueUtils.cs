namespace Domain.Common.Constants
{
    public static class StringValueUtils
    {
        #region Role/Feature constants
        public static readonly string StoreNameSuffix = " (Tienda)";
        public static readonly string ModuleNameSuffix = " (Modulo)";
        public static readonly string FeatureNameSuffix = " (Funcionalidad)";
        #endregion

        #region Security constants
        public const string SuperAdminClaim = "super_admin";
        public const string AdminClaim = "admin";
        public const string ReSellerClaim = "reseller";
        public const string TenantIdClaim = "tenant_id";
        public const string OwnerIdClaim = "owner_id";
        public const string StoreIdClaim = "store_id";
        public const string FeaturesClaim = "features";
        #endregion
    }
}
