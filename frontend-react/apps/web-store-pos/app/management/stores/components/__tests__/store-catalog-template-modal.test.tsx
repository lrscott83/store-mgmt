import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { StoreCatalogTemplateModal } from '~/management/stores/components/store-catalog-template-modal';

function renderModal(overrides: Partial<Parameters<typeof StoreCatalogTemplateModal>[0]> = {}) {
  const props = {
    open: true,
    storeId: 's1',
    storeName: 'Tienda Ana',
    value: 'default',
    loading: false,
    saving: false,
    loadFailed: false,
    error: '',
    onChange: vi.fn(),
    onClose: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
  const result = render(
    <IntlProvider locale="es" messages={esMessages}>
      <StoreCatalogTemplateModal {...props} />
    </IntlProvider>,
  );
  return { props, ...result };
}

describe('StoreCatalogTemplateModal', () => {
  it('no pinta nada cuando está cerrado', () => {
    renderModal({ open: false, storeId: null });

    expect(screen.queryByTestId('store-catalog-template-modal-s1')).not.toBeInTheDocument();
  });

  it('pinta el nombre de la tienda y las plantillas disponibles', () => {
    renderModal();

    expect(screen.getByTestId('store-catalog-template-store-name')).toHaveTextContent('Tienda Ana');
    const select = screen.getByTestId('store-catalog-template-select') as HTMLSelectElement;
    expect(select.value).toBe('default');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['default', 'boutique']);
  });

  it('avisa al padre al cambiar de plantilla', () => {
    const { props } = renderModal();

    fireEvent.change(screen.getByTestId('store-catalog-template-select'), {
      target: { value: 'boutique' },
    });

    expect(props.onChange).toHaveBeenCalledWith('boutique');
  });

  it('guarda y cierra con los botones del pie', () => {
    const { props } = renderModal();

    fireEvent.click(screen.getByTestId('store-catalog-template-save'));
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it('muestra el error del padre', () => {
    renderModal({ error: 'No se pudo guardar' });

    expect(screen.getByTestId('store-catalog-template-error')).toHaveTextContent('No se pudo guardar');
  });

  it('deshabilita guardar mientras carga o guarda', () => {
    const { unmount } = renderModal({ loading: true });
    expect(screen.getByTestId('store-catalog-template-save')).toBeDisabled();
    unmount();

    renderModal({ saving: true });
    expect(screen.getByTestId('store-catalog-template-save')).toBeDisabled();
  });

  it('muestra el default cuando la plantilla guardada no la lista este build (version skew, R3-1)', () => {
    renderModal({ value: 'legacy-v1' });

    const select = screen.getByTestId('store-catalog-template-select') as HTMLSelectElement;
    // El storefront cae a `default` para ids desconocidos; el selector refleja eso mismo.
    expect(select.value).toBe('default');
  });

  it('bloquea guardar si la carga falló (R3-2)', () => {
    renderModal({ loadFailed: true, error: 'No se pudo cargar' });

    expect(screen.getByTestId('store-catalog-template-save')).toBeDisabled();
  });
});
