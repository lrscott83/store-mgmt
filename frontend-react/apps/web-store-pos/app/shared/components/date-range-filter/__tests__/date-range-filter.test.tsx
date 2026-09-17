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

  it('picking a range through the popover + Aplicar updates the textbox draft', () => {
    render(<DateRangeFilter value={{ start: null, end: null }} onApply={vi.fn()} />);
    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.change(screen.getByTestId('date-range-filter-start'), {
      target: { value: '2026-02-03' },
    });
    fireEvent.change(screen.getByTestId('date-range-filter-end'), {
      target: { value: '2028-09-17' },
    });
    fireEvent.click(screen.getByTestId('date-range-filter-apply'));
    expect(screen.getByTestId('date-range-filter-input')).toHaveValue('3/2/2026 - 17/9/2028');
  });

  it('clicking the lupa applies the picked range', () => {
    const onApply = vi.fn();
    render(<DateRangeFilter value={{ start: null, end: null }} onApply={onApply} />);
    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.change(screen.getByTestId('date-range-filter-start'), {
      target: { value: '2026-02-03' },
    });
    fireEvent.change(screen.getByTestId('date-range-filter-end'), {
      target: { value: '2028-09-17' },
    });
    fireEvent.click(screen.getByTestId('date-range-filter-apply'));
    fireEvent.click(screen.getByTestId('date-range-filter-button'));
    expect(onApply).toHaveBeenCalledWith({
      start: new Date(2026, 1, 3),
      end: new Date(2028, 8, 17),
    });
  });

  it('Limpiar clears the draft; the lupa then applies {start: null, end: null}', () => {
    const onApply = vi.fn();
    render(<DateRangeFilter value={{ start: null, end: null }} onApply={onApply} />);
    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.change(screen.getByTestId('date-range-filter-start'), {
      target: { value: '2026-02-03' },
    });
    fireEvent.click(screen.getByTestId('date-range-filter-apply'));
    expect(screen.getByTestId('date-range-filter-input')).toHaveValue('3/2/2026 - dd/mm/aaaa');

    fireEvent.click(screen.getByTestId('date-range-filter-input'));
    fireEvent.click(screen.getByTestId('date-range-filter-clear'));
    expect(screen.getByTestId('date-range-filter-input')).toHaveValue('');
    expect(screen.queryByTestId('date-range-filter-start')).toBeNull();

    fireEvent.click(screen.getByTestId('date-range-filter-button'));
    expect(onApply).toHaveBeenCalledWith({ start: null, end: null });
  });
});