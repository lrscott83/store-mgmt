import { Fragment } from 'react';
import type { ReactNode } from 'react';

export type LegalBlock =
  | { kind: 'heading'; level: 1 | 2; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; lines: string[] };

/**
 * Parser deliberadamente mínimo: cubre EXACTAMENTE lo que usan los dos
 * documentos legales del POS (`docs/legal/*.md`) — encabezados `#`/`##`,
 * párrafos separados por línea en blanco, viñetas `- ` y negrita `**…**`.
 * No es un intérprete de Markdown general, y no pretende serlo: si los
 * documentos empiezan a usar otra sintaxis, amplía esto (y su test).
 */
export function parseLegalMarkdown(markdown: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];

  for (const rawBlock of markdown.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const lines = rawBlock
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    if (lines.length === 0) continue;

    if (lines.length === 1 && lines[0].startsWith('## ')) {
      blocks.push({ kind: 'heading', level: 2, text: lines[0].slice(3).trim() });
      continue;
    }
    if (lines.length === 1 && lines[0].startsWith('# ')) {
      blocks.push({ kind: 'heading', level: 1, text: lines[0].slice(2).trim() });
      continue;
    }
    if (lines.every((line) => line.startsWith('- '))) {
      blocks.push({ kind: 'list', items: lines.map((line) => line.slice(2).trim()) });
      continue;
    }
    blocks.push({ kind: 'paragraph', lines });
  }

  return blocks;
}

/** Renderiza `**negrita**` sin inyectar HTML: alterna texto y `<strong>`. */
export function renderLegalInline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split('**')
    .map((part, index) =>
      index % 2 === 1 ? (
        <strong key={`${keyPrefix}-b${index}`}>{part}</strong>
      ) : (
        <Fragment key={`${keyPrefix}-t${index}`}>{part}</Fragment>
      ),
    );
}

interface LegalDocumentProps {
  markdown: string;
  testId?: string;
}

/** Cuerpo de una página legal: mismo contenido del `.md`, con los estilos del POS. */
export function LegalDocument({ markdown, testId }: LegalDocumentProps) {
  const blocks = parseLegalMarkdown(markdown);

  return (
    <article data-testid={testId} className="space-y-3 text-sm leading-relaxed text-text">
      {blocks.map((block, blockIndex) => {
        const key = `block-${blockIndex}`;
        if (block.kind === 'heading') {
          return block.level === 1 ? (
            <h1 key={key} className="text-2xl font-bold">
              {renderLegalInline(block.text, key)}
            </h1>
          ) : (
            <h2 key={key} className="pt-2 text-lg font-semibold">
              {renderLegalInline(block.text, key)}
            </h2>
          );
        }
        if (block.kind === 'list') {
          return (
            <ul key={key} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>
                  {renderLegalInline(item, `${key}-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={key}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={`${key}-${lineIndex}`}>
                {lineIndex > 0 && <br />}
                {renderLegalInline(line, `${key}-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </article>
  );
}
