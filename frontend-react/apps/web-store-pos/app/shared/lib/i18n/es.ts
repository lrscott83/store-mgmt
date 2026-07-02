const messages: Record<string, string> = {
  // General
  'GENERAL.APP_NAME': 'Vende De Todo',
  'GENERAL.APP_SUBTITLE': 'POS Management',
  'GENERAL.LOADING': 'Cargando...',
  'GENERAL.SAVE': 'Guardar',
  'GENERAL.CANCEL': 'Cancelar',
  'GENERAL.DISCARD': 'Descartar',
  'GENERAL.CONFIRM': 'Confirmar',
  'GENERAL.CLOSE': 'Cerrar',
  'GENERAL.SEARCH': 'Buscar',
  'GENERAL.TOTAL': 'Total',
  'GENERAL.CHANGE': 'Cambio',
  'GENERAL.QUANTITY': 'Cantidad',
  'GENERAL.PRICE': 'Precio',
  'GENERAL.NAME': 'Nombre',
  'GENERAL.ADD': 'Adicionar',
  'GENERAL.ERROR': 'Error',
  'GENERAL.SUCCESS': 'Éxito',
  'GENERAL.OFFLINE': 'Sin conexión. Se requiere conexión a internet.',
  'GENERAL.LOGOUT': 'Salir',
  'GENERAL.EDIT': 'Editar',
  'GENERAL.DELETE': 'Eliminar',
  'GENERAL.UPDATE': 'Actualizar',
  'GENERAL.YES': 'Si',
  'GENERAL.NO': 'No',
  'GENERAL.CLIENT': 'Cliente',
  'GENERAL.NOTE': 'Nota',

  // Auth
  'AUTH.SIGN_IN': 'Iniciar sesión',
  'AUTH.SIGN_IN_TITLE': 'Ingresá a tu cuenta',
  'AUTH.REGISTER': 'Crear cuenta',
  'AUTH.REGISTER_TITLE': 'Crear nueva cuenta',
  'AUTH.EMAIL': 'Email',
  'AUTH.EMAIL_REQUIRED': 'El email es requerido',
  'AUTH.PASSWORD': 'Contraseña',
  'AUTH.PASSWORD_REQUIRED': 'La contraseña es requerida',
  'AUTH.PASSWORD_CONFIRM': 'Confirmar contraseña',
  'AUTH.PASSWORD_MISMATCH': 'Las contraseñas no coinciden',
  'AUTH.FULL_NAME': 'Nombre completo',
  'AUTH.FULL_NAME_REQUIRED': 'El nombre completo es requerido',
  'AUTH.CELL_PHONE': 'Teléfono celular',
  'AUTH.CELL_PHONE_REQUIRED': 'El teléfono es requerido',
  'AUTH.NO_ACCOUNT': '¿No tenés cuenta?',
  'AUTH.HAVE_ACCOUNT': '¿Ya tenés cuenta?',
  'AUTH.SIGNING_IN': 'Ingresando...',
  'AUTH.REGISTERING': 'Registrando...',
  'AUTH.INVALID_CREDENTIALS': 'Email o contraseña inválidos',
  'AUTH.ACCOUNT_INACTIVE': 'Tu cuenta está inactiva. Contactá soporte.',
  'AUTH.SERVER_ERROR': 'Algo salió mal. Intentá de nuevo.',
  'AUTH.OFFLINE_LOGIN': 'Estás offline. Se requiere conexión para iniciar sesión.',
  'AUTH.UNSAVED_TITLE': 'Cambios sin guardar',
  'AUTH.UNSAVED_MESSAGE': 'Tenés cambios sin guardar. ¿Qué querés hacer?',

  // Tutorial
  'TUTORIAL.TITLE': 'Tutorial',

  // Menu groups (exact Angular MENU.*.TITLE strings from vocabs/es.ts)
  'MENU.ADMIN': 'ADMINISTRACIÓN',
  'MENU.SALES': 'VENTA',
  'MENU.INVENTORY': 'INVENTARIO',
  'MENU.EXPENSES': 'GASTOS',
  'MENU.SYNCHRONIZATION': 'SINCRONIZACIÓN',
  'MENU.REPORTS': 'REPORTES',
  'MENU.STATISTICS': 'ESTADÍSTICAS',
  'MENU.MANAGEMENT': 'GESTIÓN',
  'MENU.PROFILE': 'Perfil',

  // Menu items — Admin (Angular MENU.ADMIN.*)
  'MENU.ADMIN_DASHBOARD': 'Dashboard',
  'MENU.ADMIN_STORES': 'Tiendas',
  'MENU.OWNERS': 'Propietarios',
  'MENU.RESELLERS': 'Gestores',
  'MENU.FEATURES': 'Funcionalidades',

  // Menu items — Sales (Angular MENU.SALE_MGMT.*)
  'MENU.PRODUCTS': 'Catálogo Productos',
  'MENU.SALE': 'Vender',
  'MENU.TODAY_ORDERS': 'Ventas del día',
  'MENU.TODAY_CREDITS': 'Créditos del día',
  'MENU.TODAY_STATS': 'Cuadre del día',
  'MENU.CREDITS_HISTORY': 'Créditos',
  'MENU.ORDERS_HISTORY': 'Ventas',

  // Menu items — Inventory (Angular MENU.INVENTORY_MGMT.*)
  'MENU.AVAILABLE': 'Disponible',
  'MENU.TODAY_ENTRIES': 'Entradas del día',
  'MENU.TODAY_QUANTITIES': 'Cantidades del día',
  'MENU.TODAY_SALES_PROFIT': 'Ganancias del día',
  'MENU.EGRESS': 'Salida',
  'MENU.ENTRIES_HISTORY': 'Entradas',

  // Menu items — Expenses (Angular MENU.EXPENSES.*)
  'MENU.TODAY_EXPENSES': 'Gastos del día',
  'MENU.EXPENSES_HISTORY': 'Gastos',

  // Menu items — Synchronization (Angular MENU.SYNCHRONIZATION.*)
  'MENU.EXPORT': 'Exportar',
  'MENU.IMPORT': 'Importar',

  // Menu items — Reports / Stats / Management (Angular MENU.REPORTS.*, MENU.STATISTICS.*, MENU.STORE_MGMT.*)
  'MENU.TODAY_REPORTS': 'Reportes del día',
  'MENU.DASHBOARD': 'Panel de Control',
  'MENU.STORES': 'Tiendas',
  'MENU.USERS': 'Empleados',
  'MENU.CONFIGURATIONS': 'Configuraciones',
  'MENU.TUTORIAL': 'Tutorial',
  'MENU.EDIT_PROFILE': 'Editar Perfil',
  'MENU.CHANGE_PASSWORD': 'Cambiar Contraseña',

  // Cart
  'CART.TITLE': 'Carrito',
  'CART.EMPTY': 'Carrito vacío',
  'CART.PAYMENT_TYPE': 'Tipo de pago',
  'CART.CREDIT_SALE': 'Venta a crédito',
  'CART.CLIENT_NAME': 'Nombre del cliente',
  'CART.EFECTIVO': 'Efectivo',
  'CART.TARJETA': 'Tarjeta',
  'CART.ZELLE': 'Zelle',
  'CART.CREATE_ORDER': 'Crear pedido',
  'CART.ITEMS': '{count, plural, one {# artículo} other {# artículos}}',
  'CART.CLIENT_NAME_REQUIRED': 'El nombre del cliente es requerido para ventas a crédito',

  // Products (Angular PRODUCT.* / PRODUCT_CATEGORY.* — literal Spanish strings from
  // frontend/src/app/_modules/i18n/vocabs/es.ts, kept byte-identical for L6 parity)
  'PRODUCTS.TITLE': 'Productos',
  'PRODUCTS.CREATE': 'Crear producto',
  'PRODUCTS.EDIT': 'Editar producto',
  'PRODUCTS.BULK_EDIT': 'Edición masiva',
  'PRODUCTS.IMPORT_CSV': 'Importar CSV',
  'PRODUCTS.FORM.NAME': 'Nombre',
  'PRODUCTS.FORM.PRICE': 'Precio',
  'PRODUCTS.FORM.CATEGORY': 'Categoría',
  'PRODUCTS.FORM.BARCODE': 'Código de barras',
  'PRODUCTS.FORM.AVAILABLE_TO_SALE': 'Disponible para Vender',
  'PRODUCTS.FORM.DISCOUNT_FROM_INVENTORY': 'Descontar del inventario',
  'PRODUCTS.EMPTY_STATE': 'No hay productos registrados',
  'PRODUCTS.CSV.TITLE': 'Importar productos desde CSV',
  'PRODUCTS.CSV.PREVIEW': 'Vista previa',
  'PRODUCTS.CSV.VALID_ROWS': '{count} filas válidas',
  'PRODUCTS.CSV.ERROR_ROWS': '{count} filas con error',
  'PRODUCTS.CSV.IMPORT_VALID': 'Importar filas válidas',
  'PRODUCTS.CSV.ERROR.MISSING_NAME': 'El nombre es requerido',
  'PRODUCTS.CSV.ERROR.MISSING_PRICE': 'El precio es requerido',
  'PRODUCTS.CSV.ERROR.INVALID_PRICE': 'El precio debe ser un número válido',
  'PRODUCTS.CSV.ERROR.DUPLICATE_BARCODE': 'El código de barras ya existe',
  'PRODUCTS.CATEGORY.CREATE': 'Crear categoría',
  'PRODUCTS.CATEGORY.EDIT': 'Editar categoría',
  // Angular PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY — header FAB label (also reused, per
  // Angular, as the per-category "Editar Categoría" action's key EDIT_CATEGORY below)
  'PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY': 'Categoría',
  'PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY_ALERT_MESSAGE':
    'Para adicionar un producto debe primero adicionar una categoría',
  'PRODUCT_CATEGORY.IMPORT_PRODUCTS': 'Importar Productos',
  'PRODUCT_CATEGORY.NO_PRODUCT_FOUND': 'No hay productos en esta categoría.',
  // NOTE: Angular's category-product-list.component.html:15 uses key EDIT_CATEGORY (not
  // EDIT_PRODUCT_CATEGORY) for the per-category "edit" button, and EDIT_CATEGORY's Spanish
  // value in vocabs/es.ts is literally 'Categoría' — same text as NEW_PRODUCT_CATEGORY.
  'PRODUCT_CATEGORY.EDIT_CATEGORY': 'Categoría',
  'PRODUCT.PRODUCTS': 'Productos',
  'PRODUCT.NEW_PRODUCT': 'Producto',
  'PRODUCT.NEW_PRODUCTS': 'Productos',
  'PRODUCT.EDIT_PRODUCT': 'Editar Producto',
  'PRODUCT.DELETE_PRODUCT': 'Eliminar Producto',
  'PRODUCT.AVAILABLE_TO_SALE': 'Disponible para Vender',

  // Sale / POS screen (Angular SALES.* — frontend/src/app/_modules/i18n/vocabs/es.ts)
  'SALES.HEADER': 'Productos para vender',
  'SALES.NO_SELECTED_CATEGORY_ALERT_MESSAGE': 'Seleccione primero una categoría para adicionar productos a la venta.',
  'SALES.PRODUCT_ADDED_TO_CART': 'El producto fue adicionado a la venta',
  'SALES.PRODUCT_NOT_ADDED_TO_CART':
    'Ocurrío un error adicionando el producto a la venta. Por favor, vuelva a intentarlo y si persiste contacte al equipo de soporte técnico.',
  'SALES.NOT_INVENTORY_AVAILABLE_MESSAGE': 'El producto no está disponible en el inventario.',

  // GENERAL.VALIDATION.* (Angular GENERAL.VALIDATION — used by sale-product-row quantity/price form)
  'GENERAL.VALIDATION.REQUIRED': '{name} es requerido',
  'GENERAL.VALIDATION.NUMBER_GREADER_THAN_ZERO': '{name} mínimo valor es 0',

  // Orders (Angular ORDERS.* — vocabs/es.ts. ORDERS.TITLE fixed to the exact Angular
  // string; ORDERS.TODAY_TITLE/DATE/TOTAL/CREDIT_BADGE/EMPTY_STATE/DEACTIVATE*/DATE_FROM/
  // DATE_TO are now orphaned — the old React-only Orders/TodayOrders implementation used
  // them, replaced this batch by strict Angular parity. Left in place, not pruned, per
  // established no-instruction-to-prune-orphans precedent).
  'ORDERS.TITLE': 'Historial de Ventas',
  'ORDERS.NO_ORDERS_FOUND': 'No se encontró ninguna venta',
  'ORDERS.TODAY_TITLE': 'Pedidos de hoy',
  'ORDERS.STATS_TITLE': 'Estadísticas de hoy',
  'ORDERS.DATE': 'Fecha',
  'ORDERS.TOTAL': 'Total',
  'ORDERS.ITEMS_COUNT': 'Artículos',
  'ORDERS.PAYMENT_TYPE': 'Tipo de pago',
  'ORDERS.CREDIT_BADGE': 'Crédito',
  'ORDERS.EMPTY_STATE': 'No hay pedidos',
  'ORDERS.DEACTIVATE': 'Anular pedido',
  'ORDERS.DEACTIVATE_CONFIRM': '¿Estás seguro de que querés anular este pedido?',
  'ORDERS.DEACTIVATE_WITH_CREDIT_WARNING': 'Este pedido tiene un crédito asociado que también será anulado.',
  'ORDERS.DATE_FROM': 'Desde',
  'ORDERS.DATE_TO': 'Hasta',
  'ORDERS.STATS.REVENUE': 'Ingresos totales',
  'ORDERS.STATS.ITEMS_SOLD': 'Artículos vendidos',

  // Today Orders (Angular TODAY_ORDERS.* — vocabs/es.ts)
  'TODAY_ORDERS.HEADER': 'Ventas del día',
  'TODAY_ORDERS.NO_ORDER_FOUND': 'No se ha realizado ninguna venta en el día de hoy.',
  'TODAY_ORDERS.SEND_TO_CART_CONFIRM_TITLE': 'Confirmación para volver a vender',
  'TODAY_ORDERS.SEND_TO_CART_CONFIRM_MESSAGE': 'Hay una venta en proceso. ¿Desea eliminar esa venta y continuar?',
  'TODAY_ORDERS.TEXT': 'Venta',
  'TODAY_ORDERS.ERROR_DELETING_ORDER': 'Ocurrió un error eliminando la venta. {message}',
  'TODAY_ORDERS.EDIT_ORDER': 'Editar Venta',
  'TODAY_ORDERS.DELETE_ORDER': 'Eliminar Venta',
  'TODAY_ORDERS.DEACTIVATE_ORDER': 'Cancelar Venta',
  'TODAY_ORDERS.ACTIVATE_ORDER': 'Activar Venta',

  // Today Stats (Angular TODAY_STATS.* — vocabs/es.ts. today-orders.component.html reuses
  // TODAY_STATS.NO_ORDER_FOUND for its own empty state, not TODAY_ORDERS.NO_ORDER_FOUND —
  // that is Angular's literal source behavior, preserved here)
  'TODAY_STATS.HEADER': 'Cuadre del día',
  'TODAY_STATS.NO_ORDER_FOUND': 'No se ha realizado ninguna venta en el día de hoy.',
  'TODAY_STATS.NO_EXPENSE_FOUND': 'No se ha realizado ningun gasto en el día de hoy.',
  // The remaining today-stats.component.html panel labels are HARDCODED Spanish literals
  // in Angular's own template (not i18n keys — no [translate] pipe on them). Preserved
  // as literal strings here too, not invented translation keys, to stay byte-identical.

  // Category Stats (category-stats.component.html has no i18n keys — currency-formatted
  // numbers and category/product names only, no static Spanish text at all).

  // Sale Credit (Angular SALE_CREDIT.* — vocabs/es.ts, byte-identical. PAYMENT_CREDIT is
  // Angular's literal title for BOTH edit-sale-credit-modal AND sale-credit-payment-modal
  // (also reused verbatim by edit-order-modal) — Angular's own source uses the same key
  // for all three, preserved here, not a paraphrase or a bug fix).
  'SALE_CREDIT.TITLE': 'Créditos',
  'SALE_CREDIT.TODAY_CREDITS': 'Créditos del día',
  'SALE_CREDIT.TO_PAY': 'Pagar',
  'SALE_CREDIT.PAYMENT_CREDIT': 'Venta por Cobrar',
  'SALE_CREDIT.PAYMENT_CONFIRM_TITLE': 'Confirmación de Pago',
  'SALE_CREDIT.PAYMENT_CONFIRM_MESSAGE': 'Usted está segura(o) que desea pagar este crédito por venta?',
  'SALE_CREDIT.NO_SALE_CREDIT_FOUND_IN_DAY': 'No existe ningún crédito en el día',
  'SALE_CREDIT.NO_SALE_CREDIT_FOUND': 'No se encontró ningún crédito',

  // Inventory
  'INVENTORY.AVAILABLE.TITLE': 'Stock disponible',
  'INVENTORY.TODAY_ENTRIES.TITLE': 'Entradas de hoy',
  'INVENTORY.TODAY_ENTRIES.NEW_ENTRY': 'Nueva entrada',
  'INVENTORY.ENTRIES.TITLE': 'Historial de entradas',
  'INVENTORY.QUANTITIES.TITLE': 'Cantidades de hoy',
  'INVENTORY.PROFIT.TITLE': 'Ganancia de hoy',
  'INVENTORY.PROFIT.REVENUE': 'Ingresos',
  'INVENTORY.PROFIT.COST': 'Costo',
  'INVENTORY.PROFIT.GROSS_PROFIT': 'Ganancia bruta',
  'INVENTORY.PROFIT.MARGIN': 'Margen',
  'INVENTORY.ENTRY.PRODUCT': 'Producto',
  'INVENTORY.ENTRY.CATEGORY': 'Categoría',
  'INVENTORY.ENTRY.QUANTITY': 'Cantidad',
  'INVENTORY.ENTRY.COST_PRICE': 'Precio de costo',
  'INVENTORY.ENTRY.DATE': 'Fecha',
  'INVENTORY.ENTRY.AVAILABLE': 'Disponible',
  'INVENTORY.ERRORS.SOLD_ENTRY_CANNOT_EDIT': 'No se puede editar una entrada que ya tiene ventas asociadas',
  'INVENTORY.ERRORS.SOLD_ENTRY_CANNOT_DELETE': 'No se puede eliminar una entrada que ya tiene ventas asociadas',
  'INVENTORY.EMPTY_STATE': 'No hay entradas de inventario',

  // Egress
  'EGRESS.TITLE': 'Egresos',
  'EGRESS.FORM.PRODUCT': 'Producto',
  'EGRESS.FORM.QUANTITY': 'Cantidad',
  'EGRESS.FORM.TYPE': 'Tipo de egreso',
  'EGRESS.FORM.NOTES': 'Notas',
  'EGRESS.FORM.DATE': 'Fecha',
  'EGRESS.TYPES.WASTE': 'Desperdicio',
  'EGRESS.TYPES.RETURN': 'Devolución',
  'EGRESS.TYPES.TRANSFER': 'Transferencia',
  'EGRESS.TYPES.ADJUSTMENT': 'Ajuste',
  'EGRESS.EMPTY_STATE': 'No hay egresos registrados',

  // Scanner
  'SCANNER.CAMERA_PERMISSION_DENIED': 'Permiso de cámara denegado. Habilitá el acceso a la cámara para usar el escáner.',
  'SCANNER.PRODUCT_NOT_FOUND': 'Producto no encontrado: {barcode}',
  'SCANNER.SCANNING': 'Escaneando...',

  // Expenses — Today
  'EXPENSES.TODAY.TITLE': 'Gastos de hoy',
  'EXPENSES.NEW_TITLE': 'Nuevo gasto',
  'EXPENSES.EDIT_TITLE': 'Editar gasto',
  'EXPENSES.EMPTY_STATE': 'No hay gastos registrados',
  'EXPENSES.EDIT': 'Editar',
  'EXPENSES.DELETE': 'Eliminar',
  'EXPENSES.DELETE_CONFIRM': '¿Estás seguro de que querés eliminar este gasto?',
  'EXPENSES.RUNNING_TOTAL': 'Total del día: ${total}',
  'EXPENSES.ADD_BUTTON': 'Nuevo gasto',

  // Expenses — History
  'EXPENSES.HISTORY.TITLE': 'Historial de gastos',
  'EXPENSES.FILTERED_TOTAL': 'Total filtrado: ${total}',

  // Expenses — Form
  'EXPENSES.FORM.TYPE': 'Tipo de gasto',
  'EXPENSES.FORM.TOTAL': 'Total',
  'EXPENSES.FORM.DATE': 'Fecha',
  'EXPENSES.FORM.PAYMENT_TYPE': 'Tipo de pago',
  'EXPENSES.FORM.NOTE': 'Nota',
  'EXPENSES.FORM.TOTAL_REQUIRED': 'El total debe ser mayor a 0',

  // Expenses — Filters
  'EXPENSES.FILTER.DATE_FROM': 'Desde',
  'EXPENSES.FILTER.DATE_TO': 'Hasta',
  'EXPENSES.FILTER.TYPE': 'Tipo',

  // Expenses — Pagination
  'EXPENSES.PAGINATION.ROWS_PER_PAGE': 'Filas por página',
  'EXPENSES.PAGINATION.INFO': 'Página {page} de {totalPages} ({total} registros)',
  'EXPENSES.PAGINATION.PREV': 'Anterior',
  'EXPENSES.PAGINATION.NEXT': 'Siguiente',

  // Expenses — Expense types
  'EXPENSES.TYPE.SALARIO': 'Salario',
  'EXPENSES.TYPE.TRANSPORTE': 'Transporte',
  'EXPENSES.TYPE.ALQUILER': 'Alquiler',
  'EXPENSES.TYPE.CORRIENTE': 'Cuenta corriente',
  'EXPENSES.TYPE.AGUA': 'Agua',
  'EXPENSES.TYPE.COMIDA': 'Comida',
  'EXPENSES.TYPE.OPERACIONES': 'Operaciones',
  'EXPENSES.TYPE.VIAJE': 'Viaje',
  'EXPENSES.TYPE.DIVISA': 'Divisa',
  'EXPENSES.TYPE.IMPUESTO': 'Impuesto',
  'EXPENSES.TYPE.OTRO': 'Otro',

  // Reports — Today
  'REPORTS.TODAY.TITLE': 'Reportes de hoy',
  'REPORTS.REFRESH': 'Actualizar',
  'REPORTS.SALES_SUMMARY.TITLE': 'Resumen de ventas',
  'REPORTS.SALES_SUMMARY.ORDER_COUNT': 'Pedidos',
  'REPORTS.SALES_SUMMARY.TOTAL_REVENUE': 'Ingresos',
  'REPORTS.SALES_SUMMARY.TOTAL_COST': 'Costo',
  'REPORTS.SALES_SUMMARY.TOTAL_PROFIT': 'Ganancia bruta',
  'REPORTS.INVENTORY.TITLE': 'Estado de inventario',
  'REPORTS.INVENTORY.PRODUCT': 'Producto',
  'REPORTS.INVENTORY.AVAILABLE': 'Disponible',
  'REPORTS.INVENTORY.EMPTY_STATE': 'Sin stock disponible',

  // Statistics — Dashboard
  'STATISTICS.DASHBOARD.TITLE': 'Dashboard',
  'STATISTICS.LAST_30_DAYS': 'Últimos 30 días',
  'STATISTICS.SALES.TITLE': 'Ventas',
  'STATISTICS.PROFIT.TITLE': 'Ganancia bruta',
  'STATISTICS.EMPTY_STATE': 'Sin datos para mostrar',

  // Footer (exact Angular FOOTER.* strings from vocabs/es.ts)
  'FOOTER.COPYRIGHT1': '© AutoBusinessPro - {year}',
  'FOOTER.COPYRIGHT2': 'Todos los derechos reservados',
  'FOOTER.COOKIES_POLICE': 'Políticas de Cookies',
  'FOOTER.PRIVACY_POLICE': 'Políticas de Privacidad',
  'FOOTER.TERMS_CONDITIONS': 'Términos y Condiciones',
  'FOOTER.CONTACT_US': 'Contáctanos',

  // Profile
  'PROFILE.EDIT_TITLE': 'Editar perfil',
  'PROFILE.CHANGE_PASSWORD_TITLE': 'Cambiar contraseña',
  'PROFILE.FULL_NAME': 'Nombre completo',
  'PROFILE.CELL_PHONE': 'Teléfono celular',
  'PROFILE.EMAIL': 'Email',
  'PROFILE.SAVE': 'Guardar cambios',
  'PROFILE.SAVING': 'Guardando...',
  'PROFILE.UPDATE_SUCCESS': 'Perfil actualizado correctamente.',
  'PROFILE.UPDATE_ERROR': 'No se pudo actualizar el perfil. Intentá de nuevo.',
  'PROFILE.OLD_PASSWORD': 'Contraseña actual',
  'PROFILE.NEW_PASSWORD': 'Nueva contraseña',
  'PROFILE.CONFIRM_PASSWORD': 'Confirmar nueva contraseña',
  'PROFILE.CHANGE_PASSWORD_SUBMIT': 'Cambiar contraseña',
  'PROFILE.PASSWORD_REGEX_ERROR': 'La contraseña debe tener entre 8 y 30 caracteres, al menos una mayúscula, una minúscula y un número.',
  'PROFILE.PASSWORD_MISMATCH': 'Las contraseñas no coinciden.',
  'PROFILE.OFFLINE_NOTICE': 'Sin conexión. Conectate a internet para guardar cambios.',
  'PROFILE.PASSWORD_RULES': 'Mínimo 8 caracteres, una mayúscula, una minúscula y un número.',
  'PROFILE.SUCCESS': 'Operación exitosa.',
  'PROFILE.ERROR': 'Ocurrió un error. Intentá de nuevo.',
  'PROFILE.REQUIRED': 'Este campo es obligatorio.',
  'PROFILE.INVALID_EMAIL': 'El formato del email no es válido.',

  // Management — Stores
  'MANAGEMENT.TITLE': 'Gestión',
  'STORES.LIST_TITLE': 'Tiendas',
  'STORES.CREATE_TITLE': 'Nueva tienda',
  'STORES.EDIT_TITLE': 'Editar tienda',
  'STORES.NAME': 'Nombre',
  'STORES.ADDRESS': 'Dirección',
  'STORES.DESCRIPTION': 'Descripción',
  'STORES.OWNER': 'Propietario',
  'STORES.APPROVED': 'Aprobada',
  'STORES.IS_ACTIVE': 'Activa',
  'STORES.PAYMENT_START_DATE': 'Fecha de inicio de pago',
  'STORES.SAVE': 'Guardar',
  'STORES.SAVING': 'Guardando...',
  'STORES.CREATE': 'Crear tienda',
  'STORES.EDIT': 'Editar',
  'STORES.ACTIVATE': 'Activar',
  'STORES.DEACTIVATE': 'Desactivar',
  'STORES.APPROVE': 'Aprobar',
  'STORES.DISAPPROVE': 'Desaprobar',
  'STORES.CREATE_SUCCESS': 'Tienda creada correctamente.',
  'STORES.UPDATE_SUCCESS': 'Tienda actualizada correctamente.',
  'STORES.ERROR': 'Ocurrió un error. Intentá de nuevo.',
  'STORES.OFFLINE_NOTICE': 'Sin conexión. Conectate para guardar cambios.',
  'STORES.EMPTY_STATE': 'No hay tiendas registradas.',
  'STORES.DEGRADED_NOTICE': 'Mostrando datos en caché (sin conexión).',
  'STORES.NAME_REQUIRED': 'El nombre es obligatorio.',
  'STORES.MODULES_LABEL': 'Módulos',
  'STORES.MODULES_TOTAL': 'Total',
  'STORES.MODULES_PRICE': 'Precio',
  'STORES.SELECT_ALL_MODULES': 'Seleccionar todos',
  'STORES.REQUIRED': 'Este campo es obligatorio.',
  'STORES.LIFECYCLE_ERROR': 'No se pudo realizar la acción. Intentá de nuevo.',

  // Management — Users
  'USERS.LIST_TITLE': 'Usuarios',
  'USERS.CREATE_TITLE': 'Nuevo usuario',
  'USERS.EDIT_TITLE': 'Editar usuario',
  'USERS.FULL_NAME': 'Nombre completo',
  'USERS.LOGIN': 'Usuario (login)',
  'USERS.PASSWORD': 'Contraseña',
  'USERS.CONFIRM_PASSWORD': 'Confirmar contraseña',
  'USERS.CELL_PHONE': 'Teléfono',
  'USERS.EMAIL': 'Email',
  'USERS.IS_ACTIVE': 'Activo',
  'USERS.OLD_PASSWORD': 'Contraseña actual',
  'USERS.NEW_PASSWORD': 'Nueva contraseña',
  'USERS.CONFIRM_NEW_PASSWORD': 'Confirmar nueva contraseña',
  'USERS.STORE': 'Tienda',
  'USERS.SAVE': 'Guardar',
  'USERS.UPDATE': 'Actualizar',
  'USERS.CHANGE_PASSWORD': 'Cambiar contraseña',
  'USERS.CREATE_SUCCESS': 'Usuario creado correctamente.',
  'USERS.UPDATE_SUCCESS': 'Usuario actualizado correctamente.',
  'USERS.PASSWORD_CHANGED': 'Contraseña cambiada correctamente.',
  'USERS.OFFLINE_NOTICE': 'Sin conexión. Conectate para guardar cambios.',
  'USERS.DEGRADED_NOTICE': 'Mostrando datos en caché (sin conexión).',
  'USERS.EMPTY': 'No hay usuarios registrados.',
  'USERS.ACTIVATE': 'Activar',
  'USERS.DEACTIVATE': 'Desactivar',
  'USERS.PASSWORD_POLICY': 'La contraseña debe tener entre 8 y 30 caracteres, e incluir al menos una mayúscula, una minúscula y un número.',
  'USERS.PASSWORDS_MUST_MATCH': 'Las contraseñas no coinciden.',
  'USERS.CELL_PHONE_REQUIRED': 'El teléfono es obligatorio.',
  'USERS.ERROR': 'Ocurrió un error. Intentá de nuevo.',
  'USERS.EDIT': 'Editar',
  'USERS.CREATE': 'Crear usuario',
  'USERS.LIFECYCLE_ERROR': 'No se pudo realizar la acción. Intentá de nuevo.',

  // Admin — Dashboard
  'ADMIN_DASHBOARD.HEADER': 'Panel de Control',
  'ADMIN_DASHBOARD.TITLE': 'Estadísticas de Tiendas Activos',
  'ADMIN_DASHBOARD.LAST_7_DAYS': 'Últimos 7 días',
  'ADMIN_DASHBOARD.LAST_30_DAYS': 'Últimos 30 días',
  'ADMIN_DASHBOARD.COL_CATEGORY': 'Categoría',
  'ADMIN_DASHBOARD.COL_VALUE': 'Valor',
  'ADMIN_DASHBOARD.ERROR': 'Ocurrió un error. Intentá de nuevo.',

  // Admin — Resellers
  'RESELLERS.LIST_TITLE': 'Revendedores',
  'RESELLERS.ADD': 'Agregar revendedor',
  'RESELLERS.CREATE_TITLE': 'Nuevo revendedor',
  'RESELLERS.EDIT_TITLE': 'Editar revendedor',
  'RESELLERS.PERCENT_DISCOUNT': 'Descuento porcentual',
  'RESELLERS.DISCOUNT_PRICE': 'Precio con descuento',
  'RESELLERS.PASSWORD_POLICY': 'La contraseña debe tener entre 8 y 30 caracteres, e incluir al menos una mayúscula, una minúscula y un número.',
  'RESELLERS.PASSWORDS_MUST_MATCH': 'Las contraseñas no coinciden.',
  'RESELLERS.PHONE_FORMAT': 'El teléfono debe tener formato cubano (+53 X XXX-XXXX).',
  'RESELLERS.ERROR': 'Ocurrió un error. Intentá de nuevo.',

  // Admin — Features
  'FEATURES.TITLE': 'Funcionalidades',
  'FEATURES.ACTIVATE_FEATURES': 'Activar funcionalidades',
  'FEATURES.FEATURES_ACTIVATED': 'Las funcionalidades fueron activadas correctamente.',
  'FEATURES.UNEXPECTED_ERROR': 'Ocurrió un error inesperado. Intentá de nuevo.',

  // Admin — Owners
  'OWNER.LIST_TITLE': 'Propietarios',
  'OWNER.CREATE_TITLE': 'Nuevo propietario',
  'OWNER.EDIT_TITLE': 'Editar propietario',
  'OWNER.EDIT_OWNER': 'Editar propietario',
  'OWNER.STORE_PRICE_LABEL': '{count, plural, one {# tienda} other {# tiendas}}',
  'OWNER.ERROR': 'Ocurrió un error. Intentá de nuevo.',
  'OWNER.PASSWORD_POLICY': 'La contraseña debe tener entre 8 y 30 caracteres, e incluir al menos una mayúscula, una minúscula y un número.',
  'OWNER.PASSWORDS_MUST_MATCH': 'Las contraseñas no coinciden.',
  'OWNER.PHONE_FORMAT': 'El teléfono debe tener formato cubano (+53 X XXX-XXXX).',
  'OWNER.EDIT_TITLE_LABEL': 'Editar propietario',
  'OWNER.USERS_TAB_PLACEHOLDER': 'Gestión de usuarios próximamente.',

  // Admin — Owners — tab labels (uses GENERAL.DETAILS / GENERAL.STORES / GENERAL.USERS)
  'GENERAL.DETAILS': 'Detalles',
  'GENERAL.STORES': 'Tiendas',
  'GENERAL.USERS': 'Usuarios',
  'GENERAL.RESELLER': 'Revendedor',

  // Sync — Export / Import
  'SYNC.EXPORT_TITLE': 'Exportar datos',
  'SYNC.IMPORT_TITLE': 'Importar datos',
  'SYNC.PASSWORD_LABEL': 'Contraseña de cifrado',
  'SYNC.EXPORT_BUTTON': 'Exportar',
  'SYNC.IMPORT_BUTTON': 'Importar',
  'SYNC.FILE_LABEL': 'Archivo de respaldo (.zip)',
  'SYNC.EXPORTING': 'Exportando...',
  'SYNC.IMPORTING': 'Importando...',
  'SYNC.SUCCESS_TITLE': 'Importación completada',
  'SYNC.RESULT_INSERTED': '{count} insertado(s)',
  'SYNC.RESULT_UPDATED': '{count} actualizado(s)',
  'SYNC.ERROR_WRONG_PASSWORD': 'Contraseña incorrecta. No se realizaron cambios.',
  'SYNC.ERROR_CORRUPT_FILE': 'El archivo está dañado o tiene un formato no compatible.',
  'SYNC.ERROR_EMPTY_PASSWORD': 'La contraseña no puede estar vacía.',
  'SYNC.ERROR_NO_FILE': 'Seleccioná un archivo de respaldo.',
};

export default messages;
