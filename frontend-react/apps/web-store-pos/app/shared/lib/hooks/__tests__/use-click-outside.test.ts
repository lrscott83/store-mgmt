import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { useClickOutside } from '../use-click-outside';

// ── HOOK-1: outside click triggers callback ─────────────────────────────────

describe('useClickOutside — HOOK-1: calls onClose on outside mousedown', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('calls onClose when mousedown happens outside the ref element', () => {
    const container = document.createElement('div');
    const inside = document.createElement('div');
    const outside = document.createElement('div');
    document.body.appendChild(container);
    document.body.appendChild(inside);
    document.body.appendChild(outside);

    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    const onClose = vi.fn();
    renderHook(() => useClickOutside(ref, onClose));

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when mousedown happens inside the ref element', () => {
    const container = document.createElement('div');
    const inside = document.createElement('div');
    container.appendChild(inside);
    document.body.appendChild(container);

    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    const onClose = vi.fn();
    renderHook(() => useClickOutside(ref, onClose));

    inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('useClickOutside — HOOK-2: listener cleanup', () => {
  it('removes the mousedown listener on unmount', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useClickOutside(ref, onClose));

    unmount();

    const removedEvents = removeEventListenerSpy.mock.calls.map((c) => c[0]);
    expect(removedEvents).toContain('mousedown');
  });
});
