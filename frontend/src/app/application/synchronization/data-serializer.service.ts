import { Injectable } from "@angular/core";
import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { DataFile, EDataFileName } from "./data.file.model";
import { ProductRepository } from "../products/product.repository";
import { ProductCategoryRepository } from "../categories/product-category.repository";
import { OrderOfflineService } from "../orders/order-offline.service";
import { InventoryOfflineService } from "../entries/inventory-offline.service";
import { ExpenseOfflineService } from "../expenses/expense-offline.service";
import { SaleCreditOfflineService } from "../credits/sale-credit-offline.service";
import { AuthService } from "src/app/_services/services.index";

@Injectable({
    providedIn: "root"
})

export class DataSerializerService {
    constructor(private productRepository: ProductRepository, private categoryRepository: ProductCategoryRepository, private orderService: OrderOfflineService, private inventoryService: InventoryOfflineService, private expenseService: ExpenseOfflineService, private saleCreditService: SaleCreditOfflineService, private authService: AuthService) {

    }

    async deserializeEncryptedZip(fileToUpload: File, password: string): Promise<DataFile[]> {
        try {
            const zipReader = new ZipReader(new BlobReader(fileToUpload),
                {
                    password: password + this.authService.currentUserValue.selectedStoreId,
                });

            // Obtener lista de entradas
            const entries = await zipReader.getEntries();
            
            // Extraer y leer contenido de cada archivo
            let files: DataFile[] = [];
            for (const entry of entries) {
                if (!entry.directory) {
                    const text = await entry.getData(new TextWriter());
                    if (entry.filename === EDataFileName.Categories)
                        files = [{name: entry.filename, content: text}, ...files];
                    else
                        files.push({name: entry.filename, content: text});
                }
            }

            await zipReader.close();
            return files;
        } catch (error) {
            console.error('Error al descomprimir:', error);
            alert('Error al descomprimir - Verifica la contraseña y el archivo');
            return [];
        }
    }

    async serializeEncryptedZip(password: string) {
        try {
            const files: DataFile[] = this.getDataFiles();
            const zipWriter = new ZipWriter(new BlobWriter('application/zip'), {
                password: password + this.authService.currentUserValue.selectedStoreId
            });

            // Añadir archivos al ZIP
            for (const file of files) {
                await zipWriter.add(file.name, new TextReader(file.content));
            }

            // Generar el Blob del ZIP
            const blob = await zipWriter.close();

            // Descargar el archivo
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = this.generateFileName();
            link.click();
            URL.revokeObjectURL(link.href);

        } catch (error) {
            console.error('Error:', error);
            alert('Error al generar el ZIP');
        }
    }

    private getDataFiles(): DataFile[] {
        const files: DataFile[] = [];
        files.push({ name: EDataFileName.Categories, content: this.categoryRepository.getCategoriesJson() });
        files.push({ name: EDataFileName.Products, content: this.productRepository.getProductsJson() });
        files.push({ name: EDataFileName.InventoryEntries, content: this.inventoryService.getInventoryEntriesJson() });
        files.push({ name: EDataFileName.Orders, content: this.orderService.getOrdersJson() });
        files.push({ name: EDataFileName.Expenses, content: this.expenseService.getExpensesJson() });
        files.push({ name: EDataFileName.SaleCredits, content: this.saleCreditService.getSaleCreditsJson() });
        return files;
    }

    private generateFileName(): string {
        const now = new Date();
        return [
            'datos',
            now.getFullYear().toString().slice(-2),
            this.pad(now.getMonth() + 1),
            this.pad(now.getDate()),
            '-',
            this.pad(now.getHours()),
            this.pad(now.getMinutes())
        ].join('') + '.zip';
    }

    private pad(n: number): string {
        return n.toString().padStart(2, '0');
    }
}