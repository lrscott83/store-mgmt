using Domain.Common.Constants;
using Domain.Common.Extensions;
using Microsoft.AspNetCore.Authorization;

namespace SMCA.WebApi.PolicyCode
{
    public class FeatureTypeHandler : AuthorizationHandler<FeatureTypeRequirement>
    {
        protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, FeatureTypeRequirement requirement)
        {
            var isGlobalAdminClaim = context.User.Claims.FirstOrDefault(c => c.Type == StringValueUtils.SuperAdminClaim);
            // If user does have the global admin claim, it's authorized
            if (isGlobalAdminClaim != null && isGlobalAdminClaim.Value == "true")
            {
                context.Succeed(requirement);
                return Task.CompletedTask;
            }

            var isTenantAdminClaim = context.User.Claims.FirstOrDefault(c => c.Type == StringValueUtils.AdminClaim);
            // If user does have the tenant admin claim, it's authorized
            if (isTenantAdminClaim != null && isTenantAdminClaim.Value == "true")
            {
                context.Succeed(requirement);
                return Task.CompletedTask;
            }


            var permissionsClaim =
                context.User.Claims.SingleOrDefault(c => c.Type == StringValueUtils.FeaturesClaim);
            // If user does not have the scope claim, get out of here
            if (permissionsClaim == null)
                return Task.CompletedTask;

            if (permissionsClaim.Value.ThisFeatureIsAllowed(requirement.FeatureTypeName))
                context.Succeed(requirement);

            return Task.CompletedTask;
        }
    }
}