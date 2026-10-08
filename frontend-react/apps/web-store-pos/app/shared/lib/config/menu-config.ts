import { EFeatures, EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';

export interface MenuItem {
  label: string;
  path: string;
  featureIds?: number[];
  moduleId?: number;
  /**
   * Additional module gate (AND): when present, the item is offered only if the
   * user's store has EVERY listed module. Kept separate from `moduleId` (the
   * group's module association) so items without this field keep their exact
   * current behavior.
   */
  moduleIds?: EModules[];
  /** When true NavLink uses end prop so it only matches exact path */
  exact?: boolean;
  /** Brief help text shown in the ? tooltip dialog next to the menu item */
  helpContent?: string;
  /**
   * Role gate on top of featureIds. Needed when the underlying ROUTE denies a
   * role that featureIds alone would admit (e.g. an OwnerAdmin holding
   * StorePayment feature would pass isUserAuthorized but the route's
   * resellerFeatureLoader still denies it — the menu must not offer a link
   * that 403s). When absent, no extra role restriction applies.
   */
  rolesOnly?: (user: Pick<UserModel, 'isSuperAdmin' | 'isOwnerAdmin' | 'isReSeller'>) => boolean;
  /**
   * Renders a "NEW" badge next to the label so users notice recently added
   * functionality. Remove the flag (and this comment) once the feature is no
   * longer new.
   */
  isNew?: boolean;
}

export interface MenuGroup {
  groupLabel: string;
  moduleId?: number;
  items: MenuItem[];
}

/**
 * Aviso que se concatena al `helpContent` de TODOS los ítems con `isNew: true`
 * (badge "NEW" en el menú): la funcionalidad está en fase de prueba y puede
 * presentar algún problema de funcionamiento. Existe como constante única —
 * y no repetido dentro de cada `helpContent` — para que el aviso sea idéntico
 * en todos los popups de ayuda y para que quitarlo cuando cada módulo salga de
 * beta sea una edición de un solo lugar por ítem.
 *
 * Se elimina al quitarle `isNew` a un ítem: el badge y el aviso van juntos.
 */
const BETA_NOTICE =
  ' ⚠️ Funcionalidad en fase de prueba: puede presentar algún problema de funcionamiento.';

export const MENU_GROUPS: MenuGroup[] = [
  {
    groupLabel: 'MENU.ADMIN',
    moduleId: EModules.Administration,
    items: [
      {
        label: 'MENU.ADMIN_DASHBOARD',
        path: '/admin/dashboard',
        featureIds: [EFeatures.AdminDashboard],
        moduleId: EModules.Administration,
        helpContent:
          'Panel de control del superadministrador. Aquí puedes ver un resumen general del sistema: total de propietarios, tiendas, gestores y estadísticas clave de actividad.',
      },
      {
        label: 'MENU.ADMIN_STORES',
        path: '/admin/stores',
        featureIds: [EFeatures.AdminStores],
        moduleId: EModules.Administration,
        helpContent:
          'Gestiona las tiendas desde el superadministrador. Puedes listar, buscar, activar o desactivar tiendas de todos los propietarios del sistema.',
      },
      {
        label: 'MENU.OWNERS',
        path: '/admin/owners',
        featureIds: [EFeatures.Owners],
        moduleId: EModules.Administration,
        helpContent:
          'Administra los propietarios (dueños de negocio). Desde aquí puedes crear nuevos propietarios, editar su información y asignarles tiendas.',
      },
      {
        label: 'MENU.RESELLERS',
        path: '/admin/resellers',
        featureIds: [EFeatures.ReSellers],
        moduleId: EModules.Administration,
        helpContent:
          'Gestiona los gestores (resellers). Un gestor es un representante comercial que puede administrar múltiples propietarios y sus tiendas.',
      },
      {
        label: 'MENU.FEATURES',
        path: '/admin/features',
        featureIds: [EFeatures.Features],
        moduleId: EModules.Administration,
        helpContent:
          'Administra las funcionalidades disponibles del sistema. Desde aquí puedes activar o desactivar módulos y funciones para las tiendas.',
      },
      // Mensajes (buzón propietario↔SuperAdmin): la ruta usa superAdminLoader,
      // así que el rolesOnly la ofrece solo al SuperAdmin.
      {
        label: 'MENU.ADMIN_MESSAGES',
        path: '/admin/messages',
        moduleId: EModules.Administration,
        rolesOnly: (user) => user.isSuperAdmin,
        helpContent:
          'Bandeja de mensajes. Conversa con los propietarios de las tiendas, responde sus consultas y envía difusiones a todos los propietarios.',
      },
      // Global module catalog pricing (PUT /v1/modules/pricing). SuperAdmin-only by
      // construction: no StoreRoleFeatures entry backs a catalog-pricing capability, so
      // the item carries no featureIds and gates on `rolesOnly`, mirroring the route's
      // superAdminLoader. Nobody else can reach the page or the endpoint.
      {
        label: 'MENU.MODULES',
        path: '/admin/modules',
        moduleId: EModules.Administration,
        rolesOnly: (user) => user.isSuperAdmin,
        helpContent:
          'Precios de los módulos. Edita el precio, el descuento y el descuento porcentual de cada módulo del catálogo, agrupados por plan. Los cambios se aplican a todo el sistema: los módulos con descuento muestran el precio base tachado y el precio final.',
      },
      // Billing (Cobros pendientes + Comisiones): routes gated by
      // resellerFeatureLoader([EFeatures.StorePayment]) — SuperAdmin or
      // ReSeller only. rolesOnly mirrors that role set so the menu never
      // offers a link the route guard would deny (OwnerAdmin holding the
      // feature would pass isUserAuthorized but still 403 on the route).
      {
        label: 'MENU.BILLING_COLLECTIONS',
        path: '/management/stores/collections',
        featureIds: [EFeatures.StorePayment],
        moduleId: EModules.Administration,
        rolesOnly: (user) => user.isSuperAdmin || user.isReSeller,
        helpContent:
          'Cobros pendientes. Lista las tiendas con pagos atrasados o por vencer, con el monto y la fecha. Puedes registrar el pago de una tienda para ponerla al día.',
      },
      {
        label: 'MENU.BILLING_COMMISSIONS',
        path: '/management/stores/commissions',
        featureIds: [EFeatures.StorePayment],
        moduleId: EModules.Administration,
        rolesOnly: (user) => user.isSuperAdmin || user.isReSeller,
        helpContent:
          'Comisiones de gestores. Consulta las comisiones acumuladas por mes de cada gestor (reseller) según los pagos registrados de sus tiendas.',
      },
    ],
  },
  {
    groupLabel: 'MENU.SALES',
    moduleId: EModules.Sales,
    items: [
      {
        label: 'MENU.PRODUCTS',
        path: '/sales/products',
        featureIds: [EFeatures.Products],
        moduleId: EModules.Sales,
        helpContent:
          'Catálogo de productos. Aquí puedes crear, editar y organizar tus productos por categoría. Puedes agregar nombre, precio, código de barras e imagen a cada producto.',
      },
      // Catálogo Web (módulo 18, plan 2026-09-27): publica la tienda en
      // /catalog/<slug>. El `moduleIds` replica el guard de la RUTA
      // (ownerModuleLoader): sin el módulo contratado en la tienda seleccionada el
      // enlace no se ofrece, porque el backend devuelve 403 en todos sus endpoints.
      // El `rolesOnly` pina que solo el Owner lo vea, igual que el backend
      // ([HasPermission(StoreRoleFeatures.WebCatalogAdmin)]).
      {
        label: 'MENU.WEB_CATALOG',
        path: '/sales/web-catalog',
        featureIds: [EFeatures.WebCatalog],
        moduleId: EModules.WebCatalog,
        moduleIds: [EModules.WebCatalog],
        rolesOnly: (user) => user.isOwnerAdmin,
        isNew: true,
        helpContent:
          'Catálogo Web. Publica tus productos en una página web propia (/catalog/tu-tienda): completa la descripción, el % de descuento, el precio rebajado, la marca Nuevo y las imágenes, y pulsa Sincronizar Catálogo para actualizar lo que ven tus clientes.' +
          BETA_NOTICE,
      },
      // Pedidos WhatsApp (módulo 18, F1): la configuración del pedido online (interruptor,
      // número de WhatsApp, modalidades, envío, mínimo, horarios y zonas). Comparte módulo,
      // feature y rol con Catálogo Web porque comparte endpoints y gate en el backend
      // ([HasPermission(StoreRoleFeatures.WebCatalogAdmin)]) —gestionar pedidos es otra
      // feature, la de F2—. Los precios y la moneda NO se configuran aquí: salen del catálogo.
      {
        label: 'MENU.ONLINE_ORDERS_SETTINGS',
        path: '/sales/online-orders/settings',
        featureIds: [EFeatures.WebCatalog],
        moduleId: EModules.WebCatalog,
        moduleIds: [EModules.WebCatalog],
        rolesOnly: (user) => user.isOwnerAdmin,
        isNew: true,
        helpContent:
          'Pedidos WhatsApp. Activa el pedido online y configura el número de WhatsApp al que llegan los pedidos, si recoges en la tienda o envías a domicilio, el costo del envío, el importe mínimo, el horario y las zonas de reparto. El precio y la moneda salen del catálogo.' +
          BETA_NOTICE,
      },
      // Repartidores (módulo 18, F7): catálogo de personas de la tienda. Comparte MÓDULO con los
      // dos ítems anteriores pero cambia FEATURE (123, no 122) y ROL: el backend lo exige con
      // `OnlineOrdersAdmin` ([HasPermission]), que lleva OwnerAdmin Y StoreUser (D15) — atender
      // pedidos y repartir es trabajo del día a día, no solo del dueño. Por eso NO lleva
      // `rolesOnly: isOwnerAdmin` como los otros dos: con él, el StoreUser que puede usar el
      // endpoint no vería el enlace.
      // El `moduleIds` replica el gate del backend: sin el módulo 18 contratado, 403.
      {
        label: 'MENU.ONLINE_ORDERS_DRIVERS',
        path: '/sales/online-orders/drivers',
        featureIds: [EFeatures.OnlineOrders],
        moduleId: EModules.WebCatalog,
        moduleIds: [EModules.WebCatalog],
        isNew: true,
        helpContent:
          'Repartidores. Da de alta las personas que reparten los pedidos de tu tienda, con su nombre y su teléfono, y actívalas o desactívalas cuando dejan de repartir. Al atender cada pedido eliges cuál lo lleva.' +
          BETA_NOTICE,
      },

      // Gestión de pedidos (feature 123, F5): la tabla de pedidos del día a día. El item de ARRIBA
      // es la CONFIGURACIÓN (feature 122, solo el dueño); este lo opera también el StoreUser, así
      // que lleva SU feature y NO un `rolesOnly` de dueño. El `moduleIds` replica el módulo 18 del
      // backend ([HasModule(ModuleType.WebCatalog)] en `OnlineOrdersAdmin`).
      {
        label: 'MENU.ONLINE_ORDERS',
        path: '/sales/online-orders',
        featureIds: [EFeatures.OnlineOrders],
        moduleId: EModules.WebCatalog,
        moduleIds: [EModules.WebCatalog],
        isNew: true,
        helpContent:
          'Repartidores. Da de alta las personas que reparten los pedidos de tu tienda, con su nombre y su teléfono, y actívalas o desactívalas cuando dejan de repartir. Al atender cada pedido eliges cuál lo lleva.' +
          'Pedidos. Los pedidos que llegan por WhatsApp, filtrables por estado, pago, entrega, repartidor, fechas y búsqueda por código o teléfono. Desde aquí confirmas el pedido, lo dejas en preparación o listo, lo entregas, lo cancelas, marcas el pago y asignas el repartidor.' +
          BETA_NOTICE,
      },
      {
        label: 'MENU.SALE',
        path: '/sales/new',
        featureIds: [EFeatures.Sale],
        moduleId: EModules.Sales,
        helpContent:
          'Realiza una nueva venta. Escanea o busca el producto, agrega cantidades, selecciona el método de pago y confirma la venta. También puedes generar ventas a crédito.',
      },
      {
        label: 'MENU.WHOLESALE',
        path: '/sales/wholesale',
        featureIds: [EFeatures.WholesaleSales],
        moduleId: EModules.WholesaleSales,
        isNew: true,
        helpContent:
          'Venta por mayor. Elige la cantidad en paquetes (cajas), el precio por unidad baja según los rangos configurados en el producto y la venta se descuenta del inventario en unidades. Ej: 12 cajas × 24 unidades × 660.' +
          BETA_NOTICE,
      },
      {
        label: 'MENU.TODAY_ORDERS',
        path: '/sales/today-orders',
        featureIds: [EFeatures.TodayOrders],
        moduleId: EModules.Sales,
        helpContent:
          'Lista de ventas realizadas hoy. Puedes ver el detalle de cada venta, anular una venta y revisar los métodos de pago utilizados.',
      },
      {
        label: 'MENU.TODAY_CREDITS',
        path: '/sales/today-credits',
        featureIds: [EFeatures.CreditSale],
        moduleId: EModules.Sales,
        helpContent:
          'Créditos del día. Lista los productos vendidos a crédito en el día de hoy, con el nombre del cliente y el monto pendiente de pago.',
      },
      {
        label: 'MENU.TODAY_STATS',
        path: '/sales/today-stats',
        featureIds: [EFeatures.TodayStats],
        moduleId: EModules.Sales,
        helpContent:
          'Cuadre de caja del día. Resumen de ventas totales, efectivo, tarjeta, zelle y créditos. Verifica que los montos cuadren con lo recaudado.',
      },
      {
        label: 'MENU.CREDITS_HISTORY',
        path: '/sales/credits',
        featureIds: [EFeatures.CreditSale],
        moduleId: EModules.Sales,
        helpContent:
          'Historial de créditos. Lista todas las ventas a crédito con su estado de pago. Puedes registrar pagos parciales o totales de los clientes.',
      },
      {
        label: 'MENU.ORDERS_HISTORY',
        path: '/sales/orders',
        featureIds: [EFeatures.SalesHistory],
        moduleId: EModules.Sales,
        helpContent:
          'Historial de ventas. Consulta todas las ventas realizadas con filtros por fecha, cliente y método de pago. Puedes generar reportes y exportar datos.',
      },
    ],
  },
  {
    groupLabel: 'MENU.INVENTORY',
    moduleId: EModules.Inventory,
    items: [
      {
        label: 'MENU.AVAILABLE',
        path: '/inventory/available',
        featureIds: [EFeatures.Available],
        moduleId: EModules.Inventory,
        helpContent:
          'Consulta el inventario disponible. Lista todos los productos con su cantidad en stock, precio y estado. Puedes buscar y filtrar productos.',
      },
      {
        label: 'MENU.TODAY_ENTRIES',
        path: '/inventory/today-entries',
        featureIds: [EFeatures.Entries],
        moduleId: EModules.Inventory,
        helpContent:
          'Entradas de inventario del día. Registra nuevos productos o cantidades que ingresan al almacén. Cada entrada debe incluir el producto, cantidad y costo.',
      },
      {
        label: 'MENU.TODAY_QUANTITIES',
        path: '/inventory/today-quantities',
        featureIds: [EFeatures.InventoryTodayQuantities],
        moduleId: EModules.Inventory,
        helpContent:
          'Cantidades movidas hoy. Resumen de productos que salieron y entraron al inventario durante el día. Sirve para verificar movimientos.',
      },
      {
        label: 'MENU.TODAY_SALES_PROFIT',
        path: '/inventory/today-sales-profit',
        featureIds: [EFeatures.InventoryTodaySaleProfit],
        moduleId: EModules.Inventory,
        helpContent:
          'Ganancias del día. Muestra la diferencia entre el costo de los productos vendidos y el precio de venta. Calcula la ganancia real del día.',
      },
      {
        label: 'MENU.EGRESS',
        path: '/inventory/egress',
        featureIds: [EFeatures.Egress],
        moduleId: EModules.Inventory,
        helpContent:
          'Salidas de inventario. Registra productos que salen del almacén por motivos distintos a la venta (deterioro, regalo, ajuste de stock, etc.).',
      },
      {
        label: 'MENU.ENTRIES_HISTORY',
        path: '/inventory/entries',
        featureIds: [EFeatures.EntriesHistory],
        moduleId: EModules.Inventory,
        helpContent:
          'Historial de entradas. Consulta todas las entradas de inventario realizadas con filtros por fecha y producto. Ideal para auditorías.',
      },
    ],
  },
  {
    groupLabel: 'MENU.EXPENSES',
    moduleId: EModules.Expenses,
    items: [
      {
        label: 'MENU.TODAY_EXPENSES',
        path: '/expenses/today',
        featureIds: [EFeatures.TodayExpenses],
        moduleId: EModules.Expenses,
        helpContent:
          'Registra gastos del día. Documenta los gastos operativos como salario, transporte, alquiler, agua, luz, etc. Cada gasto debe incluir tipo, monto y descripción.',
      },
      {
        label: 'MENU.EXPENSES_HISTORY',
        path: '/expenses/expenses',
        featureIds: [EFeatures.ExpensesHistory],
        moduleId: EModules.Expenses,
        helpContent:
          'Historial de gastos. Consulta todos los gastos registrados con filtros por fecha y tipo. Puedes generar reportes y exportar la información.',
      },
    ],
  },
  {
    // Módulo Almacenes (ModuleType 13, backend) con sus dos features:
    // Gestión de Almacenes (36) y Movimientos de almacén (37).
    groupLabel: 'MENU.WAREHOUSES_MODULE',
    moduleId: EModules.Warehouses,
    items: [
      {
        label: 'MENU.WAREHOUSES',
        path: '/inventory/warehouses',
        featureIds: [EFeatures.Warehouses],
        moduleId: EModules.Warehouses,
        isNew: true,
        helpContent:
          'Gestiona tus almacenes. Crea almacenes, registra entradas por compra, transfiere stock entre almacenes y haz salidas a la tienda: cada salida crea una entrada de inventario en la tienda con el costo promedio del almacén.' +
          BETA_NOTICE,
      },
      {
        label: 'MENU.WAREHOUSE_MOVEMENTS',
        path: '/inventory/warehouse-movements',
        featureIds: [EFeatures.WarehouseStockMovements],
        moduleId: EModules.Warehouses,
        isNew: true,
        helpContent:
          'Historial de movimientos de almacenes. Consulta todas las entradas, salidas y transferencias entre almacenes, agrupadas por día, con el origen y destino de cada una.' +
          BETA_NOTICE,
      },
    ],
  },
  {
    // Módulo Elaboración (17, backend) con sus dos features: Recetas (120) y
    // Elaboraciones (121). Sin iconos (convención del menú).
    groupLabel: 'MENU.ELABORATION',
    moduleId: EModules.Elaboration,
    items: [
      {
        label: 'MENU.RECIPES',
        path: '/inventory/recipes',
        featureIds: [EFeatures.Recipes],
        moduleId: EModules.Elaboration,
        isNew: true,
        helpContent:
          'Recetas de elaboración. Define el producto terminado, cuántas unidades produce un lote, los insumos que consume (con su merma) y los costos de mano de obra y gastos indirectos.' +
          BETA_NOTICE,
      },
      {
        label: 'MENU.ELABORATIONS',
        path: '/inventory/elaborations',
        featureIds: [EFeatures.Elaborations],
        moduleId: EModules.Elaboration,
        isNew: true,
        helpContent:
          'Registra una elaboración: elige la receta, los lotes y el almacén que aporta los insumos, revisa el consumo teórico y ajústalo con el real. El sistema descuenta los insumos, ingresa el producto terminado y calcula su costo unitario real.' +
          BETA_NOTICE,
      },
    ],
  },
  {
    groupLabel: 'MENU.SYNCHRONIZATION',
    moduleId: EModules.Synchronization,
    items: [
      {
        label: 'MENU.EXPORT',
        path: '/sync/export',
        featureIds: [EFeatures.Send],
        moduleId: EModules.Synchronization,
        helpContent:
          'Exportar datos. Genera un archivo cifrado con toda la información de tu tienda (productos, ventas, inventario, gastos). Úsalo para crear respaldos o transferir datos a otro dispositivo.',
      },
      {
        label: 'MENU.IMPORT',
        path: '/sync/import',
        featureIds: [EFeatures.Receive],
        moduleId: EModules.Synchronization,
        helpContent:
          'Importar datos. Carga un archivo de exportación para restaurar información en tu tienda. Los datos se fusionan de forma segura sin duplicar registros.',
      },
    ],
  },
  {
    groupLabel: 'MENU.REPORTS',
    moduleId: EModules.Reports,
    items: [
      {
        label: 'MENU.TODAY_REPORTS',
        path: '/reports/today',
        featureIds: [EFeatures.TodayReports],
        moduleId: EModules.Reports,
        helpContent:
          'Reportes del día. Genera reportes consolidados de ventas, inventario y gastos del día. Puedes exportar los reportes en formato PDF o imprimirlos.',
      },
    ],
  },
  {
    groupLabel: 'MENU.STATISTICS',
    moduleId: EModules.Statistics,
    items: [
      {
        label: 'MENU.DASHBOARD',
        path: '/stats/dashboard',
        featureIds: [EFeatures.Dashboard],
        moduleId: EModules.Statistics,
        helpContent:
          'Panel de estadísticas. Visualiza gráficas de ventas, productos más vendidos, tendencias y comparativos por período. Toma decisiones basadas en datos.',
      },
      {
        label: 'MENU.CUADRE_POR_FECHAS',
        path: '/stats/cuadre-por-fechas',
        featureIds: [EFeatures.Dashboard],
        moduleId: EModules.Statistics,
        helpContent:
          'Cuadre por fechas. Selecciona un rango de fechas (inicio y fin, ambos días incluidos) y genera un resumen de las operaciones del período: ventas, gastos, ganancias bruta y ganancias, más el detalle del cuadre.',
      },
    ],
  },
  {
    groupLabel: 'MENU.MANAGEMENT',
    moduleId: EModules.Management,
    items: [
      {
        label: 'MENU.MY_STORES',
        path: '/management/my-stores',
        featureIds: [EFeatures.Stores],
        moduleId: EModules.Management,
        helpContent:
          'Mis tiendas. Lista todas tus tiendas (activas e inactivas) en tarjetas con su plan, próximo cobro y precio. Desde el engranaje puedes editar el nombre, activar o desactivar la tienda y cambiar el plan.',
      },
      // Convention: NO menu item carries an icon — plain text labels only
      // (the wholesale 📦, exchange-rate 💱 and warehouses 🏬 icons were
      // removed; the icon property is gone from MenuItem entirely).
      {
        label: 'MENU.CHANNEL_RATES',
        path: '/management/channel-rates',
        featureIds: [EFeatures.Configurations],
        moduleId: EModules.Management,
        // D11: channels (method + currency) and their equivalence exist only
        // with the MultiMonedas module; without it the page is not offered.
        moduleIds: [EModules.MultiMonedas],
        helpContent:
          'Tasas de Cambio. Registra cuántas unidades de cada moneda equivalen a 1 USD para cada método de pago (efectivo, Zelle, transferencia), con la fecha desde la que rige. El historial es de solo lectura: cada cambio crea un registro nuevo y no se puede editar ni eliminar.',
      },
      {
        label: 'MENU.USERS',
        path: '/management/users',
        featureIds: [EFeatures.Users],
        moduleId: EModules.Management,
        helpContent:
          'Gestiona los empleados de tu tienda. Crea cuentas de usuario, asígnales roles (cajero, bodeguero, admin) y controla qué funcionalidades pueden usar. Desde aquí también puedes exportar el roster (lista de empleados) con una contraseña para activar el acceso sin conexión en otro equipo, e importarlo después en el dispositivo de destino.',
      },
      // Billing moved to the ADMIN group (MENU.ADMIN) — SuperAdmin and
      // ReSeller see Cobros/Comisiones under ADMINISTRACIÓN, not GESTIÓN.
      {
        label: 'MENU.CONFIGURATIONS',
        path: '/management/configurations',
        featureIds: [EFeatures.Configurations],
        moduleId: EModules.Management,
        helpContent:
          'Configuraciones de la tienda. Administra las funcionalidades activas, módulos habilitados y permisos generales de tu negocio.',
      },
      // client-error-log: the diagnostic ring-buffer viewer is for SuperAdmin
      // or OwnerAdmin only (same set the route's adminLoader admits) — the
      // rolesOnly gate mirrors the loader so the menu never offers a 403 link.
      {
        label: 'MENU.DIAGNOSTICS',
        path: '/diagnostics',
        rolesOnly: (user) => user.isSuperAdmin || user.isOwnerAdmin,
        helpContent:
          'Diagnóstico. Muestra los errores y eventos registrados en este dispositivo para poder reportarlos. Puedes compartir, copiar o limpiar el registro.',
      },
    ],
  },
];
