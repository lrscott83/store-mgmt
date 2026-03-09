
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

        [Description("Tiendas")]
        AdminStores = 15,

        [Description("Dashboard")]
        AdminDashboard = 16,

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

        [Description("Cantidades del día")]
        InventoryTodayQuantities = 34,

        [Description("Ganancias del día")]
        InventoryTodaySaleProfit = 35,

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

        //Expenses
        [Description("Gastos del día")]
        TodayExpenses = 80,

        //Billing
        [Description("Facturación")]
        Billing = 90,

        //Histories
        [Description("Historial de ventas")]
        SalesHistory = 100,

        [Description("Historial de entradas")]
        EntriesHistory = 101,

        [Description("Historial de gastos")]
        ExpensesHistory = 102,

        [Description("Historial de créditos")]
        CreditsHistory = 103,

        //Credits
        [Description("Venta a crédito")]
        CreditSale = 110,
    }
}