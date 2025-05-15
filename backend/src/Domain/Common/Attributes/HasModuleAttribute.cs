using Domain.Common.Enums;

namespace Domain.Common.Attributes
{
    public class HasModuleAttribute : Attribute
    {
        public ModuleType ModuleType { get; private set; }
        public HasModuleAttribute(ModuleType moduleType)
        {
            ModuleType = moduleType;
        }
    }
}
