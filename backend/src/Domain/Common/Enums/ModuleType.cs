
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

        [Description("Ventas Mayoristas")]
        WholesaleSales = 12,

        [Description("Almacenes")]
        Warehouses = 13,

        [Description("Múltiples tiendas")]
        MultiStores = 14,

        [Description("Múltiples monedas")]
        MultiMonedas = 15,

        [Description("Múltiples pagos")]
        MultiPayments = 16,

        [Description("Elaboración")]
        Elaboration = 17,

        [Description("Catálogo web")]
        WebCatalog = 18,

        // 2026-10-08 (modulos-pedidos-whatsapp-gestion, M1): lo que estaba colgando del Catálogo web
        // (18) se reparte en dos módulos. PedidosWhatsApp = carrito + envío por wa.me + su CONFIGURACIÓN
        // (M4); NO persiste la orden ni gestiona entregas (M3).
        [Description("Pedidos WhatsApp")]
        PedidosWhatsApp = 19,

        // Gestión de Pedidos = la que SÍ guarda la orden en el backend y gestiona las entregas
        // (Pedidos / Ventas / Repartidores), con la feature OnlineOrders (123) movida aquí.
        [Description("Gestión de pedidos")]
        GestionPedidos = 20,

        // Gestores de ventas = módulo opt-in para el Owner (coordinador) y sus gestores.
        // Solo se incluye en Superior (3) y VIP (4); no se asigna a ninguna tienda por defecto.
        [Description("Gestores de ventas")]
        GestoresVentas = 21,

        // ONAT = Vector Fiscal y sus configuraciones, del Owner. Se incluye en Superior (3) y VIP (4)
        // y se siembra con IsActive = FALSE a propósito: la feature se entrega APAGADA y el owner
        // levanta ese único flag cuando esté lista. Las tiendas de esos planes SÍ reciben su
        // StoreModule activo para que el flip las encienda de golpe.
        [Description("ONAT")]
        Onat = 22,
    }
}
