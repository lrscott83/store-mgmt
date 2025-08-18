import { Injectable } from "@angular/core";
import { ProductRepository } from "../products/product.repository";
import { ProductCategoryRepository } from "../categories/product-category.repository";
import { OrderOfflineService } from "../orders/order-offline.service";
import { InventoryOfflineService } from "../entries/inventory-offline.service";
import { DataFile, EDataFileName } from "./data.file.model";
import { Result } from "src/app/domain/commons/result";
import { SynchronizerErrors } from "./synchronizer.error";
import { BaseError } from "src/app/_services/_models/base.model";
import { Product } from "src/app/domain/entities/products/product.model";
import { ProductCategory } from "src/app/domain/entities/product-categories/product-category.model";
import { Order } from "src/app/domain/entities/orders/order.model";
import { InventoryEntry } from "src/app/domain/entities/entries/inventory-entry.model";
import { Expense } from "src/app/domain/entities/expenses/expense.model";
import { ExpenseOfflineService } from "../expenses/expense-offline.service";
import { SaleCredit } from "src/app/domain/entities/sale-credits/sale-credit.model";
import { SaleCreditOfflineService } from "../credits/sale-credit-offline.service";

@Injectable({
    providedIn: "root"
})

export class DataSynchronizerService {
    constructor(private productRepository: ProductRepository, private categoryRepository: ProductCategoryRepository, private orderService: OrderOfflineService, private inventoryService: InventoryOfflineService, private expenseService: ExpenseOfflineService, private saleCreditService: SaleCreditOfflineService) {

    }

    async synchronizeFiles(files: DataFile[]): Promise<Result> {
        const errors: BaseError[] = [];
        for (const file of files) {
            let result: Result;
            switch (file.name) {
                case EDataFileName.Products:
                    result = await this.synchronizeProducts(file.content);
                    if (!result.succeeded)
                        errors.push(...result.errors);
                    break;
                case EDataFileName.Categories:
                    result = await this.synchronizeCategories(file.content);
                    if (!result.succeeded)
                        errors.push(...result.errors);
                    break;
                case EDataFileName.InventoryEntries:
                    result = await this.synchronizeInventoryEntries(file.content);
                    if (!result.succeeded)
                        errors.push(...result.errors);
                    break;
                case EDataFileName.Orders:
                    result = await this.synchronizeOrders(file.content);
                    if (!result.succeeded)
                        errors.push(...result.errors);
                    break;
                case EDataFileName.Expenses:
                    result = await this.synchronizeExpenses(file.content);
                    if (!result.succeeded)
                        errors.push(...result.errors);
                    break;
                case EDataFileName.SaleCredits:
                    result = await this.synchronizeSaleCredits(file.content);
                    if (!result.succeeded)
                        errors.push(...result.errors);
                    break;
            }
        }
        return errors.length === 0 ? Result.Success() : Result.Failure(errors);
    }

    private async synchronizeProducts(content: string): Promise<Result> {
        try {
            if (!content) {
                console.warn("El contenido del fichero de los productos es nulo.");
                return Result.Success();
            }

            const importedProducts: Map<string, Product> = new Map(JSON.parse(content));
            //this.productRepository.updateProducts(new Map<string, Product>());
            const products: Map<string, Product> = this.productRepository.getStorageProductsMap();

            let result: Result = Result.Success();
            for (const product of Array.from(importedProducts.values()).sort((p1, p2) => p1.order - p2.order)) {
                if (products.has(product.id)) {
                    result = this.productRepository.updateImportedProduct(product);
                    if (!result.succeeded)
                        break;
                } else {
                    result = this.productRepository.addImportedProduct(product);
                    if (!result.succeeded)
                        break;
                }
            }
            if (!result.succeeded)
                this.productRepository.updateProducts(products);
            return result;

        } catch (error) {
            return Result.Failure([SynchronizerErrors.ProductsUnexpectedError]);
        }
    }

    private async synchronizeCategories(content: string): Promise<Result> {
        try {
            if (!content) {
                console.warn("El contenido del fichero de las categorías es nulo.");
                return Result.Success();
            }

            const importedCategories: Map<string, ProductCategory> = new Map(JSON.parse(content));
            //this.categoryRepository.updateCategories(new Map<string, ProductCategory>());
            const categories: Map<string, ProductCategory> = this.categoryRepository.getStorageCategoriesMap()
            //;

            let result: Result = Result.Success();
            for (const category of Array.from(importedCategories.values()).sort((c1, c2) => c1.order - c2.order)) {
                if (categories.has(category.id)) {
                    result = this.categoryRepository.updateImportedProductCategory(category);
                    if (!result.succeeded)
                        break;
                } else {
                    result = this.categoryRepository.addImportedProductCategory(category);
                    if (!result.succeeded)
                        break;
                }
            }
            if (!result.succeeded)
                this.categoryRepository.updateCategories(categories);
            return result;

        } catch (error) {
            return Result.Failure([SynchronizerErrors.CategoriesUnexpectedError]);
        }
    }

    private async synchronizeInventoryEntries(content: string): Promise<Result> {
        try {
            if (!content) {
                console.warn("El contenido del fichero de las entradas es nulo.");
                return Result.Success();
            }

            const importedEntries: Map<string, InventoryEntry[]> = new Map(JSON.parse(content));
            //this.productRepository.updateProducts(new Map<string, Product>());
            const inventories: Map<string, InventoryEntry[]> = this.inventoryService.getStorageInventoriesMap();

            let result: Result = Result.Success();
            for (const productEntries of Array.from(importedEntries.values())) {
                if (productEntries.length > 0) {
                    if (inventories.has(productEntries[0].productId)) {
                        result = this.inventoryService.updateImportedEntries(productEntries[0].productId, productEntries);
                        if (!result.succeeded)
                            break;
                    } else {
                        result = this.inventoryService.addImportedEntries(productEntries[0].productId, productEntries);
                        if (!result.succeeded)
                            break;
                    }
                }
            }
            // if (!result.succeeded)
            //     this.productRepository.updateProducts(products);
            return result;

        } catch (error) {
            return Result.Failure([SynchronizerErrors.InventoryUnexpectedError]);
        }
    }

    private async synchronizeOrders(content: string): Promise<Result> {
        try {
            if (!content) {
                console.warn("El contenido del fichero de las órdenes es nulo.");
                return Result.Success();
            }

            const importedOrders: Order[] = JSON.parse(content);
            //this.orderService.updateOrders(importedOrders);
            const orders: Order[] = this.orderService.getStorageOrders();
            const ordersMap: Map<string, Order> = new Map<string, Order>();
            orders.forEach(order => ordersMap.set(order.id, order));

            let result: Result = Result.Success();
            for (const order of importedOrders) {
                if (!ordersMap.has(order.id)) {
                    ordersMap.set(order.id, order);
                    result = this.orderService.addImportedOrder(order);
                    if (!result.succeeded)
                        break;
                } else {
                    result = this.orderService.updateImportedOrder(order);
                    if (!result.succeeded)
                        break;
                }
            }
            // if (!result.succeeded)
            //     this.orderService.updateOrders(orders);
            return result;

        } catch (error) {
            return Result.Failure([SynchronizerErrors.OrdersUnexpectedError]);
        }
    }

    private async synchronizeExpenses(content: string): Promise<Result> {
        try {
            if (!content) {
                console.warn("El contenido del fichero de los gastos es nulo.");
                return Result.Success();
            }

            const importedExpenses: Expense[] = JSON.parse(content);
            const expenses: Expense[] = this.expenseService.getStorageExpenses();
            const expensesMap: Map<string, Expense> = new Map<string, Expense>();
            expenses.forEach(expense => expensesMap.set(expense.id, expense));

            let result: Result = Result.Success();
            for (const expense of importedExpenses) {
                if (!expensesMap.has(expense.id)) {
                    expensesMap.set(expense.id, expense);
                    result = this.expenseService.addImportedExpense(expense);
                    if (!result.succeeded)
                        break;
                } else {
                    result = this.expenseService.updateImportedExpense(expense);
                    if (!result.succeeded)
                        break;
                }
            }
            return result;

        } catch (error) {
            return Result.Failure([SynchronizerErrors.OrdersUnexpectedError]);
        }
    }

    private async synchronizeSaleCredits(content: string): Promise<Result> {
        try {
            if (!content) {
                console.warn("El contenido del fichero de los créditos es nulo.");
                return Result.Success();
            }

            const importedSaleCredits: SaleCredit[] = JSON.parse(content);
            const expenses: SaleCredit[] = this.saleCreditService.getStorageSaleCredits();
            const expensesMap: Map<string, SaleCredit> = new Map<string, SaleCredit>();
            expenses.forEach(expense => expensesMap.set(expense.id, expense));

            let result: Result = Result.Success();
            for (const expense of importedSaleCredits) {
                if (!expensesMap.has(expense.id)) {
                    expensesMap.set(expense.id, expense);
                    result = this.saleCreditService.addImportedSaleCredit(expense);
                    if (!result.succeeded)
                        break;
                } else {
                    result = this.saleCreditService.updateImportedSaleCredit(expense);
                    if (!result.succeeded)
                        break;
                }
            }
            return result;

        } catch (error) {
            return Result.Failure([SynchronizerErrors.OrdersUnexpectedError]);
        }
    }
}