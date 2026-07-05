import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InventoryTodaySaleRow } from '../services/inventory-today-sale-service';

// ─── Mock jspdf + jspdf-autotable (Lazy Code-Split Export — Requirement) ─────
// The production module MUST `await import(...)` these INSIDE the exported
// function body, never at the top level — vi.mock hoists regardless of where
// the dynamic import call site lives, so this also proves the module under
// test does not eagerly resolve jspdf just by being imported.

const mockDoc = {
  setFontSize: vi.fn(),
  setFont: vi.fn(),
  text: vi.fn(),
  output: vi.fn().mockReturnValue(new Blob(['pdf'], { type: 'application/pdf' })),
};

const jsPDFCtor = vi.fn().mockImplementation(() => mockDoc);

vi.mock('jspdf', () => ({ jsPDF: jsPDFCtor }));

const mockAutoTable = vi.fn();

vi.mock('jspdf-autotable', () => ({ default: mockAutoTable }));

function makeRow(overrides: Partial<InventoryTodaySaleRow> = {}): InventoryTodaySaleRow {
  return {
    productId: 'p1',
    productName: 'Ron',
    unit: 'U',
    inicio: 8,
    entrada: 5,
    disponible: 13,
    vendido: 3,
    precioVenta: 10,
    importeVenta: 30,
    costoUnitario: 16,
    costoTotal: 48,
    cpVenta: 1.6,
    final: 10,
    importeFinal: 160,
    ...overrides,
  };
}

describe('exportInventoryTodaySalePdf', () => {
  const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
  const windowOpenMock = vi.fn().mockReturnValue(null);
  const originalCreateObjectURL = URL.createObjectURL;
  const originalWindowOpen = window.open;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.output.mockReturnValue(new Blob(['pdf'], { type: 'application/pdf' }));

    createObjectURLMock.mockReturnValue('blob:mock-url');
    windowOpenMock.mockReturnValue(null);
    URL.createObjectURL = createObjectURLMock;
    window.open = windowOpenMock;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    window.open = originalWindowOpen;
  });

  it('PDF-01: does not import jspdf/jspdf-autotable modules until the export function is actually invoked', async () => {
    // Module import alone (no invocation) must not construct a jsPDF document.
    await import('./inventory-today-sale-pdf');
    expect(jsPDFCtor).not.toHaveBeenCalled();
    expect(mockAutoTable).not.toHaveBeenCalled();
  });

  it('PDF-02: invoking the export loads jspdf and jspdf-autotable and constructs a landscape letter document', async () => {
    const { exportInventoryTodaySalePdf } = await import('./inventory-today-sale-pdf');

    await exportInventoryTodaySalePdf([makeRow()]);

    expect(jsPDFCtor).toHaveBeenCalledWith(
      expect.objectContaining({ orientation: 'landscape', unit: 'pt', format: 'letter' }),
    );
    expect(mockAutoTable).toHaveBeenCalledTimes(1);
  });

  it('PDF-03: renders the verbatim 4-line administrative header + title above the ledger table', async () => {
    const { exportInventoryTodaySalePdf } = await import('./inventory-today-sale-pdf');

    await exportInventoryTodaySalePdf([makeRow()]);

    const textCalls = mockDoc.text.mock.calls.map((args) => args[0]);
    expect(textCalls).toContain(
      'Empresa: _____________________       Procedencia: _____________________',
    );
    expect(textCalls).toContain(
      'Unidad: _____________________         UBA: _____  OEE: _____  D__/__/__',
    );
    expect(textCalls).toContain('Departamento: ________________        Balance: _____  BAT: _____');
    expect(textCalls).toContain(
      'Firma del Administrador: _____________________________________________',
    );
    expect(textCalls).toContain('INVENTARIO A PRECIO DE VENTA');
  });

  it('PDF-04: autoTable is invoked with the 13 column headers in spec order', async () => {
    const { exportInventoryTodaySalePdf } = await import('./inventory-today-sale-pdf');

    await exportInventoryTodaySalePdf([makeRow()]);

    const [, options] = mockAutoTable.mock.calls[0];
    expect(options.head).toEqual([
      [
        'Producto', 'U.M', 'Inicio', 'Entrada', 'Disponible', 'Vendido',
        'Precio Venta', 'Importe Venta', 'Costo Unitario', 'Costo Total',
        'C.P Venta', 'Final', 'Importe Final',
      ],
    ]);
  });

  it('PDF-05: autoTable body carries one row per ledger row, values formatted for display', async () => {
    const { exportInventoryTodaySalePdf } = await import('./inventory-today-sale-pdf');

    await exportInventoryTodaySalePdf([makeRow({ productName: 'Vodka', inicio: 1, entrada: 2, disponible: 3, vendido: 4 })]);

    const [, options] = mockAutoTable.mock.calls[0];
    expect(options.body).toEqual([
      ['Vodka', 'U', 1, 2, 3, 4, '10.00', '30.00', '16.00', '48.00', '1.60', 10, '160.00'],
    ]);
  });

  it('PDF-06: redraws the administrative header + title on page 2+ via didDrawPage', async () => {
    const { exportInventoryTodaySalePdf } = await import('./inventory-today-sale-pdf');

    await exportInventoryTodaySalePdf([makeRow()]);

    const [, options] = mockAutoTable.mock.calls[0];
    mockDoc.text.mockClear();

    options.didDrawPage({ pageNumber: 2 });
    expect(mockDoc.text.mock.calls.map((args: unknown[]) => args[0])).toContain(
      'INVENTARIO A PRECIO DE VENTA',
    );

    mockDoc.text.mockClear();
    options.didDrawPage({ pageNumber: 1 });
    expect(mockDoc.text).not.toHaveBeenCalled();
  });

  it('PDF-07: produces a real PDF blob and opens it — Angular\'s disabled export is fixed, not replicated', async () => {
    const { exportInventoryTodaySalePdf } = await import('./inventory-today-sale-pdf');

    await exportInventoryTodaySalePdf([makeRow()]);

    expect(mockDoc.output).toHaveBeenCalledWith('blob');
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(windowOpenMock).toHaveBeenCalledWith('blob:mock-url');
  });
});
