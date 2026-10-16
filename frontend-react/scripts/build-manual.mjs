// Genera el Manual de usuario como HTML estático + PDF a partir de la FUENTE de
// verdad: `docs/manual/manual-usuario-pos.md` y sus imágenes (`docs/manual/img/`).
//
// Uso:  pnpm generate:manual     (desde `frontend-react/`)
//
// Salida: `backend/src/SMCA.WebApi/help/` (index.html, images/, manual-usuario-pos.pdf).
// El backend sirve esa carpeta en `/api/manual` (ver Program.cs). Al estar bajo
// `/api/*` el service worker la trata como passthrough → NO pesa en el POS offline.
//
// Reglas:
// - Fuente y salida SEPARADAS: la fuente no se toca; la salida es solo generada.
// - Nombres FIJOS (index.html, images/*, manual-usuario-pos.pdf): el backend
//   responde ETag/Last-Modified + `Cache-Control: no-cache`, así que el navegador
//   revalida → 304 si no cambió, 200 con la versión nueva si cambió.
// - Añadir/quitar una imagen: se agrega/elimina el archivo en `docs/manual/img/` y
//   su referencia `![...](img/...)` en el .md; este script regenera y falla con un
//   mensaje claro si el .md referencia una imagen que no existe.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';

const HERE = dirname(fileURLToPath(import.meta.url));
// scripts/ -> frontend-react/ -> raíz del repo
const REPO_ROOT = resolve(HERE, '..', '..');

const SOURCE_MD = resolve(REPO_ROOT, 'docs', 'manual', 'manual-usuario-pos.md');
const SOURCE_IMAGES = resolve(REPO_ROOT, 'docs', 'manual', 'img');
const TEMPLATE = resolve(HERE, 'manual-template.html');
const OUT_DIR = resolve(REPO_ROOT, 'backend', 'src', 'SMCA.WebApi', 'help');
const OUT_IMAGES = join(OUT_DIR, 'images');
const OUT_INDEX = join(OUT_DIR, 'index.html');
const OUT_PDF = join(OUT_DIR, 'manual-usuario-pos.pdf');

const TITLE = 'Manual de usuario — VendeDTo';

/** Rutas `img/...` referenciadas en el Markdown. */
function referencedImages(markdown) {
  const found = new Set();
  for (const match of markdown.matchAll(/!\[[^\]]*\]\((img\/[^)\s]+)\)/g)) {
    found.add(match[1]);
  }
  return [...found];
}

/** Falla ruidosamente si el .md referencia una imagen que no está en disco. */
function assertImagesExist(markdown) {
  const missing = referencedImages(markdown).filter(
    (ref) => !existsSync(join(SOURCE_IMAGES, basename(ref))),
  );
  if (missing.length > 0) {
    throw new Error(
      `El .md referencia imágenes que no existen en docs/manual/img/:\n  - ${missing.join('\n  - ')}`,
    );
  }
}

/** Copia TODAS las imágenes de la fuente a la salida (borra la salida anterior). */
function copyImages() {
  rmSync(OUT_IMAGES, { recursive: true, force: true });
  mkdirSync(OUT_IMAGES, { recursive: true });
  const files = readdirSync(SOURCE_IMAGES).filter((name) => !name.startsWith('.'));
  for (const name of files) {
    copyFileSync(join(SOURCE_IMAGES, name), join(OUT_IMAGES, name));
  }
  return files.length;
}

/**
 * Markdown → HTML. `img/...` pasa a `images/...` (las imágenes quedan como
 * archivos SEPARADOS, no embebidas: así el backend les aplica su propia caché
 * condicional y cambiar una no invalida las demás).
 */
function renderMarkdown(markdown) {
  const withImages = markdown.replace(/\]\(img\//g, '](images/');
  return marked.parse(withImages, { gfm: true, breaks: false });
}

/** PDF de relleno válido (xref con offsets reales) — se usa si Playwright falla. */
function buildPlaceholderPdf() {
  const stream = 'BT /F1 16 Tf 72 760 Td (Manual de usuario - pendiente de generacion) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** Imprime el HTML a PDF con Playwright; si no se puede, deja un PDF de relleno. */
async function emitPdf(indexPath, pdfPath) {
  try {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(indexPath).href, { waitUntil: 'load' });
      // Deja que carguen las imágenes locales antes de imprimir.
      await page.waitForTimeout(600);
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
      });
    } finally {
      await browser.close();
    }
    return 'playwright';
  } catch (error) {
    console.warn(`  AVISO: no se pudo generar el PDF con Playwright (${error.message}).`);
    console.warn('  Se deja un PDF de relleno en su lugar.');
    writeFileSync(pdfPath, buildPlaceholderPdf());
    return 'placeholder';
  }
}

async function main() {
  if (!existsSync(SOURCE_MD)) {
    throw new Error(`No se encontró la fuente del manual: ${SOURCE_MD}`);
  }

  const markdown = readFileSync(SOURCE_MD, 'utf8').replace(/\r\n/g, '\n');
  assertImagesExist(markdown);

  mkdirSync(OUT_DIR, { recursive: true });
  const imageCount = copyImages();

  const body = renderMarkdown(markdown);
  const template = readFileSync(TEMPLATE, 'utf8');
  const html = template
    .replaceAll('{{TITLE}}', TITLE)
    .replaceAll('{{GENERATED_AT}}', new Date().toISOString().slice(0, 10))
    .replaceAll('{{CONTENT}}', body);

  writeFileSync(OUT_INDEX, html, 'utf8');
  const renderedImages = (body.match(/<img /g) ?? []).length;
  console.log(`HTML: ${OUT_INDEX}`);
  console.log(
    `  ${renderedImages} imágenes referenciadas · ${imageCount} copiadas · ${(html.length / 1024).toFixed(1)} KB`,
  );

  const how = await emitPdf(OUT_INDEX, OUT_PDF);
  console.log(`PDF:  ${OUT_PDF} (${how})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
