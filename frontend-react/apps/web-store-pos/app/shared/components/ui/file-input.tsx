import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { PaperclipIcon } from './icons';

interface FileInputProps {
  /** Called with the chosen file, or null when the dialog is dismissed with no selection. */
  onFileChange: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
  /** Forwarded to the native input so an external `<label htmlFor>` can associate with it. */
  id?: string;
  'data-testid'?: string;
}

/**
 * File picker that HIDES the browser's native `<input type="file">` — whose
 * "Choose File / No file chosen" text renders in the browser's OWN language and
 * cannot be localized — and replaces it with a Spanish trigger button plus the
 * selected file name. Mirrors Angular's importer / receive-data control (hidden
 * native input + `attach_file` icon button + readonly filename field).
 */
export function FileInput({
  onFileChange,
  accept,
  disabled = false,
  id,
  'data-testid': dataTestId,
}: FileInputProps) {
  const intl = useIntl();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setFileName(file?.name ?? null);
    onFileChange(file);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PaperclipIcon />
        {intl.formatMessage({ id: 'GENERAL.SELECT_FILE' })}
      </button>
      <span className="min-w-0 flex-1 truncate text-sm text-text-muted">
        {fileName ?? intl.formatMessage({ id: 'GENERAL.NO_FILE_SELECTED' })}
      </span>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={handleChange}
        className="hidden"
        data-testid={dataTestId}
      />
    </div>
  );
}

export default FileInput;
