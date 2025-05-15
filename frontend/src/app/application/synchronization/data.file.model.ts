export interface DataFile {
    name: string,
    content: string,
}

export enum EDataFileName {
    Products = "products.json",
    Categories = "categories.json",
    InventoryEntries = "inventory-entries.json",
    Orders = "orders.json",
}