import type { jsPDF } from 'jspdf';
import type { HookData, UserOptions } from 'jspdf-autotable';
import messages from '~/shared/lib/i18n/es';
import { showToastSuccess } from '~/shared/lib/toast';
import { toLocalDayKey } from '~/shared/lib/date-utils';

/**
 * One row of the 13-column per-product inventory-at-sale-price ledger.
 * Typed numbers (NOT `toFixed` strings) — formatting happens at the display/PDF edge.
 *
 * Previously defined on the now-deleted `InventoryTodaySaleService` (an invented
 * aggregation class with no Angular correlate — rule 12). Angular computes these
 * rows inline in `InventoryTodaySaleComponent.generateProductRows()`
 * (frontend/src/app/presentation/reports/inventory-today-sale/inventory-today-sale.component.ts:176-226).
 * That route is not yet wired in React (Stage 7 remains pending on today-report.tsx);
 * this interface is kept here — the sole remaining consumer — for the PDF export shape.
 */
export interface InventoryTodaySaleRow {
  productId: string;
  /** Col 1 — Producto */
  productName: string;
  /** Col 2 — U (hardcoded literal, NOT a product unit-of-measure field — Angular parity) */
  unit: string;
  /** Col 3 — Inicio = available + vendido - entrada */
  inicio: number;
  /** Col 4 — Entrada = sum of today's inventory entry quantities */
  entrada: number;
  /** Col 5 — Disponible = available + vendido */
  disponible: number;
  /** Col 6 — Vendido = sum of today's order-item quantities */
  vendido: number;
  /** Col 7 — Precio Venta = avg(today's order-item prices), 0 if none */
  precioVenta: number;
  /** Col 8 — Importe Venta = vendido x precioVenta */
  importeVenta: number;
  /** Col 9 — Costo Unitario = quantity-weighted avg costPrice across active (available>0) entries */
  costoUnitario: number;
  /** Col 10 — Costo Total = vendido x costoUnitario */
  costoTotal: number;
  /** Col 11 — C.P Venta = costoTotal / importeVenta when importeVenta>0, else 0 */
  cpVenta: number;
  /** Col 12 — Final = disponible - vendido */
  final: number;
  /** Col 13 — Importe Final = final x costoUnitario */
  importeFinal: number;
}

/**
 * `exportInventoryTodaySalePdf` — 1:1 port of Angular's commented-out
 * `InventoryTodaySaleComponent.generateReport()`
 * (frontend/src/app/presentation/reports/inventory-today-sale/inventory-today-sale.component.ts:44-99),
 * the intended (never-shipped) PDF export for the 13-column inventory-at-sale-price ledger
 * (Stage 7, spec Slice B).
 *
 * Angular's export button is disabled — a bug, not a feature (angular-bugs-policy #511):
 * this port makes the export ACTUALLY WORK, producing a real PDF.
 *
 * The PDF is ALWAYS downloaded directly via a temporary `<a download>` element — never
 * opened in a new tab. When `filename` is given it is used verbatim (the per-day
 * sales-history export passes `<dayKey>_ipv.pdf`); otherwise the default name is today's
 * LOCAL date `yyyy-mm-dd_ipv.pdf`. Once the download is triggered, a success toast
 * (REPORTS.PDF_DOWNLOAD_SUCCESS) confirms completion.
 *
 * `jspdf`/`jspdf-autotable` are loaded via dynamic `import()` INSIDE this function body
 * (never at module top-level) so they stay out of the main bundle — same code-splitting
 * strategy as `statistics/components/chart-core.tsx` (recharts).
 */

const HEADERS = [
  'Producto',
  'U.M',
  'Inicio',
  'Entrada',
  'Disponible',
  'Vendido',
  'Precio Venta',
  'Importe Venta',
  'Costo Unitario',
  'Costo Total',
  'C.P Venta',
  'Final',
  'Importe Final',
] as const;

// Verbatim from Angular's commented `generateReport()` — all fields are static blank
// placeholders (no real admin/store data is substituted).
const ENCABEZADO = [
  'Empresa: _____________________       Procedencia: _____________________',
  'Unidad: _____________________         UBA: _____  OEE: _____  D__/__/__',
  'Departamento: ________________        Balance: _____  BAT: _____',
  'Firma del Administrador: _____________________________________________',
] as const;

const TITLE = 'INVENTARIO A PRECIO DE VENTA';

function toRowValues(row: InventoryTodaySaleRow): (string | number)[] {
  return [
    row.productName,
    row.unit,
    row.inicio,
    row.entrada,
    row.disponible,
    row.vendido,
    row.precioVenta.toFixed(2),
    row.importeVenta.toFixed(2),
    row.costoUnitario.toFixed(2),
    row.costoTotal.toFixed(2),
    row.cpVenta.toFixed(2),
    row.final,
    row.importeFinal.toFixed(2),
  ];
}

function drawHeader(doc: jsPDF): void {
  ENCABEZADO.forEach((linea, i) => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(linea, 40, 30 + i * 14);
  });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(TITLE, 300, 100);
}

export async function exportInventoryTodaySalePdf(
  rows: InventoryTodaySaleRow[],
  filename?: string,
): Promise<void> {
  const { jsPDF: JsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

  drawHeader(doc);

  const options: UserOptions = {
    head: [[...HEADERS]],
    body: rows.map(toRowValues),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [220, 220, 220], textColor: 0 },
    margin: { top: 120, left: 40, right: 40 },
    didDrawPage: (data: HookData) => {
      if (data.pageNumber > 1) {
        drawHeader(doc);
      }
    },
  };

  autoTable(doc, options);

  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);

  // Always download via a temporary <a download> — the legacy window.open new-tab path
  // is removed. Default name is today's LOCAL `yyyy-mm-dd_ipv.pdf`.
  const downloadName = filename ?? `${toLocalDayKey(new Date())}_ipv.pdf`;
  const link = document.createElement('a');
  link.href = pdfUrl;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Download triggered — confirm completion to the user.
  showToastSuccess(messages['REPORTS.PDF_DOWNLOAD_SUCCESS']);
}
