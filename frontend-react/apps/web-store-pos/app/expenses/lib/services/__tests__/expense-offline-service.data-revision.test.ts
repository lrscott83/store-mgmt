// Movimiento 1 + 2 sobre la caché de gastos (`ExpenseOfflineService`).
//
// Mismo contrato que en el resto de servicios cubiertos, y sobre el mismo defecto:
// `getStorageExpenses()` solo recargaba con el array vacío o cambio de llave de tienda,
// así que un gasto creado por otra instancia (el formulario de gastos y el panel de
// Today Stats están montados a la vez) dejaba la vista con el total viejo.
//
// - Movimiento 2: la foto guarda la revisión con la que se hizo.
// - Movimiento 1: `setExpensesLocalStorage` es el ÚNICO `localStorage.setItem` de la
//   clase — create/update/deleteExpense/addImported/updateImported y el auto-init de la
//   lectura pasan por ahí — y avisa, agrupado por ráfaga.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Expense } from '@store-mgmt/domain';
import { ExpenseType, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import { ExpenseOfflineService } from '../expense-offline-service';
import {
  flushDataChangeNotifications,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';

const storeId = 's1';
const STORAGE_KEY = `lizoft.store-expenses-${storeId}`;

function makeExpense(id: string, total: number): Expense {
  return {
    id,
    type: ExpenseType.Otro,
    total,
    date: new Date('2026-01-15T10:00:00.000Z'),
    paymentType: PaymentType.Efectivo,
    salePaymentMethod: SalePaymentMethod.Efectivo,
    note: '',
    isActive: true,
    createdDate: new Date('2026-01-15T10:00:00.000Z'),
    createdByName: 'test',
  } as unknown as Expense;
}

function seed(...expenses: Expense[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

function svc(): ExpenseOfflineService {
  return new ExpenseOfflineService(storeId);
}

function totalFrom(service: ExpenseOfflineService): number {
  return service.getStorageExpenses().reduce((sum, e) => sum + e.total, 0);
}

describe('ExpenseOfflineService — invalidación por revisión y aviso en la escritura', () => {
  beforeEach(async () => {
    await flushDataChangeNotifications();
    useDataRevisionStore.setState({ revision: 0 });
    localStorage.clear();
    seed(makeExpense('e1', 10));
  });

  it('EX-1: otra instancia escribe → tras vaciar la cola, A lee el dato NUEVO', async () => {
    const a = svc();
    expect(totalFrom(a)).toBe(10);

    // B edita el gasto por la pantalla de edición, mientras el panel de total sigue montado.
    svc().update('e1', { total: 99 });
    await flushDataChangeNotifications();

    expect(totalFrom(a)).toBe(99);
  });

  it('EX-2: control — sin escritura, A sigue con su foto (si no, EX-1 no probaría nada)', () => {
    const a = svc();
    expect(totalFrom(a)).toBe(10);

    // Escritura directa al almacenamiento, sin pasar por la puerta que avisa.
    seed(makeExpense('e1', 99));
    a.getStorageExpenses();

    expect(totalFrom(a)).toBe(10);
  });

  it('EX-3: un gasto creado por otra instancia aparece tras vaciar la cola', async () => {
    const a = svc();
    expect(a.getStorageExpenses()).toHaveLength(1);

    svc().create({
      type: ExpenseType.Otro,
      total: 5,
      date: new Date(),
      paymentType: PaymentType.Efectivo,
    });
    await flushDataChangeNotifications();

    expect(a.getStorageExpenses()).toHaveLength(2);
    expect(totalFrom(a)).toBe(15);
  });

  it('EX-4: el borrado lógico de otra instancia se refleja sin volver a montar', async () => {
    const a = svc();
    expect(a.getActiveExpensesPriceBetweenDates(new Date(0), new Date(Date.now() + 1000))).toBe(10);

    svc().deleteExpense('e1');
    await flushDataChangeNotifications();

    expect(a.getActiveExpensesPriceBetweenDates(new Date(0), new Date(Date.now() + 1000))).toBe(0);
    // La fila sigue en el almacenamiento: borrado lógico, con rastro de auditoría.
    expect(a.getStorageExpenses()).toHaveLength(1);
  });

  it('EX-5: una ráfaga de escrituras produce UNA sola subida de revisión', async () => {
    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    const b = svc();
    for (let i = 0; i < 20; i += 1) {
      b.create({
        type: ExpenseType.Otro,
        total: 1,
        date: new Date(),
        paymentType: PaymentType.Efectivo,
      });
    }

    await flushDataChangeNotifications();

    expect(seen).toEqual([1]);
    expect(useDataRevisionStore.getState().revision).toBe(1);

    unsubscribe();
  });

  it('EX-6: la escritura de auto-inicialización NO dispara notificación', async () => {
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
    expect(cold.getStorageExpenses()).toHaveLength(0);
    await flushDataChangeNotifications();

    expect(seen).toEqual([]);
    expect(useDataRevisionStore.getState().revision).toBe(0);
    // Y el auto-init sí sembró: la tienda deja de estar "ausente" para las demás.
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    unsubscribe();
  });
});
