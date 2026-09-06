
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

        [Description("Gastos")]
        Expenses = 8,

        [Description("Facturación")]
        Billing = 9,

        [Description("Historiales")]
        Histories = 10,

        [Description("Créditos")]
        Credits = 11,

        [Description("Almacenes")]
        Warehouses = 13,
    }
}
