// Movimiento 1 + 2 sobre la configuración de métodos de pago
// (`StorePaymentMethodsConfigService`).
//
// Este servicio es el caso donde el aviso NO se puso en "la puerta" porque había una:
// `persistChannels` escribía con su propio `localStorage.setItem` y `setConfigLocalStorage`
// escribía con otro. Con dos puertas, "siempre avisar" dependía de acordarse en las dos.
// Aquí `persistChannels` delega en `setConfigLocalStorage` y queda UNA sola, que avisa.
//
// Importa de verdad: la configuración se resuelve DENTRO de un render (CartShell lo lee en
// un `useMemo`), así que un método deshabilitado por otra pantalla tiene que verse sin
// remontar el carrito.
//
// Canales: se usan solo combinaciones REALES del catálogo (`Zelle` solo paga en USD, y
// `Transferencia` en CUP sí existe). Un par inventado como Zelle+CUP sería descartado
// por `persistChannels` al reordenar contra el catálogo, y el test probaría un no-op.
import { beforeEach, describe, expect, it } from 'vitest';
import { Currency, PAYMENT_CHANNELS, SalePaymentMethod, channelKey } from '@store-mgmt/domain';
import {
  ALL_CHANNEL_KEYS,
  StorePaymentMethodsConfigService,
} from '../store-payment-methods-config-service';
import {
  flushDataChangeNotifications,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';

const storeId = 's1';
const STORAGE_KEY = `lizoft.store-storePaymentMethods-${storeId}`;
const zelleUsd = channelKey(SalePaymentMethod.Zelle, Currency.USD);
const transferenciaCup = channelKey(SalePaymentMethod.Transferencia, Currency.CUP);

function seed(enabledChannels: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabledChannels }));
}

function svc(): StorePaymentMethodsConfigService {
  return new StorePaymentMethodsConfigService(storeId);
}

function channelsOf(service: StorePaymentMethodsConfigService): string[] {
  return service.getEnabledChannels();
}

describe('StorePaymentMethodsConfigService — invalidación por revisión y aviso en la escritura', () => {
  beforeEach(async () => {
    await flushDataChangeNotifications();
    useDataRevisionStore.setState({ revision: 0 });
    localStorage.clear();
    // Se parte de una config explícita (no del default por auto-init) para que la foto
    // sea un estado conocido y el test no dependa del camino de inicialización.
    seed(ALL_CHANNEL_KEYS.filter((key) => key !== zelleUsd && key !== transferenciaCup));
  });

  it('PM-1: otra instancia rehabilita un canal → tras vaciar la cola, A lee el NUEVO', async () => {
    const a = svc();
    expect(channelsOf(a)).not.toContain(zelleUsd);
    expect(a.isChannelEnabled(SalePaymentMethod.Zelle, Currency.USD)).toBe(false);

    // B lo rehabilita desde la pantalla de configuración de métodos de pago.
    svc().setChannelEnabled(storeId, SalePaymentMethod.Zelle, Currency.USD, true);
    await flushDataChangeNotifications();

    expect(channelsOf(a)).toContain(zelleUsd);
    expect(a.isChannelEnabled(SalePaymentMethod.Zelle, Currency.USD)).toBe(true);
  });

  it('PM-2: control — sin escritura, A sigue con su foto (si no, PM-1 no probaría nada)', () => {
    const a = svc();
    expect(channelsOf(a)).not.toContain(zelleUsd);

    // Escritura directa al almacenamiento, sin pasar por la puerta que avisa.
    seed([...ALL_CHANNEL_KEYS]);
    a.getConfig();

    expect(channelsOf(a)).not.toContain(zelleUsd);
    expect(a.isChannelEnabled(SalePaymentMethod.Zelle, Currency.USD)).toBe(false);
  });

  it('PM-3: el método habilitado aparece en SU moneda sin afectar a las demás', async () => {
    const a = svc();
    // La semilla lo tiene deshabilitado: Transferencia no se ofrece en CUP.
    expect(a.getEnabledMethodsForCurrency(Currency.CUP)).not.toContain(
      SalePaymentMethod.Transferencia,
    );

    svc().setChannelEnabled(storeId, SalePaymentMethod.Transferencia, Currency.CUP, true);
    await flushDataChangeNotifications();

    expect(a.getEnabledMethodsForCurrency(Currency.CUP)).toContain(SalePaymentMethod.Transferencia);
    // Efectivo nunca se puede deshabilitar: sigue ahí pase lo que pase.
    expect(a.getEnabledMethodsForCurrency(Currency.CUP)).toContain(SalePaymentMethod.Efectivo);
    // Y el canal es POR MONEDA: habilitar Transferencia en CUP no toca el de USD, que ya
    // estaba activo, ni el de otras monedas donde no existe.
    expect(a.isChannelEnabled(SalePaymentMethod.Transferencia, Currency.USD)).toBe(true);
    expect(a.getEnabledMethodsForCurrency(Currency.EUR)).not.toContain(
      SalePaymentMethod.Transferencia,
    );
  });

  it('PM-4: la importación desde respaldo también avisa (misma puerta de escritura)', async () => {
    const a = svc();
    expect(channelsOf(a)).not.toContain(zelleUsd);

    svc().setConfigFromBackup({ enabledChannels: [zelleUsd] });
    await flushDataChangeNotifications();

    expect(channelsOf(a)).toEqual([zelleUsd]);
  });

  it('PM-5: una ráfaga de escrituras produce UNA sola subida de revisión', async () => {
    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    // 8 toggles REALES de canales DISTINTOS del catálogo, cada uno con su escritura.
    // (Tocar 8 veces el mismo canal no serviría: `setChannelEnabled` corta en no-op.)
    const b = svc();
    const targets = PAYMENT_CHANNELS.filter((c) => channelKey(c.method, c.currency) !== zelleUsd);
    for (const { method, currency } of targets.slice(0, 8)) {
      b.setChannelEnabled(storeId, method, currency, false);
    }

    await flushDataChangeNotifications();

    expect(seen).toEqual([1]);
    expect(useDataRevisionStore.getState().revision).toBe(1);

    unsubscribe();
  });
});
