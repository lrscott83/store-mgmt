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
// - Las imágenes se OPTIMIZAN AL GENERAR (2026-10-27): recorte del espacio muerto inferior,
//   WebP sin pérdida y, si el original ya es JPG y el WebP no compensa, se conserva el menor.
//   Las fuentes de `docs/manual/img/` NO se modifican.
// - Nombres FIJOS (index.html, images/*, manual-usuario-pos.pdf): el backend
//   responde ETag/Last-Modified + `Cache-Control: no-cache`, así que el navegador
//   revalida → 304 si no cambió, 200 con la versión nueva si cambió.
// - Añadir/quitar una imagen: se agrega/elimina el archivo en `docs/manual/img/` y
//   su referencia `![...](img/...)` en el .md; este script regenera y falla con un
//   mensaje claro si el .md referencia una imagen que no existe.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join, basename, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';
import sharp from 'sharp';

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

/** Formatos de imagen de la fuente que pasan por la optimización. */
const OPTIMIZABLE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const WEBP_LOSSLESS = { lossless: true, effort: 5 };
/** Tolerancia (0-255) para considerar un píxel del mismo color que el fondo inferior. */
const TRIM_TOLERANCE = 6;
/** Margen inferior que se conserva tras recortar el espacio muerto. */
const TRIM_PADDING = 24;
/** Píxeles de borde que se ignoran al muestrear (sombra/scrollbar de la captura). */
const TRIM_EDGE = 4;
/** Nunca se recorta más de esta fracción del alto (protege capturas con mucho lienzo vacío). */
const TRIM_MAX_RATIO = 0.55;

/**
 * Altura a la que se puede recortar por abajo: se escanea desde la última fila hacia arriba
 * mientras la fila sea uniforme del color DOMINANTE de esa fila (ignorando unos píxeles de borde,
 * donde la captura puede traer una sombra o la barra de scroll). Devuelve `null` cuando no hay
 * espacio muerto, cuando el recorte sería inapreciable o cuando supera `TRIM_MAX_RATIO`.
 */
async function trimmedBottomHeight(sourcePath) {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const edge = Math.min(TRIM_EDGE, Math.floor(width / 20));
  const left = edge;
  const right = width - edge;
  if (height < 2 || right <= left) return null;

  // Color dominante de la última fila (moda de los píxeles interiores).
  const counts = new Map();
  const lastRowStart = (height - 1) * width * channels;
  for (let x = left; x < right; x += 1) {
    const index = lastRowStart + x * channels;
    const key = (data[index] << 16) | (data[index + 1] << 8) | data[index + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let backgroundKey = 0;
  let backgroundCount = -1;
  for (const [key, count] of counts) {
    if (count > backgroundCount) {
      backgroundCount = count;
      backgroundKey = key;
    }
  }
  const background = [(backgroundKey >> 16) & 255, (backgroundKey >> 8) & 255, backgroundKey & 255];

  const rowIsUniform = (y) => {
    const rowStart = y * width * channels;
    for (let x = left; x < right; x += 1) {
      const index = rowStart + x * channels;
      if (
        Math.abs(data[index] - background[0]) > TRIM_TOLERANCE ||
        Math.abs(data[index + 1] - background[1]) > TRIM_TOLERANCE ||
        Math.abs(data[index + 2] - background[2]) > TRIM_TOLERANCE
      ) {
        return false;
      }
    }
    return true;
  };

  let lastContentRow = height - 1;
  for (let y = height - 1; y >= 0; y -= 1) {
    if (!rowIsUniform(y)) {
      lastContentRow = y;
      break;
    }
  }

  const candidate = Math.min(height, lastContentRow + 1 + TRIM_PADDING);
  const trimmed = height - candidate;
  if (trimmed < TRIM_PADDING) return null;
  if (trimmed > Math.floor(height * TRIM_MAX_RATIO)) return null;
  return candidate;
}

/**
 * Optimiza TODAS las imágenes de la fuente a la salida (borra la salida anterior).
 *
 * Por archivo produce candidatos y escribe el MÁS PEQUEÑO, de modo que la salida nunca pesa más
 * que la fuente: WebP sin pérdida del original recortado y el archivo original. Devuelve el mapa
 * `nombre fuente → { outName, width, height }`.
 */
async function optimizeImages() {
  rmSync(OUT_IMAGES, { recursive: true, force: true });
  mkdirSync(OUT_IMAGES, { recursive: true });

  const files = readdirSync(SOURCE_IMAGES).filter((name) => !name.startsWith('.'));
  const imageMap = new Map();
  let sourceBytes = 0;
  let outputBytes = 0;

  for (const name of files) {
    const sourcePath = join(SOURCE_IMAGES, name);
    const sourceBuffer = readFileSync(sourcePath);
    sourceBytes += sourceBuffer.length;
    const extension = extname(name).toLowerCase();

    let best;

    if (OPTIMIZABLE_EXTENSIONS.has(extension)) {
      const metadata = await sharp(sourcePath).metadata();
      const trimmedHeight = await trimmedBottomHeight(sourcePath);
      const buildCandidate = async (encode) => {
        let pipeline = sharp(sourcePath);
        if (trimmedHeight) {
          pipeline = pipeline.extract({
            left: 0,
            top: 0,
            width: metadata.width,
            height: trimmedHeight,
          });
        }
        return { buffer: await encode(pipeline).toBuffer() };
      };

      const webpName = name.replace(/\.(png|jpe?g)$/i, '.webp');
      const candidates = [];

      try {
        candidates.push({
          name: webpName,
          ...(await buildCandidate((p) => p.webp(WEBP_LOSSLESS))),
        });
      } catch (error) {
        console.warn(
          `  AVISO: no se pudo convertir "${name}" (${error.message}); se copia tal cual.`,
        );
      }

      // El original compite siempre: garantiza que la salida nunca empeora.
      candidates.push({ name, buffer: sourceBuffer });
      candidates.sort((a, b) => a.buffer.length - b.buffer.length);
      best = candidates[0];
    } else {
      best = { name, buffer: sourceBuffer };
    }

    const outputPath = join(OUT_IMAGES, best.name);
    writeFileSync(outputPath, best.buffer);
    outputBytes += best.buffer.length;

    const outputMetadata = await sharp(outputPath).metadata();
    imageMap.set(name, {
      outName: best.name,
      width: outputMetadata.width,
      height: outputMetadata.height,
    });
  }

  return { count: files.length, imageMap, sourceBytes, outputBytes };
}

/**
 * Markdown → HTML. `img/<fuente>` pasa a `images/<salida>` según el mapa de optimización (la
 * extensión puede cambiar a `.webp`). Las imágenes quedan como archivos SEPARADOS, no embebidas:
 * así el backend les aplica su propia caché condicional y cambiar una no invalida las demás.
 */
function renderMarkdown(markdown, imageMap) {
  const withImages = markdown.replace(/\]\(img\/([^)\s]+)\)/g, (match, sourceName) => {
    const entry = imageMap.get(sourceName) ?? imageMap.get(basename(sourceName));
    return entry ? `](images/${entry.outName})` : match;
  });
  return marked.parse(withImages, { gfm: true, breaks: false });
}

/**
 * Añade a cada `<img>` la carga diferida y sus dimensiones reales. `loading="lazy"` evita bajar
 * las 73 imágenes al abrir el manual y `width`/`height` reservan el espacio (sin salto de layout).
 */
function injectImageAttributes(html, imageMap) {
  const byOutputName = new Map();
  for (const entry of imageMap.values()) byOutputName.set(entry.outName, entry);

  return html.replace(/<img\b([^>]*)>/g, (tag, attributes) => {
    if (/\bloading=/.test(attributes)) return tag;
    const sourceMatch = attributes.match(/\bsrc="images\/([^"]+)"/);
    const entry = sourceMatch ? byOutputName.get(sourceMatch[1]) : undefined;
    const size = entry ? ` width="${entry.width}" height="${entry.height}"` : '';
    return `<img${attributes.replace(/\s*\/$/, '')}${size} loading="lazy" decoding="async">`;
  });
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
      // Las imágenes llevan `loading="lazy"`: al imprimir, Chromium solo rasteriza las que ya
      // están cargadas, y el PDF saldría sin casi ninguna imagen. Se fuerzan todas a `eager` y
      // se espera a que terminen antes de imprimir.
      await page.evaluate(async () => {
        const images = [...document.images];
        for (const image of images) image.loading = 'eager';
        await Promise.all(
          images.map(
            (image) =>
              new Promise((resolve) => {
                if (image.complete) {
                  resolve();
                  return;
                }
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
              }),
          ),
        );
      });
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
  const { count: imageCount, imageMap, sourceBytes, outputBytes } = await optimizeImages();

  const body = injectImageAttributes(renderMarkdown(markdown, imageMap), imageMap);
  const template = readFileSync(TEMPLATE, 'utf8');
  const html = template
    .replaceAll('{{TITLE}}', TITLE)
    .replaceAll('{{GENERATED_AT}}', new Date().toISOString().slice(0, 10))
    .replaceAll('{{CONTENT}}', body);

  writeFileSync(OUT_INDEX, html, 'utf8');
  const renderedImages = (body.match(/<img /g) ?? []).length;
  const savedPercent = sourceBytes > 0 ? (1 - outputBytes / sourceBytes) * 100 : 0;
  console.log(`HTML: ${OUT_INDEX}`);
  console.log(
    `  ${renderedImages} imágenes referenciadas · ${imageCount} optimizadas · ${(html.length / 1024).toFixed(1)} KB`,
  );
  console.log(
    `  imágenes: ${(sourceBytes / 1024 / 1024).toFixed(2)} MB → ${(outputBytes / 1024 / 1024).toFixed(2)} MB (${savedPercent.toFixed(1)} % menos)`,
  );

  const how = await emitPdf(OUT_INDEX, OUT_PDF);
  console.log(`PDF:  ${OUT_PDF} (${how})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
