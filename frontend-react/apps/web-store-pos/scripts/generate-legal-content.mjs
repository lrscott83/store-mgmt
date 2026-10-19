// Genera el módulo TypeScript que consumen las vistas legales del POS a partir
// de los documentos Markdown del repositorio (la FUENTE de verdad es el .md).
//
// Uso:  pnpm --filter @store-mgmt/web-store-pos generate:legal
//
// El test `app/legal/lib/__tests__/legal-content.test.ts` falla si el módulo
// generado queda desincronizado con los .md.
//
// Nota de codificación: se escribe con JSON.stringify para no depender de
// plantillas ni de escapes manuales.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// scripts/ -> web-store-pos/ -> apps/ -> frontend-react/ -> raíz del repo
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');

const SOURCES = [
  { exportName: 'PRIVACY_POLICY_MARKDOWN', file: 'docs/legal/politica-de-privacidad.md' },
  { exportName: 'TERMS_AND_CONDITIONS_MARKDOWN', file: 'docs/legal/terminos-y-condiciones.md' },
];

const OUTPUT = resolve(HERE, '..', 'app', 'legal', 'lib', 'legal-content.generated.ts');

function readDoc(relativePath) {
  const absolute = resolve(REPO_ROOT, relativePath);
  try {
    return readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
  } catch (error) {
    throw new Error(`No se pudo leer ${relativePath} (${absolute}): ${error.message}`);
  }
}

const lines = [
  '// ARCHIVO GENERADO — no lo edites a mano.',
  '// Fuente: ' + SOURCES.map((s) => s.file).join(' y '),
  '// Regenerar: pnpm --filter @store-mgmt/web-store-pos generate:legal',
  '',
];

for (const source of SOURCES) {
  lines.push(`export const ${source.exportName} = ${JSON.stringify(readDoc(source.file))};`);
  lines.push('');
}

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, lines.join('\n'), 'utf8');

console.log(`Generado ${OUTPUT} desde ${SOURCES.length} documentos.`);
