// Copyright (c) 2019 Jon P Smith, GitHub: JonPSmith, web: http://www.thereformedprogrammer.net/
// Licensed under MIT license. See License.txt in the project root for license information.

using Microsoft.AspNetCore.Authorization;

namespace SMCA.WebApi.PolicyCode
{
    public class FeatureTypeRequirement : IAuthorizationRequirement
    {
        public FeatureTypeRequirement(string featureTypeName)
        {
            FeatureTypeName = featureTypeName ?? throw new ArgumentNullException(nameof(featureTypeName));
        }

        public string FeatureTypeName { get; }
    }
}