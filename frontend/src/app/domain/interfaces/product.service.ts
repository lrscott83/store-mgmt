import { Observable, of } from 'rxjs';
import { BaseService } from 'src/app/_services/base.service';
import { Product } from '../entities/products/product.model';
import { BaseResponseModel } from 'src/app/_services/_models/base.model';

// @Injectable({
//     providedIn: "root"
// })

export abstract class ProductService extends BaseService<Product> {

    abstract getProductsByCategoryId(categoryId: string): Observable<BaseResponseModel<Product[]>>;

    abstract getProductById(id: string): Observable<BaseResponseModel<Product>>;

    abstract createProduct(categoryId: string, name: string, price: number, businessId: string, order: number, isActive: boolean, availableToSale: boolean, discountFromInvantory: boolean): Observable<BaseResponseModel<boolean>>;

    abstract updateProduct(id: string, categoryId: string, name: string, price: number, businessId: string, order: number, isActive: boolean, availableToSale: boolean, discountFromInvantory: boolean): Observable<BaseResponseModel<boolean>>;

    abstract getMaxOrder(categoryId: string): Observable<BaseResponseModel<number>>;
}