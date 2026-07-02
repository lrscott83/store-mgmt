import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from '../spinner';

describe('Spinner — Angular spinner-border equivalent', () => {
  it('renders the label text', () => {
    render(<Spinner label="Cargando..." />);
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });

  it('has role="status" with the label as its accessible name', () => {
    render(<Spinner label="Cargando..." />);
    expect(screen.getByRole('status', { name: 'Cargando...' })).toBeInTheDocument();
  });

  it('applies the primary-color spinning ring classes', () => {
    render(<Spinner label="Cargando..." />);
    const status = screen.getByRole('status');
    expect(status.className).toContain('animate-spin');
    expect(status.className).toContain('border-primary');
  });
});
