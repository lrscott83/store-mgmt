// Movimiento 1 + 2 sobre la caché de tasas de canal (`ChannelRateOfflineService`).
//
// El registro es append-only y vive detrás de una pantalla de manutenção: registrar una
// tasa nueva desde otra instancia dejaba a la montada con `getRateAt()` resolviendo la
// tasa anterior, porque `getStorageChannelRates()` solo recargaba con el array vacío o
// cambio de llave.
//
// - Movimiento 2: la foto guarda la revisión con la que se hizo.
// - Movimiento 1: `setRatesLocalStorage` es el ÚNICO `localStorage.setItem` de la clase —
//   `registerRate`, `setChannelRateActive`, `addImportedChannelRate` y el auto-init de la
//   lectura pasan por ahí — y avisa, agrupado.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChannelRate } from '@store-mgmt/domain';
import { Currency, SalePaymentMethod } from '@store-mgmt/domain';
import { ChannelRateOfflineService } from '../channel-rate-offline-service';
import {
  flushDataChangeNotifications,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';

const storeId = 's1';
const STORAGE_KEY = `lizoft.store-channelRates-${storeId}`;
const effectiveFrom = new Date('2026-01-01T00:00:00.000Z');

function makeRate(id: string, sellValue: number): ChannelRate {
  return {
    id,
    method: SalePaymentMethod.Zelle,
    currency: Currency.USD,
    buyValue: sellValue,
    sellValue,
    effectiveFrom: new Date(effectiveFrom),
    createdDate: new Date(effectiveFrom),
  } as unknown as ChannelRate;
}

function seed(...rates: ChannelRate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
}

function svc(): ChannelRateOfflineService {
  return new ChannelRateOfflineService(storeId);
}

function sellValueAt(service: ChannelRateOfflineService, at: Date): number | undefined {
  return service.getStorageChannelRates().filter((r) => r.effectiveFrom <= at).at(-1)?.sellValue;
}

describe('ChannelRateOfflineService — invalidación por revisión y aviso en la escritura', () => {
  beforeEach(async () => {
    await flushDataChangeNotifications();
    useDataRevisionStore.setState({ revision: 0 });
    localStorage.clear();
    seed(makeRate('r1', 100));
  });

  it('CR-1: otra instancia registra una tasa → tras vaciar la cola, A lee el dato NUEVO', async () => {
    const a = svc();
    expect(a.getStorageChannelRates()).toHaveLength(1);

    // B registra una tasa con efecto posterior (otra pantalla, otra instancia).
    svc().registerRate({
      method: SalePaymentMethod.Zelle,
      currency: Currency.USD,
      buyValue: 120,
      sellValue: 120,
      effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
    });
    await flushDataChangeNotifications();

    expect(a.getStorageChannelRates()).toHaveLength(2);
    expect(sellValueAt(a, new Date('2026-03-01T00:00:00.000Z'))).toBe(120);
  });

  it('CR-2: control — sin escritura, A sigue con su foto (si no, CR-1 no probaría nada)', () => {
    const a = svc();
    expect(a.getStorageChannelRates()).toHaveLength(1);

    // Escritura directa al almacenamiento, sin pasar por la puerta que avisa.
    seed(makeRate('r1', 100), makeRate('r2', 500));
    a.getStorageChannelRates();

    expect(a.getStorageChannelRates()).toHaveLength(1);
  });

  it('CR-3: el dominio resuelve la tasa nueva sin volver a montar', async () => {
    const a = svc();
    const at = new Date('2026-03-01T00:00:00.000Z');
    const before = a.getRateAt(SalePaymentMethod.Zelle, Currency.USD, at).data;

    svc().registerRate({
      method: SalePaymentMethod.Zelle,
      currency: Currency.USD,
      buyValue: 130,
      sellValue: 130,
      effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
    });
    await flushDataChangeNotifications();

    const after = a.getRateAt(SalePaymentMethod.Zelle, Currency.USD, at).data;
    // Lo resuelto por A cambió (no es la tasa que ya tenía en memoria)...
    expect(after).not.toEqual(before);
    // ...y coincide EXACTAMENTE con lo que resuelve una instancia recién construida,
    // que es la verdad persistida. Esa igualdad es el contrato, sin codificar a mano la
    // escala a la que el dominio convierte el valor.
    expect(after).toEqual(svc().getRateAt(SalePaymentMethod.Zelle, Currency.USD, at).data);

    // El histórico NO se reescribe: antes del corte sigue mandando la tasa anterior.
    const earlier = new Date('2026-01-15T00:00:00.000Z');
    expect(a.getRateAt(SalePaymentMethod.Zelle, Currency.USD, earlier).data).toEqual(before);
  });

  it('CR-4: desactivar una tasa en otra instancia se refleja sin volver a montar', async () => {
    const a = svc();
    expect(a.getStorageChannelRates()).toHaveLength(1);

    svc().setChannelRateActive('r1', false);
    await flushDataChangeNotifications();

    expect(a.getStorageChannelRates()).toHaveLength(1);
    expect(a.getStorageChannelRates()[0].isActive).toBe(false);
  });

  it('CR-5: una ráfaga de escrituras produce UNA sola subida de revisión', async () => {
    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    const b = svc();
    for (let i = 0; i < 20; i += 1) {
      b.registerRate({
        method: SalePaymentMethod.Zelle,
        currency: Currency.USD,
        buyValue: 100 + i,
        sellValue: 100 + i,
        effectiveFrom: new Date(effectiveFrom),
      });
    }

    await flushDataChangeNotifications();

    expect(seen).toEqual([1]);
    expect(useDataRevisionStore.getState().revision).toBe(1);

    unsubscribe();
  });

  it('CR-6: la escritura de auto-inicialización NO dispara notificación', async () => {
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
    expect(cold.getStorageChannelRates()).toHaveLength(0);
    await flushDataChangeNotifications();

    expect(seen).toEqual([]);
    expect(useDataRevisionStore.getState().revision).toBe(0);
    // Y el auto-init sí sembró: la tienda deja de estar "ausente" para las demás.
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    unsubscribe();
  });
});
