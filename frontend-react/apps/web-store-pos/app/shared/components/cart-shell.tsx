import { useState } from 'react';
import { useIntl } from 'react-intl';
import { PaymentType } from '@store-mgmt/domain';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';

export function CartShell() {
  const intl = useIntl();
  const [isOpen, setIsOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    items,
    paymentType,
    isCredit,
    clientName,
    setPaymentType,
    setClientName,
    toggleCredit,
    updateQuantity,
    removeItem,
    clear,
    total,
  } = useCartStore();
  const user = useAuthStore((s) => s.user);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmount = total();
  const amountPaid = totalAmount; // Phase 1: no tendered amount input
  const change = amountPaid - totalAmount;

  async function handleCreateOrder() {
    setSubmitError(null);

    // Validation: items must not be empty
    if (items.length === 0) {
      setSubmitError(intl.formatMessage({ id: 'CART.EMPTY' }));
      return;
    }

    // Validation: credit sale requires client name
    if (isCredit && !clientName.trim()) {
      setSubmitError(intl.formatMessage({ id: 'CART.CLIENT_NAME_REQUIRED' }));
      return;
    }

    setIsSubmitting(true);
    try {
      const storeId = user?.selectedStoreId ?? '';
      const orderService = new OrderOfflineService(storeId);
      orderService.create(items, paymentType, isCredit, clientName.trim());
      clear();
      setIsOpen(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : intl.formatMessage({ id: 'GENERAL.ERROR' }));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative">
      {/* Cart button with badge */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label={intl.formatMessage({ id: 'CART.TITLE' })}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        {itemCount > 0 && (
          <span
            data-testid="cart-badge"
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white"
          >
            {itemCount > 99 ? '99+' : itemCount}
          </span>
        )}
      </button>

      {/* Cart dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800">
              {intl.formatMessage({ id: 'CART.TITLE' })}
            </h3>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 text-gray-400 hover:text-gray-600"
              aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Items */}
          <div className="max-h-64 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">
                {intl.formatMessage({ id: 'CART.EMPTY' })}
              </p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {items.map((item) => (
                  <li key={item.product.id} className="flex items-center gap-3 px-4 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800">{item.product.name}</p>
                      <p className="text-xs text-gray-500">${item.product.price.toFixed(2)}</p>
                    </div>
                    {/* Quantity controls */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs"
                        aria-label={`Decrease quantity of ${item.product.name}`}
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs"
                        aria-label={`Increase quantity of ${item.product.name}`}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.product.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      aria-label={`Remove ${item.product.name}`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Payment controls */}
          {items.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-3">
              {/* Payment type selector */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {intl.formatMessage({ id: 'CART.PAYMENT_TYPE' })}
                </label>
                <div className="flex gap-1">
                  {[PaymentType.Efectivo, PaymentType.Tarjeta, PaymentType.Zelle].map((type) => {
                    const label = type === PaymentType.Efectivo
                      ? intl.formatMessage({ id: 'CART.EFECTIVO' })
                      : type === PaymentType.Tarjeta
                      ? intl.formatMessage({ id: 'CART.TARJETA' })
                      : intl.formatMessage({ id: 'CART.ZELLE' });
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setPaymentType(type)}
                        className={`flex-1 rounded-md py-1 text-xs font-medium transition-colors ${
                          paymentType === type
                            ? 'bg-cyan-600 text-white'
                            : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Credit toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCredit}
                  onChange={toggleCredit}
                  className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                />
                <span className="text-xs font-medium text-gray-600">
                  {intl.formatMessage({ id: 'CART.CREDIT_SALE' })}
                </span>
              </label>

              {/* Client name for credit sales */}
              {isCredit && (
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder={intl.formatMessage({ id: 'CART.CLIENT_NAME' })}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              )}

              {/* Total / Change */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-gray-800">
                  {intl.formatMessage({ id: 'GENERAL.TOTAL' })}:
                </span>
                <span className="font-bold text-cyan-700">${totalAmount.toFixed(2)}</span>
              </div>
              {paymentType === PaymentType.Efectivo && change >= 0 && (
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{intl.formatMessage({ id: 'GENERAL.CHANGE' })}:</span>
                  <span>${change.toFixed(2)}</span>
                </div>
              )}

              {/* Clear cart */}
              <button
                type="button"
                onClick={clear}
                className="w-full rounded-lg border border-gray-300 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
              </button>

              {/* Submit error message */}
              {submitError && (
                <p className="text-xs text-red-600 text-center" role="alert">
                  {submitError}
                </p>
              )}

              {/* Create order button */}
              <button
                type="button"
                onClick={handleCreateOrder}
                disabled={isSubmitting}
                className="w-full rounded-lg bg-cyan-600 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting
                  ? intl.formatMessage({ id: 'GENERAL.LOADING' })
                  : intl.formatMessage({ id: 'CART.CREATE_ORDER' })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
