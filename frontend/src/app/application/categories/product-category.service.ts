import { Observable, of } from 'rxjs';
import { BaseService } from 'src/app/_services/base.service';
import { BaseResponseModel } from 'src/app/_services/_models/base.model';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { ProductCategoryView } from './product-category.view';

// @Injectable({
//     providedIn: "root"
// })

export abstract class ProductCategoryService extends BaseService<ProductCategory> {

    abstract getProductCategoriesView(): Observable<BaseResponseModel<ProductCategoryView[]>>

    //abstract getProductCategories(): Observable<BaseResponseModel<ProductCategory[]>>;

    abstract getAvailableProductCategories(): Observable<BaseResponseModel<ProductCategory[]>>;

    //abstract updateProductCategories(categories: ProductCategory[]): Observable<BaseResponseModel<boolean>>;

    //abstract getProductCategoryById(categoryId: string): Observable<BaseResponseModel<ProductCategory>>;

    abstract createProductCategory(name: string, order: number, isActive: boolean): Observable<BaseResponseModel<boolean>>;

    abstract updateProductCategory(id: string, name: string, order: number, isActive: boolean): Observable<BaseResponseModel<boolean>>;

    abstract getMaxOrder(): Observable<BaseResponseModel<number>>;
}