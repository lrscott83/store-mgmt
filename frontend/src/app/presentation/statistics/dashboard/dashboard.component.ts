import { Component } from '@angular/core';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexDataLabels,
  ApexStroke,
  ApexTitleSubtitle,
  ApexTooltip,
  ApexYAxis,
  NgApexchartsModule
} from 'ng-apexcharts';
import { SharedModule } from '../../shared/shared.module';
import { TranslationModule } from 'src/app/_modules/i18n/translation.module';
import { CurrencyData, CurrencyService } from 'src/app/application/entries/currency.service';
import { InventoryOfflineService } from 'src/app/application/entries/inventory-offline.service';
import { OrderOfflineService } from 'src/app/application/orders/order-offline.service';
import { LastMonthSaleProfitsComponent } from './last-month-sale-profits/last-month-sale-profits.component';
import { LastMonthSalesComponent } from './last-month-sales/last-month-sales.component';
import { BehaviorSubject } from 'rxjs';
import { TopProduct } from '../../_models/top-product.model';
import { ExpenseOfflineService } from 'src/app/application/expenses/expense-offline.service';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { AuthService } from 'src/app/_services/services.index';
import { AuthorizationService } from 'src/app/_services/authorization/authorization.service';
import { SaleCreditOfflineService } from 'src/app/application/credits/sale-credit-offline.service';

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  dataLabels?: ApexDataLabels;
  stroke?: ApexStroke;
  title?: ApexTitleSubtitle;
  tooltip?: ApexTooltip;
  yaxis?: ApexYAxis;
};

@Component({
    selector: 'app-dashboard',
    imports: [SharedModule, TranslationModule, NgApexchartsModule, LastMonthSaleProfitsComponent, LastMonthSalesComponent],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  currency: 'CUP' | 'USD';
  rate: number;

  currentUser: UserModel;
  hasExpensesModuleAvailable: boolean;
  hasCreditsModuleAvailable: boolean;

  salePriceToday: number = 0;
  salePriceYesterday: number = 0;

  saleProfitToday: number = 0;
  saleProfitYesterday: number = 0;

  expenseToday: number = 0;
  expenseYesterday: number = 0;

  margenBrutoMesActual: number = 0;
  margenBrutoMesAnterior: number = 0;

  inventoryCostTotal: number = 0;
  inventoryCostTotalYesterday: number = 0;

  unpaidSaleCreditsToday: number = 0;
  unpaidSaleCreditsYesterday: number = 0;

  topProfitProducts$: BehaviorSubject<TopProduct[]> = new BehaviorSubject<TopProduct[]>([]);
  topSaleQuantityProducts$: BehaviorSubject<TopProduct[]> = new BehaviorSubject<TopProduct[]>([]);

  valores = {
    ventasHoy: 2450,
    inventarioValorizado: 15300,
    ganancias: [120, 135, 150, 165], // 7, 30, 90, 365 días
    ventasSemana: [350, 400, 560, 480, 600, 700, 360]
  };

  ventasChartOptions: ChartOptions;
  gananciasChartOptions: ChartOptions;

  constructor(private currencyService: CurrencyService, private inventoryService: InventoryOfflineService, private orderService: OrderOfflineService, private expenseService: ExpenseOfflineService,
    private authService: AuthService,
    private authorizationService: AuthorizationService,
    private saleCreditService: SaleCreditOfflineService
  ) {
    this.currentUser = this.authService.currentUserValue;
    this.hasExpensesModuleAvailable = this.authorizationService.hasExpensesModuleAvailable();
    this.hasCreditsModuleAvailable = this.authorizationService.hasCreditsModuleAvailable();

    this.ventasChartOptions = this.getVentasChartOptions();
    this.gananciasChartOptions = this.getGananciasChartOptions();
    const currencyData: CurrencyData = this.currencyService.getCurrentCurrency();
    this.rate = currencyData.rate;
    this.currency = currencyData.currency;
    this.inventoryCostTotal = this.inventoryService.getInventoryCostTotal();
    this.inventoryCostTotalYesterday = this.inventoryService.getInventoryCostTotalYesterday();
    this.salePriceToday = this.orderService.getActiveOrdersPriceToday();
    this.salePriceYesterday = this.orderService.getActiveOrdersPriceYesterday();
    this.expenseToday = this.expenseService.getActiveExpensesPriceToday();
    this.expenseYesterday = this.expenseService.getActiveExpensesPriceYesterday();
    this.unpaidSaleCreditsToday = this.saleCreditService.getActiveUnpaidSaleCreditsPriceToday();
    this.unpaidSaleCreditsYesterday = this.saleCreditService.getActiveUnpaidSaleCreditsPriceYesterday();

    this.saleProfitToday = this.orderService.getActiveOrdersProfitToday();
    this.saleProfitYesterday = this.orderService.getActiveOrdersProfitYesterday();
    if (this.hasExpensesModuleAvailable) {
      this.saleProfitToday -= this.expenseToday;
      this.saleProfitYesterday -= this.expenseYesterday
    }

    this.topProfitProducts$.next(this.orderService.getTopProductsProfitInLastMonth());
    this.topSaleQuantityProducts$.next(this.orderService.getTopProductsSaleQuantityInLastMonth());

  }

  get divisor() {
    return this.currency === 'USD' ? this.rate : 1;
  }

  get sufijo() {
    return this.currency;
  }

  cambiarMoneda() {
    this.saveCurrency();
    this.updateCharts();
  }

  saveCurrency() {
    this.currencyService.setCurrency({ rate: this.rate, currency: this.currency });
  }

  updateCharts() {
    this.ventasChartOptions = this.getVentasChartOptions();
    this.gananciasChartOptions = this.getGananciasChartOptions();
  }

  getVentasChartOptions(): ChartOptions {
    return {
      series: [{
        name: `Ventas (${this.sufijo})`,
        data: this.valores.ventasSemana.map(v => +(v / this.divisor).toFixed(2))
      }],
      chart: { type: 'line', height: 300 },
      title: { text: 'Ventas Últimos 7 Días' },
      xaxis: { categories: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] },
      stroke: { curve: 'smooth' }
    };
  }

  getGananciasChartOptions(): ChartOptions {
    return {
      series: [{
        name: `Ganancia promedio (${this.sufijo})`,
        data: this.valores.ganancias.map(g => +(g / this.divisor).toFixed(2))
      }],
      chart: { type: 'bar', height: 300 },
      title: { text: 'Ganancias Promedio (últimos días)' },
      xaxis: { categories: ['7 días', '30 días', '90 días', '365 días'] }
    };
  }

  get salesToday() {
    return (this.salePriceToday / this.divisor).toFixed(2);
  }

  get profitsToday() {
    return (this.saleProfitToday / this.divisor).toFixed(2);
  }

  get expensesToday() {
    return (this.expenseToday / this.divisor).toFixed(2);
  }

  get inventarioTotal() {
    return (this.inventoryCostTotal / this.divisor).toFixed(2);
  }

  get unpaidSaleCreditsTotal() {
    return (this.unpaidSaleCreditsToday / this.divisor).toFixed(2);
  }

  getTrendClass(actual: number, anterior: number): string {
    if (actual === anterior)
      return 'text-secondary';
    return actual >= anterior ? 'text-success' : 'text-danger';
  }

  getTrendIcon(actual: number, anterior: number): string {
    if (actual === anterior)
      return 'bi bi-dash-lg';
    return actual >= anterior ? 'bi bi-caret-up-fill' : 'bi bi-caret-down-fill';
  }

  getInventoryCostIcon() {
    return this.getTrendIcon(this.inventoryCostTotal, this.inventoryCostTotalYesterday);
  }

  getInventoryCostClass() {
    return this.getTrendClass(this.inventoryCostTotal, this.inventoryCostTotalYesterday);
  }

  getSaleCreditsIcon() {
    return this.getTrendIcon(this.unpaidSaleCreditsToday, this.unpaidSaleCreditsYesterday);
  }

  getSaleCreditsClass() {
    return this.getTrendClass(this.unpaidSaleCreditsToday, this.unpaidSaleCreditsYesterday);
  }

  getSalePriceIcon() {
    return this.getTrendIcon(this.salePriceToday, this.salePriceYesterday);
  }

  getSalePriceClass() {
    return this.getTrendClass(this.salePriceToday, this.salePriceYesterday);
  }

  getExpenseIcon() {
    return this.getTrendIcon(this.expenseToday, this.expenseYesterday);
  }

  getExpenseClass() {
    return this.getTrendClass(this.expenseToday, this.expenseYesterday);
  }

  getSaleProfitIcon() {
    return this.getTrendIcon(this.saleProfitToday, this.saleProfitYesterday);
  }

  getSaleProfitClass() {
    return this.getTrendClass(this.saleProfitToday, this.saleProfitYesterday);
  }

  getMargenBrutoIcon() {
    return this.getTrendIcon(this.margenBrutoMesActual, this.margenBrutoMesAnterior);
  }

  getMargenBrutoClass() {
    return this.getTrendClass(this.margenBrutoMesActual, this.margenBrutoMesAnterior);
  }

  trendSalePrice() {
    return this.trendTexto(this.salePriceToday, this.salePriceYesterday, "vs ayer");
  }

  trendExpense() {
    return this.trendTexto(this.expenseToday, this.expenseYesterday, "vs ayer");
  }

  trendSaleProfit() {
    return this.trendTexto(this.saleProfitToday, this.saleProfitYesterday, "vs ayer");
  }

  trendMargenBruto() {
    return this.trendTexto(this.margenBrutoMesActual, this.margenBrutoMesAnterior, "vs mes pasado");
  }

  trendInventoryCost() {
    return this.trendTexto(this.inventoryCostTotal, this.inventoryCostTotalYesterday, "vs ayer");
  }

  trendUnpaidSaleCredits() {
    return this.trendTexto(this.unpaidSaleCreditsToday, this.unpaidSaleCreditsYesterday, "vs ayer");
  }

  trendTexto(actual: number, anterior: number, sufijo: string) {
    const diferencia = Math.abs(actual - anterior);
    return diferencia !== 0 ? `${(diferencia / this.divisor).toFixed(2)} ${sufijo}` : `0 ${sufijo}`;
  }

}
