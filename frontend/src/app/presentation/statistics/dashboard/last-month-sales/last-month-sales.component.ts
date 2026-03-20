import { Component, OnInit, ViewChild } from '@angular/core';
import { NgIf } from '@angular/common';
// import {
//   ApexAxisChartSeries,
//   ApexChart,
//   ApexXAxis,
//   ApexDataLabels,
//   ApexStroke,
//   ApexTitleSubtitle,
//   ApexTooltip,
//   ChartComponent,
//   NgApexchartsModule
// } from 'ng-apexcharts';
import { SharedModule } from 'src/app/presentation/shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { OrderOfflineService } from 'src/app/application/orders/order-offline.service';
import { ChartData } from 'src/app/presentation/_models/chart-data,model';

// export type ChartOptions = {
//   series: ApexAxisChartSeries;
//   chart: ApexChart;
//   xaxis: ApexXAxis;
//   dataLabels: ApexDataLabels;
//   stroke: ApexStroke;
//   title: ApexTitleSubtitle;
//   subtitle: ApexTitleSubtitle;
//   tooltip: ApexTooltip;
// };

@Component({
  selector: 'app-last-month-sales',
  imports: [SharedModule, TranslateModule, NgIf],
  templateUrl: './last-month-sales.component.html',
  styleUrl: './last-month-sales.component.scss'
})
export class LastMonthSalesComponent implements OnInit {
  // @ViewChild('chart') chart!: ChartComponent;
  // public chartOptions!: Partial<ChartOptions>;
  public labels: string[] = [];
  public data: number[] = [];

  constructor(private orderService: OrderOfflineService) {}

  ngOnInit(): void {
    const chartData: ChartData[] = this.orderService.getLastMonthSales();
    chartData.forEach((chart) => {
      this.labels.push(new Date(chart.label).getDate().toString());
      this.data.push(chart.value);
    });

    // this.chartOptions = {
    //   series: [
    //     {
    //       name: 'Venta diaria',
    //       data: data
    //     }
    //   ],
    //   chart: {
    //     height: 350,
    //     type: 'line',
    //     zoom: { enabled: false }
    //   },
    //   dataLabels: {
    //     enabled: false
    //   },
    //   stroke: {
    //     curve: 'smooth',
    //     width: 3
    //   },
    //   title: {
    //     text: 'Ventas - Últimos 30 Días',
    //     align: 'left',
    //     style: { fontSize: '16px', color: '#333' }
    //   },
    //   subtitle: {
    //     text: `Total: ${total.toFixed(2)} Promedio: ${(total / 30).toFixed(2)}`,
    //     style: {
    //       fontSize: '14px',
    //       color: '#6c757d',
    //       fontWeight: '500'
    //     }
    //   },
    //   xaxis: {
    //     categories: labels,
    //     labels: {
    //       // rotate: -45,
    //       formatter: (value: string) => {
    //         // Mostrar solo cada 3ro
    //         return Number.parseInt(value) % 3 === 0 ? value : '';
    //       }
    //     }
    //   },
    //   tooltip: {
    //     y: {
    //       formatter: (val: number) => `$${val} CUP`
    //     }
    //   }
    // };
  }

  get total(): number {
    return this.data.reduce((acc, val) => acc + val, 0);
  }

  get promedio(): number {
    return this.data.length > 0 ? this.total / 30 : 0;
  }
}
