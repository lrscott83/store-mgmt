using Domain.Common.Enums;

namespace Domain.Common.Predicates
{
    public static class TenantPredicates
    {
        public static Func<int, bool> IsNotTenantFeature()
        {
            return featureId => featureId != (int)FeatureType.Tenants;
        }
    }
}
