import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockProceed = vi.fn();
const mockReset = vi.fn();
const mockUseBlocker = vi.fn();

vi.mock('react-router', () => ({
  useBlocker: (fn: unknown) => mockUseBlocker(fn),
}));

import { useUnsavedChangesPrompt } from '../use-unsaved-changes-prompt';

describe('useUnsavedChangesPrompt — view-text-parity: window.confirm() message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls window.confirm with the exact GENERAL.WIZARD_DIRTY_MESSAGE text when blocked', () => {
    mockUseBlocker.mockReturnValue({ state: 'blocked', proceed: mockProceed, reset: mockReset });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderHook(() => useUnsavedChangesPrompt(true));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Usted tiene cambios pendientes. ¿Desea salvar los cambios antes de pasar a la otra página?'
    );
    expect(mockProceed).toHaveBeenCalled();
  });

  it('does not call window.confirm when the blocker is unblocked', () => {
    mockUseBlocker.mockReturnValue({ state: 'unblocked' });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderHook(() => useUnsavedChangesPrompt(false));

    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
