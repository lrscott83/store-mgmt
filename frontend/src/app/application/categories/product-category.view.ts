import { ProductCategory } from "src/app/domain/entities/product-categories/product-category.model";

export interface ProductCategoryView extends ProductCategory {
    productsCount: number;
}