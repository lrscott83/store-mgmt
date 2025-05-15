import { AuditableBaseModel } from 'src/app/_services/_models/base.model';
import { OrderItem } from './order-item.model';

export interface Order extends AuditableBaseModel {
    id: string;
    orderItems: OrderItem[];
    total: number;
    itemsCount: number;
    date: Date;
}