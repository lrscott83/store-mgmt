import { Observable, of } from 'rxjs';
import { BaseService } from 'src/app/_services/base.service';
import { Product } from '../entities/products/product.model';
import { BaseResponseModel } from 'src/app/_services/_models/base.model';
import { ProductSelectView } from 'src/app/application/products/product-select.view';
import { CsvProduct } from 'src/app/_services/csv/models/csv-product.model';

// @Injectable({
//     providedIn: "root"
// })

export abstract class ProductService extends BaseService<Product> {

    abstract hasAnyAvailableToSaleProduct(): Observable<BaseResponseModel<boolean>>;
    abstract getProductById(id: string): Observable<BaseResponseModel<Product>>;
    abstract getProductsToSelect(): Observable<BaseResponseModel<ProductSelectView[]>>;
    abstract getAvailableProductsByCategoryId(categoryId: string): Observable<BaseResponseModel<Product[]>>;
    abstract deleteProduct(id: string): Observable<BaseResponseModel<boolean>>;
    abstract createCsvProducts(csvProducts: CsvProduct[]): Observable<BaseResponseModel<boolean>>;

    abstract getProductsToSaleByCategoryId(categoryId: string): Observable<BaseResponseModel<Product[]>>;

    abstract createProduct(categoryId: string, name: string, price: number, businessId: string, order: number, isActive: boolean, availableToSale: boolean, discountFromInvantory: boolean): Observable<BaseResponseModel<boolean>>;

    abstract updateProduct(id: string, categoryId: string, name: string, price: number, businessId: string, order: number, isActive: boolean, availableToSale: boolean, discountFromInvantory: boolean): Observable<BaseResponseModel<boolean>>;

    abstract getMaxOrder(categoryId: string): Observable<BaseResponseModel<number>>;
    abstract createProducts(categoryId: string, items: { name, price }[]): Observable<BaseResponseModel<boolean>>;

    
}