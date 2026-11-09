import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import {
  getClientLogs,
  clearClientLogs,
  exportClientLogs,
  type ClientLogEntry,
  type LogLevel,
} from '~/shared/lib/diagnostics/client-log';
import {
  buildPwaInstallExport,
  collectPwaInstallSnapshot,
  getLastObservedInstallState,
  type InstallAvailability,
  type PwaInstallSnapshot,
} from '~/shared/lib/pwa/pwa-install-diagnostics';
import { confirmDialog, showBlockingSuccess } from '~/shared/lib/blocking-alert';
import { GlobalConfig } from '~/shared/lib/config/global-config';

// PUBLIC route (no clientLoader): a device that cannot sign in must still be
// able to open /diagnostics and send its log. routes.ts mounts it under
// public-app-layout, which has no authLoader.
const WHATSAPP_NUMBER = '5352432968';
const WHATSAPP_CHAT_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

const LEVEL_CLASS: Record<LogLevel, string> = {
  error: 'text-red-600 dark:text-red-400',
  warn: 'text-amber-600 dark:text-amber-400',
  info: 'text-cyan-600 dark:text-cyan-400',
};

/** Human label for every resolved install state (i18n ids). */
const AVAILABILITY_LABEL_ID: Record<InstallAvailability, string> = {
  ready: 'DIAGNOSTICS.PWA_AVAILABILITY_READY',
  'awaiting-prompt': 'DIAGNOSTICS.PWA_AVAILABILITY_AWAITING_PROMPT',
  'no-service-worker': 'DIAGNOSTICS.PWA_AVAILABILITY_NO_SERVICE_WORKER',
  standalone: 'DIAGNOSTICS.PWA_AVAILABILITY_STANDALONE',
  'installed-flag': 'DIAGNOSTICS.PWA_AVAILABILITY_INSTALLED_FLAG',
  'installed-related-app': 'DIAGNOSTICS.PWA_AVAILABILITY_INSTALLED_RELATED_APP',
};

/**
 * One-line service-worker summary for the device card: the worker states found
 * for every registration, or `null` when there is nothing registered.
 */
function summarizeServiceWorker(
  serviceWorker: PwaInstallSnapshot['serviceWorker'],
): string | null {
  const states = serviceWorker.registrations.flatMap((registration) => [
    ...(registration.active ? [`active: ${registration.active}`] : []),
    ...(registration.waiting ? [`waiting: ${registration.waiting}`] : []),
    ...(registration.installing ? [`installing: ${registration.installing}`] : []),
  ]);
  return states.length > 0 ? states.join(' · ') : null;
}

function formatLocalDateTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function buildExportFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `client-log-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

export function DiagnosticsPage() {
  const intl = useIntl();
  const selectedStoreId = useAuthStore((s) => s.user?.selectedStoreId);
  const [entries, setEntries] = useState<ClientLogEntry[]>(() => getClientLogs());
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [search, setSearch] = useState('');
  const [snapshot, setSnapshot] = useState<PwaInstallSnapshot | null>(null);
  // The moment the pill was visibly disabled survives only in module memory.
  const lastObserved = snapshot ? getLastObservedInstallState() : null;

  // Best-effort forensic probe: the page must render even when it fails.
  useEffect(() => {
    let cancelled = false;
    let commitId: ReturnType<typeof setTimeout> | undefined;
    void collectPwaInstallSnapshot()
      .then((next) => {
        if (cancelled) return;
        // The probe resolves on a microtask. Committing on the next macrotask
        // keeps the update cancellable: a page that is already gone never
        // schedules a state update it will not render.
        commitId = setTimeout(() => {
          if (!cancelled) setSnapshot(next);
        }, 0);
      })
      .catch(() => {
        // Best-effort: the page renders without the probe.
      });
    return () => {
      cancelled = true;
      if (commitId !== undefined) clearTimeout(commitId);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries
      .filter((entry) => (levelFilter === 'all' ? true : entry.level === levelFilter))
      .filter((entry) =>
        needle.length === 0
          ? true
          : `${entry.message} ${entry.location ?? ''} ${entry.route ?? ''}`.toLowerCase().includes(needle),
      )
      .slice()
      .reverse(); // newest first for reading
  }, [entries, levelFilter, search]);

  function refresh(): void {
    setEntries((prev) => {
      const next = getClientLogs();
      // Keep referential equality when nothing changed so a 1s poll never
      // forces a re-render of the list on idle screens.
      const prevLast = prev[prev.length - 1];
      const nextLast = next[next.length - 1];
      if (prev.length === next.length && prevLast?.ts === nextLast?.ts) return prev;
      return next;
    });
  }

  useEffect(() => {
    refresh();
    // Poll the localStorage buffer: `installClientLog` writes console.error /
    // window error / online-offline entries there, but nothing notifies this
    // page when a NEW entry lands (localStorage `storage` events never fire in
    // the same tab). Without this, /diagnostics only shows the snapshot taken
    // at mount and a failure reported while the page is open stays invisible.
    const pollId = window.setInterval(refresh, 1000);
    // Same-tab immediacy: refresh right away on actual window errors/rejections
    // instead of waiting up to the poll tick.
    window.addEventListener('error', refresh);
    window.addEventListener('unhandledrejection', refresh);
    return () => {
      window.clearInterval(pollId);
      window.removeEventListener('error', refresh);
      window.removeEventListener('unhandledrejection', refresh);
    };
  }, []);

  /**
   * The single export path every handler shares: same client log, plus the PWA
   * install diagnostics when the probe already answered.
   */
  function exportJson(): string {
    return exportClientLogs(
      selectedStoreId ?? undefined,
      snapshot ? buildPwaInstallExport(snapshot) : undefined,
    );
  }

  async function handleShare(): Promise<void> {
    const json = exportJson();
    const fileName = buildExportFileName();
    const file = new File([json], fileName, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (typeof navigator.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
      try {
        await navigator.share({ files: [file], title: fileName });
        return;
      } catch {
        // user cancelled or share failed — fall through to the download below
      }
    }
    downloadJson(json, fileName);
  }

  function handleDownload(): void {
    downloadJson(exportJson(), buildExportFileName());
  }

  /**
   * WhatsApp cannot attach a file through a URL, so the full artifact leaves as
   * the downloaded JSON (never truncated into the URL) and the chat with the
   * owner's number opens in a new tab for the user to attach it.
   */
  function handleSendWhatsApp(): void {
    downloadJson(exportJson(), buildExportFileName());
    window.open(WHATSAPP_CHAT_URL, '_blank', 'noopener');
  }

  function downloadJson(json: string, fileName: string): void {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(exportJson());
    void showBlockingSuccess(intl.formatMessage({ id: 'DIAGNOSTICS.COPIED' }));
  }

  async function handleClear(): Promise<void> {
    const confirmed = await confirmDialog({
      title: intl.formatMessage({ id: 'DIAGNOSTICS.CLEAR_CONFIRM_TITLE' }),
      message: intl.formatMessage({ id: 'DIAGNOSTICS.CLEAR_CONFIRM_MESSAGE' }),
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;
    clearClientLogs();
    refresh();
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-semibold">{intl.formatMessage({ id: 'DIAGNOSTICS.TITLE' })}</h1>

      {/* Device info card — the metadata any bug report needs first. */}
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-gray-700">
          {intl.formatMessage({ id: 'DIAGNOSTICS.DEVICE_INFO' })}
        </h2>
        <dl className="grid grid-cols-1 gap-1 text-sm text-gray-600 sm:grid-cols-2">
          <div>
            <dt className="inline font-medium">{intl.formatMessage({ id: 'DIAGNOSTICS.APP_VERSION' })}: </dt>
            <dd className="inline">{GlobalConfig.APP_VERSION}</dd>
          </div>
          <div>
            <dt className="inline font-medium">{intl.formatMessage({ id: 'DIAGNOSTICS.ONLINE' })}: </dt>
            <dd className="inline">{navigator.onLine ? 'online' : 'offline'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="inline font-medium">{intl.formatMessage({ id: 'DIAGNOSTICS.USER_AGENT' })}: </dt>
            <dd className="inline break-all">{navigator.userAgent}</dd>
          </div>
          {snapshot && (
            <>
              <div>
                <dt className="inline font-medium">{intl.formatMessage({ id: 'DIAGNOSTICS.PWA_STATE' })}: </dt>
                <dd className="inline">
                  {intl.formatMessage({ id: AVAILABILITY_LABEL_ID[snapshot.availability] })}
                </dd>
              </div>
              {lastObserved && (
                <div>
                  <dt className="inline font-medium">
                    {intl.formatMessage({ id: 'DIAGNOSTICS.PWA_LAST_OBSERVED' })}:{' '}
                  </dt>
                  <dd className="inline">
                    {intl.formatMessage({ id: AVAILABILITY_LABEL_ID[lastObserved.availability] })} ·{' '}
                    {new Date(lastObserved.observedAt).toLocaleString()}
                    {lastObserved.resolvedAt &&
                      ` · ${intl.formatMessage({ id: 'DIAGNOSTICS.PWA_RESOLVED_AT' })} ${new Date(
                        lastObserved.resolvedAt,
                      ).toLocaleString()}`}
                  </dd>
                </div>
              )}
              <div>
                <dt className="inline font-medium">
                  {intl.formatMessage({ id: 'DIAGNOSTICS.PWA_SERVICE_WORKER' })}:{' '}
                </dt>
                <dd className="inline">
                  {summarizeServiceWorker(snapshot.serviceWorker) ??
                    intl.formatMessage({ id: 'DIAGNOSTICS.PWA_SW_NONE' })}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium">{intl.formatMessage({ id: 'DIAGNOSTICS.PWA_DISPLAY_MODE' })}: </dt>
                <dd className="inline">
                  {intl.formatMessage({
                    id:
                      snapshot.signals.displayModeStandalone || snapshot.signals.iosStandalone
                        ? 'DIAGNOSTICS.PWA_DISPLAY_STANDALONE'
                        : 'DIAGNOSTICS.PWA_DISPLAY_BROWSER',
                  })}
                </dd>
              </div>
            </>
          )}
        </dl>
      </section>

      {/* Actions — Compartir on devices with navigator.share (installed PWA
          opens the OS share sheet: WhatsApp/mail); Descargar on desktop. */}
      <div className="flex flex-wrap gap-2">
        {typeof navigator.share === 'function' ? (
          <button type="button" onClick={() => void handleShare()} data-testid="diagnostics-share">
            {intl.formatMessage({ id: 'DIAGNOSTICS.SHARE' })}
          </button>
        ) : (
          <button type="button" onClick={handleDownload} data-testid="diagnostics-download">
            {intl.formatMessage({ id: 'DIAGNOSTICS.DOWNLOAD' })}
          </button>
        )}
        <button
          type="button"
          onClick={handleSendWhatsApp}
          data-testid="diagnostics-whatsapp"
        >
          {intl.formatMessage({ id: 'DIAGNOSTICS.SEND_WHATSAPP' })}
        </button>
        <button type="button" onClick={() => void handleCopy()}>
          {intl.formatMessage({ id: 'DIAGNOSTICS.COPY' })}
        </button>
        <button type="button" onClick={() => void handleClear()}>
          {intl.formatMessage({ id: 'DIAGNOSTICS.CLEAR' })}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">
          <span className="mr-1 font-medium">{intl.formatMessage({ id: 'DIAGNOSTICS.FILTER_LEVEL' })}</span>
          <select
            aria-label={intl.formatMessage({ id: 'DIAGNOSTICS.FILTER_LEVEL' })}
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as LogLevel | 'all')}
          >
            <option value="all">{intl.formatMessage({ id: 'DIAGNOSTICS.LEVEL_ALL' })}</option>
            <option value="error">error</option>
            <option value="warn">warn</option>
            <option value="info">info</option>
          </select>
        </label>
        <input
          type="search"
          aria-label={intl.formatMessage({ id: 'DIAGNOSTICS.SEARCH' })}
          placeholder={intl.formatMessage({ id: 'DIAGNOSTICS.SEARCH' })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-40 flex-1 rounded border px-2 py-1 text-sm"
        />
      </div>

      {/* Log list */}
      <section className="rounded border bg-white p-2 shadow-sm">
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">
            {intl.formatMessage({ id: 'DIAGNOSTICS.EMPTY' })}
          </p>
        )}
        <ul className="divide-y">
          {filtered.map((entry, index) => (
            <li key={`${entry.ts}-${index}`} className="px-2 py-2 text-sm">
              <div className="flex items-baseline gap-2">
                <span className={`font-semibold uppercase ${LEVEL_CLASS[entry.level]}`}>{entry.level}</span>
                <span className="text-xs text-gray-500">{formatLocalDateTime(entry.ts)}</span>
                {entry.count !== undefined && entry.count > 1 && (
                  <span className="rounded bg-gray-200 px-1 text-xs text-gray-700">×{entry.count}</span>
                )}
              </div>
              <p className="break-all whitespace-pre-wrap">{entry.message}</p>
              {entry.route && <p className="text-xs text-gray-500">{entry.route}</p>}
              {entry.location && (
                <pre className="mt-1 overflow-x-auto text-xs text-gray-500">{entry.location}</pre>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default DiagnosticsPage;
