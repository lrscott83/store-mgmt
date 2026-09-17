import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DateRangeFilter } from '../date-range-filter';

describe('DateRangeFilter', () => {
  it('renders the textbox + lupa button with the empty placeholder', () => {
    render(<DateRangeFilter value={{ start: null, end: null }} onApply={vi.fn()} />);
    expect(screen.getByTestId('date-range-filter-input')).toHaveAttribute(
      'placeholder',
      'dd/mm/aaaa - dd/mm/aaaa',
    );
    expect(screen.getByTestId('date-range-filter-button')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeInTheDocument();
  });

  it('shows an applied range in the textbox without leading zeros (3/2/2026 - 17/9/2028)', () => {
    render(
      <DateRangeFilter
        value={{ start: new Date(2026, 1, 3), end: new Date(2028, 8, 17) }}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByTestId('date-range-filter-input')).toHaveValue('3/2/2026 - 17/9/2028');
  });

  it('editing inside the popover without "Seleccionar" does NOT change the textbox', () => {
    render(<DateRangeFilter value={{ start: null, end: null }} onApply={vi.fn()} />);
    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.change(screen.getByTestId('date-range-filter-start'), {
      target: { value: '2026-02-03' },
    });
    fireEvent.change(screen.getByTestId('date-range-filter-end'), {
      target: { value: '2028-09-17' },
    });
    // Draft edits stay in the popover; the committed textbox stays empty.
    expect(screen.getByTestId('date-range-filter-input')).toHaveValue('');

    // Re-opening initializes the draft from the (still empty) selection, discarding edits.
    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    expect(screen.getByTestId('date-range-filter-start')).toHaveValue('');
    expect(screen.getByTestId('date-range-filter-end')).toHaveValue('');
    expect(screen.getByTestId('date-range-filter-input')).toHaveValue('');
  });

  it('"Seleccionar" commits the draft: the textbox shows the committed range and the popover closes', () => {
    render(<DateRangeFilter value={{ start: null, end: null }} onApply={vi.fn()} />);
    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.change(screen.getByTestId('date-range-filter-start'), {
      target: { value: '2026-02-03' },
    });
    fireEvent.change(screen.getByTestId('date-range-filter-end'), {
      target: { value: '2028-09-17' },
    });
    fireEvent.click(screen.getByTestId('date-range-filter-select'));
    expect(screen.getByTestId('date-range-filter-input')).toHaveValue('3/2/2026 - 17/9/2028');
    expect(screen.queryByTestId('date-range-filter-start')).toBeNull();
  });

  it('clicking the lupa applies the COMMITTED selection, not the live draft', () => {
    const onApply = vi.fn();
    render(<DateRangeFilter value={{ start: null, end: null }} onApply={onApply} />);
    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.change(screen.getByTestId('date-range-filter-start'), {
      target: { value: '2026-02-03' },
    });
    fireEvent.change(screen.getByTestId('date-range-filter-end'), {
      target: { value: '2028-09-17' },
    });
    fireEvent.click(screen.getByTestId('date-range-filter-select'));
    fireEvent.click(screen.getByTestId('date-range-filter-button'));
    expect(onApply).toHaveBeenCalledWith({
      start: new Date(2026, 1, 3),
      end: new Date(2028, 8, 17),
    });
  });

  it('rejects an invalid range: end before start disables "Seleccionar", shows the hint and a min on the end input', () => {
    render(<DateRangeFilter value={{ start: null, end: null }} onApply={vi.fn()} />);
    fireEvent.click(screen.getByTestId('date-range-filter-input'));

    // Open-ended ranges are allowed: only a start set → still selectable, no hint.
    fireEvent.change(screen.getByTestId('date-range-filter-start'), {
      target: { value: '2028-09-17' },
    });
    expect(screen.getByTestId('date-range-filter-select')).toBeEnabled();
    expect(screen.queryByTestId('date-range-filter-invalid')).toBeNull();
    expect(screen.getByTestId('date-range-filter-end')).toHaveAttribute('min', '2028-09-17');

    // End before start → invalid: button disabled, hint shown.
    fireEvent.change(screen.getByTestId('date-range-filter-end'), {
      target: { value: '2026-02-03' },
    });
    expect(screen.getByTestId('date-range-filter-select')).toBeDisabled();
    expect(screen.getByTestId('date-range-filter-invalid')).toHaveTextContent(
      'El fin debe ser igual o posterior al inicio',
    );

    // Fixing the end back to a later date restores the valid state.
    fireEvent.change(screen.getByTestId('date-range-filter-end'), {
      target: { value: '2029-01-15' },
    });
    expect(screen.getByTestId('date-range-filter-select')).toBeEnabled();
    expect(screen.queryByTestId('date-range-filter-invalid')).toBeNull();
  });

  it('"Limpiar" clears the selection and applies an empty range immediately', () => {
    const onApply = vi.fn();
    render(<DateRangeFilter value={{ start: null, end: null }} onApply={onApply} />);
    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.change(screen.getByTestId('date-range-filter-start'), {
      target: { value: '2026-02-03' },
    });
    fireEvent.click(screen.getByTestId('date-range-filter-select'));
    expect(screen.getByTestId('date-range-filter-input')).toHaveValue('3/2/2026 - dd/mm/aaaa');

    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.click(screen.getByTestId('date-range-filter-clear'));
    expect(screen.getByTestId('date-range-filter-input')).toHaveValue('');
    expect(screen.queryByTestId('date-range-filter-start')).toBeNull();
    // Clearing also clears the applied filter immediately — the list shows everything.
    expect(onApply).toHaveBeenCalledWith({ start: null, end: null });
  });
});