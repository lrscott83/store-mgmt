using Domain.Common.Enums;

namespace Domain.Common.Attributes
{
    public class HasFeatureAttribute : Attribute
    {
        public FeatureType FeatureType { get; private set; }
        public HasFeatureAttribute(FeatureType featureType)
        {
            FeatureType = featureType;
        }
    }
}
