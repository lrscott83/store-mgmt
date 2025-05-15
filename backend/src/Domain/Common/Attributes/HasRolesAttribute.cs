using Domain.Common.Enums;

namespace Domain.Common.Attributes
{
    public class HasRolesAttribute : Attribute
    {
        public List<RoleType> RoleTypes { get; private set; }
        public HasRolesAttribute(params RoleType[] roleTypes)
        {
            RoleTypes = roleTypes.ToList();
        }
    }
}
