import { SalePaymentMethod } from '@store-mgmt/domain';
import type { Currency } from '@store-mgmt/domain';
import { currencyLabel } from '~/shared/lib/format-money-with-currency';

/**
 * Channel-rates page label (payment-channels-and-multipayment, T19a).
 *
 * The shared `salePaymentMethodLabel` renders "Efectivo" and "Zelle" WITHOUT a
 * currency suffix, so on this page an `Efectivo · USD` row reads exactly like
 * the `Efectivo · CUP` row — the T18 misregistration. This LOCAL label always
 * appends the currency ("Efectivo (CUP)", "Zelle (USD)", "Transferencia (MLC)").
 *
 * The shared helper is deliberately NOT modified: the cart, the expense modal
 * and the credit modal must keep their current labels.
 */
const METHOD_LABEL_IDS: Record<SalePaymentMethod, string> = {
  [SalePaymentMethod.Efectivo]: 'CHANNEL_RATES.METHOD_EFECTIVO',
  [SalePaymentMethod.Zelle]: 'CHANNEL_RATES.METHOD_ZELLE',
  [SalePaymentMethod.Transferencia]: 'CHANNEL_RATES.METHOD_TRANSFERENCIA',
};

/** "Efectivo (CUP)", "Zelle (USD)", "Transferencia (MLC)"… — currency always shown. */
export function channelLabel(
  method: SalePaymentMethod,
  currency: Currency | number,
  formatMessage: (id: string) => string,
): string {
  return `${formatMessage(METHOD_LABEL_IDS[method])} (${currencyLabel(currency)})`;
}
