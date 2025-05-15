// Copyright (c) 2018 Jon P Smith, GitHub: JonPSmith, web: http://www.thereformedprogrammer.net/
// Licensed under MIT license. See License.txt in the project root for license information.

using Domain.Common.Enums;
using System.ComponentModel;

namespace Domain.Common.Extensions
{
    public static class FeatureChecker
    {
        public static readonly string FeatureDelimiter = "|";

        /// <summary>
        /// This is used by the policy provider to check the featureType name string
        /// </summary>
        /// <param name="packedFeatureTypes"></param>
        /// <param name="featureTypeName"></param>
        /// <returns></returns>
        public static bool ThisFeatureIsAllowed(this string packedFeatureTypes, string featureTypeName)
        {
            var usersFeatureTypes = packedFeatureTypes.UnpackFeatureTypesFromString().ToArray();

            string[] featureTypes = featureTypeName.Split(FeatureDelimiter);

            return featureTypes.Any(featureType =>
            {
                if (!Enum.TryParse(featureType, true, out FeatureType featureTypeToCheck))
                    throw new InvalidEnumArgumentException($"{featureTypeName} could not be converted to a {nameof(FeatureType)}.");

                return usersFeatureTypes.UserHasThisFeature(featureTypeToCheck);
            });

        }

        /// <summary>
        /// This is the main checker of whether a user featureTypes allows them to access something with the given featureType
        /// </summary>
        /// <param name="usersFeatureTypes"></param>
        /// <param name="featureTypeToCheck"></param>
        /// <returns></returns>
        public static bool UserHasThisFeature(this FeatureType[] usersFeatureTypes, FeatureType featureTypeToCheck)
        {
            return usersFeatureTypes.Contains(featureTypeToCheck);
        }
    }
}