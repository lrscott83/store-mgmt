import type { jsPDF } from 'jspdf';
import type { HookData, UserOptions } from 'jspdf-autotable';
import type { InventoryTodaySaleRow } from '../services/inventory-today-sale-service';

/**
 * `exportInventoryTodaySalePdf` — 1:1 port of Angular's commented-out
 * `InventoryTodaySaleComponent.generateReport()`
 * (frontend/src/app/presentation/reports/inventory-today-sale/inventory-today-sale.component.ts:44-99),
 * the intended (never-shipped) PDF export for the 13-column inventory-at-sale-price ledger
 * (Stage 7, spec Slice B).
 *
 * Angular's export button is disabled — a bug, not a feature (angular-bugs-policy #511):
 * this port makes the export ACTUALLY WORK, producing and opening a real PDF.
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

export async function exportInventoryTodaySalePdf(rows: InventoryTodaySaleRow[]): Promise<void> {
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
  window.open(pdfUrl);
}
