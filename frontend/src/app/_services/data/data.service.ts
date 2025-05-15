import { Inject, Injectable } from '@angular/core';
import { Product } from '../../domain/entities/products/product.model';
import { ProductCategory } from '../../domain/entities/product-categories/product-category.model';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, map, Observable, of } from 'rxjs';

@Injectable({
    providedIn: "root"
})
export class DataService {


    constructor(private http: HttpClient) { }

    async loadProducts(): Promise<Map<string, Product>> {
        return await firstValueFrom(this.http.get<Map<string, Product>>("/assets/data/products.json"));
    }

    async loadCategories(): Promise<Map<string, ProductCategory>> {
        return await firstValueFrom(this.http.get<Map<string, ProductCategory>>("assets/data/categories.json"));
    }
}