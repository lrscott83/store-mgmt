namespace Application.Abstractions.Roles
{
    public interface IVisibleRoleService
    {
        Task<bool> AreVisibleRolesToCurrentUserAsync(IEnumerable<int> roleIds);
    }
}
