import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LegalDocument, parseLegalMarkdown, renderLegalInline } from '../legal-document';

describe('parseLegalMarkdown', () => {
  it('separa encabezados, párrafos y listas', () => {
    const blocks = parseLegalMarkdown('# Título\n\nUn párrafo.\n\n## Sección\n\n- uno\n- dos\n');
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Título' },
      { kind: 'paragraph', lines: ['Un párrafo.'] },
      { kind: 'heading', level: 2, text: 'Sección' },
      { kind: 'list', items: ['uno', 'dos'] },
    ]);
  });

  it('mantiene juntas las líneas de un mismo párrafo', () => {
    const blocks = parseLegalMarkdown('**A:** uno\n**B:** dos\n');
    expect(blocks).toEqual([{ kind: 'paragraph', lines: ['**A:** uno', '**B:** dos'] }]);
  });

  it('ignora líneas en blanco de sobra', () => {
    expect(parseLegalMarkdown('\n\n\n')).toEqual([]);
  });
});

describe('renderLegalInline', () => {
  it('convierte **negrita** en <strong> sin inyectar HTML', () => {
    const { container } = render(<p>{renderLegalInline('a **b** c', 'k')}</p>);
    expect(container.querySelector('strong')?.textContent).toBe('b');
    expect(container.querySelector('p')?.textContent).toBe('a b c');
  });

  it('deja el texto sin marcas como texto plano', () => {
    const { container } = render(<p>{renderLegalInline('sin marcas', 'k')}</p>);
    expect(container.querySelector('strong')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe('sin marcas');
  });
});

describe('LegalDocument', () => {
  it('renderiza el documento con su encabezado, párrafos y viñetas', () => {
    render(
      <LegalDocument
        testId="doc"
        markdown={'# Título\n\nUn párrafo con **negrita**.\n\n- uno\n- dos\n'}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Título');
    expect(screen.getByTestId('doc')).toHaveTextContent('Un párrafo con negrita.');
    expect(screen.getByText('negrita')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
