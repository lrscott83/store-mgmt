import { useIntl } from 'react-intl';

interface UnsavedChangesDialogProps {
  onSave: () => Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
}

export default function UnsavedChangesDialog({
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  const intl = useIntl();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h3 className="text-base font-semibold text-gray-800 mb-2">
          {intl.formatMessage({ id: 'GENERAL.CONFIRM_TITLE' })}
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          {intl.formatMessage({ id: 'GENERAL.WIZARD_DIRTY_MESSAGE' })}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onSave}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
          >
            {intl.formatMessage({ id: 'GENERAL.YES' })}
          </button>
          <button
            onClick={onDiscard}
            className="w-full bg-red-50 hover:bg-red-100 text-red-700 font-medium py-2 px-4 rounded-lg text-sm transition-colors"
          >
            {intl.formatMessage({ id: 'GENERAL.NO' })}
          </button>
          <button
            onClick={onCancel}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg text-sm transition-colors"
          >
            {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
          </button>
        </div>
      </div>
    </div>
  );
}
