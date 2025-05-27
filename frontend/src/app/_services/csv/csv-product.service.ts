import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import * as Papa from 'papaparse';
import { CsvProduct } from './models/csv-product.model';

@Injectable({
  providedIn: 'root'
})
export class CsvProductService {
  parseCsv(file: File): Observable<CsvProduct[]> {
    return new Observable(observer => {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (result) => {
          const products = this.validateProducts(result.data);
          observer.next(products);
          observer.complete();
        },
        error: (error) => observer.error(error)
      });
    });
  }

  private validateProducts(data: any[]): CsvProduct[] {
    return data.filter(item => {
      return (
        item['category'] &&
        item['name'] &&
        typeof item['price'] === 'number'
      );
    });
  }
}