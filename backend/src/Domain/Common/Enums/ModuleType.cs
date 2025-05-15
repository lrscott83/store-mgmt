
using System.ComponentModel;

namespace Domain.Common.Enums
{
    public enum ModuleType : int
    {
        [Description("Administración")]
        Administration = 1,
        
        [Description("Ventas")]
        Sales = 2,

        [Description("Inventario")]
        Inventory = 3,

        [Description("Sincronización")]
        Synchronization = 4,

        [Description("Reportes")]
        Reports = 5,

        [Description("Estadísticas")]
        Statistics = 6,

        [Description("Gestión")]
        Management = 7,
    }
}
