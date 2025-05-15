using Domain.Common.Enums;
using Domain.Common.Extensions;
using Microsoft.AspNetCore.Authorization;

namespace WebApiTest.Filters
{
    [AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, Inherited = false)]
    public class HasFeatureAttribute : AuthorizeAttribute
    {
        public HasFeatureAttribute(params FeatureType[] featureTypes)
            : base(string.Join(FeatureChecker.FeatureDelimiter, featureTypes)) { }
    }
}