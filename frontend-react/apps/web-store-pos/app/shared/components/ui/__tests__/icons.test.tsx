import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChevronDownIcon } from '../icons';

// NOTE: SVG elements' `.className` DOM property is an SVGAnimatedString, not a plain
// string — reading `.className` directly does not behave like it does on HTMLElement.
// Use `getAttribute('class')` for SVG class assertions instead.
function svgClass(container: HTMLElement): string {
  return container.querySelector('svg')?.getAttribute('class') ?? '';
}

describe('ChevronDownIcon', () => {
  it('renders the reference chevron path (Angular mat-expansion-panel toggle indicator)', () => {
    const { container } = render(<ChevronDownIcon />);
    const path = container.querySelector('path');
    expect(path).toHaveAttribute('d', 'M19.5 8.25l-7.5 7.5-7.5-7.5');
  });

  it('always applies transition-transform, regardless of expanded state', () => {
    const { container: collapsed } = render(<ChevronDownIcon isExpanded={false} />);
    const { container: expanded } = render(<ChevronDownIcon isExpanded={true} />);
    expect(svgClass(collapsed)).toContain('transition-transform');
    expect(svgClass(expanded)).toContain('transition-transform');
  });

  it('applies rotate-180 when isExpanded=true', () => {
    const { container } = render(<ChevronDownIcon isExpanded={true} />);
    expect(svgClass(container)).toContain('rotate-180');
  });

  it('does NOT apply rotate-180 when isExpanded=false (or omitted)', () => {
    const { container: collapsedDefault } = render(<ChevronDownIcon />);
    const { container: collapsedExplicit } = render(<ChevronDownIcon isExpanded={false} />);
    expect(svgClass(collapsedDefault)).not.toContain('rotate-180');
    expect(svgClass(collapsedExplicit)).not.toContain('rotate-180');
  });

  it('forwards a custom className alongside the base classes', () => {
    const { container } = render(<ChevronDownIcon className="text-text-muted" />);
    expect(svgClass(container)).toContain('text-text-muted');
    expect(svgClass(container)).toContain('h-5 w-5');
  });

  it('is aria-hidden (toggle semantics belong to the wrapping button)', () => {
    const { container } = render(<ChevronDownIcon />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
