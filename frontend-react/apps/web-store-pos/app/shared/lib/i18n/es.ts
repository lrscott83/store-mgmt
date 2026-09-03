const messages: Record<string, string> = {
  // General
  'GENERAL.APP_NAME': 'VendeDTo',
  'GENERAL.APP_SUBTITLE': 'Automatiza tu Negocio',
  'GENERAL.LOADING': 'Cargando...',
  'GENERAL.SAVE': 'Salvar',
  'GENERAL.CANCEL': 'Cancelar',
  'GENERAL.DISCARD': 'Descartar',
  'GENERAL.CONFIRM': 'Confirmar',
  'GENERAL.CLOSE': 'Cerrar',
  'GENERAL.INFORMATION': 'Información',
  'GENERAL.IMPORT': 'Importar',
  'GENERAL.FILE': 'Fichero',
  'GENERAL.SELECT_FILE': 'Seleccionar archivo',
  'GENERAL.NO_FILE_SELECTED': 'Ningún archivo seleccionado',
  'GENERAL.CREDIT': 'Crédito',
  'GENERAL.SEARCH': 'Buscar',
  'GENERAL.NO_RESULTS': 'No hay resultados',
  'GENERAL.TOTAL': 'Total',
  'GENERAL.CHANGE': 'Cambio',
  'GENERAL.QUANTITY': 'Cantidad',
  'GENERAL.PRICE': 'Precio',
  'GENERAL.NAME': 'Nombre',
  'GENERAL.ADD': 'Adicionar',
  // GENERAL.NEW — Angular vocabs/es.ts:221, "+ Nuevo" add-row button
  // (edit-products-modal.component.html:74).
  'GENERAL.NEW': 'Nuevo',
  // Angular GENERAL.ENTRY / GENERAL.INSERT (vocabs/es.ts:220,178) — add-entry CTA label and
  // the create-mode save button text (edit-inventory-entry-modal.component.html:84).
  'GENERAL.ENTRY': 'Entrada',
  'GENERAL.INSERT': 'Adicionar',
  'GENERAL.ERROR': 'Error',
  'GENERAL.SUCCESS': 'Éxito',
  'GENERAL.OFFLINE': 'Sin conexión. Se requiere conexión a internet.',
  'GENERAL.LOGOUT': 'Salir',
  // The user-popup's icon-only logout button (dropdown header) — distinct from the
  // text "Salir" item so the two controls have unique accessible names.
  'GENERAL.LOGOUT_ICON': 'Cerrar sesión',
  // GENERAL.PROFILE — Angular nav-right user popup tab label (vocabs/es.ts PROFILE: 'Perfil')
  'GENERAL.PROFILE': 'Perfil',
  'GENERAL.EDIT': 'Editar',
  'GENERAL.DELETE': 'Eliminar',
  'GENERAL.UPDATE': 'Actualizar',
  'GENERAL.YES': 'Si',
  'GENERAL.NO': 'No',
  'GENERAL.OK': 'Ok',
  // GENERAL.ALL — Angular's payment-type filter "Todas" option is a hardcoded literal with
  // no [translate] pipe (expenses.component.html:16); added as a proper i18n key here per
  // React's no-hardcoded-Spanish convention. Value is byte-identical to Angular's literal.
  'GENERAL.ALL': 'Todas',
  'GENERAL.ACTIVE': 'Activo',
  'GENERAL.CLIENT': 'Cliente',
  'GENERAL.NOTE': 'Nota',
  // GENERAL.DELETE_CONFIRM_TITLE/MESSAGE_A (Angular GENERAL.* — used by SweetAlert2 confirm
  // dialogs, e.g. order-item-list.component.ts:35-38 deactivateOrder)
  'GENERAL.DELETE_CONFIRM_TITLE': 'Confirmación para eliminar',
  'GENERAL.DELETE_CONFIRM_MESSAGE_A': '¿Está seguro que desea eliminar esta {name}?',
  // GENERAL.DELETE_CONFIRM_MESSAGE (masculine variant, Angular vocabs/es.ts:159) — used by
  // expense-list.component.ts:56 (onDeleteExpense) with name=GENERAL.EXPENSE.
  'GENERAL.DELETE_CONFIRM_MESSAGE': '¿Está seguro que desea eliminar este {name}?',
  // GENERAL.CONFIRM_TITLE / GENERAL.WIZARD_DIRTY_MESSAGE (Angular vocabs/es.ts:175,190) —
  // the unsaved-changes SweetAlert shown by can-deactivate.guard.ts (view-text-parity).
  'GENERAL.CONFIRM_TITLE': 'Confirmación',
  'GENERAL.WIZARD_DIRTY_MESSAGE':
    'Usted tiene cambios pendientes. ¿Desea salvar los cambios antes de pasar a la otra página?',

  // Auth
  'AUTH.SIGN_IN': 'Iniciar sesión',
  'AUTH.SIGN_IN_TITLE': 'Inicia sesión en tu cuenta',
  'AUTH.REGISTER': 'Crear cuenta',
  'AUTH.REGISTER_TITLE': 'Crear nueva cuenta',
  'AUTH.EMAIL': 'Email',
  // The sign-in credential is the LOGIN (a username), never the email — the
  // two are different fields on a user. See docs/contracts/login-is-not-email.md.
  'AUTH.LOGIN_REQUIRED': 'El usuario es requerido',
  'AUTH.PASSWORD': 'Contraseña',
  'AUTH.PASSWORD_REQUIRED': 'La contraseña es requerida',
  'AUTH.PASSWORD_CONFIRM': 'Confirmar contraseña',
  'AUTH.PASSWORD_MISMATCH': 'Las contraseñas no coinciden',
  'AUTH.FULL_NAME': 'Nombre completo',
  'AUTH.FULL_NAME_REQUIRED': 'El nombre completo es requerido',
  'AUTH.CELL_PHONE': 'Teléfono celular',
  'AUTH.CELL_PHONE_REQUIRED': 'El teléfono es requerido',
  'AUTH.NO_ACCOUNT': '¿No tienes cuenta?',
  'AUTH.HAVE_ACCOUNT': '¿Ya tienes cuenta?',
  'AUTH.SIGNING_IN': 'Ingresando...',
  'AUTH.REGISTERING': 'Registrando...',
  'AUTH.INVALID_CREDENTIALS': 'Usuario o contraseña incorrectos',
  'AUTH.ACCOUNT_INACTIVE': 'Tu cuenta está inactiva. Contacta soporte.',
  'AUTH.SERVER_ERROR': 'Ocurrió un error. Inténtalo de nuevo.',
  'AUTH.TOO_MANY_ATTEMPTS': 'Demasiados intentos. Espera un momento antes de volver a intentar.',
  'AUTH.INVALID_ERROR': 'La autenticación no es válida por el siguiente error: {error}',
  'AUTH.OFFLINE_LOGIN': 'Estás sin conexión. Se requiere conexión para iniciar sesión.',
  // at-rest-encryption-errors spec §"unlock banner and failure copy exact
  // strings" — ratified verbatim, do not reword. AUTH.UNLOCK_FAILED is
  // asserted byte-for-byte by e2e/login-offline.spec.ts T7 (:359,
  // UNLOCK_FAILED_TEXT) — that file is untouchable without authorization, so
  // this string may never be reworded or removed without it.
  'AUTH.UNLOCK_REQUIRED': 'Ingresa tu contraseña para desbloquear los datos de este dispositivo.',
  'AUTH.UNLOCK_FAILED':
    'No se pudieron desbloquear los datos de este dispositivo. Si cambiaste tu contraseña, solicita una nueva activación.',
  'AUTH.UNSAVED_TITLE': 'Cambios sin guardar',
  'AUTH.UNSAVED_MESSAGE': 'Tienes cambios sin guardar. ¿Qué deseas hacer?',

  // Offline device provisioning (offline-auth-frontend) — own PROVISION.*
  // namespace, not reused from SYNC.*: its copy is domain-specific (design
  // correction #5, no plan task covered this).
  'PROVISION.TITLE': 'Activar dispositivo sin conexión',
  'PROVISION.SUCCESS': 'Dispositivo activado. Ya puedes iniciar sesión sin conexión.',
  'PROVISION.STORE_ID_LABEL': 'Identificador de tienda',
  'PROVISION.MASTER_PASSWORD_LABEL': 'Contraseña maestra',
  'PROVISION.FILE_LABEL': 'Archivo de roster (.smcabundle)',
  'PROVISION.SUBMIT': 'Activar',
  'PROVISION.ERROR_WRONG_PASSWORD': 'La contraseña de activación es incorrecta.',
  'PROVISION.ERROR_CORRUPT_FILE': 'El archivo está dañado o no tiene un formato válido.',
  'PROVISION.ERROR_EXPIRED': 'Este archivo de activación ya venció. Pedile uno nuevo al administrador.',
  'PROVISION.ERROR_REPLAY': 'Este archivo ya se usó en este equipo. Pedile uno nuevo al administrador.',
  'PROVISION.ERROR_UNKNOWN_FILE':
    'No pudimos reconocer el archivo. No parece un archivo de activación exportado por el sistema.',

  'OFFLINE_ACCESS.MODAL_TITLE': 'Activar acceso sin conexión',
  'OFFLINE_ACCESS.MODAL_INTRO':
    'Con esto podrás entrar a este equipo aunque no haya internet. Necesitas el archivo de activación y su contraseña — pídeselos al administrador de tu tienda.',
  'OFFLINE_ACCESS.FILE_LABEL': 'Archivo de activación',
  'OFFLINE_ACCESS.PASSWORD_LABEL': 'Contraseña de activación',
  'OFFLINE_ACCESS.SUBMIT': 'Activar',
  'OFFLINE_ACCESS.ERROR_NO_FILE': 'Elige el archivo de activación.',
  'OFFLINE_ACCESS.ENABLE_BUTTON': 'Activar acceso sin conexión',
  'OFFLINE_ACCESS.DISABLE_BUTTON': 'Desactivar acceso sin conexión',
  'OFFLINE_ACCESS.ENABLED': 'Listo. Este equipo ya puede entrar sin internet.',
  'OFFLINE_ACCESS.DISABLED': 'Acceso sin conexión desactivado.',
  'OFFLINE_ACCESS.DISABLE_TITLE': '¿Desactivar el acceso sin conexión?',
  'OFFLINE_ACCESS.DISABLE_MESSAGE':
    'Este equipo necesitará internet para entrar. Para volver a activarlo tendrás que solicitar un archivo nuevo: el que usaste ya no sirve.',
  'OFFLINE_ACCESS.DISABLE_MESSAGE_DATA_LOSS':
    'Este equipo necesitará internet para entrar. Para volver a activarlo tendrás que solicitar un archivo nuevo: el que usaste ya no sirve. Además, los datos guardados en este equipo quedarán ilegibles.',
  'OFFLINE_ACCESS.DISABLE_CONFIRM': 'Sí, desactivar',
  'OFFLINE_ACCESS.ERROR_UNAVAILABLE':
    'No pudimos completar la acción. Recarga la página e intenta de nuevo.',
  'OFFLINE_ACCESS.HELP_BUTTON': 'Ayuda para activar el acceso sin conexión',
  'OFFLINE_ACCESS.HELP_TITLE': 'Cómo activar el acceso sin conexión',
  'OFFLINE_ACCESS.HELP_STEP1': '1. Desde un equipo ya activado, el administrador exporta el roster con una contraseña usando el botón "Exportar roster sin conexión" de la página de Empleados.',
  'OFFLINE_ACCESS.HELP_STEP2': '2. Transfiere ese archivo de roster a este equipo.',
  'OFFLINE_ACCESS.HELP_STEP3': '3. En este equipo toca "Activar acceso sin conexión", elige el archivo y escribe la contraseña.',

  // Registration (Angular REGISTRATION.* — vocabs/es.ts:131-134, top-level sibling of
  // AUTH/GENERAL, not nested. view-text-parity.)
  'REGISTRATION.WELCOME': 'Creación de cuenta',
  'REGISTRATION.ALREADY_ACCOUNT': '¿Ya tienes una cuenta?',
  'REGISTRATION.SIGNIN_LINK': 'Entra',
  'REGISTRATION.SIGNUP_BUTTON': 'Registrar',
  // NEW — Angular register.component.ts has no connectivity check/banner at all;
  // wording follows AUTH.OFFLINE_LOGIN pattern (view-text-parity spec).
  'REGISTRATION.OFFLINE_BANNER': 'Estás sin conexión. Se requiere conexión para registrarte.',
  // REGISTRATION.UNEXPECTED_ERROR (Angular vocabs/es.ts:135-136) — generic network/unknown
  // error fallback for register's catch block (view-text-parity DoD: no leftover English
  // literals in touched files).
  'REGISTRATION.UNEXPECTED_ERROR':
    'Ocurrió un error inesperado en la creación de la cuenta. Por favor, revise su conexión o contacte al equipo de soporte técnico.',
  // NEW — React-invented client-side validation sub-case (Angular's onSubmit has no
  // equivalent branching), spec-fixed Spanish text per the blanket text-parity rule
  // (view-text-parity DoD).
  'REGISTRATION.VALIDATION_ERROR': 'Error de validación. Por favor, revise sus datos.',
  'REGISTRATION.TOO_MANY_ATTEMPTS':
    'Demasiados intentos de registro. Por favor, espere unos minutos antes de volver a intentar.',
  // Terms-acceptance toggle (Angular register.component.html:191-210, vocabs/es.ts:135-137)
  'REGISTRATION.ACCEPT_CONDITIONS': 'Estoy de acuerdo con los ',
  'REGISTRATION.TERMS_CONDITIONS': 'términos y condiciones',
  'REGISTRATION.INFO_TERMS_CONDITIONS':
    'Usted debe aceptar los términos y condiciones para registrarse en el sistema.',

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

  // Egress — Mayorista wholesale-sale screen header (Angular egress.component.html:4, matches
  // INVENTORY_MGMT.EGRESS's own header key verbatim: 'Salida')
  'INVENTORY_EGRESS.HEADER': 'Salida',

  // Menu items — Expenses (Angular MENU.EXPENSES.*)
  'MENU.TODAY_EXPENSES': 'Gastos del día',
  'MENU.EXPENSES_HISTORY': 'Gastos',

  // Menu items — Synchronization (Angular MENU.SYNCHRONIZATION.*)
  'MENU.EXPORT': 'Exportar',
  'MENU.IMPORT': 'Importar',

  // Menu items — Reports / Stats / Management (Angular MENU.REPORTS.*, MENU.STATISTICS.*, MENU.STORE_MGMT.*)
  'MENU.TODAY_REPORTS': 'Reportes del día',
  'MENU.DASHBOARD': 'Panel de Control',
  // Plan/update split: the single 'Tiendas' entry became two links — the plan
  // view (/management/stores) and the store-data update view
  // (/management/stores/update), same authorization (EFeatures.Stores).
  'MENU.STORES_PLAN': 'Plan de la tienda',
  'MENU.STORES_UPDATE': 'Editar la tienda',
  'MENU.USERS': 'Empleados',
  'MENU.CONFIGURATIONS': 'Configuraciones',
  'MENU.TUTORIAL': 'Tutorial',
  'MENU.EDIT_PROFILE': 'Editar Perfil',
  'MENU.CHANGE_PASSWORD': 'Cambiar Contraseña',

  // Cart
  'CART.TITLE': 'Carrito',
  'CART.EMPTY': 'Carrito vacío',
  'CART.PAYMENT_TYPE': 'Tipo de pago',
  'CART.CLIENT_NAME': 'Nombre del cliente',
  'CART.EFECTIVO': 'Efectivo',
  'CART.TARJETA': 'Tarjeta',
  'CART.ZELLE': 'Zelle',
  'CART.CREATE_ORDER': 'Crear pedido',
  'CART.ITEMS': '{count, plural, one {# artículo} other {# artículos}}',
  'CART.CLIENT_NAME_REQUIRED': 'El nombre del cliente es requerido para ventas a crédito',

  // Shopping Cart (Angular SHOPPING_CART.* — vocabs/es.ts, byte-identical. This is the
  // nav-right cart-dropdown keyset (batch: Stage 1 Sales cart parity); CART.* above
  // predates this batch and stays as-is, not renamed, to avoid churn in existing call
  // sites/tests).
  'SHOPPING_CART.PRODUCTS_LABEL': 'productos',
  'SHOPPING_CART.PRODUCT_LABEL': 'producto',
  'SHOPPING_CART.REGISTER': 'Registrar',
  'SHOPPING_CART.PRICE_LABEL': 'Precio: ',
  'SHOPPING_CART.ORDER_CREATED': 'La venta fue creada satisfactoriamente.',
  'SHOPPING_CART.ORDER_NOT_CREATED':
    'Ocurrío un error creando la venta. Por favor, vuelva a intentarlo y si persiste contacte al equipo de soporte técnico.',
  'SHOPPING_CART.DON_NOT_PAY_EMPTY_CART':
    'La venta no tiene ningún producto. Usted debe adicionar algún producto a la venta para pagar.',
  'SHOPPING_CART.PRINT_INVOICE': 'Imprimir Factura (prueba)',
  'SHOPPING_CART.CLEAR': 'Limpiar',
  'SHOPPING_CART.DON_NOT_PAY_LESS_THAN_CART_TOTAL':
    'Usted no puede realizar la venta porque el pago es menor que el total.',
  'SHOPPING_CART.DON_NOT_SALE_CREDIT_WITHOUT_CLIENT':
    'Usted no puede realizar la venta por cobrar sin especificar el cliente.',
  // Angular vocabs/es.ts:388 (SHOPPING_CART.EDIT_DETAILS) — used by the ported-but-unwired
  // EditOrderDetailsModal (edit-order-details-parity, Fase 6 slice 3/3).
  'SHOPPING_CART.EDIT_DETAILS': 'Editar Detalles',
  // Cart line-item quantity/remove controls — Angular's nav-right template has NO
  // aria-labels on these buttons at all (icon-only, no accessibility text); these are a
  // React-added a11y improvement with previously-hardcoded English text, now Spanish per
  // the blanket text-parity rule (not a port of missing Angular copy).
  'CART.DECREASE_QUANTITY': 'Disminuir cantidad de {name}',
  'CART.INCREASE_QUANTITY': 'Aumentar cantidad de {name}',
  'CART.REMOVE_ITEM': 'Eliminar {name}',

  // GENERAL.PAY — Angular's mat-form-field label for the cart's payment/tendered-amount input.
  'GENERAL.PAY': 'Pago',
  // GENERAL.EXPENSE (Angular vocabs/es.ts:225) — the {name} interpolated into
  // GENERAL.DELETE_CONFIRM_MESSAGE by expense-list.component.ts:56 (onDeleteExpense).
  'GENERAL.EXPENSE': 'Gasto',

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
  'PRODUCTS.FORM.DISCOUNT_FROM_INVENTORY': 'Descuenta del Inventario',
  'PRODUCTS.EMPTY_STATE': 'No hay productos registrados',
  'PRODUCTS.CSV.TITLE': 'Importar productos desde CSV',
  'PRODUCTS.CSV.PREVIEW': 'Vista previa',
  'PRODUCTS.CSV.VALID_ROWS': '{count} filas válidas',
  'PRODUCTS.CSV.ERROR_ROWS': '{count} filas con error',
  'PRODUCTS.CSV.IMPORT_VALID': 'Importar filas válidas',
  'PRODUCTS.CSV.ERROR.MISSING_NAME': 'El nombre es requerido',
  'PRODUCTS.CSV.ERROR.MISSING_PRICE': 'El precio es requerido',
  'PRODUCTS.CSV.ERROR.INVALID_PRICE': 'El precio debe ser un número válido',
  'PRODUCTS.CSV.ERROR.MISSING_CATEGORY': 'La categoría es requerida',
  'PRODUCTS.CSV.ERROR.DUPLICATE_BARCODE': 'El código de barras ya existe',
  // PRODUCTS.CSV preview-table column headers/status badges — this client-side CSV preview
  // (parse + per-row validation table) has NO Angular counterpart at all (Angular's
  // csv-product-importer-modal.component.html only has a file input, no preview table); these
  // keys exist purely so this React-invented UI's text is Spanish per the blanket text-parity
  // rule, not as a port of Angular copy. Reuses PRODUCTS.FORM.* for the shared field labels.
  'PRODUCTS.CSV.COL_ROW': 'Fila',
  'PRODUCTS.CSV.COL_STATUS': 'Estado',
  'PRODUCTS.CSV.STATUS_VALID': 'Válido',
  'PRODUCTS.CATEGORY.CREATE': 'Crear categoría',
  'PRODUCTS.CATEGORY.EDIT': 'Editar categoría',
  // Angular PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY — header FAB label (also reused, per
  // Angular, as the per-category "Editar Categoría" action's key EDIT_CATEGORY below)
  'PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY': 'Categoría',
  'PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY_ALERT_MESSAGE':
    'Para adicionar un producto debe primero adicionar una categoría',
  'PRODUCT_CATEGORY.IMPORT_PRODUCTS': 'Importar Productos',
  'PRODUCT_CATEGORY.DOWNLOAD_SAMPLE': 'Descargar Ejemplo',
  'PRODUCT_CATEGORY.NO_PRODUCT_FOUND': 'No hay productos en esta categoría.',
  // NOTE: Angular's category-product-list.component.html:15 uses key EDIT_CATEGORY (not
  // EDIT_PRODUCT_CATEGORY) for the per-category "edit" button, and EDIT_CATEGORY's Spanish
  // value in vocabs/es.ts is literally 'Categoría' — same text as NEW_PRODUCT_CATEGORY.
  'PRODUCT_CATEGORY.EDIT_CATEGORY': 'Categoría',
  'PRODUCT.PRODUCTS': 'Productos',
  'PRODUCT.NEW_PRODUCT': 'Producto',
  'PRODUCT.NEW_PRODUCTS': 'Productos',
  'PRODUCT.EDIT_PRODUCT': 'Editar Producto',
  // catalog-show-all-and-clear-data §Finding 2: ProductRepository.deleteProduct is a soft
  // delete (isActive: false, row stays in storage), so the catalog row menu item is labelled
  // for what it actually does — the label was aligned to the behaviour, not the other way
  // around. Replaces the removed 'PRODUCT.DELETE_PRODUCT' key, whose only consumer was this
  // same row menu item.
  'PRODUCT.DEACTIVATE_PRODUCT': 'Desactivar Producto',
  // Mirrors DEACTIVATE_PRODUCT: an inactive catalog row's menu offers the reverse action,
  // implemented through updateProduct(isActive: true) — no dedicated activateProduct exists
  // on ProductService (exact Angular parity surface, untouchable).
  'PRODUCT.ACTIVATE_PRODUCT': 'Activar Producto',
  'PRODUCT.AVAILABLE_TO_SALE': 'Disponible para Vender',
  // PRODUCT.ADD_PRODUCTS (Angular vocabs/es.ts:373) — edit-products-modal title
  // (edit-products-modal.component.html:4).
  'PRODUCT.ADD_PRODUCTS': 'Adicionar Productos',

  // Sale / POS screen (Angular SALES.* — frontend/src/app/_modules/i18n/vocabs/es.ts)
  'SALES.HEADER': 'Productos para vender',
  'SALES.NO_SELECTED_CATEGORY_ALERT_MESSAGE': 'Seleccione primero una categoría para adicionar productos a la venta.',
  'SALES.PRODUCT_ADDED_TO_CART': 'El producto fue adicionado a la venta',
  'SALES.PRODUCT_NOT_ADDED_TO_CART':
    'Ocurrío un error adicionando el producto a la venta. Por favor, vuelva a intentarlo y si persiste contacte al equipo de soporte técnico.',
  'SALES.NOT_INVENTORY_AVAILABLE_MESSAGE': 'El producto no está disponible en el inventario.',
  'SALES.ALL_CATEGORIES': 'Todos',
  'SALES.SEARCH_PLACEHOLDER': 'Buscar producto por nombre...',

  // ProductErrors (Angular frontend/src/app/domain/entities/products/product.errors.ts —
  // hardcoded Spanish literals there, not i18n keys; added here as i18n keys for React's
  // text-parity convention. Byte-identical to the Angular literals). Used by
  // hasAvailableProductToSale's 5-way branch (checkProductAvailabilityToSale).
  'PRODUCT_ERRORS.NOT_EXISTS': 'El producto no existe.',
  'PRODUCT_ERRORS.INACTIVE': 'El producto no está activo.',
  'PRODUCT_ERRORS.NOT_AVAILABLE_TO_SALE': 'El producto no está disponible para la venta.',
  'PRODUCT_ERRORS.QUANTITY_NOT_AVAILABLE': 'La cantidad del producto no está disponible en el inventario.',

  // GENERAL.RESPONSE.* (Angular GENERAL.RESPONSE — used as the blocking-error-modal title,
  // e.g. sale-product-row.component.ts:72 Swal.fire title)
  'GENERAL.RESPONSE.ERROR_TITLE': 'Error',
  // GENERAL.RESPONSE.SUCCESS_TITLE (toast-notifications-parity) — Angular's toastrService
  // success-toast title (e.g. nav-right.component.ts:215, features.component.ts:31).
  'GENERAL.RESPONSE.SUCCESS_TITLE': 'Éxito',
  // GENERAL.RESPONSE.ERROR500_MESSAGE — Angular's generic technical-support fallback.
  'GENERAL.RESPONSE.ERROR500_MESSAGE':
    'Por favor, vuelva a intentarlo y si persiste el error contacte al equipo de soporte técnico.',
  // GENERAL.RESPONSE.ERROR404_MESSAGE (Angular vocabs/es.ts:254-255) — root ErrorBoundary
  // 404 details copy (view-text-parity).
  'GENERAL.RESPONSE.ERROR404_MESSAGE':
    'Puede que necesite estar conectado a Internet para hacer esta operación. Por favor, vuelva a intentarlo y si persiste el error contacte al equipo de soporte técnico.',

  // SaleCreditErrors / OrderErrors (Angular frontend/src/app/domain/entities/sale-credits/
  // sale-credit.errors.ts and .../orders/order.errors.ts — hardcoded Spanish literals there,
  // not i18n keys; added here as i18n keys for React's text-parity convention, same
  // PRODUCT_ERRORS.* precedent above). `SaleCreditOfflineService.updateSaleCredit` /
  // `.paidSaleCredit` and `OrderOfflineService.updateTodayOrder` each have exactly ONE
  // failure branch (record not found), so `dataEntry.errors[0].description` in Angular's
  // edit-sale-credit-modal.component.ts:66-70, sale-credit-payment-modal.component.ts:71-75,
  // and edit-order-modal.component.ts:49-53 is always this static literal — NOT the generic
  // ERROR500_MESSAGE fallback used previously.
  'SALE_CREDIT_ERRORS.NOT_EXISTS': 'El gasto no existe.',
  'ORDER_ERRORS.NOT_EXISTS': 'La orden no existe',
  // ExpenseErrors.NotExists (Angular frontend/src/app/domain/entities/expenses/
  // expense.errors.ts — hardcoded Spanish literal, not an i18n key there; added here as an
  // i18n key for React's text-parity convention, same PRODUCT_ERRORS.*/ORDER_ERRORS.*
  // precedent above). ExpenseOfflineService.update's only failure branch is not-found.
  'EXPENSE_ERRORS.NOT_EXISTS': 'El gasto no existe.',

  // GENERAL.VALIDATION.* (Angular GENERAL.VALIDATION — used by sale-product-row quantity/price form)
  'GENERAL.VALIDATION.REQUIRED': '{name} es requerido',
  'GENERAL.VALIDATION.NUMBER_GREADER_THAN_ZERO': '{name} mínimo valor es 0',
  // GENERAL.VALIDATION.PASSWORD_POLICY / INVALID_PASSWORD (Angular vocabs/es.ts:242,241) —
  // register.tsx password field validation (view-text-parity).
  'GENERAL.VALIDATION.PASSWORD_POLICY':
    'La contraseña debe tener al menos 8 caracteres, un número y una letra en mayúscula',
  'GENERAL.VALIDATION.INVALID_PASSWORD': 'Las contraseñas no son iguales',
  // Angular GENERAL.VALIDATION.NUMBER_GREADER_THAN_ONE/INVALID_INTEGER/INVALID_FLOAT
  // (vocabs/es.ts:244,246-247) — edit-inventory-entry-modal quantity/costPrice validation.
  'GENERAL.VALIDATION.NUMBER_GREADER_THAN_ONE': '{name} mínimo valor es 1',
  'GENERAL.VALIDATION.INVALID_INTEGER': 'El valor no es válido. Debe ser un entero mayor a 1.',
  'GENERAL.VALIDATION.INVALID_FLOAT':
    'El valor no es válido. Debe ser un número y usar el . como valor decimal.',

  // GENERAL.ORDER (Angular GENERAL.ORDER — used by edit-product-category-modal's order field)
  'GENERAL.ORDER': 'Orden',

  // Orders (Angular ORDERS.* — vocabs/es.ts. ORDERS.TITLE fixed to the exact Angular
  // string; ORDERS.TODAY_TITLE/DATE/TOTAL/CREDIT_BADGE/EMPTY_STATE/DEACTIVATE*/DATE_FROM/
  // DATE_TO are now orphaned — the old React-only Orders/TodayOrders implementation used
  // them, replaced this batch by strict Angular parity. Left in place, not pruned, per
  // established no-instruction-to-prune-orphans precedent).
  'ORDERS.TITLE': 'Historial de Ventas',
  'ORDERS.NO_ORDERS_FOUND': 'No se encontró ninguna venta',
  // SALES.ORDERS.REPORT_SUSPECT_WARNING — shown when the per-day inventory-at-sale-price
  // export flags suspect products (entries touched on/after the day, or reconstructed
  // stock exceeding the received quantity). Interpolates the comma-joined product names.
  'SALES.ORDERS.REPORT_SUSPECT_WARNING':
    'El stock de estos productos pudo ser editado después de ese día: {names}',
  // SALES.ORDERS.DAY_SALES_SUMMARY / _TITLE — per-day "Resumen de ventas" popup from the
  // sales-history day gear menu (React-only feature: Angular's orders history has no gear
  // menu at all). Shows the same four metrics as the reports/today sales-summary section,
  // scoped to a single day; the title interpolates the day (dd/mm/yyyy).
  'SALES.ORDERS.DAY_SALES_SUMMARY': 'Resumen de ventas del día',
  'SALES.ORDERS.DAY_SALES_SUMMARY_TITLE': 'Resumen de ventas del {date}',
  'ORDERS.TODAY_TITLE': 'Pedidos de hoy',
  'ORDERS.STATS_TITLE': 'Estadísticas de hoy',
  'ORDERS.DATE': 'Fecha',
  'ORDERS.TOTAL': 'Total',
  'ORDERS.ITEMS_COUNT': 'Artículos',
  'ORDERS.PAYMENT_TYPE': 'Tipo de pago',
  'ORDERS.CREDIT_BADGE': 'Crédito',
  'ORDERS.EMPTY_STATE': 'No hay pedidos',
  'ORDERS.DEACTIVATE': 'Anular pedido',
  'ORDERS.DEACTIVATE_CONFIRM': '¿Estás seguro de que deseas anular este pedido?',
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
  // TITLE values corrected to byte-match Angular's INVENTORY.INVENTORY ('Inventario') and
  // INVENTORY_ENTRY.ENTRIES_IN_DAY ('Entradas del día') — vocabs/es.ts:430,422 (L6 parity,
  // Stage 2.3). NEW_ENTRY kept as-is (used only for the Today Entries add-entry button, whose
  // Angular counterpart is GENERAL.ENTRY, added separately above).
  'INVENTORY.AVAILABLE.TITLE': 'Inventario',
  'INVENTORY.TODAY_ENTRIES.TITLE': 'Entradas del día',
  'INVENTORY.TODAY_ENTRIES.NEW_ENTRY': 'Nueva entrada',
  // Capitalization fixed to byte-match Angular's INVENTORY.ENTRIES_HISTORY (vocabs/es.ts:434).
  'INVENTORY.ENTRIES.TITLE': 'Historial de Entradas',
  // Angular source: inventory-offline.service.ts callers / i18n/vocabs/es.ts:435 —
  // byte-identical Spanish, shown when EntriesPage has zero day-groups (gap #6).
  'INVENTORY.NO_HISTORY_ENTRY_FOUND': 'No se encontró ninguna entrada',
  // Angular INVENTORY.* keys added verbatim (vocabs/es.ts:429-434) — Stage 2.3 L6 parity.
  // INVENTORY.INVENTORY/ENTRIES_HISTORY duplicate the (now-corrected) TITLE values above under
  // their own Angular-named keys, kept for audit completeness/precedent (see ORDERS.* orphans).
  'INVENTORY.INVENTORY': 'Inventario',
  'INVENTORY.ENTRIES_HISTORY': 'Historial de Entradas',
  // Available page's top-level "no products at all" empty state (inventory-available.component
  // .html:15, categories$ empty) — was previously covered by the overloaded INVENTORY.EMPTY_STATE.
  'INVENTORY.NO_ENTRY_FOUND': 'No existe ningún producto disponible',
  // Per-category "no products in this category" empty state (inventory-product-list.component
  // .html:4) — was previously covered by the overloaded INVENTORY.EMPTY_STATE.
  'INVENTORY.CATEGORY_PRODUCT_NO_FOUND': 'No existe ningún producto disponible en la categoría',
  // Angular INVENTORY_ENTRY.* namespace (vocabs/es.ts:420-426) — today-entries add/edit modal
  // + today-entries empty state (was previously covered by the overloaded INVENTORY.EMPTY_STATE).
  // INVENTORY_ENTRY.TEXT (Angular vocabs/es.ts:421) — used by Swal's DELETE_CONFIRM_MESSAGE_A
  // interpolation in entry-list.component.ts:70 (onDeleteInventoryEntry).
  'INVENTORY_ENTRY.TEXT': 'Entrada',
  'INVENTORY_ENTRY.ENTRIES_IN_DAY': 'Entradas del día',
  'INVENTORY_ENTRY.NO_ENTRY_FOUND_IN_DAY': 'No existe ninguna entrada en el día',
  'INVENTORY_ENTRY.NEW_INVENTORY_ENTRY': 'Adicionar Entrada',
  'INVENTORY_ENTRY.EDIT_INVENTORY_ENTRY': 'Editar Entrada',
  // Angular source: inventory-today-quantities.component.html + i18n/vocabs/es.ts
  // INVENTORY.TODAY_QUANTITIES/NO_PRODUCTS/PRODUCT/BEGINNING/ENTRIES/AVAILABLE/SOLD/ENDING —
  // Spanish text byte-identical to Angular.
  'INVENTORY.QUANTITIES.TITLE': 'Cantidades del Día',
  'INVENTORY.QUANTITIES.NO_PRODUCTS': 'No hay productos disponibles',
  'INVENTORY.QUANTITIES.PRODUCT': 'Producto',
  'INVENTORY.QUANTITIES.BEGINNING': 'Inicio',
  'INVENTORY.QUANTITIES.ENTRIES': 'Entradas',
  'INVENTORY.QUANTITIES.AVAILABLE': 'Disponible',
  'INVENTORY.QUANTITIES.SOLD': 'Vendido',
  'INVENTORY.QUANTITIES.ENDING': 'Final',
  // Angular parity: inventory-today-sales-profit.component.ts / .html — keys mirror Angular's
  // flat INVENTORY.{TODAY_SALES_PROFIT,NO_SALES_TODAY,PRODUCT,SOLD,PRICE,COST,PROFIT,TOTAL}
  // vocab (es.ts:438-454), byte-identical Spanish text. Corrected TITLE from the previous
  // invented "Ganancia de hoy"; removed REVENUE/GROSS_PROFIT/MARGIN (no Angular analog).
  'INVENTORY.PROFIT.TITLE': 'Ganancias del Día',
  'INVENTORY.PROFIT.NO_SALES': 'No hay ventas hoy',
  'INVENTORY.PROFIT.PRODUCT': 'Producto',
  'INVENTORY.PROFIT.SOLD': 'Vendido',
  'INVENTORY.PROFIT.PRICE': 'Precio',
  'INVENTORY.PROFIT.COST': 'Costo',
  'INVENTORY.PROFIT.PROFIT': 'Ganancia',
  'INVENTORY.PROFIT.TOTAL': 'Total',
  'INVENTORY.ENTRY.PRODUCT': 'Producto',
  'INVENTORY.ENTRY.CATEGORY': 'Categoría',
  'INVENTORY.ENTRY.QUANTITY': 'Cantidad',
  'INVENTORY.ENTRY.COST_PRICE': 'Precio de costo',
  'INVENTORY.ENTRY.AVAILABLE': 'Disponible',
  'INVENTORY.ERRORS.SOLD_ENTRY_CANNOT_EDIT': 'No se puede editar una entrada que ya tiene ventas asociadas',
  'INVENTORY.ERRORS.SOLD_ENTRY_CANNOT_DELETE': 'No se puede eliminar una entrada que ya tiene ventas asociadas',
  // Orphaned since Stage 2.3 (L6 parity): was overloaded across 3 distinct empty-states with
  // different Angular text (see INVENTORY_ENTRY.NO_ENTRY_FOUND_IN_DAY / INVENTORY.NO_ENTRY_FOUND
  // / INVENTORY.CATEGORY_PRODUCT_NO_FOUND above, now used instead). Left in place, not pruned,
  // per established no-instruction-to-prune-orphans precedent (see ORDERS.* orphans).
  'INVENTORY.EMPTY_STATE': 'No hay entradas de inventario',

  // Scanner
  'SCANNER.CAMERA_PERMISSION_DENIED': 'Permiso de cámara denegado. Habilitá el acceso a la cámara para usar el escáner.',
  'SCANNER.PRODUCT_NOT_FOUND': 'Producto no encontrado: {barcode}',
  'SCANNER.SCANNING': 'Escaneando...',

  // Expenses — Today (Angular EXPENSE.TODAY_EXPENSES/NO_EXPENSE_FOUND_IN_DAY/NEW_EXPENSE/
  // EDIT_EXPENSE, vocabs/es.ts — byte-matched here, INCLUDING Angular's own typos, per the
  // established project-wide convention of preserving Angular source typos verbatim for
  // strict text parity (see ORDERS.NO_ORDERS_FOUND / TODAY_STATS.NO_EXPENSE_FOUND precedent).
  'EXPENSES.TODAY.TITLE': 'Gastos del día',
  'EXPENSES.NEW_TITLE': 'Adicionar Gasto',
  // Angular EXPENSE.EDIT_EXPENSE has a source typo ('Gatos' instead of 'Gastos').
  // Per policy #511 (Angular bugs are FIXED in React, not replicated) it is corrected here.
  'EXPENSES.EDIT_TITLE': 'Editar Gastos',
  'EXPENSES.EMPTY_STATE': 'No existe ningún gasto en el día',
  'EXPENSES.EDIT': 'Editar',
  'EXPENSES.DELETE': 'Eliminar',
  'EXPENSES.DELETE_CONFIRM': '¿Estás seguro de que deseas eliminar este gasto?',
  'EXPENSES.ADD_BUTTON': 'Gasto',

  // Expenses — History (Angular EXPENSE.EXPENSES_HISTORY/NO_EXPENSE_FOUND, vocabs/es.ts).
  'EXPENSES.HISTORY.TITLE': 'Historial de Gastos',
  // Angular EXPENSE.NO_EXPENSE_FOUND has a source typo ('enxontró' instead of 'encontró').
  // Corrected here per policy #511 (Angular bugs are FIXED, not replicated). History-specific
  // empty state, distinct from the Today page's EXPENSES.EMPTY_STATE.
  'EXPENSES.HISTORY.EMPTY_STATE': 'No se encontró ningún gasto',

  // Expenses — Form
  'EXPENSES.FORM.TYPE': 'Tipo de gasto',
  'EXPENSES.FORM.TOTAL': 'Total',
  'EXPENSES.FORM.PAYMENT_TYPE': 'Tipo de pago',
  'EXPENSES.FORM.NOTE': 'Nota',
  'EXPENSES.FORM.TOTAL_REQUIRED': 'El total debe ser mayor a 0',

  // Expenses — Expense types
  'EXPENSES.TYPE.SALARIO': 'Salario',
  'EXPENSES.TYPE.TRANSPORTE': 'Transporte',
  'EXPENSES.TYPE.ALQUILER': 'Alquiler',
  // ExpenseType.Corriente (Angular expense.model.ts's raw enum-key text, no translation
  // layer) — was mistranslated to 'Cuenta corriente'; Angular never says that anywhere in
  // this domain. Fixed to byte-match the raw enum key.
  'EXPENSES.TYPE.CORRIENTE': 'Corriente',
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
  // Angular literal key (inventory-today-sale.component.html, es.ts:496) — the
  // "Generar Reporte" PDF export button label. Kept under the singular `REPORT.*`
  // namespace (not `REPORTS.*`) to match Angular's key 1:1.
  'REPORT.INVENTORY_TODAY_SALE': 'Inventario a precio de venta',
  // REPORTS.PDF_DOWNLOAD_SUCCESS — success toast fired by inventory-today-sale-pdf.ts
  // once the inventory-at-sale-price PDF download has been triggered. Applies to both
  // reports/today's "Generar Reporte" and the per-day sales-history gear export.
  'REPORTS.PDF_DOWNLOAD_SUCCESS': 'El reporte se descargó correctamente.',

  // Statistics — Dashboard
  // Angular parity: DASHBOARD.HEADER (vocabs/es.ts:501-503) is the card-header title.
  'DASHBOARD.HEADER': 'Panel de Control',
  'STATISTICS.DASHBOARD.TITLE': 'Dashboard',
  'STATISTICS.LAST_30_DAYS': 'Últimos 30 días',
  'STATISTICS.SALES.TITLE': 'Ventas',
  'STATISTICS.PROFIT.TITLE': 'Ganancia bruta',
  'STATISTICS.EMPTY_STATE': 'Sin datos para mostrar',

  // Footer (exact Angular FOOTER.* strings from vocabs/es.ts)
  'FOOTER.COPYRIGHT1': '© AutoBusinessPro - {year}',
  'FOOTER.COPYRIGHT2': 'Todos los derechos reservados',
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
  // L6 parity (frontend/src/app/_modules/i18n/vocabs/es.ts STORE.CREATE:337 / STORE.EDIT:338)
  'STORES.CREATE_TITLE': 'Crear una tienda',
  'STORES.EDIT_TITLE': 'Editar la tienda',
  'STORES.NAME': 'Nombre',
  'STORES.ADDRESS': 'Dirección',
  'STORES.DESCRIPTION': 'Descripción',
  'STORES.OWNER': 'Propietario',
  // L6 parity (GENERAL.APPROVED:174 'Aceptado')
  'STORES.APPROVED': 'Aceptado',
  // L6 parity (GENERAL.ACTIVE:154 'Activo')
  'STORES.IS_ACTIVE': 'Activo',
  'STORES.PAYMENT_START_DATE': 'Fecha de inicio de pago',
  'STORES.SAVE': 'Guardar',
  'STORES.SAVING': 'Guardando...',
  'STORES.EDIT': 'Editar',
  'STORES.ACTIVATE': 'Activar',
  'STORES.DEACTIVATE': 'Desactivar',
  // L6 parity (LIST_ACTION_BUTTON.APPROVE:316 'Aceptar')
  'STORES.APPROVE': 'Aceptar',
  'STORES.DISAPPROVE': 'Desaprobar',
  'STORES.CREATE_SUCCESS': 'Tienda creada correctamente.',
  'STORES.UPDATE_SUCCESS': 'Tienda actualizada correctamente.',
  // L6 parity: Angular is register-neutral, no voseo ("Intentá" -> "Intente")
  'STORES.ERROR': 'Ocurrió un error. Intente de nuevo.',
  'STORES.FILTER_LABEL': 'Mostrar:',
  'STORES.PAID_PLAN': 'Plan de Pago',
  'STORES.FREE_PLAN': 'Plan Gratis',
  'STORES.EMPTY_STATE': 'No hay tiendas registradas.',
  'STORES.NAME_REQUIRED': 'El nombre es obligatorio.',
  'STORES.PLAN.SECTION_TITLE': 'Plan de la tienda',
  'STORES.NO_STORE_SELECTED': 'No hay una tienda seleccionada.',
  'STORES.PLAN.BILLING_NOTICE': 'Plan Pago: 1 mes GRATIS. Luego se cobra por mes vencido → el primer pago después del segundo mes.',
  'STORES.PLAN.FREE_TAB': 'Gratis',
  'STORES.PLAN.PAID_TAB': 'Pago',
  'STORES.PLAN.ACTIVE_BADGE': 'Activo',
  'STORES.PLAN.INCLUDES': 'Incluye:',
  'STORES.PLAN.INCLUDES_FREE_PLUS': 'Todo lo del plan Gratis, y además:',
  'STORES.PLAN.SELECTED': 'Plan seleccionado',
  'STORES.PLAN.ACTIVATE': 'Activar este plan',
  'STORES.PLAN.WILL_ACTIVATE_ON_SAVE': 'Se activará al guardar',
  'STORES.PLAN.CURRENCY_NOTICE': 'Los precios se muestran en USD. El pago se realiza en MN al cambio oficial del día.',
  'STORES.MODULES_LABEL': 'Módulos',
  'STORES.MODULES_TOTAL': 'Total',
  'STORES.MODULES_PRICE': 'Precio',
  'STORES.SELECT_ALL_MODULES': 'Seleccionar todos',
  // Req: Field-Name-Aware Required Validation (Angular GENERAL.VALIDATION.REQUIRED : { name })
  'STORES.OWNER_REQUIRED': 'El propietario es obligatorio.',
  'STORES.PAYMENT_START_DATE_REQUIRED': 'La fecha de inicio de pago es obligatoria.',
  'STORES.LIFECYCLE_ERROR': 'No se pudo realizar la acción. Intente de nuevo.',
  // Confirm-dialog copy (Angular parity: GENERAL.APPROVE_CONFIRM_TITLE/MESSAGE,
  // GENERAL.DISAPPROVE_CONFIRM_TITLE/MESSAGE + STORE.CONFIRM_TEXT 'esta tienda' interpolated in)
  'STORES.APPROVE_CONFIRM_TITLE': 'Confirmación para aprobar',
  'STORES.APPROVE_CONFIRM_MESSAGE': '¿Está seguro que desea aprobar esta tienda?',
  'STORES.DISAPPROVE_CONFIRM_TITLE': 'Confirmación para desaprobar',
  'STORES.DISAPPROVE_CONFIRM_MESSAGE': '¿Está seguro que desea desaprobar esta tienda?',
  // Plan toggle (spec store-plan-toggle R3: gear item + direction-aware confirm dialog)
  'STORES.CHANGE_PLAN': 'Cambiar plan',
  'STORES.ACTIVATE_PAID_TITLE': 'Activar plan pago',
  'STORES.ACTIVATE_PAID_MESSAGE': '¿Está seguro que desea activar el plan de pago para esta tienda? Se habilitarán todos los módulos de pago.',
  'STORES.DEACTIVATE_PAID_TITLE': 'Desactivar plan pago',
  'STORES.DEACTIVATE_PAID_MESSAGE': '¿Está seguro que desea desactivar el plan de pago? Se deshabilitarán los módulos de pago asociados.',

  // Billing — payment status banner (neutral Latin American Spanish, no voseo)
  'BILLING.TRIAL_NOTICE': 'Probando el plan de pago. El primer cobro del plan pago será el {date}.',
  'BILLING.DUE_NOTICE': 'El pago del plan vence el {date}. Realice el pago para evitar interrupciones en el servicio.',
  'BILLING.OVERDUE_NOTICE': 'El pago del plan está vencido. Algunas funciones pueden estar restringidas hasta regularizar la situación.',

  // Billing — status labels (StoreToCollect.status, DG-8 narrow union)
  'BILLING.STATUS.PorVencer': 'Por vencer',
  'BILLING.STATUS.EnGracia': 'En gracia',

  // Billing — collections view
  'BILLING.COLLECTIONS.TITLE': 'Cobros pendientes',
  'BILLING.COLLECTIONS.STORE': 'Tienda',
  'BILLING.COLLECTIONS.OWNER': 'Propietario',
  'BILLING.COLLECTIONS.AMOUNT': 'Monto',
  'BILLING.COLLECTIONS.DUE_DATE': 'Fecha de vencimiento',
  'BILLING.COLLECTIONS.STATUS': 'Estado',
  'BILLING.COLLECTIONS.REGISTER_PAYMENT': 'Registrar pago',
  'BILLING.COLLECTIONS.EMPTY_STATE': 'No hay cobros pendientes.',
  'BILLING.COLLECTIONS.ERROR': 'Ocurrió un error. Intente de nuevo.',

  // Billing — reseller commissions view
  'BILLING.COMMISSIONS.TITLE': 'Comisiones',
  'BILLING.COMMISSIONS.PERIOD': 'Período',
  'BILLING.COMMISSIONS.PAYMENT_COUNT': 'Cantidad de pagos',
  'BILLING.COMMISSIONS.TOTAL': 'Total',
  'BILLING.COMMISSIONS.EMPTY_STATE': 'No hay comisiones registradas.',
  'BILLING.COMMISSIONS.ERROR': 'Ocurrió un error. Intente de nuevo.',

  // Management — Users
  'USERS.LIST_TITLE': 'Empleados',
  'USERS.CREATE_TITLE': 'Adicionar Empleado',
  'USERS.EDIT_TITLE': 'Editar Empleado',
  'USERS.FULL_NAME': 'Nombre Completo',
  'USERS.LOGIN': 'Usuario',
  'USERS.PASSWORD': 'Contraseña',
  'USERS.CONFIRM_PASSWORD': 'Confirmar Contraseña',
  'USERS.CELL_PHONE': 'Teléfono',
  'USERS.EMAIL': 'Correo',
  'USERS.IS_ACTIVE': 'Activo',
  'USERS.STORE': 'Tienda',
  'USERS.SAVE': 'Adicionar',
  'USERS.UPDATE': 'Actualizar',
  'USERS.CREATE_SUCCESS': 'Usuario creado correctamente.',
  'USERS.UPDATE_SUCCESS': 'Usuario actualizado correctamente.',
  'USERS.OFFLINE_NOTICE': 'Sin conexión. Conéctate para guardar cambios.',
  'USERS.EMPTY': 'No hay empleados registrados.',
  'USERS.ACTIVATE': 'Activar',
  'USERS.DEACTIVATE': 'Desactivar',
  'USERS.PASSWORD_POLICY': 'La contraseña debe tener entre 8 y 30 caracteres, e incluir al menos una mayúscula, una minúscula y un número.',
  'USERS.PASSWORDS_MUST_MATCH': 'Las contraseñas no coinciden.',
  'USERS.ERROR': 'Ocurrió un error. Intente de nuevo.',
  'USERS.EDIT': 'Editar',
  'USERS.CREATE': 'Adicionar',
  'USERS.LIFECYCLE_ERROR': 'No se pudo realizar la acción. Intente de nuevo.',
  // Admin export of the encrypted offline roster bundle (offline-auth-frontend,
  // design correction #5). BLOCKED-for-verification: the backend endpoint
  // (GET /v1/storeusers/{storeId}/offline-roster) does not exist yet (§7a).
  'USERS.EXPORT_ROSTER': 'Exportar roster sin conexión',

  // Admin — Dashboard
  'ADMIN_DASHBOARD.HEADER': 'Panel de Control',
  'ADMIN_DASHBOARD.TITLE': 'Estadísticas de Tiendas Activos',
  'ADMIN_DASHBOARD.LAST_7_DAYS': 'Últimos 7 días',
  'ADMIN_DASHBOARD.LAST_30_DAYS': 'Últimos 30 días',
  'ADMIN_DASHBOARD.COL_CATEGORY': 'Categoría',
  'ADMIN_DASHBOARD.COL_VALUE': 'Valor',
  'ADMIN_DASHBOARD.ERROR': 'Ocurrió un error. Intentá de nuevo.',

  // Admin — Resellers
  // admin-owners-resellers-parity (Stage 5 Admin), Phase 4 — LIST_TITLE/CREATE_TITLE
  // match Angular MENU.RESELLERS / RESELLER.ADD_RESELLER; RESELLERS.ADD is a BINDING USER
  // OVERRIDE (supersedes design ADR-5): the Angular reseller LIST FAB literally renders
  // GENERAL.ADD ("Adicionar"), NOT "Adicionar Gestor" — that string is create-page-only.
  'RESELLERS.LIST_TITLE': 'Gestores',
  'RESELLERS.ADD': 'Adicionar',
  'RESELLERS.CREATE_TITLE': 'Adicionar Gestor',
  'RESELLERS.EDIT_TITLE': 'Editar revendedor',
  'RESELLERS.PERCENT_DISCOUNT': 'Porciento de descuento',
  'RESELLERS.DISCOUNT_PRICE': 'Descuento',
  'RESELLERS.PASSWORD_POLICY': 'La contraseña debe tener entre 8 y 30 caracteres, e incluir al menos una mayúscula, una minúscula y un número.',
  'RESELLERS.PASSWORDS_MUST_MATCH': 'Las contraseñas no coinciden.',
  'RESELLERS.PHONE_REQUIRED': 'El teléfono es obligatorio.',
  'RESELLERS.ERROR': 'Ocurrió un error. Intentá de nuevo.',
  // Angular's own literal key (edit-reseller.component.html:7 toolbar fab) —
  // note the SINGULAR "RESELLER" namespace, distinct from "RESELLERS" above;
  // Angular's vocab literally has both (es.ts:478-480).
  'RESELLER.ADD_RESELLER': 'Adicionar Gestor',

  // Admin — Features
  'FEATURES.TITLE': 'Funcionalidades',
  'FEATURES.ACTIVATE_FEATURES': 'Activar funcionalidades',
  'FEATURES.FEATURES_ACTIVATED': 'Las funcionalidades se activaron satisfactoriamente',
  'FEATURES.UNEXPECTED_ERROR': 'Ocurrió un error inesperado activando las funcionalidades',

  // Admin — Owners
  'OWNER.LIST_TITLE': 'Propietarios',
  // Angular OWNER.ADD_OWNER (es.ts:474) — literal parity.
  'OWNER.CREATE_TITLE': 'Adicionar Propietario',
  // Angular's own literal key (edit-owner.component.html:7 toolbar fab) — same
  // text as OWNER.CREATE_TITLE above, kept as its own key for 1:1 id parity.
  'OWNER.ADD_OWNER': 'Adicionar Propietario',
  'OWNER.EDIT_TITLE': 'Editar propietario',
  'OWNER.EDIT_OWNER': 'Editar Propietario',
  'OWNER.STORE_PRICE_LABEL': '{count, plural, one {# tienda} other {# tiendas}}',
  'OWNER.DAYS_LEFT': '{count, plural, one {# día} other {# días}}',
  'OWNER.FILTER_LABEL': 'Mostrar:',
  'OWNER.PAID_PLAN': 'Plan de Pago',
  'OWNER.FREE_PLAN': 'Plan Gratis',
  'OWNER.ERROR': 'Ocurrió un error. Inténtalo de nuevo.',
  'OWNER.DUPLICATE_LOGIN': 'Ese login ya está en uso. Elige otro.',
  'OWNER.FORBIDDEN': 'No tienes permiso para esta acción.',
  'OWNER.NOT_FOUND': 'El propietario no existe o fue eliminado.',
  'OWNER.PASSWORD_POLICY': 'La contraseña debe tener entre 8 y 30 caracteres, e incluir al menos una mayúscula, una minúscula y un número.',
  'OWNER.PASSWORDS_MUST_MATCH': 'Las contraseñas no coinciden.',
  'OWNER.PHONE_REQUIRED': 'El teléfono es obligatorio.',
  'OWNER.EDIT_TITLE_LABEL': 'Editar propietario',
  'OWNER.DELETE_CONFIRM_TITLE': 'Eliminar propietario permanentemente',
  'OWNER.DELETE_CONFIRM_MESSAGE': '¿Está seguro que desea eliminar permanentemente a {name}? Se eliminarán la tienda, todos los usuarios asociados y todos los datos. Esta acción no se puede deshacer.',
  'OWNER.DELETE_CONFIRM_BUTTON': 'Eliminar permanentemente',
  'OWNER.DELETE_SUCCESS': 'El propietario fue eliminado correctamente.',
  'OWNER.USERS_TAB_PLACEHOLDER': 'Gestión de usuarios próximamente.',

  // Admin — Owners — tab labels (uses GENERAL.DETAILS / GENERAL.STORES / GENERAL.USERS)
  'GENERAL.DETAILS': 'Detalles',
  'GENERAL.STORES': 'Tiendas',
  'GENERAL.USERS': 'Usuarios',
  // Angular GENERAL.RESELLER value is "Gestor", not "Revendedor" (admin-owners-resellers-parity
  // override 2). Sole consumers: owner-list.tsx, owner-create.tsx, owner-edit.tsx reSellerId label.
  'GENERAL.RESELLER': 'Gestor',

  // Generic field labels (DRY across owner/reseller forms — stop borrowing USERS.*/STORES.*
  // namespace keys owned by other modules; admin-owners-resellers-parity).
  'GENERAL.FULL_NAME': 'Nombre Completo',
  'GENERAL.CELL_PHONE': 'Teléfono',
  'GENERAL.EMAIL': 'Correo',
  'GENERAL.PASSWORD': 'Contraseña',
  'GENERAL.DESCRIPTION': 'Descripción',
  // GENERAL.LOGIN / GENERAL.CONFIRM_PASSWORD (Angular vocabs/es.ts:151,153) — register.tsx
  // + login.tsx field labels (view-text-parity).
  'GENERAL.LOGIN': 'Usuario',
  'GENERAL.CONFIRM_PASSWORD': 'Confirmar Contraseña',

  // Store (Angular STORE.* — vocabs/es.ts:347)
  // STORE.STORE_NAME — register.tsx store-name field label (view-text-parity).
  'STORE.STORE_NAME': 'Nombre de la tienda',

  // Sync — Export / Import
  'SYNC.EXPORT_TITLE': 'Exportar datos',
  'SYNC.IMPORT_TITLE': 'Importar datos',
  'SYNC.PASSWORD_LABEL': 'Contraseña de cifrado',
  'SYNC.EXPORT_BUTTON': 'Exportar',
  'SYNC.IMPORT_BUTTON': 'Importar',
  'SYNC.FILE_LABEL': 'Archivo de respaldo (.zip)',
  'SYNC.IMPORT_SUCCESS': 'Los datos se importaron correctamente.',
  'SYNC.IMPORT_ERROR': 'Ha ocurrido un error al importar los datos. Si el error persiste contacte al servicio técnico.',
  'SYNC.ERROR_EMPTY_PASSWORD': 'La contraseña no puede estar vacía.',
  'SYNC.ERROR_NO_FILE': 'Selecciona un archivo de respaldo.',
  // sync-export-import-v2 (V2-10): shown when the backup was exported from a
  // DIFFERENT store — a store mismatch is not a password problem, so the user
  // must retry with the right file/password, not just retype theirs.
  'SYNC.ERROR_WRONG_STORE': 'Este respaldo pertenece a otra tienda. Usá la contraseña y el archivo de exportación de la tienda actual.',
  'SYNC.SHOW_PASSWORD': 'Mostrar contraseña',
  'SYNC.HIDE_PASSWORD': 'Ocultar contraseña',

  // At-rest encryption — the two decryption failures the app-wide policy
  // announces (decryption-failure-policy.ts). They are worded differently on
  // purpose: the first is recoverable and names both recovery routes, the
  // second is not, and says so rather than sending the user chasing a fix that
  // does not exist. Both end the session, so both must also reassure that the
  // data was left untouched.
  'ENCRYPTION.KEY_UNAVAILABLE':
    'No se pudo abrir la información de esta tienda. Inicie sesión con conexión o importe un roster para recuperarla.',
  'ENCRYPTION.DATA_DAMAGED':
    'La información guardada en este dispositivo está dañada y no se pudo leer. No se borró nada.',
};

export default messages;
