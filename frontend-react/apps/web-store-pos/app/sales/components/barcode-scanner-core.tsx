import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
// IMPORTANT: This is the ONLY file in the project that imports @zxing/browser.
// BarcodeScannerModal and QuickSaleScanner use React.lazy to load this file,
// keeping @zxing/browser out of the main bundle (Constraint C-9).

interface IScannerControls {
  stop: () => void;
}

interface BarcodeScannerCoreProps {
  onDecode: (value: string) => void;
  onPermissionDenied: () => void;
}

export function BarcodeScannerCore({ onDecode, onPermissionDenied }: BarcodeScannerCoreProps) {
  const intl = useIntl();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function startScanner() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();

        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const deviceId = devices[0]?.deviceId;

        if (!videoRef.current || !active) return;

        const controls = await reader.decodeFromVideoDevice(
          deviceId ?? undefined,
          videoRef.current,
          (result, err) => {
            if (!active) return;
            if (result) {
              onDecode(result.getText());
            }
            // err is Exception | undefined from @zxing/library — NotFoundException on empty frames is normal
            if (err && (err as { name?: string }).name !== 'NotFoundException') {
              console.warn('[Scanner] decode error:', err);
            }
          },
        );

        if (active) {
          controlsRef.current = controls;
        } else {
          controls.stop();
        }
      } catch (err: unknown) {
        if (!active) return;
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.includes('Permission denied') ||
          message.includes('NotAllowedError') ||
          message.includes('NotFoundError')
        ) {
          onPermissionDenied();
          setError(intl.formatMessage({ id: 'SCANNER.CAMERA_PERMISSION_DENIED' }));
        } else {
          setError(message);
        }
      }
    }

    startScanner();

    return () => {
      active = false;
      try {
        controlsRef.current?.stop();
        controlsRef.current = null;
      } catch {
        // ignore cleanup errors
      }
    };
  }, [intl, onDecode, onPermissionDenied]);

  if (error) {
    return (
      <div className="p-4 text-center text-red-600" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm text-gray-500">
        {intl.formatMessage({ id: 'SCANNER.SCANNING' })}
      </p>
      <video
        ref={videoRef}
        className="w-full max-w-sm rounded border"
        autoPlay
        muted
        playsInline
      />
    </div>
  );
}
