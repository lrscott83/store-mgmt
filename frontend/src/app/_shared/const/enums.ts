export enum EPermissions {
  CarrierView = 'View',
  ChecklistView = "ChecklistView",
  ChecklistCreate = 'ChecklistCreate',
  ChecklistEdit = 'ChecklistEdit',
  HiringServiceCreate = 'HiringServiceCreate',
  HiringServiceEdit = 'HiringServiceEdit',
  HiringServiceDelete = 'HiringServiceDelete',
  
  View = 'View',
  Edit = 'Edit',
  Create = 'Create',
  Delete = 'Delete',
  Export = 'Export',
  Share = 'Share',
  PreviewCertificate = 'PreviewCertificate',
  DownloadCertificate = 'DownloadCertificate',
}

export enum EFeatures {
  // Administration
  Tenants = 10,
  Owners = 11,
  Roles = 12,
  ReSellers = 13,
  
  // Sales
  Products = 20,
  Sale = 21,
  TodayOrders = 22,
  TodayOrdersStats = 23,

  // Inventory
  Available = 30,
  Entries = 31,
  TodayInventoryStats = 32,

  // Synchronization
  Send = 40,
  Download = 41,
  Receive = 42,

  // Reports
  TodayReports = 50,

  // Statistics
  Dashboard = 60,

  //Management
  Profile = 70,
  Users = 72,
  Stores = 73,
  Configurations = 74,
}

export enum EModules {
  Administration = 1,
  Sales = 2,
  Inventory = 3,
  Synchronization = 4,
  Reports = 5,
  Statistics = 6,
  Management = 7,
}

export enum ENotificationTemplateType {
  PercentageFeePackage = 3,
  PerMilesRate = 5,
  FixedRate = 7,
  ExtraPaymentRate = 9,
  DriverPaymentFrequency = 11,
  EscrowAccount = 13,
  MinLoadsForLayover = 15,
  EscrowRefundDaysAfterTermination = 17,
  MinDaysForDriverHold = 19
}

export enum SignatureProvider {
  EversingSandbox = 1,
  Eversing = 2,
}

export enum ERoles {
  SuperAdmin = 1,
  OwnerAdmin = 2,
  StoreUser = 3,
  ReSeller = 4,
}

export enum EMessageStatus {
  Created = 1,
  Sent = 2,
  Received = 3,
  Read = 4,
}