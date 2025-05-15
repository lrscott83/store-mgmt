using Domain.Common.Enums;
using Domain.Interfaces.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Domain.Common.Extensions;
using Application.Abstractions.HttpContext;

namespace WebApiTest.Filters
{
    public class HasApplicationRoleAttribute : TypeFilterAttribute
    {
        public HasApplicationRoleAttribute(params StoreRoleFeatures[] roles) 
            : base(typeof(HasApplicationRoleRequirementFilter))
        {
            Arguments = [roles];
        }
    }

    public class HasApplicationRoleRequirementFilter : IAuthorizationFilter
    {
        private readonly IUserRoleRepository _userRoleRepository;
        private readonly IHttpContextService _httpContextService;
        readonly StoreRoleFeatures[] _applicationRoles;

        public HasApplicationRoleRequirementFilter(StoreRoleFeatures[] applicationRoles, 
            IUserRoleRepository userRoleRepository, IHttpContextService httpContextService)
        {
            _userRoleRepository = userRoleRepository;
            _httpContextService = httpContextService;
            _applicationRoles = applicationRoles;
        }

        public void OnAuthorization(AuthorizationFilterContext context)
        {
            var currentUserId = _httpContextService?.UserExternalId;
            if (!string.IsNullOrEmpty(currentUserId))
            {
                // if user is not Super Admin, find out if it has any other authorized roles
                if (!_httpContextService.IsSuperAdmin)
                {
                    var hasApplicationRole = _userRoleRepository.HasPermission(currentUserId.ToGuid(), _applicationRoles).Result;
                    if (!hasApplicationRole)
                    {
                        context.Result = new ForbidResult();
                    }
                }
            }
            else
            {
                context.Result = new ForbidResult();
            }
        }
    }
}
