// Movimiento 1 + 2 sobre la caché de créditos (`SaleCreditOfflineService`).
//
// El panel de "Créditos Por Cobrar" y el de "Créditos Pagados" se montan a la vez sobre
// la misma lista. Antes, un cobro registrado en uno dejaba el otro con la foto vieja,
// porque `getStorageSaleCredits()` solo recargaba con el array vacío o cambio de llave.
//
// - Movimiento 2: la foto guarda la revisión con la que se hizo.
// - Movimiento 1: `setSaleCreditsLocalStorage` es el ÚNICO `localStorage.setItem` de la
//   clase — create/update/paid/delete (que además backs `deactivateSaleCreditByOrderId`),
//   los dos import y el auto-init de la lectura pasan por ahí — y avisa, agrupado.
import { beforeEach, describe, expect, it } from 'vitest';
import type { SaleCredit } from '@store-mgmt/domain';
import { PaymentType } from '@store-mgmt/domain';
import { SaleCreditOfflineService } from '../sale-credit-offline-service';
import {
  flushDataChangeNotifications,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';

const storeId = 's1';
const STORAGE_KEY = `lizoft.store-saleCredits-${storeId}`;

function makeCredit(id: string, total: number): SaleCredit {
  return {
    id,
    orderId: `order-${id}`,
    client: 'Cliente 1',
    total,
    date: new Date('2026-01-15T10:00:00.000Z'),
    paid: 0,
    isPaid: false,
    isActive: true,
    paidDate: null as unknown as Date,
    paidType: null as unknown as PaymentType,
    note: '',
    createdDate: new Date('2026-01-15T10:00:00.000Z'),
    createdByName: 'test',
  } as unknown as SaleCredit;
}

function seed(...credits: SaleCredit[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credits));
}

function svc(): SaleCreditOfflineService {
  return new SaleCreditOfflineService(storeId);
}

function unpaidTotal(service: SaleCreditOfflineService): number {
  return service.getStorageSaleCredits().filter((c) => c.isActive && !c.isPaid).length;
}

describe('SaleCreditOfflineService — invalidación por revisión y aviso en la escritura', () => {
  beforeEach(async () => {
    await flushDataChangeNotifications();
    useDataRevisionStore.setState({ revision: 0 });
    localStorage.clear();
    seed(makeCredit('c1', 50));
  });

  it('SC-1: otra instancia cobra → tras vaciar la cola, A lee el dato NUEVO', async () => {
    const a = svc();
    expect(unpaidTotal(a)).toBe(1);

    // B registra el cobro (el botón de la fila) mientras el panel sigue montado.
    svc().paidSaleCredit('c1', PaymentType.Efectivo, 'abono');
    await flushDataChangeNotifications();

    expect(unpaidTotal(a)).toBe(0);
    // Y el crédito pagado ahora aparece en su panel, sin remontarlo.
    expect(a.getStorageSaleCredits().find((c) => c.id === 'c1')!.isPaid).toBe(true);
  });

  it('SC-2: control — sin escritura, A sigue con su foto (si no, SC-1 no probaría nada)', () => {
    const a = svc();
    expect(unpaidTotal(a)).toBe(1);

    // Escritura directa al almacenamiento, sin pasar por la puerta que avisa.
    seed({ ...makeCredit('c1', 50), isPaid: true, paid: 50 });
    a.getStorageSaleCredits();

    expect(unpaidTotal(a)).toBe(1);
  });

  it('SC-3: un crédito creado por otra instancia aparece tras vaciar la cola', async () => {
    const a = svc();
    expect(a.getStorageSaleCredits()).toHaveLength(1);

    // Es el caso real de la venta a crédito: `createOrder` la dispara en el carrito.
    svc().createSaleCredit('o9', 'Cliente 9', 120, '');
    await flushDataChangeNotifications();

    expect(a.getStorageSaleCredits()).toHaveLength(2);
    expect(unpaidTotal(a)).toBe(2);
  });

  it('SC-4: el borrado lógico de otra instancia se refleja sin volver a montar', async () => {
    const a = svc();
    expect(a.getSaleCreditsInDay(new Date('2026-01-15T12:00:00.000Z')).data).toHaveLength(1);

    svc().deleteSaleCredit('c1');
    await flushDataChangeNotifications();

    expect(a.getSaleCreditsInDay(new Date('2026-01-15T12:00:00.000Z')).data).toHaveLength(0);
    // La fila sobrevive: borrado lógico, con rastro de auditoría.
    expect(a.getStorageSaleCredits()).toHaveLength(1);
  });

  it('SC-5: una ráfaga de escrituras produce UNA sola subida de revisión', async () => {
    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    const b = svc();
    for (let i = 0; i < 20; i += 1) b.createSaleCredit(`o${i}`, `Cliente ${i}`, 10, '');

    await flushDataChangeNotifications();

    expect(seen).toEqual([1]);
    expect(useDataRevisionStore.getState().revision).toBe(1);

    unsubscribe();
  });

  it('SC-6: la escritura de auto-inicialización NO dispara notificación', async () => {
    // Lectura en frío de una tienda genuinamente vacía: el servicio siembra un array
    // vacío en el almacenamiento. Eso NO es un cambio de datos — no había nada que
    // alguien pudiera tener viejo — así que no puede subir la revisión: hacerlo
    // invalidaría la foto que el propio auto-init acaba de llenar y duplicaría el
    // descifrado en cada instancia en frío de cada servicio.
    localStorage.clear();
    localStorage.setItem(`lizoft.store-products-${storeId}`, '[]');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    const cold = svc();
    expect(cold.getStorageSaleCredits()).toHaveLength(0);
    await flushDataChangeNotifications();

    expect(seen).toEqual([]);
    expect(useDataRevisionStore.getState().revision).toBe(0);
    // Y el auto-init sí sembró: la tienda deja de estar "ausente" para las demás.
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    unsubscribe();
  });
});
