import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QrCode } from '../qr-code';

describe('QrCode', () => {
  it('lazily renders an SVG QR code for the given value', async () => {
    render(<QrCode value="BB8" />);
    expect(screen.getByTestId('qr-code')).toBeInTheDocument();

    const svg = await screen.findByTestId('qr-code-svg');
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });

  it('gives the code an accessible label when provided', async () => {
    render(<QrCode value="BB8" label="Código de emparejamiento" />);
    const svg = await screen.findByTestId('qr-code-svg');
    expect(svg).toHaveAttribute('aria-label', 'Código de emparejamiento');
  });
});
