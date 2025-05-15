using Domain.Common.Constants;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using System.Security.Claims;

namespace WebApiTest.Services
{
    public class ClaimsTransformerService : IClaimsTransformation
    {
        private readonly IUserRepository _userRepository;
        private readonly IUserRoleRepository _userRoleRepository;

        public ClaimsTransformerService(IUserRepository userRepository, IUserRoleRepository userRoleRepository)
        {
            _userRepository = userRepository;
            _userRoleRepository = userRoleRepository;
        }

        public async Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
        {
            var claims = new List<Claim>();
            claims.AddRange(principal.Claims); //Copy over existing claims

            var userIdClaim = principal.Claims.FirstOrDefault(x => x.Type == ClaimTypes.NameIdentifier);

            if (userIdClaim?.Value != null)
            {
                var currentUser = await _userRepository.GetUserByIdIgnoreQueryFiltersAsync(userIdClaim.Value);

                if (currentUser != null)
                {
                    var isGlobalAdmin = await _userRoleRepository.IsSuperAdmin(currentUser.Id);
                    var isTenantAdmin = await _userRoleRepository.IsStoreAdmin(currentUser.Id);
                    var featureIds = await _userRoleRepository.GetUserFeatureIdsForClaims(currentUser.Id);
                    var packedFeatureIds = featureIds.PackFeatureIdsIntoString();

                    claims.Add(new Claim(StringValueUtils.OwnerIdClaim, currentUser.TenantId.ToString()));
                    claims.Add(new Claim(StringValueUtils.StoreIdClaim, currentUser.SelectedStoreId.ToString()));
                    claims.Add(new Claim(StringValueUtils.SuperAdminClaim, isGlobalAdmin.ToString().ToLower())); // TODO: add permissions and claims
                    claims.Add(new Claim(StringValueUtils.AdminClaim, isTenantAdmin.ToString().ToLower()));
                    claims.Add(new Claim(StringValueUtils.FeaturesClaim, packedFeatureIds));
                }
            }

            var claimsIdentity = new ClaimsIdentity(claims, IdentityConstants.ApplicationScheme);


            return new ClaimsPrincipal(claimsIdentity);
        }
    }
}
