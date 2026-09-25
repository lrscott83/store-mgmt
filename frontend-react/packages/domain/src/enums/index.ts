export enum ERoles {
  SuperAdmin = 1,
  OwnerAdmin = 2,
  StoreUser = 3,
  ReSeller = 4,
}

export enum EFeatures {
  Tenants = 10,
  Owners = 11,
  Roles = 12,
  ReSellers = 13,
  Features = 14,
  AdminStores = 15,
  AdminDashboard = 16,
  Products = 20,
  Sale = 21,
  TodayOrders = 22,
  TodayStats = 23,
  Available = 30,
  Entries = 31,
  /** Cuadre del día — espejo de FeatureType.TodayInventoryStats=32 (backend). */
  TodayInventoryStats = 32,
  Egress = 33,
  InventoryTodayQuantities = 34,
  InventoryTodaySaleProfit = 35,
  Warehouses = 36,
  /** Movimientos de almacén — espejo de FeatureType.WarehouseStockMovements=37 (backend). */
  WarehouseStockMovements = 37,
  /** Mis tiendas — espejo de FeatureType.OwnerStores=38 (backend). */
  OwnerStores = 38,
  /** Feature Ventas Mayoristas — espejo de FeatureType.WholesaleSales=39 (backend). */
  WholesaleSales = 39,
  Send = 40,
  Download = 41,
  Receive = 42,
  /** Feature MultiMonedas — espejo de FeatureType.MultiMonedas=43 (backend). */
  MultiMonedas = 43,
  /** Feature MultiPayments — espejo de FeatureType.MultiPayments=44 (backend). */
  MultiPayments = 44,
  TodayReports = 50,
  Dashboard = 60,
  Profile = 70,
  Users = 72,
  Stores = 73,
  Configurations = 74,
  TodayExpenses = 80,
  Billing = 90,
  StorePayment = 91,
  SalesHistory = 100,
  EntriesHistory = 101,
  ExpensesHistory = 102,
  CreditsHistory = 103,
  CreditSale = 110,
  /** Feature Recetas — espejo de FeatureType.Recipes=120 (backend). */
  Recipes = 120,
  /** Feature Elaboraciones — espejo de FeatureType.Elaborations=121 (backend). */
  Elaborations = 121,
}

export enum EModules {
  Administration = 1,
  Sales = 2,
  Inventory = 3,
  Synchronization = 4,
  Reports = 5,
  Statistics = 6,
  Management = 7,
  Expenses = 8,
  Billing = 9,
  Histories = 10,
  Credits = 11,
  /** Módulo Ventas Mayoristas — espejo de ModuleType.WholesaleSales=12 (backend). */
  WholesaleSales = 12,
  /** Módulo Almacenes — espejo de ModuleType.Warehouses=13 (backend). */
  Warehouses = 13,
  /** Módulo MultiStores — espejo de ModuleType.MultiStores=14 (backend). */
  MultiStores = 14,
  /** Módulo MultiMonedas — espejo de ModuleType.MultiMonedas=15 (backend). */
  MultiMonedas = 15,
  /** Módulo MultiPayments — espejo de ModuleType.MultiPayments=16 (backend). */
  MultiPayments = 16,
  /** Módulo Elaboración — espejo de ModuleType.Elaboration=17 (backend). */
  Elaboration = 17,
}

export enum PaymentType {
  Efectivo = 1,
  Tarjeta = 2,
  Zelle = 3,
}

export enum OrderType {
  Normal = 1,
  Mayorista = 2,
  Merma = 3,
  Ajuste = 4,
  Otro = 100,
}

export enum ExpenseType {
  Salario = 1,
  Transporte = 2,
  Alquiler = 3,
  Corriente = 4,
  Agua = 5,
  Comida = 6,
  Operaciones = 7,
  Viaje = 8,
  Divisa = 9,
  Impuesto = 10,
  Otro = 100,
}

/**
 * currency-in-costs-and-prices (plan 2026-09-16): moneda de los precios y
 * costos del negocio de la tienda (orders, products, expenses, credits,
 * inventory, warehouses). Espejo por VALOR del enum C# `Domain.Common.Enums.Currency`
 * — la serialización es el número, así que este orden queda CONGELADO desde
 * el día 1: reordenar/insertar valores rompería datos históricos.
 */
export enum Currency {
  CUP = 0,
  USD = 1,
  EUR = 2,
  CLA = 3,
  MLC = 4,
  CAD = 5,
  MXN = 6,
}

/**
 * payment-methods-percent-tax (plan 2026-09-17): forma de pago de una venta.
 *
 * Enum CONGELADO por valor desde el día 1 (igual que Currency): la
 * serialización es el número; reordenar/insertar valores rompería datos
 * históricos en localStorage y en el backend.
 *
 * "Transferencia (X)" NO es un miembro por moneda: es `Transferencia` + la
 * moneda de la venta (Order.currency). Transferencia (CUP) reemplaza al
 * histórico PaymentType.Tarjeta.
 */
export enum SalePaymentMethod {
  /** Default: toda venta histórica sin método explícito fue en efectivo. */
  Efectivo = 0,
  Zelle = 1,
  Transferencia = 2,
}

/** Default de toda entidad con método de pago: ausente del campo = Efectivo. */
export const DEFAULT_SALE_PAYMENT_METHOD: SalePaymentMethod = SalePaymentMethod.Efectivo;

/** Default de toda entidad con precio/costo: ausente del campo = CUP. */
export const DEFAULT_CURRENCY: Currency = Currency.CUP;
