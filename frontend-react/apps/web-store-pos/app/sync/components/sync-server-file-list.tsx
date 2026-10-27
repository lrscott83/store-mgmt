import { useIntl } from 'react-intl';
import type { StoreSyncFileDto } from '~/sync/lib/services/store-sync-file-http-service';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { DownloadIcon, TrashIcon } from '~/shared/components/ui/icons';

export interface SyncServerFileListProps {
  files: StoreSyncFileDto[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onDownload: (file: StoreSyncFileDto) => void;
  onDelete: (file: StoreSyncFileDto) => void;
}

/** Local date/time, matching the rest of the POS (no raw ISO strings in the UI). */
export function formatStoreSyncFileDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

/**
 * The repository table, newest first. Every row stays actionable: the
 * "downloaded" badge is informative and never blocks a re-download (S4).
 */
export function SyncServerFileList({
  files,
  loading,
  error,
  onRefresh,
  onDownload,
  onDelete,
}: SyncServerFileListProps) {
  const intl = useIntl();

  return (
    <Card
      padding="tight"
      title={intl.formatMessage({ id: 'SYNC_SERVER.LIST_TITLE' })}
      headerAction={
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          data-testid="sync-files-refresh"
        >
          {intl.formatMessage({ id: 'SYNC_SERVER.REFRESH' })}
        </Button>
      }
    >
      <div className="p-2">
        {error && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {error}
          </p>
        )}

        {loading && files.length === 0 ? (
          <p className="text-sm text-text-muted">{intl.formatMessage({ id: 'GENERAL.LOADING' })}</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="sync-files-empty">
            {intl.formatMessage({ id: 'SYNC_SERVER.EMPTY' })}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-muted">
                  <th className="px-2 py-1.5">
                    {intl.formatMessage({ id: 'SYNC_SERVER.COLUMN_STORE' })}
                  </th>
                  <th className="px-2 py-1.5">
                    {intl.formatMessage({ id: 'SYNC_SERVER.COLUMN_DATE' })}
                  </th>
                  <th className="px-2 py-1.5">
                    {intl.formatMessage({ id: 'SYNC_SERVER.COLUMN_UPLOADED_BY' })}
                  </th>
                  <th className="px-2 py-1.5 text-right">
                    {intl.formatMessage({ id: 'SYNC_SERVER.COLUMN_DOWNLOADS' })}
                  </th>
                  <th className="px-2 py-1.5">
                    {intl.formatMessage({ id: 'SYNC_SERVER.COLUMN_ACTIONS' })}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {files.map((file) => {
                  const downloadedAt = formatStoreSyncFileDate(file.downloadedByMeAt);
                  return (
                    <tr key={file.id} data-testid={`sync-file-row-${file.id}`}>
                      <td className="px-2 py-2 font-medium text-text">{file.storeName}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-text">
                        <time dateTime={file.createdAt}>
                          {formatStoreSyncFileDate(file.createdAt)}
                        </time>
                        {file.downloadedByMe && (
                          <span
                            data-testid={`sync-file-downloaded-${file.id}`}
                            className="mt-1 block w-fit rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary"
                          >
                            {intl.formatMessage({ id: 'SYNC_SERVER.DOWNLOADED_AT' })}
                            {downloadedAt ? ` ${downloadedAt}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-text">{file.uploadedByFullName}</td>
                      <td
                        className="px-2 py-2 text-right text-text"
                        data-testid={`sync-file-downloads-${file.id}`}
                      >
                        {file.downloadCount}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onDownload(file)}
                            aria-label={intl.formatMessage({ id: 'SYNC_SERVER.DOWNLOAD' })}
                            title={intl.formatMessage({ id: 'SYNC_SERVER.DOWNLOAD' })}
                            data-testid={`sync-file-download-${file.id}`}
                            className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-primary"
                          >
                            <DownloadIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(file)}
                            aria-label={intl.formatMessage({ id: 'SYNC_SERVER.DELETE' })}
                            title={intl.formatMessage({ id: 'SYNC_SERVER.DELETE' })}
                            data-testid={`sync-file-delete-${file.id}`}
                            className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-danger"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

export default SyncServerFileList;
