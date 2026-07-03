import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ─── ExpenseFormModal ────────────────────────────────────────────────────────

import { ExpenseFormModal } from '../expense-form-modal';

describe('ExpenseFormModal — total validation (Angular parity: required + min(0))', () => {
  it('allows a total of exactly 0 (Angular Validators.min(0) permits 0)', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={onSave} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Guardar'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].total).toBe(0);
  });

  it('blocks a negative total and shows the TOTAL_REQUIRED validation message', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={onSave} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '-5' } });
    expect(screen.getByText('El total debe ser mayor a 0')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Guardar'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not show the validation message for a valid (non-negative) total', () => {
    render(
      <Wrapper>
        <ExpenseFormModal isOpen onClose={() => {}} onSave={() => {}} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '20' } });
    expect(screen.queryByText('El total debe ser mayor a 0')).not.toBeInTheDocument();
  });
});
