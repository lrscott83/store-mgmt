import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from '../switch';

describe('Switch', () => {
  it('renders with role="switch", the visible label, and reflects checked state', () => {
    render(<Switch checked label="Crédito" onChange={() => {}} />);

    const toggle = screen.getByRole('switch', { name: 'Crédito' });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    // Visible text label
    expect(screen.getByText('Crédito')).toBeInTheDocument();
  });

  it('reports unchecked via aria-checked=false', () => {
    render(<Switch checked={false} label="Crédito" onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Crédito' })).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onChange with the toggled value when clicked', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} label="Crédito" onChange={onChange} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Crédito' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is findable by its label text (getByLabelText)', () => {
    render(<Switch checked={false} label="Imprimir Factura (prueba)" onChange={() => {}} />);
    expect(screen.getByLabelText('Imprimir Factura (prueba)')).toBeInTheDocument();
  });

  it('does not fire onChange when disabled', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} label="Crédito" onChange={onChange} disabled />);

    fireEvent.click(screen.getByRole('switch', { name: 'Crédito' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
