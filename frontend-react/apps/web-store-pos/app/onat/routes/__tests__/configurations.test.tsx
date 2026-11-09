import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { EFeatures, EModules } from '@store-mgmt/domain';
import { MENU_GROUPS } from '~/shared/lib/config/menu-config';
import {
  crearVectorVacio,
  getOnatVector,
  saveOnatVector,
  type OnatIdentidad,
  type OnatVector,
} from '~/onat/lib/onat-vector';
import {
  describeOwnerOnlyLoader,
  makeUser,
  renderWithIntl,
  resetOnatRouteSession,
  session,
} from './onat-route-harness';
import { OnatConfigurationsPage, clientLoader } from '../configurations';

const CURRENT_YEAR = new Date().getFullYear();
const PREVIOUS_YEAR = CURRENT_YEAR - 1;

function renderPage() {
  return renderWithIntl(<OnatConfigurationsPage />);
}

function identity(overrides: Partial<OnatIdentidad> = {}): OnatIdentidad {
  return { ...crearVectorVacio('u1', CURRENT_YEAR).identidad, ...overrides };
}

function seedVector(year: number, data: Partial<OnatVector> = {}): OnatVector {
  const vector: OnatVector = { ...crearVectorVacio('u1', year), ...data };
  saveOnatVector(vector);
  return vector;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetOnatRouteSession();
});

describeOwnerOnlyLoader('clientLoader de Configuraciones ONAT (solo el Owner)', clientLoader);

describe('módulo ONAT (módulo 22)', () => {
  it('desloguea al Owner cuando el módulo Onat no está disponible', async () => {
    session.user = makeUser({ storeModuleIds: [] });

    const result = await clientLoader();

    expect(session.logout).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get('Location')).toBe('/login');
  });
});

describe('Configuraciones del Vector Fiscal por año (S1, S8)', () => {
  it('carga el vector guardado del año actual', () => {
    session.user = makeUser();
    seedVector(CURRENT_YEAR, {
      identidad: identity({
        nombre: 'Panadería La Esquina',
        nit: '1234567890123',
        rc05: '1234567890123456',
        domicilioFiscal: 'Calle 1 # 2',
        domicilioLegal: 'Calle 3 # 4',
        municipio: 'Centro Habana',
        provincia: 'La Habana',
      }),
      actividades: [{ nombre: 'Elaboración de pan', codigo: '1071' }],
    });

    renderPage();

    expect(screen.getByLabelText('Nombre')).toHaveValue('Panadería La Esquina');
    expect(screen.getByLabelText('NIT')).toHaveValue('1234567890123');
    expect(screen.getByLabelText('RC-05')).toHaveValue('1234567890123456');
    expect(screen.getByLabelText('Domicilio fiscal')).toHaveValue('Calle 1 # 2');
    expect(screen.getByLabelText('Domicilio legal')).toHaveValue('Calle 3 # 4');
    expect(screen.getByLabelText('Municipio')).toHaveValue('Centro Habana');
    expect(screen.getByLabelText('Provincia')).toHaveValue('La Habana');
    expect(screen.getByLabelText('Nombre de la actividad')).toHaveValue('Elaboración de pan');
    expect(screen.getByLabelText('Código de la actividad')).toHaveValue('1071');

    const yearSelect = screen.getByLabelText('Año') as HTMLSelectElement;
    expect(yearSelect).toHaveValue(String(CURRENT_YEAR));
    expect(Array.from(yearSelect.options).map((option) => Number(option.value))).toEqual([
      CURRENT_YEAR,
      CURRENT_YEAR - 1,
      CURRENT_YEAR - 2,
      CURRENT_YEAR - 3,
      CURRENT_YEAR - 4,
    ]);
  });

  it('persiste la identidad completa y las actividades en el año actual', () => {
    session.user = makeUser();

    renderPage();

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Panadería La Esquina' },
    });
    fireEvent.change(screen.getByLabelText('NIT'), { target: { value: '1234567890123' } });
    fireEvent.change(screen.getByLabelText('RC-05'), {
      target: { value: '1234567890123456' },
    });
    fireEvent.change(screen.getByLabelText('Domicilio fiscal'), {
      target: { value: 'Calle 1 # 2' },
    });
    fireEvent.change(screen.getByLabelText('Domicilio legal'), {
      target: { value: 'Calle 3 # 4' },
    });
    fireEvent.change(screen.getByLabelText('Municipio'), { target: { value: 'Centro Habana' } });
    fireEvent.change(screen.getByLabelText('Provincia'), { target: { value: 'La Habana' } });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar actividad' }));
    fireEvent.change(screen.getByLabelText('Nombre de la actividad'), {
      target: { value: 'Elaboración de pan' },
    });
    fireEvent.change(screen.getByLabelText('Código de la actividad'), {
      target: { value: '1071' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByRole('status')).toHaveTextContent('Configuración guardada.');

    const stored = getOnatVector('u1', CURRENT_YEAR);
    expect(stored.ownerId).toBe('u1');
    expect(stored.year).toBe(CURRENT_YEAR);
    expect(stored.identidad).toEqual({
      nombre: 'Panadería La Esquina',
      nit: '1234567890123',
      rc05: '1234567890123456',
      domicilioFiscal: 'Calle 1 # 2',
      domicilioLegal: 'Calle 3 # 4',
      municipio: 'Centro Habana',
      provincia: 'La Habana',
    });
    expect(stored.actividades).toEqual([{ nombre: 'Elaboración de pan', codigo: '1071' }]);
  });

  it('conserva obligaciones, bonificaciones, gastos sin comprobante y correcciones del año', () => {
    session.user = makeUser();
    const seeded = seedVector(CURRENT_YEAR, {
      identidad: identity({ nombre: 'Panadería La Esquina' }),
      obligaciones: [
        {
          periodo: `${CURRENT_YEAR}-01`,
          vence: `${CURRENT_YEAR}-01-20`,
          codigo: '0114022',
          importe: 1200,
          porcentaje: null,
          base: 'fija',
          rc04a: '30016',
          pagado: true,
          canalPago: null,
        },
      ],
      bonificaciones: [
        { id: 'b1', nombre: 'Pronto pago', tipo: 'porcentaje', valor: 5, aplica: 'base' },
      ],
      gastosSinComprobante: { activo: true, porcentaje: 15 },
      overrides: {
        [`${CURRENT_YEAR}-01`]: {
          ingresos: { original: 1000, value: 1200, editedAt: '2026-01-31T00:00:00.000Z' },
        },
      },
    });

    renderPage();

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Panadería El Vedado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByRole('status')).toHaveTextContent('Configuración guardada.');
    expect(getOnatVector('u1', CURRENT_YEAR)).toEqual({
      ...seeded,
      identidad: { ...seeded.identidad, nombre: 'Panadería El Vedado' },
    });
  });

  it('al cambiar de año muestra los datos de ese año y guarda solo en él', () => {
    session.user = makeUser();
    seedVector(CURRENT_YEAR, {
      identidad: identity({ nombre: 'Panadería Actual', rc05: '1111111111111111' }),
      actividades: [{ nombre: 'Actividad actual', codigo: '1071' }],
    });
    seedVector(PREVIOUS_YEAR, {
      identidad: identity({ nombre: 'Panadería Anterior', rc05: '2222222222222222' }),
      actividades: [{ nombre: 'Actividad anterior', codigo: '1072' }],
    });

    renderPage();

    expect(screen.getByLabelText('Nombre')).toHaveValue('Panadería Actual');

    fireEvent.change(screen.getByLabelText('Año'), {
      target: { value: String(PREVIOUS_YEAR) },
    });

    expect(screen.getByLabelText('Nombre')).toHaveValue('Panadería Anterior');
    expect(screen.getByLabelText('RC-05')).toHaveValue('2222222222222222');
    expect(screen.getByLabelText('Nombre de la actividad')).toHaveValue('Actividad anterior');
    expect(screen.getByLabelText('Código de la actividad')).toHaveValue('1072');
    expect(screen.queryByDisplayValue('Panadería Actual')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Panadería Anterior editada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByRole('status')).toHaveTextContent('Configuración guardada.');
    expect(getOnatVector('u1', PREVIOUS_YEAR).identidad.nombre).toBe('Panadería Anterior editada');
    expect(getOnatVector('u1', CURRENT_YEAR).identidad.nombre).toBe('Panadería Actual');

    fireEvent.change(screen.getByLabelText('Año'), {
      target: { value: String(CURRENT_YEAR) },
    });

    expect(screen.getByLabelText('Nombre')).toHaveValue('Panadería Actual');
    expect(screen.getByLabelText('Nombre de la actividad')).toHaveValue('Actividad actual');
  });

  it('muestra un error y ningún éxito cuando el almacenamiento rechaza la escritura', () => {
    session.user = makeUser();
    seedVector(CURRENT_YEAR, {
      identidad: identity({ nombre: 'Panadería La Esquina' }),
    });

    // El almacenamiento rechaza toda escritura: `saveOnatVector` lo traduce a
    // `{ succeeded: false }` y la pantalla debe mostrar el error, nunca el éxito.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    try {
      renderPage();

      fireEvent.change(screen.getByLabelText('Nombre'), {
        target: { value: 'Panadería El Vedado' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'No se pudo guardar. Revisa el almacenamiento del navegador e inténtalo de nuevo.',
      );
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      // Nada se persistió: lo escrito sigue en el formulario y el almacén conserva lo anterior.
      expect(screen.getByLabelText('Nombre')).toHaveValue('Panadería El Vedado');
      expect(getOnatVector('u1', CURRENT_YEAR).identidad.nombre).toBe('Panadería La Esquina');
    } finally {
      setItem.mockRestore();
    }
  });

  it('permite quitar una actividad agregada', () => {
    session.user = makeUser();

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar actividad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar actividad' }));
    expect(screen.getAllByLabelText('Nombre de la actividad')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[1]);

    expect(screen.getAllByLabelText('Nombre de la actividad')).toHaveLength(1);
  });
});

describe('menú ONAT (S1)', () => {
  it('coloca el grupo Onat inmediatamente antes de Gestión', () => {
    const labels = MENU_GROUPS.map((group) => group.groupLabel);

    expect(labels).toContain('MENU.ONAT');
    expect(labels.indexOf('MENU.ONAT')).toBe(labels.indexOf('MENU.MANAGEMENT') - 1);
  });

  it('ofrece Vector Fiscal y Configuraciones solo al Owner y con el módulo 22', () => {
    const group = MENU_GROUPS.find((candidate) => candidate.groupLabel === 'MENU.ONAT');

    expect(group).toBeDefined();
    const items = group?.items ?? [];
    expect(items.map((item) => item.path)).toEqual([
      '/onat/vector-fiscal',
      '/onat/configurations',
    ]);

    const owner = makeUser();
    const superAdmin = makeUser({ isSuperAdmin: true, isOwnerAdmin: true });
    const storeUser = makeUser({ isOwnerAdmin: false });

    for (const item of items) {
      expect(item.featureIds).toEqual([EFeatures.Onat]);
      expect(item.moduleId).toBe(EModules.Onat);
      expect(item.moduleIds).toEqual([EModules.Onat]);
      expect(Object.keys(item)).not.toContain('icon');
      expect(item.rolesOnly?.(owner)).toBe(true);
      expect(item.rolesOnly?.(superAdmin)).toBe(false);
      expect(item.rolesOnly?.(storeUser)).toBe(false);
    }
  });
});
