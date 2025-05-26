using Domain.Common.Attributes;
using Domain.Common.Enums;

namespace Domain.Common.Extensions
{
    public static class StoreRoleFeaturesExtensions
    {
        public static List<RoleType> GetRoles(this StoreRoleFeatures value)
        {
            HasRolesAttribute hasRolesAttribute = value.GetAttribute<HasRolesAttribute>();
            return hasRolesAttribute != null ? hasRolesAttribute.RoleTypes : [];
        }

        public static bool HasFeature(this StoreRoleFeatures value, int featureId)
        {
            HasFeatureAttribute hasFeatureAttribute = value.GetAttribute<HasFeatureAttribute>();
            return hasFeatureAttribute != null && (int)hasFeatureAttribute.FeatureType == featureId;
        }

        public static bool IsSuperAdmin(this StoreRoleFeatures value)
        {
            return value == StoreRoleFeatures.SuperAdmin;
        }

        public static FeatureType? GetFeatureType(this StoreRoleFeatures value)
        {
            HasFeatureAttribute hasFeatureAttribute = value.GetAttribute<HasFeatureAttribute>();
            return hasFeatureAttribute?.FeatureType;
        }

        public static ModuleType? GetModuleType(this StoreRoleFeatures value)
        {
            HasModuleAttribute hasModuleAttribute = value.GetAttribute<HasModuleAttribute>();
            return hasModuleAttribute?.ModuleType;
        }
    }
}
