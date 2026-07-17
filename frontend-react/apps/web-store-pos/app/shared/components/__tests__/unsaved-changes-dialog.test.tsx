import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import messages from '~/shared/lib/i18n/es';
import UnsavedChangesDialog from '../unsaved-changes-dialog';

function renderDialog() {
  return render(
    <IntlProvider locale="es" messages={messages}>
      <UnsavedChangesDialog onSave={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} />
    </IntlProvider>
  );
}

describe('UnsavedChangesDialog — view-text-parity (Angular can-deactivate.guard.ts SweetAlert)', () => {
  it('renders title "Confirmación" (GENERAL.CONFIRM_TITLE)', () => {
    renderDialog();
    expect(screen.getByText('Confirmación')).toBeInTheDocument();
  });

  it('renders message byte-identical to GENERAL.WIZARD_DIRTY_MESSAGE', () => {
    renderDialog();
    expect(
      screen.getByText(
        'Usted tiene cambios pendientes. ¿Desea salvar los cambios antes de pasar a la otra página?'
      )
    ).toBeInTheDocument();
  });

  it('renders the save button as "Si" (GENERAL.YES)', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Si' })).toBeInTheDocument();
  });

  it('renders the discard button as "No" (GENERAL.NO)', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
  });

  it('renders the cancel button as "Cancelar" (GENERAL.CANCEL)', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });
});
