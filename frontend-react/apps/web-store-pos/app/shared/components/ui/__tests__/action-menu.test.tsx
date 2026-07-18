import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionMenu, ActionMenuItem } from '../action-menu';
import type { ActionIntent } from '../action-menu';

describe('ActionMenu — trigger & dropdown (S-GM-MENU)', () => {
  it('S-GM-MENU-1: menu is closed by default', () => {
    render(
      <ActionMenu>
        <ActionMenuItem onClick={vi.fn()}>Item</ActionMenuItem>
      </ActionMenu>,
    );
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('S-GM-MENU-2: clicking the trigger opens the menu and sets aria-expanded', () => {
    render(
      <ActionMenu>
        <ActionMenuItem onClick={vi.fn()}>Item</ActionMenuItem>
      </ActionMenu>,
    );
    const trigger = screen.getByRole('button', { name: /acciones/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('S-GM-MENU-3: click outside closes the menu', () => {
    render(
      <div>
        <ActionMenu>
          <ActionMenuItem onClick={vi.fn()}>Item</ActionMenuItem>
        </ActionMenu>
        <div data-testid="outside">outside</div>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('S-GM-MENU-4: custom label and testId are honored', () => {
    render(
      <ActionMenu label="Opciones de categoría" testId="category-actions-toggle-1">
        <ActionMenuItem onClick={vi.fn()}>Item</ActionMenuItem>
      </ActionMenu>,
    );
    expect(screen.getByRole('button', { name: /opciones de categoría/i })).toBeInTheDocument();
    expect(screen.getByTestId('category-actions-toggle-1')).toBeInTheDocument();
  });
});

describe('ActionMenuItem — intent colors, icon, separator (S-GM-ITEM)', () => {
  it('S-GM-ITEM-1: click fires onClick and closes the menu', () => {
    const onClick = vi.fn();
    render(
      <ActionMenu>
        <ActionMenuItem intent="edit" onClick={onClick}>
          Editar
        </ActionMenuItem>
      </ActionMenu>,
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it("S-GM-ITEM-2: each intent maps to its color class and default icon", () => {
    const intents: ActionIntent[] = [
      'edit',
      'create',
      'pay',
      'activate',
      'approve',
      'deactivate',
      'disapprove',
      'delete',
    ];
    const expectedClass: Record<ActionIntent, string> = {
      edit: 'text-primary',
      create: 'text-primary',
      pay: 'text-success',
      activate: 'text-success',
      approve: 'text-success',
      deactivate: 'text-warning',
      disapprove: 'text-warning',
      delete: 'text-danger',
    };
    render(
      <ActionMenu>
        {intents.map((intent) => (
          <ActionMenuItem key={intent} intent={intent} onClick={vi.fn()}>
            {intent}
          </ActionMenuItem>
        ))}
      </ActionMenu>,
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    for (const intent of intents) {
      const item = screen.getByRole('menuitem', { name: intent });
      expect(item).toHaveClass(expectedClass[intent]);
      expect(item.querySelector('svg')).toBeTruthy();
    }
  });

  it('S-GM-ITEM-3: neutral item with no intent uses text-text and renders no icon', () => {
    render(
      <ActionMenu>
        <ActionMenuItem onClick={vi.fn()}>Neutral</ActionMenuItem>
      </ActionMenu>,
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    const item = screen.getByRole('menuitem', { name: 'Neutral' });
    expect(item).toHaveClass('text-text');
    expect(item.querySelector('svg')).toBeNull();
  });

  it('S-GM-ITEM-4: icon={null} suppresses the icon', () => {
    render(
      <ActionMenu>
        <ActionMenuItem intent="edit" icon={null} onClick={vi.fn()}>
          Editar
        </ActionMenuItem>
      </ActionMenu>,
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    const item = screen.getByRole('menuitem', { name: 'Editar' });
    expect(item.querySelector('svg')).toBeNull();
  });

  it('S-GM-ITEM-5: separatorBefore renders a divider immediately before the item', () => {
    render(
      <ActionMenu>
        <ActionMenuItem intent="edit" onClick={vi.fn()}>
          Editar
        </ActionMenuItem>
        <ActionMenuItem intent="delete" separatorBefore onClick={vi.fn()}>
          Eliminar
        </ActionMenuItem>
      </ActionMenu>,
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    const menu = screen.getByRole('menu');
    const separators = menu.querySelectorAll('[role="separator"]');
    expect(separators).toHaveLength(1);
    const deleteItem = screen.getByRole('menuitem', { name: 'Eliminar' });
    expect(separators[0].compareDocumentPosition(deleteItem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const editItem = screen.getByRole('menuitem', { name: 'Editar' });
    expect(editItem.previousElementSibling).toBeNull();
  });
});
