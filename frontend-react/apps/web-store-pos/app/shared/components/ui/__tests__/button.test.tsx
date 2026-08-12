import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, FloatingButton } from '../button';

describe('Button — variants and interaction', () => {
  it('renders children text', () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });

  it('applies the primary variant classes by default', () => {
    render(<Button>Guardar</Button>);
    const btn = screen.getByRole('button', { name: 'Guardar' });
    expect(btn.className).toContain('bg-primary');
  });

  it('applies secondary variant classes when variant="secondary"', () => {
    render(<Button variant="secondary">Cancelar</Button>);
    const btn = screen.getByRole('button', { name: 'Cancelar' });
    expect(btn.className).toContain('bg-secondary');
  });

  it('applies danger variant classes when variant="danger"', () => {
    render(<Button variant="danger">Eliminar</Button>);
    const btn = screen.getByRole('button', { name: 'Eliminar' });
    expect(btn.className).toContain('bg-danger');
  });

  it('applies outline variant classes when variant="outline"', () => {
    render(<Button variant="outline">Ver más</Button>);
    const btn = screen.getByRole('button', { name: 'Ver más' });
    expect(btn.className).toContain('border-primary');
  });

  it('applies fab-danger variant classes when variant="fab-danger"', () => {
    render(<Button variant="fab-danger">Limpiar</Button>);
    const btn = screen.getByRole('button', { name: 'Limpiar' });
    // Pill geometry from `fab`, colour from `danger` — the composition is the
    // whole point of the variant existing.
    expect(btn.className).toContain('rounded-full');
    expect(btn.className).toContain('bg-danger');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Guardar
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Guardar' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type="button" to avoid accidental form submits', () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAttribute('type', 'button');
  });

  it('respects an explicit type="submit"', () => {
    render(<Button type="submit">Enviar</Button>);
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveAttribute('type', 'submit');
  });
});

describe('Button — variant="fab" (Angular mat-fab extended: pill, purple, elevated)', () => {
  it('applies pill shape (rounded-full)', () => {
    render(<Button variant="fab">+ Categoría</Button>);
    const btn = screen.getByRole('button', { name: '+ Categoría' });
    expect(btn.className).toContain('rounded-full');
  });

  it('applies filled purple background and white text', () => {
    render(<Button variant="fab">+ Categoría</Button>);
    const btn = screen.getByRole('button', { name: '+ Categoría' });
    expect(btn.className).toContain('bg-primary');
    expect(btn.className).toContain('text-white');
  });

  it('applies an elevated shadow', () => {
    render(<Button variant="fab">+ Categoría</Button>);
    const btn = screen.getByRole('button', { name: '+ Categoría' });
    expect(btn.className).toContain('shadow-lg');
  });

  it('applies trimmed padding matching Angular parity (px-5, not px-6)', () => {
    render(<Button variant="fab">+ Categoría</Button>);
    const btn = screen.getByRole('button', { name: '+ Categoría' });
    expect(btn.className).toContain('px-5');
    expect(btn.className).not.toContain('px-6');
    expect(btn.className).toContain('py-3');
  });

  it('keeps text-sm font-medium on the fab variant (font unchanged by the px trim)', () => {
    render(<Button variant="fab">+ Categoría</Button>);
    const btn = screen.getByRole('button', { name: '+ Categoría' });
    expect(btn.className).toContain('text-sm');
    expect(btn.className).toContain('font-medium');
  });

  it('is not the small rectangular radius used by other variants', () => {
    render(<Button variant="fab">+ Categoría</Button>);
    const btn = screen.getByRole('button', { name: '+ Categoría' });
    expect(btn.className).not.toContain('rounded-md');
  });
});

describe('FloatingButton — fixed-position action button', () => {
  it('renders as a button with an accessible label', () => {
    render(<FloatingButton aria-label="Agregar producto">+</FloatingButton>);
    expect(screen.getByRole('button', { name: 'Agregar producto' })).toBeInTheDocument();
  });

  it('applies rounded-full and primary background for the FAB look', () => {
    render(<FloatingButton aria-label="Agregar producto">+</FloatingButton>);
    const btn = screen.getByRole('button', { name: 'Agregar producto' });
    expect(btn.className).toContain('rounded-full');
    expect(btn.className).toContain('bg-primary');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <FloatingButton aria-label="Agregar producto" onClick={onClick}>
        +
      </FloatingButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
