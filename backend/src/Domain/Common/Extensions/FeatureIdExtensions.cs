using Domain.Common.Enums;

namespace Domain.Common.Extensions
{
    public static class FeatureIdExtensions
    {
        public static string PackFeatureIdsIntoString(this IEnumerable<int> featureIds)
        {
            var res = featureIds.Aggregate("", (s, featureId) => s + (char)featureId);
            return res;
        }

        public static IEnumerable<FeatureType> UnpackFeatureTypesFromString(this string packedFeatureTypes)
        {
            if (packedFeatureTypes == null)
                throw new ArgumentNullException(nameof(packedFeatureTypes));
            foreach (var character in packedFeatureTypes)
            {
                yield return ((FeatureType)character);
            }
        }

        public static FeatureType? FindFeatureTypeViaName(this string featureTypeName)
        {
            return Enum.TryParse(featureTypeName, out FeatureType featureType)
                ? featureType
                : null;
        }        
    }
}
