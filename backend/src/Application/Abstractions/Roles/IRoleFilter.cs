using Domain.Entities.Roles;

namespace Application.Abstractions.Roles
{
    public interface IRoleFilter
    {
        IEnumerable<Role> FilterVisibleRolesByCurrentUser(IEnumerable<Role> roles);
    }
}
