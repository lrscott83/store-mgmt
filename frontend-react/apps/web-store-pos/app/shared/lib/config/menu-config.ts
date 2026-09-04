import { EFeatures, EModules } from '@store-mgmt/domain';

export interface MenuItem {
  label: string;
  path: string;
  featureIds?: number[];
  moduleId?: number;
  icon?: string;
  /** When true NavLink uses end prop so it only matches exact path */
  exact?: boolean;
  /** Brief help text shown in the ? tooltip dialog next to the menu item */
  helpContent?: string;
}

export interface MenuGroup {
  groupLabel: string;
  moduleId?: number;
  items: MenuItem[];
}

export const MENU_GROUPS: MenuGroup[] = [
  {
    groupLabel: 'MENU.ADMIN',
    moduleId: EModules.Administration,
    items: [
      { label: 'MENU.ADMIN_DASHBOARD', path: '/admin/dashboard', featureIds: [EFeatures.AdminDashboard], moduleId: EModules.Administration,
        helpContent: 'Panel de control del superadministrador. Aquí puedes ver un resumen general del sistema: total de propietarios, tiendas, gestores y estadísticas clave de actividad.' },
      { label: 'MENU.ADMIN_STORES', path: '/admin/stores', featureIds: [EFeatures.AdminStores], moduleId: EModules.Administration,
        helpContent: 'Gestiona las tiendas desde el superadministrador. Puedes listar, buscar, activar o desactivar tiendas de todos los propietarios del sistema.' },
      { label: 'MENU.OWNERS', path: '/admin/owners', featureIds: [EFeatures.Owners], moduleId: EModules.Administration,
        helpContent: 'Administra los propietarios (dueños de negocio). Desde aquí puedes crear nuevos propietarios, editar su información y asignarles tiendas.' },
      { label: 'MENU.RESELLERS', path: '/admin/resellers', featureIds: [EFeatures.ReSellers], moduleId: EModules.Administration,
        helpContent: 'Gestiona los gestores (resellers). Un gestor es un representante comercial que puede administrar múltiples propietarios y sus tiendas.' },
      { label: 'MENU.FEATURES', path: '/admin/features', featureIds: [EFeatures.Features], moduleId: EModules.Administration,
        helpContent: 'Administra las funcionalidades disponibles del sistema. Desde aquí puedes activar o desactivar módulos y funciones para las tiendas.' },
    ],
  },
  {
    groupLabel: 'MENU.SALES',
    moduleId: EModules.Sales,
    items: [
      { label: 'MENU.PRODUCTS', path: '/sales/products', featureIds: [EFeatures.Products], moduleId: EModules.Sales,
        helpContent: 'Catálogo de productos. Aquí puedes crear, editar y organizar tus productos por categoría. Puedes agregar nombre, precio, código de barras e imagen a cada producto.' },
      { label: 'MENU.SALE', path: '/sales/new', featureIds: [EFeatures.Sale], moduleId: EModules.Sales,
        helpContent: 'Realiza una nueva venta. Escanea o busca el producto, agrega cantidades, selecciona el método de pago y confirma la venta. También puedes generar ventas a crédito.' },
      { label: 'MENU.WHOLESALE', path: '/sales/wholesale', featureIds: [EFeatures.Sale], moduleId: EModules.Sales, icon: '📦',
        helpContent: 'Venta por mayor. Elige la cantidad en paquetes (cajas), el precio por unidad baja según los rangos configurados en el producto y la venta se descuenta del inventario en unidades. Ej: 12 cajas × 24 unidades × 660.' },
      { label: 'MENU.TODAY_ORDERS', path: '/sales/today-orders', featureIds: [EFeatures.TodayOrders], moduleId: EModules.Sales,
        helpContent: 'Lista de ventas realizadas hoy. Puedes ver el detalle de cada venta, anular una venta y revisar los métodos de pago utilizados.' },
      { label: 'MENU.TODAY_CREDITS', path: '/sales/today-credits', featureIds: [EFeatures.CreditSale], moduleId: EModules.Sales,
        helpContent: 'Créditos del día. Lista los productos vendidos a crédito en el día de hoy, con el nombre del cliente y el monto pendiente de pago.' },
      { label: 'MENU.TODAY_STATS', path: '/sales/today-stats', featureIds: [EFeatures.TodayStats], moduleId: EModules.Sales,
        helpContent: 'Cuadre de caja del día. Resumen de ventas totales, efectivo, tarjeta, zelle y créditos. Verifica que los montos cuadren con lo recaudado.' },
      { label: 'MENU.CREDITS_HISTORY', path: '/sales/credits', featureIds: [EFeatures.CreditSale], moduleId: EModules.Sales,
        helpContent: 'Historial de créditos. Lista todas las ventas a crédito con su estado de pago. Puedes registrar pagos parciales o totales de los clientes.' },
      { label: 'MENU.ORDERS_HISTORY', path: '/sales/orders', featureIds: [EFeatures.SalesHistory], moduleId: EModules.Sales,
        helpContent: 'Historial de ventas. Consulta todas las ventas realizadas con filtros por fecha, cliente y método de pago. Puedes generar reportes y exportar datos.' },
    ],
  },
  {
    groupLabel: 'MENU.INVENTORY',
    moduleId: EModules.Inventory,
    items: [
      { label: 'MENU.AVAILABLE', path: '/inventory/available', featureIds: [EFeatures.Available], moduleId: EModules.Inventory,
        helpContent: 'Consulta el inventario disponible. Lista todos los productos con su cantidad en stock, precio y estado. Puedes buscar y filtrar productos.' },
      { label: 'MENU.TODAY_ENTRIES', path: '/inventory/today-entries', featureIds: [EFeatures.Entries], moduleId: EModules.Inventory,
        helpContent: 'Entradas de inventario del día. Registra nuevos productos o cantidades que ingresan al almacén. Cada entrada debe incluir el producto, cantidad y costo.' },
      { label: 'MENU.TODAY_QUANTITIES', path: '/inventory/today-quantities', featureIds: [EFeatures.InventoryTodayQuantities], moduleId: EModules.Inventory,
        helpContent: 'Cantidades movidas hoy. Resumen de productos que salieron y entraron al inventario durante el día. Sirve para verificar movimientos.' },
      { label: 'MENU.TODAY_SALES_PROFIT', path: '/inventory/today-sales-profit', featureIds: [EFeatures.InventoryTodaySaleProfit], moduleId: EModules.Inventory,
        helpContent: 'Ganancias del día. Muestra la diferencia entre el costo de los productos vendidos y el precio de venta. Calcula la ganancia real del día.' },
      { label: 'MENU.EGRESS', path: '/inventory/egress', featureIds: [EFeatures.Egress], moduleId: EModules.Inventory,
        helpContent: 'Salidas de inventario. Registra productos que salen del almacén por motivos distintos a la venta (deterioro, regalo, ajuste de stock, etc.).' },
      { label: 'MENU.ENTRIES_HISTORY', path: '/inventory/entries', featureIds: [EFeatures.EntriesHistory], moduleId: EModules.Inventory,
        helpContent: 'Historial de entradas. Consulta todas las entradas de inventario realizadas con filtros por fecha y producto. Ideal para auditorías.' },
    ],
  },
  {
    groupLabel: 'MENU.EXPENSES',
    moduleId: EModules.Expenses,
    items: [
      { label: 'MENU.TODAY_EXPENSES', path: '/expenses/today', featureIds: [EFeatures.TodayExpenses], moduleId: EModules.Expenses,
        helpContent: 'Registra gastos del día. Documenta los gastos operativos como salario, transporte, alquiler, agua, luz, etc. Cada gasto debe incluir tipo, monto y descripción.' },
      { label: 'MENU.EXPENSES_HISTORY', path: '/expenses/expenses', featureIds: [EFeatures.ExpensesHistory], moduleId: EModules.Expenses,
        helpContent: 'Historial de gastos. Consulta todos los gastos registrados con filtros por fecha y tipo. Puedes generar reportes y exportar la información.' },
    ],
  },
  {
    groupLabel: 'MENU.SYNCHRONIZATION',
    moduleId: EModules.Synchronization,
    items: [
      { label: 'MENU.EXPORT', path: '/sync/export', featureIds: [EFeatures.Send], moduleId: EModules.Synchronization,
        helpContent: 'Exportar datos. Genera un archivo cifrado con toda la información de tu tienda (productos, ventas, inventario, gastos). Úsalo para crear respaldos o transferir datos a otro dispositivo.' },
      { label: 'MENU.IMPORT', path: '/sync/import', featureIds: [EFeatures.Receive], moduleId: EModules.Synchronization,
        helpContent: 'Importar datos. Carga un archivo de exportación para restaurar información en tu tienda. Los datos se fusionan de forma segura sin duplicar registros.' },
    ],
  },
  {
    groupLabel: 'MENU.REPORTS',
    moduleId: EModules.Reports,
    items: [
      { label: 'MENU.TODAY_REPORTS', path: '/reports/today', featureIds: [EFeatures.TodayReports], moduleId: EModules.Reports,
        helpContent: 'Reportes del día. Genera reportes consolidados de ventas, inventario y gastos del día. Puedes exportar los reportes en formato PDF o imprimirlos.' },
    ],
  },
  {
    groupLabel: 'MENU.STATISTICS',
    moduleId: EModules.Statistics,
    items: [
      { label: 'MENU.DASHBOARD', path: '/stats/dashboard', featureIds: [EFeatures.Dashboard], moduleId: EModules.Statistics,
        helpContent: 'Panel de estadísticas. Visualiza gráficas de ventas, productos más vendidos, tendencias y comparativos por período. Toma decisiones basadas en datos.' },
    ],
  },
  {
    groupLabel: 'MENU.MANAGEMENT',
    moduleId: EModules.Management,
    items: [
      { label: 'MENU.STORES_PLAN', path: '/management/stores', featureIds: [EFeatures.Stores], moduleId: EModules.Management, exact: true,
        helpContent: 'Plan y estado de la tienda. Consulta el plan actual (Gratis, Básico, Profesional), las fechas de pago y vencimiento. Renueva o cambia de plan según necesites.' },
      { label: 'MENU.STORES_UPDATE', path: '/management/stores/update', featureIds: [EFeatures.Stores], moduleId: EModules.Management,
        helpContent: 'Editar información de la tienda. Actualiza el nombre, dirección, teléfono y otros datos de tu negocio. Estos cambios se reflejan en los reportes.' },
      // daily-exchange-rate — sits right after the Stores features, same guard as
      // Configurations (EFeatures.Configurations).
      { label: 'MENU.EXCHANGE_RATES', path: '/management/exchange-rates', featureIds: [EFeatures.Configurations], moduleId: EModules.Management, icon: '💱',
        helpContent: 'Registro diario del cambio de USD a MN. Cada día se añade un registro con el valor del día anterior (por defecto 1). Puedes editar el valor de cualquier día: escribe cuántos pesos (MN) equivale 1 USD en esa fecha y pulsa Guardar.' },
      { label: 'MENU.USERS', path: '/management/users', featureIds: [EFeatures.Users], moduleId: EModules.Management,
        helpContent: 'Gestiona los empleados de tu tienda. Crea cuentas de usuario, asígnales roles (cajero, bodeguero, admin) y controla qué funcionalidades pueden usar. Desde aquí también puedes exportar el roster (lista de empleados) con una contraseña para activar el acceso sin conexión en otro equipo, e importarlo después en el dispositivo de destino.' },
      { label: 'MENU.CONFIGURATIONS', path: '/management/configurations', featureIds: [EFeatures.Configurations], moduleId: EModules.Management,
        helpContent: 'Configuraciones de la tienda. Administra las funcionalidades activas, módulos habilitados y permisos generales de tu negocio.' },
    ],
  },
];
