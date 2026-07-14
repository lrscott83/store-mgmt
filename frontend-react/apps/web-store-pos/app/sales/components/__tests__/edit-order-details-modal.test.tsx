import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { OrderType } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { EditOrderDetailsModal } from '../edit-order-details-modal';

// 1:1 port of Angular's EditOrderDetailsModalComponent (edit-order-details-modal.component.ts/
// .html). Angular's modal has NO live trigger anywhere in the app (dead code, see design doc) —
// this component mirrors it unwired, reusing the edit-product-category-modal.tsx controlled-
// modal pattern (overlay + local useState form + validate() + onClose prop, rule 5).
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

describe('EditOrderDetailsModal — 1:1 port of EditOrderDetailsModalComponent (unwired)', () => {
  beforeEach(() => {
    localStorage.clear();
    useCartStore.getState().clear();
  });

  it('prefills orderType and orderDescription from store', () => {
    useCartStore.getState().updateOrderDetails(OrderType.Mayorista, 'nota');
    render(
      <Wrapper>
        <EditOrderDetailsModal onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByTestId('edit-order-details-type-select')).toHaveValue(
      String(OrderType.Mayorista),
    );
    expect(screen.getByTestId('edit-order-details-description-textarea')).toHaveValue('nota');
  });

  it('valid submit calls updateOrderDetails with form values and closes', () => {
    const onClose = vi.fn();
    useCartStore.getState().updateOrderDetails(OrderType.Normal, '');
    render(
      <Wrapper>
        <EditOrderDetailsModal onClose={onClose} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-order-details-type-select'), {
      target: { value: String(OrderType.Mayorista) },
    });
    fireEvent.change(screen.getByTestId('edit-order-details-description-textarea'), {
      target: { value: 'entrega tarde' },
    });
    fireEvent.click(screen.getByTestId('edit-order-details-save'));

    expect(useCartStore.getState().orderType).toBe(OrderType.Mayorista);
    expect(useCartStore.getState().orderDescription).toBe('entrega tarde');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('missing required orderType blocks submit', () => {
    const onClose = vi.fn();
    useCartStore.getState().updateOrderDetails(OrderType.Normal, '');
    render(
      <Wrapper>
        <EditOrderDetailsModal onClose={onClose} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-order-details-type-select'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByTestId('edit-order-details-save'));

    expect(screen.getByText('Tipo de venta es requerido')).toBeInTheDocument();
    expect(useCartStore.getState().orderType).toBe(OrderType.Normal);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('empty description is valid', () => {
    const onClose = vi.fn();
    useCartStore.getState().updateOrderDetails(OrderType.Normal, '');
    render(
      <Wrapper>
        <EditOrderDetailsModal onClose={onClose} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-order-details-type-select'), {
      target: { value: String(OrderType.Ajuste) },
    });
    fireEvent.click(screen.getByTestId('edit-order-details-save'));

    expect(useCartStore.getState().orderType).toBe(OrderType.Ajuste);
    expect(useCartStore.getState().orderDescription).toBe('');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
