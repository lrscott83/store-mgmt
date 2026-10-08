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
  // GENERAL.CURRENCY (MultiMonedas) — etiqueta del selector de moneda en formularios
  // con precio/costo. Visible solo con el módulo MultiMonedas (15).
  'GENERAL.CURRENCY': 'Moneda',
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
  // client-error-log: Diagnostics view (/diagnostics, SuperAdmin/OwnerAdmin only)
  'DIAGNOSTICS.TITLE': 'Diagnóstico',
  'DIAGNOSTICS.DEVICE_INFO': 'Información del dispositivo',
  'DIAGNOSTICS.APP_VERSION': 'Versión de la app',
  'DIAGNOSTICS.ONLINE': 'Conexión',
  'DIAGNOSTICS.USER_AGENT': 'Navegador',
  'DIAGNOSTICS.SHARE': 'Compartir',
  'DIAGNOSTICS.DOWNLOAD': 'Descargar',
  'DIAGNOSTICS.COPY': 'Copiar',
  'DIAGNOSTICS.COPIED': 'Registro copiado al portapapeles',
  'DIAGNOSTICS.CLEAR': 'Limpiar',
  'DIAGNOSTICS.CLEAR_CONFIRM_TITLE': 'Limpiar registro',
  'DIAGNOSTICS.CLEAR_CONFIRM_MESSAGE': '¿Eliminar todas las entradas del registro de diagnóstico de este dispositivo?',
  'DIAGNOSTICS.FILTER_LEVEL': 'Filtrar por nivel',
  'DIAGNOSTICS.LEVEL_ALL': 'Todos',
  'DIAGNOSTICS.SEARCH': 'Buscar',
  'DIAGNOSTICS.EMPTY': 'No hay eventos registrados en este dispositivo.',
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
  // Client-side login failures (online path, login.tsx classification). These
  // are NOT backend-returned errors: no E2E pins them, and AUTH.SERVER_ERROR
  // itself stays byte-for-byte (pinned by e2e/login-offline.spec.ts T6 on the
  // OFFLINE branch). Each shows a distinct, diagnostic copy with a detail excerpt.
  'AUTH.LOGIN_OK_NAVIG_ERROR':
    'Tus credenciales son correctas, pero no se pudo abrir tu pantalla de inicio. Falló al {fase}. Detalle: {detalle}. Recarga la página e inténtalo de nuevo.',
  'AUTH.LOGIN_NETWORK_ERROR':
    'No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo. Detalle: {detalle}.',
  'AUTH.LOGIN_UNEXPECTED_ERROR':
    'Ocurrió un error inesperado en el dispositivo durante el inicio de sesión. Detalle: {detalle}. Si el problema continúa, recarga la aplicación.',
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
  'PROVISION.ERROR_EXPIRED':
    'Este archivo de activación ya venció. Pedile uno nuevo al administrador.',
  'PROVISION.ERROR_REPLAY':
    'Este archivo ya se usó en este equipo. Pedile uno nuevo al administrador.',
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
  'OFFLINE_ACCESS.HELP_STEP1':
    '1. Desde un equipo ya activado, el administrador exporta el roster con una contraseña usando el botón "Exportar roster sin conexión" de la página de Empleados.',
  'OFFLINE_ACCESS.HELP_STEP2': '2. Transfiere ese archivo de roster a este equipo.',
  'OFFLINE_ACCESS.HELP_STEP3':
    '3. En este equipo toca "Activar acceso sin conexión", elige el archivo y escribe la contraseña.',

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
  // NEW (2026-09-28) — auto-login after registration: the account WAS created
  // (the 201 already happened) and only the session could not be opened, so the
  // copy must never imply the registration failed. Names /login as the way in.
  'REGISTRATION.AUTO_LOGIN_FAILED':
    'Tu cuenta se creó correctamente, pero no pudimos iniciar sesión automáticamente. Entra con tu usuario y contraseña.',
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
  // Módulo Elaboración (17): grupo propio con recetas y elaboraciones.
  'MENU.ELABORATION': 'ELABORACIÓN',

  // Menu items — Admin (Angular MENU.ADMIN.*)
  'MENU.ADMIN_DASHBOARD': 'Dashboard',
  'MENU.ADMIN_STORES': 'Tiendas',
  'MENU.OWNERS': 'Propietarios',
  'MENU.RESELLERS': 'Gestores',
  'MENU.FEATURES': 'Funcionalidades',
  'MENU.ADMIN_MESSAGES': 'Mensajes',
  'MENU.MODULES': 'Módulos',

  // Menu items — Sales (Angular MENU.SALE_MGMT.*)
  'MENU.PRODUCTS': 'Catálogo Productos',
  'MENU.WEB_CATALOG': 'Catálogo Web',
  'MENU.ONLINE_ORDERS_SETTINGS': 'Pedidos WhatsApp',
  'MENU.ONLINE_ORDERS_DRIVERS': 'Repartidores',
  'MENU.SALE': 'Vender',
  'MENU.WHOLESALE': 'Vender Mayorista',
  'MENU.TODAY_ORDERS': 'Ventas del día',
  'MENU.TODAY_CREDITS': 'Créditos del día',
  'MENU.TODAY_STATS': 'Cuadre del día',
  'MENU.CREDITS_HISTORY': 'Créditos',
  'MENU.ORDERS_HISTORY': 'Ventas',

  // Menu items — Inventory (Angular MENU.INVENTORY_MGMT.*)
  'MENU.AVAILABLE': 'Disponible',
  'MENU.WAREHOUSES': 'Gestión de Almacenes',

  // Catálogo Web (módulo 18, plan 2026-09-27): vista de publicación de productos.
  'WEB_CATALOG.TITLE': 'Catálogo Web',
  'WEB_CATALOG.SUBTITLE':
    'Completa la descripción, los descuentos y las imágenes de tus productos y publica el catálogo de tu tienda.',
  'WEB_CATALOG.PUBLIC_URL': 'Dirección pública',
  'WEB_CATALOG.NOT_PUBLISHED': 'El catálogo aún no está publicado. Pulsa Sincronizar Catálogo.',
  'WEB_CATALOG.COPY_URL': 'Copiar',
  'WEB_CATALOG.COPIED': 'Dirección copiada',
  'WEB_CATALOG.OPEN': 'Ver catálogo',
  'WEB_CATALOG.LAST_SYNC': 'Última sincronización',
  'WEB_CATALOG.NEVER_SYNCED': 'Nunca',
  'WEB_CATALOG.SYNC': 'Sincronizar Catálogo',
  'WEB_CATALOG.SYNCING': 'Sincronizando...',
  'WEB_CATALOG.SYNC_DONE':
    'Catálogo sincronizado: {categoriesCreated} categorías nuevas, {categoriesUpdated} actualizadas, {productsCreated} productos nuevos, {productsUpdated} actualizados y {productsDeactivated} despublicados.',
  'WEB_CATALOG.SYNC_FAILED': 'No se pudo sincronizar el catálogo',
  'WEB_CATALOG.STATS_CATEGORIES': 'Categorías',
  'WEB_CATALOG.STATS_PRODUCTS': 'Productos en venta',
  'WEB_CATALOG.STATS_PUBLISHED': 'Publicados',
  'WEB_CATALOG.STATS_WITHOUT_IMAGE': 'Sin imagen',
  'WEB_CATALOG.NO_PRODUCTS':
    'Esta tienda aún no tiene catálogo aquí. Pulsa Sincronizar Catálogo para subir los productos y categorías que ya tienes en el dispositivo; si la tienda está vacía, créalos antes en Catálogo Productos.',
  'WEB_CATALOG.DESCRIPTION': 'Descripción',
  'WEB_CATALOG.DESCRIPTION_PLACEHOLDER': 'Escribe una descripción para el catálogo (texto simple)',
  'WEB_CATALOG.DESCRIPTION_COUNTER': '{count}/{max} caracteres',
  'WEB_CATALOG.PERCENT_DISCOUNT': '% de descuento',
  'WEB_CATALOG.DISCOUNT_PRICE': 'Precio rebajado',
  'WEB_CATALOG.IS_NEW': 'Nuevo',
  'WEB_CATALOG.FINAL_PRICE': 'Precio final',
  'WEB_CATALOG.MAIN_IMAGE': 'Imagen principal',
  // Vista WebCatalog: el bloque se llama solo "Imagen" por decisión del owner (2026-09-29);
  // el texto "Imagen principal" (MAIN_IMAGE) vuelve más adelante.
  'WEB_CATALOG.IMAGE': 'Imagen',
  'WEB_CATALOG.WILL_BE_MAIN': 'quedará como imagen principal al guardar',
  'WEB_CATALOG.GALLERY': 'Otras imágenes',
  'WEB_CATALOG.GALLERY_LIMIT': 'Hasta {max} imágenes de {size} MB (jpg, png o webp).',
  // Con la galería oculta solo hay una imagen: el aviso del archivo inválido no puede hablar de
  // un número de imágenes (decisión del owner, 2026-09-29). GALLERY_LIMIT vuelve con la galería.
  'WEB_CATALOG.IMAGE_RULES': 'Solo imágenes jpg, png o webp de hasta {size} MB.',
  'WEB_CATALOG.UPLOAD_IMAGE': 'Subir imagen',
  'WEB_CATALOG.REMOVE_IMAGE': 'Quitar imagen',
  'WEB_CATALOG.SET_MAIN_IMAGE': 'Usar como principal',
  'WEB_CATALOG.UPLOAD_ERROR': 'No se pudo subir la imagen',
  'WEB_CATALOG.SAVE': 'Guardar',
  'WEB_CATALOG.SAVED': 'Producto guardado en el catálogo',
  'WEB_CATALOG.SAVE_ERROR': 'No se pudo guardar el producto',
  // Guardado por lotes (decisión del owner, 2026-10-01): un ÚNICO botón al final de la página
  // aplica todos los cambios pendientes y envía solo los campos que de verdad cambiaron.
  'WEB_CATALOG.SAVE_CHANGES': 'Guardar cambios',
  'WEB_CATALOG.SAVING': 'Guardando...',
  'WEB_CATALOG.PENDING_COUNT': '{count} productos con cambios sin guardar',
  'WEB_CATALOG.PENDING_COUNT_ONE': '1 producto con cambios sin guardar',
  'WEB_CATALOG.NO_PENDING': 'No hay cambios sin guardar',
  'WEB_CATALOG.SAVED_CHANGES': 'Se guardaron {count} productos en el catálogo',
  'WEB_CATALOG.SAVED_CHANGES_ONE': 'Se guardó 1 producto en el catálogo',
  'WEB_CATALOG.SAVE_PARTIAL':
    'Se guardaron {saved} de {total}. No se pudieron guardar: {failed}',
  'WEB_CATALOG.UNSAVED_BADGE': 'Sin guardar',
  'WEB_CATALOG.PENDING_IMAGE_REMOVE': 'La imagen principal se quitará al guardar',
  'WEB_CATALOG.OFFLINE':
    'El catálogo web se publica en el servidor: necesitas conexión para sincronizar y guardar.',
  'WEB_CATALOG.UNPUBLISHED': 'Sin publicar',
  'WEB_CATALOG.REMOVE_IMAGE_CONFIRM':
    '¿Quitar esta imagen del catálogo? Se borrará el archivo y no se puede deshacer.',
  'WEB_CATALOG.PERCENT_RANGE': 'El % de descuento debe estar entre 0 y 100.',
  'WEB_CATALOG.DISCOUNT_RANGE': 'El precio rebajado no puede ser negativo.',
  'WEB_CATALOG.DESCRIPTION_TOO_LONG': 'La descripción no puede pasar de {max} caracteres.',
  'WEB_CATALOG.MOVE_LEFT': 'Mover antes',
  'WEB_CATALOG.MOVE_RIGHT': 'Mover después',

  // Marca del catálogo público (F8): SOLO logo y banner. Sin paletas — se cancelaron por
  // decisión del owner (2026-10-07) y el catálogo sigue con la paleta que ya tenía.
  'WEB_CATALOG.BRAND_TITLE': 'Marca',
  'WEB_CATALOG.BRAND_SUBTITLE':
    'El logo y el banner que tus clientes ven en la cabecera de tu catálogo público.',
  'WEB_CATALOG.BRAND_LOGO': 'Logo',
  'WEB_CATALOG.BRAND_BANNER': 'Banner',
  'WEB_CATALOG.BRAND_REMOVE_LOGO': 'Quitar logo',
  'WEB_CATALOG.BRAND_REMOVE_BANNER': 'Quitar banner',
  'WEB_CATALOG.BRAND_PENDING_REMOVE_LOGO': 'El logo se quitará al guardar la marca',
  'WEB_CATALOG.BRAND_PENDING_REMOVE_BANNER': 'El banner se quitará al guardar la marca',
  'WEB_CATALOG.BRAND_PENDING_UPLOAD': 'se subirá al guardar la marca',
  'WEB_CATALOG.BRAND_SAVE': 'Guardar marca',
  'WEB_CATALOG.BRAND_SAVING': 'Guardando...',
  'WEB_CATALOG.BRAND_SAVED': 'Marca guardada',
  'WEB_CATALOG.BRAND_SAVE_ERROR': 'No se pudo guardar la marca',
  'WEB_CATALOG.BRAND_LOAD_ERROR': 'No se pudo cargar la marca',

  // Showcase del catálogo (carrusel + imágenes del día): DOS CONJUNTOS INDEPENDIENTES (decisión
  // C1 del owner, 2026-10-07). Cada uno se configura, se ordena y se limpia por su cuenta, y
  // ninguno toca el guardado por lotes de productos.
  'WEB_CATALOG.SHOWCASE_CAROUSEL_TITLE': 'Carrusel',
  'WEB_CATALOG.SHOWCASE_CAROUSEL_SUBTITLE':
    'Las imágenes que se van pasando en la cabecera de tu catálogo público.',
  'WEB_CATALOG.SHOWCASE_DAILY_TITLE': 'Imágenes del día',
  'WEB_CATALOG.SHOWCASE_DAILY_SUBTITLE':
    'El bloque de destacadas que aparece en tu catálogo con las imágenes que subas aquí.',
  'WEB_CATALOG.SHOWCASE_LIMIT': 'Hasta {max} imágenes por conjunto.',
  'WEB_CATALOG.SHOWCASE_EMPTY': 'Sin imágenes en este conjunto',
  'WEB_CATALOG.SHOWCASE_SELECT_FILES': 'Elegir imágenes',
  'WEB_CATALOG.SHOWCASE_PENDING_COUNT': '{count} imágenes por subir',
  'WEB_CATALOG.SHOWCASE_CAPTION': 'Pie de foto (opcional)',
  'WEB_CATALOG.SHOWCASE_CAPTION_HINT':
    'Se aplica a las imágenes que subas ahora. Para cambiarlo, quita la imagen y vuélvela a subir.',
  'WEB_CATALOG.SHOWCASE_UPLOAD': 'Subir imágenes',
  'WEB_CATALOG.SHOWCASE_UPLOADED': 'Se subieron {count} imágenes al catálogo',
  'WEB_CATALOG.SHOWCASE_UPLOADED_ONE': 'Se subió 1 imagen al catálogo',
  'WEB_CATALOG.SHOWCASE_UPLOAD_PARTIAL':
    'Se subieron {uploaded} de {total}. No se pudieron subir las demás: inténtalo de nuevo.',
  'WEB_CATALOG.SHOWCASE_REMOVED': 'Imagen quitada del catálogo',
  'WEB_CATALOG.SHOWCASE_MOVE_UP': 'Subir en la lista',
  'WEB_CATALOG.SHOWCASE_MOVE_DOWN': 'Bajar en la lista',
  'WEB_CATALOG.SHOWCASE_REMOVE': 'Quitar imagen',
  'WEB_CATALOG.SHOWCASE_LOAD_ERROR': 'No se pudieron cargar las imágenes del catálogo',
  'WEB_CATALOG.SHOWCASE_SAVE_ERROR': 'No se pudo guardar el cambio en las imágenes del catálogo',

  // Pedidos WhatsApp (módulo 18, F1): configuración del pedido online. Sin moneda — el precio
  // y la moneda los pone el catálogo (A3 eliminada).
  'ORDERING_SETTINGS.TITLE': 'Pedidos WhatsApp',
  'ORDERING_SETTINGS.SUBTITLE':
    'Activa los pedidos online y configura a dónde y cómo los recibe tu tienda. Los pedidos se envían por WhatsApp.',
  'ORDERING_SETTINGS.ENABLED': 'Pedidos online',
  'ORDERING_SETTINGS.ENABLED_HINT':
    'Con el interruptor apagado el catálogo se publica igual, pero tus clientes no pueden hacer pedidos.',
  'ORDERING_SETTINGS.WHATSAPP_NUMBER': 'Número de WhatsApp',
  'ORDERING_SETTINGS.WHATSAPP_NUMBER_PLACEHOLDER': 'Con prefijo internacional, por ejemplo 5351234567',
  'ORDERING_SETTINGS.PICKUP_ENABLED': 'Recogida en la tienda',
  'ORDERING_SETTINGS.DELIVERY_ENABLED': 'Envío a domicilio',
  'ORDERING_SETTINGS.DELIVERY_FEE': 'Costo del envío',
  'ORDERING_SETTINGS.MINIMUM_ORDER_AMOUNT': 'Importe mínimo del pedido',
  'ORDERING_SETTINGS.BUSINESS_HOURS': 'Horario de atención',
  'ORDERING_SETTINGS.BUSINESS_HOURS_PLACEHOLDER': 'Texto libre, por ejemplo Lunes a sábado de 8:00 a 18:00',
  'ORDERING_SETTINGS.DELIVERY_ZONES': 'Zonas de reparto',
  'ORDERING_SETTINGS.DELIVERY_ZONES_PLACEHOLDER': 'Texto libre, por ejemplo Vedado y Centro Habana',
  'ORDERING_SETTINGS.CURRENCY_NOTE':
    'El precio y la moneda salen del catálogo, no se configuran aquí.',
  'ORDERING_SETTINGS.SYNC': 'Sincronizar',
  'ORDERING_SETTINGS.SYNCING': 'Sincronizando...',
  'ORDERING_SETTINGS.SYNC_DONE': 'Configuración de pedidos guardada',
  'ORDERING_SETTINGS.SYNC_FAILED': 'No se pudo guardar la configuración de pedidos',
  'ORDERING_SETTINGS.LOAD_FAILED': 'No se pudo cargar la configuración de pedidos',
  'ORDERING_SETTINGS.LAST_SYNC': 'Última sincronización',
  'ORDERING_SETTINGS.NEVER_SYNCED': 'Nunca',

  // Repartidores (F7): catálogo de personas. NO cuenta pedidos ni asigna ninguno — de eso se
  // ocupa la operación del pedido (F5), que es otra vista (D8).
  'ORDERING_DRIVERS.TITLE': 'Repartidores',
  'ORDERING_DRIVERS.SUBTITLE':
    'Personas que reparten los pedidos de esta tienda. Aquí se da de alta y se activa o desactiva cada repartidor; asignarlo a un pedido se hace al atender ese pedido.',
  'ORDERING_DRIVERS.NEW': 'Nuevo repartidor',
  'ORDERING_DRIVERS.SAVE': 'Guardar',
  'ORDERING_DRIVERS.SAVING': 'Guardando...',
  'ORDERING_DRIVERS.CANCEL': 'Cancelar',
  'ORDERING_DRIVERS.NAME': 'Nombre',
  'ORDERING_DRIVERS.NAME_PLACEHOLDER': 'Nombre del repartidor',
  'ORDERING_DRIVERS.PHONE': 'Teléfono',
  'ORDERING_DRIVERS.PHONE_PLACEHOLDER': 'Con prefijo internacional, por ejemplo 5351234567',
  'ORDERING_DRIVERS.ACTIVE': 'Activo',
  'ORDERING_DRIVERS.EDIT': 'Editar',
  'ORDERING_DRIVERS.EDIT_TITLE': 'Editar repartidor',
  'ORDERING_DRIVERS.CREATE_DONE': 'Repartidor creado',
  'ORDERING_DRIVERS.UPDATE_DONE': 'Repartidor actualizado',
  'ORDERING_DRIVERS.SAVE_FAILED': 'No se pudo guardar el repartidor',
  'ORDERING_DRIVERS.LOAD_FAILED': 'No se pudieron cargar los repartidores',
  'ORDERING_DRIVERS.EMPTY': 'Esta tienda todavía no tiene repartidores dados de alta.',
  'ORDERING_DRIVERS.INACTIVE_BADGE': 'Inactivo',
  'ORDERING_DRIVERS.INACTIVE_HINT':
    'Un repartidor inactivo no aparece en el selector de reparto, pero los pedidos que ya entregó conservan su referencia.',
  'ORDERING_DRIVERS.TABLE_NAME': 'Nombre',
  'ORDERING_DRIVERS.TABLE_PHONE': 'Teléfono',
  'ORDERING_DRIVERS.TABLE_STATUS': 'Estado',
  'ORDERING_DRIVERS.TABLE_ACTIONS': 'Acciones',

  // Catálogo público (/catalog/<slug>): lo que ve el cliente final, sin sesión.
  'CATALOG_PUBLIC.SEARCH_PLACEHOLDER': 'Buscar productos…',
  'CATALOG_PUBLIC.SEARCH': 'Buscar',
  'CATALOG_PUBLIC.CATEGORY': 'Categoría',
  'CATALOG_PUBLIC.ALL_CATEGORIES': 'Todas las categorías',
  'CATALOG_PUBLIC.RESULTS': '{count} productos',
  'CATALOG_PUBLIC.RESULTS_ONE': '1 producto',
  'CATALOG_PUBLIC.EMPTY': 'No hay productos que coincidan con tu búsqueda.',
  'CATALOG_PUBLIC.EMPTY_CATALOG': 'Esta tienda todavía no ha publicado productos.',
  'CATALOG_PUBLIC.NOT_FOUND_TITLE': 'Catálogo no disponible',
  'CATALOG_PUBLIC.NOT_FOUND':
    'No encontramos esta tienda o su catálogo todavía no está publicado.',
  'CATALOG_PUBLIC.NEW': 'Nuevo',
  'CATALOG_PUBLIC.PREVIOUS': 'Anterior',
  'CATALOG_PUBLIC.NEXT': 'Siguiente',
  'CATALOG_PUBLIC.PAGE': 'Página {page} de {pages}',
  'CATALOG_PUBLIC.GALLERY': 'Galería',
  'CATALOG_PUBLIC.NO_IMAGE': 'Este producto no tiene imágenes.',
  'CATALOG_PUBLIC.ZOOM_IN': 'Ampliar imagen',
  'CATALOG_PUBLIC.ZOOM_OUT': 'Reducir imagen',
  'CATALOG_PUBLIC.FOOTER': 'Catálogo publicado con VendeDTo',
  // Marca (F8): logo y banner de la cabecera. El texto alternativo nombra a la tienda, que es
  // de whom es la imagen; la ausencia de logo o banner NO es un error (una tienda puede no
  // tenerlos), así que no hay ningún aviso para ese caso.
  'CATALOG_PUBLIC.LOGO_ALT': 'Logo de {store}',
  'CATALOG_PUBLIC.BANNER_ALT': 'Banner de {store}',
  // ── Carrito y pedido del cliente anónimo (F3) ─────────────────────────────────────────────
  // El carrito del STOREFRONT (`lizoft-catalog-cart`), no el del POS (`lizoft-cart`): el cliente
  // anónimo no tiene sesión ni tienda, así que sus claves no mezclan con las del vendedor.
  'CATALOG_PUBLIC.ADD_TO_CART': 'Añadir',
  'CATALOG_PUBLIC.CART_BUTTON': 'Ver mi pedido',
  'CATALOG_PUBLIC.CART_TITLE': 'Tu pedido',
  'CATALOG_PUBLIC.CART_EMPTY': 'Tu pedido está vacío.',
  'CATALOG_PUBLIC.CART_EMPTY_HINT': 'Añade productos del catálogo para continuar.',
  'CATALOG_PUBLIC.CART_ITEMS': '{count, plural, one {# producto} other {# productos}}',
  'CATALOG_PUBLIC.CART_SUBTOTAL': 'Subtotal',
  'CATALOG_PUBLIC.CART_CLEAR': 'Vaciar',
  'CATALOG_PUBLIC.CART_CHECKOUT': 'Continuar con el pedido',
  'CATALOG_PUBLIC.CART_REMOVE': 'Quitar {name}',
  'CATALOG_PUBLIC.CART_REMOVE_PLAIN': 'Quitar',
  'CATALOG_PUBLIC.CART_INCREASE': 'Aumentar cantidad de {name}',
  'CATALOG_PUBLIC.CART_DECREASE': 'Disminuir cantidad de {name}',
  'CATALOG_PUBLIC.CART_TOTAL_NOTE':
    'El total final lo calcula la tienda al confirmar el pedido.',
  'CATALOG_PUBLIC.CART_ADDED': '{name} se añadió a tu pedido.',
  'CATALOG_PUBLIC.ORDERS_DISABLED': 'Esta tienda no está aceptando pedidos por ahora.',
  'CHECKOUT.TITLE': 'Confirmar pedido',
  'CHECKOUT.NAME': 'Nombre',
  'CHECKOUT.NAME_PLACEHOLDER': '¿A nombre de quién es el pedido?',
  'CHECKOUT.PHONE': 'Teléfono',
  'CHECKOUT.PHONE_PLACEHOLDER': 'Con prefijo internacional, por ejemplo 5351234567',
  'CHECKOUT.DELIVERY_TYPE': 'Cómo lo quieres recibir',
  'CHECKOUT.PICKUP': 'Recoger en la tienda',
  'CHECKOUT.DELIVERY': 'Envío a domicilio',
  'CHECKOUT.ADDRESS': 'Dirección de entrega',
  'CHECKOUT.ADDRESS_PLACEHOLDER': 'Calle, número, entre calles y provincia',
  'CHECKOUT.NOTES': 'Notas (opcional)',
  'CHECKOUT.NOTES_PLACEHOLDER': 'Horario preferido, forma de pago, indicaciones…',
  'CHECKOUT.SUMMARY': 'Resumen',
  'CHECKOUT.ERROR_NAME': 'Escribe tu nombre.',
  'CHECKOUT.ERROR_PHONE': 'Escribe un teléfono válido (mínimo 7 dígitos).',
  'CHECKOUT.ERROR_ADDRESS': 'El envío a domicilio necesita una dirección.',
  'CHECKOUT.ERROR_EMPTY': 'Añade al menos un producto antes de pedir.',
  'CHECKOUT.SUBMIT': 'Enviar pedido',
  'CHECKOUT.SUBMITTING': 'Enviando pedido…',
  'CHECKOUT.FAILED': 'No se pudo crear el pedido. Inténtalo de nuevo.',
  'CHECKOUT.DELIVERY_FEE': 'Costo del envío',
  'CHECKOUT.MINIMUM_ORDER': 'Importe mínimo del pedido',
  // Envío del pedido por WhatsApp (F4). El texto del RESUMEN que viaja en el enlace va en
  // `catalog/lib/whatsapp-order-link.ts`: lo lee la tienda en su chat, no es interfaz de la app.
  // Aquí solo está el estado que ve el cliente en el navegador.
  'CHECKOUT.WHATSAPP_TITLE': 'Envío por WhatsApp',
  'CHECKOUT.WHATSAPP_PENDING':
    'Pedido {code} guardado. Abrimos WhatsApp con el resumen: queda pendiente de confirmar por WhatsApp.',
  'CHECKOUT.WHATSAPP_BLOCKED':
    'Pedido {code} guardado. Esta tienda no tiene un número de WhatsApp, así que el envío quedó bloqueado: guarda el código y escríbele por otro medio.',
  'CHECKOUT.WHATSAPP_LINK': 'Abrir el chat de WhatsApp',
  'ORDER.CREATED_TITLE': 'Pedido creado',
  'ORDER.CREATED_LEAD':
    'Guarda este código: con él y tu teléfono puedes consultar el estado de tu pedido cuando quieras.',
  'ORDER.CODE_LABEL': 'Código del pedido',
  'ORDER.TOTAL': 'Total',
  'ORDER.STATUS_TITLE': 'Consultar mi pedido',
  'ORDER.STATUS_CODE': 'Código',
  'ORDER.STATUS_CODE_PLACEHOLDER': 'Por ejemplo K7M2QX',
  'ORDER.STATUS_PHONE': 'Teléfono',
  'ORDER.STATUS_SEARCH': 'Consultar',
  'ORDER.STATUS_SEARCHING': 'Consultando…',
  'ORDER.STATUS_ERROR_CODE': 'Escribe el código del pedido.',
  'ORDER.STATUS_ERROR_PHONE': 'Escribe el teléfono con el que hiciste el pedido.',
  'ORDER.STATUS_NOT_FOUND':
    'No encontramos ese pedido con ese teléfono. Revisa el código e inténtalo de nuevo.',
  'ORDER.STATUS_FAILED': 'No se pudo consultar el pedido. Inténtalo de nuevo.',
  'ORDER.STATUS_LABEL': 'Estado',
  'ORDER.STATUS_NEW': 'Recibido',
  'ORDER.STATUS_ACCEPTED': 'Confirmado',
  'ORDER.STATUS_PREPARING': 'En preparación',
  'ORDER.STATUS_READY': 'Listo',
  'ORDER.STATUS_DELIVERED': 'Entregado',
  'ORDER.STATUS_CANCELLED': 'Cancelado',
  'ORDER.PAYMENT_LABEL': 'Pago',
  'ORDER.PAYMENT_PENDING': 'Pendiente de pago en la tienda',
  'ORDER.PAYMENT_PAID': 'Pagado',
  'ORDER.DELIVERY_PICKUP': 'Recogida en la tienda',
  'ORDER.DELIVERY_DELIVERY': 'Envío a domicilio',
  'ORDER.ITEMS_LABEL': 'Productos',
  'MENU.WAREHOUSES_MODULE': 'ALMACENES',
  'MENU.WAREHOUSE_MOVEMENTS': 'Movimientos',
  // Módulo Elaboración (17): recetas (BoM) y órdenes de elaboración.
  'MENU.RECIPES': 'Recetas',
  'MENU.ELABORATIONS': 'Elaboraciones',
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
  'MENU.CUADRE_POR_FECHAS': 'Cuadre por fechas',
  // Plan split: the single 'Tiendas' entry became one link — the plan view
  // (/management/stores), same authorization (EFeatures.Stores). The store-data
  // edit view is reached only from store cards, not from the menu.
  // Owner's "my stores" cards listing (owner-stores-cards plan, 2026-09-08)
  'MENU.MY_STORES': 'Mis tiendas',
  'MENU.CHANNEL_RATES': 'Tasas de Cambio',
  'MENU.USERS': 'Empleados',
  'MENU.BILLING_COLLECTIONS': 'Cobros pendientes',
  'MENU.BILLING_COMMISSIONS': 'Comisiones',
  'MENU.DIAGNOSTICS': 'Diagnóstico',
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
  'CART.TRANSFERENCIA_CUP': 'Transferencia (CUP)',
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
  // MultiPayments: etiqueta del selector de moneda del carrito (módulo 16).
  'SHOPPING_CART.CURRENCY_LABEL': 'Moneda',
  // T4 (payment-channels-and-multipayment): el cambio de moneda se bloquea cuando
  // alguna línea del carrito no puede convertirse a la moneda destino.
  'SHOPPING_CART.CURRENCY_CHANGE_BLOCKED':
    'No se puede cambiar la moneda a {currency}: el producto "{product}" está en {fromCurrency} y no tiene una tasa de cambio vigente.',
  // MultiPayments (módulo 16): lista de pagos del carrito (T7).
  'SHOPPING_CART.MULTI_PAYMENT_TITLE': 'Pagos',
  'SHOPPING_CART.MULTI_PAYMENT_ADD': 'Agregar pago',
  'SHOPPING_CART.MULTI_PAYMENT_REMOVE': 'Eliminar',
  'SHOPPING_CART.MULTI_PAYMENT_AMOUNT_LABEL': 'Monto',
  'SHOPPING_CART.MULTI_PAYMENT_PAID_LABEL': 'Total cubierto',
  'SHOPPING_CART.MULTI_PAYMENT_REMAINING_LABEL': 'Restante por cubrir',
  'SHOPPING_CART.MULTI_PAYMENT_CHANGE_LABEL': 'Vuelto',
  // T6 (payment-channels-and-multipayment): popup de "Agregar pago".
  'SHOPPING_CART.MULTI_PAYMENT_ADD_TITLE': 'Agregar pago',
  'SHOPPING_CART.MULTI_PAYMENT_ADD_CHANNEL_LABEL': 'Canal de pago',
  'SHOPPING_CART.MULTI_PAYMENT_ADD_CONFIRM': 'Agregar',
  'SHOPPING_CART.MULTI_PAYMENT_ADD_NO_CHANNELS': 'No hay canales de pago disponibles.',
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
  // El popup de alta muestra DOS selectores de moneda contiguos (costo antes que precio). Con
  // la etiqueta única "Moneda" los dos quedaban idénticos en pantalla; cada uno nombra su campo.
  'PRODUCTS.FORM.COST_CURRENCY': 'Moneda del costo',
  'PRODUCTS.FORM.PRICE_CURRENCY': 'Moneda del precio',
  'PRODUCTS.ENTRY_CREATED': 'Producto creado y entrada de inventario registrada.',
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
  'SALES.NO_SELECTED_CATEGORY_ALERT_MESSAGE':
    'Seleccione primero una categoría para adicionar productos a la venta.',
  'SALES.PRODUCT_ADDED_TO_CART': 'El producto fue adicionado a la venta',
  'SALES.PRODUCT_NOT_ADDED_TO_CART':
    'Ocurrío un error adicionando el producto a la venta. Por favor, vuelva a intentarlo y si persiste contacte al equipo de soporte técnico.',
  'SALES.NOT_INVENTORY_AVAILABLE_MESSAGE': 'El producto no está disponible en el inventario.',
  'SALES.AVAILABLE_STOCK': 'Disponibles en inventario: {available}.',
  'SALES.ALL_CATEGORIES': 'Todos',
  'SALES.SEARCH_PLACEHOLDER': 'Buscar producto por nombre...',
  'SALES.WHOLESALE.ENABLE': 'Venta Mayorista',
  'SALES.WHOLESALE.PACK_SIZE': 'Unidades por paquete/caja',
  'SALES.WHOLESALE.UNIT_LABEL': 'Unidad de medida (como se vende el paquete)',
  'SALES.WHOLESALE.UNIT_LABEL_PLACEHOLDER': 'caja, paquete, fardo… (vacío = paquete)',
  'SALES.WHOLESALE.TIERS_TITLE': 'Rangos de precio mayorista',
  'SALES.WHOLESALE.MIN_PACKS': 'Mínimo de paquetes',
  'SALES.WHOLESALE.PRICE_PER_UNIT': 'Precio por unidad',
  'SALES.WHOLESALE.ADD_TIER': 'Agregar rango',
  'SALES.WHOLESALE.REMOVE_TIER': 'Eliminar rango',
  'SALES.WHOLESALE.HEADER': 'Ventas Mayoristas',
  'SALES.WHOLESALE.PACKS': 'Paquetes',
  'SALES.WHOLESALE.UNITS_PER_PACK': 'Unidades por paquete',
  'SALES.WHOLESALE.FROM': 'desde',
  'SALES.WHOLESALE.UNIT': 'unidad',
  'SALES.WHOLESALE.ADD': 'Añadir',
  'SALES.WHOLESALE.EMPTY':
    'No hay productos configurados para la venta mayorista. Active la opción "Venta Mayorista" al crear o editar un producto.',
  'SALES.WHOLESALE.ADDED': '{name} adicionado a la venta mayorista',
  'SALES.WHOLESALE.MIN_PACKS_ERROR':
    'La cantidad mínima para la venta mayorista es de {min} {unit} ({min} × {packSize} unidades).',
  'SALES.WHOLESALE.AVAILABLE': 'Disponible',
  'SALES.WHOLESALE.TIERS_POPUP_TITLE': 'Rangos de precio mayorista',
  'SALES.WHOLESALE.TIERS_POPUP_PACK': 'Unidades por paquete',
  'SALES.WHOLESALE.TIERS_POPUP_FROM': 'Desde {min} {unit}: {price} por unidad',
  'SALES.WHOLESALE.QUANTITY_UNAVAILABLE':
    'Disponibles: {available}. Faltan {missing} para cubrir los {requested} solicitados.',
  'SALES.WHOLESALE.SCANNER_ADDED':
    '{name}: {packs} paquetes ({units} unidades) a {price} por unidad, adicionado a la venta mayorista',
  'SALES.WHOLESALE.SCANNER_NOT_WHOLESALE':
    'El producto {name} no tiene configuración mayorista y no se puede vender en esta vista',
  'SALES.WHOLESALE.UNIT_NAME_FALLBACK': 'paquete',

  // ProductErrors (Angular frontend/src/app/domain/entities/products/product.errors.ts —
  // hardcoded Spanish literals there, not i18n keys; added here as i18n keys for React's
  // text-parity convention. Byte-identical to the Angular literals). Used by
  // hasAvailableProductToSale's 5-way branch (checkProductAvailabilityToSale).
  'PRODUCT_ERRORS.NOT_EXISTS': 'El producto no existe.',
  'PRODUCT_ERRORS.INACTIVE': 'El producto no está activo.',
  'PRODUCT_ERRORS.NOT_AVAILABLE_TO_SALE': 'El producto no está disponible para la venta.',
  'PRODUCT_ERRORS.QUANTITY_NOT_AVAILABLE':
    'La cantidad del producto no está disponible en el inventario.',

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
  // Suffixes appended to a field's own label so requiredness is visible BEFORE the first
  // submit instead of only after a failed one. Parenthetical and lowercase: they read as an
  // aside, not as a second label the input has to match.
  'GENERAL.VALIDATION.REQUIRED_SUFFIX': '(requerido)',
  'GENERAL.VALIDATION.OPTIONAL_SUFFIX': '(opcional)',
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

  // Orders (Angular ORDERS.* — vocabs/es.ts. ORDERS.TITLE was the exact Angular string
  // 'Historial de Ventas'; renamed to 'Ventas' (user-approved) so the header reads
  // «Ventas (n)» with the total on the right — same pattern as Inventory's «Entradas (n)».
  // ORDERS.TODAY_TITLE/DATE/TOTAL/CREDIT_BADGE/EMPTY_STATE/DEACTIVATE*/DATE_FROM/
  // DATE_TO are now orphaned — the old React-only Orders/TodayOrders implementation used
  // them, replaced this batch by strict Angular parity. Left in place, not pruned, per
  // established no-instruction-to-prune-orphans precedent).
  'ORDERS.TITLE': 'Ventas',
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
  'ORDERS.DEACTIVATE_WITH_CREDIT_WARNING':
    'Este pedido tiene un crédito asociado que también será anulado.',
  'ORDERS.DATE_FROM': 'Desde',
  'ORDERS.DATE_TO': 'Hasta',
  'ORDERS.STATS.REVENUE': 'Ingresos totales',
  'ORDERS.STATS.ITEMS_SOLD': 'Artículos vendidos',

  // Today Orders (Angular TODAY_ORDERS.* — vocabs/es.ts)
  'TODAY_ORDERS.HEADER': 'Ventas del día',
  'TODAY_ORDERS.NO_ORDER_FOUND': 'No se ha realizado ninguna venta en el día de hoy.',
  'TODAY_ORDERS.SEND_TO_CART_CONFIRM_TITLE': 'Confirmación para volver a vender',
  'TODAY_ORDERS.SEND_TO_CART_CONFIRM_MESSAGE':
    'Hay una venta en proceso. ¿Desea eliminar esa venta y continuar?',
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
  'SALE_CREDIT.PAYMENT_CONFIRM_MESSAGE':
    'Usted está segura(o) que desea pagar este crédito por venta?',
  'SALE_CREDIT.NO_SALE_CREDIT_FOUND_IN_DAY': 'No existe ningún crédito en el día',
  'SALE_CREDIT.NO_SALE_CREDIT_FOUND': 'No se encontró ningún crédito',
  // 2026-09-22 (credits-paid-green-filter): filtro de radios por estado de pago en el
  // historial de créditos — textos exactos pedidos por el usuario.
  'SALE_CREDIT.FILTER_LABEL': 'Filtrar por estado de pago',
  'SALE_CREDIT.FILTER_ALL': 'Todos',
  'SALE_CREDIT.FILTER_TO_PAY': 'Por Pagar',
  'SALE_CREDIT.FILTER_PAID': 'Pagados',

  // Inventory
  // TITLE values corrected to byte-match Angular's INVENTORY.INVENTORY ('Inventario') and
  // INVENTORY_ENTRY.ENTRIES_IN_DAY ('Entradas del día') — vocabs/es.ts:430,422 (L6 parity,
  // Stage 2.3). NEW_ENTRY kept as-is (used only for the Today Entries add-entry button, whose
  // Angular counterpart is GENERAL.ENTRY, added separately above).
  'INVENTORY.AVAILABLE.TITLE': 'Inventario',
  // 2026-09-29 (petición del owner): el textbox de búsqueda de Inventario Disponible
  // pasa de "Buscar" a "Buscar producto" (deja claro qué se filtra) y lleva lupa
  // al inicio. Sustituye a GENERAL.SEARCH solo en esta vista.
  'INVENTORY.SEARCH_PRODUCT': 'Buscar producto',
  'INVENTORY.TODAY_ENTRIES.TITLE': 'Entradas del día',
  'INVENTORY.TODAY_ENTRIES.NEW_ENTRY': 'Nueva entrada',
  // 2026-09-18 (permiso del usuario): el header ahora es «Entradas (n)» — el
  // título «Historial de Entradas» se cambia a «Entradas» para diferenciarse de
  // «Entradas del día». E2E inventory-entries-history actualizado con permiso.
  'INVENTORY.ENTRIES.TITLE': 'Entradas',
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
  // Warehouses (warehouses-plan) — gestión de almacenes y movimientos.
  'WAREHOUSES.TITLE': 'Almacenes',
  'WAREHOUSES.NEW_WAREHOUSE': 'Nuevo almacén',
  'WAREHOUSES.EDIT_WAREHOUSE': 'Editar almacén',
  'WAREHOUSES.PRODUCT_COUNT': 'Productos',
  'WAREHOUSES.TOTAL_COST': 'Costo total',
  'WAREHOUSES.NAME': 'Nombre',
  'WAREHOUSES.NAME_PLACEHOLDER': 'Ej: Almacén Central',
  'WAREHOUSES.SAVE': 'Guardar',
  'WAREHOUSES.CANCEL': 'Cancelar',
  'WAREHOUSES.EDIT': 'Editar',
  'WAREHOUSES.DEACTIVATE': 'Desactivar',
  'WAREHOUSES.INACTIVE': 'Inactivo',
  'WAREHOUSES.EMPTY': 'No hay almacenes creados. Crea uno para comenzar.',
  'WAREHOUSES.STOCK_TITLE': 'Stock del almacén',
  'WAREHOUSES.NO_STOCK': 'Este almacén no tiene productos en stock.',
  'WAREHOUSES.PRODUCT': 'Producto',
  'WAREHOUSES.ON_HAND': 'Cantidad',
  'WAREHOUSES.AVG_COST': 'Costo promedio',
  'WAREHOUSES.PURCHASE_IN': 'Entrada (compra)',
  'WAREHOUSES.SALE_OUT': 'Salida a tienda',
  'WAREHOUSES.TRANSFER': 'Transferir',
  'WAREHOUSES.QUANTITY': 'Cantidad',
  'WAREHOUSES.COST_PRICE': 'Costo por unidad',
  'WAREHOUSES.REASON': 'Motivo (opcional)',
  'WAREHOUSES.TO_WAREHOUSE': 'Almacén destino',
  'WAREHOUSES.SELECT_WAREHOUSE': 'Seleccione un almacén…',
  'WAREHOUSES.MOVEMENTS_TITLE': 'Movimientos',
  'WAREHOUSES.NO_MOVEMENTS': 'No hay movimientos registrados.',
  'WAREHOUSES.DATE': 'Fecha',
  'WAREHOUSES.TYPE': 'Tipo',
  'WAREHOUSES.TYPE_PURCHASE_IN': 'Entrada (compra)',
  'WAREHOUSES.TYPE_SALE_OUT': 'Salida a tienda',
  'WAREHOUSES.TYPE_TRANSFER_IN': 'Entrada por transferencia',
  'WAREHOUSES.TYPE_TRANSFER_OUT': 'Salida por transferencia',
  // ─── Módulo Elaboración (17): consumo de insumos y entrada del terminado ──
  'WAREHOUSES.TYPE_CONSUMPTION_OUT': 'Consumo (elaboración)',
  'WAREHOUSES.TYPE_ELABORATION_IN': 'Entrada (elaboración)',
  // ─── Plan 2026-09-09: reversa de movimientos (D1-D12, F5/F8) ─────────────
  'WAREHOUSES.TYPE_REVERSAL': 'Reversa',
  'WAREHOUSES.REVERSAL_BADGE': 'Revertido',
  'WAREHOUSES.REVERSAL_CONFIRM_MESSAGE_A': '¿Está seguro que desea revertir este movimiento? Se ajustará el stock de los almacenes involucrados.',
  'WAREHOUSES.REVERSAL_SUCCESS': 'Movimiento revertido.',
  'WAREHOUSES.REVERSAL_BLOCKED_CONSUMED': 'La salida ya fue consumida por ventas — no se puede revertir.',
  'WAREHOUSES.REVERSAL_BLOCKED_STOCK': 'No hay suficiente stock en el almacén para revertir el movimiento.',
  'WAREHOUSES.REVERSAL_BLOCKED_TRANSFER_IN': 'Los movimientos de entrada por transferencia no se pueden revertir.',
  'WAREHOUSES.REVERSAL_BLOCKED_DUPLICATE': 'El movimiento ya tiene una reversa.',
  'WAREHOUSES.REVERSAL_BLOCKED_AMBIGUOUS': 'Hay varias entradas de tienda que coinciden con la salida — no se puede revertir automáticamente.',
  'WAREHOUSES.REVERSAL_ENTRY_NOT_FOUND': 'No se encontró la entrada de tienda asociada a la salida.',
  'WAREHOUSES.REVERSAL_LOT_CONSUMED': 'El lote de la compra ya fue consumido — no quedan unidades que revertir.',
  'WAREHOUSES.REVERSAL_EDIT_TITLE': 'Editar movimiento',
  // Edición de una compra parcialmente consumida (plan 2026-09-16, A1/A9e):
  // el tope editable es lo que QUEDA del lote, nunca la cantidad original.
  'WAREHOUSES.EDIT_REMAINING_HINT':
    'Solo puede editar hasta {max} — es lo que queda de esta compra.',
  'WAREHOUSES.EDIT_MAX_EXCEEDED':
    'La cantidad supera lo que queda de esta compra. Solo puede editar hasta {max}.',
  'WAREHOUSES.MOVEMENT_NOT_FOUND': 'El movimiento no existe.',
  'WAREHOUSES.MOVEMENT_UPDATED': 'Movimiento actualizado.',
  // ─── Fase 3: propagación del costo al editar una compra (plan 2026-09-16) ──
  'WAREHOUSES.PROPAGATION_TITLE': 'Propagar costo de la compra',
  'WAREHOUSES.PROPAGATION_CONFIRM':
    'Esta compra tiene {soldUnits} unidades ya vendidas en {sales} venta(s) y {storeUnits} unidades en tienda sin vender. Se actualizará su costo de {from} a {to}.',
  'WAREHOUSES.PROPAGATION_LEFT_OUT':
    '{count} venta(s) anulada(s) no se actualizarán.',
  'WAREHOUSES.PROPAGATION_COST_ONLY_HINT':
    'Esta compra no tiene unidades en el almacén; solo se corregirá el costo de lo ya vendido.',
  'WAREHOUSES.ACTIONS': 'Acciones de',
  'WAREHOUSES.REVERT_ACTION': 'Eliminar',
  'WAREHOUSES.EDIT_ACTION': 'Editar',
  'WAREHOUSES.COMPRA': 'Compra',
  'WAREHOUSES.EDIT_MOVEMENT': 'Editar movimiento',
  'WAREHOUSES.DELETE_MOVEMENT_TITLE': 'Eliminar movimiento',
  'WAREHOUSES.DELETE_MOVEMENT_CONFIRM':
    '¿Está seguro de que desea eliminar el movimiento de {product} ({quantity}) del almacén {warehouse}?',
  'WAREHOUSES.DEACTIVATE_BLOCKED': 'No se puede desactivar un almacén con stock o movimientos.',
  'WAREHOUSES.CREATED': 'Almacén creado.',
  'WAREHOUSES.UPDATED': 'Almacén actualizado.',
  'WAREHOUSES.MOVEMENT_CREATED': 'Movimiento registrado.',
  'WAREHOUSES.MENU_ENTRY': 'Entrada',
  'WAREHOUSES.MENU_MOVEMENT': 'Movimiento',
  'WAREHOUSES.MENU_SALE_OUT': 'Salida',
  'WAREHOUSES.MODAL_ENTRY': 'Entrada al almacén',
  'WAREHOUSES.MODAL_MOVEMENT': 'Movimiento a otro almacén',
  'WAREHOUSES.MODAL_SALE_OUT': 'Salida a tienda',
  'WAREHOUSES.SELECT_PRODUCT': 'Seleccione un producto…',
  // ─── Módulo Elaboración (17): recetas (BoM) ─────────────────────────────
  'RECIPE.TITLE': 'Recetas',
  'RECIPE.NEW': 'Nueva receta',
  'RECIPE.EDIT': 'Editar receta',
  'RECIPE.EMPTY': 'No hay recetas creadas. Crea una para comenzar.',
  'RECIPE.FINISHED_PRODUCT': 'Producto terminado',
  'RECIPE.SELECT_PRODUCT': 'Seleccione un producto…',
  'RECIPE.OUTPUT_QTY': 'Rendimiento por lote',
  'RECIPE.COMPONENTS_TITLE': 'Componentes',
  'RECIPE.COMPONENT': 'Componente',
  'RECIPE.ADD_COMPONENT': 'Añadir componente',
  'RECIPE.REMOVE_COMPONENT': 'Eliminar componente',
  'RECIPE.COMPONENT_QTY': 'Cantidad por unidad',
  'RECIPE.DUPLICATE_COMPONENT': 'Cada componente debe ser un producto distinto.',
  'RECIPE.SCRAP_PCT': 'Merma (%)',
  'RECIPE.LABOR_COST': 'Mano de obra por lote',
  'RECIPE.OVERHEAD_PCT': 'Gastos indirectos (%)',
  'RECIPE.SAVE': 'Guardar',
  'RECIPE.EDIT_ACTION': 'Editar',
  'RECIPE.DEACTIVATE': 'Desactivar',
  'RECIPE.INACTIVE': 'Inactiva',
  'RECIPE.COMPONENTS_COUNT': '{count, plural, one {# componente} other {# componentes}}',
  'RECIPE.DEACTIVATE_CONFIRM_TITLE': 'Desactivar receta',
  'RECIPE.DEACTIVATE_CONFIRM_MESSAGE':
    '¿Está seguro que desea desactivar esta receta? Las elaboraciones ya registradas conservan su historial.',
  'RECIPE.DEACTIVATE_CONFIRM_BUTTON': 'Desactivar',
  'RECIPE.CREATED': 'Receta creada.',
  'RECIPE.UPDATED': 'Receta actualizada.',
  'RECIPE.DEACTIVATED': 'Receta desactivada.',
  // ─── Módulo Elaboración (17): elaboraciones (orden de producción) ───────
  'ELABORATION.TITLE': 'Nueva elaboración',
  'ELABORATION.RECIPE': 'Receta',
  'ELABORATION.SELECT_RECIPE': 'Seleccione una receta…',
  'ELABORATION.BATCHES': 'Lotes',
  'ELABORATION.WAREHOUSE': 'Almacén',
  'ELABORATION.SELECT_WAREHOUSE': 'Seleccione un almacén…',
  'ELABORATION.COMPONENTS_TITLE': 'Componentes',
  'ELABORATION.PRODUCT': 'Producto',
  'ELABORATION.THEORETICAL': 'Teórica',
  'ELABORATION.ACTUAL': 'Real',
  'ELABORATION.COST_PRICE': 'Costo unitario',
  'ELABORATION.LINE_TOTAL': 'Costo total',
  'ELABORATION.INGREDIENTS_COST': 'Costo de insumos',
  'ELABORATION.OVERHEAD': 'Gastos indirectos',
  'ELABORATION.LABOR': 'Mano de obra',
  'ELABORATION.TOTAL_COST': 'Costo total',
  'ELABORATION.PRODUCED_QTY': 'Cantidad producida',
  'ELABORATION.UNIT_COST': 'Costo unitario',
  'ELABORATION.CONFIRM': 'Confirmar elaboración',
  'ELABORATION.CONFIRMED': 'Elaboración registrada.',
  'ELABORATION.NO_RECIPES': 'No hay recetas activas. Cree una receta para poder elaborar.',
  'ELABORATION.NO_WAREHOUSE':
    'No hay almacenes configurados. Cree un almacén para poder elaborar.',
  'ELABORATION.INSUFFICIENT_ROW': 'Stock insuficiente',
  'ELABORATION.HISTORY_TITLE': 'Historial de elaboraciones',
  'ELABORATION.NO_HISTORY': 'No hay elaboraciones registradas.',
  'ELABORATION.NEGATIVE_ACTUAL':
    'Las cantidades reales negativas se tratan como cero.',
  // Angular INVENTORY_ENTRY.* namespace (vocabs/es.ts:420-426) — today-entries add/edit modal
  // + today-entries empty state (was previously covered by the overloaded INVENTORY.EMPTY_STATE).
  // INVENTORY_ENTRY.TEXT (Angular vocabs/es.ts:421) — used by Swal's DELETE_CONFIRM_MESSAGE_A
  // interpolation in entry-list.component.ts:70 (onDeleteInventoryEntry).
  'INVENTORY_ENTRY.TEXT': 'Entrada',
  'INVENTORY_ENTRY.ENTRIES_IN_DAY': 'Entradas del día',
  'INVENTORY_ENTRY.NO_ENTRY_FOUND_IN_DAY': 'No existe ninguna entrada en el día',
  'INVENTORY_ENTRY.NEW_INVENTORY_ENTRY': 'Adicionar Entrada',
  'INVENTORY_ENTRY.EDIT_INVENTORY_ENTRY': 'Editar Entrada',
  'INVENTORY_ENTRY.WAREHOUSE_COST_NOT_EDITABLE':
    'El costo de esta entrada se actualiza en el almacén, no se puede editar en la tienda.',
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
  'INVENTORY.ERRORS.SOLD_ENTRY_CANNOT_EDIT':
    'No se puede editar una entrada que ya tiene ventas asociadas',
  'INVENTORY.ERRORS.SOLD_ENTRY_CANNOT_DELETE':
    'No se puede eliminar una entrada que ya tiene ventas asociadas',
  // Orphaned since Stage 2.3 (L6 parity): was overloaded across 3 distinct empty-states with
  // different Angular text (see INVENTORY_ENTRY.NO_ENTRY_FOUND_IN_DAY / INVENTORY.NO_ENTRY_FOUND
  // / INVENTORY.CATEGORY_PRODUCT_NO_FOUND above, now used instead). Left in place, not pruned,
  // per established no-instruction-to-prune-orphans precedent (see ORDERS.* orphans).
  'INVENTORY.EMPTY_STATE': 'No hay entradas de inventario',

  // Scanner
  'SCANNER.TITLE': 'Escanear producto',
  'SCANNER.QUANTITY': 'Cantidad',
  'SCANNER.DECREASE_QUANTITY': 'Disminuir cantidad a adicionar',
  'SCANNER.INCREASE_QUANTITY': 'Aumentar cantidad a adicionar',
  'SCANNER.DONE': 'Listo',
  'SCANNER.MANUAL_ENTRY': 'Ingresar código de barras',
  'SCANNER.MANUAL_ENTRY_PLACEHOLDER': 'Código de barras',
  'SCANNER.PRODUCT_ADDED': '{name} agregado a la venta',
  'SCANNER.PRODUCT_NOT_SELLABLE': 'El producto {name} no está disponible para la venta',
  'SCANNER.CAMERA_PERMISSION_DENIED':
    'Permiso de cámara denegado. Habilitá el acceso a la cámara para usar el escáner.',
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
  // 2026-09-20 (owner): el historial muestra solo «Gastos» — «Historial de»
  // era redundante (el menú ya lo llama «Gastos», MENU.EXPENSES_HISTORY).
  'EXPENSES.HISTORY.TITLE': 'Gastos',
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

  // Statistics — Cuadre por fechas (range summary; UI copy owned by the React app)
  'CUADRE_FECHAS.HEADER': 'Cuadre por fechas',
  'CUADRE_FECHAS.START_DATE': 'Fecha inicio',
  'CUADRE_FECHAS.END_DATE': 'Fecha fin',
  'CUADRE_FECHAS.GENERATE': 'Generar',
  'CUADRE_FECHAS.INVALID_RANGE': 'La fecha de inicio debe ser anterior o igual a la fecha de fin.',
  'CUADRE_FECHAS.EMPTY_DATES': 'Selecciona las fechas de inicio y fin.',
  'CUADRE_FECHAS.INVALID_FORMAT': 'Formato de fecha inválido. Usa dd-mm-yyyy.',
  'CUADRE_FECHAS.CUADRE': 'Cuadre',
  'CUADRE_FECHAS.KPI_SALES': 'Ventas',
  'CUADRE_FECHAS.KPI_EXPENSES': 'Gastos',
  'CUADRE_FECHAS.KPI_GROSS_PROFIT': 'Ganancias Bruta',
  'CUADRE_FECHAS.KPI_NET_PROFIT': 'Ganancias',

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
  'PROFILE.PASSWORD_REGEX_ERROR':
    'La contraseña debe tener entre 8 y 30 caracteres, al menos una mayúscula, una minúscula y un número.',
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
  'STORES.FILTER_ALL': 'Todos',
  'STORES.FILTER_NOT_FREE': 'No Gratis',
  'STORES.FILTER_VIP': 'VIP',
  'STORES.FILTER_SUPERIOR': 'Superior',
  'STORES.FILTER_PAID': 'Pago',
  'STORES.FILTER_FREE': 'Gratis',
  'STORES.PAID_PLAN': 'Plan de Pago',
  'STORES.FREE_PLAN': 'Plan Gratis',
  'STORES.EMPTY_STATE': 'No hay tiendas registradas.',
  'STORES.NAME_REQUIRED': 'El nombre es obligatorio.',
  'STORES.PLAN.SECTION_TITLE': 'Plan de la tienda',
  'STORES.NO_STORE_SELECTED': 'No hay una tienda seleccionada.',
  'STORES.PLAN.BILLING_NOTICE':
    'Plan Pago: 1 mes GRATIS. Luego se cobra por mes vencido → el primer pago después del segundo mes.',
  'STORES.PLAN.FREE_TAB': 'Gratis',
  'STORES.PLAN.PAID_TAB': 'Pago',
  'STORES.PLAN.SUPERIOR_TAB': 'Superior',
  'STORES.PLAN.VIP_TAB': 'VIP',
  'STORES.PLAN.DISPLAY': 'Plan: {plan}',
  'STORES.PLAN.ACTIVE_BADGE': 'Activo',
  'STORES.PLAN.INCLUDES': 'Incluye:',
  'STORES.PLAN.INCLUDES_PREVIOUS_PLAN': 'Incluye todo lo del plan {plan} y además:',
  'STORES.PLAN.NEXT_BILLING_DATE': 'Próximo cobro',
  'STORES.PLAN.ACTIVATE_PLAN': 'Activar Plan',

  // Super-admin per-store module pricing (gear item + table). The grouping reuses the
  // STORES.PLAN.*_TAB names; the last bucket holds modules no loaded plan carries (VIP-only,
  // because GET /v1/plans excludes VIP) so every module in the table is still reachable.
  'STORES.MODULE_PRICING.MENU_LABEL': 'Precios de módulos',
  'STORES.MODULE_PRICING.TITLE': 'Precios de módulos',
  'STORES.MODULE_PRICING.HINT':
    'Marca un módulo para activarlo en esta tienda y desmarcalo para desactivarlo. El total solo cuenta los módulos marcados y se recalcula mientras escribes.',
  'STORES.MODULE_PRICING.LOADING': 'Cargando módulos...',
  'STORES.MODULE_PRICING.NO_MODULES': 'No hay módulos disponibles para esta tienda.',
  'STORES.MODULE_PRICING.NO_PLAN_GROUP': 'Otros planes',
  'STORES.MODULE_PRICING.COLUMN_ACTIVE': 'Activo',
  'STORES.MODULE_PRICING.COLUMN_MODULE': 'Módulo',
  'STORES.MODULE_PRICING.COLUMN_PRICE': 'Precio',
  'STORES.MODULE_PRICING.COLUMN_DISCOUNT': 'Descuento',
  'STORES.MODULE_PRICING.COLUMN_PERCENT_DISCOUNT': '% Descuento',
  'STORES.MODULE_PRICING.COLUMN_CURRENT': 'Precio actual',
  'STORES.MODULE_PRICING.TOTAL': 'Total',
  'STORES.MODULE_PRICING.SERVER_TOTAL_NOTE':
    'Total guardado por el servidor. Se recalcula al editar cualquier valor.',

  // SuperAdmin GLOBAL module catalog pricing (/admin/modules). Distinct from
  // STORES.MODULE_PRICING.* above, which prices one STORE's frozen copies. Grouping reuses
  // the STORES.PLAN.*_TAB names; the last bucket holds modules no loaded plan claims.
  'MODULE_CATALOG.TITLE': 'Precios de los módulos',
  'MODULE_CATALOG.HINT':
    'Edita el precio, el descuento y el descuento porcentual de cada módulo del catálogo. Si un módulo tiene descuento, su precio base aparece tachado y el precio final se recalcula mientras escribes. El total del plan suma los precios finales de sus módulos.',
  'MODULE_CATALOG.LOADING': 'Cargando módulos...',
  'MODULE_CATALOG.EMPTY': 'No hay módulos disponibles en el catálogo.',
  'MODULE_CATALOG.NO_PLAN_GROUP': 'Otros planes',
  'MODULE_CATALOG.COLUMN_MODULE': 'Módulo',
  'MODULE_CATALOG.COLUMN_PRICE': 'Precio',
  'MODULE_CATALOG.COLUMN_PERCENT_DISCOUNT': '% Descuento',
  'MODULE_CATALOG.COLUMN_DISCOUNT': 'Descuento',
  'MODULE_CATALOG.COLUMN_CURRENT': 'Precio final',
  'MODULE_CATALOG.GROUP_TOTAL': 'Total del plan',
  'MODULE_CATALOG.SAVE': 'Guardar',
  'MODULE_CATALOG.SAVING': 'Guardando...',
  'MODULE_CATALOG.SAVE_SUCCESS': 'Precios de los módulos actualizados correctamente.',
  'MODULE_CATALOG.ERROR': 'No se pudieron guardar los precios de los módulos. Intente de nuevo.',

  // Super-admin store cards (2026-09-10): owner contact + description labels.
  // The plan line reuses the STORES.PLAN.*_TAB names; the phone renders as a tel: link.
  'STORES.OWNER_LABEL': 'Owner',
  'STORES.STORE_PHONE_LABEL': 'Teléfono',
  'STORES.STORE_DESCRIPTION_LABEL': 'Descripción',

  // Channel rates — append-only register per channel (method + currency),
  // multipayments. A new effective moment is a new row; registration happens
  // through the `+ Tasa` popup only, and the view shows "Tasas Vigentes" (the
  // rate in force per channel) plus the full history (T22, 2026-09-24).
  'CHANNEL_RATES.TITLE': 'Tasas de Cambio',
  'CHANNEL_RATES.INFO':
    'Registra cuántas unidades de la moneda elegida equivalen a 1 USD para cada método de pago, con la fecha desde la que rige la tasa. La moneda es la que se cotiza contra 1 USD (por eso USD no aparece: es el pivote 1 USD = 1 USD). El registro es de solo lectura: cada cambio crea una fila nueva y el historial no se edita ni se elimina.',
  'CHANNEL_RATES.ADD_RATE': 'Tasa',
  'CHANNEL_RATES.HELP_LABEL': '¿Qué significa el valor de la tasa?',
  'CHANNEL_RATES.HELP':
    'Cada valor indica cuántas unidades de la moneda del canal equivalen a 1 USD. Por ejemplo, un valor de 700 en Efectivo (CUP) significa que 1 USD = 700 CUP.',
  'CHANNEL_RATES.FORM_TITLE': 'Registrar tasa',
  'CHANNEL_RATES.METHOD_LABEL': 'Método de pago',
  'CHANNEL_RATES.CURRENCY_LABEL': 'Moneda (a la que equivale 1 USD)',
  'CHANNEL_RATES.VALUE_LABEL': 'Valor (unidades por 1 USD)',
  'CHANNEL_RATES.BUY_VALUE_LABEL': 'Valor de compra (unidades por 1 USD)',
  'CHANNEL_RATES.SELL_VALUE_LABEL': 'Valor de venta (unidades por 1 USD)',
  'CHANNEL_RATES.BUY_VALUE_HELP':
    'Unidades de la moneda del canal por 1 USD cuando se compra la moneda.',
  'CHANNEL_RATES.SELL_VALUE_HELP':
    'Unidades de la moneda del canal por 1 USD cuando se vende la moneda.',
  'CHANNEL_RATES.EFFECTIVE_FROM_LABEL': 'Vigente desde',
  'CHANNEL_RATES.REGISTER': 'Registrar tasa',
  'CHANNEL_RATES.SAVED': 'Tasa registrada correctamente.',
  'CHANNEL_RATES.INVALID_DATE': 'La fecha de vigencia es obligatoria.',
  'CHANNEL_RATES.INVALID_CHANNEL':
    'Ese canal no existe: elige una combinación válida de método y moneda.',
  'CHANNEL_RATES.CURRENT_TITLE': 'Tasas Vigentes',
  'CHANNEL_RATES.NO_CURRENT_RECORDS': 'No hay tasas vigentes todavía.',
  'CHANNEL_RATES.HISTORY_TITLE': 'Historial de tasas',
  'CHANNEL_RATES.CHANNEL_COLUMN': 'Canal',
  'CHANNEL_RATES.CURRENCY_COLUMN': 'Moneda',
  'CHANNEL_RATES.VALUE_COLUMN': 'Valor',
  'CHANNEL_RATES.BUY_VALUE_COLUMN': 'Compra',
  'CHANNEL_RATES.SELL_VALUE_COLUMN': 'Venta',
  'CHANNEL_RATES.EFFECTIVE_FROM_COLUMN': 'Vigente desde',
  'CHANNEL_RATES.CREATED_DATE_COLUMN': 'Registrado',
  'CHANNEL_RATES.NO_RECORDS': 'No hay tasas registradas todavía.',
  'CHANNEL_RATES.STATUS_COLUMN': 'Estado',
  'CHANNEL_RATES.ACTIONS_COLUMN': 'Acciones',
  'CHANNEL_RATES.DETAILS_COLUMN': '?',
  'CHANNEL_RATES.DETAILS_LABEL': 'Ver detalles',
  'CHANNEL_RATES.ACTIVE_STATUS': 'Activa',
  'CHANNEL_RATES.INACTIVE_STATUS': 'Inactiva',
  'CHANNEL_RATES.DEACTIVATE': 'Desactivar',
  'CHANNEL_RATES.REACTIVATE': 'Reactivar',
  'CHANNEL_RATES.TOGGLE_ERROR': 'No se pudo actualizar el estado de la tasa.',
  'CHANNEL_RATES.DEACTIVATE_CONFIRM_TITLE': 'Desactivar tasa',
  'CHANNEL_RATES.DEACTIVATE_CONFIRM_MESSAGE':
    'La tasa dejará de usarse en las conversiones. Se mostrará la última tasa activa de ese canal y la fila se conserva en el historial.',
  'CHANNEL_RATES.METHOD_EFECTIVO': 'Efectivo',
  'CHANNEL_RATES.METHOD_ZELLE': 'Zelle',
  'CHANNEL_RATES.METHOD_TRANSFERENCIA': 'Transferencia',
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
  'STORES.ACTIVATE_PAID_MESSAGE':
    '¿Está seguro que desea activar el plan de pago para esta tienda? Se habilitarán todos los módulos de pago.',
  'STORES.DEACTIVATE_PAID_TITLE': 'Desactivar plan pago',
  'STORES.DEACTIVATE_PAID_MESSAGE':
    '¿Está seguro que desea desactivar el plan de pago? Se deshabilitarán los módulos de pago asociados.',

  // Owner's "my stores" cards view (owner-stores-cards plan, 2026-09-08)
  'STORES.MY_STORES_TITLE': 'Mis tiendas',
  // Owner create-store button (owner-multistores store-creation, 2026-09-09)
  'STORES.CREATE_STORE_BUTTON': 'Tienda',
  'STORES.INACTIVE_BADGE': 'Inactiva',
  'STORES.EDIT_STORE_TITLE': 'Editar la tienda',
  'STORES.EDIT_PLAN': 'Editar el plan',
  'STORES.EDIT_PLAN_TITLE': 'Plan de la tienda',
  'STORES.ACTIVATION_CONFIRM_TITLE': 'Confirmación',
  'STORES.ACTIVATION_CONFIRM_DEACTIVATE':
    '¿Está seguro que desea desactivar esta tienda? Dejará de aparecer como activa.',
  'STORES.ACTIVATION_ERROR': 'No se pudo cambiar el estado de la tienda. Intente de nuevo.',

  // Store switcher — owner-only navbar popup + Configuraciones active-store
  // select (store-switcher-react). Switching stores ends the session so the
  // DEK for the new store is provisioned on the next login.
  'STORE_SELECTOR.TITLE': 'Cambiar tienda',
  'STORE_SELECTOR.LOADING': 'Cargando tiendas...',
  'STORE_SELECTOR.LOAD_ERROR': 'No se pudieron cargar las tiendas.',
  'STORE_SELECTOR.EMPTY': 'No hay tiendas para seleccionar.',
  'STORE_SELECTOR.CURRENT': 'Actual',
  'STORE_SELECTOR.SWITCH_ERROR': 'No se pudo cambiar la tienda.',
  'STORE_SELECTOR.CURRENT_STORE': 'La tienda seleccionada es: {store}',
  'CONFIGURATIONS.STORE_LABEL': 'Tienda activa',

  // Payment config (store-payment-methods-config, 2026-09-22; per-channel T20,
  // 2026-09-24): per-store toggles over the canonical channel catalogue. Channel
  // names come from `CHANNEL_RATES.METHOD_*` via the shared `channelLabel`.
  'CONFIGURATIONS.PAYMENT_METHODS.TITLE': 'Métodos de pago',
  'CONFIGURATIONS.PAYMENT_METHODS.ALWAYS_ON': 'Siempre habilitado',
  'CONFIGURATIONS.PAYMENT_METHODS.SAVED': 'Guardado',

  // Per-store currency config (MultiMonedas module 15): buy/sell currency.
  'CONFIGURATIONS.CURRENCY_CONFIG.TITLE': 'Monedas de compra y venta',
  'CONFIGURATIONS.CURRENCY_CONFIG.BUY_CURRENCY': 'Moneda de Compra',
  'CONFIGURATIONS.CURRENCY_CONFIG.SELL_CURRENCY': 'Moneda de Venta',

  // Billing — payment status banner (neutral Latin American Spanish, no voseo)
  'BILLING.TRIAL_NOTICE':
    'Probando el plan de pago. Primer cobro será el {date}, PERO si no pagas pasas al plan gratis.',
  'BILLING.DUE_NOTICE':
    'El pago del plan vence el {date}. Realice el pago para evitar interrupciones en el servicio.',
  'BILLING.OVERDUE_NOTICE':
    'El pago del plan está vencido. Algunas funciones pueden estar restringidas hasta regularizar la situación.',

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
  'USERS.PASSWORD_POLICY':
    'La contraseña debe tener entre 8 y 30 caracteres, e incluir al menos una mayúscula, una minúscula y un número.',
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
  'ADMIN_DASHBOARD.ACTIVE_STORES': 'Tiendas activas',
  'ADMIN_DASHBOARD.TOTAL': 'Total',
  'ADMIN_DASHBOARD.AVERAGE': 'Promedio',
  'ADMIN_DASHBOARD.ERROR': 'Ocurrió un error. Intentá de nuevo.',
  'ADMIN_DASHBOARD.NO_OWNERS': 'Sin tiendas activas',

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
  'RESELLERS.PASSWORD_POLICY':
    'La contraseña debe tener entre 8 y 30 caracteres, e incluir al menos una mayúscula, una minúscula y un número.',
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
  // Card label for the owner's own account login. Deliberately the literal
  // "Login", not USERS.LOGIN ("Usuario"), which labels a different field.
  'OWNER.LOGIN_LABEL': 'Login',
  'OWNER.FILTER_LABEL': 'Mostrar:',
  'OWNER.FILTER_ALL': 'Todos',
  'OWNER.FILTER_NOT_FREE': 'No Gratis',
  'OWNER.FILTER_VIP': 'VIP',
  'OWNER.FILTER_SUPERIOR': 'Superior',
  'OWNER.FILTER_PAID': 'Pago',
  'OWNER.FILTER_FREE': 'Gratis',
  'OWNER.PAID_PLAN': 'Plan de Pago',
  'OWNER.FREE_PLAN': 'Plan Gratis',
  'OWNER.ERROR': 'Ocurrió un error. Inténtalo de nuevo.',
  'OWNER.DUPLICATE_LOGIN': 'Ese login ya está en uso. Elige otro.',
  'OWNER.FORBIDDEN': 'No tienes permiso para esta acción.',
  'OWNER.NOT_FOUND': 'El propietario no existe o fue eliminado.',
  'OWNER.HAS_PAYMENTS':
    'Este propietario tiene pagos registrados y no se puede eliminar. Desactívalo en su lugar.',
  'OWNER.PASSWORD_POLICY':
    'La contraseña debe tener entre 8 y 30 caracteres, e incluir al menos una mayúscula, una minúscula y un número.',
  'OWNER.PASSWORDS_MUST_MATCH': 'Las contraseñas no coinciden.',
  'OWNER.PHONE_REQUIRED': 'El teléfono es obligatorio.',
  'OWNER.EDIT_TITLE_LABEL': 'Editar propietario',
  'OWNER.DELETE_CONFIRM_TITLE': 'Eliminar propietario permanentemente',
  'OWNER.DELETE_CONFIRM_MESSAGE':
    '¿Está seguro que desea eliminar permanentemente a {name}? Se eliminarán la tienda, todos los usuarios asociados y todos los datos. Esta acción no se puede deshacer.',
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
  'SYNC.IMPORT_ERROR':
    'Ha ocurrido un error al importar los datos. Si el error persiste contacte al servicio técnico.',
  'SYNC.ERROR_EMPTY_PASSWORD': 'La contraseña no puede estar vacía.',
  'SYNC.ERROR_NO_FILE': 'Selecciona un archivo de respaldo.',
  // sync-export-import-v2 (V2-10): shown when the backup was exported from a
  // DIFFERENT store — a store mismatch is not a password problem, so the user
  // must retry with the right file/password, not just retype theirs.
  'SYNC.ERROR_WRONG_STORE':
    'Este respaldo pertenece a otra tienda. Usá la contraseña y el archivo de exportación de la tienda actual.',
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
  // Damaged-data recovery (plan: docs/plans/2026-09-15-damaged-data-recovery-
  // export-wipe-plan.md §4). The popup text above does NOT change — these label
  // the flow its two buttons open: download what is still readable, then ask a
  // second time before wiping this store's data on this device.
  'ENCRYPTION.RECOVERY_ACTION': 'Recuperar datos',
  'ENCRYPTION.RECOVERY_DISMISS': 'Ahora no',
  'ENCRYPTION.RECOVERY_CONFIRM_TITLE': 'Borrar los datos de esta tienda',
  'ENCRYPTION.RECOVERY_CONFIRM_MESSAGE':
    '¿Ya guardaste el archivo? Al continuar se borrarán los datos de esta tienda en este dispositivo.',
  'ENCRYPTION.RECOVERY_CONFIRM_BUTTON': 'Sí, borrar',
  // Deliberately its own key rather than reusing GENERAL.CANCEL: this one is
  // read as the paired secondary button of the confirmation above, and must be
  // able to diverge from the general-purpose label.
  'ENCRYPTION.RECOVERY_CANCEL_BUTTON': 'Cancelar',
  'ENCRYPTION.RECOVERY_KEPT': 'No se borró nada.',
  'ENCRYPTION.RECOVERY_WIPED':
    'Los datos de esta tienda se borraron de este dispositivo. Vuelva a iniciar sesión para empezar de nuevo.',
  // Followed by the list of entity names clearStoreData could not remove.
  'ENCRYPTION.RECOVERY_WIPED_PARTIAL':
    'Se borraron los datos de esta tienda, pero no se pudieron borrar las siguientes entidades: ',

  // Multi-store panel views (OwnerAdmin + módulo MultiStores): select global,
  // paneles colapsables por tienda y estado sin datos locales.
  'MULTISTORE.ALL_STORES': 'Todas las tiendas',
  'MULTISTORE.NO_LOCAL_DATA': 'Sin datos de esta tienda en este dispositivo',
  'MULTISTORE.NO_CREDITS_IN_RANGE': 'Sin créditos en el rango seleccionado',
  'MULTISTORE.NO_ENTRIES_IN_RANGE': 'Sin entradas en el rango seleccionado',
  'MULTISTORE.STORE_SELECT_ARIA': 'Seleccionar tienda',

  // Owner messaging (owner↔SuperAdmin chat): header icon, collapsible panel and
  // error toasts. No raw HTTP error text is ever shown.
  'MESSAGES.TITLE': 'Mensajes',
  'MESSAGES.EMPTY': 'No hay mensajes con el administrador.',
  'MESSAGES.INPUT_PLACEHOLDER': 'Escriba un mensaje',
  'MESSAGES.SEND': 'Enviar',
  'MESSAGES.PENDING': 'Pendiente',
  'MESSAGES.LOAD_ERROR': 'No se pudieron cargar los mensajes. Intente de nuevo.',
  'MESSAGES.SEND_ERROR': 'No se pudo enviar el mensaje. Intente de nuevo.',
  // The message was queued, not lost: the offline queue flushes it on reconnect.
  'MESSAGES.OFFLINE_QUEUED':
    'Sin conexión. El mensaje se enviará automáticamente cuando vuelva la conexión.',
  'MESSAGES.LIST_EMPTY': 'No hay propietarios activos.',
  'MESSAGES.SELECT_CONVERSATION':
    'Seleccione un propietario para ver los mensajes.',
  'MESSAGES.NO_CONVERSATION': 'Sin conversación',
  'MESSAGES.NO_STORE': 'Sin tienda',
  'MESSAGES.BROADCAST': 'Difusión',
  'MESSAGES.BROADCAST_TITLE': 'Enviar difusión',
  'MESSAGES.BROADCAST_PLACEHOLDER': 'Escriba el mensaje para todos los propietarios',
  'MESSAGES.BROADCAST_SEND': 'Enviar difusión',
  'MESSAGES.BROADCAST_SUCCESS': 'Difusión enviada.',
  'MESSAGES.BROADCAST_ERROR': 'No se pudo enviar la difusión. Intente de nuevo.',

  // Campana de avisos del SuperAdmin (registro de propietarios): encabezado,
  // panel, acciones y el popup del sistema operativo. Sin permiso del navegador,
  // o con el permiso denegado, solo queda el aviso dentro de la aplicación.
  'NOTIFICATIONS.TITLE': 'Notificaciones',
  'NOTIFICATIONS.EMPTY': 'No hay avisos de registro de propietarios.',
  'NOTIFICATIONS.MARK_ALL': 'Marcar todas como leídas',
  'NOTIFICATIONS.LOAD_ERROR': 'No se pudieron cargar las notificaciones. Intente de nuevo.',
  'NOTIFICATIONS.MARK_ERROR': 'No se pudo actualizar la notificación. Intente de nuevo.',
  'NOTIFICATIONS.SYSTEM_TITLE': 'Nuevo propietario registrado',
  'NOTIFICATIONS.SYSTEM_BODY': '{ownerName} · {cellPhone} · {storeName}',
};

export default messages;
