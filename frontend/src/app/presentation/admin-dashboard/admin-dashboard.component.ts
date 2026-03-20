import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
// import {
//   ApexNonAxisChartSeries,
//   ApexChart,
//   ApexPlotOptions,
//   ApexDataLabels,
//   ApexFill,
//   ApexStroke,
//   ApexLegend,
//   ApexTooltip,
//   ApexXAxis,
//   ApexYAxis,
//   NgApexchartsModule
// } from 'ng-apexcharts';
import { TranslateModule } from '@ngx-translate/core';
import { UsageService } from 'src/app/_services/usage/usage.service';
import { catchError } from 'rxjs';

// export type ChartOptions = {
//   series: ApexNonAxisChartSeries | any[];
//   chart: ApexChart;
//   dataLabels: ApexDataLabels;
//   plotOptions: ApexPlotOptions;
//   fill: ApexFill;
//   stroke: ApexStroke;
//   legend: ApexLegend;
//   tooltip: ApexTooltip;
//   xaxis: ApexXAxis;
//   yaxis: ApexYAxis;
// };

@Component({
  selector: 'app-admin-dashboard',
  imports: [SharedModule, TranslateModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit {
  // public chartOptions: Partial<ChartOptions> | any;
  public viewType: '7days' | '30days' = '7days';
  public totalTiendas = 1000;
  public categories: string[] = [];
  public data: number[] = [];

  constructor(private usageService: UsageService) {}

  ngOnInit(): void {
    // this.initializeChart();
    this.loadData();
  }

  // initializeChart(): void {
  //   this.chartOptions = {
  //     series: [
  //       {
  //         name: "Tiendas Activas",
  //         data: []
  //       }
  //     ],
  //     chart: {
  //       type: "bar",
  //       height: 350
  //     },
  //     plotOptions: {
  //       bar: {
  //         horizontal: false,
  //         columnWidth: "55%",
  //         endingShape: "rounded"
  //       }
  //     },
  //     dataLabels: {
  //       enabled: true,
  //       formatter: (val: number) => {
  //         const porcentaje = (val / this.totalTiendas) * 100;
  //         return porcentaje.toFixed(1) + "%";
  //       },
  //       offsetY: -20,
  //       style: {
  //         fontSize: '12px',
  //         colors: ["#304758"]
  //       }
  //     },
  //     stroke: {
  //       show: true,
  //       width: 2,
  //       colors: ["transparent"]
  //     },
  //     xaxis: {
  //       categories: [],
  //       labels: {
  //         rotate: 0
  //       }
  //     },
  //     yaxis: {
  //       title: {
  //         text: "Cantidad de Tiendas"
  //       },
  //       labels: {
  //         formatter: function (val: number) {
  //           return Math.round(val).toString();
  //         }
  //       }
  //     },
  //     fill: {
  //       opacity: 1,
  //       colors: ['#3498db']
  //     },
  //     tooltip: {
  //       y: {
  //         formatter: (val: number) => {
  //           const porcentaje = (val / this.totalTiendas) * 100;
  //           return `${Math.round(val)} tiendas (${porcentaje.toFixed(1)}%)`;
  //         }
  //       }
  //     }
  //   };
  // }

  getDiasSemana(): string[] {
    const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const hoy = new Date();
    const diaHoy = hoy.getDay();

    let diaAjustado;
    if (diaHoy === 0) {
      diaAjustado = 6;
    } else if (diaHoy === 1) {
      diaAjustado = 0;
    } else {
      diaAjustado = diaHoy - 1;
    }

    const resultado: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const indice = (diaAjustado - i + 7) % 7;
      resultado.push(dias[indice]);
    }

    return resultado;
  }

  getDias30(): string[] {
    return Array.from({ length: 30 }, (_, i) => `${i + 1}`);
  }

  loadData(): void {
    this.categories = [];
    this.data = [];

    if (this.viewType === '7days') {
      this.categories = this.getDiasSemana();
      this.usageService
        .getLastWeekUsageDaysCount()
        .pipe(
          catchError((error) => {
            throw error;
          })
        )
        .subscribe(async (response) => {
          if (response && response.succeeded) {
            this.totalTiendas = response.data.activeStoreCount;
            this.setChartData(this.categories, response.data.storeUsagesCountDays);
          }
        });
    } else {
      this.categories = this.getDias30();
      this.usageService
        .getLastMonthUsageDaysCount()
        .pipe(
          catchError((error) => {
            throw error;
          })
        )
        .subscribe(async (response) => {
          if (response && response.succeeded) {
            this.totalTiendas = response.data.activeStoreCount;
            this.setChartData(this.categories, response.data.storeUsagesCountDays);
          }
        });
    }
  }

  setChartData(categories: string[], data: number[]) {
    this.categories = categories;
    this.data = data;
  }

  changeView(view: '7days' | '30days'): void {
    this.viewType = view;
    this.loadData();
  }

  getTotalTiendas(): number {
    if (this.data && this.data.length > 0) {
      return this.data.reduce((sum, val) => sum + val, 0);
    }
    return 0;
  }

  getAverageTiendas(): number {
    if (this.data && this.data.length > 0) {
      const total = this.getTotalTiendas();
      const count = this.data.length;
      return count > 0 ? total / count : 0;
    }
    return 0;
  }

  getMaxTiendas(): number {
    if (this.data && this.data.length > 0) {
      return Math.max(...this.data);
    }
    return 0;
  }

  getPorcentajePromedio(): number {
    const promedio = this.getAverageTiendas();
    return (promedio / this.totalTiendas) * 100;
  }

  getPorcentajeMaximo(): number {
    const maximo = this.getMaxTiendas();
    return (maximo / this.totalTiendas) * 100;
  }
}
