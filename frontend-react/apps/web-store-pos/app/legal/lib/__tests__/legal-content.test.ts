import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  PRIVACY_POLICY_MARKDOWN,
  TERMS_AND_CONDITIONS_MARKDOWN,
} from '../legal-content.generated';

// Guarda de desincronización: el módulo generado debe ser idéntico a los .md.
// Si este test falla, corre `pnpm --filter @store-mgmt/web-store-pos generate:legal`.
const ANCHOR = 'docs/legal/terminos-y-condiciones.md';

/** Sube desde el cwd hasta la raíz del repo (la que contiene docs/legal). */
function findRepoRoot(start: string): string {
  let dir = start;
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(dir, ANCHOR))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`No se encontró ${ANCHOR} subiendo desde ${start}`);
}

const REPO_ROOT = findRepoRoot(process.cwd());

function readDoc(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

describe('contenido legal generado', () => {
  it('la Política de Privacidad coincide con docs/legal/politica-de-privacidad.md', () => {
    expect(PRIVACY_POLICY_MARKDOWN).toBe(readDoc('docs/legal/politica-de-privacidad.md'));
  });

  it('los Términos y Condiciones coinciden con docs/legal/terminos-y-condiciones.md', () => {
    expect(TERMS_AND_CONDITIONS_MARKDOWN).toBe(
      readDoc('docs/legal/terminos-y-condiciones.md'),
    );
  });
});
