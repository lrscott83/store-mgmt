import { Injectable } from '@angular/core';
import { AuthService } from 'src/app/_services/services.index';
import { Product } from 'src/app/domain/entities/products/product.model';
import { ProductCategoryRepository } from '../categories/product-category.repository';
import { Result } from 'src/app/domain/commons/result';
import { ProductCategoryErrors } from 'src/app/domain/entities/product-categories/product-category.errors';
import { ProductErrors } from 'src/app/domain/entities/products/product.errors';
import { Guid } from 'guid-typescript';

@Injectable({
  providedIn: 'root'
})
export class ProductRepository {
  private static PRODUCTS_KEY: string = 'lizoft.store-products';
  private static USER_PRODUCTS_KEY: string = 'lizoft.store-products-';

  private lastUserProductsKey: string;

  private products: Map<string, Product> = null;

  constructor(
    private categoryRepository: ProductCategoryRepository,
    private authService: AuthService
  ) {}

  public updateProducts(productsMap: Map<string, Product>) {
    this.setProductsLocalStorage(productsMap);
    this.products = this.getProductsFromLocalStorage();
  }

  public setInitProducts(productsMap: Map<string, Product>) {
    const currentMap: Map<string, Product> = this.getStorageProductsMap();
    if (currentMap.size === 0) this.setProductsLocalStorage(productsMap);
  }

  public getStorageProductsMap(): Map<string, Product> {
    if (!this.products || this.products.size === 0 || this.getCurrentStorageKey() !== this.lastUserProductsKey)
      this.products = this.getProductsFromLocalStorage();
    return this.products;
  }

  private getStorageProducts(): Product[] {
    return [...this.getStorageProductsMap().values()];
  }

  public getAvailableProducts(): Product[] {
    return this.getStorageProducts().filter((p) => p.isActive);
  }

  getAvailableProductById(id: string): Product {
    const product: Product = this.getStorageProductsMap().get(id);
    return product && product.isActive ? product : null;
  }

  getProductById(id: string): Product {
    return this.getStorageProductsMap().get(id);
  }

  getProductByName(name: string): Product {
    return this.getStorageProducts().find((p) => p.name === name) || null;
  }

  getProductByBarcode(barcode: string): Product {
    if (!barcode) return null;
    return this.getStorageProducts().find((p) => p.barcode === barcode) || null;
  }

  hasAnyProduct(): boolean {
    return this.getStorageProductsMap().size > 0;
  }

  getProductsByCategoryId(categoryId: string): Product[] {
    return this.getStorageProducts()
      .filter((p) => p.categoryId == categoryId)
      .sort((p1, p2) => p1.order - p2.order);
  }

  getAvailableToSaleProductsByCategoryId(categoryId: string): Product[] {
    return this.getStorageProducts()
      .filter((p) => p.categoryId == categoryId && p.isActive && p.availableToSale)
      .sort((p1, p2) => p1.order - p2.order);
  }

  hasAnyAvailableToSaleProduct(): boolean {
    return this.categoryRepository.hasAnyAvailableCategory() && this.getStorageProducts().some((p) => p.isActive && p.availableToSale);
  }

  public deleteProduct(id: string): boolean {
    const product = this.getProductById(id);
    if (!product) return false;

    product.isActive = false;
    product.updatedDate = new Date();
    product.updatedByName = this.authService.currentUserValue.login;
    this.products = this.getStorageProductsMap();
    this.setProductsLocalStorage(this.products);
    return true;
  }

  addProductData(
    id: string,
    categoryId: string,
    name: string,
    price: number,
    businessId: string,
    order: number,
    isActive: boolean,
    availableToSale: boolean,
    discountFromInvantory: boolean,
    barcode?: string
  ): Result {
    const category = this.categoryRepository.getProductCategoryById(categoryId);
    if (!category) return Result.Failure([ProductCategoryErrors.NotExists]);

    if (barcode) {
      const existingProduct = this.getProductByBarcode(barcode);
      if (existingProduct) return Result.Failure([ProductErrors.BarcodeExists]);
    }

    const product = this.getStorageProducts().find((p) => p.categoryId === categoryId && p.name === name);
    if (product) return Result.Failure([ProductErrors.NameExists]);

    const newProduct: Product = {
      id: id,
      name: name,
      barcode: barcode,
      categoryId: categoryId,
      categoryName: category.name,
      price: price,
      businessId: businessId,
      isActive: isActive,
      createdDate: new Date(),
      createdByName: this.authService.currentUserValue.login,
      updatedDate: undefined,
      updatedByName: undefined,
      order: order,
      availableToSale: availableToSale,
      discountFromInvantory: discountFromInvantory
    };
    this.products = this.getStorageProductsMap();
    this.updateProductsOrderByCategory(this.products, categoryId, order);
    newProduct.order = order;
    this.products.set(newProduct.id, newProduct);
    this.setProductsLocalStorage(this.products);
    return Result.Success();
  }

  addProduct(
    categoryId: string,
    name: string,
    price: number,
    businessId: string,
    order: number,
    isActive: boolean,
    availableToSale: boolean,
    discountFromInvantory: boolean,
    barcode?: string
  ): Result {
    return this.addProductData(
      Guid.create().toString(),
      categoryId,
      name,
      price,
      businessId,
      order,
      isActive,
      availableToSale,
      discountFromInvantory,
      barcode
    );
  }

  addImportedProduct(product: Product): Result {
    return this.addProductData(
      product.id,
      product.categoryId,
      product.name,
      product.price,
      product.businessId,
      product.order,
      product.isActive,
      product.availableToSale,
      product.discountFromInvantory
    );
  }

  private updateProductsOrderByCategory(products: Map<string, Product>, categoryId: string, order: number) {
    products.forEach((product, id) => {
      if (product.categoryId === categoryId && product.order >= order) product.order = product.order + 1;
    });
  }

  updateProduct(
    id: string,
    categoryId: string,
    name: string,
    price: number,
    businessId: string,
    order: number,
    isActive: boolean,
    availableToSale: boolean,
    discountFromInvantory: boolean,
    barcode?: string,
    updatedDate: Date = new Date(),
    updatedByName: string = this.authService.currentUserValue.login
  ): Result {
    const category = this.categoryRepository.getProductCategoryById(categoryId);
    if (!category) return Result.Failure([ProductCategoryErrors.NotExists]);

    const product = this.getProductById(id);
    if (!product) return Result.Failure([ProductErrors.NotExists]);

    if (barcode && barcode !== product.barcode) {
      const existingProduct = this.getProductByBarcode(barcode);
      if (existingProduct && existingProduct.id !== id) {
        return Result.Failure([ProductErrors.BarcodeExists]);
      }
    }

    const otherProductWithSameName = this.getStorageProducts().find((p) => p.categoryId === categoryId && p.name === name && p.id !== id);
    if (otherProductWithSameName) return Result.Failure([ProductErrors.NameExists]);

    product.order = order;
    product.businessId = businessId;
    product.categoryId = categoryId;
    product.categoryName = category.name;
    product.price = price;
    product.name = name;
    product.barcode = barcode;
    product.isActive = isActive;
    product.availableToSale = availableToSale;
    product.discountFromInvantory = discountFromInvantory;
    product.updatedDate = updatedDate;
    product.updatedByName = updatedByName;

    this.products = this.getStorageProductsMap();
    this.updateProductsOrderByCategory(this.products, categoryId, order);
    product.order = order;

    this.setProductsLocalStorage(this.products);
    return Result.Success();
  }

  updateImportedProduct(product: Product): Result {
    return this.updateProduct(
      product.id,
      product.categoryId,
      product.name,
      product.price,
      product.businessId,
      product.order,
      product.isActive,
      product.availableToSale,
      product.discountFromInvantory,
      product.barcode,
      product.updatedDate,
      product.updatedByName
    );
  }

  setDiscountFromInvantory(id: string, discountFromInvantory: boolean): Result {
    const product = this.getProductById(id);
    if (!product) return Result.Failure([ProductErrors.NotExists]);

    product.discountFromInvantory = discountFromInvantory;
    this.setProductsLocalStorage(this.products);
    return Result.Success();
  }

  private updateProductActive(id: string, isActive: boolean): Result {
    const product = this.getProductById(id);
    if (!product) return Result.Failure([ProductErrors.NotExists]);

    product.isActive = isActive;
    this.setProductsLocalStorage(this.products);
    return Result.Success();
  }

  activateProduct(id: string): Result {
    return this.updateProductActive(id, true);
  }

  deactivateProduct(id: string): Result {
    return this.updateProductActive(id, false);
  }

  private setProductsLocalStorage(products: Map<string, Product>) {
    const productMapJson = JSON.stringify(Array.from(products.entries()));
    localStorage.setItem(this.getStorageKey(), productMapJson);
  }

  private getStorageKey() {
    this.lastUserProductsKey = this.getCurrentStorageKey();
    return this.lastUserProductsKey;
  }

  private getCurrentStorageKey() {
    return ProductRepository.USER_PRODUCTS_KEY + this.authService.currentUserValue.selectedStoreId;
  }

  getProductsJson(): string {
    return localStorage.getItem(this.getStorageKey());
  }

  private getProductsFromLocalStorage(): Map<string, Product> {
    try {
      const productMapJson = localStorage.getItem(this.getStorageKey());
      if (productMapJson && productMapJson !== '{}') {
        return new Map(JSON.parse(productMapJson));
      }
      // else {
      //     productMapJson = localStorage.getItem(ProductRepository.PRODUCTS_KEY);
      //     if (productMapJson && productMapJson !== "{}") {
      //         this.products = new Map(JSON.parse(productMapJson));
      //         this.setProductsLocalStorage(this.products);
      //         return this.products;
      //     }
      // }
    } catch (ignore) {}
    const products: Map<string, Product> = new Map<string, Product>();
    // const product11: Product = {
    //     id: "11",
    //     name: "Trio Chocolate",
    //     categoryId: "1",
    //     categoryName: "Galletas Dulces",
    //     price: 40,
    //     order: 1,
    //     availableToSale: true,
    //     discountFromInvantory: true,
    //     businessId: "",
    //     isActive: true,
    //     createdDate:  new Date(),
    //     createdByName: "admin"
    // };
    // products.set(product11.id, product11);

    // const product12: Product = {
    //     id: "12",
    //     name: "Escolar Vainilla",
    //     categoryId: "1",
    //     categoryName: "Galletas Dulces",
    //     price: 35,
    //     order: 2,
    //     availableToSale: true,
    //     discountFromInvantory: true,
    //     businessId: "",
    //     isActive: true,
    //     createdDate:  new Date(),
    //     createdByName: "admin"
    // };
    // products.set(product12.id, product12);

    // const product13: Product = {
    //     id: "13",
    //     name: "Escolar Fresa",
    //     categoryId: "1",
    //     categoryName: "Galletas Dulces",
    //     price: 35,
    //     order: 3,
    //     availableToSale: true,
    //     discountFromInvantory: true,
    //     businessId: "",
    //     isActive: true,
    //     createdDate:  new Date(),
    //     createdByName: "admin"
    // };
    // products.set(product13.id, product13);

    // const product14: Product = {
    //     id: "14",
    //     name: "Muuu",
    //     categoryId: "1",
    //     categoryName: "Galletas Dulces",
    //     price: 60,
    //     order: 4,
    //     availableToSale: true,
    //     discountFromInvantory: true,
    //     businessId: "",
    //     isActive: true,
    //     createdDate:  new Date(),
    //     createdByName: "admin"
    // };
    // products.set(product14.id, product14);

    // const product21: Product = {
    //     id: "21",
    //     name: "Soda",
    //     categoryId: "2",
    //     categoryName: "Galletas Saladas",
    //     price: 60,
    //     order: 1,
    //     availableToSale: true,
    //     discountFromInvantory: true,
    //     businessId: "",
    //     isActive: true,
    //     createdDate:  new Date(),
    //     createdByName: "admin"
    // };
    // products.set(product21.id, product21);

    // const product22: Product = {
    //     id: "22",
    //     name: "Pinocho",
    //     categoryId: "2",
    //     categoryName: "Galletas Saladas",
    //     price: 50,
    //     order: 2,
    //     availableToSale: true,
    //     discountFromInvantory: true,
    //     businessId: "",
    //     isActive: true,
    //     createdDate:  new Date(),
    //     createdByName: "admin"
    // };
    // products.set(product22.id, product22);

    // const product31: Product = {
    //     id: "31",
    //     name: "BigBom Fresa",
    //     categoryId: "3",
    //     categoryName: "Chupachupas",
    //     price: 40,
    //     order: 1,
    //     availableToSale: true,
    //     discountFromInvantory: true,
    //     businessId: "",
    //     isActive: true,
    //     createdDate:  new Date(),
    //     createdByName: "admin"
    // };
    // products.set(product31.id, product31);

    // const product32: Product = {
    //     id: "32",
    //     name: "BigBom Mango",
    //     categoryId: "3",
    //     categoryName: "Chupachupas",
    //     price: 40,
    //     order: 2,
    //     availableToSale: true,
    //     discountFromInvantory: true,
    //     businessId: "",
    //     isActive: true,
    //     createdDate:  new Date(),
    //     createdByName: "admin"
    // };
    // products.set(product32.id, product32);

    // const product33: Product = {
    //     id: "33",
    //     name: "BigBom Chocolate",
    //     categoryId: "3",
    //     categoryName: "Chupachupas",
    //     price: 40,
    //     order: 3,
    //     availableToSale: true,
    //     discountFromInvantory: true,
    //     businessId: "",
    //     isActive: true,
    //     createdDate:  new Date(),
    //     createdByName: "admin"
    // };
    // products.set(product33.id, product33);

    // const product41: Product = {
    //     id: "41",
    //     name: "Cristal",
    //     categoryId: "4",
    //     categoryName: "Cervezas",
    //     price: 250,
    //     order: 1,
    //     availableToSale: true,
    //     discountFromInvantory: true,
    //     businessId: "",
    //     isActive: true,
    //     createdDate:  new Date(),
    //     createdByName: "admin"
    // };
    // products.set(product41.id, product41);

    // const product42: Product = {
    //     id: "42",
    //     name: "Bucanero",
    //     categoryId: "4",
    //     categoryName: "Cervezas",
    //     price: 200,
    //     order: 2,
    //     availableToSale: true,
    //     discountFromInvantory: true,
    //     businessId: "",
    //     isActive: true,
    //     createdDate:  new Date(),
    //     createdByName: "admin"
    // };
    // products.set(product42.id, product42);

    this.setProductsLocalStorage(products);
    return products;
  }
}
