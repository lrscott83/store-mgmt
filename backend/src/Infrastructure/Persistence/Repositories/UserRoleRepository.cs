using Domain.Common.Enums;
using Domain.Entities.UserRoles;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Domain.Common.Extensions;
using Microsoft.EntityFrameworkCore;
using static Domain.Common.Constants.DataUtils;
using Domain.Entities.Users;

namespace Infrastructure.Persistence.Repositories
{
    public class UserRoleRepository : GenericRepository<UserRole>, IUserRoleRepository
    {
        private readonly DbSet<UserRole> _userRoles;
        public UserRoleRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _userRoles = dbContext.Set<UserRole>();
        }

        public async Task<IEnumerable<int>> GetActiveRoleIdsByUser(Guid userId)
        {
            return await _userRoles
                .Where(ur => ur.IsActive && ur.UserId == userId && ur.Role.IsActive)
                .Select(ur => ur.RoleId)
                .ToListAsync();
        }

        public async Task<IEnumerable<UserRole>> GetActiveUserRolesByIds(Guid userId, HashSet<int> roleIds)
        {
            return await _userRoles
                .Where(ur => ur.IsActive && ur.UserId == userId && ur.Role.IsActive && roleIds.Contains(ur.RoleId))
                .ToListAsync();
        }

        public async Task<IReadOnlyCollection<int>> GetUserFeatureIdsForClaims(Guid userId, Guid storeId)
        {
            return await _userRoles.IgnoreQueryFilters().Where(ur => ur.UserId == userId &&
                                                                     ur.IsActive &&
                                                                     ur.Role.IsActive)
                .SelectMany(ur => ur.Role.StoreRoleFeatures.Where(x => x.IsActive && x.Feature.IsActive && x.Role.IsActive
                    && x.Store.IsActive && x.Store.Owner.IsActive && x.StoreId == storeId)
                .Select(ra => ra.FeatureId))
                .Distinct()
                .ToListAsync();
        }

        //public async Task<bool> HasPermission(Guid userId, FeatureType[] featureTypes)
        //{
        //    if (featureTypes?.Length > 0)
        //    {
        //        var applicationRoleNames = applicationRoles.Select(x => x.GetDisplayName()).ToList();

        //        return await _dbContext.Set<UserRole>().AnyAsync(ur => ur.UserId == userId &&
        //                                               ur.IsActive &&
        //                                               ur.Role.IsActive &&
        //                                               applicationRoleNames.Contains(ur.Role.Name));
        //    }

        //    return false;
        //}

        public async Task<bool> IsSuperAdmin(Guid userId)
        {
            return await _userRoles.IgnoreQueryFilters()
                .AnyAsync(ur => ur.UserId == userId && ur.User.IsActive &&
                                ur.IsActive &&
                                ur.Role.IsActive &&
                                ur.Role.Id == (int)RoleType.SuperAdmin);
        }

        public async Task<bool> IsStoreAdmin(Guid userId)
        {
            return await _userRoles
                .IgnoreQueryFilters()
                .AnyAsync(ur => ur.UserId == userId && ur.User.IsActive &&
                                ur.TenantId == ur.User.TenantId &&
                                ur.IsActive &&
                                ur.Role.IsActive &&
                                ur.Role.Id == (int)RoleType.OwnerAdmin);
        }

        public async Task<bool> IsReSeller(Guid userId)
        {
            return await _userRoles
                .IgnoreQueryFilters()
                .AnyAsync(ur => ur.UserId == userId && ur.User.IsActive &&
                                ur.IsActive &&
                                ur.Role.IsActive &&
                                ur.Role.Id == (int)RoleType.ReSeller);
        }
    }
}
