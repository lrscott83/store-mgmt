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

describe('Card — padding variant (tight vs default, list/table parity)', () => {
  it('defaults body padding to p-6 (form/detail cards, unchanged regression guard)', () => {
    const { container } = render(<Card>Contenido</Card>);
    const body = container.querySelector('[data-slot="card-body"]');
    expect(body?.className).toContain('p-6');
    expect(body?.className).not.toContain('p-2');
  });

  it('keeps body padding at p-6 when padding="default" is explicit', () => {
    const { container } = render(<Card padding="default">Contenido</Card>);
    const body = container.querySelector('[data-slot="card-body"]');
    expect(body?.className).toContain('p-6');
  });

  it('shrinks body padding to p-2 when padding="tight"', () => {
    const { container } = render(<Card padding="tight">Contenido</Card>);
    const body = container.querySelector('[data-slot="card-body"]');
    expect(body?.className).toContain('p-2');
    expect(body?.className).not.toContain('p-6');
  });

  it('default header uses px-6 py-4', () => {
    const { container } = render(<Card title="Título">Contenido</Card>);
    const header = container.querySelector('[data-slot="card-header"]');
    expect(header?.className).toContain('px-6 py-4');
  });

  it('tight header uses px-6 py-2', () => {
    const { container } = render(
      <Card title="Título" padding="tight">
        Contenido
      </Card>,
    );
    const header = container.querySelector('[data-slot="card-header"]');
    expect(header?.className).toContain('px-6 py-2');
  });

  it('title uses font-medium weight (Angular .card-label 500 weight)', () => {
    render(<Card title="Título">Contenido</Card>);
    const title = screen.getByText('Título');
    expect(title.className).toContain('font-medium');
    expect(title.className).not.toContain('font-semibold');
  });
});
