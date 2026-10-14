import { lazy, Suspense } from 'react';

// Dynamic import: qrcode.react is only pulled into the bundle when a hotspot
// modal actually shows a code, never in the initial route chunk (AGENTS.md
// heavy-dependency rule).
const QRCodeSVG = lazy(() =>
  import('qrcode.react').then((module) => ({ default: module.QRCodeSVG })),
);

export interface QrCodeProps {
  readonly value: string;
  readonly size?: number;
  readonly label?: string;
}

/** Renders a signaling payload (SDP or pairing code) as a scannable QR code. */
export function QrCode({ value, size = 240, label }: QrCodeProps) {
  return (
    <div data-testid="qr-code" className="flex justify-center">
      <Suspense fallback={<div style={{ width: size, height: size }} aria-hidden="true" />}>
        <QRCodeSVG
          value={value}
          size={size}
          level="M"
          marginSize={2}
          aria-label={label}
          data-testid="qr-code-svg"
        />
      </Suspense>
    </div>
  );
}

export default QrCode;
