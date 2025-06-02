import { AuditableBaseModel } from 'src/app/_services/_models/base.model';
import { OrderItem } from './order-item.model';

export interface Order extends AuditableBaseModel {
    id: string;
    orderItems: OrderItem[];
    total: number;
    itemsCount: number;
    date: Date;
    type: OrderType;
    description: string;
}

export enum OrderType {
    Normal = 1,
    Mayorista = 2,
    Merma = 3,
    Otro = 100
}

export interface OrderTypeData {
    label: string;
    value: number;
}

export class OrderTypeUtils {
    static getOrderTypes(): OrderTypeData[] {
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