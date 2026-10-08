
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

        [Description("Almacenes")]
        Warehouses = 36,

        [Description("Movimientos de almacén")]
        WarehouseStockMovements = 37,

        [Description("Mis tiendas")]
        OwnerStores = 38,

        [Description("Ventas Mayoristas")]
        WholesaleSales = 39,

        // Synchronization
        [Description("Enviar")]
        Send = 40,
   
        [Description("Descargar")]
        Download = 41,
     
        [Description("Recibir")]
        Receive = 42,

        // MultiMonedas
        [Description("MultiMonedas")]
        MultiMonedas = 43,

        // MultiPayments
        [Description("MultiPayments")]
        MultiPayments = 44,

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

        [Description("Pago de tienda")]
        StorePayment = 91,

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

        // Elaboración
        [Description("Recetas")]
        Recipes = 120,

        [Description("Elaboraciones")]
        Elaborations = 121,

        // Catálogo web
        [Description("Catálogo web")]
        WebCatalog = 122,

        // Pedidos online (pedidos-whatsapp-persistencia, F2)
        [Description("Pedidos online")]
        OnlineOrders = 123,

        // 2026-10-08 (modulos-pedidos-whatsapp-gestion, M1): la feature del módulo 19. Gatea la
        // CONFIGURACIÓN de pedidos y el carrito del catálogo público. OnlineOrders (123) se mueve al
        // módulo 20 — la que persiste la orden — así que las dos quedan en módulos distintos.
        [Description("Pedidos WhatsApp")]
        PedidosWhatsApp = 124,
    }
}