
import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import {
  ApexNonAxisChartSeries,
  ApexChart,
  ApexPlotOptions,
  ApexDataLabels,
  ApexFill,
  ApexStroke,
  ApexLegend,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  NgApexchartsModule
} from 'ng-apexcharts';
import { TranslateModule } from '@ngx-translate/core';
import { UsageService } from 'src/app/_services/usage/usage.service';
import { catchError } from 'rxjs';

export type ChartOptions = {
  series: ApexNonAxisChartSeries | any[];
  chart: ApexChart;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  fill: ApexFill;
  stroke: ApexStroke;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
};

@Component({
    selector: 'app-admin-dashboard',
    imports: [
    SharedModule,
    NgApexchartsModule,
    TranslateModule
],
    templateUrl: './admin-dashboard.component.html',
    styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit {
  public chartOptions: Partial<ChartOptions> | any;
  public viewType: '7days' | '30days' = '7days';
  public totalTiendas = 1000; // Total de tiendas del sistema

  constructor(private usageService: UsageService) { }

  ngOnInit(): void {
    this.initializeChart();
    this.loadData();
  }

  initializeChart(): void {
    this.chartOptions = {
      series: [
        {
          name: "Tiendas Activas",
          data: []
        }
      ],
      chart: {
        type: "bar",
        height: 350
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: "55%",
          endingShape: "rounded"
        }
      },
      dataLabels: {
        enabled: true,
        formatter: (val: number) => {
          const porcentaje = (val / this.totalTiendas) * 100;
          return porcentaje.toFixed(1) + "%";
        },
        offsetY: -20,
        style: {
          fontSize: '12px',
          colors: ["#304758"]
        }
      },
      stroke: {
        show: true,
        width: 2,
        colors: ["transparent"]
      },
      xaxis: {
        categories: [],
        labels: {
          rotate: 0
        }
      },
      yaxis: {
        title: {
          text: "Cantidad de Tiendas"
        },
        labels: {
          formatter: function (val: number) {
            return Math.round(val).toString();
          }
        }
      },
      fill: {
        opacity: 1,
        colors: ['#3498db']
      },
      tooltip: {
        y: {
          formatter: (val: number) => {
            const porcentaje = (val / this.totalTiendas) * 100;
            return `${Math.round(val)} tiendas (${porcentaje.toFixed(1)}%)`;
          }
        }
      }
    };
  }

  getDiasSemana(): string[] {
    const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const hoy = new Date();
    const diaHoy = hoy.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado

    // Convertir a nuestro sistema: 0 = Lunes, 6 = Domingo
    let diaAjustado;
    if (diaHoy === 0) {
      diaAjustado = 6; // Domingo
    } else if (diaHoy === 1) {
      diaAjustado = 0; // Lunes
    } else {
      diaAjustado = diaHoy - 1; // Martes = 1, Miércoles = 2, etc.
    }

    // Crear array con los últimos 7 días terminando en hoy
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
    let categories: string[] = [];
    const data: number[] = [];

    if (this.viewType === '7days') {
      categories = this.getDiasSemana();
      this.usageService.getLastWeekUsageDaysCount()
        .pipe(catchError((error) => {
          throw error;
        }))
        .subscribe(async response => {
          if (response && response.succeeded) {
            this.totalTiendas = response.data.activeStoreCount;
            this.setChartOptions(categories, response.data.storeUsagesCountDays);
          }
        });
    } else {
      categories = this.getDias30();
      // Generar datos para 30 días
      this.usageService.getLastMonthUsageDaysCount()
        .pipe(catchError((error) => {
          throw error;
        }))
        .subscribe(async response => {
          if (response && response.succeeded) {
            this.totalTiendas = response.data.activeStoreCount;
            this.setChartOptions(categories, response.data.storeUsagesCountDays);
          }
        });
    }
  }

  setChartOptions(categories: string[], data: number[]) {
    // Actualizar las opciones del gráfico
    this.chartOptions = {
      ...this.chartOptions,
      xaxis: {
        ...this.chartOptions.xaxis,
        categories: categories,
        tickAmount: this.viewType === '30days' ? 10 : undefined
      },
      series: [
        {
          name: "Tiendas Activas",
          data
        }
      ]
    };
  }

  changeView(view: '7days' | '30days'): void {
    this.viewType = view;
    this.loadData();
  }

  // Calcular estadísticas
  getTotalTiendas(): number {
    if (this.chartOptions && this.chartOptions.series && this.chartOptions.series[0]) {
      return this.chartOptions.series[0].data.reduce((sum: number, val: number) => sum + val, 0);
    }
    return 0;
  }

  getAverageTiendas(): number {
    if (this.chartOptions && this.chartOptions.series && this.chartOptions.series[0]) {
      const total = this.getTotalTiendas();
      const count = this.chartOptions.series[0].data.length;
      return count > 0 ? total / count : 0;
    }
    return 0;
  }

  getMaxTiendas(): number {
    if (this.chartOptions && this.chartOptions.series && this.chartOptions.series[0]) {
      return Math.max(...this.chartOptions.series[0].data);
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
