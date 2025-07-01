
using System.ComponentModel;

namespace Domain.Common.Enums
{
    public enum FeatureType : int
    {
        // Administration       
        [Description("Tenants")]
        Tenants = 10,

        [Description("Propietarios")]
        Owners = 11,

        [Description("Roles")]
        Roles = 12,

        [Description("Gestores")]
        ReSellers = 13,

        [Description("Funcionalidades")]
        Features = 14,

        // Sales
        [Description("Productos")]
        Products = 20,

        [Description("Venta")]
        Sale = 21,

        [Description("Ventas del día")]
        TodayOrders = 22,

        [Description("Cuadre del día")]
        TodayOrdersStats = 23,

        // Inventory
        [Description("Disponible")]
        Available = 30,

        [Description("Entradas")]
        Entries = 31,

        [Description("Salida")]
        Egress = 33,

        [Description("Cuadre del día")]
        TodayInventoryStats = 32,

        // Synchronization
        [Description("Enviar")]
        Send = 40,
   
        [Description("Descargar")]
        Download = 41,
     
        [Description("Recibir")]
        Receive = 42,

        // Reports
        [Description("Reportes del día")]
        TodayReports = 50,

        // Statistics
        [Description("Dashboard")]
        Dashboard = 60,

        //Management
        [Description("Perfil")]
        Profile = 70,

        [Description("Usuarios")]
        Users = 72,

        [Description("Tiendas")]
        Stores = 73,

        [Description("Configuraciones")]
        Configurations = 74,
    }
}