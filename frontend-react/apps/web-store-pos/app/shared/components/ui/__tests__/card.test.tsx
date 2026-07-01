import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../card';

describe('Card — container with optional header/footer', () => {
  it('renders children', () => {
    render(<Card>Contenido</Card>);
    expect(screen.getByText('Contenido')).toBeInTheDocument();
  });

  it('renders a title in the header when provided', () => {
    render(<Card title="Resumen">Contenido</Card>);
    expect(screen.getByText('Resumen')).toBeInTheDocument();
  });

  it('does not render a header when no title is provided', () => {
    const { container } = render(<Card>Contenido</Card>);
    expect(container.querySelector('[data-slot="card-header"]')).not.toBeInTheDocument();
  });

  it('renders footer content when provided', () => {
    render(<Card footer={<span>Pie</span>}>Contenido</Card>);
    expect(screen.getByText('Pie')).toBeInTheDocument();
  });

  it('applies card surface styling classes', () => {
    render(<Card>Contenido</Card>);
    const card = screen.getByText('Contenido').closest('[data-slot="card"]');
    expect(card?.className).toContain('bg-surface');
    expect(card?.className).toContain('shadow-card');
  });
});
