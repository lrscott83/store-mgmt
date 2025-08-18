import { AuditableBaseModel } from 'src/app/_services/_models/base.model';
import { OrderItem } from './order-item.model';
import { TypeData } from '../../commons/type-data';
import { PaymentType } from '../../commons/payment-type';

export interface Order extends AuditableBaseModel {
    id: string;
    orderItems: OrderItem[];
    total: number;
    itemsCount: number;
    date: Date;
    type: OrderType;
    paymentType: PaymentType;
    isCredit: boolean;
    description: string;
}

export enum OrderType {
    Normal = 1,
    Mayorista = 2,
    Merma = 3,
    Ajuste = 4,
    Otro = 100
}

export class OrderTypeUtils {
    static getOrderTypes(): TypeData[] {
        return Object.keys(OrderType)
            .filter(key => isNaN(Number(key)))
            .map(key => ({
                label: key,
                value: OrderType[key as keyof typeof OrderType]
            }));
    }

    static getOrderTypeText(orderType: OrderType): string {
        // const entry = Object.entries(OrderType).find(([_, v]) => v === this.orderType);
        // return entry?.[0];
        return OrderTypeUtils.getOrderTypes()
            .find(type => type.value === orderType)
            ?.label;
    }
}

export interface ProductoVenta {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface DatosVenta {
  folio: string;
  fecha: string; // formato: YYYY-MM-DD
  status: string;
  formaPago: string;
  productos: ProductoVenta[];
  total: number;
  pagos: number;
  deuda: number;
}