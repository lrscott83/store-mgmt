import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrivacyPolicyPage } from '../privacy-policy';
import { TermsConditionsPage } from '../terms-conditions';

describe('páginas legales públicas', () => {
  it('/private-police renderiza la Política de Privacidad generada desde el .md', () => {
    render(<PrivacyPolicyPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Política de Privacidad');
    expect(screen.getByText('Lizardo Felipe Romero Scott')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-policy-document')).toBeInTheDocument();
  });

  it('/terms-conditions renderiza los Términos y Condiciones generados desde el .md', () => {
    render(<TermsConditionsPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Términos y Condiciones',
    );
    expect(
      screen.getByText(/Usted acepta pagar el precio total del servicio prestado/),
    ).toBeInTheDocument();
    expect(screen.getByTestId('terms-conditions-document')).toBeInTheDocument();
  });
});
