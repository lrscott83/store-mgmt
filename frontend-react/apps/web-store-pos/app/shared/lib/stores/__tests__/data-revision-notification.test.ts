// Movimiento 1 — la vía de escritura que SIEMPRE avisa (`notifyDataChanged`) y su agrupado.
//
// El store tiene DOS entradas con semánticas distintas a propósito:
// - `bumpDataRevision()` es INMEDIATA. Ya tenía callers y tests que leen la revisión en
//   el mismo tick, así que su semántica no se toca (contraste explícito al final).
// - `notifyDataChanged()` es AGRUPADA. Es la que llama la única puerta de escritura de
//   cada servicio, así que "escribir sin avisar" deja de ser posible por disciplina.
//
// El agrupado no es cosmético: avisar es barato, pero ACTUAR sobre el aviso rehace la
// foto de la caché, que descifra el almacenamiento. Sin agrupar, una importación de 500
// filas rehace 500 fotos.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bumpDataRevision,
  flushDataChangeNotifications,
  notifyDataChanged,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';

describe('notifyDataChanged — aviso agrupado por ráfaga', () => {
  beforeEach(async () => {
    // Drena cualquier aviso de un test anterior: el flag de cola es de módulo, y un
    // `setState` a ciegas lo dejaría desincronizado con la revisión.
    await flushDataChangeNotifications();
    useDataRevisionStore.setState({ revision: 0 });
  });

  it('NC-1: no bumpea de forma síncrona — el aviso se entrega cuando se vacía la cola', async () => {
    notifyDataChanged();

    // Todavía NO: agrupar significa exactamente eso, el aviso no es inmediato.
    expect(useDataRevisionStore.getState().revision).toBe(0);

    await flushDataChangeNotifications();

    expect(useDataRevisionStore.getState().revision).toBe(1);
  });

  it('NC-2: una ráfaga de N escrituras produce UNA sola subida de revisión', async () => {
    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    // N escrituras seguidas, todas en el mismo tick — el caso de una importación.
    for (let i = 0; i < 50; i += 1) notifyDataChanged();

    await flushDataChangeNotifications();

    // Un suscriptor observa UN cambio, no 50: ese es el objetivo del agrupado.
    expect(seen).toEqual([1]);
    expect(useDataRevisionStore.getState().revision).toBe(1);

    unsubscribe();
  });

  it('NC-3: ráfagas en ticks distintos producen una subida cada una', async () => {
    const first = useDataRevisionStore.getState().revision;
    notifyDataChanged();
    await flushDataChangeNotifications();
    const afterFirst = useDataRevisionStore.getState().revision;

    // Segunda ráfaga: ya no hay nada pendiente, así que vuelve a avisar.
    notifyDataChanged();
    await flushDataChangeNotifications();
    const afterSecond = useDataRevisionStore.getState().revision;

    expect(afterFirst).toBe(first + 1);
    expect(afterSecond).toBe(first + 2);
  });

  it('NC-4: un aviso pendiente se POSPONE ante un bump inmediato, no se suma', async () => {
    // Es exactamente lo que pasa en `createOrder`: escribe (avisa) y luego llama a
    // `bumpDataRevision()` porque además descontó existencias. Una venta no puede costar
    // dos revisiones, o cada vista suscrita recalcularía dos veces por la misma venta.
    notifyDataChanged();
    bumpDataRevision();

    expect(useDataRevisionStore.getState().revision).toBe(1);

    await flushDataChangeNotifications();

    // El bump inmediato ya avisó a todo el mundo: el aviso agrupado se retira.
    expect(useDataRevisionStore.getState().revision).toBe(1);
  });

  it('NC-5: tras el postpone, una ráfaga posterior vuelve a avisar con normalidad', async () => {
    notifyDataChanged();
    bumpDataRevision();
    await flushDataChangeNotifications();

    notifyDataChanged();
    await flushDataChangeNotifications();

    expect(useDataRevisionStore.getState().revision).toBe(2);
  });

  it('NC-9: devuelve la revisión que tendrá el aviso, para que el escritor se selle', async () => {
    const stamped = notifyDataChanged();

    // Lo que devuelve es la revisión INMEDIATA de la entrega, no la actual: por eso el
    // escritor puede sellar su propia foto sin que la próxima lectura lo invalide.
    expect(stamped).toBe(1);
    expect(useDataRevisionStore.getState().revision).toBe(0);

    await flushDataChangeNotifications();

    // Y tras la entrega, ese sello ya es el valor vigente: coincide y no recarga.
    expect(stamped).toBe(useDataRevisionStore.getState().revision);
  });

  it('NC-10: dos escrituras en la misma ráfaga reciben el MISMO sello', () => {
    const first = notifyDataChanged();
    const second = notifyDataChanged();

    // Aunque solo se encola un aviso, ambas escrituras se sellan con la misma revisión
    // futura: si la segunda devolviera "actual + 1" sobre una revisión que aún no subió,
    // quedaría sellada por encima de la entrega real y recargaría sin motivo.
    expect(first).toBe(second);
  });
});

describe('bumpDataRevision — la semántica inmediata no cambia', () => {
  beforeEach(async () => {
    await flushDataChangeNotifications();
    useDataRevisionStore.setState({ revision: 0 });
  });

  it('NC-6: bumpea de forma síncrona, sin esperar a la cola', () => {
    expect(useDataRevisionStore.getState().revision).toBe(0);

    bumpDataRevision();

    // Inmediato: el valor YA está actualizado en la misma línea, sin `await`.
    expect(useDataRevisionStore.getState().revision).toBe(1);

    bumpDataRevision();
    expect(useDataRevisionStore.getState().revision).toBe(2);
  });

  it('NC-7: un bump inmediato no queda pendiente de vaciado', async () => {
    bumpDataRevision();
    await flushDataChangeNotifications();

    // Vaciar la cola sin ningún aviso encolado NO debe mover la revisión: si lo hiciera,
    // "inmediato" y "agrupado" serían la misma cosa y el postpone de NC-4 no valdría.
    expect(useDataRevisionStore.getState().revision).toBe(1);
  });

  it('NC-8: avisar después de bumpear en el mismo tick sí produce una subida nueva', async () => {
    const spy = vi.fn();
    const unsubscribe = useDataRevisionStore.subscribe(spy);

    bumpDataRevision();
    notifyDataChanged();
    await flushDataChangeNotifications();

    expect(useDataRevisionStore.getState().revision).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
