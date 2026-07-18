interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible text label and accessible name for the switch. */
  label: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Toggle switch matching Angular's `mat-slide-toggle`: a pill track with a
 * sliding knob and a text label. Exposed as role="switch" for accessibility.
 */
export function Switch({ checked, onChange, label, disabled = false, className = '' }: SwitchProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-primary' : 'bg-border'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <span className="text-xs font-medium text-text">{label}</span>
    </span>
  );
}

export default Switch;
