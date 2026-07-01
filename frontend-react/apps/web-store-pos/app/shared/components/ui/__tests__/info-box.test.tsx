import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfoBox } from '../info-box';

describe('InfoBox — Angular alert-light-* equivalent', () => {
  it('renders children text', () => {
    render(<InfoBox>No hay productos disponibles.</InfoBox>);
    expect(screen.getByText('No hay productos disponibles.')).toBeInTheDocument();
  });

  it('defaults to the info (blue) variant', () => {
    render(<InfoBox>Mensaje</InfoBox>);
    const box = screen.getByRole('status');
    expect(box.className).toContain('bg-secondary');
  });

  it('applies primary variant classes when variant="primary"', () => {
    render(<InfoBox variant="primary">Mensaje</InfoBox>);
    const box = screen.getByRole('status');
    expect(box.className).toContain('bg-primary-light');
  });

  it('applies danger variant classes when variant="danger"', () => {
    render(<InfoBox variant="danger">Mensaje</InfoBox>);
    const box = screen.getByRole('status');
    expect(box.className).toContain('bg-danger');
  });

  it('has role="status" for accessibility', () => {
    render(<InfoBox>Mensaje</InfoBox>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
